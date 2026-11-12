#!/usr/bin/env node
/**
 * skill-author · 按本仓库约定新增与校验技能目录
 *
 *   node new-skill.mjs new   <仓库目录> <name> --desc "作用一句话 + 何时用" [--force]
 *   node new-skill.mjs check <仓库目录>
 *   node new-skill.mjs list  <仓库目录>
 *
 * 约定：一个目录一个技能；目录名 == SKILL.md frontmatter 的 name；仓库根不放 SKILL.md；
 * 技能目录自包含；README 的「技能」表登记一行。
 */
import fs from 'node:fs';
import path from 'node:path';

const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const head = (m) => console.log(`\n${m}`);

const NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BODY_WARN_LINES = 200;

function readIf(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function skillDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !n.startsWith('.') && n !== 'node_modules')
    .filter((n) => fs.existsSync(path.join(root, n, 'SKILL.md')));
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?\s*$/.test(v)) {
      const parts = [];
      let j = i + 1;
      while (j < lines.length && (/^\s+/.test(lines[j]) || lines[j].trim() === '')) {
        if (lines[j].trim()) parts.push(lines[j].trim());
        j++;
      }
      i = j - 1;
      v = parts.join(' ');
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    fm[kv[1]] = v;
  }
  return fm;
}

// ------------------------------------------------------------------ new
function newSkill(root, name, opts) {
  head(`new · ${name}`);
  if (!NAME_RE.test(name)) {
    bad('名字必须是小写连字符（如 agent-scaffold），不能有空格/大写/下划线');
    return 2;
  }
  const dir = path.join(root, name);
  if (fs.existsSync(dir) && !opts.force) {
    bad(`目录已存在：${name}（要覆盖加 --force）`);
    return 1;
  }
  const desc = opts.desc || `${name}：一句话说明作用。Use when the user asks to ...`;
  const body = `---
name: ${name}
description: >-
  ${desc}
---

# ${name}

（一句话：给谁解决什么问题）

## 何时用

- 场景一：
- 场景二：

**不要用在**：

## 工作流程

\`\`\`
Task Progress:
- [ ] Step 1: 
- [ ] Step 2: 
- [ ] Step 3: 
\`\`\`

### Step 1 · 

\`\`\`powershell
node <skill>/scripts/${name}.mjs 
\`\`\`

## 契约 / 产物

| 产物 | 路径 | 谁写 |
| --- | --- | --- |

## 反模式

- ❌ 
`;
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
  ok(`创建 ${name}/SKILL.md`);
  ok(`创建 ${name}/scripts/`);

  const readme = path.join(root, 'README.md');
  const text = readIf(readme);
  if (text) {
    const row = `| [\`${name}\`](${name}/) | ${desc.replace(/\|/g, '\\|').slice(0, 120)} |`;
    if (text.includes(`[\`${name}\`](${name}/)`)) {
      info('README 技能表已有该行，未改');
    } else {
      const lines = text.split(/\r?\n/);
      let lastRow = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\|\s*\[`[a-z-]+`\]\([a-z-]+\/\)/.test(lines[i])) lastRow = i;
      }
      if (lastRow === -1) {
        warn('README 里找不到技能表，请手工加一行');
      } else {
        lines.splice(lastRow + 1, 0, row);
        fs.writeFileSync(readme, lines.join('\n'), 'utf8');
        ok('README 技能表已加一行');
      }
    }
  } else {
    warn('没有 README.md，未登记');
  }

  head('下一步');
  info(`写正文：${name}/SKILL.md（≤200 行，description 里放全触发关键词）`);
  info(`node new-skill.mjs check ${root}`);
  return 0;
}

// ------------------------------------------------------------------ check
function check(root) {
  head(`check · ${root}`);
  let errs = 0;
  let warns = 0;

  if (fs.existsSync(path.join(root, 'SKILL.md'))) {
    bad('仓库根有 SKILL.md —— 会被装成 magpie-skill-<数字>，删掉它，放进技能目录');
    errs++;
  }

  const dirs = skillDirs(root);
  if (!dirs.length) {
    bad('没有任何技能目录（缺 <name>/SKILL.md）');
    return 1;
  }
  info(`技能 ${dirs.length} 个：${dirs.join(', ')}`);

  const readme = readIf(path.join(root, 'README.md')) || '';

  for (const name of dirs) {
    const dir = path.join(root, name);
    const text = readIf(path.join(dir, 'SKILL.md')) || '';
    const fm = parseFrontmatter(text);

    if (!fm) {
      bad(`${name}: SKILL.md 缺 frontmatter`);
      errs++;
      continue;
    }
    if (!fm.name) {
      bad(`${name}: frontmatter 缺 name`);
      errs++;
    } else if (fm.name !== name) {
      bad(`${name}: name="${fm.name}" 与目录名不一致`);
      errs++;
    }
    if (!fm.description || fm.description.length < 10) {
      bad(`${name}: description 太短（要写「作用 + 什么时候用」）`);
      errs++;
    }
    const lines = text.replace(/\n+$/, '').split(/\r?\n/).length;
    if (lines > BODY_WARN_LINES) {
      warn(`${name}: SKILL.md ${lines} 行 > ${BODY_WARN_LINES}，建议把细节挪到 references/`);
      warns++;
    }
    if (!readme.includes(`](${name}/)`) && !readme.includes(`](${name})`)) {
      warn(`${name}: README 技能表里没有这一行`);
      warns++;
    }
    const scripts = path.join(dir, 'scripts');
    if (fs.existsSync(scripts)) {
      const bad_ = fs
        .readdirSync(scripts)
        .filter((f) => !f.startsWith('.'))
        .filter((f) => !/\.(mjs|js|cjs|ps1|sh|py)$/.test(f));
      if (bad_.length) warn(`${name}: scripts/ 里有非脚本文件 ${bad_.join(', ')}`);
    }
  }

  head(errs ? `失败：${errs} 个错误，${warns} 个警告` : `通过：0 个错误，${warns} 个警告`);
  return errs ? 1 : 0;
}

// ------------------------------------------------------------------ list
function list(root) {
  head(`list · ${root}`);
  for (const name of skillDirs(root)) {
    const text = readIf(path.join(root, name, 'SKILL.md')) || '';
    const fm = parseFrontmatter(text) || {};
    const lines = text.replace(/\n+$/, '').split(/\r?\n/).length;
    info(`${name.padEnd(20)} ${String(lines).padStart(4)} 行  ${(fm.description || '(无描述)').slice(0, 70)}`);
  }
  return 0;
}

// ------------------------------------------------------------------ entry
function main(argv) {
  const cmd = argv[2];
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const val = (n) => {
    const i = argv.indexOf(n);
    return i !== -1 ? argv[i + 1] : null;
  };
  const pos = [];
  for (let i = 3; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      if (['--desc'].includes(argv[i])) i++;
      continue;
    }
    pos.push(argv[i]);
  }
  const root = path.resolve(pos[0] || '.');
  const opts = { desc: val('--desc'), force: flags.has('--force') };

  switch (cmd) {
    case 'new':
      if (!pos[1]) {
        bad('缺少技能名：new <仓库> <name> --desc "..."');
        return 2;
      }
      return newSkill(root, pos[1], opts);
    case 'check':
      return check(root);
    case 'list':
      return list(root);
    default:
      console.log(`skill-author

用法：
  node new-skill.mjs new   <仓库目录> <name> --desc "作用 + 何时用" [--force]
  node new-skill.mjs check <仓库目录>
  node new-skill.mjs list  <仓库目录>

约定：一个目录一个技能；目录名 == frontmatter name；仓库根不放 SKILL.md；
技能目录自包含；README 技能表登记一行；SKILL.md ≤ 200 行。`);
      return cmd ? 2 : 0;
  }
}

process.exit(main(process.argv));
