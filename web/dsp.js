let modulePromise = null;
let moduleInstance = null;
let currentSampleRate = 0;

async function loadModule() {
  let imported;
  try {
    imported = await import('./dist/kj_dsp.js');
  } catch (err) {
    throw new Error('Unable to load web/dist/kj_dsp.js. Build the WebAssembly module before running the UI.');
  }
  const factory = imported?.default;
  if (typeof factory !== 'function') {
    throw new Error('Invalid DSP module factory. Did you build the wasm bundle?');
  }
  const instance = await factory();
  return instance;
}

export function initDsp(sampleRate) {
  if (!modulePromise) {
    modulePromise = (async () => {
      moduleInstance = await loadModule();
      if (moduleInstance && typeof moduleInstance._kj_set_sample_rate === 'function') {
        moduleInstance._kj_set_sample_rate(sampleRate | 0);
        currentSampleRate = sampleRate | 0;
      }
      return moduleInstance;
    })();
  } else if (moduleInstance && sampleRate !== currentSampleRate && typeof moduleInstance._kj_set_sample_rate === 'function') {
    moduleInstance._kj_set_sample_rate(sampleRate | 0);
    currentSampleRate = sampleRate | 0;
  }
  return modulePromise;
}

export function isDspReady() {
  return !!moduleInstance;
}

export function getDspModule() {
  if (!moduleInstance) throw new Error('DSP module not ready');
  return moduleInstance;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function renderToArray(length, renderFn) {
  const module = getDspModule();
  const byteSize = length * Float32Array.BYTES_PER_ELEMENT;
  const ptr = module._malloc(byteSize);
  if (!ptr) throw new Error('Failed to allocate audio buffer');
  try {
    renderFn(module, ptr);
    const start = ptr >> 2;
    const end = start + length;
    const heapView = module.HEAPF32.subarray(start, end);
    const output = new Float32Array(length);
    output.set(heapView);
    return output;
  } finally {
    module._free(ptr);
  }
}

export function renderSynthSamples(params, velocity = 1, semitoneOffset = 0) {
  const module = getDspModule();
  const a = toNumber(params?.a, 0.01);
  const d = toNumber(params?.d, 0.2);
  const r = toNumber(params?.r, 0.2);
  const length = module._kj_calculate_synth_samples(a, d, r);
  const baseFreq = toNumber(params?.baseFreq, 220);
  const cutoff = toNumber(params?.cutoff, 2000);
  const q = toNumber(params?.q, 1);
  const sustain = toNumber(params?.s, 0.6);
  const vel = toNumber(velocity, 1);
  const semis = toNumber(semitoneOffset, 0);

  return renderToArray(length, (mod, ptr) => {
    mod._kj_generate_synth(ptr, length, baseFreq, cutoff, q, a, d, sustain, r, vel, semis);
  });
}

export function renderKickSamples(params, velocity = 1) {
  const module = getDspModule();
  const ampDecay = toNumber(params?.ampDecay, 0.45);
  const length = module._kj_calculate_kick_samples(ampDecay);
  const freq = toNumber(params?.freq, 55);
  const pitchDecay = toNumber(params?.pitchDecay, 0.08);
  const click = toNumber(params?.click, 0.12);
  const vel = toNumber(velocity, 1);

  return renderToArray(length, (mod, ptr) => {
    mod._kj_generate_kick(ptr, length, freq, pitchDecay, ampDecay, click, vel);
  });
}

export function renderSnareSamples(params, velocity = 1) {
  const module = getDspModule();
  const decay = toNumber(params?.decay, 0.22);
  const length = module._kj_calculate_snare_samples(decay);
  const tone = toNumber(params?.tone, 180);
  const noise = toNumber(params?.noise, 0.6);
  const vel = toNumber(velocity, 1);

  return renderToArray(length, (mod, ptr) => {
    mod._kj_generate_snare(ptr, length, tone, noise, decay, vel);
  });
}

export function renderHatSamples(params, velocity = 1) {
  const module = getDspModule();
  const decay = toNumber(params?.decay, 0.06);
  const length = module._kj_calculate_hat_samples(decay);
  const hpf = toNumber(params?.hpf, 8000);
  const vel = toNumber(velocity, 1);

  return renderToArray(length, (mod, ptr) => {
    mod._kj_generate_hat(ptr, length, decay, hpf, vel);
  });
}

export function renderClapSamples(params, velocity = 1) {
  const module = getDspModule();
  const bursts = Math.max(1, Math.round(toNumber(params?.bursts, 3)));
  const spread = toNumber(params?.spread, 0.02);
  const tail = toNumber(params?.decay, 0.1);
  const length = module._kj_calculate_clap_samples(bursts, spread, tail);
  const vel = toNumber(velocity, 1);

  return renderToArray(length, (mod, ptr) => {
    mod._kj_generate_clap(ptr, length, bursts, spread, tail, vel);
  });
}
