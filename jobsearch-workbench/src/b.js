/* ============ render shell ============ */
let rq = 0;
function schedRender(kind) {
  if (kind === "profile" && S.view === "profile" && S.profileDirty) return;
  cancelAnimationFrame(rq);
  rq = requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && $("#main").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== "checkbox") { a.addEventListener("blur", () => schedRender(), { once: true }); return; }
    render();
  });
}
function render(force = false) {
  if (S.composing) { S._pendingRender = true; return; }
  const counts = { apps: S.d.applications.filter(a => !DONE.has(a.status)).length, companies: S.d.companies.length, resumes: S.d.experiences.length, calendar: upcoming().length };
  $("#nav").innerHTML = VIEWS.map(([k, label]) => `<button data-act="go" data-v="${k}" aria-current="${S.view === k && !S.appId}"><span>${label}</span>${counts[k] ? `<span class="n">${counts[k]}</span>` : ""}</button>`).join("");
  $("#railfoot").innerHTML = `
    <div><span class="dot ${S.db ? "on" : "off"}"></span>${S.db ? "数据已同步" : "数据未连接"}</div>
    ${S.local ? localRail() : `<div><span class="dot ${S.hostOK ? "on" : "off"}"></span>${S.hostOK ? "内置浏览器可用" : "内置浏览器不可用"}</div>`}
    <label class="f"><span>检索引擎</span><select id="engine" data-change="engine"><option value="bing" ${S.engine === "bing" ? "selected" : ""}>必应中国</option><option value="baidu" ${S.engine === "baidu" ? "selected" : ""}>百度</option></select></label>`;
  const m = $("#main");
  if (!force && S.view === "profile" && !S.appId && S.profileDirty && m.querySelector("#pf")) return;
  if (S.fatal) { m.innerHTML = `<div class="empty"><h3>无法打开</h3><p>${esc(S.fatal)}</p></div>`; return; }
  if (!S.ready) { m.innerHTML = `<div class="empty"><h3>正在载入</h3><p>连接你的求职数据…</p></div>`; return; }
  const sy = window.scrollY;
  const ae = document.activeElement; const fk = ae && ae.dataset && /^(afq|cfq)$/.test(ae.dataset.input || "") ? ae.dataset.input : null; const fpos = fk ? ae.selectionStart : null;
  m.innerHTML = S.appId && appById(S.appId) ? viewApp(appById(S.appId)) : (V[S.view] || V.dash)();
  window.scrollTo(0, sy);
  if (fk) { const el = $(`[data-input="${fk}"]`); if (el) { el.focus(); const p = Math.min(fpos ?? el.value.length, el.value.length); el.setSelectionRange(p, p); } }
}
function upcoming() {
  const now = Date.now() - 2 * 36e5; const out = [];
  for (const a of S.d.applications) for (const ev of a.events || []) if (new Date(ev.start).getTime() >= now) out.push({ ...ev, app: a });
  return out.sort((x, y) => new Date(x.start) - new Date(y.start));
}
function evRow(ev) {
  const d = new Date(ev.start);
  return `<div class="li"><div class="date-tag"><b>${d.getMonth() + 1}/${d.getDate()}</b>${hm(d)} 周${"日一二三四五六"[d.getDay()]}</div>
    <div class="grow"><div><b>${esc(ev.app.company)}</b> · ${esc(ev.type || "")}</div><div class="note">${esc(ev.app.role || "")}${ev.location ? " · " + esc(ev.location) : ""}</div></div>
    <button class="btn sm" data-act="ics1" data-app="${ev.app.id}" data-ev="${ev.id}">日历文件</button></div>`;
}

const V = {};
/* ---- 总览 ---- */
V.dash = () => {
  const apps = S.d.applications;
  const active = apps.filter(a => !DONE.has(a.status) && a.status !== "待投递");
  const up = upcoming();
  const week = up.filter(e => new Date(e.start) - Date.now() < 7 * 864e5);
  const appliedNames = new Set(apps.map(a => a.company));
  const soon = S.d.companies.filter(c => { const n = daysLeft(c.deadline); return n !== null && n >= 0 && n <= 10 && !appliedNames.has(c.name); }).sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline));
  const pend = S.d.queue.filter(q => q.status !== "done");
  const hasProfile = !!(S.d.profile && S.d.profile.basic && S.d.profile.basic.name);
  const steps = [
    [S.d.resumes.length > 0, "上传简历", "把你的各版简历拖进来，AI 会整理成经历库", "resumes"],
    [hasProfile, "核对报名信息", "一键填表用的姓名、联系方式、教育经历等", "profile"],
    [S.d.companies.length > 0, "导入公司库", "导入 CSV/Excel，或手动添加单位", "companies"],
    [apps.length > 0, "新增第一个投递", "贴上招聘网址，自动分析匹配度", "apps"],
  ];
  const meta = S.d.meta || {};
  return `<div class="head"><div><div class="eyebrow">${today()} · Asia/Shanghai</div><h1>今天的求职台</h1></div>
    <div class="row"><button class="btn primary" data-act="newApp">新增投递</button></div></div>
  ${steps.some(s => !s[0]) ? `<div class="sheet" style="margin-bottom:16px"><h2>开始使用</h2><div class="list">${steps.map(([done, t, d, v], i) => `
     <div class="li"><span class="pill ${done ? "ok" : ""} mono">${done ? "完成" : "第 " + (i + 1) + " 步"}</span><div class="grow"><b>${t}</b><div class="note">${d}</div></div>${done ? "" : `<button class="btn sm" data-act="go" data-v="${v}">去完成</button>`}</div>`).join("")}</div></div>` : ""}
  <div class="kpis">
    <div class="kpi"><b>${active.length}</b><span>进行中的投递</span></div>
    <div class="kpi"><b>${week.length}</b><span>7 天内笔试/面试</span></div>
    <div class="kpi"><b>${soon.length}</b><span>10 天内截止（未投）</span></div>
    <div class="kpi"><b>${apps.filter(a => a.status === "Offer").length}</b><span>Offer</span></div>
  </div>
  <div class="grid2">
    <section class="sheet"><h2>接下来的日程</h2>${up.length ? `<div class="list">${up.slice(0, 6).map(evRow).join("")}</div>` : `<p class="note">还没有笔试或面试。投递状态改成「笔试」「一面」等阶段时，会弹窗让你确认时间并生成日历文件。</p>`}</section>
    <section class="sheet"><h2>截止临近</h2>${soon.length ? `<div class="list">${soon.slice(0, 7).map(c => `<div class="li"><div class="grow"><b>${esc(c.name)}</b><div class="note">${esc(c.batch || "")} ${esc(c.roles || "").slice(0, 40)}</div></div><span class="note mono">${esc(mmdd(c.openDate))} → ${esc(mmdd(c.deadline))}</span>${dlPill(c.deadline)}<button class="btn sm" data-act="applyCo" data-id="${c.id}">投递</button></div>`).join("")}</div>` : `<p class="note">10 天内没有要截止、且你还没投的公司。</p>`}</section>
    <section class="sheet"><h2>岗位更新</h2>${meta.lastDaily ? `<p class="note mono">最近一次：${esc(meta.lastDaily)}</p>${md(meta.dailySummary || "")}` : `<p class="note">按你的目标方向检索公开招聘信息，结果需核对官方原文。不会在后台自动运行。</p>`}
    ${S.local ? `<button class="btn" data-act="localJobs" ${S.busy.jobs || S.aiStatus?.provider !== "codex" ? "disabled" : ""}>${S.busy.jobs ? "检索中…" : "用 Codex 检索岗位"}</button>` : ""}</section>
    <section class="sheet"><h2>待处理的分析</h2>${pend.length ? `<div class="list">${pend.map(q => `<div class="li"><div class="grow">${esc(q.label || q.type)}</div>${S.local ? `<button class="btn sm" data-act="runDeep" data-id="${esc(q.applicationId)}" ${S.busy["prep-" + q.applicationId] ? "disabled" : ""}>开始分析</button>` : ""}<button class="btn ghost sm" data-act="dropQ" data-id="${q.id}">撤销</button></div>`).join("")}</div>` : `<p class="note">没有排队的任务。</p>`}</section>
  </div>`;
};

/* ---- 投递 ---- */
V.apps = () => {
  const f = S.af;
  let list = S.d.applications.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (f.status) list = list.filter(a => (a.status || "待投递") === f.status);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(a => [a.company, a.role, a.city, posSummary(a)].join(" ").toLowerCase().includes(q)); }
  const nextEv = a => (a.events || []).filter(e => new Date(e.start) > Date.now()).sort((x, y) => new Date(x.start) - new Date(y.start))[0];
  return `<div class="head"><div><h1>投递</h1><p class="sub">每条投递有自己的匹配分析、定制简历、填表助手和面试准备。</p></div>
    <button class="btn primary" data-act="newApp">新增投递</button></div>
  <div class="row" style="margin-bottom:12px"><input type="search" id="af-q" placeholder="搜索公司、岗位" value="${esc(f.q)}" data-input="afq" style="max-width:260px">
    <div class="row">${["", ...STATUSES].map(s => `<button class="chip" data-act="afStatus" data-s="${s}" aria-pressed="${f.status === s}">${s || "全部"}</button>`).join("")}</div></div>
  ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>公司 / 岗位</th><th>状态</th><th>匹配</th><th>下一场</th><th>截止</th><th>更新</th></tr></thead><tbody>
  ${list.map(a => { const ne = nextEv(a); return `<tr data-act="openApp" data-id="${a.id}" style="cursor:pointer">
    <td><div class="t1">${esc(a.company || "未命名公司")}</div><div class="t2">${esc(posSummary(a))}${a.city ? " · " + esc(a.city) : ""}</div></td>
    <td><select data-change="status" data-id="${a.id}" aria-label="投递状态" style="width:auto">${STATUSES.map(s => `<option ${s === (a.status || "待投递") ? "selected" : ""}>${s}</option>`).join("")}</select></td>
    <td>${a.match ? `<span class="score ${scoreCls(a.match.score)}">${a.match.score}</span>` : `<span class="note">未分析</span>`}</td>
    <td>${ne ? `<span class="mono">${esc(ne.type)} ${new Date(ne.start).getMonth() + 1}/${new Date(ne.start).getDate()} ${hm(new Date(ne.start))}</span>` : `<span class="note">—</span>`}</td>
    <td>${dlPill(a.deadline)}</td><td class="mono t2">${esc((a.updatedAt || "").slice(5, 10))}</td></tr>`; }).join("")}
  </tbody></table></div>` : `<div class="empty"><h3>${S.d.applications.length ? "没有符合筛选的投递" : "还没有投递"}</h3><p>点「新增投递」，贴上公司招聘官网或岗位链接；也可以在公司库里直接点「投递」。</p></div>`}`;
};

/* ---- 公司库 ---- */
function addedKey(c) { const m = String(c.id || "").match(/^cl-(\d{4})(\d{2})(\d{2})/); return c.addedAt || (m ? `${m[1]}-${m[2]}-${m[3]}` : "") || c.verifiedAt || c.syncedAt || ""; }
V.companies = () => {
  const f = S.cf;
  let list = S.d.companies.slice();
  if (f.dir) list = list.filter(c => (c.category || "") === f.dir);
  if (f.open) list = list.filter(c => { const n = daysLeft(c.deadline); return c.status !== "closed" && (n === null || n >= 0); });
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(c => [c.name, c.industry, c.roles, c.cities, c.nature, c.notes].join(" ").toLowerCase().includes(q)); }
  if (f.star) list = list.filter(c => c.starred);
  if (f.wait) list = list.filter(c => c.status === "notStarted" || c.status === "watch");
  if (f.src === "claude") list = list.filter(c => ["Claude", "Codex"].includes(c.source));
  else if (f.src === "feishu") list = list.filter(c => c.source === "飞书");
  else if (f.src === "post") list = list.filter(c => c.source === "推送" || c.source === "手动");
  const byDl = (a, b) => (daysLeft(a.deadline) ?? 9999) - (daysLeft(b.deadline) ?? 9999);
  if (f.sort === "new") list.sort((a, b) => { const ca = ["Claude", "Codex"].includes(a.source), cb = ["Claude", "Codex"].includes(b.source); if (ca !== cb) return ca ? -1 : 1; if (ca) { const d = addedKey(b).localeCompare(addedKey(a)); if (d) return d; } return byDl(a, b); });
  else if (f.sort === "fit") list.sort((a, b) => ((fitOf(b) || {}).score ?? -1) - ((fitOf(a) || {}).score ?? -1) || byDl(a, b));
  else list.sort(byDl);
  const starN = S.d.companies.filter(c => c.starred).length;
  const latest = S.d.companies.filter(c => ["Claude", "Codex"].includes(c.source)).map(addedKey).sort().pop() || "";
  const applied = new Map(S.d.applications.map(a => [a.company, a]));
  const src = c => ["Claude", "Codex"].includes(c.source) ? `<span class="pill acc">AI 补充</span>` : c.source === "飞书" ? `<span class="pill">飞书</span>` : `<span class="pill">${esc(c.source || "手动")}</span>`;
  return `<div class="head"><div><h1>公司库</h1><p class="sub">导入公司表、手动添加，或从招聘推送提取岗位。</p></div>
    <div class="row">${S.hostOK ? `<button class="btn primary" data-act="feishu" ${S.busy.import ? "disabled" : ""}>${S.busy.import ? `<span class="spin"></span> ${esc(typeof S.busy.import === "string" ? S.busy.import : "同步中…")}` : "从飞书同步"}</button>` : `<span class="note">飞书表可导出后导入</span>`}<button class="btn" data-act="importCo">导入 CSV / Excel</button><button class="btn" data-act="addPost">从招聘推送添加</button><button class="btn" data-act="addCo">手动添加</button></div></div>
  <div class="row" style="margin-bottom:12px"><input type="search" placeholder="搜索单位、岗位、城市、备注" value="${esc(f.q)}" data-input="cfq" style="max-width:280px">
    <div class="row">${["", ...DIRS].map(d => `<button class="chip" data-act="cfDir" data-d="${esc(d)}" aria-pressed="${f.dir === d}">${d || "全部方向"}</button>`).join("")}</div>
    <button class="chip" data-act="cfStar" aria-pressed="${f.star}">★ 只看标星 <span class="mono">${starN}</span></button>
    <button class="chip" data-act="cfWait" aria-pressed="${f.wait}">未开放·关注中 <span class="mono">${S.d.companies.filter(c => c.status === "notStarted" || c.status === "watch").length}</span></button>
    <button class="chip" data-act="cfSrc" data-s="claude" aria-pressed="${f.src === "claude"}">AI 新增 <span class="mono">${S.d.companies.filter(c => ["Claude", "Codex"].includes(c.source)).length}</span></button>
    <button class="chip" data-act="cfSrc" data-s="feishu" aria-pressed="${f.src === "feishu"}">飞书 <span class="mono">${S.d.companies.filter(c => c.source === "飞书").length}</span></button>
    <button class="chip" data-act="cfSrc" data-s="post" aria-pressed="${f.src === "post"}">我添加 <span class="mono">${S.d.companies.filter(c => c.source === "推送" || c.source === "手动").length}</span></button>
    <label class="row note"><input type="checkbox" data-change="cfOpen" ${f.open ? "checked" : ""}> 只看未截止</label>
    <label class="row note">排序 <select data-change="cfSort" style="width:auto"><option value="new" ${f.sort === "new" ? "selected" : ""}>AI 新增优先</option><option value="dl" ${f.sort === "dl" ? "selected" : ""}>截止最近优先</option><option value="fit" ${f.sort === "fit" ? "selected" : ""}>匹配度最高</option></select></label></div>
  ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>公司</th><th>方向 / 性质</th><th>批次 · 岗位</th><th>匹配度</th><th>城市</th><th>报名时间<div class="t2" style="font-weight:400">开始 → 截止</div></th><th>来源</th><th></th></tr></thead><tbody>
  ${list.map(c => { const a = applied.get(c.name); return `<tr>
    <td><div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:8px"><button class="star" data-act="star" data-id="${c.id}" aria-pressed="${!!c.starred}" aria-label="${c.starred ? "取消标星" : "标星"}" title="${c.starred ? "取消标星" : "觉得合适就标星"}">${c.starred ? "★" : "☆"}</button>
      <div><div class="t1">${c.url ? `<a href="${safeURL(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}${["Claude", "Codex"].includes(c.source) && latest && addedKey(c) === latest ? ` <span class="pill acc">新</span>` : ""}</div><div class="t2">${esc(c.industry || "")}</div>${c.group ? `<span class="pill acc" style="margin-top:2px">${esc(c.group)}</span>` : ""}${c.myNote || c.myLink ? `<div class="row" style="gap:6px;margin-top:2px">${c.myNote ? `<span class="pill warn">${esc(c.myNote)}</span>` : ""}${c.myLink ? `<a class="t2" href="${safeURL(c.myLink)}" target="_blank" rel="noopener">我的链接</a>` : ""}</div>` : ""}${c.notes && String(c.notes).trim() !== "无" ? `<div class="t2 clamp" title="${esc(c.notes)}" data-act="toggleClamp">${esc(c.notes)}</div>` : ""}</div></div></td>
    <td><div>${esc(c.category || "未分类")}</div><div class="t2">${esc(c.nature || "")}</div></td>
    <td><div>${esc(c.batch || "")}${c.edu ? ` <span class="t2">${esc(c.edu)}</span>` : ""}</div><div class="t2">${esc(String(c.roles || "").slice(0, 60))}</div></td>
    <td style="max-width:220px">${fitOf(c) ? `<span class="score ${scoreCls(fitOf(c).score)}">${fitOf(c).score}</span><div class="t2">${esc(fitOf(c).reason || "")}</div>` : `<span class="note">—</span>`}</td>
    <td class="t2" style="max-width:140px">${esc(String(c.cities || "").slice(0, 40))}</td><td>${periodCell(c)}</td>
    <td>${src(c)}${c.feishuUrl ? ` <a class="t2" href="${safeURL(c.feishuUrl)}" target="_blank" rel="noopener">飞书原表</a>` : ""}${c.noExam ? `<div><span class="pill ok">免笔试</span></div>` : ""}${c.verifiedAt ? `<div class="t2 mono">核实 ${esc(c.verifiedAt.slice(5, 10))}</div>` : ""}</td>
    <td><div class="row">${a ? `<button class="btn sm" data-act="openApp" data-id="${a.id}">${esc(a.status || "待投递")}</button>` : `<button class="btn sm primary" data-act="applyCo" data-id="${c.id}">投递</button>`}<button class="btn ghost sm" data-act="editCo" data-id="${c.id}">编辑</button></div></td></tr>`; }).join("")}
  </tbody></table></div><p class="note">共 ${list.length} 家（库内 ${S.d.companies.length} 家）</p>` : `<div class="empty"><h3>${S.d.companies.length ? "没有符合筛选的公司" : "公司库是空的"}</h3><p>在飞书里把表格导出为 Excel 或 CSV，点「导入 CSV / Excel」；同名公司同批次会自动合并更新。</p></div>`}`;
};

/* ---- 简历与经历 ---- */
V.resumes = () => {
  const ex = S.d.experiences.slice().sort((a, b) => (b.end || "9999").localeCompare(a.end || "9999"));
  const groups = {};
  for (const e of ex) (groups[e.type] = groups[e.type] || []).push(e);
  return `<div class="head"><div><h1>简历与经历</h1><p class="sub">原始简历留档；经历库是去重后的事实底稿，定制简历只改表述、不改事实。</p></div>
    <div class="row"><button class="btn" data-act="addExp">添加经历</button><button class="btn primary" data-act="organize" ${S.d.resumes.length && !S.busy.organize ? "" : "disabled"}>${S.busy.organize ? `<span class="spin"></span> 整理中…` : "AI 整理经历库"}</button></div></div>
  <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
    <section class="stack">
      ${profileCard()}
      <label class="drop" id="drop" for="resume-file"><b>拖入或点击上传简历</b><div class="note">PDF、Word（.docx）、图片、TXT、Markdown，可一次多份；扫描版 PDF 会自动 OCR</div></label>
      <input type="file" id="resume-file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" multiple hidden data-change="resumeFiles">
      ${S.busy.upload ? `<p class="note"><span class="spin"></span> ${esc(S.busy.upload)}</p>` : ""}
      <div class="sheet"><h2>原始简历 <span class="note mono">${S.d.resumes.length}</span></h2>
      ${S.d.resumes.length ? `<div class="list">${S.d.resumes.map(r => `<div class="li"><div class="grow"><b>${esc(r.title)}</b><div class="note mono">${esc((r.createdAt || "").slice(0, 10))} · ${(r.text || "").length} 字${r.ocr ? " · OCR" : ""}</div></div><button class="btn ghost sm" data-act="viewResume" data-id="${r.id}">查看</button><button class="btn ghost sm danger" data-act="delResume" data-id="${r.id}">删除</button></div>`).join("")}</div>` : `<p class="note">还没有上传。上传 TXT、Markdown 或文档后，点击「AI 整理经历库」。</p>`}</div>
    </section>
    <section class="sheet"><h2>经历库 <span class="note mono">${ex.length}</span></h2>
    ${ex.length ? Object.keys(EXP_TYPES).filter(t => groups[t]).map(t => `<div style="margin-top:10px"><div class="eyebrow">${EXP_TYPES[t]}</div><div class="list">${groups[t].map(e => `
      <div class="li"><div class="date-tag">${esc(e.start || "")}<br>${esc(e.end || "")}</div><div class="grow"><b>${esc(e.org)}</b> · ${esc(e.role || "")}
        <ul style="margin:4px 0 0;padding-left:18px">${(e.bullets || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul>
        ${(e.tags || []).length ? `<div class="row" style="margin-top:4px">${e.tags.map(t => `<span class="pill">${esc(t)}</span>`).join("")}</div>` : ""}</div>
        <button class="btn ghost sm" data-act="editExp" data-id="${e.id}">编辑</button></div>`).join("")}</div></div>`).join("") : `<div class="empty"><h3>经历库是空的</h3><p>上传简历后点「AI 整理经历库」，它会把多份简历里的同一段经历合并，保留最完整的表述。</p></div>`}
    </section></div>`;
};

function profileCard() {
  const p = S.d.profile; const b = (p && p.basic) || {};
  if (!p) return `<div class="sheet"><h2>基本信息</h2><p class="note">整理经历库时会一并提取姓名、联系方式、教育经历，之后在「报名信息」里核对。</p></div>`;
  const flat = JSON.stringify(p);
  const conflicts = (flat.match(/另有版本|一版记|另一版/g) || []).length;
  return `<div class="sheet"><div class="row" style="justify-content:space-between"><h2 style="margin:0">基本信息</h2><button class="btn sm" data-act="go" data-v="profile">去核对</button></div>
    <div class="list" style="margin-top:6px">
      <div class="li"><span class="note" style="min-width:56px">姓名</span><b class="grow">${esc(b.name || "—")}</b></div>
      <div class="li"><span class="note" style="min-width:56px">手机</span><span class="grow mono">${esc(b.phone || "—")}</span></div>
      <div class="li"><span class="note" style="min-width:56px">邮箱</span><span class="grow mono" style="word-break:break-all">${esc(b.email || "—")}</span></div>
      <div class="li"><span class="note" style="min-width:56px">教育</span><span class="grow">${(p.education || []).map(e => esc(e.school)).join(" · ") || "—"}</span></div>
    </div>
    ${conflicts ? `<div class="callout" style="margin-top:8px">有 ${conflicts} 处不同版本的简历写法不一致（标着「另有版本」），一键填表会原样填进去，请在「报名信息」里改成一个准确的写法。</div>` : `<p class="note" style="margin-top:6px">网申时用的是「报名信息」里的资料，修改请到那里。</p>`}</div>`;
}
/* ---- 报名信息 ---- */
const BASIC = [["name", "姓名"], ["nameEn", "英文名"], ["gender", "性别"], ["birth", "出生年月"], ["phone", "手机"], ["email", "邮箱"], ["wechat", "微信"], ["politics", "政治面貌"], ["ethnicity", "民族"], ["hometown", "籍贯"], ["residence", "现居城市"], ["address", "通讯地址"], ["gradDate", "毕业时间"], ["targetCities", "期望城市"], ["availableDate", "可入职时间"]];
const EDU = [["school", "学校"], ["college", "院系"], ["major", "专业"], ["degree", "学历/学位"], ["start", "开始"], ["end", "结束"], ["gpa", "GPA/成绩"], ["rank", "排名"], ["advisor", "导师"], ["thesis", "论文题目"]];
V.profile = () => {
  const p = S.d.profile || {}; const b = p.basic || {};
  const edu = p.education && p.education.length ? p.education : [{}];
  const qa = p.qa && p.qa.length ? p.qa : [{}];
  return `<div class="head"><div><h1>报名信息</h1><p class="sub">一键填表时用这里的资料。身份证号、银行卡、密码这类信息不在这里存，填表时也会跳过，由你手动填写。</p></div>
    <div class="row">${S.profileDirty ? `<span class="pill warn">有未保存的修改</span>` : ""}<button class="btn" data-act="profileFromResume" ${S.d.resumes.length ? "" : "disabled"}>从简历提取</button><button class="btn primary" data-act="saveProfile">保存</button></div></div>
  <form id="pf" class="stack" data-input="pdirty">
    <section class="sheet"><h2>基本信息</h2><div class="fields">${BASIC.map(([k, l]) => `<label class="f"><span>${l}</span><input type="text" id="b-${k}" name="b.${k}" value="${esc(b[k] || "")}"></label>`).join("")}</div></section>
    <section class="sheet"><div class="row" style="justify-content:space-between"><h2>教育经历</h2><button type="button" class="btn sm" data-act="addEdu">添加一段</button></div>
      ${edu.map((e, i) => `<div class="fields" style="padding:12px 0;border-bottom:1px dashed var(--line)">${EDU.map(([k, l]) => `<label class="f"><span>${l}</span><input type="text" id="e${i}-${k}" name="e.${i}.${k}" value="${esc(e[k] || "")}"></label>`).join("")}
        <div class="row" style="align-items:flex-end"><button type="button" class="btn ghost sm danger" data-act="delEdu" data-i="${i}">删除这段</button></div></div>`).join("")}</section>
    <section class="sheet"><h2>语言、技能、荣誉</h2><div class="grid3">
      <label class="f"><span>语言（如 英语 IELTS 7.5）</span><textarea id="p-languages" name="languages">${esc(p.languages || "")}</textarea></label>
      <label class="f"><span>技能 / 工具</span><textarea id="p-skills" name="skills">${esc(p.skills || "")}</textarea></label>
      <label class="f"><span>获奖荣誉（一行一项）</span><textarea id="p-awards" name="awards">${esc(p.awards || "")}</textarea></label></div></section>
    <section class="sheet"><h2>目标方向</h2><div class="row">${DIRS.map(d => `<label class="row note"><input type="checkbox" name="t" value="${esc(d)}" ${(p.targets || DIRS).includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div></section>
    <section class="sheet"><div class="row" style="justify-content:space-between"><h2>常用问答</h2><button type="button" class="btn sm" data-act="addQA">添加</button></div>
      <p class="note">网申里反复出现的问题，比如「自我评价」「为什么选择我们」「职业规划」。填表时会优先用这里的答案。</p>
      ${qa.map((x, i) => `<div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);padding:8px 0;border-bottom:1px dashed var(--line)"><label class="f"><span>问题</span><input type="text" id="q${i}-q" name="q.${i}.q" value="${esc(x.q || "")}"></label><label class="f"><span>答案</span><textarea id="q${i}-a" name="q.${i}.a" style="min-height:60px">${esc(x.a || "")}</textarea></label></div>`).join("")}</section>
  </form>`;
};
function readProfileForm() {
  const f = $("#pf"); const p = { basic: {}, education: [], qa: [], targets: [] };
  for (const el of f.querySelectorAll("[name]")) {
    const n = el.name, v = (el.value || "").trim();
    if (n === "t") { if (el.checked) p.targets.push(el.value); continue; }
    const parts = n.split(".");
    if (parts[0] === "b") p.basic[parts[1]] = v;
    else if (parts[0] === "e") { (p.education[+parts[1]] = p.education[+parts[1]] || {})[parts[2]] = v; }
    else if (parts[0] === "q") { (p.qa[+parts[1]] = p.qa[+parts[1]] || {})[parts[2]] = v; }
    else p[n] = v;
  }
  p.education = p.education.filter(e => e && Object.values(e).some(Boolean));
  p.qa = p.qa.filter(x => x && (x.q || x.a));
  return p;
}

/* ---- 日程 ---- */
V.calendar = () => {
  const up = upcoming();
  const past = [];
  for (const a of S.d.applications) for (const ev of a.events || []) if (new Date(ev.start).getTime() < Date.now() - 2 * 36e5) past.push({ ...ev, app: a });
  past.sort((x, y) => new Date(y.start) - new Date(x.start));
  return `<div class="head"><div><h1>日程</h1><p class="sub">笔试、面试和测评时间。下载的是含 .ics 的压缩包（网页只能保存这类格式），解压后双击即可加入苹果日历，默认提前 1 天和 1 小时提醒。</p></div>
    <button class="btn" data-act="icsAll" ${up.length ? "" : "disabled"}>导出全部未来日程</button></div>
  <section class="sheet"><h2>即将到来</h2>${up.length ? `<div class="list">${up.map(evRow).join("")}</div>` : `<p class="note">没有未来的日程。</p>`}</section>
  ${past.length ? `<section class="sheet" style="margin-top:16px"><h2>已结束</h2><div class="list">${past.slice(0, 20).map(evRow).join("")}</div></section>` : ""}`;
};
