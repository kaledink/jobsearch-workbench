/* Standalone runtime: the same views work without Claude Artifact. */
async function api(path, body, signal) {
  if (S.github) return S.github.request(path, body, signal);
  const response = await fetch(path, {
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    cache: "no-store", signal,
  });
  let result;
  try { result = await response.json(); } catch (_) { throw new Error("服务返回异常，请确认使用工作台服务启动页面。"); }
  if (!response.ok) throw new Error(result.error || "请求失败，请重试。");
  return result;
}

function localDatabase(initial) {
  let docs = initial;
  const listeners = new Set();
  const snapshot = path => ({ exists: Object.hasOwn(docs, path), data: () => structuredClone(docs[path]) });
  function notify() { for (const f of listeners) f(); }
  async function write(operation, path, data = {}) {
    await api("/api/document", { operation, path, data });
    // Refetch the committed state. Never show an unacknowledged write as saved.
    await refresh();
  }
  async function refresh() {
    const result = await api("/api/state");
    if (JSON.stringify(result.documents) !== JSON.stringify(docs)) { docs = result.documents; notify(); }
  }
  return {
    refresh,
    collection(name) { return { onSnapshot(fn) {
      const emit = () => fn({ docs: Object.keys(docs).filter(p => p.startsWith(name + "/")).map(p => ({ id: p.split("/")[1], data: () => structuredClone(docs[p]) })) });
      listeners.add(emit); emit(); return () => listeners.delete(emit);
    } }; },
    doc(path) { return {
      set: data => write("set", path, data), update: data => write("update", path, data), delete: () => write("delete", path),
      onSnapshot(fn) { const emit = () => fn(snapshot(path)); listeners.add(emit); emit(); return () => listeners.delete(emit); },
    }; },
  };
}

async function imageData(image) {
  if (typeof image === "string") return image;
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("无法读取图片。")); r.readAsDataURL(image); });
}

function localSample() {
  async function call(prompt, opts = {}, text = false) {
    const input = opts.images ? (Array.isArray(opts.images) ? opts.images : [opts.images]) : [];
    try {
      const result = await api("/api/ai", { prompt, text, images: await Promise.all(input.map(imageData)), search: !!opts.tools }, opts.signal);
      S.aiStatus.lastResult = "ok";
      return result;
    } catch (error) { S.aiStatus.lastResult = "error"; throw error; }
  }
  const sample = (prompt, opts) => call(prompt, opts, true);
  sample.json = (prompt, opts) => call(prompt, opts);
  sample.limits = async () => ({ images: { maxCount: 5 } });
  return sample;
}

async function browserDownload({ filename, data, archived = false }) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/octet-stream" });
  if (S.github && !archived && !filename.startsWith("求职工作台备份")) await archiveFile(new File([blob], filename, { type: blob.type }));
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function localBoot() {
  S.local = true;
  const base = new URL("vendor/", location.href);
  Object.assign(LIBS, { pdf: new URL("pdf.min.js", base).href, pdfw: new URL("pdf.worker.min.js", base).href, mammoth: new URL("mammoth.browser.min.js", base).href, xlsx: new URL("xlsx.full.min.js", base).href, docx: new URL("docx.umd.js", base).href });
  try {
    const [state, status] = await Promise.all([api("/api/state"), api("/api/status")]);
    S.db = localDatabase(state.documents); S.sample = localSample(); S.dl = { save: browserDownload };
    S.aiStatus = status.ai; S.hostOK = false;
    subscribe(); S.ready = true; render();
    setInterval(() => { if (document.visibilityState === "visible") S.db.refresh().catch(() => {}); }, S.github ? 60000 : 5000);
  } catch (error) {
    if (!S.github) githubLogin();
    else { S.fatal = "无法读取私人仓库，请检查权限后刷新重试。"; render(); }
  }
}

function localRail() {
  const ai = S.aiStatus || {};
  const state = ai.lastResult === "ok" ? "已连通" : ai.lastResult === "error" ? "连接失败" : "待测试";
  return `<div><span class="dot ${ai.lastResult === "ok" ? "on" : "off"}"></span>${esc(ai.provider === "github" ? "GitHub Models" : ai.provider === "openai" ? "OpenAI" : "Codex")} · ${state}</div>
    <button class="btn sm" data-act="localSettings">数据与 AI 设置</button>${S.github ? `<button class="btn sm" data-act="githubLogout">退出私人工作台</button>` : ""}`;
}

function localSettings() {
  const status = S.aiStatus || {};
  modal(`<h2>数据与 AI</h2><p>${S.github ? `所有记录与文件保存在私有仓库 ${esc(S.github.owner + "/" + S.github.repo)} 中，Git 提交历史保留修改版本。` : "数据保存在此服务器的 SQLite 数据库中，关闭网页后仍保留。更换服务器前请下载备份。"}</p>
    <div class="row"><button class="btn" data-act="backupData">下载完整备份</button><button class="btn" data-act="restoreData">导入备份</button></div>
    <p class="note">导入会合并记录，同 ID 的记录由备份覆盖；${S.github ? "导入前的记录保留在 GitHub 提交历史中。完整备份包含附件。" : "导入前会自动备份现有数据。服务器启动时也会备份，保留最近 30 份。"}</p>
    <h3>AI：${esc(status.provider === "github" ? "GitHub Models" : status.provider === "openai" ? "OpenAI" : "Codex")}</h3>
    <p class="note">${status.provider === "github" ? "使用当前 GitHub 令牌调用 GitHub Models，需要 Models 读取权限和可用额度。仅在点击 AI 功能时发送相关资料，不支持联网检索。" : status.provider === "openai" ? "由服务端环境变量配置接口，密钥不会发送到浏览器。此模式暂不支持联网分析。" : "使用服务端已登录的 Codex。首次使用请测试连接；连接失败时请检查登录状态及 chatgpt.com 网络访问。"}</p>
    <div class="row"><button class="btn primary" data-act="testAI" ${S.busy.aiTest ? "disabled" : ""}>${S.busy.aiTest ? "测试中…" : "测试 AI 连接"}</button><button class="btn" data-act="closeModal">关闭</button></div>
    <p id="ai-test-result" role="status"></p>`);
}

async function testAI() {
  S.busy.aiTest = true; localSettings();
  const target = $("#ai-test-result");
  try {
    const result = await S.sample.json('这是连接测试。仅输出 {"ok":true}。');
    if (result.ok !== true) throw new Error("AI 返回不符合测试格式，请重试。");
    target.textContent = "连接成功，可以使用 AI 整理简历和岗位分析。";
  } catch (error) { target.textContent = errText(error); }
  delete S.busy.aiTest;
  const button = $('[data-act="testAI"]'); if (button) { button.disabled = false; button.textContent = "重新测试 AI 连接"; }
  render();
}

async function restoreData() {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
  input.onchange = async () => {
    try {
      if (!input.files[0]) return;
      const limit = S.github ? 256 : 24;
      if (input.files[0].size > limit * 1024 * 1024) throw new Error(`备份文件不能超过 ${limit}MB。`);
      const data = JSON.parse(await input.files[0].text());
      if (!confirm("导入会合并数据，并覆盖同 ID 记录。导入前将自动备份现有数据，是否继续？")) return;
      const result = await api("/api/restore", data);
      await S.db.refresh(); closeModal(); toast(`已导入 ${result.count} 条记录。`);
    } catch (error) { toast(errText(error), true); }
  }; input.click();
}

async function localDeep(id) {
  const a = appById(id); if (!a) return;
  const k = "prep-" + id; S.logs[k] = []; setBusy(k, true);
  try {
    log(k, "AI 正在联网分析，通常需要几分钟。请保持页面打开。");
    const result = await ai(deepPrompt(a), { tools: [{ name: "web_search" }] });
    if (!result.intro1 || !Array.isArray(result.questions)) throw new Error("AI 分析不完整，请重试。");
    await db.set("analyses/" + id, { ...result, by: "codex", at: new Date().toISOString() });
    for (const q of S.d.queue.filter(q => q.applicationId === id && q.status !== "done")) await db.update("queue/" + q.id, { status: "done" });
    log(k, "分析已保存。");
  } catch (error) { log(k, "分析未完成：" + errText(error)); toast(errText(error), true); }
  setBusy(k, false);
}

async function localJobs() {
  setBusy("jobs", true);
  try {
    const r = await ai(`请联网寻找正在招聘的真实岗位，今天 ${today()}。候选人：${JSON.stringify(profileBrief())}。方向：${DIRS.join("、")}。
最多列出 6 家匹配的单位，必须有可核验的官方招聘链接和明确的报名截止时间；查不到就返回空数组，不要编造。
只输出 JSON：{"summary":"检索情况简述","companies":[{"name":"","category":"","roles":"","cities":"","batch":"","openDate":"YYYY-MM-DD","deadline":"YYYY-MM-DD","url":"https://官方招聘链接","notes":"信息来源与关键要求"}]}`, { tools: [{ name: "web_search" }] });
    const rows = (r.companies || []).filter(c => c.name && /^https:\/\//.test(c.url || "") && /^\d{4}-\d{2}-\d{2}$/.test(c.deadline || ""));
    const counts = await upsertCompanies(rows, "Codex");
    await db.set("meta/status", { ...(S.d.meta || {}), lastDaily: new Date().toISOString(), dailySummary: r.summary || "检索完成，请核对官方原文。" });
    toast(`检索完成：新增 ${counts.add} 家，更新 ${counts.upd} 家。请核对官方招聘信息。`);
  } catch (error) { toast(errText(error), true); }
  setBusy("jobs", false);
}

function localFill(a) {
  const p = S.d.profile || {}; const b = p.basic || {};
  const fields = [["姓名", b.name], ["手机", b.phone], ["邮箱", b.email], ["政治面貌", b.politics], ["毕业日期", b.gradDate],
    ["教育经历", (p.education || []).map(e => [e.school, e.major, e.degree, e.start, e.end].filter(Boolean).join(" · ")).join("\n")],
    ["语言", p.languages], ["技能", p.skills], ["获奖", p.awards]];
  S.copyFields = fields;
  return `<section class="sheet"><h2>报名资料速填</h2><p class="note">在招聘网站中手动核对并粘贴以下资料。跨网站自动填表暂不支持，最终保存和提交由你完成。</p>
    ${a.url && /^https?:\/\//i.test(a.url) ? `<a class="btn" href="${safeURL(a.url)}" target="_blank" rel="noopener noreferrer">打开招聘页面</a>` : ""}
    <div class="list">${fields.map(([label, value], i) => `<div class="li"><div class="grow"><b>${label}</b><div style="white-space:pre-wrap">${esc(value || "未填写，请先完善报名信息")}</div></div>${value ? `<button class="btn sm" data-act="copyField" data-i="${i}">复制</button>` : ""}</div>`).join("")}</div></section>`;
}

// CSV import works offline; Excel remains supported via the original parser.
function parseCSV(text) {
  const rows = []; let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请检查文件格式。");
  row.push(field); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ""])));
}
