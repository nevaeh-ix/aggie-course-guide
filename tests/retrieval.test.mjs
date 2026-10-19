import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tokens,buildLexicalIndex,lexicalScores,rankCourses} from '../retrieval.mjs';
const course=(code,title,requirementText='')=>({code,title,description:'',tags:[],requirementText,programs:['P']});
const corpus=[course('TEST 100','alpha beta'),course('TEST 200','alpha gamma')];
const profile={program:'P',standing:'freshman',completed:[],concurrent:[],readyOnly:false};
test('lexical matching uses complete tokens and excludes conversational stopwords',()=>{
 assert.deepEqual(tokens('I want to learn about cybersecurity!'),['cybersecurity']);
 const index=buildLexicalIndex([course('TEST 100','heart mechanics')]);
 assert.equal(lexicalScores(index,'art').get('TEST 100'),0);
});
test('TF-IDF cosine matches a hand-calculated two-document example',()=>{
 const index=buildLexicalIndex(corpus);const idf=Math.log(3/2)+1;
 const expected=idf/Math.hypot(1,idf);
 assert.ok(Math.abs(lexicalScores(index,'beta').get('TEST 100')-expected)<1e-12);
 assert.equal(lexicalScores(index,'beta').get('TEST 200'),0);
});
test('BM25 matches its hand-calculated equal-length example',()=>{
 const score=lexicalScores(buildLexicalIndex(corpus),'beta','bm25').get('TEST 100');
 assert.ok(Math.abs(score-Math.log(2))<1e-12);
});
test('all models share program, completion, and prerequisite filtering',()=>{
 const courses=[...corpus,course('TEST 300','alpha','Prerequisite: TEST 100.'),{...course('TEST 400','alpha'),programs:['Q']}];
 const index=buildLexicalIndex(courses),vectors=Object.fromEntries(courses.map(c=>[c.code,[1,0]]));
 const done={...profile,completed:['TEST100']};
 for(const method of ['tfidf','bm25','semantic']){
  const rows=rankCourses(courses,index,'alpha',done,{method,queryVector:[1,0],vectors,limit:99});
  assert.deepEqual(new Set(rows.map(r=>r.course.code)),new Set(['TEST 200','TEST 300']));
  const strict=rankCourses(courses,index,'alpha',{...done,readyOnly:true},{method,queryVector:[1,0],vectors,limit:99});
  assert.deepEqual(strict.map(r=>r.course.code),['TEST 300']);
 }
});
test('zero lexical matches stay explicit and can be excluded in normal search',()=>{
 const index=buildLexicalIndex(corpus);
 assert.equal(rankCourses(corpus,index,'zzzzzz',profile,{minScore:0}).length,0);
 const comparison=rankCourses(corpus,index,'zzzzzz',profile,{method:'bm25',limit:3});
 assert.equal(comparison.length,2);assert.ok(comparison.every(r=>r.score===0));
});
test('the real catalog yields department-specific lexical matches for all programs',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../catalog.json',import.meta.url)));const index=buildLexicalIndex(catalog.courses);
 for(const program of catalog.programs){
  const seed=catalog.courses.find(c=>c.programs.includes(program.id));
  for(const method of ['tfidf','bm25']){
   const results=rankCourses(catalog.courses,index,seed.title,{...profile,program:program.id},{method,minScore:0});
   assert.ok(results.length,`${program.id}: ${method}`);assert.ok(results.every(r=>r.course.programs.includes(program.id)));
  }
 }
});
