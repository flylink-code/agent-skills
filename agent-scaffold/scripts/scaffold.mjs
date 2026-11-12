#!/usr/bin/env node
/**
 * agent-scaffold · 路由式 agent 知识体系安装器
 *
 *   node scaffold.mjs detect    <项目目录>
 *   node scaffold.mjs init      <项目目录> [--name 名称] [--force] [--dry-run]
 *   node scaffold.mjs adopt     <项目目录> [--name 名称] [--force] [--dry-run]
 *   node scaffold.mjs verify    <项目目录>
 *   node scaffold.mjs uninstall <项目目录> [--dry-run]
 *
 * 纯 Node，无依赖。adopt 对既有 AGENTS.md 只做 marker 区块注入，区块外零改动。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '..', 'templates');
const KIT_VERSION = '1.0.0';

const BEGIN = '<!-- agent-kit:begin -->';
const END = '<!-- agent-kit:end -->';
const MANIFEST = path.join('agent', '.manifest.json');

const RULES = ['00-global', '10-code', '20-git', '30-docs', '40-debug'];
const CONTEXT = ['requirements', 'hardware', 'software', 'plan', 'decisions'];
/** 只有这三张是「事实源摘要卡」，必须有「## 事实源」段；plan / decisions 是日志 */
const FACT_CARDS = ['requirements', 'hardware', 'software'];

/** 受管文件：目标相对路径 → 模板相对路径 */
const FILES = [
  { dest: 'AGENTS.md', tpl: 'AGENTS.md', special: 'agents' },
  { dest: 'agent/index.md', tpl: 'index.md' },
  ...RULES.map((n) => ({ dest: `agent/rules/${n}.md`, tpl: `rules/${n}.md` })),
  ...CONTEXT.map((n) => ({ dest: `agent/context/${n}.md`, tpl: `context/${n}.md` })),
];

const BUDGET = { 'agent/index.md': 120, AGENTS_MD: 60, DEFAULT: 200 };

// ---------------------------------------------------------------- helpers
const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const head = (m) => console.log(`\n${m}`);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function lineCount(text) {
  if (!text) return 0;
  return text.replace(/\n+$/, '').split(/\r?\n/).length;
}

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function readIf(p) {
  return exists(p) ? fs.readFileSync(p, 'utf8') : null;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function markerBlock() {
  return [
    BEGIN,
    '## Agent 主路由（agent-kit）',
    '',
    '本工程已接入路由式 agent 知识体系。**先读 `agent/index.md`**，按「触发条件 → 文件」跳转，不要全仓盲扫。',
    '',
    '- 改代码纪律 → `agent/rules/10-code.md`',
    '- 提交与分支 → `agent/rules/20-git.md`',
    '- 文档规范 → `agent/rules/30-docs.md`',
    '- 排查协议 → `agent/rules/40-debug.md`',
    '- 需求 / 硬件 / 软件 / 计划 / 决策 → `agent/context/`',
    '- 符号定位 → `doc/CODE_MAP_INDEX.md`；不存在则用 `code-map` skill 生成',
    '- 新增复用能力 → `skill-author` skill',
    '',
    '本节由 agent-scaffold 生成与维护；重复执行只替换本节。**本节之外的既有约定优先**，与本节冲突时以项目原有规则为准。',
    END,
  ].join('\n');
}

function render(tpl, name) {
  return tpl
    .replaceAll('{{PROJECT_NAME}}', name)
    .replaceAll('{{DATE}}', today())
    .replaceAll('{{KIT_VERSION}}', KIT_VERSION);
}

/** 在既有文本中注入/替换 marker 区块，区块外保持原样 */
function upsertMarker(text, block) {
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i !== -1 && j !== -1 && j > i) {
    return { text: text.slice(0, i) + block + text.slice(j + END.length), mode: 'replace' };
  }
  if (i !== -1 || j !== -1) {
    // marker 残缺，不猜，交给人工
    return { text: null, mode: 'broken' };
  }
  const base = text.length === 0 || text.endsWith('\n') ? text : text + '\n';
  return { text: `${base}\n${block}\n`, mode: 'append' };
}

function stripMarker(text) {
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i === -1 || j === -1 || j < i) return text;
  const rest = (text.slice(0, i) + text.slice(j + END.length)).replace(/\n{3,}/g, '\n\n');
  return rest.trimEnd() + (rest.trim() ? '\n' : '');
}

function loadManifest(root) {
  const p = path.join(root, MANIFEST);
  if (!exists(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveManifest(root, m) {
  const p = path.join(root, MANIFEST);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------- commands
function detect(root) {
  head(`detect · ${root}`);
  if (!exists(root)) {
    bad(`目录不存在：${root}`);
    return 1;
  }
  const agentsPath = path.join(root, 'AGENTS.md');
  const agents = readIf(agentsPath);
  const m = loadManifest(root);
  const hasMarker = !!agents && agents.includes(BEGIN) && agents.includes(END);
  const cmap = path.join(root, 'doc', 'CODE_MAP_INDEX.md');

  info(`AGENTS.md        ${agents ? `存在 · ${lineCount(agents)} 行` : '不存在'}`);
  info(`kit marker       ${hasMarker ? '已注入' : '无'}`);
  info(`agent/ 目录      ${exists(path.join(root, 'agent')) ? '存在' : '不存在'}`);
  info(`manifest         ${m ? `v${m.kitVersion} · ${Object.keys(m.files || {}).length} 个受管文件` : '无'}`);
  info(`代码地图         ${exists(cmap) ? 'doc/CODE_MAP_INDEX.md 已生成' : '未生成（需要 code-map skill）'}`);

  head('建议');
  if (!agents) {
    ok('新工厂 → init');
  } else if (hasMarker) {
    ok('已接入 → adopt 可安全重复执行（只替换 marker 区块）');
  } else if (agents.includes(BEGIN) || agents.includes(END)) {
    warn('marker 残缺 → 先人工修好，再 adopt（脚本不猜边界）');
  } else {
    ok('旧工厂 → adopt（末尾注入 marker 区块，其余零改动）');
  }
  if (m && Object.keys(m.files || {}).length) {
    const drift = Object.entries(m.files).filter(([rel, h]) => {
      const p = path.join(root, rel);
      return !exists(p) || sha256(fs.readFileSync(p)) !== h;
    });
    if (drift.length) warn(`与 manifest 不一致：${drift.map(([r]) => r).join(', ')}（verify 可查）`);
  }
  return 0;
}

function install(root, { mode, name, force, dryRun }) {
  head(`${mode} · ${root}${dryRun ? ' （dry-run，不落盘）' : ''}`);
  if (!exists(TEMPLATES)) {
    bad(`模板目录缺失：${TEMPLATES}`);
    return 1;
  }
  if (!exists(root)) {
    if (dryRun) info(`将创建目录 ${root}`);
    else fs.mkdirSync(root, { recursive: true });
  }

  const projName = name || path.basename(path.resolve(root));
  const manifest = loadManifest(root) || {
    kitVersion: KIT_VERSION,
    projectName: projName,
    createdAt: today(),
    agentsMdMode: null,
    files: {},
  };
  manifest.kitVersion = KIT_VERSION;
  manifest.projectName = manifest.projectName || projName;

  let writes = 0;
  let skips = 0;

  for (const f of FILES) {
    const destAbs = path.join(root, f.dest);
    const tplAbs = path.join(TEMPLATES, f.tpl);
    if (!exists(tplAbs)) {
      bad(`模板缺失：${f.tpl}`);
      continue;
    }
    const tpl = fs.readFileSync(tplAbs, 'utf8');

    if (f.special === 'agents') {
      const cur = readIf(destAbs);
      if (cur === null) {
        const body = render(tpl, projName);
        if (!dryRun) {
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          fs.writeFileSync(destAbs, body, 'utf8');
        }
        manifest.agentsMdMode = 'created';
        manifest.files[f.dest] = sha256(Buffer.from(body));
        ok(`创建 ${f.dest}（${lineCount(body)} 行）`);
        writes++;
      } else {
        const r = upsertMarker(cur, markerBlock());
        if (r.mode === 'broken') {
          bad(`${f.dest} 的 marker 残缺，跳过（请人工修正后重跑）`);
          skips++;
          continue;
        }
        if (r.text === cur) {
          info(`${f.dest} 已是 ${r.mode === 'replace' ? '最新' : '原样'}，未改`);
          manifest.agentsMdMode = 'marker';
          skips++;
          continue;
        }
        if (!dryRun) fs.writeFileSync(destAbs, r.text, 'utf8');
        manifest.agentsMdMode = 'marker';
        // marker 模式下 AGENTS.md 由人工维护，不计入 hash 归因
        delete manifest.files[f.dest];
        ok(`${r.mode === 'append' ? '注入' : '替换'} marker 区块 · ${f.dest}（${lineCount(cur)} → ${lineCount(r.text)} 行，区块外零改动）`);
        writes++;
      }
      continue;
    }

    const cur = readIf(destAbs);
    if (cur !== null && !force) {
      info(`已存在，跳过 · ${f.dest}`);
      skips++;
      continue;
    }
    if (cur !== null && force) {
      const bak = destAbs + '.bak';
      if (!dryRun) fs.copyFileSync(destAbs, bak);
      warn(`已备份 → ${path.relative(root, bak)}`);
    }
    const body = render(tpl, projName);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.writeFileSync(destAbs, body, 'utf8');
    }
    manifest.files[f.dest] = sha256(Buffer.from(body));
    ok(`${cur === null ? '创建' : '覆盖'} ${f.dest}（${lineCount(body)} 行）`);
    writes++;
  }

  if (!dryRun) saveManifest(root, manifest);
  head(`完成：写入 ${writes}，跳过 ${skips}`);
  if (writes && !dryRun) {
    info('下一步：填充 agent/context/*.md 的「事实源」指针（只写路径，不搬正文）');
    info('然后跑 verify 校验预算与 marker');
  }
  return 0;
}

function verify(root) {
  head(`verify · ${root}`);
  if (!exists(root)) {
    bad(`目录不存在：${root}`);
    return 1;
  }
  let errs = 0;
  let warns = 0;
  const m = loadManifest(root);

  const agents = readIf(path.join(root, 'AGENTS.md'));
  if (agents === null) {
    bad('AGENTS.md 缺失');
    errs++;
  } else {
    const begin = (agents.match(/<!-- agent-kit:begin -->/g) || []).length;
    const end = (agents.match(/<!-- agent-kit:end -->/g) || []).length;
    if (begin !== end) {
      bad(`marker 不成对：begin=${begin} end=${end}`);
      errs++;
    } else if (begin === 0) {
      if (m && m.agentsMdMode === 'created') {
        ok(`AGENTS.md ${lineCount(agents)} 行（本工具创建，无需 marker）`);
      } else {
        warn('未注入 marker 区块（adopt 未执行？）');
        warns++;
      }
    } else if (begin > 1) {
      bad(`marker 重复 ${begin} 处`);
      errs++;
    } else {
      ok(`marker 成对 · AGENTS.md ${lineCount(agents)} 行`);
    }
    const managed = m && m.agentsMdMode === 'created';
    if (managed && lineCount(agents) > BUDGET.AGENTS_MD) {
      bad(`AGENTS.md ${lineCount(agents)} 行 > ${BUDGET.AGENTS_MD} 行预算`);
      errs++;
    }
  }

  for (const f of FILES) {
    if (f.special === 'agents') continue;
    const abs = path.join(root, f.dest);
    const text = readIf(abs);
    if (text === null) {
      bad(`缺失 ${f.dest}`);
      errs++;
      continue;
    }
    const n = lineCount(text);
    const cap = BUDGET[f.dest] || BUDGET.DEFAULT;
    if (n > cap) {
      bad(`${f.dest} ${n} 行 > ${cap} 行预算`);
      errs++;
    }
    if (FACT_CARDS.some((c) => f.dest === `agent/context/${c}.md`)) {
      if (!text.includes('## 事实源')) {
        bad(`${f.dest} 缺少「## 事实源」段`);
        errs++;
      } else {
        const src = text.split('## 事实源')[1].split('##')[0];
        if (!/`[^`]+`/.test(src)) {
          bad(`${f.dest} 的「事实源」没有可点击路径（用反引号包住相对路径）`);
          errs++;
        }
      }
    }
  }

  if (!m) {
    warn('无 manifest：无法校验归因与回滚');
    warns++;
  } else {
    const drift = Object.entries(m.files || {}).filter(([rel, h]) => {
      const p = path.join(root, rel);
      return !exists(p) || sha256(fs.readFileSync(p)) !== h;
    });
    if (drift.length) {
      warn(`被手工改过（uninstall 将保留）：${drift.map(([r]) => r).join(', ')}`);
      warns++;
    } else {
      ok(`manifest 一致 · ${Object.keys(m.files).length} 个受管文件`);
    }
  }

  const cmap = path.join(root, 'doc', 'CODE_MAP_INDEX.md');
  if (!exists(cmap)) {
    warn('无代码地图（doc/CODE_MAP_INDEX.md）→ 需要时用 code-map skill 生成');
    warns++;
  } else {
    ok('代码地图已就位');
  }

  head(errs ? `失败：${errs} 个错误，${warns} 个警告` : `通过：0 个错误，${warns} 个警告`);
  return errs ? 1 : 0;
}

function uninstall(root, { dryRun }) {
  head(`uninstall · ${root}${dryRun ? ' （dry-run）' : ''}`);
  const m = loadManifest(root);
  if (!m) {
    bad('无 manifest，拒绝卸载（无法判断哪些是本工具创建的文件）');
    return 1;
  }
  let removed = 0;
  let kept = 0;

  for (const [rel, h] of Object.entries(m.files || {})) {
    const abs = path.join(root, rel);
    if (!exists(abs)) {
      info(`已不存在 · ${rel}`);
      continue;
    }
    if (sha256(fs.readFileSync(abs)) !== h) {
      warn(`被手工改过，保留 · ${rel}`);
      kept++;
      continue;
    }
    if (!dryRun) fs.rmSync(abs);
    ok(`删除 ${rel}`);
    removed++;
  }

  const agentsPath = path.join(root, 'AGENTS.md');
  const agents = readIf(agentsPath);
  if (agents && agents.includes(BEGIN)) {
    if (m.agentsMdMode === 'created') {
      if (!dryRun) fs.rmSync(agentsPath);
      ok('删除 AGENTS.md（本工具创建）');
      removed++;
    } else {
      const stripped = stripMarker(agents);
      if (!dryRun) fs.writeFileSync(agentsPath, stripped, 'utf8');
      ok(`剥离 marker 区块 · AGENTS.md（${lineCount(agents)} → ${lineCount(stripped)} 行）`);
      removed++;
    }
  }

  if (!dryRun) {
    fs.rmSync(path.join(root, MANIFEST), { force: true });
    for (const d of ['agent/context', 'agent/rules', 'agent']) {
      const abs = path.join(root, d);
      if (exists(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    }
  }

  head(`完成：删除 ${removed}，保留 ${kept}`);
  if (kept) info('保留下来的文件含手工改动，需要你自行决定是否删除');
  return 0;
}

// ---------------------------------------------------------------- entry
function main(argv) {
  const cmd = argv[2];
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const nameIdx = argv.indexOf('--name');
  const opts = {
    name: nameIdx !== -1 ? argv[nameIdx + 1] : null,
    force: flags.has('--force'),
    dryRun: flags.has('--dry-run'),
  };
  const positional = argv.slice(3).filter((a) => !a.startsWith('--') && a !== opts.name);
  const root = path.resolve(positional[0] || '.');

  switch (cmd) {
    case 'detect':
      return detect(root);
    case 'init':
    case 'adopt':
      return install(root, { mode: cmd, ...opts });
    case 'verify':
      return verify(root);
    case 'uninstall':
      return uninstall(root, opts);
    default:
      console.log(`agent-scaffold v${KIT_VERSION}

用法：
  node scaffold.mjs detect    <项目目录>
  node scaffold.mjs init      <项目目录> [--name 名称] [--force] [--dry-run]
  node scaffold.mjs adopt     <项目目录> [--name 名称] [--force] [--dry-run]
  node scaffold.mjs verify    <项目目录>
  node scaffold.mjs uninstall <项目目录> [--dry-run]

  init  新工厂：全量生成
  adopt 旧工厂：既有 AGENTS.md 只注入 marker 区块，其余零改动
  --force   覆盖 agent/ 下已存在文件（先备份 .bak）
  --dry-run 只报告，不落盘`);
      return cmd ? 2 : 0;
  }
}

process.exit(main(process.argv));
