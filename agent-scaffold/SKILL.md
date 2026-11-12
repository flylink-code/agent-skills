---
name: agent-scaffold
description: >-
  Build or adopt a router-based agent knowledge system for a project: a short AGENTS.md
  router, an agent/ index layer, and rule / playbook / context shards that cover the whole
  lifecycle (create, implement, debug, optimize, archive), plus research rules, archive indexes
  that stop agents from redoing finished work, multi-project isolation, and a non-destructive
  adopt mode for legacy repos with existing AGENTS.md and lots of old documents.
  Use when the user asks to 建立 agent 文件体系, 初始化 agent 配置, 新工程接入 agent,
  旧工程接入 agent, 整理工程文档给 agent 用, 生成 AGENTS.md, 设计 agent 目录结构,
  避免 agent 重复做已完成的工作, 多工程隔离, 或者要把新规则加进现有体系.
---

# Agent 文件体系：全流程知识与接入

给一个工程（或一个包含多个工程的工作区）搭一套**路由式** Agent 知识体系：主文件只做索引，
流程与规则按需读取。目标是让下一个会话（或下一个模型）不用重新问一遍、不用重做已完成的事。

## 它解决什么

| 症状 | 本体系的对应件 |
| --- | --- |
| 模型给个结论就停，把活推回给人 | `agent/rules/00-global.md`（输出四段、不许以「证据不足」收尾） |
| 只说「根因未定」，不给可执行的下一步 | `agent/rules/40-debug.md` + `playbooks/30-debug.md` |
| 新会话重复做已经做完的事 | `agent/context/archive/ARCHIVE_INDEX.md` + `rules/60-archive.md` |
| 引用几个月前的结论当现状 | 文档 `status` 字段 + 归档卡「失效条件」 |
| 需求/选型拍脑袋 | `rules/50-research.md`（先本地、再官方文档、≥3 独立来源） |
| 改 A 工程顺手动了 B 工程 | `rules/70-isolation.md`（默认互不读写） |
| 规则越写越长，模型开始不遵守 | 三层预算 + `verify` 机器校验 |

## 三层预算（为什么主文件必须短）

| 层 | 文件 | 预算 | 变化频率 |
| --- | --- | --- | --- |
| 路由层 | `AGENTS.md` | ≤ 60 行 | 几乎不变 |
| 索引层 | `agent/index.md` | ≤ 120 行 | 新增能力时 |
| 内容层 | `agent/rules/*`、`playbooks/*`、`context/*` | 单文件 ≤ 200 行 | 高频 |

依据：Anthropic 官方对 `CLAUDE.md` 的建议是 **under 200 lines**（更长会降低遵守率），
且上下文越长召回越差（context rot）。60 行是本体系更严的**路由预算**，不是行业标准；
200 行是官方数字，别超过。`AGENTS.md` 规范本身（agents.md）没有任何字段或行数要求。

## 生成的目录

```
AGENTS.md                     # 路由层（≤60 行）
agent/
  index.md                    # 索引层：触发条件 → 文件
  rules/                      # 约束
    00-global.md              #   语言、证据分级、输出形状、什么值得写进 agent 文件
    10-code.md                #   改代码纪律
    20-git.md                 #   提交、分支、回滚
    30-docs.md                #   文档类型（Diátaxis）、摘要卡、status
    40-debug.md               #   排查铁律
    50-research.md            #   网上调研与采信标准
    60-archive.md             #   状态模型与归档
    70-isolation.md           #   多工程隔离
  playbooks/                  # 流程（全生命周期）
    10-create.md              #   立项：澄清 → 调研 → 方案对比 → 里程碑
    20-implement.md           #   实现：定位 → 小步改 → 三层验证
    30-debug.md               #   调试：固定现象 → 证伪 → 收敛
    40-optimize.md            #   优化：基线 → 单变量 → 回归
    50-archive.md             #   归档：结论、失效条件、交接包
  context/                    # 事实卡（摘要 + 指针，正文留在 docs/）
    requirements.md  hardware.md  software.md  plan.md  decisions.md
    research/RESEARCH_INDEX.md
    archive/ARCHIVE_INDEX.md  archive/_TEMPLATE.md
  .manifest.json              # 写入记录，供 verify / uninstall
```

工作区模式（`--mode workspace`）把 `AGENTS.md` 换成工作区路由（含工程一览表），
`projects/` 下每个子目录各自再跑一次工程级 `init`。**代码地图不在这里**：
沿用 `code-map` 的 `doc/CODE_MAP_INDEX.md` 契约，避免两套地图漂移。

## 工作流程

```
Task Progress:
- [ ] Step 1: detect，判断形态（新工程 / 旧工程 / 多工程工作区）
- [ ] Step 2: 旧工程先 audit + plan，把重构方案给用户确认
- [ ] Step 3: dry-run，把会写什么念给用户
- [ ] Step 4: init 或 adopt（工作区先工作区级，再逐工程）
- [ ] Step 5: 填 3 张事实卡 + plan.md（只写指针与结论）
- [ ] Step 6: verify 全绿，告诉用户怎么回滚
```

### Step 1 · 判定形态

```powershell
node <skill>/scripts/scaffold.mjs detect <目录>
```

| 形态 | 判据 | 做法 |
| --- | --- | --- |
| 新工程 | 无 `AGENTS.md`、无 `agent/` | `init` |
| 旧工程·干净 | 有 `AGENTS.md`，无 kit marker | 先 `migrate audit`，再 `adopt` |
| 旧工程·已接入 | 有 kit marker | `adopt`，只替换 marker 区块，幂等 |
| 多工程工作区 | 有 `doc/` + `projects/` | `init --mode workspace`，再逐工程 `init` |

### Step 2 · 旧工程先盘点（不许上来就搬文件）

```powershell
node <skill>/scripts/migrate.mjs audit <目录>          # 只读：清点文档、重复、孤儿目录
node <skill>/scripts/migrate.mjs plan  <目录>          # 产出 agent/MIGRATION.md 供人确认
node <skill>/scripts/migrate.mjs apply <目录> --yes    # 按计划执行，git 分支上跑，逐批提交
```

原则：**先整理、再适配**。旧文档可以移动/加 `status` 头，但内容一个字不改；
所有移动用 `git mv`，可 `git revert`。计划里没有的动作，`apply` 不会做。

### Step 3 · 预览

```powershell
node <skill>/scripts/scaffold.mjs init  <目录> --dry-run
node <skill>/scripts/scaffold.mjs adopt <目录> --dry-run
```

必须念给用户听，尤其 `adopt`：告诉他只会动 `AGENTS.md` 的 marker 段。

### Step 4 · 执行

```powershell
node <skill>/scripts/scaffold.mjs init  <目录> --name "工程名"
node <skill>/scripts/scaffold.mjs adopt <目录>
```

`adopt` 铁律：

1. **只增不改**：除 marker 区块外不动任何既有文件。
2. **区块内可重入**，区块外一个字节都不碰（`<!-- agent-kit:begin -->` / `<!-- agent-kit:end -->`）。
3. **不搬、不改名、不格式化**旧文档；marker 残缺时**拒绝执行**，不猜边界。
4. `agent/` 下已存在文件默认跳过，`--force` 才覆盖且先备份 `.bak`。

### Step 5 · 填充事实卡（只写指针，不搬正文）

```markdown
## 事实源
- 需求 v2.3：`docs/req/需求_v2.3.docx`（唯一有效版本，v2.2 已作废）
## 当前结论
- 采样率 600 Mbps；AC 本期不做。
## 未决项
- DQ 收尾兜底策略未定（见 `agent/rules/40-debug.md`）
## 最后更新
- 2026-11-12 / 谁更新的
```

`plan.md` 写清：现在在哪个阶段、卡在哪、上一步结论、下一步三条。
这三张卡是「事实源指针」，不是正文副本 —— 正文会过期，链接不会。

### Step 6 · 验收与回滚

```powershell
node <skill>/scripts/scaffold.mjs verify    <目录>
node <skill>/scripts/scaffold.mjs uninstall <目录> --dry-run
```

`verify` 检查：marker 成对唯一、各文件行数预算、事实卡有「事实源」且含可点击路径、
`status` frontmatter 存在、归档与调研索引存在、manifest hash 一致、代码地图是否就位。
`uninstall` 只删 manifest 记录且 hash 未变的文件，只剥 marker 区块；手工改过的保留并报告。

## 把用户的新想法固化进体系

用户随时会说「再加一条规则」「这里要这样」。**不要手改模板，也不要只改一个文件**：

```powershell
node <skill>/scripts/scaffold.mjs extend <目录> --title "日志必须带时间戳与设备序列号" `
  --body "现场日志缺时间戳，无法和 DUT 断电时刻对齐。" --slug log-timestamp
```

`extend` 会：按现有编号 +10 建 `agent/rules/NN-slug.md` → 往 `agent/index.md` 规则表加一行 →
在 `agent/context/decisions.md` 记一条带「为什么 / 影响面 / 可逆性」的决策 →
在 `AGENTS.md` 路由表（旧工程则 marker 区块内）加一行 → 同步 manifest。
新增**能力**（不是规则）用 `skill-author`，两种都要先跟用户确认落到哪一层。

## 阶段与规则的接线

- 阶段：`create → implement → debug → optimize → archive`，对应 `playbooks/10~50-*.md`。
- 规则：语言/证据分级、代码、git、文档、调试、调研、归档、隔离，对应 `rules/00~70-*.md`。
- 归档不是终点：`ARCHIVE_INDEX.md` 里每条必须有**状态 + 失效条件**，
  `workaround` 不得标成已修复 —— 否则下一个 agent 会把已绕过的问题当已解决。
- 需求/选型必须先查本地、再上网；采信标准见 `rules/50-research.md`（官方文档 > 有署名工程博客 > 论坛）。

## 反模式

- ❌ 把所有规则塞进 `AGENTS.md` —— 超过预算等于没写。
- ❌ `cp AGENTS.md` 覆盖旧工程 —— 抹掉既有约定，且不可逆。
- ❌ 在 `context/` 里复制需求正文 —— 第二次变更就全过期。
- ❌ 旧工程上来就全量重构 —— 先 `audit`/`plan`，拿到用户确认再 `apply`。
- ❌ 让本 skill 接管代码地图 —— `code-map` 是 SSOT，重复造只会漂移。
- ❌ 归档只写「已完成」不写「为什么当时这么定、什么条件下会失效」—— 半年后没人敢动。
