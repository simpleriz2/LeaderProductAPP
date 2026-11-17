import type {SessionLease} from '../core/sessionCoordinator';
import {identifier,recordId,validateScope,jsonPayload} from './contracts.ts';
import type {DataAccessGuard} from './generationFence';
import type {DataDriver,DataScope,DataRow,RawChange,WriteReceipt} from './contracts';
export type Codec<T>={encode(value:T):unknown;decode(value:unknown):T};
export type RecordValue<T>={id:string;revision:number;value:T};
const brand:unique symbol=Symbol('owned database mutation');
export type Mutation={readonly[brand]:true};
function serialize(value:unknown):string{
  const raw=JSON.stringify(value,(_,next)=>{if(next===undefined||typeof next==='function'||typeof next==='symbol'||typeof next==='bigint'||(typeof next==='number'&&!Number.isFinite(next)))throw Error('Payload must be JSON');return next;});
  if(typeof raw!=='string')throw Error('Invalid record payload');jsonPayload(raw);return raw;
}
export class ModuleDatabase{
  private mutations=new WeakMap<Mutation,RawChange>();
  private readonly driver:DataDriver;private readonly scope:DataScope;private readonly owner:string;private readonly schema:number;private readonly checkpoint:()=>void;private readonly access:<T>(work:()=>Promise<T>)=>Promise<T>;
  constructor(driver:DataDriver,scope:DataScope,owner:string,schema:number,checkpoint:()=>void,access:<T>(work:()=>Promise<T>)=>Promise<T>){validateScope(scope);identifier(owner);if(!Number.isSafeInteger(schema)||schema<1)throw Error('Invalid module schema');this.driver=driver;this.scope=Object.freeze({...scope});this.owner=owner;this.schema=schema;this.checkpoint=checkpoint;this.access=access;checkpoint();}
  private async operate<T>(work:()=>Promise<T>):Promise<T>{this.checkpoint();const result=await this.access(async()=>{this.checkpoint();const value=await work();this.checkpoint();return value;});this.checkpoint();return result;}
  collection<T>(name:string,codec:Codec<T>){
    identifier(name);const decode=(row:DataRow|null,expected?:string):RecordValue<T>|null=>{if(row===null)return null;if(!row||typeof row!=='object'||(expected!==undefined&&row.id!==expected))throw Error('Corrupt data row');recordId(row.id);if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Corrupt record revision');jsonPayload(row.payload);const value=codec.decode(JSON.parse(row.payload));this.checkpoint();return{id:row.id,revision:row.revision,value};};
    const mutation=(id:string,expectedRevision:number|null,payload:string|null):Mutation=>{this.checkpoint();recordId(id);const token=Object.freeze({[brand]:true as const});this.mutations.set(token,{collection:name,id,expectedRevision,payload});return token;};
    return Object.freeze({
      get:async(id:string)=>{this.checkpoint();const row=await this.operate(()=>this.driver.read(this.scope,this.owner,this.schema,name,recordId(id)));this.checkpoint();return decode(row,id);},
      list:async(limit=100,after?:string)=>{this.checkpoint();if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('Invalid page size');if(after!==undefined)recordId(after);const rows=await this.operate(()=>this.driver.list(this.scope,this.owner,this.schema,name,limit,after));this.checkpoint();if(!Array.isArray(rows))throw Error('Corrupt data page');return rows.map(row=>{const value=decode(row);if(!value)throw Error('Corrupt data page row');return value;});},
      put:(id:string,value:T,expectedRevision:number|null)=>{this.checkpoint();return mutation(id,expectedRevision,serialize(codec.encode(value)));},
      remove:(id:string,expectedRevision:number)=>mutation(id,expectedRevision,null),
    });
  }
  async transaction(changes:readonly Mutation[]):Promise<WriteReceipt[]>{
    this.checkpoint();const raw=changes.map(change=>{const value=this.mutations.get(change);if(!value)throw Error('Mutation belongs to another module/generation');return{...value};});
    const result=await this.operate(()=>this.driver.write(this.scope,{module:this.owner,expectedSchema:this.schema,changes:raw}));this.checkpoint();return result;
  }
}
/** Only the host constructs this from a verified release and a confirmed account lease. */
export function createDatabaseSession(driver:DataDriver,lease:SessionLease,generation:string,schemas:Readonly<Record<string,number>>,guard:DataAccessGuard){
  if(!guard?.run)throw Error('Data generation guard is required');
  const scope=Object.freeze({company:lease.session.company,user:lease.session.user,generation});validateScope(scope);const allowed=new Map(Object.entries(schemas));const handles=new Map<string,ModuleDatabase>();let disposed=false;
  const checkpoint=()=>{if(disposed)throw Error('Data session disposed');lease.assertCurrent();if(lease.session.company!==scope.company||lease.session.user!==scope.user)throw Error('Data session scope changed');};
  return Object.freeze({module:(owner:string)=>{checkpoint();if(!lease.session.modules.includes(owner)||!allowed.has(owner))throw Error('Data module not entitled');if(!handles.has(owner))handles.set(owner,new ModuleDatabase(driver,scope,owner,allowed.get(owner)!,()=>{checkpoint();if(!lease.session.modules.includes(owner))throw Error('Data module not entitled');},work=>guard.run(scope,owner,allowed.get(owner)!,lease.signal,work)));return handles.get(owner)!;},dispose:async()=>{if(disposed)return;disposed=true;await driver.close(scope);}});
}
