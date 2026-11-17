const fs=require('node:fs');const path=require('node:path');const{createHash}=require('node:crypto');const{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const output=path.join(root,'host.runtime.json');const hash=value=>createHash('sha256').update(value).digest('hex');
function identities(spec,libraries,sources){
  for(const field of ['androidVersionCode','webHostVersion','sharedAbi'])if(!Number.isSafeInteger(spec[field])||spec[field]<1)throw Error('Invalid host identity version');
  if(typeof spec.versionName!=='string'||!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(spec.versionName))throw Error('Invalid host version name');
  if(!spec.capabilities||typeof spec.capabilities!=='object'||Array.isArray(spec.capabilities))throw Error('Invalid capability registry');
  for(const [name,versions]of Object.entries(spec.capabilities))if(!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(name)||!Array.isArray(versions)||!versions.length||new Set(versions).size!==versions.length||versions.some(v=>!Number.isSafeInteger(v)||v<1))throw Error('Invalid capability contract');
  const nativeLibraries=Object.fromEntries(Object.entries(libraries.native).sort(([a],[b])=>a<b?-1:a>b?1:0));
  const androidRuntime=`lp2-android-${hash(JSON.stringify({abi:spec.sharedAbi,libraries:nativeLibraries})).slice(0,24)}`;
  const nativeFingerprint=hash(JSON.stringify({abi:spec.sharedAbi,capabilities:spec.capabilities,libraries:nativeLibraries,sources}));
  const webRuntime=`lp2-web-${hash(JSON.stringify({abi:spec.sharedAbi,libraries:libraries.web})).slice(0,24)}`;
  return {android:{version:spec.androidVersionCode,versionName:spec.versionName,runtime:androidRuntime,nativeFingerprint,capabilities:spec.capabilities,libraries:nativeLibraries},web:{version:spec.webHostVersion,runtime:webRuntime,libraries:libraries.web},sharedAbi:spec.sharedAbi};
}
function enforceEvolution(previous,next){
  if(!previous)return;
  if(next.android.version<previous.android.version||next.web.version<previous.web.version)throw Error('Host version downgrade denied');
  if(next.android.versionName!==previous.android.versionName&&next.android.version<=previous.android.version)throw Error('APK version name changed: bump androidVersionCode');
  if(next.android.nativeFingerprint!==previous.android.nativeFingerprint&&next.android.version<=previous.android.version)throw Error('Native source/dependencies changed: bump androidVersionCode before generating identity');
  if(next.web.runtime!==previous.web.runtime&&next.web.version<=previous.web.version)throw Error('Web runtime changed: bump webHostVersion');
}
function generate(){
  const spec=JSON.parse(fs.readFileSync(path.join(root,'host.identity.json'),'utf8'));const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const config=JSON.parse(execFileSync(process.execPath,[path.join(root,'node_modules/@react-native-community/cli/build/bin.js'),'config'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const names=new Set(['react','react-native',...Object.keys(config.dependencies).filter(name=>config.dependencies[name].platforms?.android)]);
  const versions=names=>Object.fromEntries([...names].sort().map(name=>{const version=lock.packages[`node_modules/${name}`]?.version;if(!version)throw Error(`Unlocked runtime dependency: ${name}`);return[name,version];}));
  const sources=[];const collect=dir=>{if(!fs.existsSync(path.join(root,dir)))return;for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const file=`${dir}/${item.name}`;if(item.isSymbolicLink())throw Error('Native source symlink denied');if(item.isDirectory())collect(file);else{const raw=fs.readFileSync(path.join(root,file));sources.push([file,hash(/\.(kt|java|xml|gradle|properties|json)$/.test(file)?raw.toString('utf8').replace(/\r\n/g,'\n'):raw)]);}}};
  collect('android/app/src/main');
  for(const file of ['android/app/build.gradle','android/build.gradle','android/gradle.properties','android/gradle/wrapper/gradle-wrapper.properties'])sources.push([file,hash(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'))]);
  return identities(spec,{native:versions(names),web:versions(['react','react-dom','react-native-web'])},sources);
}
if(require.main===module){const next=generate();const existing=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):null;
  if(process.argv.includes('--write')){enforceEvolution(existing,next);fs.writeFileSync(output,JSON.stringify(next,null,2)+'\n');console.log('Host runtime identity generated');}
  else {if(JSON.stringify(existing)!==JSON.stringify(next))throw Error('Stale host.runtime.json; review ABI/version and run scripts/hostRuntime.cjs --write');
    const baseIndex=process.argv.indexOf('--base-ref');const ref=baseIndex>=0?process.argv[baseIndex+1]:null;
    if(ref&&ref!=='0000000000000000000000000000000000000000'){
      if(!/^[a-f0-9]{40}$/.test(ref))throw Error('Invalid base commit');
      const prefix=execFileSync('git',['rev-parse','--show-prefix'],{cwd:root,encoding:'utf8'}).trim();
      let previous=null;try{previous=JSON.parse(execFileSync('git',['show',`${ref}:${prefix}host.runtime.json`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{}
      if(previous)enforceEvolution(previous,next);
    }
    console.log('Native/Web runtime identity matches locked dependencies and native source');}
}
module.exports={identities,enforceEvolution};
