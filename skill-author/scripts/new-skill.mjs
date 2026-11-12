#!/usr/bin/env node
/**
 * skill-author · 技能骨架生成与约定校验
 *
 *   node new-skill.mjs new   <仓库根> <name> --desc "做什么。Use when ..."
 *   node new-skill.mjs check <技能目录 | 仓库根>
 *
 * 仓库约定：一目录一技能，目录名 == frontmatter name，自包含，README 技能表登记。
 */
import fs from 'node:fs';
import path from 'node:path';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DESC_MAX = 1024;

const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const head = (m) => console.log(`\n${m}`);

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 解析 frontmatter 的 name / description（支持 >- 与 | 块标量） */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const raw = text.slice(3, end).split(/\r?\n/);
  const out = {};
  let cur = null;
  for (const line of raw) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) {
      cur = m[1];
      out[cur] = m[2];
      continue;
    }
    if (cur && /^\s+/.test(line)) {
      out[cur] = `${out[cur]}\n${line.trim()}`;
    }
  }
  for (const k of Object.keys(out)) {
    out[k] = out[k]
      .replace(/^[>|][-+]?\s*/, '')
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === '.git') continue;
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------- check one skill
function checkSkill(dir) {
  const base = path.basename(dir);
  const skillPath = path.join(dir, 'SKILL.md');
  let errs = 0;
  let warns = 0;

  if (!exists(skillPath)) {
    bad(`${base}/SKILL.md 缺失`);
    return { errs: 1, warns: 0 };
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) {
    bad(`${base}/SKILL.md 缺少 frontmatter`);
    return { errs: 1, warns: 0 };
  }
  if (!fm.name) {
    bad(`${base}: frontmatter 缺 name`);
    errs++;
  } else if (fm.name !== base) {
    bad(`${base}: name "${fm.name}" 与目录名不一致`);
    errs++;
  } else if (!NAME_RE.test(fm.name)) {
    bad(`${base}: name 不符合 ^[a-z0-9]+(-[a-z0-9]+)*$`);
    errs++;
  } else if (fm.name.length > 64) {
    bad(`${base}: name 超过 64 字符`);
    errs++;
  }
  if (!fm.description) {
    bad(`${base}: description 为空`);
    errs++;
  } else if (fm.description.length > DESC_MAX) {
    bad(`${base}: description ${fm.description.length} 字符 > ${DESC_MAX}`);
    errs++;
  } else if (!/use when|当|用于|需要|要/i.test(fm.description)) {
    warn(`${base}: description 缺触发语境（建议含 "Use when ..." 与用户原话触发词）`);
    warns++;
  }

  const sections = [...text.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim());
  if (!sections.length) {
    bad(`${base}: 正文无 "## " 级小节`);
    errs++;
  }
  if (!sections.some((s) => /验收|验收标准|检查|自检|verify|check/i.test(s))) {
    warn(`${base}: 缺「验收/检查」小节`);
    warns++;
  }
  if (!sections.some((s) => /反模式|不要|禁止|禁区|anti/i.test(s))) {
    warn(`${base}: 缺「反模式/禁区」小节`);
    warns++;
  }

  const lines = text.replace(/\n+$/, '').split(/\r?\n/).length;
  if (lines > 500) {
    warn(`${base}: SKILL.md ${lines} 行 > 500，建议拆 references/`);
    warns++;
  }

  // 自包含：脚本不得写死本机路径，也不得指向技能目录之外
  // 只查可执行脚本；文档里的「反例路径」不算违规
  const files = walk(dir).filter((p) => /\.(mjs|cjs|js|ps1|sh)$/.test(p));
  for (const p of files) {
    const body = fs.readFileSync(p, 'utf8');
    const rel = path.relative(dir, p);
    if (/["'`][A-Za-z]:\\|["'`]\/Users\/|["'`]\/home\//.test(body)) {
      bad(`${base}/${rel}: 含本机绝对路径字面量`);
      errs++;
    }
    if (/\.\.\/(\.\.\/)+/.test(body)) {
      bad(`${base}/${rel}: 引用技能目录之外（../..）`);
      errs++;
    }
  }

  if (errs === 0) ok(`${base} · ${lines} 行 · ${sections.length} 个二级小节`);
  return { errs, warns };
}

// ---------------------------------------------------------------- check repo
function checkRepo(root) {
  head(`check · ${root}`);
  const readme = path.join(root, 'README.md');
  if (!exists(readme)) {
    bad('README.md 缺失（应有技能表）');
    return 1;
  }
  const rtext = fs.readFileSync(readme, 'utf8');
  if (exists(path.join(root, 'SKILL.md'))) {
    bad('仓库根不应该有 SKILL.md（会装成 magpie-skill-<数字>）');
    return 1;
  }
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && exists(path.join(root, e.name, 'SKILL.md')))
    .map((e) => e.name);

  let errs = 0;
  let warns = 0;
  head(`技能 ${dirs.length} 个`);
  for (const d of dirs) {
    const r = checkSkill(path.join(root, d));
    errs += r.errs;
    warns += r.warns;
    if (!new RegExp(`\\]\\(${d}/?\\)`).test(rtext)) {
      warn(`README 技能表缺 ${d}`);
      warns++;
    }
  }
  const extra = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !dirs.includes(e.name));
  for (const e of extra) info(`非技能目录，忽略：${e.name}`);

  head(errs ? `失败：${errs} 个错误，${warns} 个警告` : `通过：0 个错误，${warns} 个警告`);
  return errs ? 1 : 0;
}

// ---------------------------------------------------------------- new
function skeleton(name, desc) {
  return `---
name: ${name}
description: >-
  ${desc.replace(/\s+/g, ' ').trim()}
---

# ${name}

<一句话：解决什么问题>

## 工作流程

\`\`\`
Task Progress:
- [ ] Step 1: 
- [ ] Step 2: 
\`\`\`

### Step 1: 

- 做什么：
- 命令：
- 判定标准：

## 验收

- 

## 反模式

- ❌ 
`;
}

function addReadmeRow(root, name, desc) {
  const readme = path.join(root, 'README.md');
  const text = fs.readFileSync(readme, 'utf8');
  if (new RegExp(`\\]\\(${name}/?\\)`).test(text)) {
    info(`README 已有 ${name}，未重复登记`);
    return false;
  }
  const row = `| [\`${name}\`](${name}/) | ${desc.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 120)} |`;
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^\|\s*技能\s*\|/.test(l));
  if (h === -1) {
    warn('README 里没找到技能表，请手工登记');
    return false;
  }
  let i = h + 1;
  while (i < lines.length && lines[i].startsWith('|')) i++;
  lines.splice(i, 0, row);
  fs.writeFileSync(readme, lines.join('\n'), 'utf8');
  ok(`README 技能表已追加 ${name}`);
  return true;
}

function newSkill(root, name, desc) {
  head(`new · ${name}`);
  if (!NAME_RE.test(name)) {
    bad(`name 不符合 ^[a-z0-9]+(-[a-z0-9]+)*$：${name}`);
    return 1;
  }
  if (!desc) {
    bad('缺少 --desc（写清做什么 + 什么时候用）');
    return 1;
  }
  const dir = path.join(root, name);
  if (exists(dir)) {
    bad(`目录已存在：${name}`);
    return 1;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skeleton(name, desc), 'utf8');
  ok(`创建 ${name}/SKILL.md`);
  if (exists(path.join(root, 'README.md'))) addReadmeRow(root, name, desc);
  head('下一步');
  info(`补全 ${name}/SKILL.md 的步骤、验收、反模式`);
  info(`跑 node new-skill.mjs check ${root}`);
  return 0;
}

// ---------------------------------------------------------------- entry
function main(argv) {
  const cmd = argv[2];
  const args = argv.slice(3);
  const di = args.indexOf('--desc');
  const desc = di !== -1 ? args[di + 1] : null;
  const pos = args.filter((a, i) => !a.startsWith('--') && !(di !== -1 && i === di + 1));

  if (cmd === 'new') {
    const root = path.resolve(pos[0] || '.');
    const name = pos[1];
    if (!name) {
      bad('用法：new <仓库根> <name> --desc "..."');
      return 2;
    }
    return newSkill(root, name, desc);
  }
  if (cmd === 'check') {
    const target = path.resolve(pos[0] || '.');
    if (!exists(target)) {
      bad(`路径不存在：${target}`);
      return 2;
    }
    if (exists(path.join(target, 'SKILL.md'))) {
      head(`check · ${target}`);
      const r = checkSkill(target);
      head(r.errs ? `失败：${r.errs} 个错误` : `通过：0 个错误，${r.warns} 个警告`);
      return r.errs ? 1 : 0;
    }
    return checkRepo(target);
  }

  console.log(`skill-author v1.0.0

用法：
  node new-skill.mjs new   <仓库根> <name> --desc "做什么。Use when ..."
  node new-skill.mjs check <技能目录 | 仓库根>`);
  return cmd ? 2 : 0;
}

process.exit(main(process.argv));
