/* Numbering comes from the single registry embedded by build.sh. */
function priorityName(value) { return String(value || "").replace(/[\s（）()\[\]【】·，,、]/g, "").replace(/(?:有限责任公司|股份有限公司|有限公司)$/, ""); }
function priorityAliases(group) { return [...new Set([group.name, ...group.aliases].map(priorityName).concat(priorityName(group.name).replace(/集团$/, "")))]; }
function priorityGroupOf(row) {
  const name = priorityName(row.name || row.company);
  const exact = PRIORITY_COMPANIES.filter(g => name && priorityAliases(g).includes(name));
  if (exact.length === 1) return { number: exact[0].number, name: exact[0].name, relationship: "集团名称匹配" };
  // Verified parent annotations must have supporting source text retained in the vacancy.
  const parent = row.priorityGroup;
  if (parent?.relationship === "公告确认的成员单位" && row.parentGroupQuote && row.parentGroup && row.priorityNumber === parent.number && PRIORITY_COMPANIES.some(g => g.number === parent.number && priorityAliases(g).includes(priorityName(row.parentGroup)))) return parent;
  if (/大学|学会|协会|银行|保险|证券|期货/.test(name)) return null;
  const possible = PRIORITY_COMPANIES.map(g => ({ group: g, lengths: priorityAliases(g).filter(a => (a.length >= 3 || a === "华润") && name.startsWith(a)).map(a => a.length) })).filter(g => g.lengths.length).map(g => ({ ...g, length: Math.max(...g.lengths) })).sort((a, b) => b.length - a.length);
  if (possible.length && (possible.length === 1 || possible[0].length > possible[1].length)) { const g = possible[0].group; return { number: g.number, name: g.name, relationship: "疑似成员单位，待核实" }; }
  if (row.vacancies?.length) { const groups = row.vacancies.map(priorityGroupOf).filter(Boolean); if (groups.length && groups.every(g => g.number === groups[0].number)) return groups[0]; }
  return null;
}
function priorityBadge(row) { const g = priorityGroupOf(row); if (!g) return ""; const uncertain = g.relationship.startsWith("疑似"); return `<span class="pill ${uncertain ? "warn" : "priority-badge"}">${uncertain ? "重点名单" : "重点央企"} #${g.number}${uncertain ? " · 归属待核实" : ""}</span><div class="t2">${esc(g.relationship)} · ${esc(g.name)}</div>`; }
function priorityCompaniesModal() {
  const meta = S.d.meta || {};
  modal(`<h2>重点企业名单 · 100 家</h2><p class="note">按你提供的序号标注；名单本身不代表正在招聘。校招信息核验后进入公司库，子公司不等同于集团总部。</p><div class="list">${PRIORITY_COMPANIES.map(g => { const count = S.d.companies.filter(c => priorityGroupOf(c)?.number === g.number).length; const check = meta.priorityChecked?.includes(g.number) ? "本轮已访问官网入口" : meta.priorityFailed?.includes(g.number) ? "本轮官网入口未能读取" : "等待重点轮询"; return `<div class="li"><span class="pill priority-badge">#${g.number}</span><div class="grow"><b>${esc(g.name)}</b><div class="note">${count ? `公司库已收录 ${count} 条` : "暂无已核验招聘记录"} · ${check}</div>${g.website ? `<a href="${safeURL(g.website)}" target="_blank" rel="noopener noreferrer">你提供的官网入口</a>` : `<span class="note">官网入口待核实</span>`}</div></div>`; }).join("")}</div><button class="btn" data-act="closeModal">关闭</button>`, true);
}
