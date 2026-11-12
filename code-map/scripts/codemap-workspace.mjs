import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Workspace orchestrator: several independent projects, each with its own
// doc/codemap.mjs and doc/codemap.config.json. This script never builds a
// second kind of map. It runs each project's own generator, then writes one
// small registry at the workspace root so an agent can pick a project without
// loading every map into context.
//
// Deliberately absent: cross-project reference edges. Two maps share no
// resolver, so a "shared" line between them would be a guess.

const scriptDir = import.meta.dirname;
const defaultRoot = path.resolve(scriptDir, '..');
const defaultIndex = 'doc/CODE_MAP_INDEX.md';

const options = { command: 'build', query: '', json: false, limit: 30, config: '', allowMissing: false, help: false };
const args = process.argv.slice(2);
const flagsWithValue = new Set(['--limit', '--config']);
const booleanFlags = new Set(['--json', '--allow-missing', '--help']);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (flagsWithValue.has(arg)) {
    const value = args[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === '--limit') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1) throw new Error('--limit needs a positive integer');
      options.limit = number;
    } else options.config = value;
  } else if (booleanFlags.has(arg)) {
    options[arg === '--allow-missing' ? 'allowMissing' : arg.slice(2)] = true;
  } else if (!arg.startsWith('-') && options.command === 'build' && !options.query) {
    if (!['build', 'check', 'find', 'list'].includes(arg)) throw new Error(`Unknown command: ${arg}`);
    options.command = arg;
  } else if (options.command === 'find' && !options.query && !arg.startsWith('-')) {
    options.query = arg;
  } else {
    throw new Error(`Unexpected argument: ${arg}`);
  }
}

const usage = `Usage: node doc/codemap-workspace.mjs [command] [options]

  build                 run every project's own doc/codemap.mjs, then rewrite ${defaultIndex}
  check                 run every project's generator with --check (exit 1 on any drift or error)
  find <name>           search symbols in every project cache; no re-parsing
  list                  show each project's map, cache and generator status

  --json                machine-readable output (build / find / list / check)
  --limit <n>           max find hits across all projects (default 30)
  --config <path>       workspace registry config (default doc/codemap-workspace.json)
  --allow-missing       do not fail when a project has no generator yet
  --help                this text

Each project keeps its own map under <project>/doc/. Nothing is written outside
the workspace doc/ except by those per-project generators.`;

const slash = value => value.replace(/\\/g, '/');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// padEnd counts UTF-16 units, so a CJK project name would shift every column.
const displayWidth = text => [...String(text)].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (text, size) => `${text}${' '.repeat(Math.max(0, size - displayWidth(text)))}`;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function workspaceRoot() {
  return defaultRoot;
}

function configPath(root) {
  if (options.config) return path.resolve(options.config);
  if (process.env.CODEMAP_WORKSPACE_CONFIG) return path.resolve(process.env.CODEMAP_WORKSPACE_CONFIG);
  return path.join(root, 'doc', 'codemap-workspace.json');
}

// A project opts in by having doc/codemap.config.json. Auto-discovery only
// looks one level down: deeper nesting means the layout is not "projects side
// by side", and a wrong guess silently indexes the same files twice.
function discover(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const projectDir = path.join(root, entry.name);
    if (!fs.existsSync(path.join(projectDir, 'doc', 'codemap.config.json'))) {
      if (fs.existsSync(path.join(projectDir, '.git'))) found.push({ name: entry.name, path: entry.name, optedIn: false });
      continue;
    }
    found.push({ name: entry.name, path: entry.name, optedIn: true });
  }
  return found.sort((a, b) => compare(a.path, b.path));
}

function loadRegistry(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return { projects: discover(root), shared: [], indexFile: defaultIndex, configFile: '', fromConfig: false };
  const config = readJson(file);
  const projects = (config.projects ?? []).map(entry => {
    const value = typeof entry === 'string' ? { path: entry } : entry;
    if (!value?.path) throw new Error(`Every project needs a path (${file})`);
    return { name: value.name || value.path, path: slash(value.path), optedIn: true };
  });
  if (!projects.length) throw new Error(`No projects listed in ${file}`);
  const seen = new Set();
  for (const project of projects) {
    if (seen.has(project.path)) throw new Error(`Duplicate project path: ${project.path}`);
    seen.add(project.path);
  }
  return {
    projects,
    shared: (config.shared ?? []).map(slash),
    indexFile: slash(config.indexFile || defaultIndex),
    configFile: path.relative(root, file),
    fromConfig: true
  };
}

function projectPaths(root, project) {
  const dir = path.isAbsolute(project.path) ? project.path : path.join(root, ...project.path.split('/'));
  const doc = path.join(dir, 'doc');
  let config = {};
  try {
    config = readJson(path.join(doc, 'codemap.config.json'));
  } catch {
    /* A missing or broken config is reported by the generator run, not here. */
  }
  return {
    dir,
    doc,
    generator: path.join(doc, 'codemap.mjs'),
    config,
    cache: path.join(dir, ...slash(config.cacheFile || 'doc/.codemap-cache.json').split('/')),
    index: path.join(dir, ...slash(config.indexFile || defaultIndex).split('/'))
  };
}

// Node puts the source line and a caret before the actual message, so the first
// stderr line is rarely the cause; pick the line that names the error instead.
function compactError(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const named = lines.find(line => /^(Error|TypeError|RangeError|SyntaxError|ReferenceError|Uncaught|Cannot |EACCES|ENOENT|EPERM|EEXIST)/.test(line));
  return named || lines[0] || '';
}

function runGenerator(root, project, extraArgs) {
  const paths = projectPaths(root, project);
  if (!fs.existsSync(paths.generator)) {
    return { ok: false, status: 'no-generator', error: 'no generator — run install.mjs --project <dir>', stderr: `missing ${slash(path.relative(project.dir, paths.generator))}` };
  }
  const run = spawnSync(process.execPath, [paths.generator, ...extraArgs], {
    cwd: paths.dir,
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    env: process.env
  });
  const stdout = (run.stdout || '').trim();
  const stderr = (run.stderr || '').trim();
  if (run.error) return { ok: false, status: 'error', error: compactError(run.error.message), stderr: run.error.message };
  if (run.status !== 0) return { ok: false, status: 'error', error: compactError(stderr) || `exit ${run.status}`, stderr };
  return { ok: true, status: 'ok', stdout, stderr };
}

function lastJsonLine(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* Keep walking back; generators may print warnings first. */
    }
  }
  return null;
}

function describeProject(root, project) {
  const paths = projectPaths(root, project);
  const hasGenerator = fs.existsSync(paths.generator);
  const hasConfig = fs.existsSync(path.join(paths.doc, 'codemap.config.json'));
  const hasCache = fs.existsSync(paths.cache);
  const hasIndex = fs.existsSync(paths.index);
  const roots = (paths.config.roots ?? []).map(slash);
  return {
    name: project.name,
    path: project.path,
    dir: paths.dir,
    roots,
    languages: (paths.config.extensions ?? []).map(ext => String(ext).replace(/^\./, '')),
    hasGenerator,
    hasConfig,
    hasCache,
    hasIndex,
    generatorRel: slash(path.join(project.path, slash(path.relative(paths.dir, paths.generator)))),
    indexRel: slash(path.join(project.path, slash(path.relative(paths.dir, paths.index))))
  };
}

function build(root, registry) {
  const results = [];
  for (const project of registry.projects) {
    const info = describeProject(root, project);
    if (!info.hasGenerator) {
      results.push({ ...info, status: 'no-generator', ok: false, error: 'run install.mjs --project <dir>' });
      continue;
    }
    const run = runGenerator(root, project, []);
    if (!run.ok) {
      results.push({ ...info, status: run.status, ok: false, error: run.error || compactError(run.stderr) });
      continue;
    }
    const result = lastJsonLine(run.stdout);
    if (!result) {
      results.push({ ...info, status: 'error', ok: false, error: `no JSON result from ${info.generatorRel}` });
      continue;
    }
    results.push({
      ...info,
      status: 'ok',
      ok: true,
      files: result.files,
      symbols: result.symbols,
      diagnostics: result.diagnostics,
      pages: result.pages,
      edges: result.edges
    });
  }

  const indexFile = path.join(root, ...registry.indexFile.split('/'));
  const markdown = renderIndex(results, registry);
  let written = false;
  const current = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;
  if (current !== markdown) {
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    fs.writeFileSync(indexFile, markdown);
    written = true;
  }
  return { results, indexFile, written };
}

function renderIndex(results, registry) {
  const ok = results.filter(result => result.status === 'ok');
  const totals = ok.reduce((sum, result) => ({
    files: sum.files + (result.files || 0),
    symbols: sum.symbols + (result.symbols || 0),
    diagnostics: sum.diagnostics + (result.diagnostics || 0)
  }), { files: 0, symbols: 0, diagnostics: 0 });

  const lines = [
    '# 工作区代码地图',
    '',
    '<!-- Generated by doc/codemap-workspace.mjs; do not edit. -->',
    '',
    '先在这里挑工程，再打开该工程自己的 `doc/CODE_MAP_INDEX.md`。跨工程找符号不重新解析：',
    '',
    '```powershell',
    'node doc/codemap-workspace.mjs find <名字>',
    '```',
    '',
    '| 工程 | 目录 | 索引根 | 文件 | 符号 | 诊断 | 地图入口 |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |'
  ];
  for (const result of results) {
    const status = result.status === 'ok' ? '' : ` ⚠ ${result.status}`;
    const entry = result.status === 'ok' ? `[打开](${result.indexRel})` : '-';
    lines.push(`| ${result.name}${status} | \`${result.path}\` | ${result.roots.join(', ') || '-'} | ${result.files ?? '-'} | ${result.symbols ?? '-'} | ${result.diagnostics ?? '-'} | ${entry} |`);
  }
  lines.push('');
  lines.push(`合计：${ok.length}/${results.length} 个工程 / ${totals.files} 文件 / ${totals.symbols} 符号 / ${totals.diagnostics} 诊断。`);
  const failed = results.filter(result => result.status !== 'ok');
  if (failed.length) {
    lines.push('');
    lines.push('未完成：');
    for (const result of failed) {
      const reason = result.error ? `（${result.error.split(/\r?\n/)[0]}）` : '';
      lines.push(`- \`${result.path}\`：${result.status}${reason}`);
    }
  }
  if (registry.shared.length) {
    lines.push('');
    lines.push(`共享资产（人工确认，不是解析结论）：${registry.shared.map(item => `\`${item}\``).join('、')}`);
  }
  lines.push('');
  lines.push('跨工程引用边不做推断：两份地图没有共同的解析器，硬连就是猜。共用头文件请写进上面的共享资产。');
  return lines.join('\n') + '\n';
}

function searchSymbols(records, query) {
  const needle = query.toLowerCase();
  const hits = [];
  for (const [file, record] of Object.entries(records)) {
    for (const symbol of record.symbols ?? []) {
      const name = String(symbol.name).toLowerCase();
      const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
      if (rank >= 0) hits.push({ rank, file, name: symbol.name, kind: symbol.kind, scope: symbol.scope, line: symbol.line });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || compare(a.file, b.file) || a.line - b.line);
}

function find(root, registry, query) {
  const groups = [];
  for (const project of registry.projects) {
    const paths = projectPaths(root, project);
    if (!fs.existsSync(paths.cache)) {
      groups.push({ name: project.name, path: project.path, hits: [], status: 'no-cache' });
      continue;
    }
    let cache;
    try {
      cache = readJson(paths.cache);
    } catch (error) {
      groups.push({ name: project.name, path: project.path, hits: [], status: 'bad-cache', error: error.message });
      continue;
    }
    groups.push({ name: project.name, path: project.path, hits: searchSymbols(cache.files ?? {}, query), status: 'ok' });
  }
  let budget = options.limit;
  for (const group of groups) {
    group.hits = group.hits.slice(0, budget);
    budget -= group.hits.length;
    if (budget <= 0) break;
  }
  return groups;
}

function check(root, registry) {
  const results = [];
  for (const project of registry.projects) {
    const info = describeProject(root, project);
    if (!info.hasGenerator) {
      results.push({ ...info, status: 'no-generator', ok: false, error: 'no generator — run install.mjs --project <dir>' });
      continue;
    }
    const run = runGenerator(root, project, ['--check']);
    results.push({ ...info, status: run.ok ? 'ok' : 'drift', ok: run.ok, error: run.ok ? '' : run.error || compactError(run.stderr) });
  }
  return results;
}

function list(root, registry) {
  return registry.projects.map(project => describeProject(root, project));
}

try {
  if (options.help) {
    process.stdout.write(usage + '\n');
  } else {
    const root = workspaceRoot();
    const registry = loadRegistry(root);
    if (options.command === 'find') {
      if (!options.query) throw new Error('find needs a symbol name');
      const groups = find(root, registry, options.query);
      if (options.json) {
        console.log(JSON.stringify(groups, null, 1));
      } else {
        let total = 0;
        const blocks = [];
        for (const group of groups) {
          total += group.hits.length;
          if (!group.hits.length) continue;
          blocks.push(`# ${group.name} (${group.path}) — ${group.hits.length}\n` + group.hits.map(hit => `  ${slash(path.join(group.path, hit.file))}:${hit.line}\t${hit.kind}\t${hit.scope ? `${hit.scope}::` : ''}${hit.name}`).join('\n'));
        }
        if (!blocks.length) console.error(`no symbol matches "${options.query}"`);
        else {
          console.log(blocks.join('\n\n'));
          console.log(`\n${total} hit(s) across ${groups.filter(group => group.hits.length).length} project(s)`);
        }
      }
    } else if (options.command === 'list') {
      const items = list(root, registry);
      if (options.json) console.log(JSON.stringify(items, null, 1));
      else {
        for (const item of items) {
          const state = !item.hasGenerator ? 'no-generator' : !item.hasCache ? 'not-built' : 'ok';
          console.log(`${pad(item.name, 24)} ${pad(item.path, 28)} ${state}${item.hasIndex ? '' : '  (no index)'}`);
        }
      }
    } else if (options.command === 'check') {
      const results = check(root, registry);
      if (options.json) console.log(JSON.stringify(results, null, 1));
      else for (const result of results) console.log(`${result.ok ? 'ok    ' : 'drift '} ${result.name}${result.ok ? '' : `  ${result.error.split(/\r?\n/)[0]}`}`);
      if (results.some(result => !result.ok)) process.exitCode = 1;
    } else {
      const { results, indexFile, written } = build(root, registry);
      if (options.json) console.log(JSON.stringify({ indexFile: slash(path.relative(root, indexFile)), written, projects: results }, null, 1));
      else {
        for (const result of results) {
          if (result.status === 'ok') {
            console.log(`built ${pad(result.name, 24)} files=${result.files} symbols=${result.symbols} diagnostics=${result.diagnostics} pages=${result.pages}`);
            if (result.files === 0) console.log(`      ${pad('', 24)} parsed nothing — check roots/extensions in that project's doc/codemap.config.json`);
          } else console.log(`fail  ${pad(result.name, 24)} ${result.status}  ${String(result.error || '').split(/\r?\n/)[0]}`);
        }
        console.log(`${written ? 'wrote' : 'kept '} ${slash(path.relative(root, indexFile))}`);
      }
      const failures = results.filter(result => !result.ok);
      if (failures.length && !options.allowMissing) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
