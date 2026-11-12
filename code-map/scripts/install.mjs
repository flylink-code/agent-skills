import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Installs this skill from the repository into an agent's skills folder, the
// magpie library, or a project's doc/ folder. The repository is the source:
// run this after a pull instead of editing the installed copies.

const repo = path.resolve(import.meta.dirname, '..');
const home = os.homedir();
const HOME_TARGETS = {
  dsh: ['.dsh', 'skills'],
  claude: ['.claude', 'skills'],
  codex: ['.codex', 'skills'],
  cursor: ['.cursor', 'skills'],
  opencode: ['.config', 'opencode', 'skills']
};
const LIBRARY = ['.config', 'magpie', 'library', 'skills', 'code-map'];
const MANAGED = ['SKILL.md', 'README.md', 'scripts', 'templates', 'references'];

const options = { agents: [], library: false, project: '', workspace: '', dir: '', dryRun: false, list: false, help: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--agent' || arg === '--project' || arg === '--workspace' || arg === '--dir') {
    const value = process.argv[++i];
    if (!value) throw new Error(`${arg} needs a value`);
    if (arg === '--agent') options.agents.push(...value.split(',').map(name => name.trim()).filter(Boolean));
    else options[arg.slice(2)] = value;
  } else if (arg === '--all-agents') options.agents.push(...Object.keys(HOME_TARGETS));
  else if (arg === '--library') options.library = true;
  else if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--list') options.list = true;
  else if (arg === '--help' || arg === '-h') options.help = true;
  else throw new Error(`Unknown argument: ${arg}`);
}

const usage = `Usage: node scripts/install.mjs <target>

  --agent <id[,id…]>   install into that agent's skills folder (${Object.keys(HOME_TARGETS).join(', ')})
  --all-agents         install into every agent folder that exists
  --library            install into the magpie library (${path.join(home, ...LIBRARY)})
  --project <dir>      copy the generator and a config template into <dir>/doc/
  --workspace <dir>    install every project under <dir> and put the registry script in <dir>/doc/
  --dir <path>         install into an explicit skills folder
  --list               show the folders this would write to
  --dry-run            report changes without writing
`;

// A junction, a symlink and a real folder all work; write through the link so
// the link itself is never removed (magpie owns the ones it made).
const realish = target => {
  try {
    const stat = fs.lstatSync(target);
    return stat.isSymbolicLink() ? fs.realpathSync(target) : target;
  } catch {
    return target;
  }
};

const same = (a, b) => {
  try {
    return fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8');
  } catch {
    return false;
  }
};

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
});

function syncDir(from, to, report) {
  for (const relative of walk(from)) {
    const source = path.join(from, relative);
    const target = path.join(to, relative);
    if (same(source, target)) {
      report.unchanged++;
      continue;
    }
    report.changed++;
    if (options.dryRun) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  if (!fs.existsSync(to)) return;
  for (const relative of walk(to)) {
    if (fs.existsSync(path.join(from, relative))) continue;
    report.removed++;
    if (!options.dryRun) fs.rmSync(path.join(to, relative), { force: true });
  }
}

function installSkills(target) {
  const resolved = realish(target);
  const report = { target: resolved, changed: 0, unchanged: 0, removed: 0 };
  for (const entry of MANAGED) {
    const source = path.join(repo, entry);
    const destination = path.join(resolved, entry);
    if (fs.statSync(source).isDirectory()) syncDir(source, destination, report);
    else if (same(source, destination)) report.unchanged++;
    else {
      report.changed++;
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
    }
  }
  console.log(`${options.dryRun ? 'would install' : 'installed'}  ${resolved}  (${report.changed} changed, ${report.removed} removed, ${report.unchanged} unchanged)`);
  if (resolved !== target) console.log(`           via link ${target}`);
}

function copyInto(source, target, overwrite, keepNote = '') {
  if (fs.existsSync(target) && (!overwrite || same(source, target))) {
    console.log(`kept      ${target}${keepNote}`);
    return;
  }
  console.log(`${options.dryRun ? 'would copy' : 'copied'}    ${target}`);
  if (options.dryRun) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function installProject(project) {
  const doc = path.join(project, 'doc');
  copyInto(path.join(repo, 'scripts', 'codemap.mjs'), path.join(doc, 'codemap.mjs'), true);
  copyInto(path.join(repo, 'templates', 'codemap.config.json'), path.join(doc, 'codemap.config.json'), false, ' (config exists; left as it is)');
}

// A workspace holds several independent projects, each with its own map. The
// registry config decides membership; without it, projects that already own a
// config file are adopted and git-only folders are listed as not yet wired.
function readWorkspaceConfig(root) {
  const file = path.join(root, 'doc', 'codemap-workspace.json');
  if (!fs.existsSync(file)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  return projects
    .map(entry => (typeof entry === 'string' ? { path: entry } : entry || {}))
    .filter(entry => typeof entry.path === 'string' && entry.path.trim());
}

function discoverProjects(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'doc' && entry.name !== 'node_modules')
    .map(entry => path.join(root, entry.name))
    .filter(project => fs.existsSync(path.join(project, 'doc', 'codemap.config.json')));
}

function installWorkspace(workspace) {
  const root = path.resolve(workspace);
  const config = readWorkspaceConfig(root);
  const declared = config ? config.map(entry => path.resolve(root, entry.path)) : discoverProjects(root);
  const projects = declared.filter(project => fs.existsSync(project));
  for (const missing of declared.filter(project => !fs.existsSync(project))) {
    console.log(`skipped   ${missing}  (declared in codemap-workspace.json but missing)`);
  }
  console.log(`${config ? 'config' : 'discovered'}  ${projects.length} project(s) under ${root}`);
  if (!projects.length) console.log('          add projects to doc/codemap-workspace.json, or run --project <dir> for each');
  for (const project of projects) installProject(project);
  const doc = path.join(root, 'doc');
  copyInto(path.join(repo, 'scripts', 'codemap-workspace.mjs'), path.join(doc, 'codemap-workspace.mjs'), true);
  copyInto(path.join(repo, 'templates', 'codemap-workspace.json'), path.join(doc, 'codemap-workspace.json'), false, ' (registry config exists; left as it is)');
  copyInto(path.join(repo, 'templates', 'AGENTS.section.workspace.md'), path.join(doc, 'AGENTS.section.workspace.md'), true);
  console.log(`next      edit ${path.join(doc, 'codemap-workspace.json')}, then run node doc/codemap-workspace.mjs build`);
}

try {
  if (options.help) {
    process.stdout.write(usage);
  } else if (options.list) {
    for (const [agent, parts] of Object.entries(HOME_TARGETS)) {
      const dir = path.join(home, ...parts);
      console.log(`${agent.padEnd(9)} ${dir}${fs.existsSync(dir) ? '' : '  (missing)'}`);
    }
    console.log(`${'library'.padEnd(9)} ${path.join(home, ...LIBRARY)}${fs.existsSync(path.join(home, ...LIBRARY)) ? '' : '  (missing)'}`);
  } else {
    const targets = [];
    for (const agent of options.agents) {
      const parts = HOME_TARGETS[agent];
      if (!parts) throw new Error(`Unknown agent: ${agent}. Known: ${Object.keys(HOME_TARGETS).join(', ')}`);
      targets.push(path.join(home, ...parts, 'code-map'));
    }
    if (options.library) targets.push(path.join(home, ...LIBRARY));
    if (options.dir) targets.push(path.resolve(options.dir));
    if (!targets.length && !options.project && !options.workspace) {
      process.stderr.write(usage);
      process.exitCode = 2;
    }
    for (const target of targets) installSkills(target);
    if (options.project) installProject(path.resolve(options.project));
    if (options.workspace) installWorkspace(options.workspace);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
