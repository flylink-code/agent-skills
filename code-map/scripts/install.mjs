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
const MANAGED = ['SKILL.md', 'README.md', 'scripts', 'templates'];

const options = { agents: [], library: false, project: '', dir: '', dryRun: false, list: false, help: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--agent' || arg === '--project' || arg === '--dir') {
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

function installProject(project) {
  const doc = path.join(project, 'doc');
  const copies = [
    [path.join(repo, 'scripts', 'codemap.mjs'), path.join(doc, 'codemap.mjs'), true],
    [path.join(repo, 'templates', 'codemap.config.json'), path.join(doc, 'codemap.config.json'), false]
  ];
  for (const [source, target, overwrite] of copies) {
    if (fs.existsSync(target) && (!overwrite || same(source, target))) {
      console.log(`kept      ${target}${overwrite ? '' : ' (config exists; left as it is)'}`);
      continue;
    }
    console.log(`${options.dryRun ? 'would copy' : 'copied'}    ${target}`);
    if (options.dryRun) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
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
    if (!targets.length && !options.project) {
      process.stderr.write(usage);
      process.exitCode = 2;
    }
    for (const target of targets) installSkills(target);
    if (options.project) installProject(path.resolve(options.project));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
