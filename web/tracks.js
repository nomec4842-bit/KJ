import { ctx, master, clampInt } from './core.js';
import { synthBlip, noiseSynth, kick808, snare808, hat808, clap909, samplerPlay } from './engines.js';
import { normalizeStepFx } from './stepfx.js';

export { STEP_FX_TYPES, STEP_FX_DEFAULTS, createStepFx, normalizeStepFx } from './stepfx.js';

export const STEP_CHOICES = [4, 8, 12, 16, 24, 32];

const SYNTH_OSC_DEFAULT = Object.freeze({
  cutoff: 2000,
  q: 1,
  a: 0.01,
  d: 0.2,
  s: 0.6,
  r: 0.2,
  baseFreq: 220,
  wavetable: false,
  morph: 0,
});

const NOISE_DEFAULT = Object.freeze({
  cutoff: 4000,
  q: 0.8,
  a: 0.01,
  d: 0.2,
  s: 0.3,
  r: 0.2,
  gain: 0.8,
});

export const defaults = {
  synth:   {
    ...SYNTH_OSC_DEFAULT,
    threeOsc: false,
    activeOsc: 0,
    oscillators: Array.from({ length: 3 }, () => ({ ...SYNTH_OSC_DEFAULT })),
  },
  noise:  { ...NOISE_DEFAULT },
  kick808: { freq:55, pitchDecay:0.08, ampDecay:0.45, click:0.12 },
  snare808:{ tone:180, noise:0.6, decay:0.22 },
  hat808:  { decay:0.06, hpf:8000 },
  clap909: { bursts:3, spread:0.02, decay:0.10 },
  sampler: { start:0, end:1, semis:0, gain:1, loop:false, advanced:false },
  cvl: { scrubber: 0 },
};

const clone = o => JSON.parse(JSON.stringify(o));

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

const TRACK_COMPRESSION_DEFAULT = Object.freeze({
  enabled: false,
  threshold: -24,
  knee: 30,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
});

const TRACK_EQ3_DEFAULT = Object.freeze({
  enabled: false,
  lowGain: 0,
  midGain: 0,
  highGain: 0,
});

export const TRACK_FX_DEFAULTS = Object.freeze({
  compression: TRACK_COMPRESSION_DEFAULT,
  eq3: TRACK_EQ3_DEFAULT,
});

export const ARP_DEFAULTS = Object.freeze({
  enabled: false,
  rate: 4,
  direction: 'up',
  octaves: 1,
  gate: 0.9,
});

export function getStepVelocity(step, fallback = 0) {
  if (!step || typeof step !== 'object') return fallback;
  const params = step.params;
  const paramVel = params && typeof params === 'object' ? Number(params.velocity) : NaN;
  if (Number.isFinite(paramVel)) return Math.max(0, paramVel);
  const vel = Number(step.vel);
  if (Number.isFinite(vel)) return Math.max(0, vel);
  return Math.max(0, fallback);
}

export function setStepVelocity(step, velocity = 0) {
  if (!step || typeof step !== 'object') return 0;
  const v = Number(velocity);
  const next = Number.isFinite(v) ? Math.max(0, v) : 0;
  if (!step.params || typeof step.params !== 'object') step.params = {};
  step.params.velocity = next;
  step.vel = next;
  return next;
}

export function normalizeStep(step) {
  const src = step && typeof step === 'object' ? step : {};
  const normalized = {
    on: !!src.on,
    params: { ...(src.params && typeof src.params === 'object' ? src.params : {}) },
    fx: normalizeStepFx(src.fx),
    vel: 0,
  };
  const fallback = normalized.on ? 1 : 0;
  const velocity = getStepVelocity(src, fallback);
  setStepVelocity(normalized, velocity);
  return normalized;
}

const makeStep = () => normalizeStep({});
const makeNote = (start=0, length=1, pitch=0, vel=1, chance=1) => ({ start, length, pitch, vel, chance });

function makeBus(){
  const input = ctx.createGain();
  const duckLow = ctx.createBiquadFilter();
  duckLow.type = 'lowshelf';
  duckLow.frequency.value = 200;
  duckLow.Q.value = 0.707;
  duckLow.gain.value = 0;
  const duckMid = ctx.createBiquadFilter();
  duckMid.type = 'peaking';
  duckMid.frequency.value = 1000;
  duckMid.Q.value = 1;
  duckMid.gain.value = 0;
  const duckHigh = ctx.createBiquadFilter();
  duckHigh.type = 'highshelf';
  duckHigh.frequency.value = 2000;
  duckHigh.Q.value = 0.707;
  duckHigh.gain.value = 0;
  const duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  const gain = ctx.createGain();
  let pan = null;
  try { pan = ctx.createStereoPanner(); } catch {}
  if (pan){
    gain.connect(pan).connect(master);
  } else {
    gain.connect(master);
  }
  input.connect(duckLow);
  duckLow.connect(duckMid);
  duckMid.connect(duckHigh);
  duckHigh.connect(duckGain);
  duckGain.connect(gain);
  return {
    input,
    duckGain,
    duckFilters: { low: duckLow, mid: duckMid, high: duckHigh },
    gain,
    pan,
    hasPan: !!pan,
  };
}

export function createTrack(name, engine='synth', length=16){
  const bus = makeBus();
  const track = {
    name, engine,
    type: 'standard',
    mode: 'steps',           // 'steps' | 'piano'
    length,
    pos: -1,
    steps: Array.from({length}, makeStep),
    notes: [],               // for piano roll
    noteModTargets: [],      // per-note modulation target list
    mods: [],                // modulation definitions
    arp: { ...ARP_DEFAULTS },

    inputNode: bus.input,
    duckGainNode: bus.duckGain,
    duckFilters: bus.duckFilters,
    gainNode: bus.gain,
    panNode: bus.pan,
    _hasPan: bus.hasPan,
    gain: 0.9, pan: 0, mute: false, solo: false,

    params: {
      synth:   clone(defaults.synth),
      noise:   clone(defaults.noise),
      kick808: clone(defaults.kick808),
      snare808:clone(defaults.snare808),
      hat808:  clone(defaults.hat808),
      clap909: clone(defaults.clap909),
      sampler: clone(defaults.sampler),
      cvl: clone(defaults.cvl),
    },

    sample: { buffer:null, name:'' },
    cvl: {
      lanes: 1,
      samples: [],
      scrubberRate: '1/16',
      scrubberDepth: 0,
    },
    effects: normalizeTrackEffects({}),
  };
  ensureTrackFxNodes(track);
  syncTrackEffects(track);
  return track;
}

function ensureTrackFxNodes(track) {
  if (!track) return;
  if (!track._fxNodes || typeof track._fxNodes !== 'object') track._fxNodes = {};
  if (!track._fxNodes.compression) {
    try {
      track._fxNodes.compression = ctx.createDynamicsCompressor();
    } catch (err) {
      track._fxNodes.compression = null;
    }
  }
  if (!track._fxNodes.eq3) {
    try {
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 200;
      low.Q.value = 0.707;
      low.gain.value = 0;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 1;
      mid.gain.value = 0;

      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 4000;
      high.Q.value = 0.707;
      high.gain.value = 0;

      low.connect(mid);
      mid.connect(high);
      track._fxNodes.eq3 = { low, mid, high, input: low, output: high };
    } catch (err) {
      track._fxNodes.eq3 = null;
    }
  }
}

function rebuildTrackFxChain(track) {
  if (!track || !track.inputNode || !track.gainNode) return;
  const duckFilters = track.duckFilters || {};
  const duckLow = duckFilters.low || null;
  const duckMid = duckFilters.mid || null;
  const duckHigh = duckFilters.high || null;
  const duckGain = track.duckGainNode || null;

  try { track.inputNode.disconnect(); } catch {}
  for (const node of [duckLow, duckMid, duckHigh, duckGain]) {
    if (!node) continue;
    try { node.disconnect(); } catch {}
  }

  const activeNodes = [];
  const eqEnabled = !!track?.effects?.eq3?.enabled;
  if (eqEnabled && track?._fxNodes?.eq3?.input) {
    activeNodes.push(track._fxNodes.eq3);
  }
  const compressionEnabled = !!track?.effects?.compression?.enabled;
  if (compressionEnabled && track?._fxNodes?.compression) {
    activeNodes.push(track._fxNodes.compression);
  }
  for (const node of activeNodes) {
    try { node.disconnect(); } catch {}
  }

  let previous = track.inputNode;
  for (const node of activeNodes) {
    if (node?.input && node?.output) {
      try { previous.connect(node.input); } catch {}
      previous = node.output;
      continue;
    }
    try { previous.connect(node); } catch {}
    previous = node;
  }

  if (duckLow && duckMid && duckHigh && duckGain) {
    try { previous.connect(duckLow); } catch {}
    try { duckLow.connect(duckMid); } catch {}
    try { duckMid.connect(duckHigh); } catch {}
    try { duckHigh.connect(duckGain); } catch {}
    previous = duckGain;
  } else if (duckGain) {
    try { previous.connect(duckGain); } catch {}
    previous = duckGain;
  }

  try { previous.connect(track.gainNode); } catch {}
}

export function normalizeTrackEffects(effects = {}) {
  const source = effects && typeof effects === 'object' ? effects : {};
  const compressionSource = source.compression && typeof source.compression === 'object'
    ? source.compression
    : {};
  const defaults = TRACK_COMPRESSION_DEFAULT;
  const eqSource = source.eq3 && typeof source.eq3 === 'object' ? source.eq3 : {};
  const eqDefaults = TRACK_EQ3_DEFAULT;
  const normalizedCompression = {
    enabled: compressionSource.enabled === true,
    threshold: clampNumber(compressionSource.threshold, -60, 0, defaults.threshold),
    knee: clampNumber(compressionSource.knee, 0, 40, defaults.knee),
    ratio: clampNumber(compressionSource.ratio, 1, 20, defaults.ratio),
    attack: clampNumber(compressionSource.attack, 0.001, 1, defaults.attack),
    release: clampNumber(compressionSource.release, 0.01, 2, defaults.release),
  };
  const normalizedEq3 = {
    enabled: eqSource.enabled === true,
    lowGain: clampNumber(eqSource.lowGain, -24, 24, eqDefaults.lowGain),
    midGain: clampNumber(eqSource.midGain, -24, 24, eqDefaults.midGain),
    highGain: clampNumber(eqSource.highGain, -24, 24, eqDefaults.highGain),
  };
  return {
    compression: normalizedCompression,
    eq3: normalizedEq3,
  };
}

export function syncTrackEffects(track) {
  if (!track) return null;
  const normalized = normalizeTrackEffects(track.effects);
  track.effects = normalized;
  ensureTrackFxNodes(track);
  const compressionNode = track._fxNodes?.compression || null;
  const eqNodes = track._fxNodes?.eq3 || null;
  const compression = normalized.compression;
  const eq3 = normalized.eq3;
  if (compression && !compressionNode) {
    compression.enabled = false;
  }
  if (eq3 && !eqNodes) {
    eq3.enabled = false;
  }
  if (compressionNode && compression) {
    const now = ctx.currentTime;
    try { compressionNode.threshold.setValueAtTime(compression.threshold, now); } catch {}
    try { compressionNode.knee.setValueAtTime(compression.knee, now); } catch {}
    try { compressionNode.ratio.setValueAtTime(compression.ratio, now); } catch {}
    try { compressionNode.attack.setValueAtTime(compression.attack, now); } catch {}
    try { compressionNode.release.setValueAtTime(compression.release, now); } catch {}
  }
  if (eqNodes && eq3) {
    const now = ctx.currentTime;
    try { eqNodes.low.gain.setValueAtTime(eq3.lowGain, now); } catch {}
    try { eqNodes.mid.gain.setValueAtTime(eq3.midGain, now); } catch {}
    try { eqNodes.high.gain.setValueAtTime(eq3.highGain, now); } catch {}
  }
  rebuildTrackFxChain(track);
  return normalized;
}

let _modId = 0;

export function createModulator(track, def = {}){
  if (!track) throw new Error('Track is required to create a modulator');
  if (!Array.isArray(track.mods)) track.mods = [];

  const {
    source = 'lfo',
    amount = 0,
    target = '',
    options = {},
    enabled = true,
    id,
  } = def || {};

  let modId = id;
  if (typeof modId === 'number' && Number.isFinite(modId)) modId = `mod-${modId}`;
  if (typeof modId === 'string') {
    const match = /mod-(\d+)/i.exec(modId);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > _modId) _modId = parsed;
    }
  } else {
    modId = `mod-${++_modId}`;
  }
  if (!modId) modId = `mod-${++_modId}`;

  const mod = {
    id: modId,
    source: typeof source === 'string' ? source : 'lfo',
    amount: Number.isFinite(amount) ? amount : 0,
    target: Array.isArray(target)
      ? target.map(v => `${v}`.trim()).filter(Boolean)
      : (typeof target === 'string' ? target.trim() : target),
    options: { ...(options || {}) },
    enabled: enabled !== false,
  };

  track.mods.push(mod);
  return mod;
}

export function removeModulator(track, modOrId){
  if (!track || !Array.isArray(track.mods) || !track.mods.length) return null;
  const idx = track.mods.findIndex(m => m === modOrId || m?.id === modOrId);
  if (idx < 0) return null;
  const [removed] = track.mods.splice(idx, 1);
  return removed;
}

export function resizeTrackSteps(track, newLen){
  newLen = clampInt(newLen, 1, 128);
  const old = track.steps;
  const next = new Array(newLen);
  for (let i=0;i<newLen;i++){
    next[i] = old[i] ? normalizeStep(old[i]) : makeStep();
  }
  track.steps = next;
  track.length = newLen;
  track.pos = Math.min(Math.max(track.pos, -1), newLen-1);

  // trim notes if needed
  track.notes = track.notes
    .map(n => ({...n, start: Math.max(0, Math.min(n.start, newLen-1)),
                 length: Math.max(1, Math.min(n.length, newLen - n.start))}))
    .filter(n => n.length > 0);
}

export function triggerEngine(track, vel=1, semis=0, when, gateSec){
  const dest = track?.inputNode || track?.gainNode;
  switch(track.engine){
    case 'synth':    return synthBlip(track.params.synth,    dest, vel, semis, when, gateSec);
    case 'noise':    return noiseSynth(track.params.noise,   dest, vel, semis, when, gateSec);
    case 'kick808':  return kick808(track.params.kick808,    dest, vel, when, gateSec);
    case 'snare808': return snare808(track.params.snare808,  dest, vel, when, gateSec);
    case 'hat808':   return hat808(track.params.hat808,      dest, vel, when, gateSec);
    case 'clap909':  return clap909(track.params.clap909,    dest, vel, when, gateSec);
    case 'sampler':  return samplerPlay(track.params.sampler,dest, vel, track.sample, semis, when, gateSec);
  }
}

export function applyMixer(tracks){
  const anySolo = tracks.some(t=>t.solo);
  for (const t of tracks){
    const audible = !t.mute && (!anySolo || t.solo);
    t._effectiveAudible = audible;
    t.gainNode.gain.value = audible ? t.gain : 0;
    if (t._hasPan && t.panNode){ try { t.panNode.pan.value = t.pan; } catch{} }
  }
}

/* ---------- Piano roll helpers ---------- */
export function notesStartingAt(track, step){
  return track.notes.filter(n => n.start === step);
}
export function toggleNoteAt(track, step, pitch, vel=1){
  const idx = track.notes.findIndex(n => n.start===step && n.pitch===pitch);
  if (idx>=0){ track.notes.splice(idx,1); return; }
  track.notes.push(makeNote(step, 1, pitch, vel, 1));
}
export function stretchNoteEnding(track, step, pitch, newEndStep){
  const n = track.notes.find(n => n.start===step && n.pitch===pitch);
  if (!n) return;
  const end = Math.max(n.start+1, Math.min(newEndStep, track.length));
  n.length = end - n.start;
}
