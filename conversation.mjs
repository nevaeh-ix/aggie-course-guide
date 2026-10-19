// A message about class year updates the profile before another search.
// Profile-only messages must not invoke or depend on the model.
export function studentMessage(text) {
  const match = text.match(/^(?:hey[,!]?\s*)?(?:(?:i\s*(?:['’]?m|am)|as)\s+(?:a\s+)?|(?:my\s+year\s+is\s+))?(freshman|first[ -]year|sophomore|second[ -]year|junior|third[ -]year|senior|fourth[ -]year)\b[.! ,;]*/i);
  if (!match) return {standing:null, topic:text.trim()};
  const year = match[1].toLowerCase();
  const standing = /freshman|first/.test(year)?'freshman':/sophomore|second/.test(year)?'sophomore':/junior|third/.test(year)?'junior':'senior';
  return {standing,topic:text.slice(match[0].length).replace(/^and\s+/i,'').trim()};
}

// Profile rules do not infer grades or turn "fun" into an invented preference.
export function interpretMessage(text) {
  const parsed = studentMessage(text);
  const updates = {standing: parsed.standing, completed: []};
  let topic = parsed.topic;
  const completion = topic.match(/^i\s*(?:['’]ve|have)?\s*(?:finished|completed|taken|passed)\s+((?:(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?)\s*\d{3}(?:\s*[,;&]\s*|\s+and\s+|\s*\.\s*|\s*$))+)/i);
  if (completion) {
    updates.completed = [...completion[1].matchAll(/\b([A-Z]{2,5}(?:\/[A-Z]{2,5})?)\s*(\d{3})\b/gi)].map(m => `${m[1].toUpperCase()} ${m[2]}`);
    topic = topic.slice(completion[0].length).replace(/^\s*(?:and\s+)?/, '').trim();
  }
  if (!topic && (updates.standing || updates.completed.length)) return {kind:'profile', topic:'', updates};
  if (/^(?:hi|hello|hey|thanks|thank you)[.!\s]*$/i.test(topic)) return {kind:'greeting', topic:'', updates};
  const genericWords = new Set('i im am a an the want would like to take find me some something anything class classes course courses thats that is sounds really very more please can you recommend suggest looking for fun cool easy interesting enjoy enjoyable and but not too hard just freshman sophomore junior senior'.split(' '));
  const specific = topic.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !genericWords.has(w));
  if (!specific.length) return {kind:'clarify', topic:'', updates};
  return {kind:'search', topic, updates};
}
