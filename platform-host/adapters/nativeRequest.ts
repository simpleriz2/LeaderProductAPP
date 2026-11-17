/** JS cancellation settles immediately even if a native request is still in a bounded queue. */
export async function runNativeRequest<T>(signal:AbortSignal,start:()=>Promise<T>,cancel:()=>void):Promise<T>{
 if(signal.aborted)throw Error('Request aborted');let rejectAbort:(error:Error)=>void=()=>{};
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const onAbort=()=>{try{cancel();}catch{}rejectAbort(Error('Request aborted'));};
 signal.addEventListener('abort',onAbort,{once:true});
 try{const executing=Promise.resolve().then(()=>{if(signal.aborted)throw Error('Request aborted');return start();});const response=await Promise.race([executing,aborted]);if(signal.aborted)throw Error('Request aborted');return response;}
 finally{signal.removeEventListener('abort',onAbort);}
}
