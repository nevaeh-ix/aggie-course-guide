import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const latest = JSON.parse(await fs.readFile(new URL('latest-results.json', import.meta.url)));

// Check the aggregate target metrics reported for the frozen query set.
// Raw course vectors and per-query results stay local to each new run.
const expected = {
  tfidf: {all: [52, 40, 0.7275641025641026], literal: [26, 26, 1], natural: [26, 14, 0.45512820512820507]},
  bm25: {all: [52, 40, 0.7275641025641026], literal: [26, 26, 1], natural: [26, 14, 0.45512820512820507]},
  semantic: {all: [52, 52, 0.9711538461538461], literal: [26, 26, 1], natural: [26, 26, 0.9423076923076923]}
};

for (const [method, groups] of Object.entries(expected)) {
  for (const [kind, [count, hits, mrr]] of Object.entries(groups)) {
    const measured = latest.metrics[method][kind];
    assert.equal(measured.n, count, `${method}: ${kind}: query count`);
    assert.equal(measured.targetHits, hits, `${method}: ${kind}: target hits`);
    assert.ok(Math.abs(measured.targetMrrAt3 - mrr) < 1e-12, `${method}: ${kind}: MRR@3`);
  }
}

assert.equal(latest.caseFileSha256, '87c8e18e5142f22d55fc8a9a069d0aafae0961b8eb80097bbfb12df24c816754');
assert.equal(latest.catalogSha256, 'b544982676949476b237c537aa2c73ed1eca4933a924e76abc41f9a70a87ebcb');
assert.equal(latest.prerequisiteChecks.length, 10);
assert.ok(latest.prerequisiteChecks.every(check => check.pass));
console.log('Aggregate target metrics and prerequisite cases match the reported values.');
