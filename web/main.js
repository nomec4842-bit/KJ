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
import { refreshTrackSelect, renderParams, makeField } from './ui.js';
import { serializePattern, instantiatePattern, clonePatternData } from './patterns.js';

await dspReady;

/* ---------- DOM ---------- */
const tempoInput   = document.getElementById('tempo');
const trackSel     = document.getElementById('trackSelect');
const addTrackBtn  = document.getElementById('addTrack');
const engineSel    = document.getElementById('engine');
const seqEl        = document.getElementById('sequencer');
const paramsEl     = document.getElementById('params');

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

function shuffleArray(source) {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildArpNotes(notes, arp) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const octaves = Math.max(1, Number(arp?.octaves) || 1);
  const base = notes.map(n => ({ pitch: n.pitch, vel: n.vel ?? 1 }));
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

  const storedSelection = Number.isInteger(t.selectedStep) ? t.selectedStep : -1;
  if (storedSelection >= 0 && storedSelection < t.length) {
    t.selectedStep = storedSelection;
  } else if (storedSelection >= t.length && t.length > 0) {
    t.selectedStep = t.length - 1;
  } else {
    t.selectedStep = -1;
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

const piano = createPianoRoll(seqEl, () => currentTrack(), () => renderCurrentEditor());

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
  if (!track || track.mode !== 'steps') {
    if (stepGrid && typeof stepGrid.select === 'function') {
      stepGrid.select(-1);
    }
    updateInlineStepSelection(-1);
    return;
  }
  const selectedIndex = getTrackSelectedStep(track);
  if (stepGrid && typeof stepGrid.select === 'function') {
    stepGrid.select(selectedIndex);
  }
  updateInlineStepSelection(selectedIndex);
}

function broadcastSelection(track) {
  syncSelectionUI();
  if (!track || track !== currentTrack() || !paramsEl) return;
  const index = getTrackSelectedStep(track);
  const detail = {
    index,
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

function setTrackSelectedStep(track, index, { force = false } = {}) {
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
  broadcastSelection(track);
}

function showEditorForTrack(){
  const t = currentTrack();
  if (!t) {
    syncSelectionUI();
    return;
  }
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

  let arrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    console.error('Failed to read sample file', err);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert('Failed to read the selected audio file.');
    }
    return;
  }

  let buffer;
  try {
    buffer = await new Promise((resolve, reject) => {
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
    return;
  }

  track.sample = { buffer, name: file.name };
  sampleCache[file.name] = buffer;

  if (track === currentTrack()) {
    renderParamsPanel();
  }

  saveProjectToStorage();
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
function refreshAndSelect(i = selectedTrackIndex){
  const track = currentTrack();
  if (track) normalizeTrack(track);
  refreshTrackSelect(trackSel, tracks, i);
  if (track) {
    engineSel.value = track.engine;
    togglePiano.checked = track.mode === 'piano';
  } else {
    engineSel.value = '';
    togglePiano.checked = false;
  }
  showEditorForTrack();
  renderParamsPanel();
}

trackSel.onchange = () => {
  selectedTrackIndex = parseInt(trackSel.value, 10);
  refreshAndSelect(selectedTrackIndex);
  saveProjectToStorage();
};

engineSel.onchange = () => {
  currentTrack().engine = engineSel.value;
  refreshAndSelect(selectedTrackIndex);
  saveProjectToStorage();
};

togglePiano.onchange = () => {
  const track = currentTrack();
  if (!track) return;
  track.mode = togglePiano.checked ? 'piano' : 'steps';
  showEditorForTrack();
  paintPlayhead();
  broadcastSelection(track);
  saveProjectToStorage();
};

addTrackBtn.onclick = () => {
  const eng = engineSel.value || 'synth';
  const name = `Track ${tracks.length + 1}`;
  tracks.push(normalizeTrack(createTrack(name, eng, 16)));
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

function scheduleDelayedTrigger(track, velocity, delayMs, scheduledTime) {
  const vel = Number(velocity);
  const ms = Number(delayMs);
  if (!Number.isFinite(vel) || vel <= 0) return;
  if (!Number.isFinite(ms) || ms <= 0) return;
  const clampedVel = Math.max(0, Math.min(1, vel));
  if (clampedVel <= 0) return;
  const baseTime = Number.isFinite(scheduledTime) ? scheduledTime : ctx.currentTime;
  const startTime = baseTime + (ms / 1000);
  if (!track) return;
  triggerEngine?.(track, clampedVel, 0, startTime);
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

function evaluateDelayStepFx(track, step, baseConfig, offsets, scheduledTime) {
  if (!track || !step) return null;
  if (!Number.isFinite(currentStepIntervalMs) || currentStepIntervalMs <= 0) return null;

  const config = resolveDelayConfig(baseConfig, offsets);
  if (config.repeats <= 0) return null;

  const baseVelocity = getStepVelocity?.(step, step.on ? 1 : 0) ?? 0;
  const wetLevel = baseVelocity * config.mix;
  if (wetLevel <= 0) return null;

  const stepDuration = currentStepIntervalMs;
  for (let i = 0; i < config.repeats; i++) {
    const repeatVelocity = wetLevel * Math.pow(config.feedback, i);
    if (repeatVelocity <= 0.0001) break;
    const delayMs = stepDuration * config.spacing * (i + 1);
    if (!Number.isFinite(delayMs) || delayMs <= 0) continue;
    scheduleDelayedTrigger(track, repeatVelocity, delayMs, scheduledTime);
  }

  return null;
}

function evaluateStepFx(track, step, stepIndex, effectOffsets, scheduledTime, allTracks) {
  if (!track || !step || !step.fx || typeof step.fx !== 'object') return null;
  const rawType = typeof step.fx.type === 'string' ? step.fx.type.trim().toLowerCase() : '';
  if (!rawType || rawType === 'none' || rawType === STEP_FX_TYPES.NONE) return null;

  const offsets = effectOffsets && typeof effectOffsets === 'object'
    ? (effectOffsets[rawType] || effectOffsets[STEP_FX_TYPES.DELAY])
    : null;

  if (rawType === STEP_FX_TYPES.DELAY) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DELAY] || {};
    const baseConfig = { ...defaults, ...(step.fx.config && typeof step.fx.config === 'object' ? step.fx.config : {}) };
    return evaluateDelayStepFx(track, step, baseConfig, offsets, scheduledTime);
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
      if (modResult && typeof modResult === 'object' && (modResult.params || modResult.effects || 'params' in modResult || 'effects' in modResult)) {
        if (modResult.params && typeof modResult.params === 'object') {
          paramOffsets = modResult.params;
        }
        if (modResult.effects && typeof modResult.effects === 'object') {
          effectOffsets = modResult.effects;
        }
      } else if (modResult) {
        paramOffsets = modResult;
      }
      if (paramOffsets) {
        const restore = mergeParamOffsets(t.params, paramOffsets);
        if (typeof restore === 'function') restoreStack.push(restore);
      }

      try {
        if (t.mode === 'piano') {
          const notes = notesStartingAt?.(t, t.pos) || [];
          if (t.arp?.enabled && notes.length) {
            const rate = Math.max(1, Math.round(Number(t.arp.rate) || 1));
            const gate = Math.max(0.05, Math.min(1, Number(t.arp.gate) || 1));
            const sliceSec = Math.max(0.001, currentStepIntervalMs / 1000);
            const interval = sliceSec / rate;
            const arpNotes = buildArpNotes(notes, t.arp);
            if (arpNotes.length) {
              for (let i = 0; i < rate; i++) {
                const note = arpNotes[i % arpNotes.length];
                const time = scheduledTime + i * interval;
                const duration = interval * gate;
                triggerEngine?.(t, note.vel ?? 1, note.pitch, time, duration);
              }
            }
          } else {
            for (const n of notes) triggerEngine?.(t, n.vel ?? 1, n.pitch, scheduledTime);
          }
        } else {
          const st = t.steps[t.pos];
          if (st?.on) {
            const fxResult = evaluateStepFx(t, st, t.pos, effectOffsets, scheduledTime, tracks);
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
