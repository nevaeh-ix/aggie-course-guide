// Runs the published browser worker and its local WASM assets under Node VM
// worker globals. This is CPU inference, not a browser interaction measurement.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadWasmEncoder(root) {
 class DedicatedWorkerGlobalScope {}
 let result;
 const self=new DedicatedWorkerGlobalScope();
 self.location={href:'https://benchmark.local/ai-worker.js'};
 self.postMessage=data=>{if(data.status!=='loading')result=data;};
 const fetchLocal=async input=>{
  const url=new URL(typeof input==='string'?input:input.url,'https://benchmark.local/');
  if(url.origin!=='https://benchmark.local')throw new Error('External model fetch is prohibited');
  const filename=path.join(root,decodeURIComponent(url.pathname));
  try {
   const data=await fs.readFile(filename);
   return new Response(data,{headers:{'Content-Type':filename.endsWith('.wasm')?'application/wasm':filename.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':String(data.length)}});
  }catch{return new Response('Not found',{status:404});}
 };
 const context=vm.createContext({self,WorkerGlobalScope:DedicatedWorkerGlobalScope,URL,URLSearchParams,TextEncoder,TextDecoder,WebAssembly,Response,Request,Headers,Blob,fetch:fetchLocal,console,setTimeout,clearTimeout,performance,navigator:{hardwareConcurrency:1,userAgent:'CPU WASM evaluation'},atob,btoa,structuredClone,ReadableStream,TransformStream,AbortController,AbortSignal});
 const modules=new Map();
 async function load(url){
  const key=new URL(url,'https://benchmark.local/').href;
  if(modules.has(key))return modules.get(key);
  const code=await fs.readFile(path.join(root,new URL(key).pathname),'utf8');
  const mod=new vm.SourceTextModule(code,{context,identifier:key,initializeImportMeta:meta=>{meta.url=key;},importModuleDynamically:async spec=>{const dependency=await load(new URL(spec,key));if(dependency.status==='linked')await dependency.evaluate();return dependency;}});
  modules.set(key,mod);
  await mod.link(async spec=>{if(!/^(\.|\/|https?:)/.test(spec))throw new Error('Unresolved browser import');return load(new URL(spec,key));});
  return mod;
 }
 await (await load(self.location.href)).evaluate();
 let id=0;
 return async text=>{
  result=null;await self.onmessage({data:{id:++id,text}});
  if(result?.status!=='ready'||result.vector.length!==384)throw new Error('Actual WASM inference failed: '+JSON.stringify(result));
  return result.vector;
 };
}
