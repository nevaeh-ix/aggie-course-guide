// Compare the same course text and student profile for every model.
import { assess, courseText, cosine } from './engine.mjs';

// Leave out common chat words so they don't drive the course matches.
const STOP = new Set(
  'a an the to of and for in with i im am my me we our you your want wants would like learn learning about interested interest courses course classes class take taking can could please something anything that this it is are on as at be do does how what which some have has'.split(
    ' '
  )
);
export function tokens(text) {
  return (
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  ).filter((t) => t.length > 1 && !STOP.has(t));
}
const counts = (words) => {
  const result = new Map();
  for (const word of words) result.set(word, (result.get(word) || 0) + 1);
  return result;
};
// Count the words in each course before scoring a search.
export function buildLexicalIndex(courses) {
  // df counts courses containing each word; idf gives less common words more weight.
  const docs = new Map(),
    df = new Map();
  for (const course of courses) {
    const words = tokens(courseText(course));
    const frequencies = counts(words);
    docs.set(course.code, { frequencies, length: words.length });
    for (const term of frequencies.keys()) df.set(term, (df.get(term) || 0) + 1);
  }
  const n = docs.size;
  const idf = new Map(
    [...df].map(([term, frequency]) => [term, Math.log((n + 1) / (frequency + 1)) + 1])
  );
  for (const doc of docs.values()) {
    doc.weights = new Map(
      [...doc.frequencies].map(([term, count]) => [term, (1 + Math.log(count)) * idf.get(term)])
    );
    doc.norm = Math.hypot(...doc.weights.values());
  }
  return {
    docs,
    df,
    idf,
    n,
    averageLength: [...docs.values()].reduce((s, d) => s + d.length, 0) / Math.max(1, n)
  };
}
export function lexicalScores(index, query, method = 'tfidf') {
  if (!['tfidf', 'bm25'].includes(method)) throw new Error('Unknown lexical model');
  const frequencies = counts(tokens(query));
  const queryWeights = new Map(
    [...frequencies]
      .filter(([term]) => index.idf.has(term))
      .map(([term, count]) => [term, (1 + Math.log(count)) * index.idf.get(term)])
  );
  const queryNorm = Math.hypot(...queryWeights.values());
  const scores = new Map();
  for (const [code, doc] of index.docs) {
    let score = 0;
    if (method === 'tfidf') {
      for (const [term, weight] of queryWeights) score += weight * (doc.weights.get(term) || 0);
      // Normalize lengths so a longer course description doesn't win just for being long.
      score = queryNorm && doc.norm ? score / (queryNorm * doc.norm) : 0;
    } else {
      // BM25 adjusts for description length and limits the boost from repeated words.
      for (const term of frequencies.keys()) {
        const count = doc.frequencies.get(term) || 0;
        if (!count) continue;
        const frequency = index.df.get(term);
        const idf = Math.log(1 + (index.n - frequency + 0.5) / (frequency + 0.5));
        const lengthRatio = doc.length / (index.averageLength || 1);
        score += (idf * count * 2.2) / (count + 1.2 * (0.25 + 0.75 * lengthRatio));
      }
    }
    scores.set(code, score);
  }
  return scores;
}
// Apply the same major and completed-course filters to all three models.
export function rankCourses(
  courses,
  index,
  query,
  profile,
  { method = 'tfidf', queryVector = null, vectors = null, limit = 6, minScore = null } = {}
) {
  if (!['tfidf', 'bm25', 'semantic'].includes(method)) throw new Error('Unknown matching model');
  if (method === 'semantic' && (!queryVector || !vectors))
    throw new Error('Semantic vectors are not ready');
  const scores = method === 'semantic' ? null : lexicalScores(index, query, method);
  const queryTerms = new Set(tokens(query));
  return (
    courses
      .filter((course) => course.programs.includes(profile.program))
      .map((course) => {
        const checks = assess(course, profile);
        const vector = vectors?.[course.code];
        const score =
          method === 'semantic'
            ? vector
              ? cosine(queryVector, vector)
              : null
            : scores.get(course.code);
        const matchedTerms = [...index.docs.get(course.code).frequencies.keys()].filter((term) =>
          queryTerms.has(term)
        );
        return { course, checks, score, matchedTerms, method };
      })
      .filter(
        (r) =>
          r.checks.status !== 'completed' && (!profile.readyOnly || r.checks.status === 'ready')
      )
      .filter((r) => Number.isFinite(r.score) && (minScore === null || r.score > minScore))
      // Keep ties in a predictable order when scores match.
      .sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code))
      .slice(0, limit)
  );
}
