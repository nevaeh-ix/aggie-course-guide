import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildLexicalIndex,rankCourses} from '../retrieval.mjs';
import {assess} from '../engine.mjs';
import {loadWasmEncoder} from './wasm-model.mjs';

const root=path.resolve(import.meta.dirname,'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const caseBytes=await fs.readFile(path.join(root,'evaluation/benchmark-cases.json'));
const caseFileSha256=hash(caseBytes),spec=JSON.parse(caseBytes);
const catalogBytes=await fs.readFile(path.join(root,'catalog.json'));
assert.equal(hash(catalogBytes),spec.catalogSha256,'Catalog changed after cases were frozen');
assert.equal(spec.cases.length,52);
const catalog=JSON.parse(catalogBytes),vectors=JSON.parse(await fs.readFile(path.join(root,'embeddings.json')));
const index=buildLexicalIndex(catalog.courses);
const methods=['tfidf','bm25','semantic'];
console.log(JSON.stringify({stage:'frozen-before-inference',caseFileSha256,catalogSha256:spec.catalogSha256,cases:spec.cases.length}));
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*a.length)-1)];
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const startLoad=performance.now(),embed=await loadWasmEncoder(root);
await embed('engineering course exploration');
const modelLoadAndWarmupMs=performance.now()-startLoad;
const rows=[];
for(const [caseIndex,c] of spec.cases.entries()){
 const records=new Map(methods.map(model=>[model,{caseId:c.id,intent:c.intent,kind:c.kind,program:c.program,query:c.query,target:c.target,targetTitle:c.targetTitle,model,timingsMs:[],results:null}]));
 // Change which model goes first so one model does not always get the first run.
 for(let repeat=0;repeat<3;repeat++){
  const offset=(caseIndex+repeat)%3;
  for(const method of [...methods.slice(offset),...methods.slice(0,offset)]){
   const begin=performance.now();
   const queryVector=method==='semantic'?await embed(c.query):null;
   const results=rankCourses(catalog.courses,index,c.query,c.profile,{method,queryVector,vectors,limit:3,minScore:null});
   const elapsed=performance.now()-begin;
   const record=records.get(method);
   record.timingsMs.push(elapsed);
   const minimal=results.map((r,i)=>({rank:i+1,code:r.course.code,title:r.course.title,score:r.score,status:r.checks.status,missing:r.checks.missing,notes:r.checks.notes}));
   if(record.results)assert.deepEqual(minimal.map(r=>r.code),record.results.map(r=>r.code),'Non-deterministic rankings across repeats');
   else record.results=minimal;
  }
 }
 for(const record of records.values()){
  const target=record.results.find(r=>r.code===record.target);
  record.targetRank=target?.rank??null;
  record.hit3=Number(Boolean(target));record.rr3=target?1/target.rank:0;
  record.zeroScoreTargetHit=Boolean(target&&target.score===0);
  record.medianQueryMs=median(record.timingsMs);
  rows.push(record);
 }
 if((caseIndex+1)%13===0)console.log(JSON.stringify({stage:'inference-progress',completedCases:caseIndex+1,totalCases:spec.cases.length}));
}
const profile={program:'BS-CS',standing:'freshman',completed:[],concurrent:[],statistics:false,permission:false};
const checkCases=[
 {id:'P01',course:'ECEN 200',profile:{...profile,program:'BS-EE'},expected:'blocked'},
 {id:'P02',course:'ECEN 200',profile:{...profile,program:'BS-EE',completed:['ECEN 101']},expected:'blocked'},
 {id:'P03',course:'ECEN 200',profile:{...profile,program:'BS-EE',completed:['ECEN 101','MATH 132']},expected:'ready'},
 {id:'P04',course:'ECEN 218',profile:{...profile,program:'BS-EE'},expected:'blocked'},
 {id:'P05',course:'ECEN 218',profile:{...profile,program:'BS-EE',concurrent:['ECEN 212']},expected:'ready'},
 {id:'P06',course:'COMP 361',profile:{...profile,completed:['COMP 280','MATH 351']},expected:'blocked'},
 {id:'P07',course:'COMP 361',profile:{...profile,completed:['COMP 280','MATH 351'],statistics:true},expected:'ready'},
 {id:'P08',course:'COMP 320',profile:{...profile,standing:'junior'},expected:'review'},
 {id:'P09',course:'AREN 112',profile:{...profile,program:'BS-AE'},expected:'review'},
 {id:'P10',course:'COMP 453',profile:{...profile,completed:['COMP 453']},expected:'completed'}
];
const prerequisiteChecks=checkCases.map(c=>{const course=catalog.courses.find(r=>r.code===c.course);const actual=assess(course,c.profile);return {...c,requirementText:course.requirementText,actual,pass:actual.status===c.expected};});
const summarize=selected=>({n:selected.length,targetHits:selected.reduce((s,r)=>s+r.hit3,0),targetHitAt3:mean(selected.map(r=>r.hit3)),targetMrrAt3:mean(selected.map(r=>r.rr3)),medianWarmQueryMs:median(selected.map(r=>r.medianQueryMs)),p95WarmQueryMs:percentile(selected.map(r=>r.medianQueryMs),.95),zeroScoreTargetHits:selected.filter(r=>r.zeroScoreTargetHit).length});
const metrics=Object.fromEntries(methods.map(method=>[method,{all:summarize(rows.filter(r=>r.model===method)),literal:summarize(rows.filter(r=>r.model===method&&r.kind==='literal')),natural:summarize(rows.filter(r=>r.model===method&&r.kind==='natural'))}]));
const readOptional=async filename=>{try{return (await fs.readFile(filename,'utf8')).trim();}catch{return null;}};
const results={schemaVersion:1,measuredAt:new Date().toISOString(),caseFileSha256,catalogSha256:spec.catalogSha256,retrievalSourceSha256:hash(await fs.readFile(path.join(root,'retrieval.mjs'))),modelSha256:hash(await fs.readFile(path.join(root,'models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx'))),conditions:{cases:52,intents:26,programs:13,models:methods,k:3,minScore:null,readyOnly:false,repeatsPerCase:3,modelOrder:'rotated',model:catalog.model,wasmThreads:1,preprocessing:'Title + description + tags; existing application implementation; lexical indices and course embeddings precomputed.',queryTiming:'Median of 3 runs per case; semantic includes query embedding and common ranking/requirements; lexical includes query scoring and common ranking/requirements. No app query cache. Model load excluded from warm timings.',metricDefinition:'Hit@3 and MRR@3 use one designated target; not exhaustive relevance or student-rated quality.',authorship:spec.authorship,limitations:[spec.sampling,spec.developmentSeparation,'Synthetic cases derived from catalog; no user study, independent human labels, confidence intervals, or proof of advising outcomes.','Program tracks share pools; Computer Science seed descriptions are shorter title/tag summaries.','No parameters or cases changed after observing these comparative results.']},environment:{node:process.version,os:os.type(),release:os.release(),architecture:os.arch(),cpu:os.cpus()[0]?.model,availableParallelism:os.availableParallelism(),hostMemoryBytes:os.totalmem(),containerCpuMax:await readOptional('/sys/fs/cgroup/cpu.max'),containerMemoryMax:await readOptional('/sys/fs/cgroup/memory.max'),gpuUsed:false},modelLoadAndWarmupMs,metrics,prerequisiteChecks,rows};
await fs.writeFile(path.join(root,'evaluation/latest-results.json'),JSON.stringify(results,null,2)+'\n');
const columns=['caseId','intent','kind','program','query','target','model','targetRank','hit3','rr3','medianQueryMs','zeroScoreTargetHit'];
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
await fs.writeFile(path.join(root,'evaluation/latest-results.csv'),[columns.join(','),...rows.map(r=>columns.map(k=>csv(r[k])).join(','))].join('\n')+'\n');
console.log(JSON.stringify({stage:'complete',metrics,prerequisiteChecksPassed:prerequisiteChecks.filter(c=>c.pass).length,prerequisiteChecksTotal:checkCases.length,modelLoadAndWarmupMs,environment:results.environment},null,2));
