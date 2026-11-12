# code-map

给任意仓库建立**确定性**代码地图的 Agent Skill。

tree-sitter / TypeScript 编译器提取符号，按目录路由成模块页；从 `use` / `import` 语句建导入级引用图，按入度排出"枢纽"；所有结果渲染成可 diff 的 Markdown，并配一个查询 CLI：

```powershell
node doc/codemap.mjs --find toggle_system_proxy    # 名字 → 路径:行号
node doc/codemap.mjs --outline src/services/api.ts # 文件 → 声明清单
node doc/codemap.mjs --map --tokens 600            # 按 token 预算看架构主轴
node doc/codemap.mjs --check                       # 校验零漂移（CI 可用）
```

无嵌入、无网络、无遥测：同一份源码逐字节产出同一份地图。

## 它解决什么

Agent 在陌生仓库里最常见的浪费是全仓 `grep` + 整文件读。代码地图把这一步压缩成 1~3 次调用：先看枢纽，知道名字就查行号，知道文件就看清单，实在不知道才走"索引 → 模块页 → 符号页"。生成物可以进版本库，人和 Agent 读同一份真相。

新支持语言只索引声明，不统计这些语言的导入边；不要用枢纽排序判断它们的依赖关系。

**它不是**调用图、类型系统或测试的替代品：只有导入级证据，方法调用、trait 派发、宏展开、动态导入都不计入；缺少边不等于没有依赖。

## 安装

**通过 magpie 库**（推荐）：在 Library 页添加本仓库（路径填 `code-map`），勾选要让哪些 Agent 使用；magpie 会在各 Agent 的 skills 目录建链接，并可用 `magpie library skill update code-map` 拉更新。

**从源码安装**：仓库是唯一源，装到哪儿都用同一个脚本；改了仓库就重跑一次：

```powershell
# 在仓库根目录执行；点进 code-map/ 后去掉开头的 code-map/
node code-map/scripts/install.mjs --all-agents        # 所有已存在的 Agent skills 目录（claude/codex/cursor/dsh/opencode）
node code-map/scripts/install.mjs --agent dsh         # 只装某一个
node code-map/scripts/install.mjs --library           # magpie 库（~/.config/magpie/library/skills/code-map）
node code-map/scripts/install.mjs --project D:\proj   # 只把生成器 + 配置模板放进 D:\proj\doc\
node code-map/scripts/install.mjs --workspace D:\ws   # 多工程：装每个工程 + 工作区 doc/ 放登记表脚本
node code-map/scripts/install.mjs --list --dry-run    # 看会写到哪里、会改什么
```

`--project` 只复制 `codemap.mjs` 与配置模板，**已有 `codemap.config.json` 不会被覆盖**；`--workspace` 读取 `doc/codemap-workspace.json` 里的 `projects`（没有则自动发现已含配置的子目录），对每个工程执行一次 `--project`，再把 `codemap-workspace.mjs`、登记表模板与 `AGENTS.md` 片段放进工作区 `doc/`；`--library` / `--agent` 会镜像 `SKILL.md`、`README.md`、`scripts/`、`templates/`，目标里多余的旧文件会被清掉（遇到链接时写穿链接，链接本身不动）。

**用在某个项目里**：装好生成器后，按项目改配置再生成：

```powershell
node code-map/scripts/install.mjs --project <项目>
# 改 <项目>\doc\codemap.config.json 的 roots / modules
node <项目>\doc\codemap.mjs
node <项目>\doc\codemap.mjs --check
```

## 多工程工作区

一个目录下并排放几个独立工程（各自 `.git`、语言可能不同）时，**每个工程各生成一份地图**，工作区根只放一张登记表：配置与缓存互不牵连，改 A 工程不会重写 B 工程的页面。

```powershell
node code-map/scripts/install.mjs --workspace D:\ws     # 每个工程装生成器 + <ws>\doc\ 放编排脚本
# 改 <ws>\doc\codemap-workspace.json 的 projects / shared / indexFile
node <ws>\doc\codemap-workspace.mjs build               # 逐工程生成，再重写登记表（幂等）
node <ws>\doc\codemap-workspace.mjs check               # 任一工程漂移即失败（提交前 / CI）
node <ws>\doc\codemap-workspace.mjs find clamp          # 跨工程找符号：只读各工程缓存，不重新解析
```

登记表 `<ws>\doc\CODE_MAP_INDEX.md` 只有一张工程表（目录、索引根、文件/符号/诊断数、地图入口），Agent 先在这里挑工程，再进各工程自己的 `doc/CODE_MAP_INDEX.md`。

不做的事：不合并地图、不推断跨工程引用边（两份地图没有共同解析器），共用头文件写进 `shared` 人工确认；登记表是生成物，手改会被下次 `build` 覆盖。

## 依赖

Node.js 22+，以及 `typescript`、`web-tree-sitter`、`tree-sitter-wasms`。解析顺序：脚本所在目录 → `CODEMAP_REQUIRE_FROM` → 已知同级安装。项目内自足只需：

```powershell
pnpm add -D typescript web-tree-sitter tree-sitter-wasms
```

## 仓库结构

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | Agent 入口：7 步接入流程、配置语法、验收标准、维护与排错 |
| `scripts/codemap.mjs` | 生成器本体（复制到 `<项目>/doc/codemap.mjs`） |
| `scripts/install.mjs` | 从本仓库安装到 Agent skills 目录 / magpie 库 / 项目 `doc/` / 多工程工作区 |
| `scripts/codemap-workspace.mjs` | 多工程编排：逐工程生成、汇总 `check`、跨工程只读 `find`、重写根登记表 |
| `scripts/selftest.mjs` | 端到端自测：临时项目里跑生成、查询、漂移检测（包含多语言、查询、漂移和幂等检查） |
| `templates/codemap.config.json` | 配置模板（Tauri / 前后端混布形态，按项目改） |
| `templates/AGENTS.section.md` | `AGENTS.md` 里"代码地图"一节的标准写法 |
| `templates/codemap-workspace.json` | 多工程登记表配置模板（`projects` / `shared` / `indexFile`） |
| `templates/AGENTS.section.workspace.md` | 多工程工作区根 `AGENTS.md` 的"代码地图"一节 |
| `references/workspace.md` | 多工程为什么各建一份：设计约束、生态对照、不做的事 |

## 支持的语言

Rust、TypeScript / TSX / MTS / CTS、JavaScript / JSX / MJS / CJS、Python、Shell / PowerShell / BAT，以及 C#、Go、Java、C、C++ 的声明索引。C# / Go / Java / C / C++ 尚不提取导入引用边；XAML、预处理和宏展开不覆盖，语法诊断可能导致索引不完整。

当前 `tree-sitter-wasms` 快照可能对 C# 较新的语法（例如类主构造函数）报告解析诊断；应检查对应源码，不能把有恢复诊断的结果当作完整索引。

## 设计约束

- **确定性**：不写时间戳与机器路径，同一输入逐字节相同。
- **只读查询**：`--find` / `--outline` / `--map` 不写文件。
- **诚实计数**：歧义与未解析分开统计，绝不按名字猜一条边。
- **增量安全**：`--module` 遇到模块外改动直接报错，不产出半新半旧的页面。

## 许可

[MIT](LICENSE)。
