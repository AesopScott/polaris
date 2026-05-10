const fs = require('fs');
const path = require('path');

const KEEP = 5;
const distDir = path.resolve(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.log('prune-dist: dist/ does not exist, nothing to do');
  process.exit(0);
}

const installerPattern = /^Polaris (?:Private |Public )?Setup .+\.exe$/;

const installers = fs.readdirSync(distDir)
  .filter(name => installerPattern.test(name))
  .map(name => {
    const full = path.join(distDir, name);
    return { name, full, mtime: fs.statSync(full).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (installers.length <= KEEP) {
  console.log(`prune-dist: ${installers.length} installer(s) on disk, keeping all (limit ${KEEP})`);
}

const toDelete = installers.length > KEEP ? installers.slice(KEEP) : [];
let removed = 0;
for (const file of toDelete) {
  try {
    fs.unlinkSync(file.full);
    removed++;
    console.log(`prune-dist: removed ${file.name}`);
    const blockmap = file.full + '.blockmap';
    if (fs.existsSync(blockmap)) {
      fs.unlinkSync(blockmap);
      console.log(`prune-dist: removed ${file.name}.blockmap`);
    }
  } catch (err) {
    console.error(`prune-dist: failed to remove ${file.name}: ${err.message}`);
  }
}

const remainingInstallers = new Set(fs.readdirSync(distDir)
  .filter(name => installerPattern.test(name))
  .map(name => name + '.blockmap'));

let removedBlockmaps = 0;
let removedLegacy = 0;
for (const name of fs.readdirSync(distDir)) {
  const legacyArtifact =
    /^Polaris (?:Private |Public )?Setup .+\.exe_old$/.test(name) ||
    /^polaris-.+\.nsis\.7z$/.test(name);
  if (legacyArtifact) {
    try {
      fs.unlinkSync(path.join(distDir, name));
      removedLegacy++;
      console.log(`prune-dist: removed legacy artifact ${name}`);
    } catch (err) {
      console.error(`prune-dist: failed to remove legacy artifact ${name}: ${err.message}`);
    }
    continue;
  }

  if (!name.endsWith('.exe.blockmap') || remainingInstallers.has(name)) continue;
  try {
    fs.unlinkSync(path.join(distDir, name));
    removedBlockmaps++;
    console.log(`prune-dist: removed orphan blockmap ${name}`);
  } catch (err) {
    console.error(`prune-dist: failed to remove orphan blockmap ${name}: ${err.message}`);
  }
}

console.log(`prune-dist: kept ${KEEP} most recent installer(s), removed ${removed} older one(s)`);
if (removedBlockmaps > 0) console.log(`prune-dist: removed ${removedBlockmaps} orphan blockmap(s)`);
if (removedLegacy > 0) console.log(`prune-dist: removed ${removedLegacy} legacy artifact(s)`);
