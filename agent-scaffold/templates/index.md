# Agent 索引

> 以**触发条件**为键。新增能力时先加到这里，再决定要不要动 `AGENTS.md`。
> 单条格式：`触发条件 → 文件`。找不到就说明该知识还不存在，不要猜。

## 代码

| 触发条件 | 文件 |
| --- | --- |
| 需要符号、声明行号、调用方 | `doc/CODE_MAP_INDEX.md`（不存在 → `code-map` skill） |
| 改代码前确认纪律 | `agent/rules/10-code.md` |
| 提交前 | `agent/rules/20-git.md` |
| 写 / 改文档 | `agent/rules/30-docs.md` |
| 排查缺陷、复现、定位根因 | `agent/rules/40-debug.md` |

## 项目上下文

| 触发条件 | 文件 |
| --- | --- |
| 需求变更、验收标准、范围边界 | `agent/context/requirements.md` |
| 原理图、BOM、接口定义、电源与结构 | `agent/context/hardware.md` |
| 架构、模块划分、通信协议、版本 | `agent/context/software.md` |
| 当前在做什么、卡在哪、下一步 | `agent/context/plan.md` |
| 为什么当初这么选、放弃过什么 | `agent/context/decisions.md` |

## 能力（skill）

| 触发条件 | 文件 |
| --- | --- |
| 要建代码地图 / 更新地图 | `code-map` skill |
| 要新增一个复用技能 | `skill-author` skill |
| 要接入或修复本体系 | `agent-scaffold` skill |

## 生成物（不要手改）

| 内容 | 位置 | 归属 |
| --- | --- | --- |
| 代码地图索引 | `doc/CODE_MAP_INDEX.md` | `code-map` 生成器 |
| 地图页面 | `doc/codemap/**` | 同上 |
| 本体系清单 | `agent/.manifest.json` | `agent-scaffold` |
