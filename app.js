// Start with the student's major, then match what they want to learn.
import {assess,normalizeCode} from './engine.mjs';
import {buildLexicalIndex,rankCourses} from './retrieval.mjs';
import {interpretMessage} from './conversation.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
let catalog, vectors, lexicalIndex, worker, pending, serial=0, busy=false, generation=0;
let lastRun=null, resultBubble=null;
const names={semantic:'MiniLM',tfidf:'TF-IDF',bm25:'BM25'};
const vectorCache=new Map();
let workerReady=false;
let saved=[];
try {saved=JSON.parse(sessionStorage.getItem('aggie-plan-v2')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
function status(text){$('aiStatus').textContent=text;}
function persist(){try{sessionStorage.setItem('aggie-plan-v2',JSON.stringify(saved));}catch{status('Session storage unavailable; keep this tab open to retain your plan.');}}
function message(kind,text){const b=el('div',text,`bubble ${kind}`);$('messages').append(b);$('messages').scrollTop=$('messages').scrollHeight;return b;}
function profile(){
 const parse=s=>s.split(/[,;\n]+/).map(normalizeCode).filter(Boolean);
 return {program:$('program').value,standing:$('standing').value,completed:parse($('completed').value),concurrent:parse($('concurrent').value),permission:$('permission').checked,statistics:$('stats').checked,readyOnly:$('readyOnly').checked};
}
function startWorker(){
 worker=new Worker(new URL('./ai-worker.js?v=10',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  if(!pending||data.id!==pending.id)return;
  if(data.status==='loading')status(`Loading AI model · ${data.progress}% · keyword matching is available without a download`);
  else {const p=pending;pending=null;clearTimeout(p.timeout);if(data.status==='ready'){workerReady=true;p.resolve(data.vector);}else {worker?.terminate();worker=null;workerReady=false;p.reject(new Error(data.message));}}
 };
 worker.onerror=()=>{if(pending){clearTimeout(pending.timeout);pending.reject(new Error('AI could not start in this browser.'));pending=null;}worker?.terminate();worker=null;workerReady=false;};
}
function embed(text){
 if(vectorCache.has(text))return Promise.resolve(vectorCache.get(text));
 if(!worker)startWorker();
 return new Promise((resolve,reject)=>{
  const id=++serial;
  const timeout=setTimeout(()=>{worker?.terminate();worker=null;workerReady=false;pending=null;reject(new Error('The AI model took too long to load. Retry, or choose keyword matching.'));},90000);
  pending={id,resolve:vector=>{if(vectorCache.size>=8)vectorCache.delete(vectorCache.keys().next().value);vectorCache.set(text,vector);resolve(vector);},reject,timeout};
  status(workerReady?'Comparing your interests with course text…':'Loading AI model for the first request · about 23 MB');
  worker.postMessage({id,text});
 });
}
function sourcesLink(c){const a=el('a',`Source: ${c.sourceYear}${c.sourcePage?` · PDF p. ${c.sourcePage}`:''} ↗`);a.href=c.source+(c.sourcePage?`#page=${c.sourcePage}`:'');a.target='_blank';a.rel='noreferrer';return a;}
function planButton(c){const b=el('button',saved.some(s=>s.program===$('program').value&&s.code===c.code)?'Saved ✓':'+ Save to plan','chip save-course');b.type='button';b.dataset.course=c.code;b.addEventListener('click',()=>{
 const program=$('program').value;if(!saved.some(s=>s.program===program&&s.code===c.code))saved.push({program,code:c.code});persist();renderPlan();b.textContent='Saved ✓';
});return b;}
function renderPlan(){
 const list=$('planList');list.replaceChildren();const program=$('program').value;
 const courses=saved.filter(s=>s.program===program).map(s=>catalog.courses.find(c=>c.code===s.code)).filter(Boolean);
 const credits=courses.reduce((n,c)=>n+(c.credits||0),0);const unknown=courses.some(c=>c.credits===null);
 $('planTotal').textContent=`${courses.length} courses · ${credits}${unknown?'+':''} known credits`;
 if(!courses.length)list.append(el('p','Save courses from your results to build a shortlist.','hint'));
 for(const c of courses){const row=el('div',undefined,'plan-row');const info=el('div',`${c.code} · ${c.title}`);const check=assess(c,profile());info.append(el('small',check.status==='blocked'?`Plan ahead: ${check.missing.join(', ')}`:check.status==='review'?'Requirements need review':check.status==='completed'?'Already completed':'Listed course checks met'));
 const b=el('button','×','remove-course');b.type='button';b.setAttribute('aria-label',`Remove ${c.code}`);b.addEventListener('click',()=>{saved=saved.filter(s=>!(s.program===program&&s.code===c.code));persist();renderPlan();document.querySelectorAll('.save-course').forEach(x=>{x.textContent=saved.some(s=>s.program===program&&s.code===x.dataset.course)?'Saved ✓':'+ Save to plan';});});row.append(info,b);list.append(row);}
 $('exportPlan').disabled=!courses.length;
}
function courseCard(result,semantic){
 const {course:c,checks,score}=result;const card=el('article',undefined,'course');const top=el('div',undefined,'course-top');const title=el('div');title.append(el('h3',c.title),el('div',`${c.code} · ${c.credits??'Unlisted'} credits`,'course-code'));top.append(title,el('span',names[result.method]||'Course details','match'));card.append(top);
 if(Number.isFinite(score))card.append(el('p',semantic?`Meaning similarity: ${score.toFixed(3)} · not a probability`:`${names[result.method]} score: ${score.toFixed(3)} · ${score>0?'shared course terms':'no shared terms'}`,'course-note'));
 if(result.matchedTerms?.length)card.append(el('p',`Shared words: ${result.matchedTerms.join(', ')}`,'matched-terms'));
 card.append(el('p',c.description,'course-description'));
 const label=checks.status==='ready'?'Listed course checks met':checks.status==='blocked'?'Plan ahead':checks.status==='completed'?'Already completed':'Review requirements';
 card.append(el('div',label,`eligibility ${checks.status}`));
 if(checks.missing.length)card.append(el('p',`Still needed: ${checks.missing.join('; ')}`,'course-note'));
 if(checks.notes.length)card.append(el('p',checks.notes.join(' '),'course-note'));
 const details=el('details');details.append(el('summary','See listed requirements'),el('p',c.requirementText||'No complete prerequisite rule is available for this course. Verify before registering.','course-note'));
 const bottom=el('div',undefined,'course-bottom');bottom.append(sourcesLink(c),planButton(c));card.append(details,bottom);return card;
}
function calculateRun(query,mode,queryVector=null,embeddingMs=0,modelCold=false,error=null){
 const snapshot=profile();
 const models=mode==='compare'?['tfidf','bm25','semantic']:[mode];
 const runs=models.map(method=>{
  if(method==='semantic'&&!queryVector)return {method,rows:[],rankingMs:null,unavailable:true};
  const start=performance.now();
  const rows=rankCourses(catalog.courses,lexicalIndex,query,snapshot,{method,queryVector,vectors,limit:mode==='compare'?3:6,minScore:mode==='compare'?null:method==='semantic'?.19:0});
  return {method,rows,rankingMs:performance.now()-start,unavailable:false};
 });
 return {query,mode,profile:snapshot,runs,queryVector,embeddingMs,modelCold,error,createdAt:new Date().toISOString()};
}
function renderResults(run,refresh=false){
 if(!refresh){
  if(resultBubble)resultBubble.replaceChildren(el('p','Earlier search results cleared. The courses below use your current profile.','source'));
  resultBubble=message('assistant','');
 }else if(!resultBubble)return;
 resultBubble.replaceChildren();
 resultBubble.classList.toggle('comparison-bubble',run.mode==='compare');
 resultBubble.append(el('p',`Courses for “${run.query}”`,'results-title'));
 if(run.error)resultBubble.append(el('p',run.mode==='compare'?'The on-device AI could not load. Both keyword models are shown below; select AI matching to retry.':'The on-device AI could not load. These are keyword matches, so you can keep exploring. Select AI matching to retry.','fallback-note'));
 if(run.mode==='compare'){
  resultBubble.append(el('p','Same interest, same major and profile. Each model ranks the same courses; its first three results appear below. Scores have different scales and do not measure accuracy.','comparison-intro'));
  const columns=el('div',undefined,'comparison-grid');
  for(const model of run.runs){
   const column=el('section',undefined,'comparison-column');column.append(el('h3',names[model.method]),el('p',model.method==='semantic'?'Matches related meanings':'Matches words in course text','hint'));
   if(model.unavailable)column.append(el('p','AI unavailable on this device. Try again or use either keyword model.','fallback-note'));
   else{
    column.append(el('p',`Ranking: ${model.rankingMs.toFixed(1)} ms`,'run-timing'));
    if(!model.rows.length)column.append(el('p','No courses meet your profile filters.','hint'));
    else if(model.rows.every(r=>r.score===0))column.append(el('p','No shared words. The zero-score ties below are ordered by course code, not relevance.','zero-match'));
    for(const [i,row] of model.rows.entries()){const card=courseCard(row,model.method==='semantic');card.classList.add('compact-course');card.prepend(el('div',`#${i+1}`,'rank-label'));column.append(card);}
   }
   columns.append(column);
  }
  resultBubble.append(columns);
  if(run.queryVector)resultBubble.append(el('p',`AI input processing: ${run.embeddingMs.toFixed(0)} ms${run.modelCold?' (includes first model load)':''}. Ranking times above exclude this shared input-processing step. These timings describe this device and request. They are not a recommendation-quality benchmark.`,'source'));
 }else{
  const model=run.runs[0];
  resultBubble.append(el('p',model.rows.length?'Start with the descriptions, then check what you may need to take first.':'No strong matches with these settings. Try another interest or turn off “Only listed course checks met” to see courses to prepare for.'));
  const cards=el('div',undefined,'recommendations');for(const row of model.rows)cards.append(courseCard(row,model.method==='semantic'));resultBubble.append(cards);
 }
 resultBubble.append(el('p','Only the captured requirements can be checked. Grades, course offerings, and degree or track credit still need confirmation.','source'));
 $('exportComparison').disabled=run.mode!=='compare';
 $('messages').scrollTop=$('messages').scrollHeight;
}
function refreshResults(){
 if(!lastRun||busy)return;
 lastRun=calculateRun(lastRun.query,lastRun.mode,lastRun.queryVector,lastRun.embeddingMs,lastRun.modelCold,lastRun.error);
 renderResults(lastRun,true);
}
function offerTopics(){
 const bubble=message('assistant','What would make a class fun for you—building something, being creative, or solving a problem? Pick a starting point or describe an interest. I don’t have verified difficulty or workload ratings.');
 const options=el('div',undefined,'clarify-options');
 const choices=topics[$('program').value]||[];
 for(const label of choices){const button=el('button',label,'chip');button.type='button';button.onclick=()=>{if(!busy){$('question').value=label;ask();}};options.append(button);}bubble.append(options);
}
async function ask(){
 if(busy||!catalog)return;
 const question=$('question').value.trim()||$('interest').value.trim();
 if(!question){$('question').focus();status('Tell me a topic or something you want to build.');return;}
 const interpreted=interpretMessage(question);
 const snapshot=profile();
 const bad=[...snapshot.completed,...snapshot.concurrent,...interpreted.updates.completed].filter(c=>!/^([A-Z]{2,5}|COMP\/ECEN) \d{3}$/.test(normalizeCode(c)));
 if(bad.length){status(`Use course codes separated by commas. Check: ${bad.join(', ')}`);return;}
 message('student',question);$('question').value='';$('interest').value='';
 if(interpreted.updates.standing)$('standing').value=interpreted.updates.standing;
 if(interpreted.updates.completed.length)$('completed').value=[...new Set([...snapshot.completed,...interpreted.updates.completed].map(normalizeCode))].join(', ');
 renderPlan();
 if(interpreted.kind==='profile'){
  message('assistant',`Got it—your profile is updated.${interpreted.updates.standing?' Your year helps with class-standing rules, but does not confirm completed prerequisites.':''}${lastRun?' I’ve refreshed your latest results.':' What would you like to learn or build?'}`);
  refreshResults();status('Profile updated · no AI download needed');return;
 }
 if(interpreted.kind==='greeting'){message('assistant','Hey! Tell me a topic you want to learn, or something you want to build. You can also tell me your year or completed course codes.');return;}
 if(interpreted.kind==='clarify'){offerTopics();status('Choose an interest to find related courses');return;}
 const query=interpreted.topic;
 const request=++generation;let mode=$('matchingMode').value;let queryVector=null,error=null,embeddingMs=0;
 const modelCold=!workerReady&&!vectorCache.has(query);
 busy=true;$('findButton').disabled=true;$('matchingMode').disabled=true;$('chatForm').setAttribute('aria-busy','true');
 try {
  if(mode==='semantic'||mode==='compare'){
   const start=performance.now();
   try{if(!vectors)throw new Error('Course embeddings unavailable');queryVector=await embed(query);}catch{error='semantic_unavailable';if(mode==='semantic'){mode='tfidf';$('matchingMode').value='tfidf';}}
   embeddingMs=performance.now()-start;
  }
  if(request!==generation)return;
  lastRun=calculateRun(query,mode,queryVector,embeddingMs,modelCold,error);renderResults(lastRun);
  status(error?'AI unavailable · showing clearly labeled keyword results':mode==='compare'?'Three-model comparison ready':mode==='semantic'?'AI matching ready · processed on this device':`${names[mode]} keyword matching ready`);
 }catch{if(request===generation){message('assistant','This search could not finish. Your course profile is saved in this session. Try your search again.');status('Search not completed');}}
 finally{if(request===generation){busy=false;$('findButton').disabled=false;$('matchingMode').disabled=false;$('chatForm').removeAttribute('aria-busy');}}
}
const topics={
 'BS-CS':['Artificial intelligence','Cybersecurity','Game design','Software engineering'],
 'BS-AE':['Building energy','Structural design','Lighting','Sustainable buildings'],
 'BS-CE':['Transportation','Water treatment','Structures','Soil mechanics'],
 'BS-ME':['Robotics','Thermodynamics','Manufacturing','Fluid mechanics'],
 'BS-MEA':['Aerodynamics','Propulsion','Flight dynamics','Control systems'],
 'BS-ISE':['Supply chains','Optimization','Simulation','Human factors'],
 'BS-EE':['Power systems','Electronics','Signals','Control systems'],
 'BS-CpE':['Embedded systems','Digital design','Computer networks','Robotics'],
 'BS-BIOE-G':['Medical devices','Biomaterials','Tissue engineering','Biomechanics'],
 'BS-BIOE-I':['Biomedical design','Medical devices','Biomaterials','Healthcare'],
 'BS-BE-BP':['Bioprocessing','Biofuels','Bioreactors','Food engineering'],
 'BS-BE-NR':['Water resources','Soil conservation','Sustainability','Environmental systems'],
 'BS-CHE':['Process design','Thermodynamics','Reaction engineering','Polymers']};
function chooseMajor(){
 if(!$('program').value){$('program').focus();return;}
 generation++;lastRun=null;resultBubble=null;$('exportComparison').disabled=true;const p=catalog.programs.find(p=>p.id===$('program').value);$('majorGate').hidden=true;$('appShell').hidden=false;$('mainApp').hidden=false;$('unsupported').hidden=true;document.querySelector('.trust-strip').hidden=true;$('chosenMajor').textContent=p.name;
 const courses=catalog.courses.filter(c=>c.programs.includes(p.id));$('coverage').textContent=`${courses.length} courses in this department pool. Concentrations share department courses; inclusion does not mean a course satisfies your track. Sources: ${[...new Set(courses.map(c=>c.sourceYear))].join(', ')}. Confirm current rules and availability with your advisor.`;
 $('messages').replaceChildren();message('assistant',`Hey! What would you like to learn or build? I’ll look through ${p.name} courses and show what you may need to take first. You can also say “I’m a freshman” or “I’ve completed COMP 163.”`);
 $('topicChips').replaceChildren();for(const topic of topics[p.id]){const b=el('button',topic,'chip');b.type='button';b.onclick=()=>{if(busy)return;$('interest').value=topic;$('question').value='';ask();};$('topicChips').append(b);}
 $('courseOptions').replaceChildren();const known=new Set(courses.map(c=>c.code));for(const c of courses)for(const m of c.requirementText.matchAll(/\b[A-Z]{2,5}\s+\d{3}\b/g))known.add(normalizeCode(m[0]));for(const code of [...known].sort()){const o=el('option');o.value=code;$('courseOptions').append(o);}
 $('quickCourses').replaceChildren();for(const c of courses.filter(c=>Number(c.code.match(/\d{3}/)?.[0])<220).slice(0,4)){const b=el('button',`+ ${c.code}`,'chip');b.type='button';b.onclick=()=>{const codes=profile().completed;if(!codes.includes(normalizeCode(c.code)))codes.push(c.code);$('completed').value=codes.join(', ');renderPlan();refreshResults();};$('quickCourses').append(b);}
 renderPlan();$('question').focus();status('Ready · describe an interest or update your profile');
}
$('continueButton').addEventListener('click',chooseMajor);
$('changeMajorTop').addEventListener('click',()=>{generation++;if(pending){clearTimeout(pending.timeout);pending.reject(new Error('Search cancelled'));pending=null;worker?.terminate();worker=null;workerReady=false;}busy=false;$('findButton').disabled=false;$('matchingMode').disabled=false;$('chatForm').removeAttribute('aria-busy');$('appShell').hidden=true;$('majorGate').hidden=false;document.querySelector('.trust-strip').hidden=false;$('program').focus();});
$('chatForm').addEventListener('submit',e=>{e.preventDefault();ask();});
$('matchingMode').addEventListener('change',()=>{const mode=$('matchingMode').value;status(mode==='semantic'||mode==='compare'?'AI will load when needed · about 23 MB':'Keyword matching selected · no AI download needed');if(lastRun&&!busy){$('question').value=lastRun.query;ask();}});
for(const id of ['completed','concurrent','standing','permission','stats','readyOnly'])$(id).addEventListener('change',()=>{if(catalog){renderPlan();refreshResults();}});
$('exportComparison').addEventListener('click',()=>{
 if(!lastRun||lastRun.mode!=='compare')return;
 const run=lastRun;
 const payload={schemaVersion:1,query:run.query,profile:run.profile,createdAt:run.createdAt,catalogCollected:catalog.collected,conditions:{topK:3,minimumScoreFilter:false,sameCandidatePool:true,lexicalCorpus:'Full catalog; title, description, tags',semanticModel:catalog.model,bm25:{k1:1.2,b:.75},tfidf:{tf:'1 + ln(count)',idf:'ln((N+1)/(df+1)) + 1',normalization:'L2'}},timing:{inputEmbeddingMs:run.embeddingMs,includesFirstModelLoad:run.modelCold,rankingExcludesInputEmbedding:true},environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency},evaluation:'Unlabeled live retrieval run. No accuracy, relevance, or user-study claims.',results:run.runs.map(model=>({model:model.method,available:!model.unavailable,rankingMs:model.rankingMs,courses:model.rows.map((r,i)=>({rank:i+1,code:r.course.code,title:r.course.title,score:r.score,status:r.checks.status,missing:r.checks.missing,notes:r.checks.notes,matchedTerms:r.matchedTerms,source:r.course.source}))}))};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='aggie-model-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('exportPlan').addEventListener('click',()=>{
 const p=catalog.programs.find(p=>p.id===$('program').value);const snapshot=profile();const courses=saved.filter(s=>s.program===p.id).map(s=>catalog.courses.find(c=>c.code===s.code)).filter(Boolean);
 const text=[`Aggie Course Guide — ${p.name}`,`Saved ${new Date().toLocaleDateString()}`,'A course shortlist, not a registration schedule. Confirm prerequisites, track credit and availability with an advisor.','',...courses.flatMap(c=>{const checks=assess(c,snapshot);return [`${c.code}: ${c.title} (${c.credits??'unlisted'} credits)`,`Status: ${checks.status}`,`Still needed: ${checks.missing.join('; ')||'None identified by available course checks'}`,`Review: ${checks.notes.join('; ')||'Confirm current grades and program requirements'}`,`Listed requirements: ${c.requirementText||'Not available'}`,`Source (${c.sourceYear}): ${c.source}`,''];})].join('\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=el('a');a.href=url;a.download='aggie-course-plan.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try {
 const [courseResponse,vectorResponse]=await Promise.all([fetch('./catalog.json'),fetch('./embeddings.json').catch(()=>null)]);if(!courseResponse.ok)throw new Error('Course data could not load.');
 catalog=await courseResponse.json();vectors=vectorResponse?.ok?await vectorResponse.json().catch(()=>null):null;lexicalIndex=buildLexicalIndex(catalog.courses);
 for(const p of catalog.programs){const o=el('option',p.name);o.value=p.id;$('program').append(o);}
 $('continueButton').disabled=false;$('catalogCount').hidden=true;
 status(vectors?'AI will load on your first request · about 23 MB':'Course text loaded · keyword matching available');
}catch{status('Course data could not load. Refresh the page to retry.');$('catalogCount').textContent='Course data unavailable — refresh to retry';}
