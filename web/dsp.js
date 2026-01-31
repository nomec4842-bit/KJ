let currentSampleRate = 44100;
let dspReady = false;
let randState = 0x13579bdf;
const PI = Math.PI;

function clamp(value, minValue, maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function randomNoise() {
  randState = (randState * 1664525 + 1013904223) >>> 0;
  const bits = randState >>> 1;
  const scale = 1 / 1073741824;
  return (bits | 0) * scale;
}

class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.z1 = 0;
    this.z2 = 0;
  }

  configureLowpass(cutoff, q) {
    const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
    const nyquist = sr * 0.5;
    const fc = clamp(cutoff, 10, nyquist * 0.99);
    const resonance = clamp(q, 0.1, 20);
    const omega = (2 * PI * fc) / sr;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * resonance);
    const b0Raw = (1 - cosOmega) * 0.5;
    const b1Raw = 1 - cosOmega;
    const b2Raw = (1 - cosOmega) * 0.5;
    const a0Raw = 1 + alpha;
    const a1Raw = -2 * cosOmega;
    const a2Raw = 1 - alpha;

    this.b0 = b0Raw / a0Raw;
    this.b1 = b1Raw / a0Raw;
    this.b2 = b2Raw / a0Raw;
    this.a1 = a1Raw / a0Raw;
    this.a2 = a2Raw / a0Raw;
    this.z1 = 0;
    this.z2 = 0;
  }

  process(input) {
    const output = input * this.b0 + this.z1;
    this.z1 = input * this.b1 + this.z2 - this.a1 * output;
    this.z2 = input * this.b2 - this.a2 * output;
    return output;
  }
}

function timeToSamples(seconds) {
  return seconds * (currentSampleRate > 0 ? currentSampleRate : 44100);
}

function envelopeValue(t, attack, decay, sustain, sustainDuration, release) {
  const sustainLevel = clamp(sustain, 0, 1);
  const safeAttack = attack <= 0 ? 0.0001 : attack;
  const safeDecay = decay < 0 ? 0 : decay;
  const safeRelease = release <= 0 ? 0.0001 : release;

  if (t < safeAttack) {
    return clamp(t / safeAttack, 0, 1);
  }

  const decayStart = safeAttack;
  const decayEnd = safeAttack + safeDecay;
  if (t < decayEnd) {
    const pos = (t - decayStart) / Math.max(safeDecay, 0.000001);
    return 1 + (sustainLevel - 1) * pos;
  }

  const sustainEnd = decayEnd + sustainDuration;
  if (t < sustainEnd) {
    return sustainLevel;
  }

  const releaseStart = sustainEnd;
  const releasePos = (t - releaseStart) / safeRelease;
  if (releasePos >= 1) return 0;
  return sustainLevel * (1 - releasePos);
}

function clampBuffer(out) {
  for (let i = 0; i < out.length; i += 1) {
    const value = clamp(out[i], -1, 1);
    out[i] = value;
  }
}

const WAVE_SHAPES = ['sine', 'saw', 'triangle', 'square'];

function waveSample(shape, phase) {
  switch (shape) {
    case 'sine':
      return Math.sin(phase * 2 * PI);
    case 'triangle':
      return 1 - 4 * Math.abs(0.5 - (phase % 1));
    case 'square':
      return (phase % 1) < 0.5 ? 1 : -1;
    case 'saw':
    default:
      return 2 * (phase - Math.floor(phase + 0.5));
  }
}

function morphWaveSample(phase, morphValue) {
  const safeMorph = clamp(toNumber(morphValue, 0), 0, 2048);
  const span = WAVE_SHAPES.length - 1;
  const position = (safeMorph / 2048) * span;
  const index = Math.min(span - 1, Math.floor(position));
  const blend = position - index;
  const shapeA = WAVE_SHAPES[index];
  const shapeB = WAVE_SHAPES[index + 1];
  const sampleA = waveSample(shapeA, phase);
  const sampleB = waveSample(shapeB, phase);
  return sampleA + (sampleB - sampleA) * blend;
}

export function initDsp(sampleRate) {
  const sr = Number(sampleRate);
  currentSampleRate = Number.isFinite(sr) && sr > 0 ? sr : 44100;
  dspReady = true;
  return Promise.resolve(true);
}

export function isDspReady() {
  return dspReady;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function renderSynthOscSamples(params, velocity = 1, semitoneOffset = 0) {
  const a = toNumber(params?.a, 0.01);
  const d = toNumber(params?.d, 0.2);
  const r = toNumber(params?.r, 0.2);
  const length = calculateSynthSamples(a, d, r);
  const baseFreq = toNumber(params?.baseFreq, 220);
  const cutoff = toNumber(params?.cutoff, 2000);
  const q = toNumber(params?.q, 1);
  const sustain = toNumber(params?.s, 0.6);
  const vel = toNumber(velocity, 1);
  const semis = toNumber(semitoneOffset, 0);
  const useWavetable = !!params?.wavetable;
  const morph = toNumber(params?.morph, 0);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const freq = clamp(baseFreq, 20, 20000) * Math.pow(2, semis / 12);
  const dt = 1 / sr;
  let phase = 0;
  const sustainDuration = 0.25;
  const sustainLevel = clamp(sustain, 0, 1);
  const amp = clamp(vel, 0, 1.5) * 0.4;

  const lpf = new Biquad();
  lpf.configureLowpass(cutoff <= 0 ? 2000 : cutoff, q <= 0 ? 1 : q);

  for (let i = 0; i < length; i += 1) {
    const t = i * dt;
    const env = envelopeValue(t, a, d, sustainLevel, sustainDuration, r);
    phase += freq * dt;
    if (phase >= 1) phase -= Math.floor(phase);
    const osc = useWavetable ? morphWaveSample(phase, morph) : 2 * (phase - Math.floor(phase + 0.5));
    const filtered = lpf.process(osc);
    out[i] = filtered * env * amp;
  }

  clampBuffer(out);
  return out;
}

export function renderSynthSamples(params, velocity = 1, semitoneOffset = 0) {
  const oscillators = params?.threeOsc && Array.isArray(params?.oscillators)
    ? params.oscillators.filter(Boolean).slice(0, 3)
    : null;

  if (!oscillators || !oscillators.length) {
    return renderSynthOscSamples(params, velocity, semitoneOffset);
  }

  const rendered = oscillators.map((osc) => renderSynthOscSamples(osc, velocity, semitoneOffset));
  const length = Math.max(1, ...rendered.map((arr) => arr.length));
  const out = new Float32Array(length);
  for (const buffer of rendered) {
    for (let i = 0; i < buffer.length; i += 1) {
      out[i] += buffer[i];
    }
  }
  const scale = 1 / Math.max(1, rendered.length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] *= scale;
  }
  clampBuffer(out);
  return out;
}

export function renderNoiseSamples(params, velocity = 1, semitoneOffset = 0) {
  const a = toNumber(params?.a, 0.01);
  const d = toNumber(params?.d, 0.2);
  const r = toNumber(params?.r, 0.2);
  const length = calculateNoiseSamples(a, d, r);
  const cutoff = toNumber(params?.cutoff, 4000);
  const q = toNumber(params?.q, 0.8);
  const sustain = toNumber(params?.s, 0.3);
  const gain = toNumber(params?.gain, 0.8);
  const vel = toNumber(velocity, 1);
  const semis = toNumber(semitoneOffset, 0);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const dt = 1 / sr;
  const sustainDuration = 0.3;
  const sustainLevel = clamp(sustain, 0, 1);
  const velClamped = clamp(vel, 0, 2);
  const amp = clamp(gain, 0, 2) * velClamped;
  const baseCutoff = clamp(cutoff, 40, sr * 0.49);
  const cutoffHz = clamp(baseCutoff * Math.pow(2, semis / 12), 40, sr * 0.49);

  const lpf = new Biquad();
  lpf.configureLowpass(cutoffHz, q);

  for (let i = 0; i < length; i += 1) {
    const t = i * dt;
    const env = envelopeValue(t, a, d, sustainLevel, sustainDuration, r);
    const noise = randomNoise();
    out[i] = lpf.process(noise) * env * amp;
  }

  clampBuffer(out);
  return out;
}

export function renderKickSamples(params, velocity = 1) {
  const ampDecay = toNumber(params?.ampDecay, 0.45);
  const length = calculateKickSamples(ampDecay);
  const freq = toNumber(params?.freq, 55);
  const pitchDecay = toNumber(params?.pitchDecay, 0.08);
  const click = toNumber(params?.click, 0.12);
  const vel = toNumber(velocity, 1);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const dt = 1 / sr;
  const baseFreq = clamp(freq, 20, 200);
  const pitchDecaySec = clamp(pitchDecay, 0.001, 1);
  const ampDecaySec = clamp(ampDecay, 0.05, 2);
  const clickAmount = clamp(click, 0, 1);
  const velClamped = clamp(vel, 0, 2);

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i * dt;
    const pitchEnv = Math.exp(-t / pitchDecaySec);
    const currentFreq = baseFreq + baseFreq * 2.5 * pitchEnv;
    phase += currentFreq * dt;
    if (phase >= 1) phase -= Math.floor(phase);
    const env = Math.exp(-t / ampDecaySec);
    let sample = Math.sin(phase * 2 * PI) * env * velClamped;
    if (t < 0.01 && clickAmount > 0) {
      sample += randomNoise() * clickAmount * (1 - t / 0.01) * velClamped;
    }
    out[i] = sample;
  }

  clampBuffer(out);
  return out;
}

export function renderSnareSamples(params, velocity = 1) {
  const decay = toNumber(params?.decay, 0.22);
  const length = calculateSnareSamples(decay);
  const tone = toNumber(params?.tone, 180);
  const noise = toNumber(params?.noise, 0.6);
  const vel = toNumber(velocity, 1);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const dt = 1 / sr;
  const toneHz = clamp(tone, 60, 2000);
  const noiseAmt = clamp(noise, 0, 1.5);
  const decaySec = clamp(decay, 0.01, 2);
  const velClamped = clamp(vel, 0, 2);

  let tonePhase = 0;
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  const hpCutoff = 1200;
  const rc = 1 / (2 * PI * hpCutoff);
  const alpha = rc / (rc + dt);

  for (let i = 0; i < length; i += 1) {
    const t = i * dt;
    const env = Math.exp(-t / decaySec);

    tonePhase += toneHz * dt;
    if (tonePhase >= 1) tonePhase -= Math.floor(tonePhase);
    const sine = Math.sin(tonePhase * 2 * PI);
    const toneSample = sine * 0.3 * velClamped;

    const white = randomNoise();
    const hpOut = alpha * (hpPrevOut + white - hpPrevIn);
    hpPrevIn = white;
    hpPrevOut = hpOut;
    const noiseSample = hpOut * noiseAmt * velClamped;

    out[i] = (toneSample + noiseSample) * env;
  }

  clampBuffer(out);
  return out;
}

export function renderHatSamples(params, velocity = 1) {
  const decay = toNumber(params?.decay, 0.06);
  const length = calculateHatSamples(decay);
  const hpf = toNumber(params?.hpf, 8000);
  const vel = toNumber(velocity, 1);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const dt = 1 / sr;
  const decaySec = clamp(decay, 0.01, 1);
  const velClamped = clamp(vel, 0, 2);
  const cutoff = clamp(hpf, 2000, sr * 0.49);
  const rc = 1 / (2 * PI * cutoff);
  const alpha = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i * dt;
    const env = Math.exp(-t / decaySec);
    const noise = randomNoise();
    const hp = alpha * (prevOut + noise - prevIn);
    prevIn = noise;
    prevOut = hp;
    out[i] = hp * env * velClamped * 0.6;
  }

  clampBuffer(out);
  return out;
}

export function renderClapSamples(params, velocity = 1) {
  const bursts = Math.max(1, Math.round(toNumber(params?.bursts, 3)));
  const spread = toNumber(params?.spread, 0.02);
  const tail = toNumber(params?.decay, 0.1);
  const length = calculateClapSamples(bursts, spread, tail);
  const vel = toNumber(velocity, 1);

  const out = new Float32Array(length);
  const sr = currentSampleRate > 0 ? currentSampleRate : 44100;
  const dt = 1 / sr;
  const spacing = clamp(spread, 0.001, 0.1);
  const tailSec = clamp(tail, 0.02, 2);
  const velClamped = clamp(vel, 0, 2);

  for (let b = 0; b < bursts; b += 1) {
    const startSample = Math.round(timeToSamples(b * spacing));
    for (let i = startSample; i < length; i += 1) {
      const t = (i - startSample) * dt;
      const env = Math.exp(-t / tailSec);
      if (env < 0.0001) break;
      out[i] += randomNoise() * env;
    }
  }

  const lpf = new Biquad();
  lpf.configureLowpass(3500, 0.7);
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  const hpCutoff = 400;
  const rc = 1 / (2 * PI * hpCutoff);
  const alpha = rc / (rc + dt);

  for (let i = 0; i < length; i += 1) {
    const hp = alpha * (hpPrevOut + out[i] - hpPrevIn);
    hpPrevIn = out[i];
    hpPrevOut = hp;
    const shaped = lpf.process(hp);
    out[i] = shaped * velClamped * 0.5;
  }

  clampBuffer(out);
  return out;
}

function calculateSynthSamples(attack, decay, release) {
  const total = Math.max(0.25, attack) + Math.max(0, decay) + 0.35 + Math.max(0.05, release);
  return Math.max(1, Math.ceil(timeToSamples(total)));
}

function calculateNoiseSamples(attack, decay, release) {
  const total = Math.max(0.2, attack) + Math.max(0, decay) + 0.4 + Math.max(0.05, release);
  return Math.max(1, Math.ceil(timeToSamples(total)));
}

function calculateKickSamples(ampDecay) {
  const total = Math.max(0.2, ampDecay + 0.12);
  return Math.max(1, Math.ceil(timeToSamples(total)));
}

function calculateSnareSamples(decay) {
  const total = Math.max(0.12, decay + 0.12);
  return Math.max(1, Math.ceil(timeToSamples(total)));
}

function calculateHatSamples(decay) {
  const total = Math.max(0.08, decay + 0.05);
  return Math.max(1, Math.ceil(timeToSamples(total)));
}

function calculateClapSamples(bursts, spread, tail) {
  const burstCount = Math.max(1, bursts);
  const spacing = Math.max(0.001, spread);
  const duration = Math.max(0.05, tail);
  const total = (burstCount - 1) * spacing + duration + 0.05;
  return Math.max(1, Math.ceil(timeToSamples(total)));
}
