# Aggie Course Guide

Aggie Course Guide is a project that recommends courses for students at NC A&T who study engineering. Students pick a topic what they wish to learn and then compare courses with methods such as TF-IDF, BM25 or MiniLM. Aggie Course Guide also verifies that the prerequisite information in the catalog matches the courses that the student has listed in their profile.

## Run it locally

To run Aggie Course Guide locally use Node.js version 24.19.0 and Python version 3.10 or newer. Execute `npm ci` to install the embedding dependency. The setup process downloads the model and runtime files verifies their SHA-256 hashes and creates course vectors on the local machine. The first setup requires an internet connection. After setup the search function runs locally. Does not need an API key or any paid inference service.

```bash
Git clone https://github.com/nevaeh-ix/aggie-course-guide.git
cd aggie-course-guide
npm ci
npm run setup
npm test
npm run build
npm start
```

Open the address [http://127.0.0.1:8000](http://127.0.0.1:8000) in a web browser. Serve the site over HTTP of opening the HTML file directly. The build output is a `dist/` folder that can be hosted by a typical static host. If your system does not have the `python3` command use `python` or `py -3` for the Python commands listed in `package.json`.

## Project files

- `app.js`, `index.html` and `styles.css` provide search functionality, model comparison and the ability to save course plans.
- `Retrieval.mjs` implements TF-IDF, BM25 and the ranking and filtering steps.
- `Engine.mjs` normalizes course codes and performs prerequisite checks.
- `Conversation.mjs` handles profile updates for example setting the class year and listing completed courses.
- `Ai-worker.js` generates local sentence embeddings inside a web worker.
- `Data/` contains the compressed catalog snapshot that is used for benchmarking.
- `Assets.json` lists the download locations that are pinned and the expected checksums.
- `Scripts/setup_assets.py` downloads the model and runtime files extracts the data and creates local course vectors.
- `Evaluation/` holds benchmark cases, scripts, settings and results.
- `Tests/` contains checks for ranking, prerequisites profile messages and application flow.

The original ZIP file and `index (1).html` represent checkpoint materials. The current entry point for the application is `index.html`.

## Reproduce the comparison

To reproduce the comparison run the following commands:

```bash
npm run smoke
npm run benchmark
npm run verify-results
```

The smoke test executes WebAssembly inference. The benchmark generates `evaluation/results.json` and `evaluation/latest-results.csv` on the local machine. `Verify-results` compares the target metrics with the reported values and verifies the outcomes of the prerequisite tests. Query times may differ from one machine to another. For conditions and instructions on how to view graphs see `evaluation/README.md`.

The initial comparison used 52 crafted queries covering 26 paired interests. With TF-IDF and BM25 the target course appeared in the three results for 40 out of 52 queries. MiniLM achieved this for all 52 queries. This small catalog-based benchmark does not prove recommendation accuracy or student satisfaction.

## Models and versions

- TF-IDF uses log term frequency, smoothed inverse document frequency and cosine similarity.
- BM25 uses parameters `k1=1.2` and `b=0.75` and it applies the tokenization and course pools as TF-IDF.
- MiniLM uses the `Xenova/all-MiniLM-L6-v2` model, revision `751bff37182d3f1213fa05d7196b954e230abad9` a q8 ONNX version, mean pooling normalized 384‑dimensional embeddings and cosine similarity.
- Transformers.js version 3.7.2 is pinned in `package-lock.json`.
- ONNX Runtime Node 1.21.0 is used to generate course vectors on the CPU.
- ONNX Runtime Web version 1.22.0-dev.20250409-89f8206ba4 is used.
- Evaluation runs with a WebAssembly inference thread on the CPU; a GPU is not required.

The recorded benchmark ran inside an 8 GiB container on Linux x64 with Node.js 24.19.0. Plotting results needs Python 3.11 or newer. The required packages are listed in `requirements-plots.txt`. The core application and benchmark do not need these plotting packages.

## Course data and limits

The snapshot holds 315 courses from 13 engineering majors or tracks. Some tracks share the department pools. Every catalog entry records its NC A&T source URL. The year it was sourced. The documents used are the CS handbook, Undergraduate Bulletin, Mechanical Engineering and CAEE handbooks and Biomedical/Chemical Engineering handbooks. `Scripts/build_catalog.py` explains how data was extracted from PDF‑to‑text outputs; the compressed snapshot preserves the catalog that was used during the recorded comparison.

Source years differ across entries. The CS seed uses title and topic summaries and still requires a full source audit. These course pools are meant for exploration only. Do not represent a full degree audit. Any missing or conflicting requirements are marked for review. The system does not verify grades, semester availability, workload or official enrollment eligibility. Students are advised to check the requirements with the university.

Refer to `THIRD_PARTY_NOTICES.txt` for model and runtime licenses and, for university attribution. Refer to `AI_ASSISTANCE.md` for the required disclosure of assistance used in this project.
