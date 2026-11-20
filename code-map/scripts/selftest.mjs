import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// End-to-end check of the generator on a throwaway project: it copies codemap.mjs into
// <tmp>/doc/, generates a map, then exercises --check, --find, --outline, --map.
// Run it after copying the generator into a new project to prove the toolchain resolves.

const skillRoot = path.resolve(import.meta.dirname, '..');
const project = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-selftest-'));
const failures = [];

// The fixture has a different cwd. Preserve the caller's dependency scopes and
// let the copied generator do the same package resolution as a real project.
const fixtureEnv = {
  ...process.env,
  CODEMAP_REQUIRE_FROM: path.resolve(process.env.CODEMAP_REQUIRE_FROM || project),
  CODEMAP_SIBLINGS: [project, ...(process.env.CODEMAP_SIBLINGS || '').split(','),
    path.join(project, '..', 'Ai-Switcher'), path.join(project, '..', 'magpie'),
    path.join(skillRoot, '..', '..')].map(s => s.trim()).filter(Boolean)
    .map(s => path.resolve(s)).join(','),
};

const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
const run = (args, options = {}) => execFileSync(process.execPath, [path.join(root, 'doc', 'codemap.mjs'), ...args], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: fixtureEnv,
  ...options
});
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures.push(name);
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const fakeHome = path.join(root, 'home');
  fs.mkdirSync(fakeHome);
  const install = (...args) => execFileSync(process.execPath, [path.join(skillRoot, 'scripts/install.mjs'), ...args], {
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome }, encoding: 'utf8',
  });
  install('--all-agents');
  check('--all-agents leaves an empty home untouched', fs.readdirSync(fakeHome).length === 0);
  const skills = path.join(fakeHome, '.dsh', 'skills');
  fs.mkdirSync(skills, { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.cursor'));
  install('--all-agents', '--dry-run');
  check('dry run leaves existing skills folder untouched', fs.readdirSync(skills).length === 0);
  install('--all-agents');
  check('--all-agents installs only into existing skills folders',
    fs.existsSync(path.join(skills, 'code-map', 'SKILL.md')) && fs.readdirSync(path.join(fakeHome, '.cursor')).length === 0 && fs.readdirSync(fakeHome).length === 2);
  install('--agent', 'codex');
  check('--agent still creates its explicit target', fs.existsSync(path.join(fakeHome, '.codex', 'skills', 'code-map', 'SKILL.md')));

  fs.mkdirSync(path.join(root, 'doc'), { recursive: true });
  fs.copyFileSync(path.join(skillRoot, 'scripts', 'codemap.mjs'), path.join(root, 'doc', 'codemap.mjs'));
  write('doc/codemap.config.json', JSON.stringify({
    roots: ['app', 'doc'],
    extensions: ['.ts', '.tsx', '.rs', '.cs', '.go', '.java', '.c', '.cpp'],
    excludeSegments: ['node_modules', 'target', 'dist'],
    outputDir: 'doc/codemap',
    indexFile: 'doc/CODE_MAP_INDEX.md',
    cacheFile: 'doc/.codemap-cache.json',
    pageRows: 5,
    hubCount: 5,
    defaultModule: 'tooling',
    modules: {
      'app/web/*/': 'web-*',
      'app/web/': 'web-root',
      'app/rust/src/*/': 'rust-*',
      'app/rust/src/': 'rust-root',
      'app/rust/': 'rust-app'
    }
  }));
  write('app/web/lib/a.ts', 'export function A() {\n  return 1;\n}\n');
  write('app/web/lib/b.ts', "import { A } from './a';\n\nexport function B() {\n  return A();\n}\n");
  write('app/rust/src/lib.rs', 'pub struct Thing;\n');
  write('app/rust/src/user.rs', 'use crate::Thing;\n\npub fn use_it() {\n    let _ = Thing;\n}\n');
  write('app/node_modules/ignored.ts', 'export const ignored = 1;\n');
  execFileSync('git', ['init', '--quiet'], { cwd: path.join(root, 'app'), stdio: 'ignore' });

  const generated = JSON.parse(run([]));
  check('generates 4 files', generated.files === 4, `files=${generated.files}`);
  check('extracts symbols', generated.symbols >= 4, `symbols=${generated.symbols}`);
  check('resolves 2 import edges', generated.edges.resolved === 2, JSON.stringify(generated.edges));
  check('no parser diagnostics', generated.diagnostics === 0, `diagnostics=${generated.diagnostics}`);
  check('excludes node_modules', JSON.parse(run(['--find', 'ignored', '--json'])).length === 0);

  const hubs = fs.readFileSync(path.join(root, 'doc', 'codemap', 'hubs.md'), 'utf8');
  check('hubs ranks the Rust type', /\| Thing \| struct_item \| rust-root \| 1 \|/.test(hubs), hubs.split('\n').slice(10, 13).join(' | '));
  check('hubs ranks the TS function', /\| A \| FunctionDeclaration \| web-lib \| 1 \|/.test(hubs));
  check('index links hubs', /\[hubs\]\(codemap\/hubs\.md\)/.test(fs.readFileSync(path.join(root, 'doc', 'CODE_MAP_INDEX.md'), 'utf8')));

  write('app/web/lib/external.ts', "import { A } from 'outside';\n");
  write('app/rust/src/nested.rs', 'pub struct Nested;\n');
  write('app/rust/src/other.rs', 'use outside::Thing;\nuse crate::missing::Thing;\nuse crate::Nested;\n');
  const collisions = JSON.parse(run([])).edges;
  check('external, missing and descendant-only matches do not create incoming edges',
    collisions.resolved === 2 && collisions.unresolved === 4 && collisions.ambiguous === 0, JSON.stringify(collisions));

  const fresh = JSON.parse(run(['--check']));
  check('--check passes on a fresh map', fresh.changed === 0 && fresh.deleted === 0, JSON.stringify(fresh));

  const found = run(['--find', 'A']);
  check('--find returns path:line', found.includes('app/web/lib/a.ts:1'), found.trim());

  const outline = run(['--outline', 'app/web/lib/b.ts']);
  check('--outline lists declarations', /^\s+3\s+FunctionDeclaration\tB$/m.test(outline), outline.trim());

  const map = run(['--map', '--tokens', '2000']);
  check('--map prints hubs', /Thing/.test(map) && /most-referenced/.test(map));

  const help = run(['--help']);
  check('--help documents queries', /--find/.test(help) && /--map/.test(help));

  write('app/web/lib/b.ts', "import { A } from './a';\n\nexport function B() {\n  return A() + 1;\n}\n");
  let drifted = false;
  try {
    run(['--check']);
  } catch {
    drifted = true;
  }
  check('--check detects drift after an edit', drifted);

  run([]);
  const afterRegeneration = JSON.parse(run([]));
  check('regeneration is idempotent', afterRegeneration.changed === 0, `changed=${afterRegeneration.changed}`);

  write('app/Example.cs', 'namespace Demo;\npublic class Dock {\n public void Open() {}\n public string Name { get; set; }\n}\n');
  write('app/example.go', 'package demo\ntype Widget struct {}\nfunc Launch() {}\n');
  write('app/Example.java', 'package demo;\nclass Example {\n void execute() {}\n}\n');
  write('app/example.c', 'struct Device { int value; };\nint start(void) { return 0; }\n');
  write('app/example.cpp', 'class Engine { public: void run() {} };\n');
  const expanded = JSON.parse(run([]));
  check('indexes added C#, Go, Java, C and C++ files', expanded.files === 12, `files=${expanded.files}`);
  for (const [name, expected] of [['Dock', 'app/Example.cs:2'], ['Open', 'app/Example.cs:3'], ['Name', 'app/Example.cs:4'], ['Widget', 'app/example.go:2'], ['Launch', 'app/example.go:3'], ['Example', 'app/Example.java:2'], ['execute', 'app/Example.java:3'], ['Device', 'app/example.c:1'], ['start', 'app/example.c:2'], ['Engine', 'app/example.cpp:1']]) {
    const result = run(['--find', name]);
    check(`${name} points to ${expected}`, result.includes(expected), result.trim());
  }
  check('expanded language map passes --check', JSON.parse(run(['--check'])).changed === 0);
  const configFile = path.join(root, 'doc', 'codemap.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const mixedMap = run(['--map']);
  check('mixed host map keeps imported symbols and labels C/C++ coverage', mixedMap.includes('Thing') && mixedMap.includes('C/C++'));
  config.roots = ['Core', 'host'];
  config.extensions = ['.c', '.hpp', '.py', '.cs'];
  config.modules = { 'Core/': 'board', 'host/': 'desktop' };
  fs.writeFileSync(configFile, JSON.stringify(config));
  write('Core/packet.c', 'int parse_packet(void) { return 0; }\n');
  write('Core/packet.hpp', 'struct Packet { int id; };\n');
  write('host/decode.py', 'def decode_packet():\n    return 1\n');
  write('host/View.cs', 'class PacketView {}\n');
  const standalone = JSON.parse(run([]));
  check('firmware and desktop fixture has no import edges', standalone.files === 4 && standalone.edges.resolved === 0);
  const fallback = run(['--map']);
  check('zero-edge map exposes both modules and representative paths', /board/.test(fallback) && /desktop/.test(fallback) && /Core\//.test(fallback) && /host\//.test(fallback), fallback);
  check('module map is deterministic', fallback === run(['--map']));
  check('header lookup still returns a JSON array', JSON.parse(run(['--find', 'Packet', '--json'])).some(hit => hit.file === 'Core/packet.hpp' && hit.line === 1));
  for (const args of [['--find', 'missing_symbol'], ['--outline', 'Core/packet.hpp']]) {
    const query = spawnSync(process.execPath, [path.join(root, 'doc/codemap.mjs'), ...args, '--json'], { cwd: root, encoding: 'utf8', env: fixtureEnv });
    check(`${args[0]} reports C/C++ coverage separately from JSON`, query.status === 0 && /C\/C\+\+/.test(query.stderr) && JSON.parse(query.stdout) !== null);
  }
  check('Python desktop symbols remain searchable', run(['--find', 'decode_packet']).includes('host/decode.py:1'));
  check('generated module map passes drift check', JSON.parse(run(['--check'])).changed === 0);
  config.roots = ['src'];
  config.extensions = ['.rs'];
  fs.writeFileSync(configFile, JSON.stringify(config));
  write('src/lib.rs', 'pub struct Shared;\n');
  write('src/user.rs', 'use crate::Shared;\n');
  check('resolves an anchored Rust import in a root-level crate', JSON.parse(run([])).edges.resolved === 1);
  write('src/main.rs', 'pub struct Shared;\n');
  const duplicate = JSON.parse(run([])).edges;
  check('counts competing declarations on the same module path as ambiguous', duplicate.ambiguous === 1 && duplicate.resolved === 0);
  config.outputDir = '../outside';
  fs.writeFileSync(configFile, JSON.stringify(config));
  let rejected = false;
  try { run([]); } catch (error) { rejected = String(error.stderr).includes('must be inside the project doc/'); }
  check('rejects output outside doc/', rejected);
} catch (error) {
  failures.push('unexpected error');
  console.error(error.message);
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exitCode = failures.length ? 1 : 0;
