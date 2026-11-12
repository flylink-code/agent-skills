# 多工程代码地图：为什么每个工程各建一份

一个目录里并排放着几个独立工程时，常见的第一反应是"一张总图更省事"。在本生成器的设计下，一张总图有四个硬伤：

1. **配置只有一份**：`extensions` / `excludeSegments` / `pageRows` 是全局的，不同语言的工程只能互相妥协（C 工程要 `.c`，TS 工程不想索引 `.json`）。
2. **索引与页面线性膨胀**：`CODE_MAP_INDEX.md` 和模块页随工程数增长，Agent 读完索引就耗掉大半上下文预算——这正好违背"索引只用来路由"的初衷。
3. **单缓存互相牵连**：`.codemap-cache.json` 只有一份，`--module` 增量在"模块外有改动"时直接报错；改 A 工程会连带重写 B 工程的页面 diff，评审时噪音淹没真实改动。
4. **生成物位置受限**：生成器要求产物在 `<root>/doc/` 内（`codemap.mjs` 会校验），所以"工作区根的总图"不属于任何一个工程仓库，进不了各自的 git/PR，也就无法随代码一起评审和回滚。

## 生态里的通行做法

索引粒度跟"构建单元 / 所有权单元"走，再在顶层聚合：

| 系统 | 索引粒度 |
| --- | --- |
| clangd | 一个 compilation database（一个 build 目录）一份，多工程各自配置 |
| GitLab LSIF | 一个 project 一份索引文件，不按分支区分 |
| SCIP | 每个包产 partial index，再由 CLI 在 monorepo 根合并 |
| VS Code 多根工作区 | 每个根是独立配置单元，`.code-workspace` 只做聚合 |
| Sourcegraph | 仓库各自索引，跨仓库靠 federation 连接，不是一个大索引 |

本 skill 的对应实现：每个工程 `doc/codemap.mjs` + 各自配置与缓存，工作区根只有一张由 `codemap-workspace.mjs` 生成的登记表（`doc/CODE_MAP_INDEX.md`），供 Agent 先选工程。跨工程 `find` 直接读各工程的 `.codemap-cache.json`（缓存里已含符号记录），不重新解析。

## 不做的事

- **不合并地图**：不存在"跨工程枢纽页"。
- **不推断跨工程引用边**：两份地图没有共同解析器，硬连一条边就是猜；共用头文件写进 `codemap-workspace.json` 的 `shared`，由人确认。
- **不手改登记表**：它是生成物，`build` 会覆盖。
