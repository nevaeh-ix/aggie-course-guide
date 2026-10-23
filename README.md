# Aggie Course Guide 🎓

A course discovery tool for NC A&T engineering students. Explore courses based on your interests and check prerequisites before planning your schedule.

**Tech:** JavaScript, Python, MiniLM, Transformers.js

**Features:** Semantic search, TF-IDF/BM25 comparisons, prerequisite checks, and recommendations from 315 catalog courses.

## Run locally

```bash
git clone https://github.com/nevaeh-ix/aggie-course-guide.git
cd aggie-course-guide
npm ci
npm run setup
npm test
npm run build
npm start
```

Open http://127.0.0.1:8000. Initial setup requires internet; inference runs locally.

For research details see [evaluation](evaluation/README.md), [AI disclosure](AI_ASSISTANCE.md), and [third-party notices](THIRD_PARTY_NOTICES.txt). Course suggestions are not an official degree audit.
