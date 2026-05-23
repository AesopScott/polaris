// Verify RM_RECURSIVE_ROOT detect equivalence including quoted paths
const detect = cmd => /\brm\s+-[rRfF ]*[rR][fF]?\s+[/"']*[\/\\]/i.test(cmd);

const cases = [
  ['rm -rf /',         true,  'unquoted root'],
  ["rm -rf '/'",       true,  'single-quoted root'],
  ['rm -rf "/",',      true,  'double-quoted root'],
  ['rm -r /var/log',   true,  'unquoted subpath'],
  ['rm -Rf /',         true,  'uppercase flags'],
  ['rm -f /something', false, 'no r flag'],
  ['rm -rf mydir',     false, 'relative path'],
  ['rm file.txt',      false, 'no flags no slash'],
];

let ok = true;
for (const [cmd, expected, label] of cases) {
  const got = detect(cmd);
  const pass = got === expected;
  console.log(pass ? 'OK  ' : 'FAIL', label, '|', JSON.stringify(cmd), '->', got);
  if (!pass) ok = false;
}
console.log(ok ? '\nRM_RECURSIVE_ROOT REGEX OK' : '\nRM_RECURSIVE_ROOT REGEX MISMATCH');
