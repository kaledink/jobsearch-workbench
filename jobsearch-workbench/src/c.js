/* ============ application detail ============ */
const APP_TABS = [["match", "匹配分析"], ["tailor", "定制简历"], ["fill", "辅助填表"], ["prep", "面试准备"], ["track", "进度与日程"]];
function viewApp(a) {
  const t = S.appTab;
  return `<button class="back" data-act="closeApp">← 返回投递列表</button>
  <div class="head" style="margin-top:8px"><div class="grow"><div class="eyebrow">${esc(a.category || a.nature || "投递")}</div><h1>${esc(a.company || "未命名公司")}</h1>
    <p class="sub">${esc(posSummary(a))}${a.city ? " · " + esc(a.city) : ""}${a.url ? ` · <a href="${esc(a.url)}" target="_blank" rel="noopener">打开招聘页</a>` : ""}</p></div>
    <div class="row"><select data-change="status" data-id="${a.id}" aria-label="投递状态" style="width:auto">${STATUSES.map(s => `<option ${s === (a.status || "待投递") ? "selected" : ""}>${s}</option>`).join("")}</select>
    <button class="btn" data-act="editApp" data-id="${a.id}">编辑信息</button></div></div>
  ${positionsPanel(a)}
  ${extrasPanel(a)}
  <div class="tabs" role="tablist">${APP_TABS.map(([k, l]) => `<button role="tab" data-act="appTab" data-t="${k}" aria-selected="${t === k}">${l}</button>`).join("")}</div>
  ${({ match: tabMatch, tailor: tabTailor, fill: tabFill, prep: tabPrep, track: tabTrack }[t] || tabMatch)(a)}`;
}
function posSummary(a) {
  const ps = a.positions || [];
  if (!ps.length) return a.role || "岗位待确认";
  return ps.map(p => [p.order, p.title, p.unit].filter(Boolean).join(" ")).join("；");
}
function positionsPanel(a) {
  const ps = a.positions || [];
  return `<section class="sheet" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h2 style="margin:0">投递的岗位 <span class="note mono">${ps.length}</span></h2>${a.resumeNo ? `<span class="note">简历编号 <b class="mono">${esc(a.resumeNo)}</b></span>` : ""}${a.limit ? `<span class="note">${esc(a.limit)}</span>` : ""}</div>
    ${ps.length ? `<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>志愿/类别</th><th>岗位</th><th>单位/分行</th><th>状态</th><th>投递时间</th><th></th></tr></thead><tbody>${ps.map(p => `<tr><td>${esc(p.order || "")}</td><td><div class="t1">${esc(p.title || "")}</div>${p.note ? `<div class="t2">${esc(p.note)}</div>` : ""}</td><td>${esc(p.unit || "")}${p.city ? `<div class="t2">${esc(p.city)}</div>` : ""}</td><td>${statusPill(p.status || a.status || "已投递")}</td><td class="mono">${esc((p.at || "").slice(0, 16).replace("T", " "))}</td><td><button class="btn ghost sm danger" data-act="delPos" data-app="${a.id}" data-x="${p.id}">删除</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="note" style="margin-top:6px">还没记录具体岗位。</p>`}
    <div class="grid2" style="margin-top:8px;gap:8px"><label class="f"><span>志愿/类别</span><input type="text" id="ps-o-${a.id}" placeholder="如 第1志愿、菁英管培生"></label><label class="f"><span>岗位名称</span><input type="text" id="ps-t-${a.id}" placeholder="如 综合类"></label>
    <label class="f"><span>单位/分行</span><input type="text" id="ps-u-${a.id}" placeholder="如 总行"></label><label class="f"><span>备注</span><input type="text" id="ps-n-${a.id}" placeholder="可留空"></label></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="addPos" data-id="${a.id}">添加岗位</button></div></section>`;
}
function extrasPanel(a) {
  const xs = a.extras || [];
  return `<section class="sheet" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h2 style="margin:0">我补充的关键信息 <span class="note mono">${xs.length}</span></h2><span class="note">匹配分析、定制简历、面试准备、填表都会参考这里，优先级高于网页抓取的 JD</span></div>
    ${xs.length ? `<div class="list" style="margin-top:8px">${xs.map((x, i) => `<div class="li"><span class="date-tag">${esc((x.at || "").slice(5, 10).replace("-", "/"))}</span><div class="grow" style="white-space:pre-wrap">${esc(x.text.length > 600 ? x.text.slice(0, 600) + "…" : x.text)}</div><button class="btn ghost sm danger" data-act="delExtra" data-app="${a.id}" data-x="${x.id}">删除</button></div>`).join("")}</div>` : ""}
    <label class="f" style="margin-top:8px"><span>粘贴补充（面经、宣讲会要点、HR 说的话、岗位内部信息、你自己的判断……随时可以加）</span><textarea id="ex-${a.id}" style="min-height:70px"></textarea></label>
    <div class="row" style="margin-top:8px"><button class="btn primary sm" data-act="addExtra" data-id="${a.id}">添加补充</button>${a.match ? `<span class="note">加完后可在「匹配分析」里点「重新分析」</span>` : ""}</div></section>`;
}
function gauge(score) {
  const r = 46, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score)) / 100;
  const col = score >= 75 ? "var(--ok)" : score >= 55 ? "var(--warn)" : "var(--bad)";
  return `<svg class="gauge" viewBox="0 0 108 108" role="img" aria-label="匹配度 ${score}"><circle cx="54" cy="54" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="9"/>
  <circle cx="54" cy="54" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 54 54)"/>
  <text x="54" y="60" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="26" fill="var(--ink)">${score}</text></svg>`;
}
function tabMatch(a) {
  const m = a.match; const busy = S.busy["match-" + a.id];
  const jdBox = `<section class="sheet"><div class="row" style="justify-content:space-between"><h2>岗位描述（JD）</h2><div class="row">
      ${S.hostOK && a.url ? `<button class="btn sm" data-act="fetchJD" data-id="${a.id}">${S.busy["jd-" + a.id] ? `<span class="spin"></span> 读取中` : "从招聘页读取"}</button>` : ""}
      <button class="btn sm" data-act="saveJD" data-id="${a.id}">保存 JD</button></div></div>
    <textarea id="jd-${a.id}" style="min-height:160px" placeholder="把岗位职责和任职要求粘贴到这里${S.hostOK ? "，或点「从招聘页读取」" : ""}">${esc(a.jd || "")}</textarea></section>`;
  const runBtn = `<button class="btn primary" data-act="runMatch" data-id="${a.id}" ${busy ? "disabled" : ""}>${busy ? `<span class="spin"></span> 分析中…` : m ? "重新分析" : "分析匹配度"}</button>`;
  if (!m) return `<div class="stack">${jdBox}<div class="empty"><h3>还没有匹配分析</h3><p>${S.d.experiences.length ? "有了 JD 后，AI 会对照你的经历库打分，列出优势、短板和最该突出的经历。" : "先到「简历与经历」上传简历并整理经历库，匹配分析才有依据。"}</p><div style="margin-top:10px">${runBtn}</div></div></div>`;
  const exps = (m.recommend || []).map(r => ({ ...r, e: byId("experiences", r.expId) })).filter(r => r.e);
  return `<div class="stack">
  <section class="sheet"><div class="row" style="gap:20px;align-items:center">${gauge(m.score)}<div class="grow"><div class="eyebrow">匹配度 · ${esc((m.at || "").slice(0, 10))}</div><h2 style="margin-top:4px">${esc(m.verdict || "")}</h2>
    <div class="grid2" style="gap:8px 20px">${(m.dims || []).map(d => `<div><div class="row" style="justify-content:space-between"><span>${esc(d.name)}</span><span class="score ${scoreCls(d.score)}">${d.score}</span></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, d.score))}%"></i></div>${d.note ? `<div class="note">${esc(d.note)}</div>` : ""}</div>`).join("")}</div></div>${runBtn}</div></section>
  ${(m.hardChecks || []).length ? `<section class="sheet"><h2>硬性条件核对</h2><div class="list">${m.hardChecks.map(h => `<div class="li"><span class="pill ${h.status === "满足" ? "ok" : h.status === "不满足" ? "bad" : "warn"}">${esc(h.status)}</span><div class="grow"><b>${esc(h.item)}</b>${h.note ? `<div class="note">${esc(h.note)}</div>` : ""}</div></div>`).join("")}</div></section>` : ""}
  <div class="grid2"><section class="sheet"><h2>优势</h2>${md((m.strengths || []).map(s => "- " + s).join("\n"))}</section><section class="sheet"><h2>短板与对策</h2>${md((m.gaps || []).map(s => "- " + s).join("\n"))}</section></div>
  <section class="sheet"><h2>建议突出的经历</h2>${exps.length ? `<div class="list">${exps.map(r => `<div class="li"><div class="grow"><b>${esc(r.e.org)}</b> · ${esc(r.e.role || "")}<div class="note">${esc(r.reason)}</div></div></div>`).join("")}</div>` : `<p class="note">没有特别推荐的经历。</p>`}
    ${(m.keywords || []).length ? `<div class="row" style="margin-top:10px">${m.keywords.map(k => `<span class="pill acc">${esc(k)}</span>`).join("")}</div>` : ""}
    <div style="margin-top:12px"><button class="btn" data-act="appTab" data-t="tailor">用这些经历生成定制简历 →</button></div></section>
  ${jdBox}</div>`;
}

/* ---- tailored resume ---- */
function lcsDiff(a, b) {
  a = [...a]; b = [...b];
  if (a.length * b.length > 250000) return `<del>${esc(a.join(""))}</del><br><ins>${esc(b.join(""))}</ins>`;
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = "", buf = "", mode = "";
  const flush = () => { if (!buf) return; out += mode === "d" ? `<del>${esc(buf)}</del>` : mode === "i" ? `<ins>${esc(buf)}</ins>` : esc(buf); buf = ""; };
  const push = (md, ch) => { if (md !== mode) { flush(); mode = md; } buf += ch; };
  while (i < n && j < m) { if (a[i] === b[j]) { push("", a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { push("d", a[i]); i++; } else { push("i", b[j]); j++; } }
  while (i < n) push("d", a[i++]); while (j < m) push("i", b[j++]); flush();
  return out;
}
function tailoredDoc(a) { return S.d.tailored.find(t => t.id === a.id); }
function tabTailor(a) {
  const td = tailoredDoc(a); const busy = S.busy["tailor-" + a.id];
  const rec = new Set(((a.match || {}).recommend || []).map(r => r.expId));
  const sel = S.tailorSel[a.id] || (td && td.expIds) || (rec.size ? [...rec] : S.d.experiences.map(e => e.id));
  S.tailorSel[a.id] = sel;
  const picker = `<section class="sheet"><h2>选择这次要用的经历</h2><p class="note">参考 JobHuntBot 的做法：每次投递挑 2–4 段最相关的经历重点写。${rec.size ? "已按匹配分析预选。" : ""}</p>
    <div class="list">${S.d.experiences.map(e => `<label class="li" style="cursor:pointer"><input type="checkbox" data-change="tsel" data-app="${a.id}" value="${e.id}" ${sel.includes(e.id) ? "checked" : ""}><div class="grow"><b>${esc(e.org)}</b> · ${esc(e.role || "")} <span class="note">${esc(EXP_TYPES[e.type] || "")}</span>${rec.has(e.id) ? ` <span class="pill acc">推荐</span>` : ""}</div></label>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="runTailor" data-id="${a.id}" ${busy || (!a.jd && !extrasText(a)) ? "disabled" : ""}>${busy ? `<span class="spin"></span> 改写中…` : td ? "重新生成" : "生成定制版"}</button>${a.jd || extrasText(a) ? "" : `<span class="note">先补上 JD 或关键信息。</span>`}</div></section>`;
  if (!S.d.experiences.length) return `<div class="empty"><h3>经历库是空的</h3><p>先上传简历并整理经历库。</p></div>`;
  if (!td) return `<div class="stack">${picker}<div class="callout info">改写只调整措辞、顺序和关键词，不增删事实，时间、机构、数字一律不变。每一处改动都会标出原文、新文和原因，你可以逐条接受或还原。</div></div>`;
  const acc = td.accepted || {};
  let changed = 0, total = 0;
  const items = (td.items || []).map(it => {
    const e = byId("experiences", it.expId); if (!e) return "";
    return `<div style="margin-top:14px"><h3>${esc(e.org)} · ${esc(e.role || "")} <span class="note mono">${esc(e.start || "")}–${esc(e.end || "")}</span></h3>
    ${(it.bullets || []).map(bl => { const orig = (e.bullets || [])[bl.i]; if (orig === undefined) return ""; total++; const isCh = bl.changed && bl.new && bl.new !== orig; if (isCh) changed++; const key = it.expId + ":" + bl.i; const on = isCh && acc[key] !== false;
      return `<div class="bullet">${isCh ? `<input type="checkbox" aria-label="接受这处改动" data-change="tacc" data-app="${a.id}" data-k="${key}" ${on ? "checked" : ""}>` : `<span class="pill">未改</span>`}
        <div>${isCh ? `<div class="diff">${lcsDiff(orig, bl.new)}</div><div class="why">${esc(bl.reason || "")}</div>${on ? "" : `<div class="note">已还原为原文</div>`}` : `<div>${esc(orig)}</div>`}</div></div>`; }).join("")}</div>`;
  }).join("");
  return `<div class="stack">
  <section class="sheet"><div class="row" style="justify-content:space-between"><div><h2>定制版 · ${esc(a.company)}</h2><p class="note">${total} 条要点中改动了 ${changed} 条。绿色是新增的措辞，红色是删去的措辞；取消勾选即还原原文。</p></div>
    <div class="row"><button class="btn" data-act="exportMd" data-id="${a.id}">导出 Markdown</button><button class="btn primary" data-act="exportDocx" data-id="${a.id}">导出 Word</button></div></div>
    ${td.notes ? `<div class="callout info" style="margin-top:8px">${esc(td.notes)}</div>` : ""}
    ${td.summary && td.summary.text ? `<div style="margin-top:14px"><h3>个人概述（新增）</h3><p style="margin:0">${esc(td.summary.text)}</p><div class="why">${esc(td.summary.reason || "")}</div></div>` : ""}
    ${items}</section>${picker}</div>`;
}
function tailoredContent(a) {
  const td = tailoredDoc(a); const acc = (td && td.accepted) || {};
  const ids = (td && td.items ? td.items.map(i => i.expId) : S.d.experiences.map(e => e.id));
  return ids.map(id => byId("experiences", id)).filter(Boolean).map(e => {
    const it = td && (td.items || []).find(x => x.expId === e.id);
    const bullets = (e.bullets || []).map((b, i) => { const bl = it && (it.bullets || []).find(x => x.i === i); const key = e.id + ":" + i; return bl && bl.changed && bl.new && acc[key] !== false ? bl.new : b; });
    return { e, bullets };
  });
}

/* ---- fill ---- */
function tabFill(a) {
  const k = "fill-" + a.id; const st = S.fill && S.fill.app === a.id ? S.fill : null;
  if (!S.hostOK) return `<div class="empty"><h3>需要在 Claude 桌面 App 里使用</h3><p>一键填表通过 App 自带的内置浏览器完成。请在 Claude 桌面 App 中打开这个页面；在手机或普通浏览器里这个功能不可用。<br>也可以直接在对话里对 Claude 说「帮我填 ${esc(a.company)} 的网申」。</p></div>`;
  return `<div class="stack">
  <section class="sheet"><h2>怎么用</h2><ol style="margin:0;padding-left:20px">
    <li>点「打开招聘页」，内置浏览器会在 App 侧边打开 ${a.url ? "这条投递的网址" : "你填写的网址"}。需要登录的网申系统，请先在那里手动登录。</li>
    <li>翻到要填的那一页表单，回到这里点「读取并匹配当前页」。</li>
    <li>核对下面列出的每一项，确认后点「写入表单」。多页表单每页重复第 2–3 步。</li>
    <li>提交按钮永远由你自己点。</li></ol>
    <div class="row" style="margin-top:12px"><input type="url" id="fill-url" value="${esc(a.url || "")}" placeholder="网申页面网址" class="grow" style="max-width:420px">
      <button class="btn" data-act="fillOpen" data-id="${a.id}">打开招聘页</button>
      <button class="btn primary" data-act="fillScan" data-id="${a.id}" ${S.busy[k] ? "disabled" : ""}>${S.busy[k] === "scan" ? `<span class="spin"></span> 读取中…` : "读取并匹配当前页"}</button></div>
    ${(S.logs[k] || []).length ? `<div class="log" id="log-${k}" style="margin-top:10px">${esc(S.logs[k].join("\n"))}</div>` : `<div class="log" id="log-${k}" hidden></div>`}</section>
  ${st && st.fills ? `<section class="sheet"><div class="row" style="justify-content:space-between"><h2>准备写入 ${st.fills.filter(f => f.on).length} 项</h2>
     <button class="btn primary" data-act="fillApply" data-id="${a.id}" ${S.busy[k] ? "disabled" : ""}>${S.busy[k] === "apply" ? `<span class="spin"></span> 写入中…` : "写入表单"}</button></div>
     <div class="list">${st.fills.map((f, i) => `<label class="li"><input type="checkbox" data-change="fillOn" data-i="${i}" ${f.on ? "checked" : ""}><div class="grow"><b>${esc(f.label)}</b> <span class="note mono">${esc(f.ref)}</span><div>${esc(f.value)}</div>${f.done ? `<span class="pill ${f.done === "ok" ? "ok" : "bad"}">${f.done === "ok" ? "已写入" : esc(f.done)}</span>` : ""}</div></label>`).join("")}</div>
     ${(st.skipped || []).length ? `<h3 style="margin-top:14px">需要你自己填的</h3><div class="list">${st.skipped.map(s => `<div class="li"><div class="grow"><b>${esc(s.label)}</b><div class="note">${esc(s.reason)}</div></div></div>`).join("")}</div>` : ""}</section>` : ""}
  </div>`;
}

/* ---- interview prep ---- */
function tabPrep(a) {
  const an = S.d.analyses.find(x => x.id === a.id); const k = "prep-" + a.id; const busy = S.busy[k];
  const queued = S.d.queue.find(q => q.applicationId === a.id && q.type === "deep" && q.status !== "done");
  const controls = `<div class="row">${S.hostOK ? `<button class="btn primary" data-act="runDeep" data-id="${a.id}" ${busy ? "disabled" : ""}>${busy ? `<span class="spin"></span> 联网分析中…` : an ? "重新深度分析" : "深度分析"}</button>` : ""}
    ${busy ? `<button class="btn" data-act="stopDeep">停止</button>` : ""}
    <button class="btn" data-act="queueDeep" data-id="${a.id}" ${queued ? "disabled" : ""}>${queued ? "已交给 Claude，排队中" : "交给 Claude 联网分析"}</button></div>
    <p class="note">${S.hostOK ? "「深度分析」在本页用内置浏览器检索（约 2–5 分钟）；「交给 Claude」会在每日任务或你在对话里说「处理求职队列」时完成，检索更全面。" : "当前不在 Claude 桌面 App 中，可交给 Claude 联网分析。"}</p>
    <div class="log" id="log-${k}" ${(S.logs[k] || []).length ? "" : "hidden"}>${esc((S.logs[k] || []).join("\n"))}</div>`;
  if (!an) return `<div class="stack"><section class="sheet"><h2>面试深度分析</h2><p class="note">结合你的经历、这家公司和这个岗位，生成：1 分钟和 3 分钟自我介绍、行业现状、业务方向、竞品对比、岗位解读、12–18 个预测问题及答题要点、反问清单，并附上信息来源。</p>${controls}</section></div>`;
  const s = an;
  return `<div class="stack"><section class="sheet"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${s.by === "claude" ? "Claude 联网分析" : "本页内置浏览器分析"} · ${esc((s.at || "").slice(0, 16).replace("T", " "))}</div><h2 style="margin-top:4px">面试准备 · ${esc(a.company)}</h2></div></div>${controls}</section>
  <div class="grid2"><section class="sheet"><h2>1 分钟自我介绍</h2>${md(s.intro1)}</section><section class="sheet"><h2>3 分钟自我介绍</h2>${md(s.intro3)}</section></div>
  ${s.introEn ? `<section class="sheet"><h2>英文自我介绍</h2>${md(s.introEn)}</section>` : ""}
  <div class="grid2"><section class="sheet"><h2>行业现状</h2>${md(s.industry)}</section><section class="sheet"><h2>业务方向与近期动态</h2>${md(s.business)}</section></div>
  <div class="grid2"><section class="sheet"><h2>竞品 / 同类机构对比</h2>${(s.competitors || []).length ? `<div class="list">${s.competitors.map(c => `<div class="li"><div class="grow"><b>${esc(c.name)}</b><div>${esc(c.compare)}</div></div></div>`).join("")}</div>` : `<p class="note">未查到。</p>`}</section><section class="sheet"><h2>岗位解读</h2>${md(s.role)}</section></div>
  <section class="sheet"><h2>预测面试问题 <span class="note mono">${(s.questions || []).length}</span></h2>${(s.questions || []).map(q => `<details class="q"><summary>${esc(q.q)} <span class="pill">${esc(q.type || "")}</span></summary><div class="note" style="margin-top:6px">考察：${esc(q.intent || "")}</div>${md(q.hint)}</details>`).join("")}</section>
  ${(s.ask || []).length ? `<section class="sheet"><h2>可以反问的问题</h2>${md(s.ask.map(x => "- " + x).join("\n"))}</section>` : ""}
  ${(s.sources || []).length ? `<section class="sheet"><h2>信息来源</h2><ul style="margin:0;padding-left:18px">${s.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a></li>`).join("")}</ul></section>` : ""}
  </div>`;
}

/* ---- track ---- */
function tabTrack(a) {
  const evs = (a.events || []).slice().sort((x, y) => new Date(x.start) - new Date(y.start));
  return `<div class="grid2"><section class="sheet"><div class="row" style="justify-content:space-between"><h2>日程</h2><button class="btn sm" data-act="schedule" data-id="${a.id}">添加笔试/面试</button></div>
    ${evs.length ? `<div class="list">${evs.map(ev => `<div class="li"><div class="date-tag"><b>${new Date(ev.start).getMonth() + 1}/${new Date(ev.start).getDate()}</b>${hm(new Date(ev.start))}</div><div class="grow"><b>${esc(ev.type)}</b><div class="note">${esc(ev.location || "")}</div>${ev.note ? `<div class="note">${esc(ev.note)}</div>` : ""}</div><button class="btn sm" data-act="ics1" data-app="${a.id}" data-ev="${ev.id}">日历文件</button><button class="btn ghost sm danger" data-act="delEv" data-app="${a.id}" data-ev="${ev.id}">删除</button></div>`).join("")}</div>` : `<p class="note">还没有日程。</p>`}</section>
  <section class="sheet"><h2>状态记录</h2>${(a.history || []).length ? `<div class="list">${a.history.slice().reverse().map(h => `<div class="li"><span class="date-tag">${esc((h.at || "").slice(0, 10))}</span><div class="grow">${statusPill(h.status)}</div></div>`).join("")}</div>` : `<p class="note">状态变化会记录在这里。</p>`}
    <label class="f" style="margin-top:12px"><span>备注</span><textarea id="notes-${a.id}">${esc(a.notes || "")}</textarea></label><div style="margin-top:8px"><button class="btn sm" data-act="saveNotes" data-id="${a.id}">保存备注</button></div></section></div>`;
}

/* ============ modals ============ */
function modal(html, wide) { $("#modal").innerHTML = `<div class="modal-bg" data-act="modalBg"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`; const f = $("#modal input,#modal textarea,#modal select"); if (f) f.focus(); }
function closeModal() { $("#modal").innerHTML = ""; S.sched = null; }
function newAppModal(pre = {}) {
  modal(`<h2>新增投递</h2>
  <label class="f"><span>招聘网址（官网岗位页或网申入口）</span><input type="url" id="na-url" value="${esc(pre.url || "")}" placeholder="https://"></label>
  <div class="fields"><label class="f"><span>公司</span><input type="text" id="na-co" value="${esc(pre.company || "")}" placeholder="可留空，自动识别"></label>
  <label class="f"><span>岗位</span><input type="text" id="na-role" value="${esc(pre.role || "")}" placeholder="可留空，自动识别"></label></div>
  <label class="f"><span>岗位描述（可选）</span><textarea id="na-jd" placeholder="${S.hostOK ? "留空的话，会用内置浏览器打开网址自动读取" : "把岗位职责和任职要求粘贴到这里，用于匹配分析"}"></textarea></label>
  <label class="row note"><input type="checkbox" id="na-run" checked> 创建后立即分析匹配度</label>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="createApp" data-co="${esc(pre.companyId || "")}">创建</button></div>`);
}
function expModal(e = {}) {
  modal(`<h2>${e.id ? "编辑经历" : "添加经历"}</h2>
  <div class="fields"><label class="f"><span>类型</span><select id="x-type">${Object.entries(EXP_TYPES).map(([k, v]) => `<option value="${k}" ${e.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
  <label class="f"><span>机构</span><input type="text" id="x-org" value="${esc(e.org || "")}"></label><label class="f"><span>角色/职位</span><input type="text" id="x-role" value="${esc(e.role || "")}"></label>
  <label class="f"><span>开始（如 2024-07）</span><input type="text" id="x-start" value="${esc(e.start || "")}"></label><label class="f"><span>结束（至今可写「至今」）</span><input type="text" id="x-end" value="${esc(e.end || "")}"></label>
  <label class="f"><span>地点</span><input type="text" id="x-loc" value="${esc(e.location || "")}"></label></div>
  <label class="f"><span>要点（一行一条）</span><textarea id="x-bullets" style="min-height:140px">${esc((e.bullets || []).join("\n"))}</textarea></label>
  <div class="row">${DIRS.map(d => `<label class="row note"><input type="checkbox" name="x-tag" value="${esc(d)}" ${(e.tags || []).includes(d) ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div>
  <div class="row" style="justify-content:space-between">${e.id ? `<button class="btn danger" data-act="delExp" data-id="${e.id}">删除这段经历</button>` : "<span></span>"}<div class="row"><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveExp" data-id="${e.id || ""}">保存</button></div></div>`, true);
}
const CO_FIELDS = [["name", "公司"], ["category", "方向"], ["industry", "行业"], ["nature", "性质"], ["batch", "批次"], ["roles", "岗位"], ["cities", "城市"], ["openDate", "开放日期"], ["deadline", "截止日期 (YYYY-MM-DD)"], ["url", "投递链接"], ["notes", "备注"]];
function coModal(c = {}) {
  modal(`<h2>${c.id ? "编辑公司" : "添加公司"}</h2><div class="fields">${CO_FIELDS.map(([k, l]) => k === "category"
    ? `<label class="f"><span>${l}</span><select id="co-${k}"><option value="">未分类</option>${DIRS.map(d => `<option ${c.category === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></label>`
    : `<label class="f"><span>${l}</span><input type="text" id="co-${k}" value="${esc(c[k] || "")}"></label>`).join("")}</div>
  <div class="row" style="justify-content:space-between">${c.id ? `<button class="btn danger" data-act="delCo" data-id="${c.id}">从公司库删除</button>` : "<span></span>"}<div class="row"><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveCo" data-id="${c.id || ""}">保存</button></div></div>`, true);
}
function scheduleModal(a, stage) {
  S.sched = { app: a.id, stage: stage || a.status, slots: [], pick: -1, location: "", note: "" };
  drawSchedule();
}
function drawSchedule() {
  const s = S.sched; const a = appById(s.app); if (!a) return;
  modal(`<h2>${esc(a.company)} · ${esc(s.stage)}时间</h2>
  <label class="f"><span>粘贴通知邮件或短信（可选）</span><textarea id="sc-text" placeholder="把笔试/面试通知原文贴进来，AI 会识别其中的可选时间"></textarea></label>
  <div class="row"><button class="btn" data-act="scParse" ${S.busy.sc ? "disabled" : ""}>${S.busy.sc ? `<span class="spin"></span> 识别中` : "识别时间"}</button></div>
  ${s.slots.length ? `<div class="list">${s.slots.map((x, i) => `<label class="li" style="cursor:pointer"><input type="radio" name="sc-pick" data-change="scPick" value="${i}" ${s.pick === i ? "checked" : ""}><div class="grow"><b class="mono">${esc(x.start.replace("T", " "))}${x.end ? " – " + esc(x.end.slice(11)) : ""}</b><div class="note">${esc(x.label || "")}</div></div></label>`).join("")}</div>` : ""}
  <div class="fields"><label class="f"><span>或手动填写开始时间</span><input type="datetime-local" id="sc-start"></label><label class="f"><span>时长（分钟）</span><input type="number" id="sc-mins" value="60" min="10" step="10"></label></div>
  <label class="f"><span>地点 / 会议链接</span><input type="text" id="sc-loc" value="${esc(s.location)}"></label>
  <label class="f"><span>备注（携带材料、平台、着装等）</span><input type="text" id="sc-note" value="${esc(s.note)}"></label>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">稍后再说</button><button class="btn" data-act="scSave" data-dl="0">只保存</button><button class="btn primary" data-act="scSave" data-dl="1">保存并下载日历文件</button></div>`);
}
