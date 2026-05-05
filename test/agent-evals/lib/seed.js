'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeSeedDir(fixtureId, files = {}) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const dir = path.join(os.tmpdir(), `polaris-eval-${fixtureId}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return dir;
}

function cleanSeedDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

module.exports = { makeSeedDir, cleanSeedDir };
