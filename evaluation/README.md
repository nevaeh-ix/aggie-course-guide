Run these commands from the repository root after setup:

```bash
npm test
npm run smoke
npm run benchmark
npm run verify-results
```

The benchmark uses fifty‑two constructed queries. Those queries include twenty‑six keyword queries and twenty‑six everyday‑language queries. Each query is paired with a designated target course. There are two target courses in each program pool. There are thirteen program pools. The case data were frozen before the comparison. Information about authorship and limitations is recorded in the case file and in `AI_ASSISTANCE.md`.

All models use the course text. All models use the program filter. All models use freshman profiles that have no completed courses. All models use a top‑three cutoff. The ready‑only filter is turned off. TF‑IDF and BM25 use words. They do not use stemming or synonym expansion. BM25 uses k1 to one point two and b equal to zero point seven five. MiniLM uses the pinned q8 model. MiniLM uses mean pooling. MiniLM uses normalized vectors. MiniLM uses cosine similarity. MiniLM uses one WASM thread.

Hit@3 checks whether the designated target appears in the three results. MRR@3 rewards a target rank. Another course can still be relevant even if it is not the designated target. These scores are not student‑rated accuracy.

Each model runs three times for each query. The model order rotates. Warm timings include query processing and ranking. MiniLM also includes query embedding. Initialization, course embeddings and lexical‑index construction are excluded from timings.

**Files:**

- `benchmark‑cases.json`: queries, profiles and designated targets.
- `Latest‑results.json` and `latest‑results.csv`: outputs, from a run.
- `Verify‑results.mjs`: checks the new aggregate metrics against the reported values.
- `Plot‑results.py`: plots the locally generated results.

Course vectors and per‑query results are generated locally than uploaded as cached data archives.

To make the figure (Python 3.11 or later):

```bash
python3 -m pip install -r requirements-plots.txt
npm run plot
```
