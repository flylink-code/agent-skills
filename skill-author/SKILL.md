---
name: skill-author
description: >-
  Create, validate and register new skills in this repository following its conventions: one
  directory per skill, directory name equal to the SKILL.md frontmatter `name`, self-contained
  scripts/templates, README skill-table entry, and a cheap always-loaded description that does
  not duplicate the body.
  Use when the user asks to 新增技能, 写一个 skill, 生成 SKILL.md, 把这个流程做成技能,
  校验技能目录, 更新 README 技能表, 或者判断「这条要求该写成规则还是技能」.
---

# 新增与校验技能

本仓库约定：**一个目录一个技能**，目录名 = `SKILL.md` frontmatter 的 `name`；
技能目录自包含（脚本、模板都在自己目录内）；README 有一张技能表。

## 先判断：该写规则还是技能

| 判断 | 写什么 |
| --- | --- |
| 一句话就能说清的约束，任何任务都要遵守 | 规则：`agent-scaffold extend`（进 `agent/rules/`） |
| 多步流程、有脚本、只在某类任务才用到 | 技能：本 skill |
| 只对某个目录/文件类型生效 | 规则 + 路径条件，别做成技能 |
| 需要跑命令产生产物（地图、清单、脚手架） | 技能 + `scripts/` |

**关键**：`description` 是常驻上下文（每个会话都会看到），正文只在命中时才读。
所以 `description` 要把「什么时候用」写全（中英文关键词都放），正文只放步骤。

## 工作流程

```
Task Progress:
- [ ] Step 1: 确认 name（小写连字符）、作用一句话、触发关键词
- [ ] Step 2: 生成骨架 node scripts/new-skill.mjs new <仓库> <name> --desc "..."
- [ ] Step 3: 写正文：为什么 / 工作流程 / 命令 / 反模式
- [ ] Step 4: 脚本实测（至少跑一次 dry-run 与一次真实执行）
- [ ] Step 5: node scripts/new-skill.mjs check <仓库> 全绿
- [ ] Step 6: README 技能表已自动登记；提交
```

### Step 2 · 生成骨架

```powershell
node <skill>/scripts/new-skill.mjs new <仓库目录> my-skill --desc "一句话作用 + 什么时候用"
```

生成 `my-skill/SKILL.md`（带 frontmatter 与章节骨架）与 `my-skill/scripts/`；
同时在 README 技能表末尾追加一行。目录已存在时拒绝，不加 `--force` 就不覆盖。

### Step 3 · 正文该写什么

| 章节 | 内容 | 不要写 |
| --- | --- | --- |
| 为什么 / 解决什么 | 症状 → 对应件，让人信服 | 空泛的价值主张 |
| 工作流程 | 编号步骤 + 每步命令 + 判定标准 | 把整篇文档复述一遍 |
| 目录 / 契约 | 产物路径、配置键、CLI | 实现细节 |
| 反模式 | 明确「别这么干」及其后果 | 泛泛的「注意安全」 |

行数：`SKILL.md` 建议 ≤ 200 行（模型读长文件会漏后段）；超了就把细节挪到
`references/*.md`，在正文里留一句「需要 X 时读 references/x.md」。

### Step 5 · 校验

```powershell
node <skill>/scripts/new-skill.mjs check <仓库目录>
node <skill>/scripts/new-skill.mjs list  <仓库目录>
```

`check` 检查：每个技能目录都有 `SKILL.md`；frontmatter `name` 与目录名一致；
`description` 非空且含触发关键词；仓库根**没有** `SKILL.md`；README 技能表里有对应行；
`SKILL.md` 行数不超 200（超了给警告而不是报错）。

## 提交前自检

1. 换一个模型只看 `description`，它知道什么时候该用这个技能吗？
2. 只读正文不看脚本，能照着跑通吗？
3. 脚本在干净目录里能跑吗（不依赖当前工作目录、不依赖已存在的中间产物）？
4. 失败时给的是「下一步」还是「报错就停」？

## 反模式

- ❌ 在仓库根放 `SKILL.md` —— magpie 会装成 `magpie-skill-<数字>`。
- ❌ 目录名与 `name` 不一致 —— magpie 用目录名、DSH 读 frontmatter，两边会分裂。
- ❌ 把长流程塞进 `description` —— 每个会话都要付这份 token，而正文可能一次都不读。
- ❌ 技能之间互相 `require` 对方目录里的脚本 —— 安装时只复制单个目录，会断。
- ❌ 只写「怎么做」不写「什么时候不该用」—— 模型会在不该用的时候用它。
