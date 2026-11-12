# agent-skills

可复用 Agent 技能的集合：**一个目录一个技能**，目录名与 `SKILL.md` frontmatter 里的 `name` 一致。

| 技能 | 作用 |
| --- | --- |
| [`code-map`](code-map/) | 给任意仓库建立确定性代码地图：符号索引 + 导入级引用图 + 枢纽排序，配 `--find` / `--outline` / `--map` / `--check` CLI；一个目录多个工程时每个工程各生成一份，根目录只留一张登记表（`codemap-workspace.mjs`） |
| [`agent-scaffold`](agent-scaffold/) | 给工程/工作区搭路由式 Agent 文件体系：≤60 行 `AGENTS.md` 路由 + `agent/` 索引、9 条规则（含受众与措辞）、5 个阶段 playbook（创建/实现/调试/优化/归档）、调研与归档索引、多工程隔离；新工程 `init`、旧工程 `migrate audit→plan→apply` 后 `adopt`（只注入 marker 区块，既有文档零改动）、`extend` 把用户新规则固化成文件、`verify`、`uninstall` |
| [`skill-author`](skill-author/) | 按本仓库约定生成与校验新技能目录：目录名对齐 frontmatter `name`、自包含检查、README 技能表登记 |

## 安装（magpie）

在 Library 页添加本仓库，路径填技能目录名（例如 `code-map`），勾选要让哪些 Agent 使用；之后用 `magpie library skill update code-map` 拉更新。

## 从源码安装

```powershell
node code-map/scripts/install.mjs --all-agents        # 各 Agent 的 skills 目录
node code-map/scripts/install.mjs --library           # magpie 库
node code-map/scripts/install.mjs --project D:\proj   # 只把生成器 + 配置模板放进项目 doc/
node code-map/scripts/install.mjs --workspace D:\ws   # 多工程：装每个工程 + 在工作区 doc/ 放登记表脚本
node code-map/scripts/install.mjs --list --dry-run    # 看会写到哪里
```

## 目录约定

- 每个技能一个目录，`SKILL.md` 放在目录里。**不要在仓库根放 `SKILL.md`**：magpie 找不到目录名时会拿下载临时目录兜底，技能会被装成 `magpie-skill-<数字>`。
- 目录名 = `SKILL.md` 的 `name`（magpie 用目录名兜底，DSH 读 frontmatter，两者一致才不会分裂）。
- 技能目录自包含：脚本、模板放各自目录内，不跨目录引用（magpie 按目录整体复制/链接）。
- 不提交 `node_modules`、构建产物与密钥；技能里只放能被任何 Agent 直接读的文件。

## 许可

[MIT](LICENSE)
