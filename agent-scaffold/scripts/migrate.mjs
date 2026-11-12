#!/usr/bin/env node
/**
 * agent-scaffold · migrate（旧工程盘点与受控重构）
 *
 *   node migrate.mjs audit <目录> [--json] [--out 文件]
 *   node migrate.mjs plan  <目录>                 # 写 .agent-kit/MIGRATION.md + plan.json
 *   node migrate.mjs apply <目录> --yes [--no-branch] [--dry-run]
 *
 * 铁律：audit 只读；plan 只写一个可删的 .agent-kit/ 目录；apply 只执行 plan.json 里列明的动作，
 * 全部走 git（move 用 git mv，逐批提交），且要求工作区干净。
 * 文档正文一个字不改，只在 md 顶部补 status frontmatter。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const OUT_DIR = '.agent-kit';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv', '__pycache__', 'agent', '.agent-kit', '.codemap-cache']);
const SKIP_DIR_RE = [/^doc[\\/]codemap/, /^\.idea/, /^\.vscode/];
const DOC_EXT = new Set(['.md', '.docx', '.doc', '.pdf', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv']);
const LEGACY_NAME = /(最终版|最终|final|copy|副本|备份|backup|old|新版本|v\d+版|_bak|\(\d+\))/i;
const MAX_FILES = 20000;

const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const head = (m) => console.log(`\n${m}`);
const today = () => new Date().toISOString().slice(0, 10);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function isGit(root) {
  try {
    return git(root, ['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    return false;
  }
}
function isClean(root) {
  if (!isGit(root)) return false;
  const out = git(root, ['status', '--porcelain']);
  return (
    out
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => !l.includes('.agent-kit')).length === 0
  );
}

// ------------------------------------------------------------------ scan
function scan(root) {
  const files = [];
  const dirs = new Set();
  let truncated = false;

  const walk = (dir, depth) => {
    if (depth > 8 || truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (truncated) return;
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).replaceAll('\\', '/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || SKIP_DIR_RE.some((re) => re.test(rel))) continue;
        dirs.add(rel);
        walk(abs, depth + 1);
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        let st;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        files.push({ rel, abs, ext: path.extname(e.name).toLowerCase(), size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  walk(root, 0);
  return { files, dirs, truncated };
}

function groupByTop(rel) {
  const p = rel.split('/');
  return p.length > 1 ? p[0] : '(根目录)';
}

function legacyMoves(files) {
  const moves = [];
  for (const f of files) {
    const base = path.basename(f.rel);
    if (!LEGACY_NAME.test(base)) continue;
    if (f.rel.startsWith('docs/legacy/')) continue;
    moves.push({ type: 'gitmv', from: f.rel, to: `docs/legacy/${base}` });
  }
  return moves;
}

function needsFrontmatter(files) {
  const out = [];
  for (const f of files) {
    if (f.ext !== '.md') continue;
    if (!/^(docs|doc)\//.test(f.rel)) continue;
    if (/^docs\/legacy\//.test(f.rel)) continue;
    if (/(^|\/)README\.md$/i.test(f.rel)) continue;
    let head100;
    try {
      head100 = fs.readFileSync(f.abs, 'utf8').slice(0, 400);
    } catch {
      continue;
    }
    if (/^---\r?\n[\s\S]{0,300}?\n---/.test(head100)) continue;
    out.push({ type: 'annotate', path: f.rel });
  }
  return out;
}

// ------------------------------------------------------------------ audit
function audit(root, opts) {
  head(`audit · ${root}（只读）`);
  if (!fs.existsSync(root)) {
    bad(`目录不存在：${root}`);
    return 1;
  }
  const { files, dirs, truncated } = scan(root);
  if (truncated) warn(`文件超过 ${MAX_FILES}，已截断`);

  const byExt = {};
  let docBytes = 0;
  for (const f of files) {
    byExt[f.ext || '(无扩展名)'] = (byExt[f.ext || '(无扩展名)'] || 0) + 1;
    if (DOC_EXT.has(f.ext)) docBytes += f.size;
  }
  const docs = files.filter((f) => DOC_EXT.has(f.ext));

  info(`git 仓库         ${isGit(root) ? '是' : '否（apply 需要 git）'}`);
  info(`AGENTS.md        ${fs.existsSync(path.join(root, 'AGENTS.md')) ? '存在' : '无'}`);
  info(`agent/ 体系      ${fs.existsSync(path.join(root, 'agent')) ? '已接入' : '未接入'}`);
  info(`代码地图         ${fs.existsSync(path.join(root, 'doc/CODE_MAP_INDEX.md')) ? '已生成' : '未生成'}`);
  info(`文件总数         ${files.length}，其中文档类 ${docs.length}（${(docBytes / 1048576).toFixed(1)} MB）`);
  info(`目录             ${dirs.size}`);

  head('文档分布（按顶层目录）');
  const groups = {};
  for (const f of docs) {
    const k = groupByTop(f.rel);
    groups[k] = groups[k] || { n: 0, bytes: 0, exts: new Set() };
    groups[k].n++;
    groups[k].bytes += f.size;
    groups[k].exts.add(f.ext);
  }
  for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 15)) {
    info(`${String(v.n).padStart(5)} 个  ${(v.bytes / 1048576).toFixed(1).padStart(6)} MB  ${k}  ${[...v.exts].join(' ')}`);
  }

  head('疑似问题');
  const dupByBase = {};
  for (const f of docs) {
    const b = path.basename(f.rel).toLowerCase();
    (dupByBase[b] = dupByBase[b] || []).push(f.rel);
  }
  const dups = Object.entries(dupByBase).filter(([, v]) => v.length > 1);
  if (dups.length) {
    warn(`同名文件 ${dups.length} 组（版本靠文件名区分 → 迟早矛盾）`);
    for (const [b, v] of dups.slice(0, 8)) info(`  ${b} ← ${v.join(' | ')}`);
  } else ok('无同名文件');

  const legacy = legacyMoves(files);
  if (legacy.length) warn(`命名带「最终 / 副本 / 备份」等 ${legacy.length} 个，建议移入 docs/legacy/`);
  else ok('无遗留命名');

  const noFm = needsFrontmatter(files);
  if (noFm.length) warn(`docs/ 下无 status frontmatter 的 md ${noFm.length} 个（agent 无法判断是否过期）`);
  else ok('docs/ 下的 md 都有 frontmatter 或为空');

  const noReadme = [...dirs].filter((d) => !d.includes('/') && !files.some((f) => f.rel.startsWith(`${d}/README`)));
  if (noReadme.length) info(`顶层无 README 的目录：${noReadme.slice(0, 10).join(', ')}`);

  head('下一步');
  if (!isGit(root)) warn('不是 git 仓库：apply 会被拒绝，请先 git init 或改用 init/adopt');
  else if (!isClean(root)) warn('工作区不干净：apply 会被拒绝，先提交或 stash');
  info(`node migrate.mjs plan ${root}`);
  info(`node migrate.mjs apply ${root} --yes`);

  if (opts.json || opts.out) {
    const payload = {
      root,
      generatedAt: new Date().toISOString(),
      totals: { files: files.length, docs: docs.length, docBytes, dirs: dirs.size, truncated },
      byExt,
      groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { n: v.n, bytes: v.bytes, exts: [...v.exts] }])),
      duplicates: dups.map(([base, list]) => ({ base, files: list })),
      legacy,
      missingFrontmatter: noFm,
      git: isGit(root),
      clean: isGit(root) && isClean(root),
    };
    const text = JSON.stringify(payload, null, 2);
    if (opts.out) {
      fs.writeFileSync(path.resolve(opts.out), text, 'utf8');
      ok(`已写出 ${opts.out}`);
    }
    if (opts.json) console.log(text);
  }
  return 0;
}

// ------------------------------------------------------------------ plan
function plan(root) {
  head(`plan · ${root}`);
  if (!fs.existsSync(root)) {
    bad(`目录不存在：${root}`);
    return 1;
  }
  const { files, dirs } = scan(root);
  const moves = legacyMoves(files);
  const annotate = needsFrontmatter(files).filter((a) => !moves.some((m) => m.from === a.path));
  const actions = [];

  const hasKit = fs.existsSync(path.join(root, 'agent'));
  if (!hasKit) actions.push({ type: 'kit', cmd: fs.existsSync(path.join(root, 'AGENTS.md')) ? 'adopt' : 'init' });
  if (!fs.existsSync(path.join(root, 'doc/CODE_MAP_INDEX.md'))) actions.push({ type: 'codemap', hint: '用 code-map skill 生成 doc/CODE_MAP_INDEX.md' });
  for (const m of moves) actions.push(m);
  for (const a of annotate) actions.push(a);
  for (const d of ['docs/adr', 'docs/legacy']) if (!fs.existsSync(path.join(root, d))) actions.push({ type: 'mkdir', path: d });

  const outDir = path.join(root, OUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const planJson = { root, generatedAt: new Date().toISOString(), actions };
  fs.writeFileSync(path.join(outDir, 'migration.plan.json'), JSON.stringify(planJson, null, 2), 'utf8');

  const lines = [
    `# 迁移计划 · ${path.basename(root)}`,
    '',
    `> 生成时间 ${new Date().toISOString().replace('T', ' ').slice(0, 16)} · 共 ${actions.length} 个动作`,
    '> 本文件与 `migration.plan.json` 由 `migrate plan` 生成，确认后执行 `migrate apply --yes`；不执行可直接删除 `.agent-kit/`。',
    '',
    '## 1. 接入 agent 体系',
    '',
    hasKit ? '- 已接入，`adopt` 只会替换 marker 区块，可重复执行。' : '- 尚未接入 → `adopt`（有 AGENTS.md）或 `init`（无）。',
    '',
    '## 2. 文档整理',
    '',
    moves.length ? `- ${moves.length} 个遗留命名文档 → \`docs/legacy/\`（\`git mv\`，内容不动）` : '- 无遗留命名文档。',
    annotate.length ? `- ${annotate.length} 个 \`docs/\` 下的 md 补 \`status\` frontmatter（只在顶部加，不改正文）` : '- docs/ 下的 md 都已有 frontmatter。',
    '',
    '## 3. 新增目录',
    '',
    '- `docs/adr/`：决策正文（ADR，编号 + 状态，接受后只 supersede）',
    '- `docs/legacy/`：历史文档，只读保留',
    '',
    '## 4. 不做的事（需人工）',
    '',
    '- 不转换 docx / pdf / xlsx，不搬正文，不改文档内容。',
    '- 不合并同名文档：合并是判断，交给人。',
    '- 不删除任何文件。',
    '',
    '## 5. 风险与回滚',
    '',
    '- `apply` 要求 git 工作区干净，自动建分支 `agent-kit/migrate-<日期>`，逐批提交。',
    '- 回滚：`git reset --hard <原分支>`，并删除 `.agent-kit/`。',
    '- 建议把 `.agent-kit/` 加进 `.gitignore`（计划文件不入库）。',
    '- 所有移动都是 `git mv`，`git log --follow` 仍可追溯。',
    '',
    '## 动作清单',
    '',
    '| # | 类型 | 对象 |',
    '| --- | --- | --- |',
    ...actions.map((a, i) => `| ${i + 1} | ${a.type} | ${a.path || a.from || a.cmd || a.hint || ''}${a.to ? ` → ${a.to}` : ''} |`),
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'MIGRATION.md'), lines.join('\n'), 'utf8');

  ok(`已写出 ${OUT_DIR}/MIGRATION.md`);
  ok(`已写出 ${OUT_DIR}/migration.plan.json（${actions.length} 个动作）`);
  head('请让用户确认后再执行');
  info(`node migrate.mjs apply ${root} --yes`);
  info('目录数：' + dirs.size + '，文档动作：' + (moves.length + annotate.length) + (hasKit ? '' : '，另需接入 agent 体系'));
  return 0;
}

// ------------------------------------------------------------------ apply
function apply(root, opts) {
  head(`apply · ${root}${opts.dryRun ? ' （dry-run）' : ''}`);
  const planPath = path.join(root, OUT_DIR, 'migration.plan.json');
  if (!fs.existsSync(planPath)) {
    bad(`缺 ${OUT_DIR}/migration.plan.json，先跑 plan`);
    return 1;
  }
  if (!opts.yes) {
    bad('需要 --yes 确认（此命令会 git mv 与提交）');
    return 2;
  }
  if (!isGit(root)) {
    bad('不是 git 仓库：拒绝执行（无法回滚）');
    return 1;
  }
  if (!isClean(root)) {
    bad('工作区不干净：先提交或 stash');
    return 1;
  }

  const { actions } = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const branch = `agent-kit/migrate-${today()}`;
  let base = '';
  try {
    base = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    base = 'HEAD';
  }
  const run = (args) => {
    if (opts.dryRun) {
      info(`would: git ${args.join(' ')}`);
      return '';
    }
    return git(root, args);
  };

  if (!opts.dryRun && !opts.noBranch) {
    let exists = true;
    try {
      git(root, ['rev-parse', '--verify', '--quiet', branch]);
    } catch {
      exists = false;
    }
    if (exists) {
      bad(`分支已存在：${branch}（用完删掉或加 --no-branch）`);
      return 1;
    }
    git(root, ['checkout', '-b', branch]);
    ok(`新建分支 ${branch}（从 ${base}）`);
  }

  // 1. mkdir
  const mk = actions.filter((a) => a.type === 'mkdir');
  if (mk.length) {
    for (const a of mk) {
      const abs = path.join(root, a.path);
      if (fs.existsSync(abs)) continue;
      if (!opts.dryRun) fs.mkdirSync(abs, { recursive: true });
      ok(`建目录 ${a.path}`);
    }
    if (!opts.dryRun) {
      const keep = path.join(root, 'docs', '.gitkeep');
      if (mk.some((a) => a.path === 'docs/adr') && !fs.existsSync(path.join(root, 'docs/adr/.gitkeep'))) fs.writeFileSync(path.join(root, 'docs/adr/.gitkeep'), '');
      if (mk.some((a) => a.path === 'docs/legacy') && !fs.existsSync(path.join(root, 'docs/legacy/.gitkeep'))) fs.writeFileSync(path.join(root, 'docs/legacy/.gitkeep'), '');
      void keep;
      run(['add', '-A', 'docs/adr', 'docs/legacy']);
      try {
        run(['commit', '-m', 'chore(agent-kit): 新增 docs/adr 与 docs/legacy']);
      } catch {
        info('无变更可提交（目录已存在）');
      }
    }
  }

  // 2. git mv
  const mvs = actions.filter((a) => a.type === 'gitmv');
  let moved = 0;
  for (const a of mvs) {
    const from = path.join(root, a.from);
    if (!fs.existsSync(from)) {
      warn(`源不存在，跳过 ${a.from}`);
      continue;
    }
    let to = a.to;
    let n = 1;
    while (fs.existsSync(path.join(root, to))) {
      const ext = path.extname(to);
      to = `${a.to.slice(0, -ext.length)}-${n}${ext}`;
      n++;
    }
    run(['mv', a.from, to]);
    ok(`git mv ${a.from} → ${to}`);
    moved++;
  }
  if (moved && !opts.dryRun) {
    run(['commit', '-m', `chore(agent-kit): 迁移 ${moved} 个遗留命名文档到 docs/legacy`]);
  }

  // 3. annotate
  const ann = actions.filter((a) => a.type === 'annotate');
  const done = [];
  for (const a of ann) {
    const abs = path.join(root, a.path);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (/^---\r?\n/.test(text)) continue;
    const fm = `---\nstatus: active\nupdated: ${today()}\n---\n\n`;
    if (!opts.dryRun) fs.writeFileSync(abs, fm + text, 'utf8');
    done.push(a.path);
  }
  if (done.length) {
    ok(`补 status frontmatter ${done.length} 个`);
    if (!opts.dryRun) {
      run(['add', '--', ...done]);
      try {
        run(['commit', '-m', `docs(agent-kit): 为 ${done.length} 个 docs/*.md 补 status frontmatter`]);
      } catch {
        warn('提交失败，改动留在工作区');
      }
    }
  }
  const annotated = done.length;

  const kit = actions.find((a) => a.type === 'kit');
  head('完成');
  info(`已移动 ${moved}，已标注 ${annotated}${opts.dryRun ? '（dry-run，未落盘）' : ''}`);
  if (kit) {
    info(`下一步（本命令不代跑）：node scaffold.mjs ${kit.cmd} ${root}`);
  }
  const cm = actions.find((a) => a.type === 'codemap');
  if (cm) info(`下一步：用 code-map skill 生成 ${'doc/CODE_MAP_INDEX.md'}`);
  if (!opts.dryRun && !opts.noBranch) {
    info(`分支：${branch}；确认无误后合回，回滚用 git checkout ${base} && git branch -D ${branch}`);
  }
  info(`清理计划文件：删除 ${OUT_DIR}/`);
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
      if (['--out'].includes(argv[i])) i++;
      continue;
    }
    pos.push(argv[i]);
  }
  const root = path.resolve(pos[0] || '.');
  const opts = { json: flags.has('--json'), out: val('--out'), yes: flags.has('--yes'), dryRun: flags.has('--dry-run'), noBranch: flags.has('--no-branch') };

  switch (cmd) {
    case 'audit':
      return audit(root, opts);
    case 'plan':
      return plan(root);
    case 'apply':
      return apply(root, opts);
    default:
      console.log(`agent-scaffold migrate

用法：
  node migrate.mjs audit <目录> [--json] [--out 文件]     # 只读盘点
  node migrate.mjs plan  <目录>                          # 写 .agent-kit/MIGRATION.md + plan.json
  node migrate.mjs apply <目录> --yes [--no-branch] [--dry-run]

原则：先整理再适配。audit 只读；plan 只写 .agent-kit/；apply 只做计划里的动作，
全部走 git（git mv + 逐批提交），要求工作区干净，可 reset 回滚。
不转换 docx/pdf、不合并同名文档、不删除文件、不改正文。`);
      return cmd ? 2 : 0;
  }
}

process.exit(main(process.argv));
