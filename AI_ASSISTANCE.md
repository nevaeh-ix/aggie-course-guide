# AI assistance and outside tools

ChatGPT/Codex assisted with implementation, tests, benchmark-case construction,
documentation, and code-comment cleanup. The benchmark queries and selected target
courses were constructed with that assistance, not collected from students.

MiniLM, Transformers.js, and ONNX Runtime are existing tools. The project did not
train MiniLM from scratch or fine-tune its weights. See THIRD_PARTY_NOTICES.txt for
their sources and licenses.

The published application runs retrieval on the user's device. It has no OpenAI
API integration, API key, paid inference endpoint, or ChatGPT-hosted demo link.
