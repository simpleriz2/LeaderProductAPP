// Public Android debug credentials, solely for isolated local/CI acceptance APKs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const target = path.resolve(__dirname, '../android/app/debug.keystore');
if (!fs.existsSync(target)) execFileSync(process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/keytool') : 'keytool', [
  '-genkeypair', '-keystore', target, '-storepass', 'android', '-alias', 'androiddebugkey',
  '-keypass', 'android', '-dname', 'CN=Leader Product Fork Local Test', '-keyalg', 'RSA', '-validity', '3650',
], { stdio: 'inherit' });
