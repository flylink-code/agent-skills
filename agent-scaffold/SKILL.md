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

给一个工程（或一个包含多个工程的工作区）搭一套**路由式** Agent 知识体系：主文件保留构建、验证、边界与索引，
流程与规则按需读取。目标是让下一个会话（或下一个模型）不用重新问一遍、不用重做已完成的事。

## 它解决什么

| 症状 | 本体系的对应件 |
| --- | --- |
| 模型给个结论就停，把活推回给人 | `rules/00-global.md`「推进与停止」+「输出形状」（按任务组织，给出可执行的判据） |
| 满口套话、答复像推理笔记，离开前面的播报就读不懂 | `rules/00-global.md`「语言与写作」「答复自包含」（为读者重写，不复用推理简写） |
| 只说「根因未定」，不给可执行的下一步 | `agent/rules/40-debug.md` + `playbooks/30-debug.md` |
| 新会话重复做已经做完的事 | `agent/context/archive/ARCHIVE_INDEX.md` + `rules/60-archive.md` |
| 引用几个月前的结论当现状 | 文档 `status` 字段 + 归档卡「失效条件」 |
| 需求/选型拍脑袋 | `rules/50-research.md`（先查本地，按决策风险补充外部证据） |
| 改 A 工程顺手动了 B 工程 | `rules/70-isolation.md`（默认互不读写） |
| 代码 / UI / 文档里留下「按照用户要求…」 | `rules/15-audience.md`（写给最终读者，对话痕迹只进回复） |
| 规则越写越长，模型开始不遵守 | 三层预算 + `verify` 机器校验 |

## 三层预算（为什么主文件必须短）

| 层 | 文件 | 预算 | 变化频率 |
| --- | --- | --- | --- |
| 路由层 | `AGENTS.md` | ≤ 60 行 | 几乎不变 |
| 索引层 | `agent/index.md` | ≤ 120 行 | 新增能力时 |
| 内容层 | `agent/rules/*`、`playbooks/*`、`context/*` | 单文件 ≤ 200 行 | 高频 |

依据（2026-11 复核）：Anthropic 对 CLAUDE.md 的要求是 *target under 200 lines* ——「Longer files consume more context and reduce adherence」（`code.claude.com/docs/en/memory`）；
`AGENTS.md` 规范（agents.md）明说没有必填字段、就是普通 Markdown，也没有行数要求。所以 200 是外部建议，60 是本体系自定的**路由预算**。

## 生成的目录

```
AGENTS.md                     # 路由层（≤60 行）
agent/
  index.md                    # 索引层：触发条件 → 文件
  rules/                      # 约束
    00-global.md              #   写作与措辞、答复自包含、推进与停止、证据分级、输出形状
    10-code.md                #   改代码纪律
    15-audience.md            #   受众与措辞：UI 文案、注释、TODO 写给谁；对话痕迹不进产物
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

工作区模式（`--mode workspace`）把 `AGENTS.md` 换成工作区路由（工程清单在 `agent/index.md`），
`projects/` 下每个子目录各自再跑一次工程级 `init`。**代码地图不在这里**：
沿用 `code-map` 的 `doc/CODE_MAP_INDEX.md` 契约，避免两套地图漂移。

## 接手入口

从目标工程现有 README、CI 或维护文档取构建目录、最小验证命令和高代价边界。已有可靠入口时直接链接。旧工程优先复用原说明，补充信息写入 `agent/context/software.md`。

## 工作流程

```
Task Progress:
- [ ] Step 1: detect，判断形态（新工程 / 旧工程 / 多工程工作区）
- [ ] Step 2: 旧工程先 audit + plan，把重构方案给用户确认
- [ ] Step 3: dry-run，把会写什么念给用户
- [ ] Step 4: init 或 adopt（工作区先工作区级，再逐工程）
- [ ] Step 5: 核对工程命令、填事实卡与交接记录
- [ ] Step 6: 运行 verify，再做一次真实任务验收，说明回滚入口
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
node <skill>/scripts/migrate.mjs plan  <目录>          # 生成 .agent-kit/MIGRATION.md 供人确认，动作存入同目录的 migration.plan.json
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
3. marker 残缺、重复或顺序错误时，`adopt` 在写入其他文件之前报错退出。
4. 已存在的索引、分片和事实卡默认跳过。`--force` 会先备份再覆盖这些文件，也会刷新工具创建的根路由。第一份备份为 `.bak`，后续使用 `.bak.1` 等编号。

### Step 5 · 填充事实卡（只写指针，不搬正文）

四段固定，示例与写法在 `agent/rules/30-docs.md`（`verify` 会查「事实源」段里有没有可点路径）：

| 段 | 写什么 |
| --- | --- |
| `## 事实源` | 文件指针 + 哪个版本有效、哪个已作废 |
| `## 当前结论` | 结论 + 证据等级 |
| `## 未决项` | 卡在哪、谁来裁决 |
| `## 最后更新` | 日期 / 更新人 |

`plan.md` 记录当前目标、最近验证的版本与环境、命令、实际结果、证据位置和下一步判据。
这三张卡是「事实源指针」，不是正文副本 —— 正文会过期，链接不会。

### Step 6 · 验收与回滚

```powershell
node <skill>/scripts/scaffold.mjs verify    <目录>
node <skill>/scripts/scaffold.mjs uninstall <目录> --dry-run
```

`verify` 检查 marker 的数量与顺序、内置分片的行数预算、事实卡「事实源」段的反引号路径格式、归档与调研索引。
缺必需文件或 marker 异常时退出码为 1。手改造成的哈希差异、事实卡缺 `status` 和可选代码地图缺失会列为警告。指针指向的内容仍需人工核对。
`uninstall` 只删 manifest 记录且 hash 未变的文件，只剥 marker 区块；手工改过的保留并报告。
工程验收另做一次：让干净会话从根入口领取一个有已知判据的小任务，找到并运行对应最小验证。记录命令、结果、未覆盖项。缺设备时标「待上板」。验收失败就改误导它的入口或命令，再试同一任务。

旧工程升级时先运行 `verify`。在临时空目录用相同模式生成新版，对照差异合并需要的入口、规则和交接字段，保留原有工程命令、事实和进度。

## 把用户的新想法固化进体系

用户随时会说「再加一条规则」「这里要这样」。**不要手改模板，也不要只改一个文件**：

```powershell
node <skill>/scripts/scaffold.mjs extend <目录> --title "日志必须带时间戳与设备序列号" `
  --body "现场日志缺时间戳，无法和 DUT 断电时刻对齐。" --slug log-timestamp
```

`extend` 会：按现有编号 +10 建 `agent/rules/NN-slug.md` → 往 `agent/index.md` 规则表加一行 →
在 `agent/context/decisions.md` 记一条带「为什么 / 影响面 / 可逆性」的决策 →
同步 manifest。新增规则只在索引登记。
新增**能力**（不是规则）用 `skill-author`，两种都要先跟用户确认落到哪一层。

## 阶段与规则的接线

- 五个阶段依次使用 `playbooks/10~50-*.md`。每个阶段按任务查 `agent/index.md`，选择对应规则。
- 归档不是终点：每条必须有**状态 + 失效条件**；`workaround` 不得标成已修复 —— 否则下一个 agent 会把已绕过的问题当已解决。
- 需求/选型先查本地，按风险与证据缺口做外部核验；采信标准见 `rules/50-research.md`（官方文档 > 有署名工程博客 > 论坛）。

## 反模式

- ❌ 把所有规则塞进 `AGENTS.md` —— 超过预算等于没写。
- ❌ `cp AGENTS.md` 覆盖旧工程 —— 抹掉既有约定，且不可逆。
- ❌ 在 `context/` 里复制需求正文 —— 第二次变更就全过期。
- ❌ 旧工程上来就全量重构 —— 先 `audit`/`plan`，拿到用户确认再 `apply`。
- ❌ 让本 skill 接管代码地图 —— `code-map` 是 SSOT，重复造只会漂移。
- ❌ 归档只写「已完成」不写「为什么当时这么定、什么条件下会失效」—— 半年后没人敢动。
