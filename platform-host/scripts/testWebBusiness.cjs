const { execFileSync } = require('node:child_process');
const path = require('node:path');
if (process.platform !== 'linux')
  throw Error('Local business acceptance requires Linux prlimit');
execFileSync(
  'prlimit',
  [
    '--core=0',
    '--',
    process.execPath,
    '--test',
    'dev/web-business/business.test.cjs',
  ],
  { cwd: path.join(__dirname, '..'), stdio: 'inherit' },
);
