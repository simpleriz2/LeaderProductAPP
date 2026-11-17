const fs=require('node:fs');const path=require('node:path');const{execFileSync}=require('node:child_process');const{createHash}=require('node:crypto');
const{atomicallyWrite}=require('../dev/io/atomicFile.cjs');
const root=path.resolve(__dirname,'..');const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function packageRemote(module,version,{build=true,profile='probe'}={}){
  if(!['probe','business'].includes(profile)||(profile==='business'&&module!=='qr'))throw Error('Invalid remote profile');
  if(!['qr','help'].includes(module)||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))throw Error('Explicit probe module/version required');
  if(build)execFileSync(process.execPath,[path.join(root,'node_modules/@react-native-community/cli/build/bin.js'),'bundle','--config','rspack.remote.cjs','--platform','android','--dev','false','--entry-file','remotes/entry.js','--bundle-output',`build/remote-packages/${module}/android/index.bundle`,'--assets-dest',`build/remote-packages/${module}/android`],{cwd:root,env:{...process.env,LP2_REMOTE:module,LP2_REMOTE_PROFILE:profile,LP2_PROBE_VERSION:version},stdio:'pipe',maxBuffer:8*1024*1024});
  const compiled=path.join(root,'build/compiled-remotes',module,'android');
  const manifest=JSON.parse(fs.readFileSync(path.join(compiled,'mf-manifest.json'),'utf8'));
  if(manifest.metaData.buildInfo.buildVersion!==version||manifest.name!==module||manifest.metaData.remoteEntry.name!==`${module}.container.bundle`||manifest.metaData.remoteEntry.path!==''||manifest.remotes?.length)throw Error('Unexpected federation identity/dependencies');
  if(manifest.exposes?.length!==1||manifest.exposes[0].path!==(profile==='business'?'./Module':'./Screen'))throw Error('Federation exposure/profile mismatch');
  const files=[];
  function walk(dir,prefix='') {for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=`${prefix}${item.name}`;const source=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in artifact output');if(item.isDirectory())walk(source,`${name}/`);else if(!name.endsWith('.map')&&name!=='mf-stats.json'){
    const bytes=fs.readFileSync(source),digest=hash(bytes),key=`artifacts/${digest}.bundle`,target=path.join(root,'build/immutable',key);
    if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==digest)throw Error('Immutable storage corrupted');}else atomicallyWrite(target,bytes);
    files.push({name,digest,path:key,size:bytes.length});
  }}}
  walk(compiled);
  const names=new Set(files.map(f=>f.name));
  const references=[manifest.metaData.remoteEntry.name];
  for(const item of [...(manifest.shared||[]),...(manifest.exposes||[])])for(const type of ['js','css'])for(const mode of ['sync','async'])references.push(...(item.assets?.[type]?.[mode]||[]));
  for(const name of references)if(!names.has(name))throw Error(`Missing federation asset: ${name}`);
  const entry=files.find(f=>f.name===`${module}.container.bundle`);if(!entry)throw Error('Missing container');
  const artifact={module,version,contract:profile==='business'?'2.0.0':'1.0.0',requires:profile==='business'?{minHost:5,capabilities:{http:2},contracts:{moduleHost:'1.0.0',authActions:'1.0.0'}}:{minHost:1,capabilities:{},contracts:{}},schema:profile==='business'?2:1,...entry,assets:files.filter(f=>f!==entry)};
  atomicallyWrite(path.join(root,'build/inventories',`${module}${profile==='business'?'-business':''}-${version}.json`),Buffer.from(JSON.stringify(artifact,null,2)+'\n'));
  return artifact;
}
if(require.main===module){const artifact=packageRemote(process.argv[2],process.argv[3]);console.log(`${artifact.module}@${artifact.version}: ${artifact.assets.length+1} immutable runtime files`);}
module.exports={packageRemote};
