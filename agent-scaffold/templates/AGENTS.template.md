# {{PROJECT_NAME}} · Agent 主路由

本文件只做**路由**，不放细节。细节在 `agent/` 下按需读取。
用户本轮指令优先于一切；其余层级**不靠「覆盖」**——每个分片自洽，冲突时以更具体的那份为准，并在结论里写明依据。

## 0. 每次会话先做三件事

1. 读 `agent/context/plan.md`：现在在哪个阶段、卡在哪、上一步结论是什么。
2. 任务若可能是「以前做过的」→ 先查 `agent/context/archive/ARCHIVE_INDEX.md`，**避免重做已完成的事**。
3. 不熟悉代码 → 读 `doc/CODE_MAP_INDEX.md`；不存在 → 用 `code-map` skill 生成后再读。

## 1. 阶段路由（工程全流程）

| 阶段 | 手册 | 什么时候读 |
| --- | --- | --- |
| 创建 / 立项 | `agent/playbooks/10-create.md` | 新需求、新产线、新工程、方案选型 |
| 实现 / 编码 | `agent/playbooks/20-implement.md` | 动手写代码、改配置、加模块 |
| 调试 / 定位 | `agent/playbooks/30-debug.md` | 有现象、缺陷、偶发、要复现 |
| 优化 / 调参 | `agent/playbooks/40-optimize.md` | 已有基线，要提升指标 |
| 归档 / 交接 | `agent/playbooks/50-archive.md` | 阶段收敛、下线、换人、结项 |

## 2. 规则路由（约束，不是流程；更细的触发条件查 `agent/index.md`）

| 需要什么 | 读这里 |
| --- | --- |
| 语言 / 写作 / 答复自包含 / 推进与停止 / 证据分级 / 输出形状 | `agent/rules/00-global.md` |
| 改代码纪律 | `agent/rules/10-code.md` |
| UI 文案 / 注释 / TODO 的措辞（写给谁） | `agent/rules/15-audience.md` |
| 提交 / 分支 / 回滚 | `agent/rules/20-git.md` |
| 写文档 / 摘要卡 | `agent/rules/30-docs.md` |
| 排查铁律 | `agent/rules/40-debug.md` |
| 网上调研（需求 / 选型 / 疑难） | `agent/rules/50-research.md` |
| 归档与状态 | `agent/rules/60-archive.md` |
| 多工程隔离 | `agent/rules/70-isolation.md` |

## 3. 事实卡（摘要 + 指针，正文留在 `docs/`）

需求 → `agent/context/requirements.md`
硬件 → `agent/context/hardware.md`
软件 → `agent/context/software.md`
进度 → `agent/context/plan.md`
决策 → `agent/context/decisions.md`
调研 → `agent/context/research/RESEARCH_INDEX.md`
历史 → `agent/context/archive/ARCHIVE_INDEX.md`

## 4. 每轮必守

1. **事实 / 推断 / 假设分开写**，每条结论标证据等级。
2. **范围内能做的先做掉**：不以「建议下一步 / 要不要我做」收尾；只在范围实质变化、确被阻塞、需用户裁决、不可逆操作前停。
3. **答复自包含**：用户只看得到最终答复——为读者重写，不复用推理里的简写与内部代号。
4. **不明确就取可逆假设并声明**，不停在半成品或「我可以做 X」。
5. **收尾给 ≥3 条下一步**：能自己执行的标「已执行」，只把真正需要用户裁决的放进「未决项」。
6. **引用结论前先确认 `status`**：`archived` / `superseded` 只能当历史背景，**不得当作现状**。

## 5. 预算与维护

本文件 ≤ 60 行、`agent/index.md` ≤ 120 行、单文件 ≤ 200 行（Anthropic 对 CLAUDE.md 的目标值：文件越长越吃上下文、遵守率越低）。超了就拆文件，不要往主文件加行。
结构由 `agent-scaffold` 生成；加规则用 `extend`，加新能力用 `skill-author`。
