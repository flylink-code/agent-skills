---
name: code-map
description: >-
  Bootstrap and maintain a deterministic code map for any repository: tree-sitter/TypeScript
  symbol index rendered as Markdown pages, an import-level reference graph with hub ranking,
  and a CLI for --find / --outline / --map / --check. Use when the user asks to 生成代码地图,
  更新代码地图, 接入代码地图, 符号索引, repo map, code map, symbol index, "给新项目做代码地图",
  or when an agent needs symbol-level navigation and the repository has no LSP, embeddings or
  network access.
---

# 代码地图（code map）接入与维护

给一个仓库建立**确定性、可 diff、零网络**的代码地图：符号索引 + 导入级引用图 + 枢纽排序，输出为 Markdown 页面和一个查询 CLI。目标不是替代 LSP，而是让 Agent 用 1~3 次工具调用拿到 `路径:行号`，避免全仓盲扫。

**明确边界**：只有导入级引用证据（`use` / `import`），没有调用图、类型推断、宏展开；不能据此断言"没人依赖它"。

## 工作流程

```
Task Progress:
- [ ] Step 1: 判定项目形态与索引根（单仓 / 多仓 / 嵌套 git / 非 git）
- [ ] Step 2: 复制生成器到 <项目>/doc/ 并确认依赖可解析
- [ ] Step 3: 写 codemap.config.json（roots / modules / 排除项）
- [ ] Step 4: 跑 selftest 与首次生成，记录基线数字
- [ ] Step 5: 验收（--check 零漂移、抽查行号、枢纽合理性）
- [ ] Step 6: 接线文档（AGENTS.md 段、CODE_MAP.md、codemap-guide.md）
- [ ] Step 7: 交付并说明未覆盖项
```

### Step 1: 判定项目形态

| 形态 | `roots` 怎么写 | 说明 |
| --- | --- | --- |
| 仓库即工作区根 | `["src", "src-tauri", "scripts", "doc"]` | 最常见；用 git 索引收集文件 |
| 工作区里放多个仓库 | `["repo-a", "repo-b", "doc"]` | 每个子目录自带 `.git` 时用各自的 git 索引 |
| 只有一个仓在子目录 | `["clash-verge-rev", "doc"]` | 生成物放在工作区 `doc/`，不污染仓库 |
| 非 git 目录 | 同上，但该目录没有 `.git` | 会遍历文件系统（受 `excludeSegments` 限制） |

同时确认语言：生成器内置 **Rust、TS/TSX/MTS/CTS、JS/MJS/CJS、Python、Shell/PowerShell/BAT** 提取。若项目主体是 Go、Java、C#、C++，先告诉用户这套工具需要扩展 `extract()`，不要假装已覆盖。

### Step 2: 安装生成器

把 `scripts/codemap.mjs` 复制到 `<项目>/doc/codemap.mjs`（**不要**直接引用 skill 目录：skill 目录可能被清理或只读）。仓库里可以直接用安装脚本完成，它还会保留项目已有的配置：

```powershell
node <skill>/scripts/install.mjs --project <项目>     # 复制 codemap.mjs + 配置模板（不覆盖已有 config）
node <skill>/scripts/install.mjs --library            # 更新 magpie 库里的副本
node <skill>/scripts/install.mjs --all-agents         # 更新各 Agent 的 skills 目录
```

生成器默认以自身所在目录的上一级为根，因此放在 `doc/` 下即"项目根 = 工作区根"。

依赖三个包：`typescript`、`web-tree-sitter`、`tree-sitter-wasms`。解析顺序：脚本目录 → `CODEMAP_REQUIRE_FROM`（目录或 `package.json`）→ 同级 `../Ai-Switcher`、`../magpie`。新项目建议自足：

```powershell
pnpm add -D typescript web-tree-sitter tree-sitter-wasms
# 或复用已有安装
$env:CODEMAP_REQUIRE_FROM = 'D:\tools\frontend-deps'   # 该目录下要有 node_modules
```

### Step 3: 写配置

复制 `templates/codemap.config.json` 到 `<项目>/doc/codemap.config.json`，逐项确认：

| 字段 | 含义 | 注意 |
| --- | --- | --- |
| `roots` | 工作区相对路径的索引根 | 每个根单独判定 git / 非 git |
| `extensions` | 扩展名白名单（带点、小写） | 不含 `.json`/`.md`，否则地图被数据文件淹没 |
| `excludeSegments` | 路径段黑名单 | 任意层命中即排除：`node_modules`、`target`、`dist`、`generated`、`.github` |
| `excludePatterns` | 整路径正则黑名单 | 用于单点排除，如 `^repo/src-tauri/icons/` |
| `modules` | 模块路由规则（见下） | 地图可读性的核心 |
| `defaultModule` | 未命中规则的归属 | 通常 `tooling` |
| `pageRows` | 每页行数上限（1~150） | 100 足够；小了页数爆炸 |
| `hubCount` | 枢纽页保留条数 | 40 左右，和 `--map` 默认预算匹配 |
| `outputDir` / `indexFile` / `cacheFile` | 生成物位置 | 默认 `doc/codemap`、`doc/CODE_MAP_INDEX.md`、`doc/.codemap-cache.json` |

**模块规则语法**：键是路径前缀，`*` 匹配一级目录并捕获，值里的 `*` 按捕获顺序替换。

- 最长前缀优先：`src-tauri/src/*/` 比 `src-tauri/src/` 更具体，先命中。
- 末尾的 `*` **只匹配目录**：`src/*/` 路由 `src/config/a.rs`，不会把 `src/constants.rs` 变成 `src-constants.rs`；后者落到 `src/` 规则。
- 建议 10~40 个模块，按业务/分层切，不按文件类型切；模块名要和 `AGENTS.md` 里的叫法一致（如 `rust-config`、`web-services`）。

```json
"modules": {
  "src-tauri/src/*/": "rust-*",
  "src-tauri/src/": "rust-root",
  "src/*/": "web-*",
  "src/": "web-root",
  "crates/*/": "crate-*",
  "scripts/*/": "scripts-*",
  "scripts/": "scripts-root"
}
```

### Step 4: 自测与首次生成

```powershell
# 在项目根执行；验证依赖解析、提取、引用图、查询全链路（临时目录，不碰项目文件）
node <skill>/scripts/selftest.mjs

node doc/codemap.mjs --help
node doc/codemap.mjs                      # 首次全量生成
```

首次生成输出一行 JSON：`files / symbols / diagnostics / parsed / changed / pages / edges{resolved,ambiguous,unresolved}`。把这组数字记下来，写进 `CODE_MAP.md` 的"已知基线"。

### Step 5: 验收（缺一不可）

1. `node doc/codemap.mjs` 再跑一次：`changed=0`、`deleted=0`（幂等）。
2. `node doc/codemap.mjs --check`：退出码 0。
3. 抽查三个符号：`--find <名字>` 给出的 `:行号` 与源码声明行一致（编辑器里点开核对，不要凭印象）。
4. `node doc/codemap.mjs --map`：枢纽应是真正的共享类型/工具/门面，而不是一堆一次性 helper；若排名明显失真，回 Step 3 调 `modules` 或检查引用边统计（`ambiguous` 过高通常说明同名声明太多）。
5. 记录 `diagnostics` 数并归类原因（语法版本落后、宏、生成代码）；写进基线，不要为了 0 去调提取器。

### Step 6: 接线文档

1. `AGENTS.md` 增加 `templates/AGENTS.section.md` 的内容（改成项目自己的模块名），放在"代码任务流程"之前。
2. 写 `doc/CODE_MAP.md`：三层结构、命令与语义、覆盖契约（roots/排除/各语言提取粒度）、**引用图契约与不覆盖项**、解析恢复基线、完成清单。
3. 写 `doc/codemap-guide.md`：定位顺序（`--map`/`hubs` → `--find` → `--outline` → 模块页）、本项目的模块速查表、命令、必做清单、FAQ。
4. 明确生成物归属：`CODE_MAP_INDEX.md`、`codemap/hubs.md`、`codemap/**` 只能由生成器写；手写文档放 `doc/` 根。

### Step 7: 交付

报告：文件/符号/引用边/诊断数、模块数与页数、`--check` 结果、抽查过的符号与行号、未覆盖项（语言、外部 crate、宏、动态导入）。不要把"没跑"写成"已验证"。

## 日常维护

- 任何文件增删改后：`node doc/codemap.mjs` → `node doc/codemap.mjs --check`。
- 只改一个模块且缓存已热：`--module <名字>`；跨模块或改配置时必须无参数全量。
- 缓存可随时删；删除后会全量重解析，结果不变。
- 生成物随代码提交，评审时当作 diff 看；**不要手改**。
- 升级生成器后先删缓存再生成（缓存带脚本指纹，通常会自动失效）。

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Cannot resolve "typescript"` | 依赖不在解析范围 | 项目内 `pnpm add -D` 三件套，或设 `CODEMAP_REQUIRE_FROM` |
| `No ... codemap.config.json` | 配置不在脚本同目录 | 放到 `<项目>/doc/`，或 `CODEMAP_CONFIG` 指定绝对路径 |
| 模块名带扩展名（`rust-main.rs`） | 规则末尾 `*` 把文件当目录 | 补更具体的 `.../src/` 规则（生成器已按"末尾 `*` 仅目录"处理，旧版需升级） |
| 页数暴涨 / 地图太大 | `modules` 太细或 `pageRows` 太小 | 合并模块、`pageRows` 回到 100、收紧 `extensions` |
| `--module` 报缓存无效或越界 | 冷缓存或有模块外改动 | 用无参数全量生成 |
| `--check` 报漂移 | 改了代码没重新生成 | `node doc/codemap.mjs` 后重跑 |
| 枢纽排名反直觉 | 入度只统计导入；外部 crate 与同名歧义不计 | 看 `edges` 三个计数；必要时在 `CODE_MAP.md` 写明局限 |
| 诊断数突增 | 新语法超出语法快照（如 async 闭包、`&raw` 借用） | 更新基线并在汇报中说明；不要手改页面 |
| 非 git 目录漏文件 | 遍历受 `excludeSegments` 限制 | 检查排除段是否误伤 |

## 设计约束（改生成器时守住）

- **确定性**：不写时间戳、机器路径；同一输入逐字节相同。
- **只读查询**：`--find`/`--outline`/`--map` 不得写文件。
- **诚实计数**：歧义与未解析分开计数，绝不按名字猜一条边。
- **增量安全**：`--module` 遇到模块外改动直接报错，而不是悄悄产出半新半旧的页面。
- **零依赖侵入**：不往项目里加 runtime 依赖；缺包时给出可执行的修复提示。
