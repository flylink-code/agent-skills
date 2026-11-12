---
name: skill-author
description: >-
  Author a new reusable skill directory that conforms to this repository's conventions
  (one directory per skill, directory name equals SKILL.md frontmatter `name`, self-contained
  scripts/templates, README registry updated). Use when the user asks to 新建 skill, 写一个技能,
  生成可复用能力, 把这个流程做成 skill, 抽取成 skill, add a skill to the repo, or wants a
  repeatable procedure packaged so later sessions can invoke it instead of re-explaining it.
---

# 新建 Skill

把一个反复出现的流程，固化成仓库里一个自包含、可被自动发现的技能目录。

## 仓库约定（硬性）

| 规则 | 说明 |
| --- | --- |
| 一目录一技能 | `agent-skills/<name>/SKILL.md` |
| 目录名 = `name` | frontmatter 的 `name` 必须与目录名逐字一致（小写、连字符） |
| `name` 格式 | `^[a-z0-9]+(-[a-z0-9]+)*$`，≤ 64 字符 |
| `description` | 非空、≤ 1024 字符，写清**做什么 + 什么时候用**（含中英文触发词） |
| 自包含 | 脚本、模板放在技能目录内，不引用目录外相对路径 |
| 根目录不放 SKILL.md | 仓库根只有 README 与各技能目录 |
| 登记 | 仓库 `README.md` 的技能表加一行 |

## 工作流程

```
Task Progress:
- [ ] Step 1: 判断该不该做成 skill
- [ ] Step 2: 命名并写 frontmatter
- [ ] Step 3: 写正文（工作流 + 验收 + 反模式）
- [ ] Step 4: 需要脚本/模板时一并生成
- [ ] Step 5: 跑校验脚本
- [ ] Step 6: 更新 README 技能表
```

### Step 1: 该不该做成 skill

做成 skill 的条件（满足 2 条以上）：

- 这套流程会被**重复执行**，且每次解释成本高。
- 有**可判定的成功标准**（不是"看看效果"）。
- 需要**具体文件产物**（配置、代码、目录结构）。
- 有很多**易错细节**，靠记忆每次都会漏。

不该做成 skill 的：一次性问答、纯口味偏好、需要人实时判断且无判据的。

### Step 2: 命名

- 用**动作 + 对象**：`agent-scaffold`、`skill-author`、`code-map`。
- 不要用 `helper`、`utils`、`my-skill` 这类无信息量的名字。
- 名字要能被"触发词"直接想到。

### Step 3: 正文结构

```markdown
---
name: <与目录名一致>
description: >-
  <做什么。> Use when <什么时候用，含用户可能的原话触发词。>
---

# <标题>

<一句话说明解决什么问题>

## 工作流程
Task Progress:
- [ ] Step 1: ...
（每步写：做什么 → 命令 → 判定标准）

## 验收
（怎么算成功，尽量可机械校验）

## 反模式
- ❌ ...
```

正文要求：

- **步骤可执行**：给命令、给路径、给判定标准；不要"根据需要调整"。
- **验收可机械校验**：能用脚本检查的，别写"检查是否正确"。
- **反模式必写**：这是后来者最容易踩的坑，比正向说明更有用。
- 单个 SKILL.md ≤ 500 行；超了拆 `references/*.md`，正文只留指针。

### Step 4: 脚本与模板

- 脚本放 `scripts/`，模板放 `templates/`。
- 脚本必须能被 `node <skill>/scripts/xxx.mjs` 直接跑，不依赖 `npm install`。
- 路径解析一律相对**脚本自身**（`import.meta.url`），不要相对 cwd。
- 模板里的占位符统一 `{{UPPER_SNAKE}}`。

### Step 5: 校验

```powershell
node <skill>/scripts/new-skill.mjs check   <技能目录>
node <skill>/scripts/new-skill.mjs check   <仓库根>
```

检查项：

- 目录名与 `name` 一致
- `name` 匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`
- `description` 非空且 ≤ 1024 字符
- SKILL.md 有 `## ` 级小节，有验收/检查类小节
- 脚本不引用目录外的 `../..` 相对路径
- 仓库 README 技能表含该技能

### Step 6: 生成骨架（可选）

```powershell
node <skill>/scripts/new-skill.mjs new <仓库根> <name> --desc "做什么。Use when ..."
```

会创建目录、SKILL.md 骨架，并在 README 技能表追加一行（幂等，已存在则跳过）。

## 验收

- `check` 全绿。
- 新开一个会话，只说"用 <name> 做 X"，能被正确触发，且不需要补充背景。
- `description` 里包含至少一个用户会真实说出口的中文触发词。

## 反模式

- ❌ `description` 写成"这个技能很有用" —— 触发词缺失，永远不会被选中。
- ❌ 目录名 `My_Skill` 而 `name: my-skill` —— 加载器会拒绝。
- ❌ 正文写"根据项目情况调整" —— 等于没写，下次还得重新想。
- ❌ 脚本里写 `E:\...` 绝对路径 —— 换机器即坏。
- ❌ 一个技能塞 5 件不相干的事 —— 拆成 5 个技能。
