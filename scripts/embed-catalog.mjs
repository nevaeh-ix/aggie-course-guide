// Generate the course vectors in batches with the pinned local model.
import {readFile,writeFile} from 'node:fs/promises';
import {courseText} from '../engine.mjs';
import {pipeline,env} from '@huggingface/transformers';
env.allowRemoteModels=false;
env.localModelPath=new URL('../models/',import.meta.url).pathname;
const extractor=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{dtype:'q8'});
const {courses}=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
const vectors={};
for(let i=0;i<courses.length;i+=16){
  const batch=courses.slice(i,i+16);
  const output=await extractor(batch.map(courseText),{pooling:'mean',normalize:true});
  output.tolist().forEach((v,j)=>vectors[batch[j].code]=v.map(x=>Number(x.toFixed(7))));
}
await writeFile(new URL('../embeddings.json',import.meta.url),JSON.stringify(vectors));
console.log(`Embedded ${courses.length} courses with the pinned quantized MiniLM model.`);
