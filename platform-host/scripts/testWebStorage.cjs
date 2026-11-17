const{execFileSync}=require('node:child_process');const path=require('node:path');
const root=path.join(__dirname,'..');
execFileSync(process.execPath,[path.join(root,'node_modules/@rspack/cli/bin/rspack.js'),'build','--config','rspack.web-test.cjs'],{cwd:root,stdio:'inherit'});
// The test deliberately crashes ONLY its own temporary Chromium instance. Never emit memory core dumps.
if(process.platform!=='linux')throw Error('Crash-recovery acceptance currently requires Linux prlimit; other browsers/platforms remain pending');
execFileSync('prlimit',['--core=0','--',process.execPath,'--test','--test-concurrency=1','dev/web/releaseStorage.test.cjs','dev/web/database.test.cjs','dev/web/generationFence.test.cjs'],{cwd:root,stdio:'inherit'});
