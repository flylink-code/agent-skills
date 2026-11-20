import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../scripts/scaffold.mjs', import.meta.url));
const begin = '<!-- agent-kit:begin -->';
const end = '<!-- agent-kit:end -->';
function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('scaffold-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  function run(cmd, args = [], status = 0) {
    const res = spawnSync(process.execPath, [cli, cmd, root, ...args], { encoding: 'utf8' });
    assert.equal(res.status, status, res.error?.message || res.stdout + res.stderr);
    return res.stdout;
  }
  return { root, run, at: (p) => path.join(root, p) };
}

for (const mode of ['project', 'workspace']) {
  test(`init / extend / verify / uninstall (${mode})`, (t) => {
    const { root, run, at } = project(t);
    run('init', ['--mode', mode, '--dry-run']);
    assert.deepEqual(fs.readdirSync(root), []);
    run('init', ['--mode', mode]);
    const router = at('AGENTS.md');
    const manualRouter = Buffer.concat([fs.readFileSync(router), Buffer.from(`\n${begin} local ${end}`)]);
    fs.writeFileSync(router, manualRouter);
    const index = at('agent/index.md');
    const decisions = at('agent/context/decisions.md');
    const originalIndex = fs.readFileSync(index, 'utf8').replace(/\r?\n/g, '\r\n') + 'user index  ';
    const originalDec = fs.readFileSync(decisions, 'utf8') + '\nuser decision  \r\n\r\n';
    fs.writeFileSync(index, originalIndex);
    fs.writeFileSync(decisions, originalDec);
    const opts = ['--title', 'Release check', '--slug', 'release-check'];
    run('extend', [...opts, '--dry-run']);
    const rule = at('agent/rules/80-release-check.md');
    assert.ok(!fs.existsSync(rule));
    run('extend', opts);
    assert.equal(fs.readFileSync(index, 'utf8').replace(/\| Release check \| .*?\|\r?\n/, ''), originalIndex);
    assert.ok(fs.readFileSync(decisions, 'utf8').startsWith(originalDec));
    run('verify');
    run('uninstall', ['--dry-run']);
    assert.ok(fs.existsSync(rule));
    run('uninstall');
    assert.ok(!fs.existsSync(rule));
    assert.ok(fs.existsSync(index) && fs.existsSync(decisions));
    assert.deepEqual(fs.readFileSync(router), manualRouter);
  });
}

for (const existing of [false, true]) {
  test(`adopt preserves marker-external bytes (existing marker=${existing})`, (t) => {
    const { run, at } = project(t);
    const router = at('AGENTS.md');
    const prefix = Buffer.concat([Buffer.from('\ufeff前言\r\n\n\n\n'), Buffer.from([0xff]), Buffer.from('尾部  ')]);
    const suffix = existing ? Buffer.from('\r\n\n\n保留尾注  ') : Buffer.alloc(0);
    const original = Buffer.concat([prefix, existing ? Buffer.from(begin + 'old' + end) : Buffer.alloc(0), suffix]);
    fs.writeFileSync(router, original);
    run('adopt', ['--dry-run']);
    assert.deepEqual(fs.readFileSync(router), original);
    run('adopt');
    const installed = fs.readFileSync(router);
    assert.deepEqual(installed.subarray(0, installed.indexOf(begin)), prefix);
    assert.deepEqual(installed.subarray(installed.indexOf(end) + end.length), suffix);
    run('adopt');
    assert.deepEqual(fs.readFileSync(router), installed);
    run('verify');
    run('uninstall');
    assert.deepEqual(fs.readFileSync(router), Buffer.concat([prefix, suffix]));
  });
}

for (const malformed of [begin, end, end + begin, begin + end + begin + end]) {
  test(`reject malformed marker: ${malformed}`, (t) => {
    const { root, run, at } = project(t);
    fs.writeFileSync(at('AGENTS.md'), malformed);
    run('adopt', [], 1);
    assert.deepEqual(fs.readdirSync(root), ['AGENTS.md']);
    assert.equal(fs.readFileSync(at('AGENTS.md'), 'utf8'), malformed);
  });
}

test('forced refresh keeps each manual backup after uninstall', (t) => {
  const { run, at } = project(t);
  run('init');
  const rule = at('agent/rules/10-code.md');
  for (const edit of ['first edit', 'second edit']) {
    fs.writeFileSync(rule, edit);
    run('init', ['--force']);
  }
  run('uninstall');
  assert.equal(fs.readFileSync(rule + '.bak', 'utf8'), 'first edit');
  assert.equal(fs.readFileSync(rule + '.bak.1', 'utf8'), 'second edit');
});

test('verify and uninstall reject ambiguous boundaries before removing any files', (t) => {
  const { run, at } = project(t);
  fs.writeFileSync(at('AGENTS.md'), 'legacy\r\n');
  run('adopt');
  fs.writeFileSync(at('AGENTS.md'), end + begin);
  run('verify', [], 1);
  run('uninstall', [], 1);
  assert.ok(fs.existsSync(at('agent/.manifest.json')) && fs.existsSync(at('agent/index.md')));
});
