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

const togglePiano = document.getElementById('togglePiano');

// ----- App state -----
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {};
const song = {
  patterns: [],
  current: 0
};

// ----- Helpers -----
function saveCurrentPatternSnapshot() {
  if (!song.patterns.length) return;
  const name = song.patterns[song.current]?.name || `P${song.current+1}`;
  const curLen = song.patterns[song.current]?.len16 || 16;
  song.patterns[song.current] = serializePattern(name, tracks, curLen);
}

// ----- Editors -----
const stepGrid = createGrid(seqEl,
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

const piano = createPianoRoll(seqEl, () => currentTrack(), () => renderCurrentEditor());

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
      showEditorForTrack();
      paintPlayhead();
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

// ----- Patterns -----
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
}

function switchToPattern(index) {
  index = Math.max(0, Math.min(index, song.patterns.length - 1));
  song.current = index;
  const pat = song.patterns[index];
  const { tracks: newTracks } = instantiatePattern(pat, sampleCache);
  tracks.length = 0;
  for (const t of newTracks) {
    // preserve per-track chain state if possible
    t.chain = t.chain || [{ pattern: index, repeats: 1 }];
    t.chainPos = t.chainPos || 0;
    t.repeatsLeft = t.repeatsLeft || t.chain[0].repeats;
    tracks.push(t);
  }
  for (const t of tracks) t.pos = -1;
  selectedTrackIndex = Math.min(selectedTrackIndex, tracks.length - 1);

  refreshAndSelect(selectedTrackIndex);
  refreshPatternSelect();
}

function addNewPattern() {
  const name = `P${song.patterns.length + 1}`;
  const pat = serializePattern(name, tracks, 16);
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
}

// ----- Per-track chaining -----
function advanceTrackChain(t) {
  if (!t.chain || !t.chain.length) return;

  if (t.repeatsLeft > 1) {
    t.repeatsLeft--;
  } else {
    t.chainPos = (t.chainPos + 1) % t.chain.length;
    const slot = t.chain[t.chainPos];
    t.repeatsLeft = slot.repeats;

    // load pattern only for this track
    const pat = song.patterns[slot.pattern];
    if (pat) {
      const { tracks: newTracks } = instantiatePattern(pat, sampleCache);
      const nt = newTracks.find(nt => nt.name === t.name);
      if (nt) {
        Object.assign(t, nt);
        t.chain = t.chain; // keep its chain
        t.chainPos = t.chainPos;
        t.repeatsLeft = slot.repeats;
      }
    }
    t.pos = -1;
  }
}

// ----- UI wiring -----
trackSel.addEventListener('change', (e) => {
  selectedTrackIndex = Math.max(0, Math.min(+e.target.value, tracks.length - 1));
  refreshAndSelect(selectedTrackIndex);
});
addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  const t = createTrack(`Track ${n}`, 'synth', 16);
  // init per-track chain
  t.chain = [{ pattern: song.current, repeats: 1 }];
  t.chainPos = 0;
  t.repeatsLeft = 1;
  tracks.push(t);
  selectedTrackIndex = tracks.length - 1;
  refreshAndSelect(selectedTrackIndex);
});
engineSel.addEventListener('change', (e) => {
  currentTrack().engine = e.target.value;
  refreshAndSelect(selectedTrackIndex);
});

patternSel.addEventListener('change', (e) => { saveCurrentPatternSnapshot(); switchToPattern(+e.target.value); });
addPatternBtn.addEventListener('click', () => { saveCurrentPatternSnapshot(); addNewPattern(); switchToPattern(song.current); });
dupPatternBtn.addEventListener('click', () => { saveCurrentPatternSnapshot(); duplicateCurrentPattern(); switchToPattern(song.current); });
patLenInput.addEventListener('change', (e) => { updateCurrentPatternLength(+e.target.value); });

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

      // check chain advance for this track
      if (t.pos === 0) {
        advanceTrackChain(t);
      }
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
for (const t of tracks) {
  t.chain = [{ pattern: 0, repeats: 1 }];
  t.chainPos = 0;
  t.repeatsLeft = 1;
}
selectedTrackIndex = 0;

song.patterns.push(serializePattern('P1', tracks, 16));
song.current = 0;

refreshAndSelect(selectedTrackIndex);
refreshPatternSelect();
