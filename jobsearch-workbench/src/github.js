/* GitHub Pages runtime. Only a private repository may hold personal data. */
const GITHUB_API = "https://api.github.com";
const GITHUB_STATE = "workbench/state.json";

function bytes64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
function unbase64(text) { return Uint8Array.from(atob(text.replace(/\s/g, "")), c => c.charCodeAt(0)); }

class GitHubStorage {
  constructor(owner, repo, token) {
    this.owner = owner; this.repo = repo; this.token = token;
    this.root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    this.queue = Promise.resolve(); this.documents = {}; this.fileURLs = [];
  }
  async github(path, options = {}) {
    let response;
    try {
      response = await fetch(GITHUB_API + path, { ...options, cache: "no-store", headers: {
        Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + this.token,
        ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers,
      } });
    } catch (_) { throw new Error("无法连接 GitHub，请检查网络后重试。未确认成功的操作不会显示为已保存。"); }
    if (response.status === 404 && options.missingOK) return null;
    let result = {}; try { result = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "GitHub 令牌无效或已过期，请退出后重新登录。" : response.status === 403 ? "GitHub 拒绝访问：请检查令牌的仓库 Contents 读写权限和请求额度。" : response.status === 404 ? "仓库或文件不存在，或令牌无权访问。" : `GitHub 操作失败（${response.status}），请稍后重试。`);
      error.status = response.status; throw error;
    }
    return result;
  }
  async connect() {
    const repo = await this.github(this.root);
    if (repo.private !== true) throw new Error("数据仓库必须为 Private（私有）。为保护你的记录，工作台拒绝向公开仓库保存资料。");
    if (repo.permissions && repo.permissions.push !== true) throw new Error("此令牌没有数据仓库的写入权限。");
    await this.readState();
  }
  async file(path, missingOK = false) {
    const value = await this.github(this.root + "/contents/" + path.split("/").map(encodeURIComponent).join("/"), { missingOK });
    if (!value) return null;
    if (typeof value.content === "string" && value.encoding === "base64") return { sha: value.sha, bytes: unbase64(value.content) };
    if (!value.sha || Array.isArray(value)) throw new Error("数据仓库中的文件格式异常。");
    const blob = await this.github(this.root + "/git/blobs/" + value.sha);
    return { sha: value.sha, bytes: unbase64(blob.content) };
  }
  async readState() {
    const file = await this.file(GITHUB_STATE, true);
    if (!file) { this.documents = {}; return { documents: {}, sha: null }; }
    let state;
    try { state = JSON.parse(new TextDecoder().decode(file.bytes)); } catch (_) { throw new Error("云端数据文件无法解析。为避免覆盖记录，已停止保存，请先检查版本历史。"); }
    if (!state || state.format !== "jobsearch-workbench-v1" || !state.documents || typeof state.documents !== "object" || Array.isArray(state.documents)) throw new Error("云端数据格式不正确，未执行覆盖。");
    this.documents = state.documents;
    return { documents: state.documents, sha: file.sha };
  }
  serial(task) {
    const result = this.queue.then(task); this.queue = result.catch(() => {}); return result;
  }
  async changeDocuments(change) {
    return this.serial(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const state = await this.readState(); const documents = structuredClone(state.documents);
        change(documents);
        const body = { message: "Save private workbench records", content: bytes64(new TextEncoder().encode(JSON.stringify({ format: "jobsearch-workbench-v1", documents }))), ...(state.sha ? { sha: state.sha } : {}) };
        try {
          await this.github(this.root + "/contents/" + GITHUB_STATE, { method: "PUT", body: JSON.stringify(body) });
          this.documents = documents; return { ok: true };
        } catch (error) { if (![409, 422].includes(error.status) || attempt === 2) throw error; }
      }
    });
  }
  async putFile(file, id = crypto.randomUUID().replace(/-/g, "")) {
    if (!file.size || file.size > 15 * 1024 * 1024) throw new Error("单个文件需大于 0 且不超过 15MB。");
    const path = "workbench/files/" + id;
    const data = new Uint8Array(await file.arrayBuffer());
    const existing = await this.file(path, true);
    await this.serial(() => this.github(this.root + "/contents/" + path, { method: "PUT", body: JSON.stringify({ message: "Save private workbench attachment", content: bytes64(data), ...(existing ? { sha: existing.sha } : {}) }) }));
    const metadata = { name: file.name, mime: file.type || "application/octet-stream", size: file.size, path, createdAt: new Date().toISOString() };
    await this.changeDocuments(docs => { docs["attachments/" + id] = metadata; });
    if (S.db) await S.db.refresh();
    return { id, ...metadata };
  }
  async attachment(id) {
    const metadata = this.documents["attachments/" + id];
    if (!metadata || metadata.path !== "workbench/files/" + id) throw new Error("附件不存在或路径异常。");
    const file = await this.file(metadata.path);
    return { metadata, bytes: file.bytes };
  }
  async backup() {
    const state = await this.readState(); const files = [];
    for (const [path, metadata] of Object.entries(state.documents)) if (path.startsWith("attachments/")) {
      const id = path.split("/")[1]; const file = await this.attachment(id);
      files.push({ id, name: metadata.name, mime: metadata.mime, data: bytes64(file.bytes) });
    }
    return { format: "jobsearch-workbench-v1", documents: state.documents, files };
  }
  async request(path, body, signal) {
    if (path === "/api/state") return this.readState();
    if (path === "/api/status") return { storage: "github-private", ai: { provider: "github", configured: true, lastResult: "untested", search: false } };
    if (path === "/api/document") {
      if (!/^(profile|meta|resumes|experiences|companies|applications|tailored|analyses|queue|attachments)\/[A-Za-z0-9_-]{1,200}$/.test(body.path)) throw new Error("无效的记录路径。");
      return this.changeDocuments(docs => {
        if (body.operation === "delete") delete docs[body.path];
        else if (body.operation === "set") docs[body.path] = body.data;
        else if (body.operation === "update" && docs[body.path]) docs[body.path] = { ...docs[body.path], ...body.data };
        else throw new Error("记录不存在或操作无效。");
      });
    }
    if (path === "/api/backup") return this.backup();
    if (path === "/api/restore") {
      if (body.format !== "jobsearch-workbench-v1" || !body.documents || typeof body.documents !== "object" || Array.isArray(body.documents)) throw new Error("备份格式不正确。");
      for (const [key, value] of Object.entries(body.documents)) if (!/^(profile|meta|resumes|experiences|companies|applications|tailored|analyses|queue|attachments)\/[A-Za-z0-9_-]{1,200}$/.test(key) || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("备份包含无效记录。");
      // Git commit history retains the pre-import state. No force push or reset.
      for (const file of body.files || []) {
        if (!/^[a-f0-9]{32}$/.test(file.id)) throw new Error("备份中的附件标识无效。");
        await this.putFile(new File([unbase64(file.data)], file.name, { type: file.mime }), file.id);
      }
      await this.changeDocuments(docs => Object.assign(docs, body.documents));
      return { count: Object.keys(body.documents).length };
    }
    if (path === "/api/ai") return this.ai(body, signal);
    throw new Error("当前 GitHub 模式不支持此操作。");
  }
  async ai(body, signal) {
    if (body.search) throw new Error("GitHub Models 不提供联网检索。请粘贴招聘或面试资料后分析。");
    const content = [{ type: "text", text: body.prompt }, ...(body.images || []).map(url => ({ type: "image_url", image_url: { url } }))];
    let response;
    try { response = await fetch("https://models.github.ai/inference/chat/completions", { method: "POST", signal, headers: { Authorization: "Bearer " + this.token, "Content-Type": "application/json", Accept: "application/vnd.github+json" }, body: JSON.stringify({ model: "openai/gpt-4.1", messages: [{ role: "system", content: '你是求职助手，只依据输入资料回答，不编造经历。只输出 JSON 对象。' + (body.text ? '将转录结果放在 text 字段。' : '') }, { role: "user", content }], response_format: { type: "json_object" }, max_tokens: 4000 }) }); }
    catch (_) { throw new Error("无法连接 GitHub Models，请检查网络。"); }
    if (!response.ok) throw new Error(response.status === 429 ? "GitHub Models 请求额度已用完，请稍后重试；你的文件已保存在私有仓库。" : "GitHub Models 调用失败，请确认令牌启用了 Models 读取权限，并且账户可用该模型。");
    const result = await response.json(); let value;
    try { value = JSON.parse(result.choices[0].message.content); } catch (_) { throw new Error("AI 返回格式异常，未保存分析，请重试。"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 返回的不是 JSON 对象。");
    return value;
  }
}

function githubLogin(message = "") {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem("workbench-github-repo") || "{}"); } catch (_) {}
  $("#nav").innerHTML = ""; $("#railfoot").textContent = "私人数据 · GitHub 私有仓库";
  $("#main").innerHTML = `<section class="sheet" style="max-width:560px;margin:5vh auto"><h1>连接你的私人工作台</h1><p>记录、原始图片和文件保存在你指定的 GitHub 私有仓库。网页程序不包含个人数据。</p>
    <form id="github-login" class="stack"><label class="f"><span>GitHub 用户名</span><input id="gh-owner" value="${esc(saved.owner || "kaledink")}" required autocomplete="username"></label>
    <label class="f"><span>私人数据仓库名（必须为 Private）</span><input id="gh-repo" value="${esc(saved.repo || "jobsearch-workbench-data")}" required></label>
    <label class="f"><span>GitHub 细粒度访问令牌</span><input id="gh-token" type="password" required autocomplete="off" placeholder="仅限私人数据仓库，Contents 读写；AI 另需 Models 读取"></label>
    <p class="note">令牌仅保存在本页内存中，退出或刷新后需重新输入，不写入仓库。</p>
    <p class="note">首次使用：<a href="https://github.com/new" target="_blank" rel="noopener noreferrer">创建私有数据仓库</a>（可命名 jobsearch-workbench-data），再<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">创建仅授权该仓库的细粒度令牌</a>，选择 Contents 读写；AI 另需 Models 读取。不要把令牌发到聊天中。</p>
    <button class="btn primary" type="submit">登录并读取云端数据</button><p id="gh-error" role="alert">${esc(message)}</p></form></section>`;
  $("#github-login").onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector("button"); button.disabled = true;
    const owner = $("#gh-owner").value.trim(), repo = $("#gh-repo").value.trim(), token = $("#gh-token").value.trim();
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("请检查用户名和仓库名。");
      const driver = new GitHubStorage(owner, repo, token); await driver.connect();
      S.github = driver; S.fatal = "";
      try { localStorage.setItem("workbench-github-repo", JSON.stringify({ owner, repo })); } catch (_) {}
      if (!VIEWS.some(v => v[0] === "files")) VIEWS.push(["files", "文件与图片"]);
      if (!COLLS.includes("attachments")) COLLS.push("attachments");
      S.d.attachments = []; await localBoot();
    } catch (error) { $("#gh-error").textContent = error.message; button.disabled = false; }
  };
}

async function archiveFile(file) {
  if (!S.github) return null;
  return S.github.putFile(file);
}

V.files = () => `<div class="head"><div><h1>文件与图片</h1><p class="sub">原始文件保存在 GitHub 私有仓库，换设备登录后仍可读取。每个文件最大 15MB。</p></div><button class="btn primary" data-act="uploadFiles">上传文件或图片</button></div>
  <div class="sheet">${(S.d.attachments || []).length ? `<div class="list">${S.d.attachments.map(f => `<div class="li"><div class="grow"><b>${esc(f.name)}</b><div class="note">${Math.ceil(f.size / 1024)} KB · ${esc((f.createdAt || "").slice(0, 10))}</div></div>${/^image\/(png|jpeg|webp)$/.test(f.mime) ? `<button class="btn sm" data-act="previewFile" data-id="${f.id}">查看图片</button>` : ""}<button class="btn sm" data-act="downloadFile" data-id="${f.id}">下载原件</button></div>`).join("")}</div>` : `<p class="note">还没有文件。上传简历和招聘截图时，也会在这里保存原件。</p>`}</div>`;

async function uploadCloudFiles() {
  const input = document.createElement("input"); input.type = "file"; input.multiple = true;
  input.onchange = async () => {
    let count = 0;
    try { for (const file of input.files) { await archiveFile(file); count++; } toast(`已保存 ${count} 个文件到私人仓库。`); }
    catch (error) { toast(`已保存 ${count} 个文件；其余未完成：${error.message}`, true); }
  }; input.click();
}

async function openCloudFile(id, preview = false) {
  const { metadata, bytes } = await S.github.attachment(id);
  if (preview && /^image\/(png|jpeg|webp)$/.test(metadata.mime)) {
    const url = URL.createObjectURL(new Blob([bytes], { type: metadata.mime })); S.github.fileURLs.push(url);
    modal(`<h2>${esc(metadata.name)}</h2><img src="${url}" alt="${esc(metadata.name)}" style="max-width:100%;max-height:65vh"><button class="btn" data-act="closeModal">关闭</button>`, true);
  } else browserDownload({ filename: metadata.name, data: new Blob([bytes], { type: metadata.mime }), archived: true });
}

function githubLogout() { if (S.github) { for (const url of S.github.fileURLs) URL.revokeObjectURL(url); S.github.token = ""; } location.reload(); }
