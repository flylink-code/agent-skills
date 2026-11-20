import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Exercise the installed CLI with independent child processes. The fixture
// generators implement the normal JSON summary contract without parser packages.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-workspace-'));
const root = path.join(temp, 'workspace');
const cli = path.join(root, 'doc', 'codemap-workspace.mjs');
const configFile = path.join(root, 'doc', 'codemap-workspace.json');
const projects = ['工程 A (#%)', 'second'];
const childIndex = 'doc/custom (索引)#%.md';
const registry = { projects, indexFile: 'doc/nested maps/registry.md' };
const registryFile = path.join(root, registry.indexFile);
const childConfig = { roots: ['src'], indexFile: childIndex };
const childScript = `import fs from 'node:fs';
if (!process.argv.includes('--check')) fs.writeFileSync(${JSON.stringify(childIndex)}, 'map');
else if (!fs.existsSync(${JSON.stringify(childIndex)})) throw new Error('missing map');
console.log(JSON.stringify({ files: 1, symbols: 2, diagnostics: 0, pages: 1 }));`;
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
let invocations = 0;
function run(status, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: temp, env: { ...process.env, CODEMAP_WORKSPACE_CONFIG: '' } });
  if (result.error) throw result.error;
  assert.equal(result.status, status, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  invocations++;
  return result;
}

try {
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.copyFileSync(new URL('./codemap-workspace.mjs', import.meta.url), cli);
  writeJson(configFile, registry);
  for (const name of projects) {
    const doc = path.join(root, name, 'doc');
    fs.mkdirSync(doc, { recursive: true });
    writeJson(path.join(doc, 'codemap.config.json'), childConfig);
    fs.writeFileSync(path.join(doc, 'codemap.mjs'), childScript);
    writeJson(path.join(doc, '.codemap-cache.json'), { files: { 'src/unit.ts': { symbols: [1, 2].map(line => ({ name: 'Hit', line, kind: 'function' })) } } });
  }

  run(0, 'build');
  assert.equal(JSON.parse(run(0, 'build', '--json').stdout).written, false);
  run(0, 'check');
  const original = fs.readFileSync(registryFile, 'utf8');
  const links = [...original.matchAll(/\[打开\]\(([^\s()]+)\)/g)].map(match => fileURLToPath(new URL(match[1], pathToFileURL(registryFile))));
  assert.deepEqual(links, projects.map(name => path.join(root, name, childIndex)));
  assert.deepEqual(JSON.parse(run(0, 'find', 'Hit', '--limit', '1', '--json').stdout).map(g => g.hits.length), [1, 0]);
  assert.match(run(0, 'find', 'Hit', '--limit', '3').stdout, /3 hit\(s\) across 2 project\(s\)/);

  fs.writeFileSync(registryFile, 'manual drift');
  assert.match(run(1, 'check', '--allow-missing').stdout, /registry is missing or stale/);
  assert.equal(fs.readFileSync(registryFile, 'utf8'), 'manual drift');
  fs.unlinkSync(registryFile);
  run(1, 'check');
  assert.equal(fs.existsSync(registryFile), false);
  run(0, 'build');
  writeJson(configFile, { ...registry, shared: ['new asset'] });
  run(1, 'check');

  writeJson(configFile, { ...registry, projects: [...projects, 'uninstalled'] });
  run(1, 'build');
  run(0, 'build', '--allow-missing');
  run(1, 'check');
  run(0, 'check', '--allow-missing');
  const script = path.join(root, projects[0], 'doc', 'codemap.mjs');
  for (const broken of ["throw new Error('generator failure')", "console.log('{}')"]) {
    fs.writeFileSync(script, broken);
    run(1, 'build', '--allow-missing');
    run(1, 'check', '--allow-missing');
  }
  fs.writeFileSync(script, childScript);
  for (const indexFile of ['outside.md', 'doc/../../outside.md', path.join(temp, 'outside.md')]) {
    writeJson(configFile, { ...registry, indexFile });
    assert.match(run(1, 'build', '--allow-missing').stderr, /under doc\//);
    run(1, 'check');
  }
  const outside = path.join(temp, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'doc', 'redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  writeJson(configFile, { ...registry, indexFile: 'doc/redirect/out.md' });
  assert.match(run(1, 'build').stderr, /Symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  writeJson(configFile, registry);
  for (const field of ['indexFile', 'outputDir', 'cacheFile']) {
    writeJson(path.join(root, projects[0], 'doc', 'codemap.config.json'), { ...childConfig, [field]: 'doc/../escaped' });
    assert.match(run(1, 'build', '--allow-missing').stderr, /under doc\//);
  }
  console.log(`workspace-selftest: passed (${invocations} CLI runs)`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
