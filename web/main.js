// main.js
import { ctx, startTransport, stopTransport, dspReady, ensureAudioReady } from './core.js';
import {
  createTrack, triggerEngine, applyMixer, resizeTrackSteps,
  notesStartingAt, normalizeStep, setStepVelocity, getStepVelocity,
  syncTrackEffects, defaults, ARP_DEFAULTS,
} from './tracks.js';
import { STEP_FX_TYPES, STEP_FX_DEFAULTS, normalizeStepFx } from './stepfx.js';
import { applyMods } from './mods.js';
import { createGrid } from './sequencer.js';
import { createPianoRoll } from './pianoroll.js';
import { refreshTrackSelect, renderParams, makeField, renderArpPanel, createPianoNoteParamsPanel } from './ui.js';
import { serializePattern, instantiatePattern, clonePatternData } from './patterns.js';

await dspReady;

/* ---------- DOM ---------- */
const tempoInput   = document.getElementById('tempo');
const trackSel     = document.getElementById('trackSelect');
const addTrackBtn  = document.getElementById('addTrack');
const trackTypeSel = document.getElementById('trackType');
const engineSel    = document.getElementById('engine');
const seqEl        = document.getElementById('sequencer');
const arpEl        = document.getElementById('arpPanel');
const paramsEl     = document.getElementById('params');
const pianoNoteParamsEl = document.getElementById('pianoNoteParams');
const timelinePanel = document.getElementById('timelinePanel');
const cvlPanel     = document.getElementById('cvlPanel');
const cvlRoot      = document.getElementById('cvlRoot');

const patternSel       = document.getElementById('patternSelect');
const addPatternBtn    = document.getElementById('addPattern');
const dupPatternBtn    = document.getElementById('dupPattern');
const patLenInput      = document.getElementById('patLen');

const chainAddBtn       = document.getElementById('chainAdd');
const chainClearBtn     = document.getElementById('chainClear');
const chainPrevBtn      = document.getElementById('chainPrev');
const chainNextBtn      = document.getElementById('chainNext');
const followChainToggle = document.getElementById('followChain');
const loopChainToggle   = document.getElementById('loopChain');
const chainView         = document.getElementById('chainView');
const chainStatus       = document.getElementById('chainStatus');

const togglePiano  = document.getElementById('togglePiano');
const playBtn      = document.getElementById('play');
const stopBtn      = document.getElementById('stop');

const saveProjectBtn = document.getElementById('saveProject');
const loadProjectBtn = document.getElementById('loadProject');
const loadProjectInput = document.getElementById('loadProjectFile');
const resetProjectBtn = document.getElementById('resetProject');

/* ---------- State ---------- */
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {};
const song = {
  patterns: [],
  current: 0,
  chain: [{ pattern: 0, repeats: 1 }],
  chainPos: 0,
  followChain: false,
  loopChain: false,
  chainRepeatsLeft: 0
};

let currentStepIntervalMs = 0;
const PROJECT_STORAGE_KEY = 'kj.project.v1';

const CVL_RATES = [
  { value: '1/1', label: '1/1 (Whole)' },
  { value: '1/2', label: '1/2' },
  { value: '1/2D', label: '1/2 Dotted' },
  { value: '1/2T', label: '1/2 Triplet' },
  { value: '1/4', label: '1/4' },
  { value: '1/4D', label: '1/4 Dotted' },
  { value: '1/4T', label: '1/4 Triplet' },
  { value: '1/8', label: '1/8' },
  { value: '1/8D', label: '1/8 Dotted' },
  { value: '1/8T', label: '1/8 Triplet' },
  { value: '1/16', label: '1/16' },
  { value: '1/16D', label: '1/16 Dotted' },
  { value: '1/16T', label: '1/16 Triplet' },
  { value: '1/32', label: '1/32' },
  { value: '1/32D', label: '1/32 Dotted' },
  { value: '1/32T', label: '1/32 Triplet' },
];

function getCvlRateBeats(rate) {
  const match = typeof rate === 'string' ? rate.match(/^1\/(\d+)([DT])?$/) : null;
  const denom = match ? Number(match[1]) : 16;
  const safeDenom = Number.isFinite(denom) && denom > 0 ? denom : 16;
  let beats = 4 / safeDenom;
  if (match?.[2] === 'D') beats *= 1.5;
  if (match?.[2] === 'T') beats *= 2 / 3;
  return beats;
}

function shuffleArray(source) {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function noteChanceAllows(note, chanceOverride) {
  const chanceValue = Number(chanceOverride ?? note?.chance);
  const chance = Number.isFinite(chanceValue) ? chanceValue : 1;
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return Math.random() < chance;
}

function applyNoteOffsets(notes, noteOffsets, trackLength) {
  if (!noteOffsets || !Array.isArray(notes)) return notes;
  return notes.map((note) => {
    const key = `${note.start}:${note.pitch}`;
    const offset = noteOffsets[key];
    if (!offset) return note;
    const velBase = Number.isFinite(note?.vel) ? note.vel : 1;
    const chanceBase = Number.isFinite(note?.chance) ? note.chance : 1;
    const lengthBase = Number.isFinite(note?.length) ? note.length : 1;
    const velOffset = Number.isFinite(offset.vel) ? offset.vel : 0;
    const chanceOffset = Number.isFinite(offset.chance) ? offset.chance : 0;
    const lengthOffset = Number.isFinite(offset.length) ? offset.length : 0;
    const vel = Math.max(0, Math.min(1, velBase + velOffset));
    const chance = Math.max(0, Math.min(1, chanceBase + chanceOffset));
    const maxLength = Number.isFinite(trackLength)
      ? Math.max(1, trackLength - note.start)
      : Math.max(1, lengthBase + lengthOffset);
    const length = Math.max(1, Math.min(maxLength, lengthBase + lengthOffset));
    return { ...note, vel, chance, length };
  });
}

function buildArpNotes(notes, arp) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const octaves = Math.max(1, Number(arp?.octaves) || 1);
  const base = notes.map(n => ({
    pitch: n.pitch,
    vel: n.vel ?? 1,
    chance: n.chance ?? 1,
  }));
  const expanded = [];
  for (let octave = 0; octave < octaves; octave++) {
    for (const note of base) {
      expanded.push({ ...note, pitch: note.pitch + 12 * octave });
    }
  }
  expanded.sort((a, b) => a.pitch - b.pitch);
  if (arp?.direction === 'down') {
    expanded.reverse();
    return expanded;
  }
  if (arp?.direction === 'random') {
    return shuffleArray(expanded);
  }
  if (arp?.direction === 'upDown') {
    if (expanded.length <= 1) return expanded;
    const tail = expanded.slice(1, -1).reverse();
    return expanded.concat(tail);
  }
  return expanded;
}

function createDefaultTracks() {
  return [
    normalizeTrack(createTrack('Kick', 'kick808', 16)),
    normalizeTrack(createTrack('Hat', 'hat808', 16)),
    normalizeTrack(createTrack('Snare', 'snare808', 16)),
  ];
}

function createDefaultProject() {
  const baseTracks = createDefaultTracks();
  return {
    version: 1,
    patterns: [serializePattern('P1', baseTracks, 16)],
    current: 0,
    chain: [{ pattern: 0, repeats: 1 }],
    followChain: false,
    loopChain: false,
    selectedTrackIndex: 0,
    tempo: 120,
  };
}

function serializeProject() {
  saveCurrentPattern();
  const tempo = Number(tempoInput?.value);
  return {
    version: 1,
    patterns: Array.isArray(song.patterns) ? song.patterns.map(p => clonePatternData(p)) : [],
    current: Number.isInteger(song.current) ? song.current : 0,
    chain: Array.isArray(song.chain) ? song.chain.map(slot => ({
      pattern: Number.isInteger(slot?.pattern) ? slot.pattern : 0,
      repeats: Math.max(1, slot?.repeats ?? 1),
    })) : [],
    followChain: !!song.followChain,
    loopChain: !!song.loopChain,
    selectedTrackIndex: Number.isInteger(selectedTrackIndex) ? selectedTrackIndex : 0,
    tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
  };
}

function applyProjectData(rawProject) {
  const data = rawProject && typeof rawProject === 'object' ? rawProject : {};
  const patternsRaw = Array.isArray(data.patterns)
    ? data.patterns
    : (Array.isArray(data.song?.patterns) ? data.song.patterns : []);

  const normalizedPatterns = patternsRaw
    .map((pat, index) => {
      if (!pat || typeof pat !== 'object') return null;
      const safeTracks = Array.isArray(pat.tracks) ? pat.tracks : [];
      return {
        ...pat,
        name: pat.name || `P${index + 1}`,
        len16: Math.max(1, Number(pat.len16) || 16),
        tracks: safeTracks,
      };
    })
    .filter(Boolean);

  let patterns = normalizedPatterns;
  if (!patterns.length) {
    const fallback = createDefaultProject();
    patterns = fallback.patterns;
  }

  const currentIndexRaw = Number.isInteger(data.current)
    ? data.current
    : (Number.isInteger(data.song?.current) ? data.song.current : 0);
  const currentIndex = Math.max(0, Math.min(patterns.length - 1, currentIndexRaw));

  const chainRaw = Array.isArray(data.chain)
    ? data.chain
    : (Array.isArray(data.song?.chain) ? data.song.chain : []);
  const chain = chainRaw
    .map((slot) => {
      if (!slot || typeof slot !== 'object') return null;
      return {
        pattern: Number.isInteger(slot.pattern) ? slot.pattern : currentIndex,
        repeats: Math.max(1, Number(slot.repeats) || 1),
      };
    })
    .filter(Boolean);

  song.patterns = patterns;
  song.current = currentIndex;
  song.chain = chain.length ? chain : [{ pattern: currentIndex, repeats: 1 }];
  song.chainPos = 0;
  song.followChain = !!(data.followChain ?? data.song?.followChain);
  song.loopChain = !!(data.loopChain ?? data.song?.loopChain);
  song.chainRepeatsLeft = 0;

  const tempo = Number(data.tempo);
  if (tempoInput && Number.isFinite(tempo) && tempo > 0) {
    tempoInput.value = String(Math.min(300, Math.max(40, tempo)));
  }

  const storedSelected = Number.isInteger(data.selectedTrackIndex)
    ? data.selectedTrackIndex
    : (Number.isInteger(data.song?.selectedTrackIndex) ? data.song.selectedTrackIndex : 0);
  selectedTrackIndex = Math.max(0, storedSelected);

  loadPattern(song.current);
  renderChain();
}

function saveProjectToStorage() {
  try {
    const data = serializeProject();
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to autosave project', err);
  }
}

function clearProjectStorage() {
  try {
    localStorage.removeItem(PROJECT_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear autosave', err);
  }
}

function loadProjectFromStorage() {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    applyProjectData(parsed);
    return true;
  } catch (err) {
    console.warn('Failed to load autosave', err);
    return false;
  }
}

/* ---------- Track Normalization ---------- */
function normalizeTrack(t) {
  if (!t) return t;
  t.name   = t.name   ?? 'Track';
  const type = typeof t.type === 'string' ? t.type : 'standard';
  t.type = type === 'cvl' ? 'cvl' : 'standard';
  if (t.type === 'cvl') {
    t.engine = 'sampler';
    t.mode = 'steps';
  }
  t.mode   = t.mode   ?? 'steps';
  t.length = Math.max(1, (t.length ?? 16)|0);
  t.pos    = Number.isInteger(t.pos) ? t.pos : -1;

  if (!Array.isArray(t.steps)) t.steps = [];
  if (t.steps.length > t.length) t.steps.length = t.length;
  for (let i = 0; i < t.length; i++) {
    let step = t.steps[i];
    if (!step || typeof step !== 'object') {
      step = t.steps[i] = normalizeStep({});
      continue;
    }
    step.on = !!step.on;
    if (!step.params || typeof step.params !== 'object') step.params = {};
    step.fx = normalizeStepFx(step.fx);
    const fallbackVel = step.on ? 1 : 0;
    const velocity = getStepVelocity(step, fallbackVel);
    setStepVelocity(step, velocity);
  }
  while (t.steps.length < t.length) {
    t.steps.push(normalizeStep({}));
  }

  if (!Array.isArray(t.notes)) t.notes = [];
  t.notes = t.notes
    .filter(note => note && typeof note === 'object')
    .map((note) => {
      const startValue = Number(note.start);
      const lengthValue = Number(note.length);
      const start = Number.isFinite(startValue) ? Math.max(0, Math.min(t.length - 1, Math.trunc(startValue))) : 0;
      const length = Number.isFinite(lengthValue) ? Math.max(1, Math.min(t.length - start, lengthValue)) : 1;
      const pitch = Number.isFinite(Number(note.pitch)) ? note.pitch|0 : 0;
      const velValue = Number(note.vel);
      const vel = Number.isFinite(velValue) ? Math.max(0, Math.min(1, velValue)) : 1;
      const chanceValue = Number(note.chance);
      const chance = Number.isFinite(chanceValue) ? Math.max(0, Math.min(1, chanceValue)) : 1;
      return { ...note, start, length, pitch, vel, chance };
    });

  if (!Array.isArray(t.noteModTargets)) {
    t.noteModTargets = [];
  } else {
    t.noteModTargets = t.noteModTargets
      .filter(target => target && typeof target === 'object')
      .map((target) => {
        const stepRaw = Number(target.step);
        const pitchRaw = Number(target.pitch);
        const step = Number.isFinite(stepRaw) ? Math.max(0, Math.min(t.length - 1, Math.trunc(stepRaw))) : 0;
        const pitch = Number.isFinite(pitchRaw) ? Math.trunc(pitchRaw) : 0;
        return { step, pitch };
      });
  }

  const storedSelection = Number.isInteger(t.selectedStep) ? t.selectedStep : -1;
  if (storedSelection >= 0 && storedSelection < t.length) {
    t.selectedStep = storedSelection;
  } else if (storedSelection >= t.length && t.length > 0) {
    t.selectedStep = t.length - 1;
  } else {
    t.selectedStep = -1;
  }

  if (!t.selectedNote || typeof t.selectedNote !== 'object') {
    t.selectedNote = null;
  } else {
    const step = Number(t.selectedNote.step);
    const pitch = Number(t.selectedNote.pitch);
    if (!Number.isFinite(step) || !Number.isFinite(pitch)) {
      t.selectedNote = null;
    } else {
      t.selectedNote = { step: Math.trunc(step), pitch: Math.trunc(pitch) };
    }
  }

  if (!t.arp || typeof t.arp !== 'object') {
    t.arp = { ...ARP_DEFAULTS };
  } else {
    t.arp.enabled = !!t.arp.enabled;
    const rate = Math.round(Number(t.arp.rate));
    t.arp.rate = Number.isFinite(rate) ? Math.max(1, Math.min(16, rate)) : ARP_DEFAULTS.rate;
    const allowedDirections = new Set(['up', 'down', 'upDown', 'random']);
    t.arp.direction = allowedDirections.has(t.arp.direction) ? t.arp.direction : ARP_DEFAULTS.direction;
    const octaves = Math.round(Number(t.arp.octaves));
    t.arp.octaves = Number.isFinite(octaves) ? Math.max(1, Math.min(4, octaves)) : ARP_DEFAULTS.octaves;
    const gate = Number(t.arp.gate);
    t.arp.gate = Number.isFinite(gate) ? Math.max(0.05, Math.min(1, gate)) : ARP_DEFAULTS.gate;
  }

  if (!t.params || typeof t.params !== 'object') t.params = {};
  const toNumber = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  if (!t.params.synth || typeof t.params.synth !== 'object') {
    t.params.synth = JSON.parse(JSON.stringify(defaults.synth));
  } else {
    const synth = t.params.synth;
    const oscDefaults = defaults.synth.oscillators?.[0] || defaults.synth;
    const normalizeOsc = (osc, fallback) => {
      const source = osc && typeof osc === 'object' ? osc : {};
      const base = fallback || oscDefaults;
      const normalized = {
        baseFreq: toNumber(source.baseFreq, base.baseFreq),
        cutoff: toNumber(source.cutoff, base.cutoff),
        q: toNumber(source.q, base.q),
        a: toNumber(source.a, base.a),
        d: toNumber(source.d, base.d),
        s: toNumber(source.s, base.s),
        r: toNumber(source.r, base.r),
        wavetable: !!source.wavetable,
        morph: 0,
      };
      const morphValue = toNumber(source.morph, base.morph);
      normalized.morph = Math.max(0, Math.min(2048, Math.round(morphValue)));
      return normalized;
    };

    const baseOsc = normalizeOsc(synth, oscDefaults);
    synth.baseFreq = baseOsc.baseFreq;
    synth.cutoff = baseOsc.cutoff;
    synth.q = baseOsc.q;
    synth.a = baseOsc.a;
    synth.d = baseOsc.d;
    synth.s = baseOsc.s;
    synth.r = baseOsc.r;
    synth.wavetable = baseOsc.wavetable;
    synth.morph = baseOsc.morph;
    synth.threeOsc = !!synth.threeOsc;
    const activeOsc = Number.isFinite(Number(synth.activeOsc)) ? Number(synth.activeOsc) : 0;
    synth.activeOsc = Math.max(0, Math.min(2, Math.round(activeOsc)));

    const oscList = Array.isArray(synth.oscillators) ? synth.oscillators : [];
    synth.oscillators = Array.from({ length: 3 }, (_, index) => {
      const fallback = index === 0 ? baseOsc : oscDefaults;
      const source = oscList[index];
      const normalized = normalizeOsc(source, fallback);
      if (source && typeof source === 'object') {
        Object.assign(source, normalized);
        return source;
      }
      return normalized;
    });
  }
  if (!t.params.noise || typeof t.params.noise !== 'object') {
    t.params.noise = JSON.parse(JSON.stringify(defaults.noise));
  } else {
    const noise = t.params.noise;
    noise.cutoff = toNumber(noise.cutoff, defaults.noise.cutoff);
    noise.q = toNumber(noise.q, defaults.noise.q);
    noise.a = toNumber(noise.a, defaults.noise.a);
    noise.d = toNumber(noise.d, defaults.noise.d);
    noise.s = toNumber(noise.s, defaults.noise.s);
    noise.r = toNumber(noise.r, defaults.noise.r);
    noise.gain = toNumber(noise.gain, defaults.noise.gain);
  }
  if (!t.params.sampler || typeof t.params.sampler !== 'object') {
    t.params.sampler = { start:0, end:1, semis:0, gain:1, loop:false, advanced:false };
  } else {
    const sampler = t.params.sampler;
    sampler.start = toNumber(sampler.start, 0);
    sampler.end = toNumber(sampler.end, 1);
    sampler.semis = toNumber(sampler.semis, 0);
    sampler.gain = toNumber(sampler.gain, 1);
    sampler.loop = !!sampler.loop;
    sampler.advanced = !!sampler.advanced;
  }

  if (!t.params.cvl || typeof t.params.cvl !== 'object') {
    t.params.cvl = { scrubber: 0 };
  } else {
    const scrubber = Number(t.params.cvl.scrubber);
    t.params.cvl.scrubber = Number.isFinite(scrubber) ? scrubber : 0;
  }

  if (!t.cvl || typeof t.cvl !== 'object') {
    t.cvl = {
      lanes: 6,
      samples: [],
      scrubberRate: '1/16',
      scrubberDepth: 0,
      pixelsPerBeat: 24,
      snapToGrid: false,
      clips: [],
    };
  } else {
    const lanes = Number(t.cvl.lanes);
    t.cvl.lanes = Number.isFinite(lanes) ? Math.max(1, Math.min(12, Math.round(lanes))) : 6;
    if (!Array.isArray(t.cvl.samples)) t.cvl.samples = [];
    t.cvl.samples = t.cvl.samples
      .filter((sample) => sample && typeof sample === 'object')
      .map((sample) => ({ name: sample.name || 'Sample' }));
    const allowedRates = new Set(CVL_RATES.map((rate) => rate.value));
    const scrubberRate = typeof t.cvl.scrubberRate === 'string' ? t.cvl.scrubberRate : '';
    t.cvl.scrubberRate = allowedRates.has(scrubberRate) ? scrubberRate : '1/16';
    const scrubberDepth = Number(t.cvl.scrubberDepth);
    t.cvl.scrubberDepth = Number.isFinite(scrubberDepth)
      ? Math.max(0, Math.min(1, scrubberDepth))
      : 0;
    const pixelsPerBeat = Number(t.cvl.pixelsPerBeat);
    t.cvl.pixelsPerBeat = Number.isFinite(pixelsPerBeat)
      ? Math.max(6, Math.min(96, pixelsPerBeat))
      : 24;
    t.cvl.snapToGrid = !!t.cvl.snapToGrid;
    if (!Array.isArray(t.cvl.clips)) t.cvl.clips = [];
    t.cvl.clips = t.cvl.clips
      .filter((clip) => clip && typeof clip === 'object')
      .map((clip) => {
        const lane = Number(clip.lane);
        const start = Number(clip.start);
        const length = Number(clip.length);
        return {
          lane: Number.isFinite(lane) ? Math.max(0, Math.floor(lane)) : 0,
          start: Number.isFinite(start) ? Math.max(0, start) : 0,
          length: Number.isFinite(length) ? Math.max(0.25, length) : 1,
          sampleName: typeof clip.sampleName === 'string' ? clip.sampleName : 'Sample',
        };
      });
  }

  if (!Array.isArray(t.mods)) {
    t.mods = [];
  } else {
    for (let i = t.mods.length - 1; i >= 0; i--) {
      const mod = t.mods[i];
      if (!mod || typeof mod !== 'object') { t.mods.splice(i, 1); continue; }
      if (typeof mod.source !== 'string') mod.source = 'lfo';
      else mod.source = mod.source.trim() || 'lfo';
      const amt = Number(mod.amount);
      mod.amount = Number.isFinite(amt) ? amt : 0;
      if (typeof mod.target === 'string') mod.target = mod.target.trim();
      else if (Array.isArray(mod.target)) mod.target = mod.target.map(v => `${v}`.trim()).filter(Boolean);
      else mod.target = '';
      if (!mod.options || typeof mod.options !== 'object') mod.options = {};
      if (mod.enabled === undefined) mod.enabled = true;
    }
  }

  syncTrackEffects(t);

  if (!Array.isArray(t.chain) || !t.chain.length) {
    t.chain = [{ pattern: song.current ?? 0, repeats: 1 }];
  }
  t.chainPos    = Number.isInteger(t.chainPos) ? t.chainPos : 0;
  const slotRep = t.chain[t.chainPos]?.repeats ?? 1;
  t.repeatsLeft = Math.max(1, (t.repeatsLeft ?? slotRep)|0);
  return t;
}

/* ---------- Editors ---------- */
const stepGrid = createGrid(
  seqEl,
  (i) => { // click = toggle
    const st = currentTrack()?.steps?.[i];
    if (!st) return;
    const prevVel = getStepVelocity(st, 1);
    st.on = !st.on;
    if (st.on) {
      const nextVel = prevVel > 0 ? prevVel : 1;
      setStepVelocity(st, nextVel);
    } else {
      setStepVelocity(st, prevVel);
    }
    renderCurrentEditor();
    saveProjectToStorage();
  },
  undefined,
  (i) => {
    const track = currentTrack();
    if (!track) return;
    setTrackSelectedStep(track, i);
  }
);

const piano = createPianoRoll(
  seqEl,
  () => currentTrack(),
  () => renderCurrentEditor(),
  (selection) => {
    const track = currentTrack();
    if (!track) return;
    if (selection && typeof selection === 'object') {
      const stepIndex = Number(selection.step);
      setTrackSelectedNote(track, selection, { skipBroadcast: true, force: true });
      setTrackSelectedStep(track, stepIndex, { skipBroadcast: true, force: true });
      broadcastSelection(track);
      return;
    }
    setTrackSelectedNote(track, null, { skipBroadcast: true });
    setTrackSelectedStep(track, selection);
  }
);

const pianoNoteParams = createPianoNoteParamsPanel(pianoNoteParamsEl, () => currentTrack());
if (pianoNoteParams) {
  let noteParamRenderQueued = false;
  let noteParamSaveTimer = null;
  pianoNoteParams.setOnChange(() => {
    if (!noteParamRenderQueued) {
      noteParamRenderQueued = true;
      requestAnimationFrame(() => {
        noteParamRenderQueued = false;
        renderCurrentEditor();
      });
    }
    if (noteParamSaveTimer) {
      clearTimeout(noteParamSaveTimer);
    }
    noteParamSaveTimer = setTimeout(() => {
      noteParamSaveTimer = null;
      saveProjectToStorage();
    }, 200);
  });
}

function getTrackStepCount(track) {
  if (!track) return 0;
  if (Number.isInteger(track.length)) return track.length;
  if (Array.isArray(track.steps)) return track.steps.length;
  return 0;
}

function getTrackSelectedStep(track) {
  if (!track) return -1;
  const index = Number.isInteger(track.selectedStep) ? track.selectedStep : -1;
  const len = getTrackStepCount(track);
  if (index < 0 || index >= len) return -1;
  return index;
}

function getTrackSelectedNote(track) {
  if (!track || !track.selectedNote || typeof track.selectedNote !== 'object') return null;
  const step = Number(track.selectedNote.step);
  const pitch = Number(track.selectedNote.pitch);
  if (!Number.isFinite(step) || !Number.isFinite(pitch)) return null;
  return { step: Math.trunc(step), pitch: Math.trunc(pitch) };
}

function updateInlineStepSelection(selectedIndex) {
  if (!paramsEl) return;
  const root = paramsEl.querySelector('#trk_stepEditor');
  if (root) {
    const buttons = root.querySelectorAll('.mini-step');
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('selected', idx === selectedIndex);
    });
  }
  if (selectedIndex >= 0) {
    paramsEl.dataset.selectedStep = String(selectedIndex);
  } else {
    delete paramsEl.dataset.selectedStep;
  }
  paramsEl._selectedStepIndex = selectedIndex;
}

function syncSelectionUI() {
  const track = currentTrack();
  if (!track) {
    if (stepGrid && typeof stepGrid.select === 'function') {
      stepGrid.select(-1);
    }
    if (piano && typeof piano.select === 'function') {
      piano.select(-1);
    }
    updateInlineStepSelection(-1);
    if (pianoNoteParams) {
      pianoNoteParams.updateSelection(null);
    }
    return;
  }
  const selectedIndex = getTrackSelectedStep(track);
  if (track.mode === 'steps') {
    if (stepGrid && typeof stepGrid.select === 'function') {
      stepGrid.select(selectedIndex);
    }
    if (piano && typeof piano.select === 'function') {
      piano.select(-1);
    }
  } else if (track.mode === 'piano') {
    if (piano && typeof piano.select === 'function') {
      piano.select(selectedIndex);
    }
    if (stepGrid && typeof stepGrid.select === 'function') {
      stepGrid.select(-1);
    }
  } else {
    if (stepGrid && typeof stepGrid.select === 'function') {
      stepGrid.select(-1);
    }
    if (piano && typeof piano.select === 'function') {
      piano.select(-1);
    }
  }
  updateInlineStepSelection(selectedIndex);
  if (pianoNoteParams) {
    pianoNoteParams.updateSelection(getTrackSelectedNote(track));
  }
}

function broadcastSelection(track) {
  syncSelectionUI();
  const isCurrent = track && track === currentTrack();
  const note = isCurrent ? getTrackSelectedNote(track) : null;
  if (pianoNoteParams) {
    pianoNoteParams.updateSelection(note);
  }
  if (!isCurrent || !paramsEl) return;
  const index = getTrackSelectedStep(track);
  const detail = {
    index,
    note,
    track,
    trackIndex: tracks.indexOf(track),
    selectedTrackIndex,
  };
  paramsEl.dispatchEvent(new CustomEvent('stepselectionchange', {
    detail,
    bubbles: true,
    composed: true,
  }));
}

function setTrackSelectedStep(track, index, { force = false, skipBroadcast = false } = {}) {
  if (!track) return;
  const len = getTrackStepCount(track);
  let next = -1;

  if (index !== null && index !== undefined) {
    const parsed = Number(index);
    if (Number.isFinite(parsed)) {
      next = Math.trunc(parsed);
    }
  }

  if (next < 0 || len <= 0) {
    next = -1;
  } else if (next >= len) {
    next = len - 1;
  }

  const prev = Number.isInteger(track.selectedStep) ? track.selectedStep : -1;
  if (!force && prev === next) return;

  track.selectedStep = next;
  if (!skipBroadcast) {
    broadcastSelection(track);
  }
}

function setTrackSelectedNote(track, note, { force = false, skipBroadcast = false } = {}) {
  if (!track) return;
  let next = null;
  if (note && typeof note === 'object') {
    const step = Number(note.step);
    const pitch = Number(note.pitch);
    if (Number.isFinite(step) && Number.isFinite(pitch)) {
      next = { step: Math.trunc(step), pitch: Math.trunc(pitch) };
    }
  }
  const prev = getTrackSelectedNote(track);
  if (!force && prev?.step === next?.step && prev?.pitch === next?.pitch) return;
  track.selectedNote = next;
  if (!skipBroadcast) {
    broadcastSelection(track);
  }
}

function showEditorForTrack(){
  const t = currentTrack();
  if (!t) {
    syncSelectionUI();
    return;
  }
  if (t.type === 'cvl') {
    if (timelinePanel) timelinePanel.classList.add('is-hidden');
    if (seqEl) seqEl.classList.add('is-hidden');
    if (cvlPanel) cvlPanel.classList.remove('is-hidden');
    renderCvlPanel();
    return;
  }
  if (timelinePanel) timelinePanel.classList.remove('is-hidden');
  if (seqEl) seqEl.classList.remove('is-hidden');
  if (cvlPanel) cvlPanel.classList.add('is-hidden');
  seqEl.classList.toggle('piano-roll', t.mode === 'piano');
  seqEl.classList.toggle('step-sequencer', t.mode !== 'piano');
  if (t.mode === 'piano') piano.setLength(t.length);
  else stepGrid.setLength(t.length);
  renderCurrentEditor();
}
function renderCurrentEditor(){
  const t = currentTrack();
  if (!t) {
    syncSelectionUI();
    return;
  }
  if (t.type === 'cvl') {
    renderCvlPanel();
    return;
  }
  seqEl.classList.toggle('piano-roll', t.mode === 'piano');
  seqEl.classList.toggle('step-sequencer', t.mode !== 'piano');
  if (t.mode === 'piano') piano.update();
  else stepGrid.update((i)=>t.steps[i]);
  const inlineStep = paramsEl?._inlineStepEditor;
  if (inlineStep && Array.isArray(t.steps)) {
    inlineStep.update(t.steps);
  }
  const stepParams = paramsEl?._stepParamsEditor;
  if (stepParams && typeof stepParams.refresh === 'function') {
    stepParams.refresh();
  }
  const stepFx = paramsEl?._stepFxEditor;
  if (stepFx && typeof stepFx.refresh === 'function') {
    stepFx.refresh();
  }
  syncSelectionUI();
}
function paintPlayhead(){
  const t = currentTrack();
  if (!t) {
    stepGrid.paint(-1);
    const inlineStep = paramsEl?._inlineStepEditor;
    if (inlineStep) inlineStep.paint(-1);
    return;
  }
  if (t.mode === 'piano') piano.paint(t.pos);
  else stepGrid.paint(t.pos);
  const inlineStep = paramsEl?._inlineStepEditor;
  if (inlineStep) inlineStep.paint(t.pos ?? -1);
}

/* ---------- Params ---------- */
async function onSampleFile(file) {
  if (!file) return;

  const track = currentTrack();
  if (!track) return;

  const buffer = await decodeAudioFile(file);
  if (!buffer) return;

  track.sample = { buffer, name: file.name };
  sampleCache[file.name] = buffer;

  if (track === currentTrack()) {
    renderParamsPanel();
  }

  saveProjectToStorage();
}

async function onCvlSampleFile(file) {
  if (!file) return;
  const track = currentTrack();
  if (!track || track.type !== 'cvl') return;

  const buffer = await decodeAudioFile(file);
  if (!buffer) return;

  if (!Array.isArray(track.cvl.samples)) track.cvl.samples = [];
  track.cvl.samples.push({ name: file.name });
  sampleCache[file.name] = buffer;
  renderCvlPanel();
  saveProjectToStorage();
}

async function decodeAudioFile(file) {
  let arrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    console.error('Failed to read sample file', err);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Failed to read the selected audio file.');
    }
    return null;
  }

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const maybePromise = ctx.decodeAudioData(arrayBuffer, done, fail);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(done, fail);
      }
    });
  } catch (err) {
    console.error('Failed to decode audio data', err);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Unable to decode the selected audio file.');
    }
    return null;
  }
}

function renderParamsPanel(){
  if (!paramsEl) return;
  const track = currentTrack();
  if (!track) {
    paramsEl.innerHTML = '';
    if (paramsEl._inlineStepEditor) delete paramsEl._inlineStepEditor;
    syncSelectionUI();
    return;
  }
  const binder = renderParams(paramsEl, track, makeField);
  binder({
    applyMixer: () => applyMixer(tracks),
    t: track,
    onStepsChange: (newLen) => {
      resizeTrackSteps(track, newLen);
      normalizeTrack(track);
      showEditorForTrack();
      paintPlayhead();
      const inlineStep = paramsEl?._inlineStepEditor;
      if (inlineStep && Array.isArray(track.steps)) {
        inlineStep.rebuild(track.length ?? track.steps.length);
        inlineStep.update(track.steps);
        inlineStep.paint(track.pos ?? -1);
      }
      setTrackSelectedStep(track, track.selectedStep, { force: true });
      saveProjectToStorage();
    },
    onSampleFile,
    onStepSelect: (index) => {
      if (index !== undefined && index !== null) {
        setTrackSelectedStep(track, index);
      }
      renderCurrentEditor();
      paintPlayhead();
    },
    onStepParamsChange: () => {
      renderCurrentEditor();
      saveProjectToStorage();
    },
    onStepFxChange: () => {
      renderCurrentEditor();
      saveProjectToStorage();
    },
    onTrackFxChange: () => {
      syncTrackEffects(track);
      saveProjectToStorage();
    },
    onParamsRerender: () => {
      renderParamsPanel();
      saveProjectToStorage();
    },
  });
  const inlineStep = paramsEl?._inlineStepEditor;
  if (inlineStep && track && Array.isArray(track.steps)) {
    inlineStep.update(track.steps);
    inlineStep.paint(track.pos ?? -1);
  }
  const stepParams = paramsEl?._stepParamsEditor;
  if (stepParams && typeof stepParams.refresh === 'function') {
    stepParams.refresh();
  }
  const stepFx = paramsEl?._stepFxEditor;
  if (stepFx && typeof stepFx.refresh === 'function') {
    stepFx.refresh();
  }
  const trackFx = paramsEl?._trackFxEditor;
  if (trackFx && typeof trackFx.refresh === 'function') {
    trackFx.refresh();
  }
  setTrackSelectedStep(track, getTrackSelectedStep(track), { force: true });
}

function renderCvlPanel() {
  if (!cvlPanel || !cvlRoot) return;
  const track = currentTrack();
  if (!track || track.type !== 'cvl') {
    cvlPanel.classList.add('is-hidden');
    cvlRoot.innerHTML = '';
    return;
  }

  cvlPanel.classList.remove('is-hidden');

  const samples = Array.isArray(track.cvl?.samples) ? track.cvl.samples : [];
  const clips = Array.isArray(track.cvl?.clips) ? track.cvl.clips : [];
  const lanes = Number.isFinite(Number(track.cvl?.lanes)) ? Math.max(1, Math.round(track.cvl.lanes)) : 6;
  const timelineSteps = Math.max(1, Number.isFinite(track.length) ? track.length : 16);
  const pixelsPerBeat = Number.isFinite(track.cvl?.pixelsPerBeat) ? track.cvl.pixelsPerBeat : 24;
  const timelineBeats = Math.max(1, timelineSteps / 4);
  const timelineWidth = Math.max(240, Math.round(timelineBeats * pixelsPerBeat));
  const rateOptions = CVL_RATES.map((rate) => (
    `<option value="${rate.value}" ${rate.value === track.cvl.scrubberRate ? 'selected' : ''}>${rate.label}</option>`
  )).join('');

  const escapeHtml = (value) => `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const sampleList = samples.length
    ? samples.map((sample) => {
      const safeName = escapeHtml(sample.name);
      return `<li class="cvl-sample" draggable="true" data-sample-name="${safeName}">${safeName}</li>`;
    }).join('')
    : '<li class="cvl-empty">No samples loaded.</li>';

  const clipMarkupForLane = (laneIndex) => {
    const laneClips = clips.filter((clip) => clip.lane === laneIndex);
    if (!laneClips.length) return '';
    return laneClips.map((clip) => {
      const start = Number.isFinite(clip.start) ? clip.start : 0;
      const length = Number.isFinite(clip.length) ? clip.length : 1;
      const left = Math.max(0, start * pixelsPerBeat);
      const width = Math.max(8, length * pixelsPerBeat);
      const sampleName = escapeHtml(clip.sampleName || 'Sample');
      return `
        <div class="cvl-clip" style="left:${left}px; width:${width}px" title="${sampleName}">
          <span>${sampleName}</span>
        </div>
      `;
    }).join('');
  };

  const rulerTicks = Array.from({ length: Math.ceil(timelineBeats) + 1 }, (_, index) => {
    const left = index * pixelsPerBeat;
    return `
      <div class="cvl-ruler-tick" style="left:${left}px">
        <span>${index + 1}</span>
      </div>
    `;
  }).join('');

  const laneRows = Array.from({ length: lanes }, (_, index) => `
    <div class="cvl-lane" data-lane="${index}">
      <div class="cvl-lane-label">Lane ${index + 1}</div>
      <div class="cvl-lane-track" style="--cvl-width:${timelineWidth}px; --cvl-beat:${pixelsPerBeat}px">
        ${clipMarkupForLane(index)}
      </div>
    </div>
  `).join('');

  cvlRoot.innerHTML = `
    <div class="cvl-window">
      <div class="cvl-header">
        <label class="ctrl">
          Sample Loader
          <input id="cvl_sample" type="file" accept="audio/*">
        </label>
        <div class="cvl-controls">
          <label class="ctrl">
            Scrubber Mod Rate
            <select id="cvl_scrubberRate">${rateOptions}</select>
          </label>
          <label class="ctrl">
            Depth
            <input id="cvl_scrubberDepth" type="range" min="0" max="1" step="0.01" value="${track.cvl.scrubberDepth ?? 0}">
          </label>
          <label class="ctrl">
            Snap to Grid
            <input id="cvl_snapToGrid" type="checkbox" ${track.cvl.snapToGrid ? 'checked' : ''}>
          </label>
        </div>
      </div>
      <div class="cvl-body">
        <aside class="cvl-bin">
          <h4>Sample Bin</h4>
          <ul>${sampleList}</ul>
        </aside>
        <div class="cvl-lanes">
          <div class="cvl-ruler">
            <div class="cvl-lane-label">Timeline</div>
            <div class="cvl-ruler-track" style="--cvl-width:${timelineWidth}px; --cvl-beat:${pixelsPerBeat}px">
              ${rulerTicks}
            </div>
          </div>
          ${laneRows}
        </div>
      </div>
    </div>
  `;

  const sampleInput = document.getElementById('cvl_sample');
  if (sampleInput) {
    sampleInput.onchange = (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      onCvlSampleFile(file);
      ev.target.value = '';
    };
  }

  const rateSelect = document.getElementById('cvl_scrubberRate');
  if (rateSelect) {
    rateSelect.onchange = (ev) => {
      const value = ev.target.value;
      const allowed = new Set(CVL_RATES.map((rate) => rate.value));
      track.cvl.scrubberRate = allowed.has(value) ? value : '1/16';
      saveProjectToStorage();
    };
  }

  const depthControl = document.getElementById('cvl_scrubberDepth');
  if (depthControl) {
    depthControl.oninput = (ev) => {
      const value = Number(ev.target.value);
      track.cvl.scrubberDepth = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    };
    depthControl.onchange = () => {
      saveProjectToStorage();
    };
  }

  const snapToggle = document.getElementById('cvl_snapToGrid');
  if (snapToggle) {
    snapToggle.onchange = (ev) => {
      track.cvl.snapToGrid = !!ev.target.checked;
      saveProjectToStorage();
    };
  }

  const sampleItems = cvlRoot.querySelectorAll('.cvl-sample[data-sample-name]');
  sampleItems.forEach((item) => {
    item.addEventListener('dragstart', (event) => {
      const sampleName = item.dataset.sampleName;
      if (!event.dataTransfer || !sampleName) return;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-cvl-sample', sampleName);
      event.dataTransfer.setData('text/plain', sampleName);
    });
  });

  const laneRowsEls = cvlRoot.querySelectorAll('.cvl-lane');
  laneRowsEls.forEach((laneEl) => {
    const laneIndex = Number(laneEl.dataset.lane);
    const trackEl = laneEl.querySelector('.cvl-lane-track');
    if (!trackEl) return;
    const getSampleName = (event) => {
      if (!event.dataTransfer) return '';
      return event.dataTransfer.getData('application/x-cvl-sample')
        || event.dataTransfer.getData('text/plain');
    };
    const handleDragOver = (event) => {
      if (!getSampleName(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (event) => {
      const sampleName = getSampleName(event);
      if (!sampleName) return;
      event.preventDefault();
      const rect = trackEl.getBoundingClientRect();
      const rawOffset = event.clientX - rect.left;
      const clampedOffset = Math.max(0, Math.min(rect.width, rawOffset));
      const rawBeat = clampedOffset / pixelsPerBeat;
      const gridSize = 0.25;
      const snappedBeat = track.cvl.snapToGrid
        ? Math.round(rawBeat / gridSize) * gridSize
        : rawBeat;
      const start = Math.max(0, Math.min(timelineBeats, snappedBeat));
      const clip = {
        lane: Number.isFinite(laneIndex) ? laneIndex : 0,
        start,
        length: 1,
        sampleName,
      };
      if (!Array.isArray(track.cvl.clips)) track.cvl.clips = [];
      track.cvl.clips.push(clip);
      saveProjectToStorage();
      renderCvlPanel();
    };
    laneEl.addEventListener('dragover', handleDragOver);
    laneEl.addEventListener('drop', handleDrop);
  });
}

function updateArpPanelVisibility(track) {
  if (!arpEl) return;
  const shouldShow = !!track && track.mode === 'piano';
  arpEl.classList.toggle('is-hidden', !shouldShow);
}

function renderArpControls() {
  if (!arpEl) return;
  const track = currentTrack();
  if (!track) {
    arpEl.innerHTML = '';
    updateArpPanelVisibility(null);
    return;
  }
  const binder = renderArpPanel(arpEl, track, makeField);
  if (typeof binder === 'function') {
    binder({
      t: track,
      onArpChange: () => {
        renderArpControls();
        saveProjectToStorage();
      },
    });
  }
  updateArpPanelVisibility(track);
}
function refreshAndSelect(i = selectedTrackIndex){
  const track = currentTrack();
  if (track) normalizeTrack(track);
  refreshTrackSelect(trackSel, tracks, i);
  if (track) {
    if (trackTypeSel) trackTypeSel.value = track.type || 'standard';
    if (track.type === 'cvl') {
      track.engine = 'sampler';
      engineSel.value = 'sampler';
      engineSel.disabled = true;
      togglePiano.checked = false;
      togglePiano.disabled = true;
    } else {
      engineSel.disabled = false;
      togglePiano.disabled = false;
      engineSel.value = track.engine;
      togglePiano.checked = track.mode === 'piano';
    }
  } else {
    engineSel.value = '';
    togglePiano.checked = false;
    if (trackTypeSel) trackTypeSel.value = 'standard';
  }
  showEditorForTrack();
  renderParamsPanel();
  renderArpControls();
}

trackSel.onchange = () => {
  selectedTrackIndex = parseInt(trackSel.value, 10);
  refreshAndSelect(selectedTrackIndex);
  saveProjectToStorage();
};

if (trackTypeSel) {
  trackTypeSel.onchange = () => {
    const track = currentTrack();
    if (!track) return;
    track.type = trackTypeSel.value === 'cvl' ? 'cvl' : 'standard';
    if (track.type === 'cvl') {
      track.engine = 'sampler';
      track.mode = 'steps';
      track.selectedNote = null;
    }
    refreshAndSelect(selectedTrackIndex);
    saveProjectToStorage();
  };
}

engineSel.onchange = () => {
  currentTrack().engine = engineSel.value;
  refreshAndSelect(selectedTrackIndex);
  saveProjectToStorage();
};

togglePiano.onchange = () => {
  const track = currentTrack();
  if (!track) return;
  track.mode = togglePiano.checked ? 'piano' : 'steps';
  if (track.mode !== 'piano') {
    track.selectedNote = null;
  }
  showEditorForTrack();
  paintPlayhead();
  broadcastSelection(track);
  renderArpControls();
  saveProjectToStorage();
};

addTrackBtn.onclick = () => {
  const type = trackTypeSel?.value === 'cvl' ? 'cvl' : 'standard';
  const eng = type === 'cvl' ? 'sampler' : (engineSel.value || 'synth');
  const name = `Track ${tracks.length + 1}`;
  const newTrack = createTrack(name, eng, 16);
  newTrack.type = type;
  tracks.push(normalizeTrack(newTrack));
  selectedTrackIndex = tracks.length - 1;
  applyMixer(tracks);
  refreshAndSelect(selectedTrackIndex);
  saveProjectToStorage();
};

/* ---------- Patterns ---------- */
function clampPatternIndex(idx) {
  if (!song.patterns.length) return 0;
  const parsed = Number.parseInt(idx, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(song.patterns.length - 1, parsed));
}

function saveCurrentPattern() {
  if (!Array.isArray(song.patterns) || !song.patterns.length) return;

  const index = clampPatternIndex(song.current ?? 0);
  song.current = index;

  const existing = song.patterns[index];
  const existingName = existing?.name ?? `P${index + 1}`;
  const storedLen = Number(existing?.len16);
  const inputLen = Number.parseInt(patLenInput?.value ?? '', 10);
  const patternLen = Number.isFinite(storedLen) && storedLen > 0
    ? storedLen
    : (Number.isFinite(inputLen) && inputLen > 0 ? inputLen : 16);

  song.patterns[index] = serializePattern(existingName, tracks, patternLen);
}

function loadPattern(index) {
  if (!Array.isArray(song.patterns) || !song.patterns.length) {
    refreshPatternSelect();
    return;
  }

  const target = clampPatternIndex(index ?? song.current ?? 0);
  song.current = target;

  const pat = song.patterns[target];
  if (!pat) {
    refreshPatternSelect();
    return;
  }

  const instance = instantiatePattern(pat, sampleCache) || {};
  const nextTracks = Array.isArray(instance.tracks) ? instance.tracks : [];

  const normalized = nextTracks.map((t) => normalizeTrack(t));
  tracks.splice(0, tracks.length, ...normalized);

  if (tracks.length) {
    selectedTrackIndex = Math.max(0, Math.min(tracks.length - 1, selectedTrackIndex));
  } else {
    selectedTrackIndex = 0;
  }

  applyMixer(tracks);

  if (patLenInput) {
    const len16 = Number(instance.len16 ?? pat.len16);
    if (Number.isFinite(len16) && len16 > 0) {
      patLenInput.value = String(len16);
    }
  }

  refreshPatternSelect();

  if (!tracks.length) {
    refreshTrackSelect(trackSel, tracks, selectedTrackIndex);
    if (trackSel) trackSel.value = '';
    renderParamsPanel();
    return;
  }

  refreshAndSelect(selectedTrackIndex);
}

function ensureChainPosition() {
  if (!Array.isArray(song.chain)) song.chain = [];
  if (!song.chain.length) {
    song.chainPos = 0;
    return;
  }
  const max = song.chain.length - 1;
  if (song.chainPos > max) song.chainPos = max;
  if (song.chainPos < 0) song.chainPos = 0;
}

function renderChain() {
  ensureChainPosition();

  if (!chainView) return;
  chainView.innerHTML = '';

  const total = song.chain.length;
  if (!total) {
    if (chainStatus) chainStatus.textContent = 'Chain empty';
    if (chainPrevBtn) chainPrevBtn.disabled = true;
    if (chainNextBtn) chainNextBtn.disabled = true;
    if (chainClearBtn) chainClearBtn.disabled = true;
    if (followChainToggle) followChainToggle.checked = !!song.followChain;
    if (loopChainToggle) loopChainToggle.checked = !!song.loopChain;
    return;
  }

  const frag = document.createDocumentFragment();
  song.chain.forEach((slot, index) => {
    if (!slot || typeof slot !== 'object') {
      slot = song.chain[index] = { pattern: clampPatternIndex(0), repeats: 1 };
    }

    const patIndex = clampPatternIndex(slot.pattern ?? 0);
    song.chain[index].pattern = patIndex;
    const repeats = Math.max(1, slot.repeats ?? 1);
    song.chain[index].repeats = repeats;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle' + (index === song.chainPos ? ' active' : '');

    const label = document.createElement('span');
    const pat = song.patterns[patIndex];
    const displayName = pat?.name ? `${patIndex + 1}. ${pat.name}` : `${patIndex + 1}. Pattern`;
    label.textContent = displayName;

    const rep = document.createElement('span');
    rep.className = 'rep';
    rep.textContent = `×${repeats}`;

    btn.appendChild(label);
    btn.appendChild(rep);
    btn.onclick = () => gotoChainSlot(index);
    frag.appendChild(btn);
  });

  chainView.appendChild(frag);

  if (chainPrevBtn) chainPrevBtn.disabled = !song.loopChain && song.chainPos <= 0;
  if (chainNextBtn) chainNextBtn.disabled = !song.loopChain && song.chainPos >= total - 1;
  if (chainClearBtn) chainClearBtn.disabled = false;
  if (followChainToggle) followChainToggle.checked = !!song.followChain;
  if (loopChainToggle) loopChainToggle.checked = !!song.loopChain;

  const statusParts = [`Slot ${song.chainPos + 1}/${total}`];
  if (song.followChain) statusParts.push('Auto');
  if (song.loopChain) statusParts.push('Loop');
  if (chainStatus) chainStatus.textContent = statusParts.join(' • ');
}

function getSlotRepeatCount(slot) {
  const rawRepeats = Number(slot?.repeats);
  if (!Number.isFinite(rawRepeats) || rawRepeats <= 0) return 1;
  return Math.floor(rawRepeats);
}

function gotoChainSlot(slotIndex) {
  saveCurrentPattern();

  if (!Array.isArray(song.chain) || !song.chain.length) {
    ensureChainPosition();
    song.chainRepeatsLeft = 0;
    renderChain();
    return;
  }

  const total = song.chain.length;
  let targetIndex = slotIndex | 0;
  if (song.loopChain && total > 0) {
    targetIndex %= total;
    if (targetIndex < 0) targetIndex += total;
  }

  const clamped = Math.max(0, Math.min(total - 1, targetIndex));
  song.chainPos = clamped;

  const slot = song.chain[clamped];
  song.chainRepeatsLeft = getSlotRepeatCount(slot);

  if (!song.patterns.length) {
    renderChain();
    return;
  }

  const patIndex = clampPatternIndex(slot?.pattern ?? 0);
  song.current = patIndex;
  loadPattern(patIndex);
}

function refreshPatternSelect() {
  patternSel.innerHTML = '';
  song.patterns.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i+1}. ${p.name || 'Pattern'}`;
    patternSel.appendChild(opt);
  });
  if (song.patterns.length) {
    const current = clampPatternIndex(song.current);
    song.current = current;
    patternSel.value = String(current);
  } else {
    song.current = 0;
    patternSel.value = '';
  }
  renderChain();
}

if (patternSel) patternSel.onchange = () => {
  saveCurrentPattern();
  if (!song.patterns.length) {
    refreshPatternSelect();
    return;
  }

  const selected = clampPatternIndex(patternSel.value);
  song.current = selected;
  loadPattern(selected);
  saveProjectToStorage();
};

if (addPatternBtn) addPatternBtn.onclick = () => {
  saveCurrentPattern();

  const nextIndex = song.patterns.length + 1;
  const name = `P${nextIndex}`;
  const requestedLen = Number(patLenInput?.value);
  const patternLen = Number.isFinite(requestedLen) && requestedLen > 0
    ? requestedLen
    : 16;
  const serialized = serializePattern(name, tracks, patternLen);
  song.patterns.push(serialized);
  song.current = song.patterns.length - 1;
  loadPattern(song.current);
  saveProjectToStorage();
};

if (dupPatternBtn) dupPatternBtn.onclick = () => {
  saveCurrentPattern();
  if (!song.patterns.length) return;

  const selected = Number(patternSel?.value);
  const baseIndex = (patternSel?.value === '' || Number.isNaN(selected))
    ? song.current
    : selected;
  const patIndex = clampPatternIndex(baseIndex);
  const source = song.patterns[patIndex];
  if (!source) return;

  const clone = clonePatternData(source);
  if (!clone || typeof clone !== 'object') return;

  clone.name = `P${song.patterns.length + 1}`;
  song.patterns.push(clone);
  song.current = song.patterns.length - 1;
  loadPattern(song.current);
  saveProjectToStorage();
};

if (chainAddBtn) chainAddBtn.onclick = () => {
  saveCurrentPattern();
  if (!song.patterns.length) return;
  const selected = Number.parseInt(patternSel?.value ?? '', 10);
  const target = Number.isNaN(selected) ? song.current : selected;
  const patIndex = clampPatternIndex(target);
  song.chain.push({ pattern: patIndex, repeats: 1 });
  renderChain();
  saveProjectToStorage();
};

if (chainClearBtn) chainClearBtn.onclick = () => {
  if (!song.chain.length) return;
  song.chain.length = 0;
  song.chainPos = 0;
  song.chainRepeatsLeft = 0;
  renderChain();
  saveProjectToStorage();
};

if (chainPrevBtn) chainPrevBtn.onclick = () => {
  if (!song.chain.length) return;
  gotoChainSlot(song.chainPos - 1);
};

if (chainNextBtn) chainNextBtn.onclick = () => {
  if (!song.chain.length) return;
  gotoChainSlot(song.chainPos + 1);
};

if (followChainToggle) followChainToggle.onchange = () => {
  song.followChain = followChainToggle.checked;
  if (song.followChain) {
    const slot = Array.isArray(song.chain) ? song.chain[song.chainPos] : null;
    song.chainRepeatsLeft = getSlotRepeatCount(slot);
  } else {
    song.chainRepeatsLeft = 0;
  }
  renderChain();
  saveProjectToStorage();
};

if (loopChainToggle) loopChainToggle.onchange = () => {
  song.loopChain = loopChainToggle.checked;
  renderChain();
  saveProjectToStorage();
};

renderChain();

/* ---------- Project I/O ---------- */
function downloadProjectJSON() {
  const data = serializeProject();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kj-project-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

if (saveProjectBtn) saveProjectBtn.onclick = () => {
  downloadProjectJSON();
};

if (loadProjectBtn) loadProjectBtn.onclick = () => {
  loadProjectInput?.click();
};

if (loadProjectInput) {
  loadProjectInput.onchange = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      applyProjectData(parsed);
      saveProjectToStorage();
    } catch (err) {
      console.error('Failed to load project file', err);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('Unable to load project JSON.');
      }
    } finally {
      loadProjectInput.value = '';
    }
  };
}

if (resetProjectBtn) resetProjectBtn.onclick = () => {
  stopHandle && stopHandle();
  stopHandle = null;
  currentStepIntervalMs = 0;
  clearPendingDelayTriggers();
  for (const t of tracks) t.pos = -1;
  paintPlayhead();
  applyProjectData(createDefaultProject());
  clearProjectStorage();
  saveProjectToStorage();
};

/* ---------- Transport ---------- */
function mergeParamOffsets(target, offsets) {
  if (!target || !offsets) return null;
  const history = [];

  const visit = (obj, off) => {
    if (!obj || !off) return;
    for (const [key, value] of Object.entries(off)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (obj[key] && typeof obj[key] === 'object') visit(obj[key], value);
        continue;
      }
      if (!Number.isFinite(value) || value === 0) continue;
      if (typeof obj[key] !== 'number') continue;
      history.push({ obj, key, prev: obj[key] });
      obj[key] = obj[key] + value;
    }
  };

  visit(target, offsets);
  if (!history.length) return null;

  return () => {
    for (let i = history.length - 1; i >= 0; i--) {
      const { obj, key, prev } = history[i];
      if (obj) obj[key] = prev;
    }
  };
}

function clearPendingDelayTriggers() {
  // Placeholder for any pending scheduling cleanup.
}

function scheduleDelayedTrigger(track, velocity, delayMs, scheduledTime, pitch = 0) {
  const vel = Number(velocity);
  const ms = Number(delayMs);
  if (!Number.isFinite(vel) || vel <= 0) return;
  if (!Number.isFinite(ms) || ms <= 0) return;
  const clampedVel = Math.max(0, Math.min(1, vel));
  if (clampedVel <= 0) return;
  const baseTime = Number.isFinite(scheduledTime) ? scheduledTime : ctx.currentTime;
  const startTime = baseTime + (ms / 1000);
  if (!track) return;
  triggerEngine?.(track, clampedVel, Number.isFinite(pitch) ? pitch : 0, startTime);
}

function resolveDelayConfig(baseConfig = {}, offsets) {
  const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DELAY] || {};
  const resolved = { ...defaults, ...(baseConfig && typeof baseConfig === 'object' ? baseConfig : {}) };
  const offsetSource = offsets && typeof offsets === 'object'
    ? (offsets.config && typeof offsets.config === 'object' ? offsets.config : offsets)
    : null;

  if (offsetSource) {
    const apply = (key) => {
      const delta = Number(offsetSource[key]);
      if (Number.isFinite(delta)) {
        const current = resolved[key];
        resolved[key] = Number.isFinite(current) ? current + delta : delta;
      }
    };
    apply('mix');
    apply('feedback');
    apply('spacing');
    apply('repeats');
  }

  const clamp = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  const mix = clamp(resolved.mix, 0, 1, defaults.mix ?? 0.5);
  const feedback = clamp(resolved.feedback, 0, 0.95, defaults.feedback ?? 0.45);
  const spacing = clamp(resolved.spacing, 0.05, 4, defaults.spacing ?? 0.5);
  const repeatsRaw = Number(resolved.repeats);
  const repeatsNormalized = Number.isFinite(repeatsRaw) ? Math.round(repeatsRaw) : (defaults.repeats ?? 0);
  const repeats = Math.max(0, Math.min(8, repeatsNormalized));

  return { mix, feedback, spacing, repeats };
}

function resolveDuckingConfig(baseConfig = {}, offsets) {
  const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DUCK] || {};
  const resolved = { ...defaults, ...(baseConfig && typeof baseConfig === 'object' ? baseConfig : {}) };
  const offsetSource = offsets && typeof offsets === 'object'
    ? (offsets.config && typeof offsets.config === 'object' ? offsets.config : offsets)
    : null;

  if (offsetSource) {
    const apply = (key) => {
      const delta = Number(offsetSource[key]);
      if (Number.isFinite(delta)) {
        const current = resolved[key];
        resolved[key] = Number.isFinite(current) ? current + delta : delta;
      }
    };
    apply('depthDb');
    apply('attack');
    apply('hold');
    apply('release');
  }

  const clamp = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  const depthDb = clamp(resolved.depthDb, 0, 36, defaults.depthDb ?? 12);
  const attack = clamp(resolved.attack, 0, 4, defaults.attack ?? 0.05);
  const hold = clamp(resolved.hold, 0, 8, defaults.hold ?? 0.2);
  const release = clamp(resolved.release, 0, 8, defaults.release ?? 0.3);
  const includeSelf = resolved.includeSelf === true;

  return { depthDb, attack, hold, release, includeSelf };
}

function resolveMultibandDuckingConfig(baseConfig = {}, offsets) {
  const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.MULTIBAND_DUCK] || {};
  const resolved = { ...defaults, ...(baseConfig && typeof baseConfig === 'object' ? baseConfig : {}) };
  const offsetSource = offsets && typeof offsets === 'object'
    ? (offsets.config && typeof offsets.config === 'object' ? offsets.config : offsets)
    : null;

  if (offsetSource) {
    const apply = (key) => {
      const delta = Number(offsetSource[key]);
      if (Number.isFinite(delta)) {
        const current = resolved[key];
        resolved[key] = Number.isFinite(current) ? current + delta : delta;
      }
    };
    apply('lowDepthDb');
    apply('midDepthDb');
    apply('highDepthDb');
    apply('attack');
    apply('hold');
    apply('release');
  }

  const clamp = (value, min, max, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };

  const lowDepthDb = clamp(resolved.lowDepthDb, 0, 36, defaults.lowDepthDb ?? 14);
  const midDepthDb = clamp(resolved.midDepthDb, 0, 36, defaults.midDepthDb ?? 8);
  const highDepthDb = clamp(resolved.highDepthDb, 0, 36, defaults.highDepthDb ?? 4);
  const attack = clamp(resolved.attack, 0, 4, defaults.attack ?? 0.05);
  const hold = clamp(resolved.hold, 0, 8, defaults.hold ?? 0.2);
  const release = clamp(resolved.release, 0, 8, defaults.release ?? 0.3);
  const includeSelf = resolved.includeSelf === true;

  return { lowDepthDb, midDepthDb, highDepthDb, attack, hold, release, includeSelf };
}

function scheduleEnvelope(param, startValue, targetValue, attackSec, holdSec, releaseSec, startTime) {
  if (!param || !Number.isFinite(startTime)) return;
  const safeAttack = Math.max(0, Number(attackSec) || 0);
  const safeHold = Math.max(0, Number(holdSec) || 0);
  const safeRelease = Math.max(0, Number(releaseSec) || 0);
  const attackEnd = startTime + safeAttack;
  const holdEnd = attackEnd + safeHold;
  const releaseEnd = holdEnd + safeRelease;

  try { param.cancelScheduledValues(startTime); } catch {}
  try { param.setValueAtTime(startValue, startTime); } catch {}
  try { param.linearRampToValueAtTime(targetValue, attackEnd); } catch {}
  try { param.linearRampToValueAtTime(targetValue, holdEnd); } catch {}
  try { param.linearRampToValueAtTime(startValue, releaseEnd); } catch {}
}

function scheduleDucking(tracks, sourceTrack, config, scheduledTime) {
  if (!Array.isArray(tracks) || !tracks.length) return;
  if (!Number.isFinite(currentStepIntervalMs) || currentStepIntervalMs <= 0) return;
  if (!config || typeof config !== 'object') return;

  const stepSeconds = currentStepIntervalMs / 1000;
  const attackSec = (Number(config.attack) || 0) * stepSeconds;
  const holdSec = (Number(config.hold) || 0) * stepSeconds;
  const releaseSec = (Number(config.release) || 0) * stepSeconds;
  const startTime = Number.isFinite(scheduledTime) ? scheduledTime : ctx.currentTime;

  if (config.depthDb <= 0 || (!attackSec && !holdSec && !releaseSec)) return;
  const targetGain = Math.pow(10, -config.depthDb / 20);

  if (!sourceTrack) return;
  const duckGain = sourceTrack.duckGainNode?.gain;
  if (!duckGain) return;
  scheduleEnvelope(duckGain, 1, targetGain, attackSec, holdSec, releaseSec, startTime);
}

function scheduleMultibandDucking(tracks, sourceTrack, config, scheduledTime) {
  if (!Array.isArray(tracks) || !tracks.length) return;
  if (!Number.isFinite(currentStepIntervalMs) || currentStepIntervalMs <= 0) return;
  if (!config || typeof config !== 'object') return;

  const stepSeconds = currentStepIntervalMs / 1000;
  const attackSec = (Number(config.attack) || 0) * stepSeconds;
  const holdSec = (Number(config.hold) || 0) * stepSeconds;
  const releaseSec = (Number(config.release) || 0) * stepSeconds;
  const startTime = Number.isFinite(scheduledTime) ? scheduledTime : ctx.currentTime;

  const lowDb = -Math.max(0, Number(config.lowDepthDb) || 0);
  const midDb = -Math.max(0, Number(config.midDepthDb) || 0);
  const highDb = -Math.max(0, Number(config.highDepthDb) || 0);
  if ((!lowDb && !midDb && !highDb) || (!attackSec && !holdSec && !releaseSec)) return;

  if (!sourceTrack) return;
  const filters = sourceTrack.duckFilters;
  if (!filters) return;
  if (filters.low?.gain) {
    scheduleEnvelope(filters.low.gain, 0, lowDb, attackSec, holdSec, releaseSec, startTime);
  }
  if (filters.mid?.gain) {
    scheduleEnvelope(filters.mid.gain, 0, midDb, attackSec, holdSec, releaseSec, startTime);
  }
  if (filters.high?.gain) {
    scheduleEnvelope(filters.high.gain, 0, highDb, attackSec, holdSec, releaseSec, startTime);
  }
}

function evaluateDelayStepFx(track, step, baseConfig, offsets, scheduledTime, notes, baseVelocityOverride) {
  if (!track || !step) return null;
  if (!Number.isFinite(currentStepIntervalMs) || currentStepIntervalMs <= 0) return null;

  const config = resolveDelayConfig(baseConfig, offsets);
  if (config.repeats <= 0) return null;

  const noteEvents = Array.isArray(notes) ? notes.filter((note) => note && typeof note === 'object') : [];
  if (!noteEvents.length) {
    const fallbackVelocity = Number.isFinite(baseVelocityOverride)
      ? baseVelocityOverride
      : (getStepVelocity?.(step, step.on ? 1 : 0) ?? 0);
    if (fallbackVelocity > 0) noteEvents.push({ vel: fallbackVelocity, pitch: 0 });
  }
  if (!noteEvents.length) return null;

  const stepDuration = currentStepIntervalMs;
  for (const note of noteEvents) {
    const baseVelocity = Number(note.vel);
    if (!Number.isFinite(baseVelocity) || baseVelocity <= 0) continue;
    const wetLevel = baseVelocity * config.mix;
    if (wetLevel <= 0) continue;
    const pitch = Number(note.pitch);
    const resolvedPitch = Number.isFinite(pitch) ? pitch : 0;
    for (let i = 0; i < config.repeats; i++) {
      const repeatVelocity = wetLevel * Math.pow(config.feedback, i);
      if (repeatVelocity <= 0.0001) break;
      const delayMs = stepDuration * config.spacing * (i + 1);
      if (!Number.isFinite(delayMs) || delayMs <= 0) continue;
      scheduleDelayedTrigger(track, repeatVelocity, delayMs, scheduledTime, resolvedPitch);
    }
  }

  return null;
}

function evaluateStepFx(track, step, stepIndex, effectOffsets, scheduledTime, allTracks, notes, baseVelocityOverride) {
  if (!track || !step || !step.fx || typeof step.fx !== 'object') return null;
  const rawType = typeof step.fx.type === 'string' ? step.fx.type.trim().toLowerCase() : '';
  if (!rawType || rawType === 'none' || rawType === STEP_FX_TYPES.NONE) return null;

  const offsets = effectOffsets && typeof effectOffsets === 'object'
    ? (effectOffsets[rawType] || effectOffsets[STEP_FX_TYPES.DELAY])
    : null;

  if (rawType === STEP_FX_TYPES.DELAY) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DELAY] || {};
    const baseConfig = { ...defaults, ...(step.fx.config && typeof step.fx.config === 'object' ? step.fx.config : {}) };
    return evaluateDelayStepFx(track, step, baseConfig, offsets, scheduledTime, notes, baseVelocityOverride);
  }
  if (rawType === STEP_FX_TYPES.DUCK) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DUCK] || {};
    const baseConfig = { ...defaults, ...(step.fx.config && typeof step.fx.config === 'object' ? step.fx.config : {}) };
    const config = resolveDuckingConfig(baseConfig, offsets);
    scheduleDucking(allTracks, track, config, scheduledTime);
    return null;
  }
  if (rawType === STEP_FX_TYPES.MULTIBAND_DUCK) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.MULTIBAND_DUCK] || {};
    const baseConfig = { ...defaults, ...(step.fx.config && typeof step.fx.config === 'object' ? step.fx.config : {}) };
    const config = resolveMultibandDuckingConfig(baseConfig, offsets);
    scheduleMultibandDucking(allTracks, track, config, scheduledTime);
    return null;
  }

  return null;
}

let stopHandle = null;

playBtn.onclick = async () => {
  await ensureAudioReady();
  const bpm = Math.min(300, Math.max(40, Number(tempoInput?.value) || 120));
  currentStepIntervalMs = 60000 / (bpm * 4);
  startTransport(bpm, (stepIndex, scheduledTime) => {
    applyMixer?.(tracks);
    const secondsPerBeat = 60 / bpm;
    const stepSeconds = secondsPerBeat / 4;
    const elapsedSeconds = stepIndex * stepSeconds;
    const prevElapsedSeconds = (stepIndex - 1) * stepSeconds;

    let patternCompleted = false;
    const anchorTrack = tracks.length ? tracks[0] : null;

    for (const _t of tracks) {
      const t = normalizeTrack(_t);
      const L = t.length;
      const previousPos = Number.isInteger(t.pos) ? t.pos : -1;
      t.pos = L > 0 ? (stepIndex % L) : 0;

      if (!patternCompleted && anchorTrack && _t === anchorTrack && L > 0 && t.pos === 0 && previousPos >= 0) {
        patternCompleted = true;
      }

      const restoreStack = [];
      const modResult = applyMods?.(t);
      let paramOffsets = null;
      let effectOffsets = null;
      let noteOffsets = null;
      if (modResult && typeof modResult === 'object' && (modResult.params || modResult.effects || modResult.notes || 'params' in modResult || 'effects' in modResult || 'notes' in modResult)) {
        if (modResult.params && typeof modResult.params === 'object') {
          paramOffsets = modResult.params;
        }
        if (modResult.effects && typeof modResult.effects === 'object') {
          effectOffsets = modResult.effects;
        }
        if (modResult.notes && typeof modResult.notes === 'object') {
          noteOffsets = modResult.notes;
        }
      } else if (modResult) {
        paramOffsets = modResult;
      }
      if (paramOffsets) {
        const restore = mergeParamOffsets(t.params, paramOffsets);
        if (typeof restore === 'function') restoreStack.push(restore);
      }

      try {
        if (t.type === 'cvl') {
          const trackLengthBeats = Math.max(0, t.length / 4);
          if (trackLengthBeats > 0 && Array.isArray(t.cvl?.clips) && t.cvl.clips.length) {
            const rateBeats = getCvlRateBeats(t.cvl?.scrubberRate);
            const rateSeconds = rateBeats * secondsPerBeat;
            const scrubberPhase = rateSeconds > 0 ? (elapsedSeconds / rateSeconds) % 1 : 0;
            const depth = Number.isFinite(t.cvl?.scrubberDepth) ? t.cvl.scrubberDepth : 0;
            const offsetBeats = (scrubberPhase * 2 - 1) * depth * trackLengthBeats;
            const baseBeat = t.pos >= 0 ? t.pos / 4 : 0;
            const modulatedBeat = Math.max(0, Math.min(trackLengthBeats, baseBeat + offsetBeats));

            let prevModulatedBeat = null;
            if (previousPos >= 0 && rateSeconds > 0 && stepIndex > 0) {
              const prevPhase = (prevElapsedSeconds / rateSeconds) % 1;
              const prevOffset = (prevPhase * 2 - 1) * depth * trackLengthBeats;
              const prevBaseBeat = previousPos / 4;
              prevModulatedBeat = Math.max(0, Math.min(trackLengthBeats, prevBaseBeat + prevOffset));
            }

            const clips = t.cvl.clips;
            for (const clip of clips) {
              if (!clip || typeof clip !== 'object') continue;
              const clipStart = Number(clip.start);
              const clipLength = Number(clip.length);
              if (!Number.isFinite(clipStart) || !Number.isFinite(clipLength) || clipLength <= 0) continue;
              const clipEnd = clipStart + clipLength;
              const insideNow = modulatedBeat >= clipStart && modulatedBeat < clipEnd;
              const insidePrev = prevModulatedBeat !== null
                ? prevModulatedBeat >= clipStart && prevModulatedBeat < clipEnd
                : false;
              if (!insideNow || insidePrev) continue;
              const sampleName = typeof clip.sampleName === 'string' ? clip.sampleName : '';
              const buffer = sampleName ? sampleCache[sampleName] : null;
              if (!buffer) continue;
              const previousSample = t.sample;
              t.sample = { buffer, name: sampleName };
              const durationSec = clipLength * secondsPerBeat;
              triggerEngine?.(t, 1, 0, scheduledTime, durationSec);
              t.sample = previousSample;
            }
          }
        } else if (t.mode === 'piano') {
          const notes = notesStartingAt?.(t, t.pos) || [];
          const notesWithOffsets = noteOffsets ? applyNoteOffsets(notes, noteOffsets, t.length) : notes;
          const columnStep = t.steps?.[t.pos];
          const columnVelocity = notesWithOffsets.length
            ? Math.max(...notesWithOffsets.map((note) => Number.isFinite(note?.vel) ? note.vel : 0))
            : 0;
          const fxResult = columnStep
            ? evaluateStepFx(t, columnStep, t.pos, effectOffsets, scheduledTime, tracks, notesWithOffsets, columnVelocity)
            : null;
          const velocityOffset = fxResult && typeof fxResult === 'object' && Number.isFinite(fxResult.velocityOffset)
            ? fxResult.velocityOffset
            : 0;
          if (t.arp?.enabled && notesWithOffsets.length) {
            const rate = Math.max(1, Math.round(Number(t.arp.rate) || 1));
            const gate = Math.max(0.05, Math.min(1, Number(t.arp.gate) || 1));
            const sliceSec = Math.max(0.001, currentStepIntervalMs / 1000);
            const interval = sliceSec / rate;
            const arpNotes = buildArpNotes(notesWithOffsets, t.arp);
            if (arpNotes.length) {
              for (let i = 0; i < rate; i++) {
                const note = arpNotes[i % arpNotes.length];
                if (!noteChanceAllows(note)) continue;
                const time = scheduledTime + i * interval;
                const duration = interval * gate;
                let vel = (Number.isFinite(note.vel) ? note.vel : 1) + velocityOffset;
                vel = Math.max(0, Math.min(1, vel));
                if (vel > 0) triggerEngine?.(t, vel, note.pitch, time, duration);
              }
            }
          } else {
            const stepSeconds = Number.isFinite(currentStepIntervalMs)
              ? Math.max(0.001, currentStepIntervalMs / 1000)
              : null;
            for (const n of notesWithOffsets) {
              if (!noteChanceAllows(n)) continue;
              let vel = (Number.isFinite(n?.vel) ? n.vel : 1) + velocityOffset;
              vel = Math.max(0, Math.min(1, vel));
              const gateSec = stepSeconds && Number.isFinite(n?.length)
                ? Math.max(0.01, n.length * stepSeconds)
                : undefined;
              if (vel > 0) triggerEngine?.(t, vel, n.pitch, scheduledTime, gateSec);
            }
          }
        } else {
          const st = t.steps[t.pos];
          if (st?.on) {
            const stepNotes = [{ vel: getStepVelocity(st, 1), pitch: 0 }];
            const fxResult = evaluateStepFx(t, st, t.pos, effectOffsets, scheduledTime, tracks, stepNotes, stepNotes[0].vel);
            let vel = getStepVelocity(st, 1);
            if (fxResult && typeof fxResult === 'object') {
              if (Number.isFinite(fxResult.velocityOffset)) {
                vel += fxResult.velocityOffset;
              }
            }
            vel = Math.max(0, Math.min(1, vel));
            if (vel > 0) triggerEngine?.(t, vel, 0, scheduledTime);
          }
        }
      } finally {
        for (let i = restoreStack.length - 1; i >= 0; i--) {
          const restore = restoreStack[i];
          if (typeof restore === 'function') restore();
        }
      }
    }
    paintPlayhead();

    if (patternCompleted && song.followChain && Array.isArray(song.chain) && song.chain.length) {
      if (!Number.isFinite(song.chainRepeatsLeft) || song.chainRepeatsLeft <= 0) {
        const slot = song.chain[song.chainPos];
        song.chainRepeatsLeft = getSlotRepeatCount(slot);
      }

      song.chainRepeatsLeft -= 1;

      if (song.chainRepeatsLeft <= 0) {
        gotoChainSlot(song.chainPos + 1);
        renderChain();
      }
    }
  });
  stopHandle = () => {
    stopTransport();
    currentStepIntervalMs = 0;
    clearPendingDelayTriggers();
  };
};

stopBtn.onclick = () => {
  stopHandle && stopHandle();
  stopHandle = null;
  currentStepIntervalMs = 0;
  clearPendingDelayTriggers();
  for (const t of tracks) t.pos = -1;
  paintPlayhead();
};

/* ---------- Boot ---------- */
const defaultProject = createDefaultProject();
applyProjectData(defaultProject);
loadProjectFromStorage();
