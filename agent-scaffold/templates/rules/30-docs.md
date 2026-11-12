# 文档规范

## 先问：这属于哪一类

| 类型 | 放哪 | 谁维护 |
| --- | --- | --- |
| 需求 / 验收 | `docs/` 原位，摘要进 `agent/context/requirements.md` | 人 |
| 硬件：原理图、BOM、接口 | `docs/` 原位，摘要进 `hardware.md` | 人 |
| 软件：架构、协议、版本 | `docs/` 原位，摘要进 `software.md` | 人 + Agent |
| 决策记录 | 正文 `docs/adr/NNNN-slug.md`；`agent/context/decisions.md` 只放索引一行 | Agent 追加 |
| 计划与进度 | `agent/context/plan.md` | Agent 追加 |
| 调研结论 | `agent/context/research/<主题>.md` + 索引一行 | Agent 追加 |
| 归档结论 | `agent/context/archive/<主题>.md` + 索引一行 | Agent 追加 |
| Agent 规则 | `agent/rules/*.md` | 人 |
| 阶段流程 | `agent/playbooks/*.md` | 人 |
| 代码地图 | `doc/CODE_MAP_INDEX.md`、`doc/codemap/**` | 仅生成器 |

## 文档类型不要混写（Diátaxis 四类）

| 类型 | 回答什么 | 本仓库对应 |
| --- | --- | --- |
| 教程 tutorial | 新人怎么从零做一遍 | `docs/` 里的上手材料 |
| 操作指南 how-to | 有基础的人怎么解决某个问题 | `agent/playbooks/*` |
| 参考 reference | 参数、接口、寄存器、字段的权威值 | 协议表、BOM、`doc/CODE_MAP_INDEX.md` |
| 解释 explanation | 为什么这么设计、为什么是这个取舍 | `agent/rules/*`、`docs/adr/*` |

一份文档只服务一类读者。把「怎么做」和「为什么」混写，两类人都找不到自己要的。

## 摘要卡规则（`agent/context/*.md`）

固定四段，缺一段即不合规：

```markdown
## 事实源
- 需求 v2.3：`docs/req/需求_v2.3.docx`（唯一有效版本，v2.2 已作废）
## 当前结论
- 采样率 600 Mbps；AC 本期不做。
## 未决项
- DQ 收尾兜底策略未定 → `agent/rules/40-debug.md`
## 最后更新
- 2026-11-12 / 更新人
```

- **只写指针与结论，不搬正文**。正文会过期，链接不会。
- 一个事实源只能有一个「有效版本」，其余标注「已作废」。
- 摘要卡超过 200 行说明该拆了。

## 状态声明（新增文档一律带）

```yaml
---
status: active | resolved | superseded | archived
updated: 2026-11-12
verified: false
supersedes: []
---
```

没有 `status` 的文档，Agent 默认按 `active` 处理，但**不得**作为唯一依据——先确认再引用。

## 写文档的通用要求

- 先给结论，再给依据。
- 每段都有明确读者：写给使用者、维护者或评审者，不写给请求者（`agent/rules/15-audience.md`）。
- 数字带单位与口径（600 Mbps 是链路速率还是采样率？）。
- 时间用绝对日期（2026-11-12），不用「上周」。
- 路径用仓库相对路径，不写 `D:\...`。
- 术语首次出现给英文原词。

## 反模式

- ❌ `xxx_最终版_v2_真的最终.docx` —— 版本靠 git，不靠文件名。
- ❌ 只放截图不给文字结论 —— 图不能 grep。
- ❌ 把会议记录当决策记录 —— 决策只要「定了什么 + 为什么 + 放弃了什么」。
- ❌ 同一件事在 3 个文件里各写一份 —— 迟早互相矛盾。
