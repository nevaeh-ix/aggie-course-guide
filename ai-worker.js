// Load the model once and reuse it for the next request.
let extractor;
self.onmessage = async ({ data }) => {
  try {
    const { pipeline, env } = await import('./vendor/transformers.bundle.js');
    // Use the files shipped with the site so searches stay on this device.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = new URL('./models/', self.location.href).href;
    env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
    // A single thread works on Pages without cross-origin isolation headers.
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    if (!extractor)
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress')
            self.postMessage({
              id: data.id,
              status: 'loading',
              progress: Math.round(p.progress || 0)
            });
        }
      });
    const output = await extractor(data.text.slice(0, 2000), { pooling: 'mean', normalize: true });
    self.postMessage({ id: data.id, status: 'ready', vector: output.tolist()[0] });
  } catch (error) {
    console.error('Course AI inference failed:', error);
    self.postMessage({
      id: data.id,
      status: 'error',
      message: 'AI could not load. You can retry or use keyword matching.'
    });
  }
};
