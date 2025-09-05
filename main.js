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
  chain: [],            // [{ pattern: number, repeats: number }]
  chainPos: 0,
  repeatsLeft: 0        // runtime, for current slot
};
let patTicksLeft = 16;

// ----- Helpers -----
function syncTrackToSelected(t) {
  const baseLen = currentTrack()?.length ?? 16;
  resizeTrackSteps(t, baseLen);
  const selPos = currentTrack()?.pos ?? -1;
  t.pos = selPos >= 0 ? (selPos % t.length) : -1;
}

function saveCurrentPatternSnapshot() {
  if (!song.patterns.length) return;
  const name = song.patterns[song.current]?.name || `P${song.current+1}`;
  const curLen = song.patterns[song.current]?.len16 || patTicksLeft || 16;
  song.patterns[song.current] = serializePattern(name, tracks, curLen);
}

// ----- Grid -----
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

// ----- Params -----
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

// ----- Patterns & Chain -----
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

// --- Chain model with repeats ---
const REPEAT_CYCLE = [1,2,4,8,16];
function pushToChain(patternIndex, repeats = 1) {
  song.chain.push({ pattern: patternIndex, repeats: clampRepeats(repeats) });
  renderChainView();
  updateChainStatus();
}
function clampRepeats(n){
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) n = 1;
  return Math.max(1, Math.min(32, n));
}
function cycleRepeatsAt(idx, dir = +1){
  if (!song.chain[idx]) return;
  const cur = song.chain[idx].repeats;
  const pos = REPEAT_CYCLE.indexOf(cur);
  if (pos === -1) {
    song.chain[idx].repeats = 1;
  } else {
    let next = (pos + dir + REPEAT_CYCLE.length) % REPEAT_CYCLE.length;
    song.chain[idx].repeats = REPEAT_CYCLE[next];
  }
  if (idx === song.chainPos) song.repeatsLeft = song.chain[idx].repeats;
  renderChainView(); updateChainStatus();
}
function setRepeatsAt(idx, n){
  if (!song.chain[idx]) return;
  song.chain[idx].repeats = clampRepeats(n);
  if (idx === song.chainPos) song.repeatsLeft = song.chain[idx].repeats;
  renderChainView(); updateChainStatus();
}
function enterChainSlot(i){
  if (!song.chain.length) return;
  song.chainPos = ((i % song.chain.length) + song.chain.length) % song.chain.length;
  const slot = song.chain[song.chainPos];
  song.repeatsLeft = slot.repeats;
  switchToPattern(slot.pattern);
  renderChainView();
}

function addCurrentToChain() {
  if (!song.patterns.length) return;
  pushToChain(song.current, 1);
}
function clearChain() {
  song.chain = [];
  song.chainPos = 0;
  song.repeatsLeft = 0;
  renderChainView();
  updateChainStatus();
}

function renderChainView() {
  chainView.innerHTML = '';
  song.chain.forEach((slot, i) => {
    const btn = document.createElement('button');
    btn.className = 'toggle' + (i === song.chainPos ? ' active' : '');
    // label
    const label = document.createElement('span');
    label.textContent = song.patterns[slot.pattern]?.name || `P${slot.pattern+1}`;
    // repeats badge
    const rep = document.createElement('span');
    rep.className = 'rep';
    rep.textContent = `×${slot.repeats}`;
    rep.style.marginLeft = '6px';
    rep.style.opacity = 0.85;
    rep.style.fontSize = '12px';

    btn.appendChild(label);
    btn.appendChild(rep);

    // click on badge: cycle repeats; shift = reverse; right-click = prompt
    rep.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleRepeatsAt(i, e.shiftKey ? -1 : +1);
    });
    rep.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const n = prompt('Repeats (1–32):', String(slot.repeats));
      if (n != null) setRepeatsAt(i, n);
    });

    // click elsewhere: jump to slot/pattern
    btn.addEventListener('click', () => {
      saveCurrentPatternSnapshot();
      enterChainSlot(i);
    });

    chainView.appendChild(btn);
  });
}

function advanceChain() {
  if (song.chain.length === 0) return;
  // repeats logic
  if (song.repeatsLeft > 1) {
    song.repeatsLeft--;
    // stay on current slot, just loop its pattern window
    switchToPattern(song.chain[song.chainPos].pattern);
  } else {
    // move to next slot and reset repeats
    const nextPos = (song.chainPos + 1) % song.chain.length;
    enterChainSlot(nextPos);
  }
}

function updateChainStatus() {
  const curName = song.patterns[song.current]?.name || `P${song.current+1}`;
  const mode = followChain?.checked ? 'Follow Chain' : 'Loop Pattern';
  const slot = song.chain[song.chainPos];
  const repInfo = slot ? `• Repeats left: ${song.repeatsLeft}/${slot.repeats}` : '';
  chainStatus.textContent =
    `Now: ${curName} • Len ${song.patterns[song.current]?.len16 || 16} • ` +
    `Chain pos: ${song.chain.length ? (song.chainPos+1) : 0}/${Math.max(1, song.chain.length)} ${repInfo} • Mode: ${mode}`;
}

// ----- UI wiring -----
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

patternSel.addEventListener('change', (e) => {
  saveCurrentPatternSnapshot();
  switchToPattern(+e.target.value);
});
addPatternBtn.addEventListener('click', () => {
  saveCurrentPatternSnapshot();
  addNewPattern();
  switchToPattern(song.current);
});
dupPatternBtn.addEventListener('click', () => {
  saveCurrentPatternSnapshot();
  duplicateCurrentPattern();
  switchToPattern(song.current);
});

patLenInput.addEventListener('change', (e) => { updateCurrentPatternLength(+e.target.value); });
chainAddBtn.addEventListener('click', addCurrentToChain);
chainClear.addEventListener('click', clearChain);
chainPrev.addEventListener('click', () => {
  if (!song.chain.length) return;
  saveCurrentPatternSnapshot();
  enterChainSlot(song.chainPos - 1);
});
chainNext.addEventListener('click', () => {
  if (!song.chain.length) return;
  saveCurrentPatternSnapshot();
  enterChainSlot(song.chainPos + 1);
});
followChain.addEventListener('change', updateChainStatus);

// ----- Transport -----
document.getElementById('play').onclick = async () => {
  await ctx.resume();
  const bpmRaw = Number(tempoInput?.value ?? 120);
  const bpm = Math.min(300, Math.max(40, Number.isFinite(bpmRaw) ? bpmRaw : 120));

  startTransport(bpm, () => {
    applyMixer(tracks);

    // per-track polymeter
    for (const t of tracks){
      if (t.length <= 0) continue;
      t.pos = (t.pos + 1) % t.length;
      const st = t.steps[t.pos];
      if (t._effectiveAudible && st?.on) triggerEngine(t, st.vel);
    }

    // end-of-pattern window
    patTicksLeft--;
    if (patTicksLeft <= 0) {
      const curLen = song.patterns[song.current]?.len16 || 16;
      patTicksLeft = curLen;
      saveCurrentPatternSnapshot();

      if (followChain?.checked) {
        advanceChain();
      } else {
        // loop current pattern; repeats are ignored when not following chain
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

// ----- Boot -----
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
