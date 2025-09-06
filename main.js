// main.js
import { ctx, startTransport, stopTransport } from './core.js';
import {
  createTrack, triggerEngine, applyMixer, resizeTrackSteps,
  notesStartingAt
} from './tracks.js';
import { createGrid } from './sequencer.js';
import { createPianoRoll } from './pianoroll.js';
import { refreshTrackSelect, renderParams, makeField } from './ui.js';
import { serializePattern, instantiatePattern, clonePatternData } from './patterns.js';

// ----- DOM refs -----
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');
const paramsEl    = document.getElementById('params');

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

const togglePiano = document.getElementById('togglePiano');

// ----- App state -----
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {};
const song = {
  patterns: [],
  current: 0,
  chain: [],           // [{ pattern, repeats }]
  chainPos: 0,
  repeatsLeft: 0
};
let patTicksLeft = 16;

// ----- Helpers -----
function gcd(a, b){ return b ? gcd(b, a % b) : Math.abs(a||0); }
function lcm(a, b){ if (!a || !b) return Math.max(a,b); return Math.abs(a*b) / gcd(a,b); }
function lcmOfTrackLens(cap = 2048){
  let val = 1;
  for (const t of tracks){
    val = lcm(val, Math.max(1, t.length||1));
    if (val > cap) return cap; // prevent runaway lengths
  }
  return val;
}

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

function ensurePatternCoversTracks(force = false){
  const need = lcmOfTrackLens(); // always compute LCM
  const curPat = song.patterns[song.current];
  const curLen = curPat?.len16 || 16;
  if (force || curLen !== need) {
    updateCurrentPatternLength(need); // also sets patTicksLeft
  } else {
    patTicksLeft = Math.max(1, Math.min(patTicksLeft, curLen));
  }
}

// ----- Editors (step grid + piano roll) -----
const stepGrid = createGrid(
  seqEl,
  (i) => {
    const st = currentTrack().steps[i];
    if (!st.on) { st.on = true; st.vel = 1.0; }
    else if (st.vel > 0.95) { st.vel = 0.6; }
    else if (st.vel > 0.55) { st.vel = 0.3; }
    else { st.on = false; st.vel = 0; }
    renderCurrentEditor();
  },
  (i, v) => {
    const st = currentTrack().steps[i];
    if (v < 0.15) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
    renderCurrentEditor();
  },
  (i) => {
    const st = currentTrack().steps[i];
    if (st.on) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = 1.0; }
    renderCurrentEditor();
  }
);

const piano = createPianoRoll(
  seqEl,
  () => currentTrack(),
  () => renderCurrentEditor()
);

function showEditorForTrack(){
  const t = currentTrack();
  if (t.mode === 'piano'){ piano.setLength(t.length); }
  else { stepGrid.setLength(t.length); }
  renderCurrentEditor();
}
function renderCurrentEditor(){
  const t = currentTrack();
  if (t.mode === 'piano'){ piano.update(); }
  else { stepGrid.update((i)=>t.steps[i]); }
}
function paintPlayhead(){
  const t = currentTrack();
  if (t.mode === 'piano'){ piano.paint(t.pos); }
  else { stepGrid.paint(t.pos); }
}
function syncToggleFromTrack(){ togglePiano.checked = currentTrack().mode === 'piano'; }

// ----- Params (mixer + engine ui) -----
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
      showEditorForTrack();
      paintPlayhead();
      ensurePatternCoversTracks(true);
      updateChainStatus();
    },
    onSampleFile: handleSampleFile,
  });
}
function refreshAndSelect(i = selectedTrackIndex){
  refreshTrackSelect(trackSel, tracks, i);
  engineSel.value = currentTrack().engine;
  syncToggleFromTrack();
  showEditorForTrack();
  renderParamsPanel();
}

// ----- Pattern & Chain -----
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
  ensurePatternCoversTracks(true);
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
  const need = lcmOfTrackLens();
  const nextLen = Math.max(need, Math.floor(newLen16));
  cur.len16 = nextLen;
  patLenInput.value = cur.len16;
  patTicksLeft = cur.len16;
}

// ----- Chain model -----
const REPEAT_CYCLE = [1,2,4,8,16];
function clampRepeats(n){ n = Math.floor(Number(n)); if(!Number.isFinite(n)) n=1; return Math.max(1, Math.min(32, n)); }
function pushToChain(patternIndex, repeats = 1) {
  song.chain.push({ pattern: patternIndex, repeats: clampRepeats(repeats) });
  renderChainView();
  updateChainStatus();
}
function cycleRepeatsAt(idx, dir = +1){
  if (!song.chain[idx]) return;
  const cur = song.chain[idx].repeats;
  const pos = REPEAT_CYCLE.indexOf(cur);
  let nextVal = 1;
  if (pos === -1) nextVal = 1;
  else nextVal = REPEAT_CYCLE[(pos + dir + REPEAT_CYCLE.length)%REPEAT_CYCLE.length];
  song.chain[idx].repeats = nextVal;
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
    const label = document.createElement('span');
    label.textContent = song.patterns[slot.pattern]?.name || `P${slot.pattern+1}`;
    const rep = document.createElement('span');
    rep.className = 'rep';
    rep.textContent = `×${slot.repeats}`;
    rep.style.marginLeft = '6px';
    rep.style.opacity = 0.85;
    rep.style.fontSize = '12px';
    btn.appendChild(label);
    btn.appendChild(rep);
    rep.addEventListener('click', (e) => { e.stopPropagation(); cycleRepeatsAt(i, e.shiftKey ? -1 : +1); });
    rep.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      const n = prompt('Repeats (1–32):', String(slot.repeats));
      if (n != null) setRepeatsAt(i, n);
    });
    btn.addEventListener('click', () => { saveCurrentPatternSnapshot(); enterChainSlot(i); });
    chainView.appendChild(btn);
  });
}
function advanceChain() {
  if (song.chain.length === 0) return;
  if (song.repeatsLeft > 1) {
    song.repeatsLeft--;
    switchToPattern(song.chain[song.chainPos].pattern);
  } else {
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
  ensurePatternCoversTracks(true);
});
engineSel.addEventListener('change', (e) => {
  currentTrack().engine = e.target.value;
  refreshAndSelect(selectedTrackIndex);
});

patternSel.addEventListener('change', (e) => { saveCurrentPatternSnapshot(); switchToPattern(+e.target.value); });
addPatternBtn.addEventListener('click', () => { saveCurrentPatternSnapshot(); addNewPattern(); switchToPattern(song.current); });
dupPatternBtn.addEventListener('click', () => { saveCurrentPatternSnapshot(); duplicateCurrentPattern(); switchToPattern(song.current); });
patLenInput.addEventListener('change', (e) => { updateCurrentPatternLength(+e.target.value); });

chainAddBtn.addEventListener('click', addCurrentToChain);
chainClear.addEventListener('click', clearChain);
chainPrev.addEventListener('click', () => { if (!song.chain.length) return; saveCurrentPatternSnapshot(); enterChainSlot(song.chainPos - 1); });
chainNext.addEventListener('click', () => { if (!song.chain.length) return; saveCurrentPatternSnapshot(); enterChainSlot(song.chainPos + 1); });
followChain.addEventListener('change', updateChainStatus);

togglePiano.addEventListener('change', () => {
  const t = currentTrack();
  t.mode = togglePiano.checked ? 'piano' : 'steps';
  showEditorForTrack();
});

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

      if (t._effectiveAudible) {
        if (t.mode === 'piano') {
          const notes = notesStartingAt(t, t.pos);
          for (const n of notes) triggerEngine(t, n.vel ?? 1, n.pitch);
        } else {
          const st = t.steps[t.pos];
          if (st?.on) triggerEngine(t, st.vel);
        }
      }
    }

    // pattern window
    ensurePatternCoversTracks(); // recheck mid-play in case lengths changed
    patTicksLeft--;
    if (patTicksLeft <= 0) {
      const curLen = song.patterns[song.current]?.len16 || 16;
      patTicksLeft = curLen;
      saveCurrentPatternSnapshot();
      if (followChain?.checked) advanceChain();
      else switchToPattern(song.current);
    }

    paintPlayhead();
  });
};

document.getElementById('stop').onclick = () => {
  stopTransport();
  for (const t of tracks) t.pos = -1;
  paintPlayhead();
  renderCurrentEditor();
};

// ----- Boot -----
tracks.push(createTrack('Kick',  'kick808', 16));
tracks.push(createTrack('Hat',   'hat808',  12));
tracks.push(createTrack('Synth', 'synth',   16));
selectedTrackIndex = 0;

song.patterns.push(serializePattern('P1', tracks, 16));
song.current = 0;
patTicksLeft = song.patterns[0].len16;
ensurePatternCoversTracks(true);

refreshAndSelect(selectedTrackIndex);
refreshPatternSelect();
renderChainView();
