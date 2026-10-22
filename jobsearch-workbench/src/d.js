/* ============ AI flows ============ */
async function organize() {
  setBusy("organize", true);
  try {
    const texts = S.d.resumes.map(r => `【${r.title}】\n${(r.text || "").slice(0, 14000)}`).join("\n\n").slice(0, 60000);
    const existing = S.d.experiences.map(e => ({ id: e.id, type: e.type, org: e.org, role: e.role, start: e.start, end: e.end, bullets: e.bullets }));
    const r = await ai(`你是简历整理助手。下面是同一位候选人的多份简历原文，以及已有的经历库。请把所有经历去重合并成一份完整经历库。
规则：
1. 同一段经历（同一机构+相近时间）只保留一条，bullets 取各版本中信息最完整、最具体的表述并合并去重，不要改写事实或数字，不要编造。
2. 若与已有经历库中的某条是同一段经历，填写 matchId 为那条的 id。
3. type 只能是：intern 实习 / work 工作 / research 科研 / project 项目 / leadership 学生工作或社团 / publication 论文成果 / award 获奖 / other。
4. 时间统一写成 YYYY-MM 或 YYYY；进行中写「至今」。
5. tags 从以下方向中选与该经历相关的（可多选或空）：${DIRS.join("、")}。
6. 同时提取基本资料与教育经历；没有的字段留空字符串。
已有经历库：${JSON.stringify(existing)}
简历原文：
${texts}
只输出 JSON：{"basic":{"name":"","nameEn":"","gender":"","birth":"","phone":"","email":"","wechat":"","politics":"","hometown":"","residence":"","gradDate":""},"education":[{"school":"","college":"","major":"","degree":"","start":"","end":"","gpa":"","rank":"","advisor":"","thesis":""}],"languages":"","skills":"","awards":"一行一项","experiences":[{"matchId":"","type":"","org":"","role":"","start":"","end":"","location":"","bullets":[""],"tags":[""]}]}`, { tier: "complex" });
    let added = 0, updated = 0;
    for (const x of r.experiences || []) {
      const body = { type: x.type || "other", org: x.org || "", role: x.role || "", start: x.start || "", end: x.end || "", location: x.location || "", bullets: (x.bullets || []).filter(Boolean), tags: (x.tags || []).filter(t => DIRS.includes(t)), updatedAt: new Date().toISOString() };
      if (x.matchId && byId("experiences", x.matchId)) { await db.set("experiences/" + x.matchId, body); updated++; }
      else { await db.set("experiences/" + uid(), body); added++; }
    }
    await mergeProfile(r);
    toast(`经历库已整理：新增 ${added} 条，更新 ${updated} 条。请到「报名信息」核对基本资料。`);
  } catch (e) { toast(errText(e), true); }
  setBusy("organize", false);
}
async function mergeProfile(r) {
  const p = JSON.parse(JSON.stringify(S.d.profile || {}));
  p.basic = p.basic || {};
  for (const [k, v] of Object.entries(r.basic || {})) if (v && !p.basic[k]) p.basic[k] = v;
  if (!(p.education || []).length && (r.education || []).length) p.education = r.education.filter(e => e.school);
  for (const k of ["languages", "skills", "awards"]) if (r[k] && !p[k]) p[k] = r[k];
  p.updatedAt = new Date().toISOString();
  await db.set("profile/main", p);
}
async function runMatch(id) {
  const a = appById(id); if (!a) return;
  const jd = ($("#jd-" + id) && $("#jd-" + id).value.trim()) || a.jd || "";
  if (!jd && !extrasText(a)) { toast("先粘贴 JD，或在上方补充关键信息。", true); return; }
  if (!S.d.experiences.length) { toast("经历库是空的，先上传简历并整理。", true); return; }
  setBusy("match-" + id, true);
  try {
    const r = await ai(`你是资深求职顾问，熟悉中国校招（政府机关/选调/事业单位、高校教职/辅导员/博士后、国企央企）。根据候选人资料与岗位信息评估匹配度。只依据给出的事实，不臆测、不编造。
候选人：${JSON.stringify(profileBrief())}
经历库：${JSON.stringify(expBrief())}
岗位：公司「${a.company || "未知"}」，岗位「${a.role || "未知"}」，网址 ${a.url || "无"}
JD 全文：
${(jd || "（未提供，以用户补充信息为准）").slice(0, 12000)}
${extrasBlock(a)}
只输出 JSON：{"company":{"name":"","industry":"","nature":"央企/国企/民企/外企/事业单位/党政机关/国际组织/高校/智库/其他","direction":"从【${DIRS.join("|")}】中选一个，都不符合则空"},"role":{"title":"","city":"","deadline":"YYYY-MM-DD 或空"},"score":0,"verdict":"一句话结论","dims":[{"name":"专业背景","score":0,"note":""},{"name":"相关经历","score":0,"note":""},{"name":"技能与工具","score":0,"note":""},{"name":"硬性条件","score":0,"note":""},{"name":"方向契合","score":0,"note":""}],"hardChecks":[{"item":"学历/届别/专业/语言/政治面貌/年龄等 JD 中写明的硬性要求","status":"满足|不满足|待确认","note":""}],"strengths":["..."],"gaps":["短板 + 具体弥补建议"],"recommend":[{"expId":"经历库中的 id","reason":"为什么这段最该突出"}],"keywords":["JD 关键词，6-12 个"]}`);
    const patch = { jd, match: { ...r, at: new Date().toISOString() } };
    if (!a.company && r.company && r.company.name) patch.company = r.company.name;
    if (!a.role && r.role && r.role.title) patch.role = r.role.title;
    if (!a.city && r.role && r.role.city) patch.city = r.role.city;
    if (!a.deadline && r.role && r.role.deadline) patch.deadline = r.role.deadline;
    if (!a.nature && r.company) patch.nature = r.company.nature || "";
    if (!a.category && r.company && DIRS.includes(r.company.direction)) patch.category = r.company.direction;
    if (!a.industry && r.company) patch.industry = r.company.industry || "";
    await saveApp(a, patch);
    S.tailorSel[id] = null;
  } catch (e) { toast(errText(e), true); }
  setBusy("match-" + id, false);
}
async function fetchJD(id) {
  const a = appById(id); if (!a || !a.url) return;
  setBusy("jd-" + id, true);
  try {
    const tab = await openTab(a.url); await sleep(2500);
    let text = await pageText(tab, 30000);
    if (text.length > 6000) {
      const r = await ai(`从下面的招聘网页文本中摘出与「${a.role || "目标岗位"}」相关的岗位信息原文（公司、岗位名称、工作地点、岗位职责、任职要求、截止时间），保持原文，不要改写。若页面上有多个岗位，全部列出并以岗位名分隔。只输出 JSON：{"jd":""}\n\n${text.slice(0, 30000)}`, { tier: "quick" });
      text = r.jd || text;
    }
    await saveApp(a, { jd: text.slice(0, 20000), browserTab: tab || "" });
    toast("已读取招聘页内容，请核对后分析。");
  } catch (e) { toast(errText(e), true); }
  setBusy("jd-" + id, false);
}
async function runTailor(id) {
  const a = appById(id); if (!a) return;
  const ids = (S.tailorSel[id] || []).filter(x => byId("experiences", x));
  if (!ids.length) { toast("至少选一段经历。", true); return; }
  setBusy("tailor-" + id, true);
  try {
    const list = ids.map(x => byId("experiences", x)).map(e => ({ expId: e.id, 机构: e.org, 角色: e.role, 时间: (e.start || "") + "~" + (e.end || ""), bullets: (e.bullets || []).map((b, i) => ({ i, text: b })) }));
    const r = await ai(`任务：为投递「${a.company}」的「${a.role || "该岗位"}」生成定制版简历表述。
铁律：
1. 不新增、不删除任何事实；时间、机构、职位、数字、成果、获奖一律不变；不得夸大。
2. 只能调整措辞、语序、侧重点、动词和术语，使之贴合 JD 的关键词和用人单位的话语体系（如政府机关/事业单位偏「调查研究、统筹协调、服务大局、政策落实」，高校教职/博士后偏「研究方向、学术产出、教学与指导」，辅导员偏「学生工作、思想引领、组织活动」，国企央企偏「战略研究、综合管理、服务国家战略」）。
3. 某条已经合适就不改：changed=false，new 填原文。
4. 每处修改都写 reason，说明对应 JD 的哪一点。
5. 另写 2–3 句「个人概述」，只能基于下列事实。
JD 关键词：${JSON.stringify((a.match || {}).keywords || [])}
JD：
${(a.jd || "").slice(0, 8000)}
${extrasBlock(a)}
候选人教育背景：${JSON.stringify(profileBrief()["学历"])}
待改写经历：${JSON.stringify(list)}
只输出 JSON：{"notes":"整体改写策略一句话","summary":{"text":"","reason":""},"items":[{"expId":"","bullets":[{"i":0,"new":"","changed":true,"reason":""}]}]}`, { tier: "complex" });
    const order = (r.items || []).filter(it => ids.includes(it.expId));
    for (const x of ids) if (!order.find(o => o.expId === x)) order.push({ expId: x, bullets: [] });
    await db.set("tailored/" + id, { expIds: ids, items: order, summary: r.summary || null, notes: r.notes || "", accepted: {}, at: new Date().toISOString() });
  } catch (e) { toast(errText(e), true); }
  setBusy("tailor-" + id, false);
}
async function fillScan(id) {
  const a = appById(id); const k = "fill-" + id;
  S.logs[k] = []; setBusy(k, "scan");
  try {
    const tab = S.fillTab && S.fillTab.app === id ? S.fillTab.tab : (a.browserTab || null);
    log(k, "读取当前页面的表单字段…");
    let tree = rtext(await br("read_page", withTab(tab, { filter: "interactive", max_chars: 45000 })));
    if (!/ref_\d+/.test(tree)) { log(k, "没有找到可填写的字段，请确认表单已打开。"); setBusy(k, false); return; }
    log(k, `找到 ${(tree.match(/ref_\d+/g) || []).length} 个可交互元素，正在匹配资料…`);
    const p = S.d.profile || {};
    const td = tailoredDoc(a);
    const profile = { 基本信息: p.basic || {}, 教育经历: p.education || [], 语言: p.languages, 技能: p.skills, 获奖: p.awards, 常用问答: p.qa || [], 经历: (td ? tailoredContent(a) : S.d.experiences.map(e => ({ e, bullets: e.bullets }))).map(x => ({ 类型: EXP_TYPES[x.e.type], 机构: x.e.org, 角色: x.e.role, 开始: x.e.start, 结束: x.e.end, 地点: x.e.location, 描述: (x.bullets || []).join("；") })) };
    const r = await ai(`你在帮候选人填写网申表单。下面是页面可交互元素的无障碍树（每个元素带 [ref_N]）和候选人的报名资料。
规则：
1. 只填资料里明确有的信息；资料没有、需要主观判断、或不确定的字段不填，放进 skipped 并说明原因。
2. 绝不填写：密码、验证码、身份证/护照等证件号码、银行卡号；不处理文件上传；不点击任何按钮（包括提交、保存、下一步）。
3. 下拉框的 value 必须是页面选项上的原文；单选/复选框的 value 用 true。
4. 日期按页面提示的格式；没有提示用 YYYY-MM 或 YYYY-MM-DD。
5. 「自我评价」「求职动机」等开放题，优先用常用问答里最相近的答案；没有就放进 skipped。
6. 已经有正确值的字段不要重复填。
报名资料：${JSON.stringify(profile).slice(0, 20000)}
${extrasBlock(a, 3000)}
页面元素：
${tree.slice(0, 40000)}
只输出 JSON：{"fills":[{"ref":"ref_12","label":"字段名","value":"值"}],"skipped":[{"label":"","reason":""}]}`);
    S.fill = { app: id, tab, fills: (r.fills || []).filter(f => /^ref_\d+$/.test(f.ref)).map(f => ({ ...f, on: true })), skipped: r.skipped || [] };
    log(k, `可自动填写 ${S.fill.fills.length} 项，需要你处理 ${S.fill.skipped.length} 项。请在下方核对。`);
  } catch (e) { log(k, "出错：" + errText(e)); }
  setBusy(k, false);
}
async function fillApply(id) {
  const st = S.fill; if (!st || st.app !== id) return; const k = "fill-" + id;
  setBusy(k, "apply"); let ok = 0;
  for (const f of st.fills) {
    if (!f.on || f.done === "ok") continue;
    try {
      const v = f.value === "true" ? true : f.value === "false" ? false : f.value;
      await br("form_input", withTab(st.tab, { ref: f.ref, value: v, action_summary: "填写「" + String(f.label).slice(0, 20) + "」" }));
      f.done = "ok"; ok++;
    } catch (e) { f.done = e.code === "cancelled" ? "你取消了这一项" : "未写入"; }
    render();
  }
  log(k, `已写入 ${ok} 项。请在浏览器里核对，确认无误后由你自己点保存或提交。`);
  setBusy(k, false);
}
let deepCtl = null;
async function runDeep(id) {
  if (S.local) return localDeep(id);
  const a = appById(id); if (!a) return; const k = "prep-" + id;
  S.logs[k] = []; setBusy(k, true); deepCtl = new AbortController();
  let tab = null; let n = 0;
  const engine = q => S.engine === "baidu" ? "https://www.baidu.com/s?wd=" + encodeURIComponent(q) : "https://cn.bing.com/search?q=" + encodeURIComponent(q);
  const ensureTab = async url => { if (!tab) { tab = await openTab(url); await sleep(2000); } else { await br("navigate", withTab(tab, { url })); await sleep(1500); } };
  const tools = [
    { name: "web_search", description: "用搜索引擎检索中文或英文网页，返回搜索结果页文本（含标题、摘要、链接）。", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      async execute(input) { n++; log(k, `检索 ${n}：${input.query}`); await ensureTab(engine(String(input.query || ""))); return { text: (await pageText(tab, 7000)) }; } },
    { name: "open_page", description: "打开一个网址并返回页面正文文本。", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      async execute(input) { n++; log(k, `阅读 ${n}：${input.url}`); await ensureTab(String(input.url || "")); return { text: (await pageText(tab, 10000)) }; } },
  ];
  try {
    log(k, "开始联网分析（用内置浏览器）…");
    const r = await ai(deepPrompt(a), { tier: "complex", tools, signal: deepCtl.signal });
    await db.set("analyses/" + id, { ...r, by: "page", at: new Date().toISOString() });
    log(k, "完成。");
  } catch (e) { log(k, e.code === "cancelled" ? "已停止。" : "出错：" + errText(e)); }
  deepCtl = null; setBusy(k, false);
}
function deepPrompt(a) {
  return `你是面试教练兼行业研究员。请为候选人准备「${a.company}」「${a.role || "该岗位"}」的面试。
先用 web_search / open_page 工具查最新公开信息：机构官网与官方公众号文章、近一年新闻、年报或政策文件、行业报告、往届面经。检索 4–10 次即可，不要无限检索。
所有事实性陈述必须来自你查到的资料，并把用到的网页列入 sources；查不到的写「未查到公开信息」，绝不编造。自我介绍只能使用候选人资料里的真实经历。
今天是 ${today()}。
候选人：${JSON.stringify(profileBrief())}
经历：${JSON.stringify(expBrief())}
JD：${(a.jd || "未提供").slice(0, 6000)}
${extrasBlock(a)}
匹配分析：${JSON.stringify(a.match ? { verdict: a.match.verdict, strengths: a.match.strengths, gaps: a.match.gaps } : "未做")}
只输出 JSON：{"intro1":"1分钟中文自我介绍，约250字，第一人称，突出与岗位最相关的2-3段经历","intro3":"3分钟版本，约700字","introEn":"英文1分钟版本；仅当岗位涉及外语、涉外或国际组织时写，否则空","industry":"行业/领域现状与趋势，要点式，每行以 - 开头","business":"该机构业务方向、近期动态、战略重点，要点式","competitors":[{"name":"","compare":"与目标机构的对比"}],"role":"岗位实际工作内容、考核重点、所在部门，要点式","questions":[{"q":"预测问题","type":"动机|经历|专业|情景|压力|时政|英文","intent":"考官想考察什么","hint":"结合候选人真实经历的答题要点，要点式"}],"ask":["面试最后可以反问的问题"],"sources":[{"title":"","url":""}]}
questions 给 12–18 个。`;
}
async function parseNotice() {
  const s = S.sched; const text = ($("#sc-text") || {}).value || "";
  if (!text.trim()) { toast("先粘贴通知原文。", true); return; }
  S.busy.sc = true; drawSchedule(); $("#sc-text").value = text;
  try {
    const r = await ai(`从下面的笔试/面试/测评通知中提取所有可选时间段。今天是 ${today()}，时区 Asia/Shanghai；没写年份时按最近的未来日期推断。只输出 JSON：{"slots":[{"start":"YYYY-MM-DDTHH:mm","end":"YYYY-MM-DDTHH:mm 或空","label":"原文对这个时间的描述"}],"location":"地点或会议链接","note":"需要准备的事项，一句话"}\n\n${text.slice(0, 8000)}`, { tier: "quick" });
    s.slots = (r.slots || []).filter(x => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x.start || ""));
    s.pick = s.slots.length === 1 ? 0 : -1;
    s.location = r.location || s.location; s.note = r.note || s.note;
    if (!s.slots.length) toast("没识别到具体时间，请手动填写。", true);
  } catch (e) { toast(errText(e), true); }
  delete S.busy.sc; drawSchedule(); $("#sc-text").value = text;
}

/* ============ companies import ============ */
const CO_MAP = [["range", /起止|报名时间|招聘时间|网申时间|时间段/], ["name", /公司|企业|单位|机构|名称/], ["category", /方向|分类|类别/], ["industry", /行业|领域/], ["nature", /性质|类型|所有制/], ["batch", /批次|招聘类型|届/], ["roles", /岗位|职位/], ["cities", /地点|城市|地区|base/i], ["openDate", /开始|开放|发布/], ["deadline", /截止|结束|deadline/i], ["url", /链接|网址|官网|投递|url|网申/i], ["notes", /备注|说明/]];
function excelDate(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) return ymd(new Date(Math.round((v - 25569) * 864e5)));
  const s = String(v || "").trim(); const m = s.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : s;
}
function parseRange(v) {
  const s = String(v || ""); const y = new Date().getFullYear(); const out = [];
  const re = /(?:(\d{4})[年./-])?(\d{1,2})[月./-](\d{1,2})日?/g; let m;
  while ((m = re.exec(s)) && out.length < 2) out.push(`${m[1] || (out[0] ? out[0].slice(0, 4) : y)}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  return [out[0] || "", out[1] || (/招满|额满/.test(s) ? "招满即止" : "")];
}
async function upsertCompanies(rows, source) {
  let add = 0, upd = 0;
  for (const r of rows) {
    if (!r.name) continue;
    const id = hashId(r.name + "|" + (r.batch || ""));
    const old = byId("companies", id);
    const body = { ...(old || {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && v != null)), source: old && old.source === "飞书" ? "飞书" : source, syncedAt: new Date().toISOString() };
    delete body.id;
    if (body.category && !DIRS.includes(body.category)) { body.categoryRaw = body.category; body.category = ""; }
    await db.set("companies/" + id, body); old ? upd++ : add++;
    if ((add + upd) % 10 === 0) setBusy("import", `已写入 ${add + upd} / ${rows.length}`);
  }
  return { add, upd };
}
async function importFile(file) {
  setBusy("import", "读取文件…"); toast("正在导入 " + file.name);
  try {
    let raw;
    if (/\.csv$/i.test(file.name)) raw = parseCSV(await file.text());
    else {
      await loadScript(LIBS.xlsx);
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      raw = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    }
    if (!raw.length) { toast("表格是空的。", true); setBusy("import", false); return; }
    const heads = Object.keys(raw[0]); const map = {};
    for (const h of heads) for (const [k, re] of CO_MAP) if (!Object.values(map).includes(k) && re.test(h)) { map[h] = k; break; }
    if (!Object.values(map).includes("name")) { toast("没找到「公司/企业/单位」列，请检查表头。", true); setBusy("import", false); return; }
    const rows = raw.map(r => { const o = { extra: {} }; for (const h of heads) { const k = map[h]; const v = r[h]; if (k === "range") { const [op, en] = parseRange(v); if (op && !o.openDate) o.openDate = op; if (en && !o.deadline) o.deadline = en; }
        else if (k) o[k] = (k === "deadline" || k === "openDate") ? excelDate(v) : String(v).trim(); else if (String(v).trim()) o.extra[h] = String(v).trim().slice(0, 300); } return o; });
    const { add, upd } = await upsertCompanies(rows, "飞书");
    toast(`导入完成：新增 ${add} 家，更新 ${upd} 家。`);
  } catch (e) { toast("导入失败：" + (e.message || errText(e)), true); }
  setBusy("import", false);
}
const FS = { host: "https://kcnrqqpruo3a.feishu.cn", base: "Hmiibiihoav4SXs56Ufc6DkEnxq", table: "tblmZUlIlvcSgH3V", view: "vewqTT2HnI" };
const FS_PAGE = `${FS.host}/base/${FS.base}?table=${FS.table}&view=${FS.view}`;
async function fsJSON(tab, url) {
  await br("navigate", withTab(tab, { url }));
  await sleep(600);
  const r = await br("get_page_text", withTab(tab, { max_chars: 4000000 }));
  let t = ((r && r.content) || []).filter(b => b.type === "text").map(b => b.text).find(x => x.includes("{")) || rtext(r);
  const i = t.indexOf("\n---\n"); if (i >= 0) t = t.slice(i + 5);
  const j = t.indexOf("{"); if (j < 0) throw new Error("飞书没有返回数据");
  let line = t.slice(j); const nl = line.indexOf("\n"); if (nl >= 0) line = line.slice(0, nl);
  line = line.trim();
  if (!line.endsWith("}")) { const e = new Error("返回内容被截断"); e.trunc = true; throw e; }
  return JSON.parse(line);
}
async function unpack(s) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch (e) {}
  const bin = Uint8Array.from(atob(s), c => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}
function fsCategory(nature, name, roles) {
  const s = (nature || "") + " " + (name || "");
  if (/央企|国企|央国企/.test(nature || "")) return "国企央企";
  if (/事业单位|机关|政府|公务员|选调/.test(s)) return "政府机关/事业单位";
  if (/(大学|学院|高校)/.test(name || "") && /辅导员|博士后|教师|教职|讲师|研究员/.test((roles || "") + (name || ""))) return "高校教职、辅导员、博士后";
  return "";
}
async function dbRetry(fn) { for (let k = 0; k < 4; k++) { try { return await fn(); } catch (e) { if (e && (e.code === "resource_exhausted" || e.code === "unavailable") && k < 3) { await sleep(1500 * (k + 1)); continue; } throw e; } } }
async function feishuSync() {
  if (!S.hostOK) { toast("需要在 Claude 桌面 App 里打开本页。", true); return; }
  setBusy("import", "打开飞书表格…");
  try {
    const tab = await openTab(FS_PAGE); await sleep(4000);
    setBusy("import", "读取表格结构…");
    const cv = await fsJSON(tab, `${FS.host}/space/api/v1/bitable/${FS.base}/clientvars?tableID=${FS.table}&viewID=${FS.view}&recordLimit=1&ondemandLimit=1&needBase=true&viewLazyLoad=true&ondemandVer=2&openType=0&noMissCS=true&optimizationFlag=1&removeFmlExtra=true`);
    if (cv.code !== 0) throw new Error("飞书返回：" + (cv.msg || cv.code));
    const tb = await unpack(cv.data.table);
    const fm = tb.fieldMap, rev = tb.meta.rev, total = tb.meta.recordsNum || tb.recordCount || 0;
    const F = {}; for (const [id, f] of Object.entries(fm)) F[f.name] = { id, type: f.type, opt: Object.fromEntries(((f.property && f.property.options) || []).map(o => [o.id, o.name])) };
    const cell = (r, name) => r[(F[name] || {}).id];
    const txt = (r, name) => { const c = cell(r, name); if (!c || c.value == null) return ""; const v = c.value; if (Array.isArray(v)) return v.map(x => typeof x === "string" ? x : (x.text || x.name || "")).join(""); return String(v); };
    const sel = (r, name) => { const c = cell(r, name); if (!c || c.value == null) return ""; const v = c.value; return (Array.isArray(v) ? v : [v]).map(x => (F[name].opt || {})[x] || x).join("、"); };
    const link = (r, name) => { const c = cell(r, name); if (!c || c.value == null) return ""; const v = c.value; const arr = Array.isArray(v) ? v : [v]; for (const x of arr) { const u = typeof x === "string" ? x : (x.link || x.url || x.text || ""); const m = String(u).match(/https?:\/\/\S+/); if (m) return m[0]; } return ""; };
    const dateOf = ms => ms ? ymd(new Date(ms)) : "";
    const all = {};
    let step = 1000;
    for (let off = 0; off < Math.max(total, 1); off += step) {
      setBusy("import", `读取记录 ${off + 1}–${Math.min(off + step, total)} / ${total}…`);
      let j;
      try { j = await fsJSON(tab, `${FS.host}/space/api/v1/bitable/${FS.base}/records?tableId=${FS.table}&viewId=${FS.view}&tableRev=${rev}&depRev=%7B%7D&viewLazyLoad=true&offset=${off}&limit=${step}&tableID=${FS.table}&viewID=${FS.view}&removeFmlExtra=true`); }
      catch (e) { if (e.trunc && step > 100) { step = Math.floor(step / 2); off -= step; continue; } throw e; }
      if (j.code !== 0) throw new Error("飞书返回：" + (j.msg || j.code));
      let rm = null;
      for (const k of Object.keys(j.data || {})) { const v = await unpack(j.data[k]).catch(() => null); if (v && typeof v === "object" && v.recordMap) { rm = v.recordMap; break; } }
      if (!rm) throw new Error("记录格式无法识别");
      Object.assign(all, rm);
      if (Object.keys(rm).length < step) break;
    }
    const T = new Date(); T.setHours(0, 0, 0, 0);
    const rows = [];
    for (const [rid, r] of Object.entries(all)) {
      const dl = cell(r, "具体筛选时间"); const dlms = dl && dl.value;
      const dlText = txt(r, "截止时间");
      if (!(dlms && dlms >= T.getTime()) || dlText.includes("尽快投递")) continue;
      const name = txt(r, "公司名称").trim(); if (!name) continue;
      const nature = sel(r, "企业性质"), roles = txt(r, "可投岗位");
      rows.push({ id: "fs-" + rid, name, nature, industry: sel(r, "所属行业"), batch: sel(r, "招聘类型"), cohort: sel(r, "届次"), edu: sel(r, "学历要求"), cities: txt(r, "工作地"), roles,
        deadline: dateOf(dlms), deadlineText: dlText, noExam: !!(cell(r, "免笔试") && cell(r, "免笔试").value), notes: txt(r, "备注"),
        url: link(r, "投递渠道") || link(r, "企业招聘公告"), annUrl: link(r, "企业招聘公告"), feishuUrl: `${FS_PAGE}&record=${rid}`, feishuId: rid,
        fsUpdated: dateOf(cell(r, "更新日期") && cell(r, "更新日期").value), category: fsCategory(nature, name, roles) });
    }
    let add = 0, upd = 0;
    for (const row of rows) {
      const old = byId("companies", row.id); const { id, ...body } = row;
      if (old && old.category && !body.category) delete body.category;
      const doc = { ...(old || {}), ...body, source: "飞书", syncedAt: new Date().toISOString() }; delete doc.id;
      await dbRetry(() => db.set("companies/" + id, doc)); old ? upd++ : add++;
      if ((add + upd) % 20 === 0) setBusy("import", `写入公司库 ${add + upd} / ${rows.length}…`);
    }
    await db.set("meta/feishu", { lastSync: new Date().toISOString(), total, matched: rows.length, view: FS.view });
    toast(`飞书同步完成：符合视图条件 ${rows.length} 条，新增 ${add}，更新 ${upd}。`);
  } catch (e) { toast("飞书同步失败：" + (e.message || errText(e)), true); }
  setBusy("import", false);
}

/* ============ add from recruitment post ============ */
function postModal() {
  S.postImgs = [];
  modal(`<h2>从招聘推送添加单位</h2>
  <p class="note" style="margin:0">把公众号推送、官网公告或就业网通知的正文粘贴进来，也可以只给链接或上传截图。AI 会提取单位、岗位、报名时间、要求，并给出匹配度。</p>
  <label class="f"><span>推送正文（可选）</span><textarea id="pp-text" style="min-height:160px" placeholder="粘贴招聘推送全文"></textarea></label>
  <label class="f"><span>链接（可选）</span><input type="url" id="pp-url" placeholder="https://mp.weixin.qq.com/…"></label>
  <label class="f"><span>截图（可选，可多张）</span><input type="file" id="pp-img" accept="image/png,image/jpeg,image/webp" multiple></label>
  <div class="log" id="log-post" hidden></div>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="runPost" id="pp-go">识别并添加</button></div>`, true);
}
async function runPost() {
  const text = $("#pp-text").value.trim(), url = $("#pp-url").value.trim(), files = [...($("#pp-img").files || [])];
  if (!text && !url && !files.length) { toast("至少给正文、链接或截图中的一项。", true); return; }
  const go = $("#pp-go"); go.disabled = true; go.innerHTML = `<span class="spin"></span> 识别中…`;
  const lg = $("#log-post"); lg.hidden = false; const say = s => { lg.textContent += (lg.textContent ? "\n" : "") + s; };
  try {
    let body = text;
    if (S.github) for (const file of files) await archiveFile(file);
    if (!body && url && S.hostOK) { say("用内置浏览器打开链接读取正文…"); const tab = await openTab(url); await sleep(3000); body = (await pageText(tab, 30000)).slice(0, 30000); }
    let images;
    if (files.length) { const lim = await S.sample.limits().catch(() => null); if (lim && lim.images) images = files.slice(0, lim.images.maxCount || 5); else say("当前环境不支持识别图片，只用文字。"); }
    if (!body && !images) throw new Error(url ? "此链接未读取：请直接粘贴招聘正文，或上传截图。" : "没有可识别的内容。");
    say("提取招聘信息并评估匹配度…");
    const r = await ai(`下面是一条招聘推送（可能是文字、截图或网页正文）。请提取信息并评估与候选人的匹配度。只根据推送原文提取，原文没有的字段留空，不要编造日期。今天是 ${today()}。
候选人：${JSON.stringify(profileBrief())}
经历概要：${JSON.stringify(expBrief().map(e => e.机构 + "·" + e.角色)).slice(0, 3000)}
推送链接：${url || "无"}
推送正文：
${(body || "（见截图）").slice(0, 20000)}
匹配度评分参考：方向契合（选调/高校教职/博士后/政策研究最高，机关事业单位次之，国企央企总部职能与研究岗中等，技术销售类岗位低）、是否面向博士或政治学/公共管理专业、届别是否含 2027 届、北京是否有岗位。
只输出 JSON：{"name":"单位名","category":"从【${DIRS.join("|")}】中选一个，都不符合则空","nature":"央企/国企/事业单位/党政机关/高校/科研院所/民企/外企/银行/其他","industry":"","batch":"如 2027届秋招","cohort":"面向届次","edu":"学历要求","roles":"可投岗位，顿号分隔","cities":"","openDate":"YYYY-MM-DD 或空","deadline":"YYYY-MM-DD 或空","deadlineText":"原文对截止时间的描述","url":"报名/投递链接，原文没有则用推送链接","notes":"关键要求与亮点，60字以内（专业、政治面貌、年龄、考试安排、待遇等）","fit":{"score":0,"reason":"30字以内"}}`, { tier: "default", ...(images ? { images: images.length === 1 ? images[0] : images } : {}) });
    if (!r.name) throw new Error("没识别出单位名称，请补充正文后再试。");
    const id = "my-" + uid();
    const docBody = { name: r.name, category: DIRS.includes(r.category) ? r.category : "", nature: r.nature || "", industry: r.industry || "", batch: r.batch || "", cohort: r.cohort || "", edu: r.edu || "", roles: r.roles || "", cities: r.cities || "", openDate: r.openDate || "", deadline: r.deadline || "", deadlineText: r.deadlineText || "", url: r.url || url || "", notes: r.notes || "", rawPost: (body || "").slice(0, 20000), postUrl: url || "", source: "推送", addedAt: today(), verifiedAt: today() };
    await db.set("companies/" + id, docBody);
    if (r.fit && typeof r.fit.score === "number") { try { await db.update("meta/fit", { scores: { [id]: { score: Math.round(r.fit.score), reason: r.fit.reason || "" } } }); } catch (e) { await db.set("meta/fit", { scores: { ...(S.d.fitMap || {}), [id]: { score: Math.round(r.fit.score), reason: r.fit.reason || "" } } }); } }
    closeModal(); toast(`已添加「${r.name}」${r.fit ? "，匹配度 " + r.fit.score : ""}。`);
  } catch (e) { say("出错：" + (e.message || errText(e))); go.disabled = false; go.textContent = "识别并添加"; }
}

/* ============ exports ============ */
function resumeMd(a) {
  const p = S.d.profile || {}; const b = p.basic || {}; const td = tailoredDoc(a);
  const L = [`# ${b.name || "姓名"}`, [b.phone, b.email, b.wechat && "微信 " + b.wechat].filter(Boolean).join(" | "), ""];
  if (td && td.summary && td.summary.text) L.push("## 个人概述", td.summary.text, "");
  L.push("## 教育背景"); for (const e of p.education || []) L.push(`- **${e.school || ""}** ${e.college || ""} ${e.major || ""} ${e.degree || ""}（${e.start || ""}–${e.end || ""}）${e.gpa ? " GPA " + e.gpa : ""}${e.rank ? " " + e.rank : ""}`);
  L.push("");
  const groups = {}; for (const x of tailoredContent(a)) (groups[x.e.type] = groups[x.e.type] || []).push(x);
  for (const t of Object.keys(EXP_TYPES)) if (groups[t]) { L.push("## " + EXP_TYPES[t] + "经历"); for (const x of groups[t]) { L.push(`### ${x.e.org} · ${x.e.role || ""}（${x.e.start || ""}–${x.e.end || ""}）`); for (const bl of x.bullets) L.push("- " + bl); } L.push(""); }
  if (p.languages || p.skills) L.push("## 语言与技能", p.languages || "", p.skills || "", "");
  if (p.awards) L.push("## 荣誉奖项", ...String(p.awards).split(/\n/).filter(Boolean).map(x => "- " + x));
  return L.join("\n");
}
async function exportDocx(a) {
  try {
    toast("正在生成 Word…");
    await loadScript(LIBS.docx);
    const D = window.docx; const p = S.d.profile || {}; const b = p.basic || {}; const td = tailoredDoc(a);
    const font = "PingFang SC";
    const H = t => new D.Paragraph({ spacing: { before: 200, after: 80 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: "1E5D68", space: 2 } }, children: [new D.TextRun({ text: t, bold: true, size: 24, font, color: "1E5D68" })] });
    const P = (t, o = {}) => new D.Paragraph({ spacing: { after: 40 }, children: [new D.TextRun({ text: t, size: 20, font, ...o })] });
    const B = t => new D.Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [new D.TextRun({ text: t, size: 20, font })] });
    const kids = [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: b.name || "姓名", bold: true, size: 36, font })] }),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 120 }, children: [new D.TextRun({ text: [b.phone, b.email, b.wechat && "微信 " + b.wechat].filter(Boolean).join("  |  "), size: 19, font, color: "555555" })] })];
    if (td && td.summary && td.summary.text) kids.push(H("个人概述"), P(td.summary.text));
    if ((p.education || []).length) { kids.push(H("教育背景")); for (const e of p.education) kids.push(P(`${e.school || ""}  ${e.college || ""} ${e.major || ""}  ${e.degree || ""}`, { bold: true }), P(`${e.start || ""} – ${e.end || ""}${e.gpa ? "   GPA " + e.gpa : ""}${e.rank ? "   " + e.rank : ""}${e.thesis ? "   论文：" + e.thesis : ""}`)); }
    const groups = {}; for (const x of tailoredContent(a)) (groups[x.e.type] = groups[x.e.type] || []).push(x);
    for (const t of Object.keys(EXP_TYPES)) if (groups[t]) { kids.push(H(EXP_TYPES[t] + "经历")); for (const x of groups[t]) { kids.push(new D.Paragraph({ spacing: { before: 80, after: 30 }, children: [new D.TextRun({ text: `${x.e.org}  ·  ${x.e.role || ""}`, bold: true, size: 21, font }), new D.TextRun({ text: `\t${x.e.start || ""} – ${x.e.end || ""}`, size: 19, font, color: "555555" })], tabStops: [{ type: D.TabStopType.RIGHT, position: 9600 }] })); for (const bl of x.bullets) kids.push(B(bl)); } }
    if (p.languages || p.skills) { kids.push(H("语言与技能")); if (p.languages) kids.push(P(p.languages)); if (p.skills) kids.push(P(p.skills)); }
    if (p.awards) { kids.push(H("荣誉奖项")); for (const x of String(p.awards).split(/\n/).filter(Boolean)) kids.push(B(x)); }
    const doc = new D.Document({ sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }] });
    const blob = await D.Packer.toBlob(doc);
    await saveFile(`${b.name || "简历"}-${a.company || ""}-${a.role || ""}.docx`.replace(/[\\/:*?"<>|]/g, "-"), blob);
  } catch (e) { toast("生成 Word 失败：" + (e.message || errText(e)), true); }
}

/* ============ events ============ */
async function setStatus(id, status) {
  const a = appById(id); if (!a || a.status === status) return;
  const history = [...(a.history || []), { status, at: new Date().toISOString() }];
  await saveApp(a, { status, history });
  if (EVENT_STAGES.has(status)) scheduleModal({ ...a, status }, status);
}
const ACT = {
  githubLogout, uploadFiles: uploadCloudFiles,
  previewFile: t => openCloudFile(t.dataset.id, true), downloadFile: t => openCloudFile(t.dataset.id),
  localSettings, testAI, restoreData, localJobs,
  backupData: async () => { const data = await api("/api/backup"); await saveFile("求职工作台备份-" + today() + ".json", JSON.stringify(data, null, 2)); },
  copyField: async t => { await navigator.clipboard.writeText(S.copyFields[+t.dataset.i][1]); toast("已复制。"); },
  go: t => { if (S.profileDirty && S.view === "profile" && !confirm("报名信息尚未保存，确定放弃修改？")) return; S.profileDirty = false; S.view = t.dataset.v; S.appId = null; try { localStorage.setItem("jd_view", S.view); } catch (e) {} window.scrollTo(0, 0); render(); },
  newApp: () => newAppModal(),
  closeModal, modalBg: (t, e) => { if (e.target === t) closeModal(); },
  async createApp(t) {
    const url = $("#na-url").value.trim(), company = $("#na-co").value.trim(), role = $("#na-role").value.trim(), jd = $("#na-jd").value.trim(), run = $("#na-run").checked;
    if (!url && !company) { toast("至少填网址或公司名。", true); return; }
    const co = t.dataset.co ? byId("companies", t.dataset.co) : null;
    const id = uid();
    const body = { company: company || (co && co.name) || "", role, url, jd, status: "待投递", history: [{ status: "待投递", at: new Date().toISOString() }], events: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (co) Object.assign(body, { companyId: co.id, category: co.category || "", nature: co.nature || "", industry: co.industry || "", deadline: co.deadline || "", city: co.cities || "" });
    if (co) { const ex = []; if (co.notes && String(co.notes).trim() !== "无") ex.push({ id: uid(), text: (co.source === "飞书" ? "【飞书表备注】" : "【公司库备注】") + co.notes, at: new Date().toISOString() });
      if (co.rawPost) ex.push({ id: uid(), text: "【招聘推送原文】" + co.rawPost, at: new Date().toISOString() });
      if (co.roles) ex.push({ id: uid(), text: "【可投岗位】" + co.roles + (co.edu ? "；学历要求：" + co.edu : "") + (co.cohort ? "；届次：" + co.cohort : ""), at: new Date().toISOString() });
      if (ex.length) body.extras = ex; if (!body.jd && co.rawPost) body.jd = co.rawPost; }
    await db.set("applications/" + id, body);
    closeModal(); S.appId = id; S.appTab = "match"; render();
    if (run) {
      if (!jd && url && S.hostOK) { await fetchJD(id); await sleep(300); }
      if ((appById(id) || {}).jd) runMatch(id); else toast(S.hostOK ? "没读到 JD，请手动粘贴。" : "请把 JD 粘贴到「岗位描述」后点「分析匹配度」。");
    }
  },
  openApp: (t, e) => { if (e.target.closest("select")) return; S.appId = t.dataset.id; S.appTab = "match"; window.scrollTo(0, 0); render(); },
  closeApp: () => { S.appId = null; render(); },
  appTab: t => { S.appTab = t.dataset.t; render(); },
  editApp: t => { const a = appById(t.dataset.id); modal(`<h2>编辑投递信息</h2><div class="fields">${[["company", "公司"], ["role", "岗位"], ["city", "城市"], ["deadline", "截止日期"], ["url", "网址"], ["nature", "性质"], ["industry", "行业"]].map(([k, l]) => `<label class="f"><span>${l}</span><input type="text" id="ea-${k}" value="${esc(a[k] || "")}"></label>`).join("")}
    <label class="f"><span>方向</span><select id="ea-category"><option value="">未分类</option>${DIRS.map(d => `<option ${a.category === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></label></div>
    <div class="row" style="justify-content:space-between"><button class="btn danger" data-act="delApp" data-id="${a.id}">删除这条投递</button><div class="row"><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveAppInfo" data-id="${a.id}">保存</button></div></div>`); },
  async saveAppInfo(t) { const a = appById(t.dataset.id); const patch = {}; for (const k of ["company", "role", "city", "deadline", "url", "nature", "industry", "category"]) patch[k] = $("#ea-" + k).value.trim(); await saveApp(a, patch); closeModal(); },
  async delApp(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "再点一次确认删除"; return; } const id = t.dataset.id; await db.del("applications/" + id); await db.del("tailored/" + id).catch(() => {}); await db.del("analyses/" + id).catch(() => {}); closeModal(); S.appId = null; render(); },
  async saveJD(t) { const a = appById(t.dataset.id); await saveApp(a, { jd: $("#jd-" + a.id).value.trim() }); toast("JD 已保存。"); },
  fetchJD: t => fetchJD(t.dataset.id),
  runMatch: t => runMatch(t.dataset.id),
  runTailor: t => runTailor(t.dataset.id),
  exportMd: async t => { const a = appById(t.dataset.id); await saveFile(`${(S.d.profile || {}).basic?.name || "简历"}-${a.company}.md`.replace(/[\\/:*?"<>|]/g, "-"), resumeMd(a)); },
  exportDocx: t => exportDocx(appById(t.dataset.id)),
  async fillOpen(t) { const id = t.dataset.id; const url = $("#fill-url").value.trim(); if (!url) { toast("填一个网址。", true); return; } try { const tab = await openTab(url); S.fillTab = { app: id, tab }; toast("已在内置浏览器打开。需要登录的话请先登录。"); } catch (e) { toast(errText(e), true); } },
  fillScan: t => fillScan(t.dataset.id),
  fillApply: t => fillApply(t.dataset.id),
  runDeep: t => runDeep(t.dataset.id),
  stopDeep: () => deepCtl && deepCtl.abort(),
  async queueDeep(t) { const a = appById(t.dataset.id); await db.set("queue/" + uid(), { type: "deep", applicationId: a.id, label: `面试深度分析：${a.company} ${a.role || ""}`, status: "pending", createdAt: new Date().toISOString() }); toast("已加入待处理任务，请在总览中点击开始分析。"); },
  dropQ: async t => { await db.del("queue/" + t.dataset.id); },
  schedule: t => scheduleModal(appById(t.dataset.id), appById(t.dataset.id).status),
  scParse: () => parseNotice(),
  async scSave(t) {
    const s = S.sched; const a = appById(s.app); const manual = $("#sc-start").value; const mins = +$("#sc-mins").value || 60;
    let start, end;
    if (manual) { start = new Date(manual).toISOString(); end = new Date(new Date(manual).getTime() + mins * 6e4).toISOString(); }
    else if (s.pick >= 0) { const x = s.slots[s.pick]; start = new Date(x.start).toISOString(); end = x.end ? new Date(x.end).toISOString() : new Date(new Date(x.start).getTime() + mins * 6e4).toISOString(); }
    else { toast("选一个识别出的时间，或手动填写。", true); return; }
    const ev = { id: uid(), type: s.stage, title: `${a.company} ${s.stage}${a.role ? "（" + a.role + "）" : ""}`, start, end, location: $("#sc-loc").value.trim(), note: $("#sc-note").value.trim() };
    await saveApp(a, { events: [...(a.events || []), ev] });
    closeModal();
    if (t.dataset.dl === "1") await downloadEvents([ev], ev.title); else toast("日程已保存。");
  },
  async ics1(t) { const a = appById(t.dataset.app); const ev = (a.events || []).find(e => e.id === t.dataset.ev); if (ev) await downloadEvents([ev], ev.title || a.company); },
  async icsAll() { const up = upcoming(); await downloadEvents(up.map(e => ({ ...e, title: e.title || `${e.app.company} ${e.type}` })), "求职日程-" + today()); },
  async delEv(t) { const a = appById(t.dataset.app); await saveApp(a, { events: (a.events || []).filter(e => e.id !== t.dataset.ev) }); },
  async addPos(t) { const a = appById(t.dataset.id); const g = k => ($("#ps-" + k + "-" + a.id).value || "").trim(); const title = g("t"); if (!title) { toast("先填岗位名称。", true); return; }
    await saveApp(a, { positions: [...(a.positions || []), { id: uid(), order: g("o"), title, unit: g("u"), note: g("n"), status: "已投递", at: new Date().toISOString() }] }); },
  async delPos(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "确认删除"; return; } const a = appById(t.dataset.app); await saveApp(a, { positions: (a.positions || []).filter(x => x.id !== t.dataset.x) }); },
  async addExtra(t) { const a = appById(t.dataset.id); const el = $("#ex-" + a.id); const text = (el.value || "").trim(); if (!text) { toast("先粘贴要补充的内容。", true); return; }
    await saveApp(a, { extras: [...(a.extras || []), { id: uid(), text: text.slice(0, 20000), at: new Date().toISOString() }] }); el.value = ""; toast("已补充。之后的匹配分析、定制简历、面试准备都会用上；想让已有结果反映新信息，点对应的「重新…」。"); },
  async delExtra(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "确认删除"; return; } const a = appById(t.dataset.app); await saveApp(a, { extras: (a.extras || []).filter(x => x.id !== t.dataset.x) }); },
  async saveNotes(t) { const a = appById(t.dataset.id); await saveApp(a, { notes: $("#notes-" + a.id).value }); toast("备注已保存。"); },
  afStatus: t => { S.af.status = t.dataset.s; render(); },
  cfDir: t => { S.cf.dir = t.dataset.d; render(); },
  cfStar: () => { S.cf.star = !S.cf.star; render(); },
  cfWait: () => { S.cf.wait = !S.cf.wait; render(); },
  cfSrc: t => { S.cf.src = S.cf.src === t.dataset.s ? "" : t.dataset.s; render(); },
  async star(t) { const c = byId("companies", t.dataset.id); if (!c) return; const on = !c.starred; t.textContent = on ? "★" : "☆"; t.setAttribute("aria-pressed", on);
    try { await db.update("companies/" + c.id, { starred: on, starredAt: on ? new Date().toISOString() : "" }); } catch (e) { toast(errText(e), true); render(); } },
  applyCo: t => { const c = byId("companies", t.dataset.id); newAppModal({ url: c.url, company: c.name, role: "", companyId: c.id }); },
  toggleClamp: t => t.classList.toggle("open"),
  addPost: () => postModal(),
  runPost: () => runPost(),
  addCo: () => coModal(), editCo: t => coModal(byId("companies", t.dataset.id)),
  async saveCo(t) { const r = {}; for (const [k] of CO_FIELDS) r[k] = $("#co-" + k).value.trim(); if (!r.name) { toast("公司名必填。", true); return; } if (r.deadline) r.deadline = excelDate(r.deadline);
    const id = t.dataset.id || hashId(r.name + "|" + (r.batch || "")); const old = byId("companies", id);
    await db.set("companies/" + id, { ...(old || {}), ...r, source: (old && old.source) || "手动", verifiedAt: (old && old.verifiedAt) || "" }); closeModal(); },
  async delCo(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "再点一次确认删除"; return; } await db.del("companies/" + t.dataset.id); closeModal(); },
  importCo: () => { const i = document.createElement("input"); i.type = "file"; i.accept = ".csv,.xlsx,.xls"; i.onchange = () => i.files[0] && importFile(i.files[0]); i.click(); },
  feishu: () => feishuSync(),
  organize: () => organize(),
  addExp: () => expModal(), editExp: t => expModal(byId("experiences", t.dataset.id)),
  async saveExp(t) {
    const body = { type: $("#x-type").value, org: $("#x-org").value.trim(), role: $("#x-role").value.trim(), start: $("#x-start").value.trim(), end: $("#x-end").value.trim(), location: $("#x-loc").value.trim(), bullets: $("#x-bullets").value.split(/\n/).map(s => s.trim()).filter(Boolean), tags: [...document.querySelectorAll('[name="x-tag"]:checked')].map(i => i.value), updatedAt: new Date().toISOString() };
    if (!body.org) { toast("机构必填。", true); return; }
    await db.set("experiences/" + (t.dataset.id || uid()), body); closeModal();
  },
  async delExp(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "再点一次确认删除"; return; } await db.del("experiences/" + t.dataset.id); closeModal(); },
  viewResume: t => { const r = byId("resumes", t.dataset.id); modal(`<h2>${esc(r.title)}</h2><div class="log" style="max-height:60vh;color:var(--ink)">${esc(r.text)}</div><div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">关闭</button></div>`, true); },
  async delResume(t) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "确认删除"; return; } await db.del("resumes/" + t.dataset.id); },
  async saveProfile(t) {
    if (t.disabled) return;
    const p = readProfileForm(); p.updatedAt = new Date().toISOString();
    const fields = [...$("#pf").querySelectorAll("input,textarea,select,button")];
    t.disabled = true; t.textContent = "保存中…"; fields.forEach(el => { el.disabled = true; });
    try { await db.set("profile/main", p); S.profileDirty = false; toast("报名信息已保存。"); render(); }
    finally { fields.forEach(el => { el.disabled = false; }); if (t.isConnected) { t.disabled = false; t.textContent = "保存"; } }
  },
  addEdu: () => { const p = readProfileForm(); p.education.push({}); S.d.profile = { ...(S.d.profile || {}), ...p }; S.profileDirty = true; render(true); },
  delEdu: t => { const p = readProfileForm(); p.education.splice(+t.dataset.i, 1); S.d.profile = { ...(S.d.profile || {}), ...p }; S.profileDirty = true; render(true); },
  addQA: () => { const p = readProfileForm(); p.qa.push({}); S.d.profile = { ...(S.d.profile || {}), ...p }; S.profileDirty = true; render(true); },
  async profileFromResume() { if (S.profileDirty) { toast("先保存当前修改。", true); return; } await organize(); },
};
const CHANGE = {
  status: t => setStatus(t.dataset.id, t.value),
  engine: t => { S.engine = t.value; try { localStorage.setItem("jd_engine", t.value); } catch (e) {} },
  cfOpen: t => { S.cf.open = t.checked; render(); },
  cfSort: t => { S.cf.sort = t.value; render(); },
  tsel: t => { const id = t.dataset.app; const set = new Set(S.tailorSel[id] || []); t.checked ? set.add(t.value) : set.delete(t.value); S.tailorSel[id] = [...set]; },
  async tacc(t) { const td = S.d.tailored.find(x => x.id === t.dataset.app); if (!td) return; const accepted = { ...(td.accepted || {}), [t.dataset.k]: t.checked }; await db.update("tailored/" + td.id, { accepted }); },
  fillOn: t => { if (S.fill) { S.fill.fills[+t.dataset.i].on = t.checked; render(); } },
  scPick: t => { S.sched.pick = +t.value; },
  resumeFiles: t => uploadResumes([...t.files]),
};
async function pdfPageImages(file, maxPages) {
  await loadScript(LIBS.pdf); await loadScript(LIBS.pdfw);
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIBS.pdfw;
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2.2, 1800 / Math.max(base.width, base.height)) });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(await new Promise(r => cv.toBlob(r, "image/jpeg", 0.88)));
  }
  return { images: out, total: pdf.numPages };
}
async function ocrImages(images, name) {
  if (!S.sample) throw { code: "unavailable" };
  const lim = await S.sample.limits().catch(() => null);
  if (!lim || !lim.images) throw { message: "当前 AI 不支持图片识别，请上传 TXT 或 Markdown 文本。" };
  const per = Math.max(1, Math.min(lim.images.maxCount || 1, 5));
  let text = "";
  for (let i = 0; i < images.length; i += per) {
    const batch = images.slice(i, i + per);
    setBusy("upload", `OCR 识别 ${name}：第 ${i + 1}–${i + batch.length} 页 / 共 ${images.length} 页…`);
    const r = await S.sample(`这些图片是一份简历的第 ${i + 1} 到第 ${i + batch.length} 页。请逐字转录图片中的全部文字，保持原有的段落和条目顺序：标题单独成行，每个条目一行，表格按「字段：内容」逐行写出。不要总结、不要改写、不要补充图片里没有的内容；看不清的字用 [?] 标出。只输出转录文本。`, { images: batch.length === 1 ? batch[0] : batch, modelTier: "default", cache: false });
    text += r.text + "\n\n";
  }
  return text;
}
async function uploadResumes(files) {
  let saved = 0;
  for (const f of files) {
    setBusy("upload", "读取 " + f.name + "…");
    try {
      const original = await archiveFile(f);
      const lower = f.name.toLowerCase();
      let text = "", ocr = false;
      if (/\.(png|jpe?g|webp)$/.test(lower)) { text = await ocrImages([f], f.name); ocr = true; }
      else {
        text = (await fileText(f)).replace(/\n{3,}/g, "\n\n").trim();
        if (lower.endsWith(".pdf") && text.replace(/\s/g, "").length < 150) {
          toast(f.name + " 是扫描件或图片版，改用 OCR 识别…");
          const { images, total } = await pdfPageImages(f, 8);
          text = await ocrImages(images, f.name); ocr = true;
          if (total > 8) toast(`只识别了前 8 页（共 ${total} 页）。`);
        }
      }
      text = text.replace(/\n{3,}/g, "\n\n").trim();
      if (text.length < 30) { toast(f.name + " 没识别出文字，请检查文件或上传 TXT / Markdown。", true); continue; }
      await db.set("resumes/" + uid(), { title: f.name, text: text.slice(0, 120000), ocr, ...(original ? { fileId: original.id } : {}), createdAt: new Date().toISOString() });
      saved++;
      if (ocr) toast(f.name + " 已通过 OCR 识别。建议点「查看」核对一遍，标 [?] 的是没看清的字。");
    } catch (e) { toast(f.name + "：" + (e.message || errText(e)), true); }
  }
  setBusy("upload", false);
  if (saved) toast(`已保存 ${saved} 份简历。点「AI 整理经历库」把它们合并成经历库。`);
}

/* ============ wiring ============ */
document.addEventListener("click", e => { const t = e.target.closest("[data-act]"); if (!t) return; const f = ACT[t.dataset.act]; if (f) { if (t.tagName === "BUTTON" || t.tagName === "A") e.preventDefault(); Promise.resolve().then(() => f(t, e)).catch(error => toast(errText(error), true)); } });
document.addEventListener("change", e => { const t = e.target.closest("[data-change]"); if (t && CHANGE[t.dataset.change]) Promise.resolve().then(() => CHANGE[t.dataset.change](t, e)).catch(error => toast(errText(error), true)); });
document.addEventListener("input", e => {
  const t = e.target;
  if (t.closest("#pf")) { if (!S.profileDirty) { S.profileDirty = true; const h = $(".head .row"); if (h && !h.querySelector(".pill.warn")) h.insertAdjacentHTML("afterbegin", `<span class="pill warn">有未保存的修改</span>`); } return; }
  const k = t.dataset && t.dataset.input;
  if (k === "afq" || k === "cfq") { if (e.isComposing || S.composing) return; scheduleSearch(t, k); }
});
/* 中文输入法：拼音组字期间不重绘（重绘会替换输入框，打断组字），组字结束后再搜索 */
function scheduleSearch(t, k) {
  (k === "afq" ? S.af : S.cf).q = t.value;
  clearTimeout(S._searchT);
  S._searchT = setTimeout(() => {
    if (S.composing) return;
    const cur = $(`[data-input="${k}"]`); const pos = cur && document.activeElement === cur ? cur.selectionStart : null;
    render();
    const el = $(`[data-input="${k}"]`);
    if (el) { el.focus(); const p = pos == null ? el.value.length : Math.min(pos, el.value.length); el.setSelectionRange(p, p); }
  }, 300);
}
document.addEventListener("compositionstart", e => { if (e.target.dataset && /^(afq|cfq)$/.test(e.target.dataset.input || "")) { S.composing = true; clearTimeout(S._searchT); } });
document.addEventListener("compositionend", e => { const k = e.target.dataset && e.target.dataset.input; if (k === "afq" || k === "cfq") { S.composing = false; scheduleSearch(e.target, k); if (S._pendingRender) { S._pendingRender = false; } } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal").innerHTML) closeModal(); });
document.addEventListener("dragover", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", e => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); uploadResumes([...e.dataTransfer.files]); } });

S.engine = "bing"; try { S.engine = localStorage.getItem("jd_engine") || "bing"; } catch (e) {}
async function boot() {
  render();
  const c = window.claude;
  if (!c && (location.hostname.endsWith(".github.io") || new URLSearchParams(location.search).has("github"))) { githubLogin(); return; }
  if (!c || !c.use) { await localBoot(); return; }
  const get = n => c.use(n).catch(() => null);
  const [dbx, sample, dl, user] = await Promise.all([get("db"), get("sample"), get("downloads"), get("user")]);
  Object.assign(S, { db: dbx, sample, dl, user });
  if (!dbx) { S.fatal = "需要登录 claude.ai 才能读取你的求职数据。"; render(); return; }
  subscribe();
  S.ready = true; render();
  const mcp = await get("mcp"); S.mcp = mcp;
  if (mcp) { try { const r = await mcp.listTools(); S.hostOK = (r.servers || []).some(s => s.server === HOST); } catch (e) { S.hostOK = false; } render(); }
}
boot();
