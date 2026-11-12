#!/usr/bin/env node
/**
 * agent-scaffold · 路由式 agent 知识体系安装器（v2）
 *
 *   node scaffold.mjs detect    <目录>
 *   node scaffold.mjs init      <目录> [--mode project|workspace] [--name 名称] [--force] [--dry-run]
 *   node scaffold.mjs adopt     <目录> [--mode project|workspace] [--name 名称] [--force] [--dry-run]
 *   node scaffold.mjs extend    <目录> --title "..." [--body "..."] [--slug x] [--dry-run]
 *   node scaffold.mjs verify    <目录>
 *   node scaffold.mjs uninstall <目录> [--dry-run]
 *
 * 纯 Node，无依赖。adopt 对既有 AGENTS.md 只做 marker 区块注入，区块外零改动。
 * 旧工程整理与重构见同目录 migrate.mjs（audit / plan / apply）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '..', 'templates');
const KIT_VERSION = '2.0.0';

const BEGIN = '<!-- agent-kit:begin -->';
const END = '<!-- agent-kit:end -->';
const MANIFEST = path.join('agent', '.manifest.json');

const RULES = ['00-global', '10-code', '15-audience', '20-git', '30-docs', '40-debug', '50-research', '60-archive', '70-isolation'];
const PLAYBOOKS = ['10-create', '20-implement', '30-debug', '40-optimize', '50-archive'];
const CONTEXT = ['requirements', 'hardware', 'software', 'plan', 'decisions'];
/** 只有这三张是「事实源摘要卡」；plan / decisions 是日志 */
const FACT_CARDS = ['requirements', 'hardware', 'software'];

const SHARED = [
  ...RULES.map((n) => ({ dest: `agent/rules/${n}.md`, tpl: `rules/${n}.md` })),
  ...PLAYBOOKS.map((n) => ({ dest: `agent/playbooks/${n}.md`, tpl: `playbooks/${n}.md` })),
  ...CONTEXT.map((n) => ({ dest: `agent/context/${n}.md`, tpl: `context/${n}.md` })),
  { dest: 'agent/context/research/RESEARCH_INDEX.md', tpl: 'context/research/RESEARCH_INDEX.md' },
  { dest: 'agent/context/archive/ARCHIVE_INDEX.md', tpl: 'context/archive/ARCHIVE_INDEX.md' },
  { dest: 'agent/context/archive/_TEMPLATE.md', tpl: 'context/archive/_TEMPLATE.md' },
];

const MODES = {
  project: { agents: 'AGENTS.template.md', index: 'index.md', files: SHARED },
  workspace: { agents: 'AGENTS.workspace.template.md', index: 'index.workspace.md', files: SHARED },
};

const BUDGET = { 'agent/index.md': 120, AGENTS_MD: 60, DEFAULT: 200 };

// ---------------------------------------------------------------- helpers
const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✘ ${m}`);
const head = (m) => console.log(`\n${m}`);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const lineCount = (t) => (t ? t.replace(/\n+$/, '').split(/\r?\n/).length : 0);

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

function markerBlock(mode) {
  const ws = mode === 'workspace';
  return [
    BEGIN,
    '## Agent 主路由（agent-kit）',
    '',
    ws
      ? '本工作区已接入路由式 agent 知识体系。**先读 `agent/index.md`**；工程内的任务去 `projects/<工程>/AGENTS.md`，工程之间互不干扰。'
      : '本工程已接入路由式 agent 知识体系。**先读 `agent/index.md`**，按「触发条件 → 文件」跳转，不要全仓盲扫。',
    '',
    '- 会话开始先读 `agent/context/plan.md`；疑似做过的事先查 `agent/context/archive/ARCHIVE_INDEX.md`',
    '- 阶段流程：`agent/playbooks/10-create.md` … `50-archive.md`',
    '- 约束规则：`agent/rules/00-global.md` … `70-isolation.md`',
    '- 事实卡：`agent/context/`（需求 / 硬件 / 软件 / 计划 / 决策）',
    '- 需求与选型调研：`agent/rules/50-research.md`',
    ...(ws ? ['- 多工程隔离：`agent/rules/70-isolation.md`（默认只读他工程）'] : []),
    '- 符号定位：`doc/CODE_MAP_INDEX.md`；不存在则用 `code-map` skill 生成',
    '- 新增规则用 `agent-scaffold extend`；新增能力用 `skill-author`',
    '',
    '本节由 agent-scaffold 生成与维护；重复执行只替换本节。**本节之外的既有约定优先**，冲突时以项目原有规则为准。',
    END,
  ].join('\n');
}

function render(tpl, name) {
  return tpl
    .replaceAll('{{PROJECT_NAME}}', name)
    .replaceAll('{{DATE}}', today())
    .replaceAll('{{KIT_VERSION}}', KIT_VERSION);
}

function upsertMarker(text, block) {
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i !== -1 && j !== -1 && j > i) {
    return { text: text.slice(0, i) + block + text.slice(j + END.length), mode: 'replace' };
  }
  if (i !== -1 || j !== -1) return { text: null, mode: 'broken' };
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

/** 在指定 ## 小节的表格末尾追加一行 */
function addRowToSection(text, heading, row) {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => l.trim() === heading);
  if (h === -1) return { ok: false, reason: `找不到小节 ${heading}` };
  let i = h + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{2,3}\s/.test(lines[i])) return { ok: false, reason: `${heading} 下没有表格` };
    i++;
  }
  if (i >= lines.length) return { ok: false, reason: `${heading} 下没有表格` };
  let j = i;
  while (j < lines.length && lines[j].trim().startsWith('|')) j++;
  lines.splice(j, 0, row);
  return { ok: true, text: lines.join('\n') };
}

function detectMode(root) {
  if (exists(path.join(root, 'projects')) && exists(path.join(root, 'agent'))) return 'workspace';
  if (exists(path.join(root, 'doc')) && exists(path.join(root, 'agent'))) return 'workspace';
  const m = loadManifest(root);
  return m && m.mode ? m.mode : 'project';
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
  const projects = exists(path.join(root, 'projects'))
    ? fs.readdirSync(path.join(root, 'projects'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  info(`AGENTS.md        ${agents ? `存在 · ${lineCount(agents)} 行` : '不存在'}`);
  info(`kit marker       ${hasMarker ? '已注入' : '无'}`);
  info(`agent/ 目录      ${exists(path.join(root, 'agent')) ? '存在' : '不存在'}`);
  info(`manifest         ${m ? `v${m.kitVersion} · ${m.mode || 'project'} · ${Object.keys(m.files || {}).length} 个受管文件` : '无'}`);
  info(`代码地图         ${exists(cmap) ? 'doc/CODE_MAP_INDEX.md 已生成' : '未生成'}`);
  if (projects.length) info(`子工程           ${projects.join(', ')}`);
  if (exists(path.join(root, 'doc'))) info(`doc/ 共享资料    存在`);

  head('建议');
  if (!agents) {
    ok('新工程 → init（多工程工作区加 --mode workspace）');
  } else if (hasMarker) {
    ok('已接入 → adopt 可安全重复执行（只替换 marker 区块）');
  } else if (agents.includes(BEGIN) || agents.includes(END)) {
    warn('marker 残缺 → 先人工修好，再 adopt（脚本不猜边界）');
  } else {
    ok('旧工程 → 先 audit 盘点，再 migrate 重构，最后 adopt');
    info('   node <skill>/scripts/migrate.mjs audit <目录>');
  }
  if (m && Object.keys(m.files || {}).length) {
    const drift = Object.entries(m.files).filter(([rel, h]) => {
      const p = path.join(root, rel);
      return !exists(p) || sha256(fs.readFileSync(p)) !== h;
    });
    if (drift.length) warn(`与 manifest 不一致：${drift.map(([r]) => r).join(', ')}`);
  }
  return 0;
}

function install(root, { mode, name, force, dryRun }) {
  head(`${mode} · ${root}${dryRun ? ' （dry-run，不落盘）' : ''}`);
  if (!exists(TEMPLATES)) {
    bad(`模板目录缺失：${TEMPLATES}`);
    return 1;
  }
  const spec = MODES[mode];
  if (!spec) {
    bad(`未知模式：${mode}（project | workspace）`);
    return 1;
  }
  if (!exists(root)) {
    if (dryRun) info(`将创建目录 ${root}`);
    else fs.mkdirSync(root, { recursive: true });
  }

  const projName = name || path.basename(path.resolve(root));
  const manifest = loadManifest(root) || {
    kitVersion: KIT_VERSION,
    mode,
    projectName: projName,
    createdAt: today(),
    agentsMdMode: null,
    files: {},
  };
  manifest.kitVersion = KIT_VERSION;
  manifest.mode = mode;
  manifest.projectName = manifest.projectName || projName;

  const plan = [{ src: spec.agents, dest: 'AGENTS.md', special: 'agents' }, { src: spec.index, dest: 'agent/index.md' }, ...spec.files];
  let writes = 0;
  let skips = 0;

  for (const f of plan) {
    const destAbs = path.join(root, f.dest);
    const tplAbs = path.join(TEMPLATES, f.src || f.tpl);
    if (!exists(tplAbs)) {
      bad(`模板缺失：${f.src || f.tpl}`);
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
        const r = upsertMarker(cur, markerBlock(mode));
        if (r.mode === 'broken') {
          bad(`${f.dest} 的 marker 残缺，跳过（请人工修正后重跑）`);
          skips++;
          continue;
        }
        if (r.text === cur) {
          info(`${f.dest} 已是最新，未改`);
          manifest.agentsMdMode = 'marker';
          skips++;
          continue;
        }
        if (!dryRun) fs.writeFileSync(destAbs, r.text, 'utf8');
        manifest.agentsMdMode = 'marker';
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
    if (mode === 'workspace') {
      info('下一步：在 projects/ 下建工程目录，对每个工程跑 init（工程级）');
      info('然后填 AGENTS.md 的「工程一览」表与 agent/context/requirements.md');
    } else {
      info('下一步：填 agent/context/*.md 的「事实源」指针（只写路径，不搬正文）');
    }
    info('然后跑 verify 校验预算、marker 与归档索引');
  }
  return 0;
}

function extend(root, { title, body, slug, dryRun }) {
  head(`extend · ${root}${dryRun ? ' （dry-run）' : ''}`);
  if (!title) {
    bad('缺少 --title（要加的规则/功能一句话）');
    return 2;
  }
  const rulesDir = path.join(root, 'agent', 'rules');
  if (!exists(rulesDir)) {
    bad('未检测到 agent/rules，先跑 init 或 adopt');
    return 1;
  }

  const touched = [];
  const existing = fs.readdirSync(rulesDir).filter((f) => /^\d{2}-.+\.md$/.test(f));
  const nums = existing.map((f) => Number(f.slice(0, 2)));
  const next = String((nums.length ? Math.max(...nums) : 0) + 10).padStart(2, '0');
  const autoSlug = (slug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!autoSlug) {
    warn('标题里没有 ASCII 词，文件名退回 rule；建议下次加 --slug log-timestamp');
  }
  const fileName = `${next}-${autoSlug || 'rule'}.md`;
  const rel = `agent/rules/${fileName}`;
  const abs = path.join(root, 'agent', 'rules', fileName);

  const content = `---
status: active
updated: ${today()}
title: ${title}
source: 用户需求（extend）
---

# ${title}

## 规则

${body || '（待补充：具体约束、判定标准）'}

## 为什么

- （要解决的问题 / 不加会出什么事）

## 反模式

- ❌ 

## 适用范围

- 哪些工程 / 阶段适用；不适用时写明例外。
`;
  if (exists(abs)) {
    bad(`目标已存在：${rel}`);
    return 1;
  }
  if (!dryRun) {
    fs.writeFileSync(abs, content, 'utf8');
  }
  ok(`创建 ${rel}（编号 ${next}）`);
  touched.push(rel);

  const indexPath = path.join(root, 'agent', 'index.md');
  const idx = readIf(indexPath);
  if (idx) {
    const r = addRowToSection(idx, '## 规则（约束）', `| ${title} | \`${rel}\` |`);
    if (r.ok) {
      if (!dryRun) fs.writeFileSync(indexPath, r.text, 'utf8');
      ok(`agent/index.md 已加一行`);
      touched.push('agent/index.md');
    } else {
      warn(`index 未自动登记（${r.reason}），请手工加一行：| ${title} | \`${rel}\` |`);
    }
  }

  const decPath = path.join(root, 'agent', 'context', 'decisions.md');
  const dec = readIf(decPath);
  if (dec) {
    const entry = `### ${today()} · 新增规则「${title}」

- **决定**：把「${title}」固化为 \`${rel}\`
- **上下文**：${body || '用户要求'}
- **放弃的方案 / 代价**：写在临时口头约定里，下个会话即丢失
- **影响面**：所有读取 agent/rules 的会话
- **可逆性**：可逆（删文件 + 撤销索引行）
- **成文位置**：定稿后搬进 \`docs/adr/NNNN-<slug>.md\`，这里留一行
- **状态**：active
`;
    const merged = dec.trimEnd() + '\n\n' + entry;
    if (!dryRun) fs.writeFileSync(decPath, merged, 'utf8');
    ok('agent/context/decisions.md 已记录');
    touched.push('agent/context/decisions.md');
  }

  const agentsPath = path.join(root, 'AGENTS.md');
  const agents = readIf(agentsPath);
  if (agents) {
    const r = addRowToSection(agents, '## 2. 规则路由（约束，不是流程）', `| ${title} | \`${rel}\` |`);
    if (r.ok) {
      if (!dryRun) fs.writeFileSync(agentsPath, r.text, 'utf8');
      ok('AGENTS.md 路由表已加一行');
      touched.push('AGENTS.md');
      const n = lineCount(r.text);
      if (n > BUDGET.AGENTS_MD) warn(`AGENTS.md 现在 ${n} 行 > ${BUDGET.AGENTS_MD}，考虑把旧条目移进 index.md`);
    } else if (agents.includes(BEGIN) && agents.includes(END)) {
      const line = `- 规则：${title} → \`${rel}\``;
      const noteRe = /^本节由 agent-scaffold.*$/m;
      const out = noteRe.test(agents)
        ? agents.replace(noteRe, `${line}\n$&`)
        : agents.replace(END, `${line}\n${END}`);
      if (!dryRun) fs.writeFileSync(agentsPath, out, 'utf8');
      ok('AGENTS.md marker 区块内已加一行（旧工程没有规则路由表）');
      touched.push('AGENTS.md');
    } else {
      info(`AGENTS.md 未自动登记（${r.reason}）；区块外的文件请手工加一行`);
    }
  }

  if (!dryRun && touched.length) {
    const mf = loadManifest(root);
    if (mf) {
      for (const t of touched) {
        const p = path.join(root, t);
        if (!exists(p)) continue;
        if (t === 'AGENTS.md' && mf.agentsMdMode !== 'created') delete mf.files[t];
        else mf.files[t] = sha256(fs.readFileSync(p));
      }
      saveManifest(root, mf);
      ok(`manifest 已同步 ${touched.length} 个文件（verify 不会再报「被手工改过」）`);
    }
  }

  head('下一步');
  info(`补全 ${rel} 的「规则」与「反模式」两段`);
  info('跑 verify 确认预算');
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
      if (m && m.agentsMdMode === 'created') ok(`AGENTS.md ${lineCount(agents)} 行（本工具创建，无需 marker）`);
      else {
        warn('未注入 marker 区块（adopt 未执行？）');
        warns++;
      }
    } else if (begin > 1) {
      bad(`marker 重复 ${begin} 处`);
      errs++;
    } else {
      ok(`marker 成对 · AGENTS.md ${lineCount(agents)} 行`);
    }
    if (m && m.agentsMdMode === 'created' && lineCount(agents) > BUDGET.AGENTS_MD) {
      warn(`AGENTS.md ${lineCount(agents)} 行 > ${BUDGET.AGENTS_MD} 行路由预算：把细条目移进 agent/index.md`);
      warns++;
    }
  }

  const spec = MODES[m && m.mode ? m.mode : 'project'];
  const plan = [{ src: spec.index, dest: 'agent/index.md' }, ...spec.files];
  for (const f of plan) {
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
          bad(`${f.dest} 的「事实源」没有可点击路径`);
          errs++;
        }
      }
    }
    if (CONTEXT.some((c) => f.dest === `agent/context/${c}.md`)) {
      if (!/^---\n[\s\S]*?status:/.test(text)) {
        warn(`${f.dest} 缺 status frontmatter（归档判定会退化）`);
        warns++;
      }
    }
  }

  const arch = readIf(path.join(root, 'agent/context/archive/ARCHIVE_INDEX.md'));
  if (arch === null) {
    bad('缺 agent/context/archive/ARCHIVE_INDEX.md（防重做索引）');
    errs++;
  } else if (!arch.includes('| 主题')) {
    warn('ARCHIVE_INDEX.md 没有表格，防重做检索会失效');
    warns++;
  }
  const research = readIf(path.join(root, 'agent/context/research/RESEARCH_INDEX.md'));
  if (research === null) {
    bad('缺 agent/context/research/RESEARCH_INDEX.md（调研索引）');
    errs++;
  }
  const pb = path.join(root, 'agent/playbooks');
  if (!exists(pb)) {
    bad('缺 agent/playbooks/（阶段流程）');
    errs++;
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
    for (const d of [
      'agent/context/archive',
      'agent/context/research',
      'agent/context',
      'agent/playbooks',
      'agent/rules',
      'agent',
    ]) {
      const abs = path.join(root, d);
      if (exists(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    }
  }

  head(`完成：删除 ${removed}，保留 ${kept}`);
  if (kept) info('保留的文件含手工改动，需你自行决定是否删除');
  return 0;
}

// ---------------------------------------------------------------- entry
function main(argv) {
  const cmd = argv[2];
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const val = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : null;
  };
  const skip = new Set(
    ['--name', '--title', '--body', '--slug', '--mode']
      .map((f) => argv.indexOf(f))
      .filter((i) => i !== -1)
      .map((i) => i + 1),
  );
  const positional = argv.slice(3).filter((a, i) => !a.startsWith('--') && !skip.has(argv.indexOf(a) > -1 ? argv.indexOf(a) : -1 + 3 + i));
  // 上面的过滤对重复参数不稳，改为显式解析：
  const pos = [];
  for (let i = 3; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      if (["--name", "--title", "--body", "--slug", "--mode"].includes(argv[i])) i++;
      continue;
    }
    pos.push(argv[i]);
  }
  const root = path.resolve(pos[0] || '.');
  const opts = {
    name: val('--name'),
    title: val('--title'),
    body: val('--body'),
    slug: val('--slug'),
    mode: val('--mode') || detectMode(root),
    force: flags.has('--force'),
    dryRun: flags.has('--dry-run'),
  };

  switch (cmd) {
    case 'detect':
      return detect(root);
    case 'init':
    case 'adopt':
      return install(root, { mode: cmd, ...opts });
    case 'extend':
      return extend(root, opts);
    case 'verify':
      return verify(root);
    case 'uninstall':
      return uninstall(root, opts);
    default:
      console.log(`agent-scaffold v${KIT_VERSION}

用法：
  node scaffold.mjs detect    <目录>
  node scaffold.mjs init      <目录> [--mode project|workspace] [--name 名称] [--force] [--dry-run]
  node scaffold.mjs adopt     <目录> [--mode project|workspace] [--name 名称] [--force] [--dry-run]
  node scaffold.mjs extend    <目录> --title "..." [--body "..."] [--slug x] [--dry-run]
  node scaffold.mjs verify    <目录>
  node scaffold.mjs uninstall <目录> [--dry-run]

  init      新工程：全量生成
  adopt     旧工程：既有 AGENTS.md 只注入 marker 区块，其余零改动
  extend    把用户新增的规则/想法按编号落进 agent/rules，并同步索引与决策
  --mode    project（默认，单工程）| workspace（doc/ + projects/ 多工程工作区）
  --force   覆盖 agent/ 下已存在文件（先备份 .bak）
  --dry-run 只报告，不落盘

旧工程整理与重构：node migrate.mjs audit|plan|apply <目录>`);
      return cmd ? 2 : 0;
  }
}

process.exit(main(process.argv));
