// Execute the actual shipped worker and WASM runtime in a Node VM with web-worker
// globals. This checks browser-module linkage and inference without a browser.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.COURSE_ASSET_ROOT||path.resolve(import.meta.dirname,'..');
class DedicatedWorkerGlobalScope {}
let result;
const self=new DedicatedWorkerGlobalScope();
self.location={href:'https://aggie.test/ai-worker.js?v=6'};
self.postMessage=data=>{if(data.status!=='loading')result=data;};
const fetchLocal=async(input)=>{
 const url=new URL(typeof input==='string'?input:input.url,'https://aggie.test/');
 if(url.origin!=='https://aggie.test')throw new Error('Unexpected external fetch: '+url.href);
 const filename=path.join(root,decodeURIComponent(url.pathname));
 try {const data=await fs.readFile(filename);const type=filename.endsWith('.wasm')?'application/wasm':filename.endsWith('.json')?'application/json':'application/octet-stream';return new Response(data,{headers:{'Content-Type':type,'Content-Length':String(data.length)}});}
 catch {return new Response('Not found',{status:404});}
};
const sandbox={self,WorkerGlobalScope:DedicatedWorkerGlobalScope,URL,URLSearchParams,TextEncoder,TextDecoder,WebAssembly,Response,Request,Headers,Blob,fetch:fetchLocal,console,setTimeout,clearTimeout,performance,navigator:{hardwareConcurrency:1,userAgent:'WASM regression test'},atob,btoa,structuredClone,ReadableStream,TransformStream,AbortController,AbortSignal};
const context=vm.createContext(sandbox);
const modules=new Map();
async function load(url){
 const key=new URL(url,'https://aggie.test/').href;
 if(modules.has(key))return modules.get(key);
 const filename=path.join(root,new URL(key).pathname);
 const code=await fs.readFile(filename,'utf8');
 const mod=new vm.SourceTextModule(code,{context,identifier:key,initializeImportMeta:meta=>{meta.url=key;},importModuleDynamically:async spec=>{const dependency=await load(new URL(spec,key));if(dependency.status==='linked')await dependency.evaluate();return dependency;}});
 modules.set(key,mod);
 await mod.link(async spec=>{if(!/^(\.|\/|https?:)/.test(spec))throw new Error('Bare import shipped to browser: '+spec);return load(new URL(spec,key));});
 return mod;
}
const worker=await load(self.location.href);await worker.evaluate();
await self.onmessage({data:{id:1,text:'Structural design'}});
assert.equal(result?.status,'ready',JSON.stringify(result));assert.equal(result.vector.length,384);assert.ok(result.vector.every(Number.isFinite));
const {recommend}=await import('../engine.mjs');
const catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json')));
const vectors=JSON.parse(await fs.readFile(path.join(root,'embeddings.json')));
const matches=recommend(catalog.courses,'Structural design',{program:'BS-AE',standing:'freshman',completed:[],concurrent:[]},result.vector,vectors);
assert.ok(matches.length);assert.ok(matches.slice(0,3).some(m=>/structur|steel|concrete/i.test(m.course.title)));
await self.onmessage({data:{id:2,text:'protecting websites from hackers'}});
assert.equal(result?.status,'ready');
const cs=recommend(catalog.courses,'protecting websites from hackers',{program:'BS-CS',standing:'freshman',completed:[],concurrent:[]},result.vector,vectors);
assert.equal(cs[0].course.code,'COMP 423');
console.log('Shipped worker imported its local bundle and completed real WASM inference (384 dimensions).');
const {buildLexicalIndex,rankCourses}=await import('../retrieval.mjs');
const index=buildLexicalIndex(catalog.courses);
const cases=[['BS-CS','protecting websites from hackers'],['BS-AE','structural design'],['BS-CE','water treatment'],['BS-ME','robotics'],['BS-MEA','aircraft propulsion'],['BS-ISE','supply chains'],['BS-EE','power systems'],['BS-CpE','embedded systems'],['BS-BIOE-G','medical devices'],['BS-BIOE-I','biomaterials'],['BS-BE-BP','biofuels'],['BS-BE-NR','soil conservation'],['BS-CHE','reaction engineering']];
for(const [i,[program,query]] of cases.entries()){
 await self.onmessage({data:{id:i+3,text:query}});assert.equal(result?.status,'ready',program);
 const queryVector=result.vector;
 for(const method of ['tfidf','bm25','semantic']){
  const rows=rankCourses(catalog.courses,index,query,{program,standing:'freshman',completed:[],concurrent:[]},{method,queryVector,vectors,limit:3});
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.course.programs.includes(program)));
 }
}
console.log('Real semantic inference and all three ranking models completed for all 13 programs. This is a software smoke check, not a labeled relevance evaluation.');
