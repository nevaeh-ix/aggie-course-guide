// Use a small page fixture to check the main search flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../engine.mjs';
import * as retrieval from '../retrieval.mjs';
import * as conversation from '../conversation.mjs';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.dataset={};this.handlers={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(c=>c.textContent||'').join('');}
 append(...items){for(const item of items){if(item instanceof Element)item.parent=this;this.children.push(item);}}
 prepend(item){item.parent=this;this.children.unshift(item);}
 replaceChildren(...items){this.text='';this.children=[];this.append(...items);}
 addEventListener(event,handler){this.handlers[event]=handler;}
 setAttribute(name,value){this[name]=value;}
 removeAttribute(name){delete this[name];}
 focus(){}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
async function fixture(){
 const root=new URL('../',import.meta.url),html=await fs.readFile(new URL('index.html',root),'utf8');
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 elements.get('matchingMode').value='semantic';
 const document={getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),querySelector:()=>new Element(),querySelectorAll:()=>[]};
 let workers=0;
 class FailingWorker {constructor(){workers++;}postMessage(data){queueMicrotask(()=>this.onmessage({data:{id:data.id,status:'error',message:'Simulated unavailable device'}}));}terminate(){}}
 const sandbox={document,sessionStorage:{getItem:()=>null,setItem:()=>{}},Worker:FailingWorker,URL,Blob,console,performance,setTimeout,clearTimeout,navigator:{userAgent:'application flow test',hardwareConcurrency:1},fetch:async url=>{
  assert.ok(['./catalog.json','./embeddings.json'].includes(url),'Unexpected network request: '+url);
  return new Response(await fs.readFile(new URL(url,root)),{headers:{'Content-Type':'application/json'}});
 }};
 const context=vm.createContext(sandbox);
 const code=await fs.readFile(new URL('app.js',root),'utf8');
 const module=new vm.SourceTextModule(code+'\nglobalThis.__flow={ask,chooseMajor,read:expression=>eval(expression)};',{context,identifier:new URL('app.js',root).href,initializeImportMeta:meta=>{meta.url=new URL('app.js',root).href;}});
 await module.link(async name=>{
  const namespace={'./engine.mjs':engine,'./retrieval.mjs':retrieval,'./conversation.mjs':conversation}[name];
  assert.ok(namespace,name);
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);},{context});
 });
 await module.evaluate();elements.get('program').value='BS-CS';context.__flow.chooseMajor();
 return {elements,context,workers:()=>workers,ask:async text=>{elements.get('question').value=text;await context.__flow.ask();},read:code=>context.__flow.read(code)};
}
test('freshman and vague-fun messages do not initialize the model',async()=>{
 const f=await fixture();await f.ask('im a freshman');
 assert.equal(f.elements.get('standing').value,'freshman');assert.equal(f.workers(),0);
 await f.ask('I want fun courses');assert.equal(f.workers(),0);
 assert.match(f.elements.get('messages').textContent,/What would make a class fun/);
});
test('a failed on-device model produces labeled TF-IDF results instead of a dead end',async()=>{
 const f=await fixture();await f.ask('cybersecurity');
 assert.equal(f.workers(),1);assert.equal(f.elements.get('matchingMode').value,'tfidf');
 assert.equal(f.read('lastRun.runs[0].method'),'tfidf');assert.ok(f.read('lastRun.runs[0].rows.length')>0);
 assert.match(f.elements.get('messages').textContent,/These are keyword matches/);
 assert.equal(f.read('busy'),false);
});
test('comparison keeps lexical results when semantic inference is unavailable',async()=>{
 const f=await fixture();f.elements.get('matchingMode').value='compare';await f.ask('cybersecurity');
 assert.equal(f.read('lastRun.runs.length'),3);assert.equal(f.read('lastRun.runs[2].unavailable'),true);
 assert.equal(f.read('lastRun.runs[0].rows.length'),3);assert.equal(f.elements.get('exportComparison').disabled,false);
 assert.match(f.elements.get('aiStatus').textContent,/AI unavailable/);
});
test('completed-course updates refresh existing rankings without loading a model',async()=>{
 const f=await fixture();f.elements.get('matchingMode').value='tfidf';await f.ask('cybersecurity');
 const code=f.read('lastRun.runs[0].rows[0].course.code');await f.ask('I have completed '+code);
 assert.ok(f.elements.get('completed').value.includes(code));
 assert.equal(f.read(`lastRun.runs[0].rows.some(r=>r.course.code===${JSON.stringify(code)})`),false);
 assert.equal(f.workers(),0);
});
