# 求职工作台（Job Search Workbench）

可独立运行的个人求职工作台，也保留 Claude Artifact 运行时兼容。

## GitHub 网站与私人云存储

### 重点 100 家企业与应届生校招

`recruitment/priority_companies.json` 保存用户提供的 1–100 号名单，编号固定。集团网站仅作为检索入口，招聘信息仍须读公告核验；第 22、27 号未提供官网，不猜造网址。

每日优先检索一批 20 家的校招信息，约 5 天轮询完整名单，并额外复核最多 10 家已有投递或 7 天内截止的重点集团。公司库提供“重点 100 家”筛选、完整名单和醒目的序号标签。截止时间仍优先，同一截止时间才优先名单内企业。

名称精确匹配与成员单位归属分别标注；子公司不推定为集团总部。成员关系需公告明确引文，单凭简称前缀只标“疑似成员、待核实”；不凭网页域名推定招聘单位归属。应届生招聘属性也需要原文支持，否则单列待核实。

### 每日招聘：报名截止优先

自动采集工作流放在私有数据仓库，每天北京时间 09:00（UTC `0 1 * * *`）运行，并支持手动运行。GitHub 排队可能导致延迟；是否成功以首页“最近成功更新”及工作流结果为准。

匹配硬性条件后，按明确的报名截止时间从近到远推荐，今天及 3 天内截止标为紧急；同一截止时间再比较匹配度与北京优先，长期招聘或未注明截止时间排后。只保留仍可报名的岗位，关键条件不明的机会放在“待核实”，不计入每天最多 10 条明确推荐。

采集器通过官方公告核对信息，必要时读取公开 PDF/XLSX 附件；无法读取的资格附件会标待核实。GitHub Models 仅用于解释已取得的公告，不承担联网搜索。模型或来源故障会保留已有记录并报告未完成，不伪造招聘机会。工作流使用 `contents: write`、`models: read` 的临时令牌，不使用网页登录令牌；不在日志中输出个人资料。

`recruitment/` 中包含采集器、固定依赖、来源列表和工作流模板；部署时前三项放入私有仓库 `.github/recruitment/`，工作流放入 `.github/workflows/daily-recruitment.yml`。日期统一使用 Asia/Shanghai；同一单位、批次合并，岗位保留独立明细。并发保存发生冲突时重新读取并合并，不覆盖简历、标星、备注或原始附件。

GitHub Pages 版无需运行 Python。网页程序与私人数据分离：Pages 发布文件只含界面和文档解析组件，不含个人记录、图片、数据库或访问令牌。

首次使用需要在自己的 GitHub 账号下创建 **Private** 数据仓库（推荐 `dataofjobmaketing`），并在 GitHub 设置创建细粒度令牌，仅授权该数据仓库的 Contents 读写。若需 AI，再授予 Models 读取权限。网站登录页可直接进入这两个设置页面。不要把令牌发给他人或写入代码、Issue、提交。

登录网站时输入用户名、私有数据仓库名和令牌。令牌只留在当前页面内存中，刷新或退出后重新输入。工作台会检查仓库必须为私有；公开仓库会被拒绝。未登录者只能看到登录页面，不能读取你的私人仓库资料。Pages 网页本身可能公开可见，这不等于私人数据公开。

所有记录保存在私有仓库的 `workbench/state.json`；上传的原始简历、招聘截图、通用文件和导出的简历另存为 `workbench/files/` 下的附件，可在「文件与图片」页查看和下载。单个文件最大 15MB。修改记录保留 Git 提交历史；完整 JSON 备份包含附件。GitHub 仓库有存储和 API 额度限制，不适合作为无限容量网盘。

GitHub Pages 无法运行 Codex CLI。此模式通过 GitHub Models 调用 `openai/gpt-4.1`，是否可用受账户权限和配额限制，需点击「测试 AI 连接」实际验证；不会复用云环境中已登录的 Codex。GitHub Models 模式暂不支持联网岗位检索和联网面试研究。

发布前运行 `sh build.sh`、`python3 prepare_assets.py`，再使用 `python3 publish_site.py /path/to/new-output` 生成只含静态程序的发布目录。将其发布到 `gh-pages` 分支，然后在仓库 Settings → Pages 中选择 **Deploy from a branch → gh-pages → /(root)**。私有源码仓库是否支持 Pages 取决于你的 GitHub 计划；不要为了启用 Pages 将含个人数据的仓库改成公开。

GitHub 模式检查：在仓库根目录运行 `python3 tests/github_smoke.py`。该测试模拟 GitHub/Models API，验证拒绝公开数据仓库、云端保存与重新登录读取、并发冲突合并、图片上传/预览/原件下载、含附件的备份，以及令牌不进入本地持久存储或提交。它不证明真实 Pages 已发布或 AI 已联网。

- `index.html`：已构建的单页（与线上 Artifact 第 15 版一致）
- `src/`：源文件（part1.html 为样式与骨架；a–d.js 为数据层、视图、详情页、交互；standalone.js 为独立运行适配）
- `build.sh`：由 `src/` 重新生成 `index.html`（需要 Node.js）

## 独立启动

需要 Python 3.10+。在本目录运行：

```sh
sh start.sh
```

服务仅监听本机 8002 端口。首次启动从 npm 下载原版本的 PDF、Word、Excel 组件，并验证固定 SHA-512 校验和；之后可以离线使用文档功能。不要双击 index.html 或使用普通静态服务器代替此服务。

可用功能：投递增删改、公司库 CSV/Excel 导入、TXT/Markdown/PDF/DOCX 简历读取、经历和报名资料管理、日程与日历文件导出、定制简历 Markdown/Word 导出、完整数据备份和恢复。AI 连通后可整理简历、分析岗位匹配、改写定制简历、识别通知时间及截图；Codex 模式还可联网准备面试和手动检索岗位。

默认数据文件为仓库根目录的 `.workbench/workbench.sqlite3`，已被 Git 忽略。关闭网页和重启服务不会清空数据。服务启动时、导入备份前自动生成 JSON 备份，保留最近 30 份。请定期在「数据与 AI 设置」中下载完整备份；删除工作区或更换云机器前务必导出。自定义数据目录：

```sh
sh start.sh --port 8002 --data-dir /path/to/persistent-data
```

这是本机单用户应用，未提供多用户账号或公网部署能力，不要直接对公网暴露数据接口。

## AI 配置

默认使用服务端 Codex CLI，复用已登录的账户：

```sh
# 如果尚未安装 Codex CLI（需要 Node.js/npm）：
# npm install -g @openai/codex
codex login
codex login status
sh start.sh
```

页面左下角「数据与 AI 设置」可实际测试连接。安装 CLI 不等于 AI 已连通；需允许访问 `chatgpt.com`，且 Codex 运行时目录可写。云网络代理返回 403 时需调整环境设置；页面会显示实际错误，不生成虚假结果。AI 请求仅在你点击相应功能时发送；最多同时处理一个任务，超时 4 分钟。简历、经历及岗位相关资料会发送给所选 AI 提供方。

也支持服务端 OpenAI API：在启动服务的终端环境中安全配置 `OPENAI_API_KEY`，并设置 `WORKBENCH_AI_PROVIDER=openai`。默认模型为 `gpt-4.1-mini`，可通过 `WORKBENCH_AI_MODEL` 指定账户可用的模型。Codex 也支持此模型变量，但应填写 Codex 支持的名称。密钥仅保留在服务端，不写入页面、数据库或备份。OpenAI 接口模式需要 `api.openai.com`，暂不支持联网检索。

旧版 Artifact 云数据库中的数据不在 Git 仓库内，也不会自动恢复。可通过独立版 JSON 备份导入已有数据，公司表格可通过 CSV/Excel 导入。新版本不会填充虚构的历史记录。

跨网站自动填表和飞书登录同步仍需要原 Artifact 浏览器环境；独立版提供资料逐项复制、招聘页新窗口打开和飞书表格导入。网页内的检索和待处理分析需手动执行；每日招聘由私有仓库的 Actions 工作流单独运行。

## 开发和验证

修改 src 后运行 `sh build.sh`（需要 Node.js）；提交对应 index.html。使用现有隔离检出，不需创建 Git worktree。

在仓库根目录运行：

```sh
python3 -m unittest discover -s tests -v
python3 tests/browser_smoke.py
```

第二个检查需要 Python Playwright 和 `/usr/bin/chromium`，当前云环境已提供。它使用临时数据库及固定 AI 响应，验证资料保存、公司导入、简历读取、分析结果保存、Word/日历导出及备份；不代表真实 AI 已连通。真实连接应单独使用页面测试按钮验证。
