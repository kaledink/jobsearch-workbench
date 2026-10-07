# 求职工作台（Job Search Workbench）

王馨瑶的个人求职工作台单页应用，运行于 Claude Artifact（https://claude.ai/artifact/EETgWgd5uLWErK2yHLxPSZ）。

- `index.html`：已构建的单页（与线上 Artifact 第 15 版一致）
- `src/`：源文件（part1.html 为样式与骨架；a–d.js 为数据层、视图、详情页、交互）
- `build.sh`：由 `src/` 重新生成 `index.html`（需要 Node.js）

数据（投递记录、经历库、个人资料）存放在 Artifact 的云端数据库中，不在本仓库内。
页面依赖 Artifact 运行时能力（db、user、sample、mcp 内置浏览器），离开 Claude Artifact 环境直接打开时仅能显示界面。
