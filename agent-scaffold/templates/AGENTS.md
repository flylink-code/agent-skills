# {{PROJECT_NAME}} · Agent 主路由

本文件只做**路由**，不放细节。细节在 `agent/` 下按需读取。
优先级：用户本轮指令 > 本文件 > `agent/rules/*` > 模型默认习惯。

## 0. 默认行为

- 中文回复；专业术语保留英文原词，不硬译。
- 引用代码用 `相对路径:行号`，如 `src/main.c:128`；引用文档用相对路径。
- 结论必须标证据等级：**实测** / **推断** / **假设**。
- 不确定时给「下一步动作」，不以「无法确定」收尾。

## 1. 先读索引

遇到不熟悉的领域，**先读 `agent/index.md`**，按「触发条件 → 文件」跳转。
禁止全仓盲扫；禁止凭印象回答目录里已有的东西。

## 2. 路由表

| 需要什么 | 读这里 |
| --- | --- |
| 符号位置 / 调用方 | `doc/CODE_MAP_INDEX.md`；不存在 → 用 `code-map` skill 生成 |
| 改代码的纪律 | `agent/rules/10-code.md` |
| 提交 / 分支 / 回滚 | `agent/rules/20-git.md` |
| 写文档 | `agent/rules/30-docs.md` |
| 排查 / 定位缺陷 | `agent/rules/40-debug.md` |
| 需求原文、验收标准 | `agent/context/requirements.md`（指针，正文在 `docs/`） |
| 硬件：原理图、BOM、接口 | `agent/context/hardware.md` |
| 软件：架构、模块、协议 | `agent/context/software.md` |
| 当前任务与进度 | `agent/context/plan.md` |
| 历史决策「为什么这么定」 | `agent/context/decisions.md` |
| 要新能力（新 skill） | 用 `skill-author` skill 生成，**不要**写进本文件 |

## 3. 三条硬规则

1. **事实与推断分开写**。没有实测支撑的，一律标「假设」，并给置信度（高/中/低）。
2. **每轮收尾给下一步**。至少 3 条，每条带判定标准：现象 A 说明什么、现象 B 说明什么。
3. **不承诺做不到的动作**。没有的工具就直说，改成「需要你提供：文件名 / 哪几段 / 怎么导出」。

## 4. 上下文预算

- 本文件 ≤ 60 行；`agent/index.md` ≤ 120 行；单个 rules/context 文件 ≤ 200 行。
- 超了就拆文件，**不要**继续往主文件里加行。

## 5. 维护

- 结构由 `agent-scaffold` 生成；手工改内容可以，改结构走 skill。
- 新增知识：先加到对应 `agent/context/*.md` 摘要卡，再决定要不要进路由表。
