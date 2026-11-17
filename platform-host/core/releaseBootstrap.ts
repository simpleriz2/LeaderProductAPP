import {artifactFiles,rollbackCode,stageAndActivate,verifyRelease} from './releaseSet.ts';
import type {Activation,ReleaseContext,ReleasePorts,SignedRelease,ReleaseProgress} from './releaseSet';
import {bindReleaseSession} from './releaseSession.ts';
import type {SessionLease} from './sessionCoordinator';
export type BootstrapProgress={phase:'checking'|'updating'|'verifying-installed'|'ready'|'recovery';release?:ReleaseProgress};
export type BootstrapPorts=Omit<ReleasePorts,'checkpoint'|'onProgress'>&{
  assignedRelease():Promise<SignedRelease>;
  /** Domain storage SDK verifies the committed generation; never substitutes an older data copy. */
  verifyData(activation:Activation):Promise<void>;
  onProgress?(progress:BootstrapProgress):void;
};
async function verifyMetadataAndData(activation:Activation,context:ReleaseContext,ports:ReleasePorts,verifyData:BootstrapPorts['verifyData']) {
  ports.checkpoint();
  if(activation.company!==context.company||activation.user!==context.user)throw Error('Wrong installed namespace');
  const release=await verifyRelease(activation.signed,context,ports.trust);ports.checkpoint();
  if(JSON.stringify(release)!==JSON.stringify(activation.release))throw Error('Corrupt installed metadata');
  await verifyData(activation);ports.checkpoint();
}
export async function verifyInstalled(activation:Activation,context:ReleaseContext,ports:ReleasePorts,verifyData:BootstrapPorts['verifyData']):Promise<void>{
  await verifyMetadataAndData(activation,context,ports,verifyData);
  for(const file of artifactFiles(activation.release)){
    const bytes=await ports.storage.cachedFile(context.company,context.user,file);ports.checkpoint();
    if(!bytes||bytes.length!==file.size||await ports.trust.sha256(bytes)!==file.digest)throw Error('Incomplete installed release');
    ports.checkpoint();
  }
}
/** Returns only a verified working set. Business module init/activation belongs after this promise. */
export async function bootstrapRelease(lease:SessionLease,context:ReleaseContext,ports:BootstrapPorts):Promise<{mode:'online'|'offline'|'recovered';activation:Activation}>{
  const progress=(event:BootstrapProgress)=>{lease.assertCurrent();try{ports.onProgress?.(event);}catch{/* UI cannot change release correctness. */}lease.assertCurrent();};
  const bound=bindReleaseSession(lease,context,{...ports,onProgress:release=>progress({phase:'updating',release})});
  progress({phase:'checking'});
  try{
    let activation:Activation;let mode:'online'|'offline'|'recovered';
    if(lease.online){
      const assigned=await ports.assignedRelease();bound.checkpoint();
      await verifyRelease(assigned,context,bound.trust);bound.checkpoint();
      const current=await bound.storage.current(context.company,context.user);bound.checkpoint();
      if(current&&JSON.stringify(current.signed)===JSON.stringify(assigned)){
        try{await verifyInstalled(current,context,bound,ports.verifyData);activation=current;}
        catch(error){
          bound.checkpoint();await verifyMetadataAndData(current,context,bound,ports.verifyData);
          activation=await stageAndActivate(assigned,context,{...bound,prepareData:async(_,actual)=>{
            if(actual?.dataGeneration!==current.dataGeneration||actual?.release.id!==current.release.id)throw Error('Concurrent repair');
            return current.dataGeneration;
          }});
        }
      }else activation=await stageAndActivate(assigned,context,bound);
      mode='online';
    }else{
      const installed=await ports.storage.current(context.company,context.user);bound.checkpoint();
      if(!installed)throw Error('First installation requires network');
      activation=installed;mode='offline';
      try{await verifyInstalled(installed,context,bound,ports.verifyData);}
      catch(error){
        bound.checkpoint();
        // Only code corruption can use LKG. Untrusted metadata/data never triggers a guessed DB rollback.
        await verifyMetadataAndData(installed,context,bound,ports.verifyData);
        const good=await bound.storage.lastGood(context.company,context.user);bound.checkpoint();
        if(!good)throw error;
        activation=await rollbackCode(good.signed,context,bound);mode='recovered';
      }
    }
    progress({phase:'verifying-installed'});
    await verifyInstalled(activation,context,bound,ports.verifyData);
    progress({phase:'ready'});return{mode,activation};
  }catch(error){
    // Logout/revoke cannot emit recovery or ready state into a different account's UI.
    bound.checkpoint();progress({phase:'recovery'});throw error;
  }
}

/** Host calls this after its actual selected module/startup health check, never merely after download. */
export async function confirmReleaseHealthy(lease:SessionLease,context:ReleaseContext,ports:BootstrapPorts,activation:Activation,startupHealth:()=>Promise<void>):Promise<void>{
  const bound=bindReleaseSession(lease,context,{...ports,onProgress:undefined});
  await verifyInstalled(activation,context,bound,ports.verifyData);
  await startupHealth();bound.checkpoint();
  await bound.storage.confirmHealthy(activation);bound.checkpoint();
}
/** Runtime failure recovery changes disk pointers only; restart before executing another federation set. */
export async function recoverLastHealthy(lease:SessionLease,context:ReleaseContext,ports:BootstrapPorts):Promise<{activation:Activation;restartRequired:true}>{
  const bound=bindReleaseSession(lease,context,{...ports,onProgress:undefined});
  const good=await bound.storage.lastGood(context.company,context.user);bound.checkpoint();
  if(!good)throw Error('No confirmed healthy release');
  const activation=await rollbackCode(good.signed,context,bound);
  await verifyInstalled(activation,context,bound,ports.verifyData);
  return{activation,restartRequired:true};
}
