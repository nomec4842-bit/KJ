// main.js
import { ctx, startTransport, stopTransport } from './core.js';
import { createTrack, triggerEngine, applyMixer, resizeTrackSteps } from './tracks.js';
import { createGrid } from './sequencer.js';
import { refreshTrackSelect, renderParams, makeField } from './ui.js';
import { serializePattern, instantiatePattern, clonePatternData } from './patterns.js';

// ----- DOM refs -----
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');
const paramsEl    = document.getElementById('params');

// Pattern/Chain UI refs
const patternSel  = document.getElementById('patternSelect');
const addPatternBtn = document.getElementById('addPattern');
const dupPatternBtn = document.getElementById('dupPattern');
const patLenInput = document.getElementById('patLen');
const chainAddBtn = document.getElementById('chainAdd');
const chainView   = document.getElementById('chainView');
const chainClear  = document.getElementById('chainClear');
const chainPrev   = document.getElementById('chainPrev');
const chainNext   = document.getElementById('chainNext');
const chainStatus = document.getElementById('chainStatus');
const followChain = document.getElementById('followChain');

// ----- App state -----
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {}; 
const song = {
  patterns: [],
  current: 0,
  chain: [],
  chainPos: 0,
};
let patTicksLeft = 16;

// --- Helpers ---
function syncTrackToSelected(t) {
  const baseLen = currentTrack()?.length ?? 16;
  resizeTrackSteps(t, baseLen);
  const selPos = currentTrack()?.pos ?? -1;
  t.pos = selPos >= 0 ? (selPos % t.length) : -1;
}

// Sequencer grid
const OFF_THRESHOLD = 0.15;
const grid = createGrid(
  seqEl,
  (i) => {
    const st = currentTrack().steps[i];
    if (!st.on) { st.on = true; st.vel = 1.0; }
    else if (st.vel > 0.95) { st.vel = 0.6; }
    else if (st.vel > 0.55) { st.vel = 0.3; }
    else { st.on = false; st.vel = 0; }
    renderGrid();
  },
  (i, v) => {
    const st = currentTrack().steps[i];
    if (v < OFF_THRESHOLD) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
    renderGrid();
  },
  (i) => {
    const st = currentTrack().steps[i];
    if (st.on) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = 1.0; }
    renderGrid();
  }
);

function renderGrid(){ grid.update((i)=>currentTrack().steps[i]); }
function paintForSelected(){ grid.paint(currentTrack().pos); }

// Params
async function handleSampleFile(file){
  if (!file) return;
  const ab = await file.arrayBuffer();
  const buffer = await ctx.decodeAudioData(ab);
  const name = file.name || 'sample';
  sampleCache[name] = buffer;
  const t = currentTrack();
  t.sample = { buffer, name };
  renderParamsPanel();
}

function renderParamsPanel(){
  const binder = renderParams(paramsEl, currentTrack(), makeField);
  binder({
    applyMixer: () => applyMixer(tracks),
    t: currentTrack(),
    onStepsChange: (newLen) => {
      resizeTrackSteps(currentTrack(), newLen);
      grid.setLength(newLen);
      renderGrid();
    },
    onSampleFile: handleSampleFile,
  });
}

function refreshAndSelect(i = selectedTrackIndex){
  refreshTrackSelect(trackSel, tracks, i);
  engineSel.value = currentTrack().engine;
  grid.setLength(currentTrack().length);
  renderGrid();
  renderParamsPanel();
}

// Pattern & Chain
function refreshPatternSelect() {
  patternSel.innerHTML = '';
  song.patterns.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i+1}. ${p.name || 'Pattern'}`;
    patternSel.appendChild(opt);
  });
  patternSel.value = String(song.current);
  const cur = song.patterns[song.current];
  if (cur) patLenInput.value = cur.len16;
  updateChainStatus();
}

function switchToPattern(index) {
  index = Math.max(0, Math.min(index, song.patterns.length - 1));
  song.current = index;
  const pat = song.patterns[index];
  const { tracks: newTracks, len16 } = instantiatePattern(pat, sampleCache);
  tracks.length = 0;
  for (const t of newTracks) tracks.push(t);
  for (const t of tracks) t.pos = -1;
  selectedTrackIndex = Math.min(selectedTrackIndex, tracks.length - 1);
  patTicksLeft = len16;
  refreshAndSelect(selectedTrackIndex);
  refreshPatternSelect();
}

function addNewPattern() {
  const name = `P${song.patterns.length + 1}`;
  const pat = serializePattern(name, tracks, patTicksLeft || 16);
  song.patterns.push(pat);
  song.current = song.patterns.length - 1;
  refreshPatternSelect();
}

function duplicateCurrentPattern() {
  const src = song.patterns[song.current];
  const copy = clonePatternData(src);
  copy.name = `${src.name || 'P'}*`;
  song.patterns.push(copy);
  song.current = song.patterns.length - 1;
  refreshPatternSelect();
}

function updateCurrentPatternLength(newLen16) {
  const cur = song.patterns[song.current];
  if (!cur) return;
  cur.len16 = Math.max(1, Math.floor(newLen16));
  patLenInput.value = cur.len16;
  patTicksLeft = cur.len16;
}

function addCurrentToChain() {
  if (!song.patterns.length) return;
  song.chain.push(song.current);
  renderChainView();
  updateChainStatus();
}

function clearChain() {
  song.chain = [];
  song.chainPos = 0;
  renderChainView();
  updateChainStatus();
}

function renderChainView() {
  chainView.innerHTML = '';
  song.chain.forEach((idx, i) => {
    const tag = document.createElement('button');
    tag.className = 'toggle' + (i === song.chainPos ? ' active' : '');
    tag.textContent = (song.patterns[idx]?.name || `P${idx+1}`);
    tag.onclick = () => { song.chainPos = i; switchToPattern(idx); renderChainView(); };
    chainView.appendChild(tag);
  });
}

function advanceChain() {
  if (song.chain.length === 0) return;
  song.chainPos = (song.chainPos + 1) % song.chain.length;
  const nextIdx = song.chain[song.chainPos];
  switchToPattern(nextIdx);
  renderChainView();
}

function updateChainStatus() {
  const curName = song.patterns[song.current]?.name || `P${song.current+1}`;
  const inChain = song.chain.indexOf(song.current);
  const mode = followChain?.checked ? 'Follow Chain' : 'Loop Pattern';
  chainStatus.textContent = `Now: ${curName} • Len ${song.patterns[song.current]?.len16 || 16} • Chain pos: ${song.chainPos+1}/${Math.max(1, song.chain.length)}${inChain>=0?' (in chain)':''} • Mode: ${mode}`;
}

// --- UI Wiring ---
trackSel.addEventListener('change', (e) => {
  selectedTrackIndex = Math.max(0, Math.min(+e.target.value, tracks.length - 1));
  refreshAndSelect(selectedTrackIndex);
});
addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  const t = createTrack(`Track ${n}`, 'synth', 16);
  if (tracks.length > 0) syncTrackToSelected(t);
  tracks.push(t);
  selectedTrackIndex = tracks.length - 1;
  refreshAndSelect(selectedTrackIndex);
});
engineSel.addEventListener('change', (e) => {
  currentTrack().engine = e.target.value;
  refreshAndSelect(selectedTrackIndex);
});
patternSel.addEventListener('change', (e) => { switchToPattern(+e.target.value); });
addPatternBtn.addEventListener('click', () => { addNewPattern(); switchToPattern(song.current); });
dupPatternBtn.addEventListener('click', () => { duplicateCurrentPattern(); switchToPattern(song.current); });
patLenInput.addEventListener('change', (e) => { updateCurrentPatternLength(+e.target.value); });
chainAddBtn.addEventListener('click', addCurrentToChain);
chainClear.addEventListener('click', clearChain);
chainPrev.addEventListener('click', () => {
  if (song.chain.length === 0) return;
  song.chainPos = (song.chainPos - 1 + song.chain.length) % song.chain.length;
  switchToPattern(song.chain[song.chainPos]);
  renderChainView();
});
chainNext.addEventListener('click', () => {
  if (song.chain.length === 0) return;
  song.chainPos = (song.chainPos + 1) % song.chain.length;
  switchToPattern(song.chain[song.chainPos]);
  renderChainView();
});
followChain.addEventListener('change', updateChainStatus);

// Transport
document.getElementById('play').onclick = async () => {
  await ctx.resume();
  const bpmRaw = Number(tempoInput?.value ?? 120);
  const bpm = Math.min(300, Math.max(40, Number.isFinite(bpmRaw) ? bpmRaw : 120));

  startTransport(bpm, () => {
    applyMixer(tracks);
    for (const t of tracks){
      if (t.length <= 0) continue;
      t.pos = (t.pos + 1) % t.length;
      const st = t.steps[t.pos];
      if (t._effectiveAudible && st?.on) triggerEngine(t, st.vel);
    }
    patTicksLeft--;
    if (patTicksLeft <= 0) {
      const curLen = song.patterns[song.current]?.len16 || 16;
      patTicksLeft = curLen;
      if (followChain?.checked) {
        advanceChain();
      } else {
        switchToPattern(song.current);
      }
    }
    grid.paint(currentTrack().pos);
  });
};
document.getElementById('stop').onclick = () => {
  stopTransport();
  for (const t of tracks) t.pos = -1;
  grid.paint(currentTrack().pos);
  renderGrid();
};

// Boot
tracks.push(createTrack('Kick',  'kick808', 16));
tracks.push(createTrack('Hat',   'hat808',  12));
tracks.push(createTrack('Synth', 'synth',   16));
selectedTrackIndex = 0;
song.patterns.push(serializePattern('P1', tracks, 16));
song.current = 0;
patTicksLeft = song.patterns[0].len16;
refreshAndSelect(selectedTrackIndex);
refreshPatternSelect();
renderChainView();
