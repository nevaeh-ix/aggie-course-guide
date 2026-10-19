# Repeat the model comparison

Run these commands from the repository root after setup:

```bash
npm test
npm run smoke
npm run benchmark
npm run verify-results
```

The benchmark uses 52 constructed queries: 26 keyword queries and 26
everyday-language queries, paired around 26 designated target courses. There are
two targets per program pool across 13 pools. The cases were frozen before the
original comparison. Their authorship and limitations are recorded in the case
file and AI_ASSISTANCE.md.

All models use the same course text, program filter, freshman profiles with no
completed courses, and top-three cutoff. The ready-only filter is off. TF-IDF and
BM25 use whole words without stemming or synonym expansion. BM25 uses k1=1.2 and
b=0.75. MiniLM uses the pinned q8 model, mean pooling, normalized vectors, cosine
similarity, and one WASM thread.

Hit@3 checks whether the designated target appears in the first three results.
MRR@3 rewards a higher target rank. Another course can still be relevant even when
it is not the designated target. These scores are not student-rated accuracy.

Each model runs three times per query, with rotating model order. Warm timings
include query processing and ranking; MiniLM also embeds the query. Initialization,
course embeddings, and lexical-index construction are excluded from warm timings.

The originally reported environment was Node.js 24.19.0 on Linux x64, an Intel Xeon Platinum
8573C CPU, an eight-vCPU container quota, an 8 GiB memory limit, and no GPU. Timings
will differ across computers. The comparison script retains the original cases
and model settings; comment and packaging changes do not change the ranking rules.

Files:

- `benchmark-cases.json`: frozen queries, profiles, and designated targets.
- `latest-results.json` and `latest-results.csv`: outputs from a new run.
- `verify-results.mjs`: checks the new aggregate metrics against the reported values.
- `plot-results.py`: plots the locally generated results.

Course vectors and per-query results are generated locally rather than uploaded as cached data archives.

To make the figure (Python 3.11 or later):

```bash
python3 -m pip install -r requirements-plots.txt
npm run plot
```

No student participants, transcripts, satisfaction ratings, or advising outcomes
were evaluated. Ten prerequisite regression cases check expected software
statuses; they do not validate every university requirement.
