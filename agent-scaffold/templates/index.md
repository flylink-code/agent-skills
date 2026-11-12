# Agent 索引

> 以**触发条件**为键，不以文件清单为键（清单会腐烂，触发条件稳定）。
> 找不到 = 该知识还不存在，不要猜；先补卡，再决定要不要进 `AGENTS.md`。

## 阶段（流程）

| 触发条件 | 文件 |
| --- | --- |
| 新需求 / 新产线 / 选型 | `agent/playbooks/10-create.md` |
| 动手实现、加模块、改配置 | `agent/playbooks/20-implement.md` |
| 有现象要定位、复现、找根因 | `agent/playbooks/30-debug.md` |
| 有基线要提指标、调参、降本 | `agent/playbooks/40-optimize.md` |
| 收尾、下线、交接、结项 | `agent/playbooks/50-archive.md` |

## 规则（约束）

| 触发条件 | 文件 |
| --- | --- |
| 任何回答的语言 / 证据等级 / 输出形状 | `agent/rules/00-global.md` |
| 改代码前 | `agent/rules/10-code.md` |
| 写 UI 文案 / 注释 / TODO / 提交措辞 | `agent/rules/15-audience.md` |
| 提交 / 分支 / 回滚 | `agent/rules/20-git.md` |
| 写文档 / 更新摘要卡 | `agent/rules/30-docs.md` |
| 排查时的铁律 | `agent/rules/40-debug.md` |
| 需求调研 / 选型 / 查资料 | `agent/rules/50-research.md` |
| 归档 / 判断结论是否过期 | `agent/rules/60-archive.md` |
| 涉及多个工程目录 | `agent/rules/70-isolation.md` |

## 事实

| 触发条件 | 文件 |
| --- | --- |
| 需求变更、验收标准、范围 | `agent/context/requirements.md` |
| 原理图、BOM、接口、电源 | `agent/context/hardware.md` |
| 架构、模块、协议、版本 | `agent/context/software.md` |
| 当前进度、卡点、下一步 | `agent/context/plan.md` |
| 为什么这么定、放弃过什么 | `agent/context/decisions.md` |
| 网上调研的候选与否决理由 | `agent/context/research/RESEARCH_INDEX.md` |
| 已完成 / 已失效的历史结论 | `agent/context/archive/ARCHIVE_INDEX.md` |

## 代码

| 触发条件 | 文件 |
| --- | --- |
| 符号位置、声明行号、调用方 | `doc/CODE_MAP_INDEX.md`（不存在 → `code-map` skill） |

## 能力与生成物

| 触发条件 | 入口 | 归属 |
| --- | --- | --- |
| 新增/修改规则、加功能进体系 | `agent-scaffold` 的 `extend` | 人 + Agent |
| 新增可复用技能 | `skill-author` skill | Agent |
| 代码地图 | `code-map` skill | 生成器（不手改） |
| 本体系清单 | `agent/.manifest.json` | `agent-scaffold` |
