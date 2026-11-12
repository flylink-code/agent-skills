---
name: agent-scaffold
description: >-
  Bootstrap or adopt a router-based agent knowledge system for a project/factory: a ≤60-line
  AGENTS.md router, an agent/ index layer, rules/ and context/ shards, with idempotent and
  non-destructive install for repos that already have an AGENTS.md and lots of legacy docs.
  Use when the user asks to 建立 agent 文件体系, 初始化 agent 配置, 新工厂接入 agent, 旧工程接入
  agent, 生成 AGENTS.md, 设计 agent 目录结构, agent 主文件, 项目知识库索引, or wants a reusable
  AGENTS.md that routes to code maps, plans, requirements and hardware/software docs.
---

# Agent 文件体系：初始化与接入

给一个工厂（项目仓库）搭一套**路由式** Agent 知识体系：主文件只做索引，细节按需读取。

## 为什么是路由式

常驻上下文预算很小，工厂知识是无限的。所以：

| 层 | 文件 | 预算 | 变化频率 |
| --- | --- | --- | --- |
| 路由层 | `AGENTS.md` | ≤ 60 行 | 几乎不变 |
| 索引层 | `agent/index.md` | ≤ 120 行 | 新增能力时 |
| 内容层 | `agent/rules/*`、`agent/context/*` | 单文件 ≤ 200 行 | 高频 |

**硬约束**：`AGENTS.md` 超过 60 行，靠后的规则基本失效。宁可拆文件，不要扩主文件。

## 工作流程

```
Task Progress:
- [ ] Step 1: 判定形态（新工厂 / 旧工厂）与已有 AGENTS.md 状态
- [ ] Step 2: dry-run 看会写什么
- [ ] Step 3: 执行 init 或 adopt
- [ ] Step 4: 填充 context 摘要卡（只写指针，不搬正文）
- [ ] Step 5: verify，确认预算与 marker 唯一
- [ ] Step 6: 告知用户如何回滚
```

### Step 1: 判定形态

```powershell
node <skill>/scripts/scaffold.mjs detect <项目目录>
```

| 形态 | 判据 | 做法 |
| --- | --- | --- |
| 新工厂 | 无 `AGENTS.md`、无 `agent/` | `init`：全量生成 |
| 旧工厂·干净 | 有 `AGENTS.md`，无 kit marker | `adopt`：末尾注入 marker 区块 |
| 旧工厂·已接入 | 有 kit marker | `adopt`：**只**替换 marker 区块，幂等 |
| 已手工改过 | `agent/.manifest.json` 里 hash 不匹配 | 不覆盖，只提示差异 |

### Step 2: 预览

```powershell
node <skill>/scripts/scaffold.mjs init  <项目目录> --dry-run
node <skill>/scripts/scaffold.mjs adopt <项目目录> --dry-run
```

**必须先跑 dry-run 并把结果念给用户**，尤其是 adopt：让用户知道会动 `AGENTS.md` 的哪一段。

### Step 3: 执行

```powershell
node <skill>/scripts/scaffold.mjs init  <项目目录> --name "工厂名"
node <skill>/scripts/scaffold.mjs adopt <项目目录>
```

`adopt` 的铁律：

1. **只增不改**。除 `AGENTS.md` 的 marker 区块外，不动任何既有文件。
2. **marker 区块内可重入**，区块外一个字节都不碰（`<!-- agent-kit:begin -->` / `<!-- agent-kit:end -->`）。
3. **不搬、不改名、不格式化**旧文档。需求文档、会议记录、历史记录留在原位。
4. `agent/` 下已存在的文件默认不覆盖，需 `--force` 才覆盖，且先备份为 `.bak`。

### Step 4: 填充 context 摘要卡

`agent/context/*.md` 是**摘要卡**，不是正文副本。每张卡固定四段：

```markdown
## 事实源
- 需求 v2.3：`docs/req/需求_v2.3.docx`（唯一有效版本）
## 当前结论
- 采样率 600 Mbps；AC 功能本期不做。
## 未决项
- DQ 收尾失败的兜底策略未定（见 `agent/rules/40-debug.md`）。
## 最后更新
- 2026-11-12 / 谁更新的
```

**反模式**：把 docx 正文粘进 md。正文会立刻过期，链接不会。

### Step 5: 验收

```powershell
node <skill>/scripts/scaffold.mjs verify <项目目录>
```

必须全绿：

- `AGENTS.md` ≤ 60 行，且 marker 恰好一对
- `agent/index.md` ≤ 120 行
- 每个 `agent/rules/*.md`、`agent/context/*.md` ≤ 200 行
- 每个 context 卡片都含“事实源”段且至少一个路径
- `agent/.manifest.json` 存在且 hash 与磁盘一致

### Step 6: 回滚

```powershell
node <skill>/scripts/scaffold.mjs uninstall <项目目录> --dry-run
node <skill>/scripts/scaffold.mjs uninstall <项目目录>
```

只删除 manifest 记录的、且 hash 未被改动的文件；只剥掉 marker 区块。手工改过的文件一律保留并报告。

## 生成的结构

```
AGENTS.md                 # 路由层（≤60 行）
agent/
  index.md                # 触发条件 → 文件
  rules/
    00-global.md          # 语言、证据分级、输出形状、禁区
    10-code.md            # 改代码纪律
    20-git.md             # 提交与分支
    30-docs.md            # 文档规范
    40-debug.md           # 排查协议（证据 / 假设 / 分支 / 下一步）
  context/
    requirements.md       # 摘要卡 + 指针
    hardware.md
    software.md
    plan.md
    decisions.md
  .manifest.json          # kit 写入记录，供 verify / uninstall
```

代码地图**不在**这里：沿用 `code-map` 的 `doc/` 契约（`doc/CODE_MAP_INDEX.md`、`doc/codemap/`），避免两套地图打架。

## 与 code-map 的接线

`AGENTS.md` 路由表里固定一行：

> 需要符号定位 → 先读 `doc/CODE_MAP_INDEX.md`；**不存在** → 用 `code-map` skill 生成后再读。

生成后把结果写回 `agent/index.md` 的一行（页数、模块数、生成日期）。图谱是缓存不是真相，与源码冲突以源码为准。

## 反模式

- ❌ 把所有规则塞进 `AGENTS.md` —— 超过 60 行等于没写。
- ❌ 用 `cp AGENTS.md` 覆盖旧工厂的文件 —— 会抹掉既有约定。
- ❌ 在 `context/` 里复制需求正文 —— 第二次需求变更就全部过期。
- ❌ 为每个语种/每个 Agent 各维护一份 —— 用 `CLAUDE.md` 软链到 `AGENTS.md` 即可。
- ❌ 让 kit 接管地图生成 —— `code-map` 已经是 SSOT，重复造只会漂移。
