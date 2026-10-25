"use strict";
/* ============ constants ============ */
const DIRS = ["政府机关/事业单位", "高校教职、辅导员、博士后", "国企央企"];
const STATUSES = ["待投递", "已投递", "测评", "笔试", "一面", "二面", "三面", "终面", "HR面", "Offer", "已拒绝", "已放弃"];
const EVENT_STAGES = new Set(["测评", "笔试", "一面", "二面", "三面", "终面", "HR面"]);
const DONE = new Set(["Offer", "已拒绝", "已放弃"]);
const EXP_TYPES = { intern: "实习", work: "工作", research: "科研", project: "项目", leadership: "学生工作/社团", publication: "论文/成果", award: "获奖", other: "其他" };
const HOST = "host:claude_browser";
const LIBS = {
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfw: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
};
const VIEWS = [
  ["dash", "总览"], ["apps", "投递"], ["companies", "公司库"], ["resumes", "简历与经历"], ["profile", "报名信息"], ["calendar", "日程"],
];
const COLLS = ["resumes", "experiences", "companies", "applications", "tailored", "analyses", "queue"];

/* ============ state ============ */
const S = {
  db: null, sample: null, mcp: null, dl: null, user: null, hostOK: false, ready: false, fatal: "",
  d: { profile: null, meta: null, resumes: [], experiences: [], companies: [], applications: [], tailored: [], analyses: [], queue: [] },
  view: "dash", appId: null, appTab: "match",
  cf: { q: "", dir: "", open: true, star: false, sort: "dl", src: "", wait: false, eligibility: "", priority: false }, af: { q: "", status: "" },
  busy: {}, logs: {}, profileDirty: false, tailorSel: {},
};
try { const v = localStorage.getItem("jd_view"); if (v && VIEWS.some(x => x[0] === v)) S.view = v; } catch (e) {}

/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeURL = s => esc(/^https?:\/\//i.test(String(s || "")) ? s : "#");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
function ymd(d) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
function hm(d) { const p = n => String(n).padStart(2, "0"); return p(d.getHours()) + ":" + p(d.getMinutes()); }
function hashId(str) { let h1 = 0x811c9dc5, h2 = 0; for (const ch of String(str)) { const c = ch.codePointAt(0); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = (h2 * 31 + c) >>> 0; } return "c" + h1.toString(36) + h2.toString(36); }
function daysLeft(dstr) { if (!dstr || !/^\d{4}-\d{2}-\d{2}$/.test(dstr.slice(0, 10))) return null; const t = Date.parse(dstr.slice(0, 10) + "T00:00:00+08:00"); return Number.isFinite(t) ? Math.round((t - Date.parse(today() + "T00:00:00+08:00")) / 864e5) : null; }
function deadlineInstant(row) { if (!row?.deadline || daysLeft(row.deadline) === null) return Infinity; const t = Date.parse(row.deadline.slice(0, 10) + "T" + (row.deadlineTime || "23:59:59") + "+08:00"); return Number.isFinite(t) ? t : Infinity; }
function companyDeadline(company) {
  if (!company.vacancies?.length) return company;
  const active = company.vacancies.filter(v => deadlineInstant(v) >= Date.now());
  const qualified = active.filter(v => v.eligibility === "qualified");
  const pool = qualified.length ? qualified : active.length ? active : company.vacancies;
  return pool.slice().sort((a, b) => deadlineInstant(a) < deadlineInstant(b) ? -1 : deadlineInstant(a) > deadlineInstant(b) ? 1 : 0)[0] || company;
}
function deadlineCompare(a, b) {
  const ar = a.eligibility === "review", br = b.eligibility === "review";
  if (ar !== br) return ar ? 1 : -1;
  const ad = deadlineInstant(companyDeadline(a)), bd = deadlineInstant(companyDeadline(b));
  if (ad !== bd) return ad < bd ? -1 : 1;
  const ap = !!priorityGroupOf(a), bp = !!priorityGroupOf(b);
  if (ap !== bp) return ap ? -1 : 1;
  return ((fitOf(b) || {}).score ?? b.score ?? -1) - ((fitOf(a) || {}).score ?? a.score ?? -1) || (String(b.cities || b.city || "").includes("北京") ? 1 : 0) - (String(a.cities || a.city || "").includes("北京") ? 1 : 0);
}
const isAutoCompany = c => ["Claude", "Codex", "每日招聘"].includes(c.source);
function urgencyPill(row) { const deadline = companyDeadline(row); if (deadlineInstant(deadline) < Date.now()) return `<span class="pill bad">已截止</span>`; const n = daysLeft(deadline.deadline); return n !== null && n >= 0 && n <= 3 ? `<span class="pill bad">${n === 0 ? "今天截止" : n + " 天内截止"} · 紧急</span>` : ""; }
function scoreCls(s) { return s >= 75 ? "hi" : s >= 55 ? "mid" : "lo"; }
function statusPill(s) {
  const cls = s === "Offer" ? "ok" : (s === "已拒绝" || s === "已放弃") ? "bad" : EVENT_STAGES.has(s) ? "warn" : s === "已投递" ? "acc" : "";
  return `<span class="pill ${cls}">${esc(s || "待投递")}</span>`;
}
function dlPill(d) {
  const n = daysLeft(d);
  if (n === null) return d ? `<span class="pill">${esc(d)}</span>` : `<span class="note">—</span>`;
  if (n < 0) return `<span class="pill bad">已截止</span>`;
  if (n <= 3) return `<span class="pill bad mono">${n} 天</span>`;
  if (n <= 10) return `<span class="pill warn mono">${n} 天</span>`;
  return `<span class="pill mono">${esc(d.slice(5, 10))}</span>`;
}
function mmdd(s) {
  if (!s) return "—";
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(5, 10).replace("-", "/") : String(s).slice(0, 12);
}
function periodCell(c) {
  const open = c.openDate, end = c.deadline;
  const toOpen = daysLeft(open);
  let status;
  if (c.status === "notStarted" && !end) return `<span class="pill">招聘未开始</span><div class="t2">每日关注中</div>`;
  if (c.status === "watch" && !end) return `<span class="pill warn">待确认是否开放</span><div class="t2">每日关注中</div>`;
  if (c.status === "open" && !end && !open) return `<span class="pill ok">已在招</span><div class="t2">截止待确认</div>`;
  if (toOpen !== null && toOpen > 0) status = `<span class="pill acc mono">${toOpen} 天后开放</span>`;
  else {
    const n = daysLeft(end);
    status = n === null ? (end ? "" : `<span class="note">截止未知</span>`) : n < 0 ? `<span class="pill bad">已截止</span>` : n <= 3 ? `<span class="pill bad mono">剩 ${n} 天</span>` : n <= 10 ? `<span class="pill warn mono">剩 ${n} 天</span>` : `<span class="pill ok">报名中</span>`;
  }
  return `<div class="mono" style="white-space:nowrap" title="${esc((open || "未知") + " 至 " + (end || "未知"))}">${esc(mmdd(open))} → ${esc(mmdd(end))}</div>${status ? `<div style="margin-top:2px">${status}</div>` : ""}`;
}
function md(text) {
  if (!text) return "";
  const lines = String(text).split(/\n/);
  let out = "", inList = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  for (let raw of lines) {
    const l = raw.trim();
    if (/^[-•·*]\s+/.test(l) || /^\d+[.、)]\s*/.test(l)) {
      if (!inList) { out += "<ul>"; inList = true; }
      out += "<li>" + inline(l.replace(/^([-•·*]|\d+[.、)])\s*/, "")) + "</li>";
    } else {
      if (inList) { out += "</ul>"; inList = false; }
      if (l) out += "<p>" + inline(l) + "</p>";
    }
  }
  if (inList) out += "</ul>";
  return `<div class="md">${out}</div>`;
}
let toastT;
function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, bad ? 6000 : 3200); }
function loadScript(src) {
  loadScript.pending ||= new Map();
  if (loadScript.pending.has(src)) return loadScript.pending.get(src);
  const task = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { s.remove(); loadScript.pending.delete(src); rej(new Error("加载组件失败：" + src.split("/").pop() + "，请确认已运行 prepare_assets.py 后重试。")); };
    document.head.appendChild(s);
  });
  loadScript.pending.set(src, task); return task;
}
function errText(e) {
  const c = e && e.code;
  const map = {
    not_granted: "这个网页还没获准调用 Claude，可在页面右上角的权限菜单里允许。",
    rate_limited: "请求有点多，等一分钟再试。",
    invalid_json: "AI 返回的格式不完整，请再点一次。",
    tools_unavailable: "当前环境不支持联网检索工具，请改用「交给 Claude 处理」。",
    server_not_connected: "需要在 Claude 桌面 App 里打开本页才能使用内置浏览器。",
    cancelled: "已取消。",
    not_in_manifest: "你拒绝了这个网页使用内置浏览器，可在权限菜单里重新允许。",
    tool_error: "浏览器操作失败：" + (e && e.message || ""),
    quota_exceeded: "数据空间已满，删除一些旧记录后再试。",
    unavailable: "暂时不可用，请稍后再试。",
  };
  return map[c] || (e && e.message) || "出错了，请重试。";
}
function setBusy(key, v) { if (v) S.busy[key] = v; else delete S.busy[key]; render(); }
function log(key, line) { (S.logs[key] = S.logs[key] || []).push(line); const el = document.getElementById("log-" + key); if (el) { el.textContent = S.logs[key].join("\n"); el.scrollTop = el.scrollHeight; } }

/* ============ data layer ============ */
const db = {
  coll: n => S.db.collection(n),
  async set(path, data) { await S.db.doc(path).set(data); },
  async update(path, data) { await S.db.doc(path).update(data); },
  async del(path) { await S.db.doc(path).delete(); },
};
function extrasText(app) { const xs = (app && app.extras) || []; return xs.length ? xs.map((x, i) => `（${i + 1}）${x.text}`).join("\n") : ""; }
function extrasBlock(app, max = 6000) { const t = extrasText(app); return t ? `\n用户补充的关键信息（来自她自己整理的内部消息、面经、宣讲会或 HR 沟通，可信度高；与 JD 冲突时以此为准，并在分析里体现）：\n${t.slice(0, max)}\n` : ""; }
const fitOf = c => c.fit || (S.d.fitMap || {})[c.id] || null;
const byId = (coll, id) => S.d[coll].find(x => x.id === id);
const appById = id => byId("applications", id);
async function saveApp(app, patch) {
  const next = { ...app, ...patch, updatedAt: new Date().toISOString() };
  delete next.id;
  await db.set("applications/" + app.id, next);
  return { id: app.id, ...next };
}
function subscribe() {
  for (const n of COLLS) {
    db.coll(n).onSnapshot(snap => { S.d[n] = snap.docs.map(d => ({ id: d.id, ...d.data() })); schedRender(); },
      e => { if (e.code === "revoked") { S.fatal = "访问权限已变化，请刷新页面。"; render(); } });
  }
  S.db.doc("profile/main").onSnapshot(s => { S.d.profile = s.exists ? s.data() : null; schedRender("profile"); }, () => {});
  S.db.doc("meta/fit").onSnapshot(s => { S.d.fitMap = s.exists ? (s.data().scores || {}) : {}; schedRender(); }, () => {});
  S.db.doc("meta/status").onSnapshot(s => { S.d.meta = s.exists ? s.data() : null; schedRender(); }, () => {});
}

/* ============ AI ============ */
async function ai(prompt, opts = {}) {
  if (!S.sample) throw { message: "AI 尚未连接，请在「数据与 AI 设置」中测试连接。" };
  const o = { modelTier: opts.tier || "default" };
  if (opts.tools) o.tools = opts.tools; else o.cache = false;
  if (opts.signal) o.signal = opts.signal;
  if (opts.onText) o.onText = opts.onText;
  if (opts.images) o.images = opts.images;
  return S.sample.json(prompt, o);
}
function profileBrief(withContact) {
  const p = S.d.profile || {};
  const b = p.basic || {};
  const base = { 姓名: b.name, 学历: (p.education || []).map(e => [e.school, e.college, e.major, e.degree, (e.start || "") + "~" + (e.end || ""), e.gpa && ("GPA " + e.gpa), e.rank].filter(Boolean).join(" ")), 语言: p.languages, 技能: p.skills, 获奖: p.awards, 目标方向: (p.targets && p.targets.length ? p.targets : DIRS).join("、") };
  if (withContact) Object.assign(base, { 联系: b });
  return base;
}
function expBrief(ids) {
  const list = ids ? S.d.experiences.filter(e => ids.includes(e.id)) : S.d.experiences;
  return list.map(e => ({ id: e.id, 类型: EXP_TYPES[e.type] || e.type, 机构: e.org, 角色: e.role, 时间: (e.start || "") + "~" + (e.end || ""), 要点: e.bullets || [] }));
}

/* ============ in-app browser (Claude desktop) ============ */
async function br(tool, input) { return S.mcp.callTool(HOST, tool, input); }
function rtext(r) {
  if (!r) return "";
  const t = (r.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  if (t) return t;
  return typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? "");
}
async function openTab(url) {
  const r = await br("preview_start", { url });
  if (r && r.payload && typeof r.payload === "object" && r.payload.tabId) return String(r.payload.tabId);
  const m = rtext(r).match(/tab[_\s-]?id["'\s:=]*["']?([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}
const withTab = (tab, o) => (tab ? { ...o, tabId: tab } : o);
async function pageText(tab, max = 20000) { return rtext(await br("get_page_text", withTab(tab, { max_chars: max }))); }

/* ============ file reading ============ */
async function fileText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    await loadScript(LIBS.pdf); await loadScript(LIBS.pdfw);
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIBS.pdfw;
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); const c = await page.getTextContent();
      let lastY = null;
      for (const it of c.items) { const y = it.transform ? it.transform[5] : null; if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += "\n"; out += it.str; lastY = y; }
      out += "\n\n";
    }
    return out;
  }
  if (name.endsWith(".docx")) {
    await loadScript(LIBS.mammoth);
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  return file.text();
}

/* ============ zip + ics ============ */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(); const chunks = []; const central = []; let off = 0;
  const now = new Date(); const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff; const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name); const data = typeof f.data === "string" ? enc.encode(f.data) : f.data; const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cSize, true); end.setUint32(16, off, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]; const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}
function icsDate(iso) { return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function icsEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) { const out = []; let cur = ""; for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = " " + ch; } else cur += ch; } out.push(cur); return out.join("\r\n"); }
function buildICS(events) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kaledin Job Desk//CN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-TIMEZONE:Asia/Shanghai"];
  for (const ev of events) {
    const end = ev.end || new Date(new Date(ev.start).getTime() + (ev.mins || 60) * 6e4).toISOString();
    L.push("BEGIN:VEVENT", "UID:" + ev.id + "@kaledin-jobdesk", "DTSTAMP:" + icsDate(new Date().toISOString()), "DTSTART:" + icsDate(ev.start), "DTEND:" + icsDate(end),
      fold("SUMMARY:" + icsEsc(ev.title)));
    if (ev.location) L.push(fold("LOCATION:" + icsEsc(ev.location)));
    if (ev.note) L.push(fold("DESCRIPTION:" + icsEsc(ev.note)));
    for (const m of ev.alarms || [1440, 60]) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(ev.title), "TRIGGER:-PT" + m + "M", "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
async function saveFile(filename, data) {
  if (!S.dl) { toast("当前环境不能保存文件。", true); return false; }
  try { await S.dl.save({ filename, data }); return true; }
  catch (e) { if (e.code !== "declined") toast(e.code === "rejected_extension" ? "不支持这种文件格式。" : "保存失败：" + (e.message || e.code), true); return false; }
}
async function downloadEvents(events, base) {
  const ics = buildICS(events);
  const safe = String(base).replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
  const zip = zipStore([{ name: safe + ".ics", data: ics }]);
  const ok = await saveFile(safe + "-日历.zip", new Blob([zip], { type: "application/zip" }));
  if (ok) toast("已保存。解压后双击 .ics 即可加入苹果日历。");
}
