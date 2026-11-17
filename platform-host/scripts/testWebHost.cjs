const { execFileSync } = require('node:child_process');
const path = require('node:path');
if (process.platform !== 'linux')
  throw Error('Local host acceptance currently requires Linux prlimit');
execFileSync(
  'prlimit',
  ['--core=0', '--', process.execPath, '--test', 'dev/web-host/host.test.cjs'],
  { cwd: path.join(__dirname, '..'), stdio: 'inherit' },
);
