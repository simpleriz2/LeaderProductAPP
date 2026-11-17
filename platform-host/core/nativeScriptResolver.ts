import type {Activation,ArtifactFile} from './releaseSet';
export type NativeExecutionFiles={verifiedFile(company:string,user:string,digest:string,size:number):Promise<string>};
/** Maps compiled Re.Pack identities to signed files only. Unknown scripts throw: NEVER resolver fallthrough. */
export function createNativeScriptResolver(activation:Activation,files:NativeExecutionFiles,checkpoint:()=>Promise<void>){
  const modules=new Map(activation.release.artifacts.map(artifact=>[artifact.module,artifact]));let disposed=false;
  return{
    dispose(){disposed=true;},
    async resolve(scriptId:string,caller?:string){
      if(disposed)throw Error('Native federation disposed; restart required');await checkpoint();
      let file:ArtifactFile;
      if(caller===undefined){const entry=modules.get(scriptId);if(!entry||entry.name!==`${scriptId}.container.bundle`)throw Error('Unknown native container');file=entry;}
      else{
        const owner=modules.get(caller);if(!owner)throw Error('Unknown native caller');
        // Re.Pack builds child filenames from the exact chunk id; no URL basename/network fallback.
        const asset=owner.assets.find(item=>item.name===`${scriptId}.chunk.bundle`);
        if(!asset)throw Error('Unknown native chunk');file=asset;
      }
      const url=await files.verifiedFile(activation.company,activation.user,file.digest,file.size);await checkpoint();
      if(disposed)throw Error('Native federation disposed; restart required');
      const suffix=`/lp2-release-store/execution/${activation.company}/${activation.user}/${file.digest}.bundle`;
      if(!/^file:\/\/\/[A-Za-z0-9_./-]+$/.test(url)||url.includes('/../')||url.includes('/./')||!url.endsWith(suffix))throw Error('Invalid private execution URL');
      return{url,absolute:true,cache:false,retry:0,verifyScriptSignature:'off' as const};
    },
  };
}
