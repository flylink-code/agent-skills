# 工作区索引

> 多工程工作区的总索引。工程内的细节一律去各自的 `projects/<工程>/agent/`。

## 工程

| 工程 | 目录 | 职责 | 入口 |
| --- | --- | --- | --- |
| （待填） | `projects/（待填）/` |  | `projects/（待填）/AGENTS.md` |

## 阶段（流程，跨工程通用）

| 触发条件 | 文件 |
| --- | --- |
| 新需求 / 立项 / 选型 | `agent/playbooks/10-create.md` |
| 实现 | `agent/playbooks/20-implement.md` |
| 调试 | `agent/playbooks/30-debug.md` |
| 优化 | `agent/playbooks/40-optimize.md` |
| 归档 / 交接 | `agent/playbooks/50-archive.md` |

## 规则（约束）

| 触发条件 | 文件 |
| --- | --- |
| 全局行为 | `agent/rules/00-global.md` |
| 改代码 | `agent/rules/10-code.md` |
| 提交 | `agent/rules/20-git.md` |
| 文档 | `agent/rules/30-docs.md` |
| 排查 | `agent/rules/40-debug.md` |
| 调研 | `agent/rules/50-research.md` |
| 归档 | `agent/rules/60-archive.md` |
| **多工程隔离（本工作区必读）** | `agent/rules/70-isolation.md` |

## 事实

| 触发条件 | 文件 |
| --- | --- |
| 共享需求 | `agent/context/requirements.md` |
| 跨工程决策 | `agent/context/decisions.md` |
| 工作区进度 | `agent/context/plan.md` |
| 调研结论 | `agent/context/research/RESEARCH_INDEX.md` |
| 已归档历史 | `agent/context/archive/ARCHIVE_INDEX.md` |

## 共享资料

| 内容 | 位置 |
| --- | --- |
| 需求 / 客户资料 | `doc/` |
| 跨工程规范 | `doc/` 或 `agent/rules/` |
