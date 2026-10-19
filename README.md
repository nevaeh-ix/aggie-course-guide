# Aggie Course Guide

A course recommendation project for NC A&T engineering students. Choose a major,
describe what you want to learn, and compare courses using TF-IDF, BM25, or MiniLM.
The guide also checks the prerequisite information captured in the catalog against
the coursework entered in the student profile.

## Run it locally

Use Node.js 24.19.0 and Python 3.10 or later. Run `npm ci` to install the pinned embedding dependency.
Setup downloads the pinned model/runtime files, checks their SHA-256 hashes, and generates course vectors locally.
Internet access is needed for that first setup. Search then runs locally, without
an API key or paid inference service.

```bash
git clone https://github.com/nevaeh-ix/aggie-course-guide.git
cd aggie-course-guide
npm ci
npm run setup
npm test
npm run build
npm start
```

Open `http://127.0.0.1:8000`. Serve the site over HTTP rather than opening the HTML
file directly. The build is a static `dist/` folder that can be served by a normal
static host. On systems without the `python3` command, use `python` or `py -3` for
the Python commands in package.json.

## Project files

- `app.js`, `index.html`, `styles.css`: search, model comparison, and saved plans.
- `retrieval.mjs`: TF-IDF, BM25, and the shared ranking/filtering steps.
- `engine.mjs`: course-code normalization and prerequisite checks.
- `conversation.mjs`: profile updates such as class year and completed courses.
- `ai-worker.js`: local sentence embeddings in a web worker.
- `data/`: the compressed catalog snapshot used by the benchmark.
- `assets.json`: pinned download locations and expected checksums.
- `scripts/setup_assets.py`: downloads model/runtime files, unpacks the data, and builds local course vectors.
- `evaluation/`: benchmark cases, scripts, settings, and results.
- `tests/`: ranking, prerequisite, profile-message, and application-flow checks.

The original ZIP and `index (1).html` are earlier checkpoint materials. The current
entry point is `index.html`.

## Reproduce the comparison

```bash
npm run smoke
npm run benchmark
npm run verify-results
```

The smoke check runs real WASM inference. The benchmark creates
`evaluation/latest-results.json` and `.csv` locally.
`verify-results` compares the aggregate target metrics with the reported values and
checks the prerequisite test outcomes. Query timings are expected to vary across machines. See
`evaluation/README.md` for the full conditions and graph instructions.

The original comparison used 52 constructed queries across 26 paired interests.
TF-IDF and BM25 each found the designated target in the top three for 40/52 queries;
MiniLM did so for 52/52. This small catalog-derived benchmark does not establish
general recommendation accuracy or student satisfaction.

## Models and versions

- TF-IDF: log term frequency, smoothed inverse document frequency, cosine similarity.
- BM25: k1=1.2 and b=0.75, with the same tokenization and course pools.
- MiniLM: `Xenova/all-MiniLM-L6-v2`, revision
  `751bff37182d3f1213fa05d7196b954e230abad9`, q8 ONNX model, mean pooling,
  normalized 384-dimensional embeddings, and cosine similarity.
- Transformers.js: 3.7.2, pinned by package-lock.json.
- ONNX Runtime Node: 1.21.0 for generating the course vectors on the CPU.
- ONNX Runtime Web: 1.22.0-dev.20250409-89f8206ba4.
- Evaluation: one WebAssembly inference thread, CPU only; no GPU required.

The recorded benchmark used an 8 GiB container and Node.js 24.19.0 on Linux x64.
Plotting requires Python 3.11 or later; dependencies are pinned in `requirements-plots.txt`. The main
application and benchmark do not need those plotting packages.

## Course data and limits

The snapshot contains 315 courses across 13 engineering majors/tracks. Some tracks
share department pools. Each catalog entry includes its NC A&T source URL and
source year. Documents include the CS handbook, Undergraduate Bulletin, Mechanical
Engineering and CAEE handbooks, and Biomedical/Chemical Engineering handbooks.
`scripts/build_catalog.py` documents extraction from PDF-to-text outputs; the
compressed snapshot keeps the exact catalog used in the recorded comparison.

Source years vary. The CS seed uses shorter title/topic summaries and still needs
a complete source audit. These course pools are for exploration, not a complete
degree audit. Missing or conflicting requirements are flagged for review. Grades,
semester availability, workload, and official enrollment eligibility are not
verified. Students should confirm requirements with the university.

See `THIRD_PARTY_NOTICES.txt` for model/runtime licenses and university attribution.
See `AI_ASSISTANCE.md` for the required disclosure of assistance used in the project.
