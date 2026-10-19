// Treat course codes like COMP285 and COMP 285 as the same class.
export function normalizeCode(value) {
  const text = String(value || '').trim().toUpperCase().split(' - ')[0];
  if (/^(?:COMP\/ECEN|ECEN|COMP)\s*375$/.test(text)) return 'COMP/ECEN 375';
  return text.replace(/^([A-Z]{2,5})\s*(\d{3})$/, '$1 $2');
}
export const courseText = c => `${c.title}. ${c.description} ${c.tags.join(' ')}`;
export const cosine = (a,b) => a.reduce((sum,x,i) => sum+x*b[i],0);
export function assess(course, profile) {
  const done = new Set(profile.completed.map(normalizeCode));
  const concurrent = new Set([...done,...(profile.concurrent || []).map(normalizeCode)]);
  if (done.has(normalizeCode(course.code))) return {status:'completed', missing:[], notes:[]};
  const missing = [], notes = [];
  const rank = {freshman:1,sophomore:2,junior:3,senior:4}[profile.standing] || 1;
  if (course.reviewNote) notes.push(course.reviewNote);
  if (Array.isArray(course.reviewedRules)) {
    const groups = {};
    for (const r of course.reviewedRules) (groups[r.logic] ??= []).push(r);
    for (const [logic,rules] of Object.entries(groups)) {
      const checks = rules.map(r => r.type === 'course' ? done.has(normalizeCode(r.course))
        : r.type === 'standing' ? rank >= (/senior/i.test(r.text)?4:3)
        : r.type === 'permission' ? profile.permission : r.type === 'other' ? profile.statistics : false);
      if (!(logic === 'any' ? checks.some(Boolean) : checks.every(Boolean))) {
        if (logic === 'any') missing.push(rules[0].text);
        else rules.forEach((r,i) => {if (!checks[i]) missing.push(r.course || r.text);});
      }
    }
  } else {
    const text = course.requirementText || '';
    if (!text) notes.push('No prerequisite rule was captured; verify with the department.');
    const clauses = text.split(/(?=(?:Pre-?requisites?|Co-?requisites?)\s*[:.])/i).filter(Boolean);
    for (const clause of clauses) {
      const coreq = /^Co-?requisite/i.test(clause);
      const codes = [...clause.matchAll(/\b([A-Z]{2,5})\s*(\d{3})\b/g)].map(m=>normalizeCode(`${m[1]} ${m[2]}`));
      const usable = coreq ? concurrent : done;
      const body = clause.replace(/^(?:Pre-?requisites?|Co-?requisites?)\s*[:.]\s*/i,'');
      // Only unambiguous course lists are automated. Mixed alternatives, grades,
      // abbreviated course numbers and prose conditions remain visible for review.
      const residual = body.replace(/\b[A-Z]{2,5}\s*\d{3}\b/g,'').replace(/\b(and|or|none)\b/gi,'').replace(/[\s,.;()]/g,'');
      const complex = Boolean(residual) || (/\bor\b/i.test(body) && (/\band\b/i.test(body) || body.includes(',')));
      if (complex) {
        notes.push(`${coreq?'Corequisite':'Prerequisite'} rule needs review: ${body}`);
        continue;
      }
      if (/\bor\b/i.test(body)) {
        if (!codes.some(c=>usable.has(c))) missing.push((coreq?'Concurrent: ':'')+codes.join(' or '));
      } else for (const code of codes) if (!usable.has(code)) missing.push((coreq?'Concurrent: ':'')+code);
    }
  }
  return {status:missing.length?'blocked':notes.length?'review':'ready',missing:[...new Set(missing)],notes:[...new Set(notes)]};
}
export function keywordScore(query, course) {
  const stop = new Set('i a an the to of and for in want learn about with courses class course what should take interested me my how can'.split(' '));
  const words = [...new Set(query.toLowerCase().match(/[a-z]{2,}/g)||[])].filter(w=>!stop.has(w));
  const text = courseText(course).toLowerCase();
  return words.reduce((n,w)=>n+(text.includes(w)?1:0),0)/Math.max(1,words.length);
}
export function recommend(catalog, query, profile, queryVector=null, vectors=null) {
  const seen = new Set();
  return catalog.filter(c=>c.programs.includes(profile.program)).map(course=>{
    const checks = assess(course,profile);
    const score = queryVector && vectors?.[course.code] ? cosine(queryVector,vectors[course.code]) : keywordScore(query,course);
    return {course,checks,score};
  }).filter(r=>r.checks.status!=='completed' && (!profile.readyOnly || r.checks.status==='ready'))
    .filter(r=>queryVector?r.score>=0.19:r.score>0)
    .sort((a,b)=>b.score-a.score || a.course.code.localeCompare(b.course.code))
    .filter(r=>{const title=r.course.title.toLowerCase();if(seen.has(title))return false;seen.add(title);return true;}).slice(0,6);
}
