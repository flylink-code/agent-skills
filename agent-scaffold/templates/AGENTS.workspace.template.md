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

工程清单统一登记在 `agent/index.md`。新增工程时，在其目录执行 `init`，并在清单中登记职责与入口。

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
规则（约束）在 `agent/rules/*.md`，触发条件表见 `agent/index.md`；工程内需要不同做法时，在该工程 `AGENTS.md` 写明例外与理由，不要指望自动覆盖。

联调时记录参与工程的版本组合、各自验证入口和联调结果。恢复旧结论前核对 `status` 与失效条件。

## 4. 预算与维护

本文件 ≤ 60 行；工作区 `index.md` ≤ 120 行；单文件 ≤ 200 行（Anthropic 对 CLAUDE.md 的目标值：文件越长越吃上下文、遵守率越低）。
结构由 `agent-scaffold` 生成；加规则用 `extend`，加能力用 `skill-author`。
