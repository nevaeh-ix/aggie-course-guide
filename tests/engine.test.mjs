import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assess,normalizeCode,recommend,cosine} from '../engine.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../catalog.json',import.meta.url)));
const vectors=JSON.parse(fs.readFileSync(new URL('../embeddings.json',import.meta.url)));
const profile={program:'BS-CS',completed:[],concurrent:[],standing:'junior',permission:false,statistics:false};
const course=code=>catalog.courses.find(c=>c.code===code);
test('all 13 programs have sourced courses and aligned 384-dimensional vectors',()=>{
 assert.equal(catalog.programs.length,13);assert.equal(catalog.courses.length,315);
 assert.equal(new Set(catalog.courses.map(c=>c.code)).size,315);
 for(const p of catalog.programs)assert.ok(catalog.courses.filter(c=>c.programs.includes(p.id)).length>=20);
 for(const c of catalog.courses){assert.ok(c.source.startsWith('https://www.ncat.edu/'));assert.ok(c.sourceYear);assert.equal(vectors[c.code].length,384);assert.ok(vectors[c.code].every(Number.isFinite));assert.ok(Math.abs(cosine(vectors[c.code],vectors[c.code])-1)<0.001);}
});
test('CS statistics requirement blocks analytics until all three conditions are met',()=>{
 const p={...profile,completed:['COMP280','MATH351']};assert.equal(assess(course('COMP 361'),p).status,'blocked');
 assert.equal(assess(course('COMP 361'),{...p,statistics:true}).status,'ready');
});
test('course OR instructor permission is treated as an alternative',()=>{
 assert.equal(assess(course('COMP 423'),profile).status,'blocked');
 assert.equal(assess(course('COMP 423'),{...profile,permission:true}).status,'ready');
 assert.equal(assess(course('COMP 423'),{...profile,completed:['comp280']}).status,'ready');
});
test('cross-listed computer architecture aliases normalize consistently',()=>{
 assert.equal(normalizeCode('ECEN375'),'COMP/ECEN 375');assert.equal(normalizeCode('COMP 375'),'COMP/ECEN 375');
 assert.equal(assess(course('COMP 463'),{...profile,completed:['COMP285','ECEN375']}).status,'ready');
});
test('unknown prerequisites and source conflicts never become a clean check',()=>{
 assert.equal(assess(course('COMP 365'),profile).status,'review');
 assert.equal(assess(course('COMP 320'),profile).status,'review');
});
test('all simple engineering prerequisites are checked',()=>{
 assert.deepEqual(assess(course('ECEN 200'),profile).missing,['ECEN 101','MATH 132']);
 assert.equal(assess(course('ECEN 200'),{...profile,completed:['ECEN101','MATH132']}).status,'ready');
});
test('corequisites accept either completed or concurrently planned courses',()=>{
 const c=course('ECEN 218');assert.equal(assess(c,profile).status,'blocked');
 assert.equal(assess(c,{...profile,concurrent:['ECEN212']}).status,'ready');
 assert.equal(assess(c,{...profile,completed:['ECEN212']}).status,'ready');
});
test('complex alternatives, grades, standing and abbreviated references require review',()=>{
 for(const text of ['Prerequisite: BIOL 101 (or BMEN 101), BMEN 220, CHEM 221.','Prerequisite: MATH 132 (with C or higher grade).','Prerequisite: senior standing or consent of instructor.','Prerequisite: MEEN 231 and 232.']){
  assert.equal(assess({code:'TEST 200',requirementText:text},profile).status,'review');
 }
});
test('completed courses never appear in semantic or keyword recommendations',()=>{
 const p={...profile,completed:['COMP423','COMP421','COMP321']};
 for(const r of recommend(catalog.courses,'security',p,vectors['COMP 423'],vectors))assert.ok(!p.completed.map(normalizeCode).includes(normalizeCode(r.course.code)));
});
test('every major returns in-program semantic results and the strict filter is respected',()=>{
 for(const p of catalog.programs){const seed=catalog.courses.find(c=>c.programs.includes(p.id));const results=recommend(catalog.courses,seed.title,{...profile,program:p.id},vectors[seed.code],vectors);assert.ok(results.length);for(const r of results)assert.ok(r.course.programs.includes(p.id));}
 for(const r of recommend(catalog.courses,'security',{...profile,readyOnly:true},vectors['COMP 423'],vectors))assert.equal(r.checks.status,'ready');
});
test('keyword mode returns no invented match for unrelated requests',()=>{
 assert.equal(recommend(catalog.courses,'zzzzzzzz',profile).length,0);
});
test('deployment has local model runtime, worker imports and UI controls',()=>{
 const root=new URL('../',import.meta.url);for(const file of ['vendor/transformers.bundle.js','vendor/ort-wasm-simd-threaded.jsep.mjs','vendor/ort-wasm-simd-threaded.jsep.wasm','models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx'])assert.ok(fs.statSync(new URL(file,root)).size>100);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');const app=fs.readFileSync(new URL('app.js',root),'utf8');
 for(const id of [...app.matchAll(/\$\('([a-zA-Z]+)'\)/g)].map(m=>m[1]))assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html, /type="module" src="app\.js\?v=\d+"/);assert.ok(!html.includes('live AI model yet'));
});
