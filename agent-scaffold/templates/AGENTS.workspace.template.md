# {{PROJECT_NAME}} · 工作区主路由

这是一个**多工程工作区**：`doc/` 放共享资料，`projects/` 下每个目录是**独立工程**。
本文件只做路由。用户本轮指令优先；其余**不靠「覆盖」**——各分片自洽，冲突时以更具体的那份为准（不同工具组合多层指令的规则不一致，别依赖某个优先级模型）。

## 0. 先判断题界（最重要）

| 你的任务 | 去哪 |
| --- | --- |
| 只涉及某一个工程 | 读 `projects/<工程>/AGENTS.md`，**只在那个工程内**工作 |
| 跨工程（接口约定、联调、统一规范） | 读本文件 + `agent/rules/70-isolation.md` |
| 需求、客户、共享资料 | `doc/` + `agent/context/requirements.md` |
| 不确定属于谁 | 先问；不要猜 |

**隔离铁律**：工程之间默认**互不读写**。跨工程修改必须说明理由并征得用户同意，且记录到 `agent/context/decisions.md`。

## 1. 工程一览

| 工程 | 目录 | 职责 | 主路由 |
| --- | --- | --- | --- |
| （待填） | `projects/（待填）/` |  | `projects/（待填）/AGENTS.md` |

新增工程：在 `projects/` 下建目录 → 用 `agent-scaffold init` 生成工程级 `agent/` → 回到本表补一行。

## 2. 工作区级知识

| 需要什么 | 读这里 |
| --- | --- |
| 共享需求 / 验收 | `agent/context/requirements.md`（指针到 `doc/`） |
| 跨工程决策 | `agent/context/decisions.md` |
| 工作区级进度 | `agent/context/plan.md` |
| 调研结论 | `agent/context/research/RESEARCH_INDEX.md` |
| 已归档历史 | `agent/context/archive/ARCHIVE_INDEX.md` |
| 索引总表 | `agent/index.md` |

## 3. 全流程阶段

创建 → 实现 → 调试 → 优化 → 归档，对应 `agent/playbooks/10~50-*.md`。
规则（约束）在 `agent/rules/*.md`；工程内需要不同做法时，在该工程 `AGENTS.md` 写明例外与理由，不要指望自动覆盖。

## 4. 三条硬规则

1. 事实 / 推断 / 假设分开写，标证据等级。
2. 每轮收尾给 ≥3 条带判定标准的下一步。
3. 引用结论前确认 `status`；`archived` / `superseded` 不得当作现状。

## 5. 预算与维护

本文件 ≤ 60 行；工作区 `index.md` ≤ 120 行；单文件 ≤ 200 行。
结构由 `agent-scaffold` 生成；加规则用 `extend`，加能力用 `skill-author`。
