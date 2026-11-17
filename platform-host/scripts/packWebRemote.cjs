const fs=require('node:fs');const path=require('node:path');const{execFileSync}=require('node:child_process');const{createHash}=require('node:crypto');const{atomicallyWrite}=require('../dev/io/atomicFile.cjs');
const root=path.resolve(__dirname,'..');const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function packageWebRemote(module,version,{failStartup=false,profile='probe'}={}){
 if(!['probe','business'].includes(profile)||(profile==='business'&&(module!=='qr'||failStartup)))throw Error('Invalid remote profile');
 if(typeof failStartup!=='boolean')throw Error('Invalid local fault profile');
 if(!['qr','help'].includes(module)||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))throw Error('Explicit probe module/version required');
 execFileSync(process.execPath,[path.join(root,'node_modules/@rspack/cli/bin/rspack.js'),'build','--config','rspack.remote.web.cjs'],{cwd:root,env:{...process.env,LP2_REMOTE:module,LP2_REMOTE_PROFILE:profile,LP2_PROBE_VERSION:version,LP2_PROBE_FAIL_STARTUP:String(failStartup)},stdio:'pipe',maxBuffer:8*1024*1024});
 const dir=path.join(root,'build/compiled-web-remotes',module),name=`${module}.container.js`,files=fs.readdirSync(dir,{withFileTypes:true});
 if(files.length!==1||files[0].name!==name||!files[0].isFile()||files[0].isSymbolicLink())throw Error('Unsupported Web execution package: expected one container without external chunks/assets');
 const bytes=fs.readFileSync(path.join(dir,name)),digest=hash(bytes),key=`artifacts/${digest}.bundle`,target=path.join(root,'build/immutable-web',key);
 if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==digest)throw Error('Corrupt immutable Web artifact');}else atomicallyWrite(target,bytes);
 const artifact={module,version,contract:profile==='business'?'2.0.0':'1.0.0',requires:profile==='business'?{minHost:5,capabilities:{http:2},contracts:{moduleHost:'1.0.0',authActions:'1.0.0'}}:{minHost:1,capabilities:{},contracts:{}},schema:profile==='business'?2:0,name,digest,path:key,size:bytes.length,assets:[]};
 atomicallyWrite(path.join(root,'build/web-inventories',`${module}${profile==='business'?'-business':''}-${version}.json`),Buffer.from(JSON.stringify(artifact,null,2)+'\n'));return artifact;
}
if(require.main===module){const a=packageWebRemote(process.argv[2],process.argv[3]);console.log(`${a.module}@${a.version}: one immutable Web container`);}
module.exports={packageWebRemote};
