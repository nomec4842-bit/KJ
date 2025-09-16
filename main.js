// main.js
import { ctx, startTransport, stopTransport } from './core.js';
import {
  createTrack, triggerEngine, applyMixer, resizeTrackSteps,
  notesStartingAt
} from './tracks.js';
import { applyMods } from './mods.js';
import { createGrid } from './sequencer.js';
import { createPianoRoll } from './pianoroll.js';
import { refreshTrackSelect, renderParams, makeField } from './ui.js';
import { serializePattern, instantiatePattern, clonePatternData } from './patterns.js';

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

const chainAddBtn      = document.getElementById('chainAdd');
const chainClearBtn    = document.getElementById('chainClear');
const chainPrevBtn     = document.getElementById('chainPrev');
const chainNextBtn     = document.getElementById('chainNext');
const followChainToggle = document.getElementById('followChain');
const chainView        = document.getElementById('chainView');
const chainStatus      = document.getElementById('chainStatus');

const togglePiano  = document.getElementById('togglePiano');
const playBtn      = document.getElementById('play');
const stopBtn      = document.getElementById('stop');

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
  followChain: false
};

/* ---------- Track Normalization ---------- */
function normalizeTrack(t) {
  if (!t) return t;
  t.name   = t.name   ?? 'Track';
  t.mode   = t.mode   ?? 'steps';
  t.length = Math.max(1, (t.length ?? 16)|0);
  t.pos    = Number.isInteger(t.pos) ? t.pos : -1;

  // only initialize steps ONCE
  if (!Array.isArray(t.steps) || t.steps.length !== t.length) {
    t.steps = Array.from({ length: t.length }, () => ({ on:false, vel:0 }));
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
    const st = currentTrack().steps[i];
    st.on = !st.on;
    st.vel = st.on ? 1 : 0;
    renderCurrentEditor();
  }
);

const piano = createPianoRoll(seqEl, () => currentTrack(), () => renderCurrentEditor());

function showEditorForTrack(){
  const t = currentTrack();
  if (t.mode === 'piano') piano.setLength(t.length);
  else stepGrid.setLength(t.length);
  renderCurrentEditor();
}
function renderCurrentEditor(){
  const t = currentTrack();
  if (t.mode === 'piano') piano.update();
  else stepGrid.update((i)=>t.steps[i]);
}
function paintPlayhead(){
  const t = currentTrack();
  if (t.mode === 'piano') piano.paint(t.pos);
  else stepGrid.paint(t.pos);
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
}

function renderParamsPanel(){
  const binder = renderParams(paramsEl, currentTrack(), makeField);
  binder({
    applyMixer: () => applyMixer(tracks),
    t: currentTrack(),
    onStepsChange: (newLen) => {
      resizeTrackSteps(currentTrack(), newLen);
      normalizeTrack(currentTrack());
      showEditorForTrack();
      paintPlayhead();
    },
    onSampleFile,
  });
}
function refreshAndSelect(i = selectedTrackIndex){
  normalizeTrack(currentTrack());
  refreshTrackSelect(trackSel, tracks, i);
  engineSel.value = currentTrack().engine;
  togglePiano.checked = currentTrack().mode === 'piano';
  showEditorForTrack();
  renderParamsPanel();
}

trackSel.onchange = () => {
  selectedTrackIndex = parseInt(trackSel.value, 10);
  refreshAndSelect(selectedTrackIndex);
};

engineSel.onchange = () => {
  currentTrack().engine = engineSel.value;
  refreshAndSelect(selectedTrackIndex);
};

togglePiano.onchange = () => {
  currentTrack().mode = togglePiano.checked ? 'piano' : 'steps';
  showEditorForTrack();
  paintPlayhead();
};

addTrackBtn.onclick = () => {
  const eng = engineSel.value || 'synth';
  const name = `Track ${tracks.length + 1}`;
  tracks.push(normalizeTrack(createTrack(name, eng, 16)));
  selectedTrackIndex = tracks.length - 1;
  applyMixer(tracks);
  refreshAndSelect(selectedTrackIndex);
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

  if (chainPrevBtn) chainPrevBtn.disabled = song.chainPos <= 0;
  if (chainNextBtn) chainNextBtn.disabled = song.chainPos >= total - 1;
  if (chainClearBtn) chainClearBtn.disabled = false;
  if (followChainToggle) followChainToggle.checked = !!song.followChain;

  const statusParts = [`Slot ${song.chainPos + 1}/${total}`];
  if (song.followChain) statusParts.push('Auto');
  if (chainStatus) chainStatus.textContent = statusParts.join(' • ');
}

function gotoChainSlot(slotIndex) {
  saveCurrentPattern();

  if (!Array.isArray(song.chain) || !song.chain.length) {
    ensureChainPosition();
    renderChain();
    return;
  }

  const clamped = Math.max(0, Math.min(song.chain.length - 1, slotIndex|0));
  if (!song.patterns.length) {
    song.chainPos = clamped;
    renderChain();
    return;
  }

  song.chainPos = clamped;
  const slot = song.chain[clamped];
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
};

if (chainAddBtn) chainAddBtn.onclick = () => {
  saveCurrentPattern();
  if (!song.patterns.length) return;
  const selected = Number.parseInt(patternSel?.value ?? '', 10);
  const target = Number.isNaN(selected) ? song.current : selected;
  const patIndex = clampPatternIndex(target);
  song.chain.push({ pattern: patIndex, repeats: 1 });
  renderChain();
};

if (chainClearBtn) chainClearBtn.onclick = () => {
  if (!song.chain.length) return;
  song.chain.length = 0;
  song.chainPos = 0;
  renderChain();
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
  renderChain();
};

renderChain();

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

function startScheduler(bpm, cb) {
  const interval = 60000 / (bpm * 4);
  let next = performance.now();
  let alive = true;
  function loop() {
    if (!alive) return;
    const now = performance.now();
    if (now >= next) {
      next += interval;
      cb();
      while (now > next + interval) next += interval;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return () => { alive = false; };
}

let stopHandle = null;

playBtn.onclick = async () => {
  await ctx.resume();
  const bpm = Math.min(300, Math.max(40, Number(tempoInput?.value) || 120));
  stopHandle = startScheduler(bpm, () => {
    applyMixer?.(tracks);

    for (const _t of tracks) {
      const t = normalizeTrack(_t);
      const L = t.length;
      t.pos = ((t.pos|0) + 1) % L;

      const offsets = applyMods?.(t);
      const restoreParams = offsets ? mergeParamOffsets(t.params, offsets) : null;

      try {
        if (t.mode === 'piano') {
          const notes = notesStartingAt?.(t, t.pos) || [];
          for (const n of notes) triggerEngine?.(t, n.vel ?? 1, n.pitch);
        } else {
          const st = t.steps[t.pos];
          if (st?.on) triggerEngine?.(t, st.vel);
        }
      } finally {
        if (typeof restoreParams === 'function') restoreParams();
      }
    }
    paintPlayhead();
  });
};

stopBtn.onclick = () => {
  stopHandle && stopHandle();
  stopHandle = null;
  for (const t of tracks) t.pos = -1;
  paintPlayhead();
};

/* ---------- Boot ---------- */
tracks.push(normalizeTrack(createTrack('Kick','kick808',16)));
tracks.push(normalizeTrack(createTrack('Hat','hat808',16)));
tracks.push(normalizeTrack(createTrack('Snare','snare808',16)));
selectedTrackIndex = 0;

song.patterns.push(serializePattern('P1', tracks, 16));
song.current = 0;

refreshAndSelect(selectedTrackIndex);
refreshPatternSelect();
