const path = require('path');

const DEFAULT_BLOCKED_CLASSES = Object.freeze([
  'GIT_FORCE_PUSH', 'GIT_RESET_HARD', 'GIT_CLEAN',
  'DRIVE_FORMAT', 'RM_RECURSIVE_ROOT', 'RD_FULL_DRIVE',
]);

function buildDefaultPolicy(session, config) {
  const wd = session.workDir ? path.resolve(session.workDir) : null;
  const roots = wd ? [wd] : [];
  const obsidian = config && config.obsidianVaultPath ? config.obsidianVaultPath : null;
  const downloads = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : null;
  if (obsidian) roots.push(obsidian);
  if (downloads) roots.push(downloads);
  return Object.freeze({
    allowedRoots:          roots,
    writeMode:             wd ? 'extended' : 'read-only',
    networkAllowed:        true,
    installerAllowed:      false,
    blockedCommandClasses: DEFAULT_BLOCKED_CLASSES,
    trustLevel:            wd ? 'standard' : 'restricted',
  });
}

// Test 1: standard session with workDir
const p1 = buildDefaultPolicy({ workDir: 'C:\\test' }, { obsidianVaultPath: null });
const fields = ['allowedRoots', 'writeMode', 'networkAllowed', 'installerAllowed', 'blockedCommandClasses', 'trustLevel'];
fields.forEach(f => { if (!(f in p1)) throw new Error('missing field: ' + f); });
if (!Object.isFrozen(p1)) throw new Error('policy not frozen');
if (p1.trustLevel !== 'standard') throw new Error('wrong trustLevel: ' + p1.trustLevel);
if (p1.writeMode !== 'extended') throw new Error('wrong writeMode: ' + p1.writeMode);
if (p1.installerAllowed !== false) throw new Error('installerAllowed should be false');
if (p1.allowedRoots.length < 1) throw new Error('allowedRoots should have at least workDir');
if (p1.blockedCommandClasses.length !== 6) throw new Error('expected 6 blocked classes');

// Test 2: restricted session (no workDir)
const p2 = buildDefaultPolicy({}, {});
if (p2.trustLevel !== 'restricted') throw new Error('no-workDir should be restricted');
if (p2.writeMode !== 'read-only') throw new Error('no-workDir should be read-only');
if (p2.allowedRoots.length !== 0) throw new Error('no-workDir should have empty roots');

console.log('PU1 PASS', JSON.stringify(p1, null, 2));
console.log('restricted PASS', JSON.stringify(p2));
