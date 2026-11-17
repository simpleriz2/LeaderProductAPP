/** One deadline covers connection, headers AND the complete bounded body read. */
export async function withWebRequestDeadline<T>(source:AbortSignal,timeoutMs:number,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>120000)throw Error('Invalid request deadline');
  if(source.aborted)throw Error('Request aborted');
  const controller=new AbortController();let expired=false;
  const abort=()=>controller.abort(new DOMException('Request aborted','AbortError'));
  source.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{expired=true;controller.abort(new DOMException('Request deadline exceeded','TimeoutError'));},timeoutMs);
  try{const result=await work(controller.signal);if(expired)throw Error('Request deadline exceeded');if(source.aborted)throw Error('Request aborted');return result;}
  catch(error){if(expired)throw Error('Request deadline exceeded');if(source.aborted)throw Error('Request aborted');throw error;}
  finally{clearTimeout(timer);source.removeEventListener('abort',abort);}
}
