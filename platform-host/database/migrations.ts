import {ModuleDatabase} from './moduleDatabase.ts';
import {identifier} from './contracts.ts';
import type {DataDriver,DataScope} from './contracts';
import type {SessionLease} from '../core/sessionCoordinator';
import type {Activation,ReleaseSet} from '../core/releaseSet';
export type SchemaOwner={module:string;base:1;initialize(database:ModuleDatabase):Promise<void>;migrations:readonly{from:number;to:number;run(database:ModuleDatabase):Promise<void>}[]};
/** Domain-owned migration callbacks receive ONLY their own typed module collections, never SQL. */
export async function prepareDataGeneration(driver:DataDriver,lease:SessionLease,release:ReleaseSet,previous:Activation|null,owners:readonly SchemaOwner[],createId:()=>string):Promise<string>{
  const checkpoint=()=>{lease.assertCurrent();if(lease.session.company!==release.company)throw Error('Wrong migration tenant');};checkpoint();
  if(previous&&(previous.company!==release.company||previous.user!==lease.session.user))throw Error('Cross-account migration');
  const registry=new Map<string,SchemaOwner>();
  for(const owner of owners){identifier(owner.module);if(registry.has(owner.module)||owner.base!==1||!owner.initialize)throw Error('Invalid schema ownership');
    owner.migrations.forEach((step,index)=>{if(step.from!==index+1||step.to!==index+2||!step.run)throw Error('Migration history must retain ordered single steps');});registry.set(owner.module,owner);
  }
  const source:DataScope|null=previous?{company:previous.company,user:previous.user,generation:previous.dataGeneration}:null;
  if(source){await driver.verify(source,Object.fromEntries(previous!.release.artifacts.map(a=>[a.module,a.schema])));checkpoint();}
  const plans=[];
  for(const artifact of release.artifacts){
    if(!lease.session.modules.includes(artifact.module))throw Error('Migration module not entitled');
    const owner=registry.get(artifact.module);if(!owner||artifact.schema<1||artifact.schema>owner.migrations.length+1)throw Error('Missing owned migration history');
    const from=source?await driver.schema(source,artifact.module):0;checkpoint();
    if(from>artifact.schema)throw Error('Destructive data downgrade denied');plans.push({artifact,owner,from});
  }
  const generation=identifier(createId());const target={company:release.company,user:lease.session.user,generation};
  await driver.fork(source,target);checkpoint();
  async function run(module:string,schema:number,callback:(database:ModuleDatabase)=>Promise<void>){
    let open=true;const database=new ModuleDatabase(driver,target,module,schema,()=>{checkpoint();if(!open)throw Error('Migration view closed');});
    try{await callback(database);checkpoint();}finally{open=false;}
  }
  for(const{artifact,owner,from}of plans){
    let current=from;
    if(current===0){await driver.write(target,{module:artifact.module,expectedSchema:0,targetSchema:1,changes:[]});checkpoint();await run(artifact.module,1,owner.initialize);current=1;}
    while(current<artifact.schema){
      const step=owner.migrations[current-1];await run(artifact.module,current,step.run);
      await driver.write(target,{module:artifact.module,expectedSchema:current,targetSchema:step.to,changes:[]});checkpoint();current=step.to;
    }
  }
  await driver.verify(target,Object.fromEntries(release.artifacts.map(a=>[a.module,a.schema])));checkpoint();
  return generation;
}
