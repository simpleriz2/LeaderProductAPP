const{test}=require('node:test');const assert=require('node:assert/strict');const{execFileSync,spawnSync}=require('node:child_process');const{randomBytes}=require('node:crypto');const path=require('node:path');
const root=path.join(__dirname,'../..');const script=path.join(root,'scripts/hostRuntime.cjs');
test('runtime gate checks actual git base and refuses unknown commit instead of skipping evolution',()=>{
  const base=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  assert.equal(spawnSync(process.execPath,[script,'--base-ref',base],{cwd:root}).status,0);
  const unknown=randomBytes(20).toString('hex');assert.notEqual(spawnSync(process.execPath,[script,'--base-ref',unknown],{cwd:root}).status,0);
});
