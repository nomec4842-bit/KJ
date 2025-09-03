// main.js
import { ctx, master, NUM_STEPS, startTransport, stopTransport } from './core.js';
import { createTrack, triggerEngine, applyMixer } from './tracks.js';
import { createGrid } from './sequencer.js';
import { refreshTrackSelect, renderParams, makeField } from './ui.js';

// ===== DOM refs =====
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');
const paramsEl    = document.getElementById('params');

// ===== App state =====
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

// ===== Sequencer Grid (with OFF cycle, drag threshold) =====
const OFF_THRESHOLD = 0.15;
const grid = createGrid(
  seqEl,
  (i) => { // click cycle
    const st = currentTrack().steps[i];
    if (!st.on) { st.on = true; st.vel = 1.0; }
    else if (st.vel > 0.95) { st.vel = 0.6; }
    else if (st.vel > 0.55) { st.vel = 0.3; }
    else { st.on = false; st.vel = 0; }
    renderGrid();
  },
  (i, v) => { // drag velocity
    const st = currentTrack().steps[i];
    if (v < OFF_THRESHOLD) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
    renderGrid();
  },
  (i) => { // double: quick place/remove
    const st = currentTrack().steps[i];
    if (st.on) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = 1.0; }
    renderGrid();
  }
);

function getStep(i){ return currentTrack().steps[i]; }
function renderGrid(){ grid.update(getStep); }
function paintPlayhead(i){ grid.paint(i); }

// ===== UI wiring =====
async function handleSampleFile(file){
  if (!file) return;
  const ab = await file.arrayBuffer();
  const buffer = await ctx.decodeAudioData(ab);
  const t = currentTrack();
  t.sample = { buffer, name: file.name || 'sample' };
  // gently clamp sampler end to 1 and ensure start <= end
  const p = t.params.sampler;
  p.start = Math.max(0, Math.min(1, p.start ?? 0));
  p.end   = Math.max(p.start, Math.min(1, p.end ?? 1));
  renderParamsPanel(); // refresh to show filename
}

function renderParamsPanel(){
  const binder = renderParams(paramsEl, currentTrack(), makeField);
  binder({ applyMixer: () => applyMixer(tracks), t: currentTrack(), onSampleFile: handleSampleFile });
}

function refreshAndSelect(i = selectedTrackIndex){
  refreshTrackSelect(trackSel, tracks, i);
  engineSel.value = currentTrack().engine;
  renderGrid();
  renderParamsPanel();
}

trackSel.addEventListener('change', (e) => {
  selectedTrackIndex = Math.max(0, Math.min(+e.target.value, tracks.length - 1));
  refreshAndSelect(selectedTrackIndex);
});

addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  tracks.push(createTrack(`Track ${n}`, 'synth'));
  selectedTrackIndex = tracks.length - 1;
  refreshAndSelect(selectedTrackIndex);
});

engineSel.addEventListener('change', (e) => {
  currentTrack().engine = e.target.value;
  refreshAndSelect(selectedTrackIndex);
});

// ===== Transport =====
document.getElementById('play').onclick = async () => {
  await ctx.resume();
  const bpmRaw = Number(tempoInput?.value ?? 120);
  const bpm = Math.min(300, Math.max(40, Number.isFinite(bpmRaw) ? bpmRaw : 120));

  startTransport(bpm, (stepIdx) => {
    paintPlayhead(stepIdx);
    applyMixer(tracks);
    for (const t of tracks) {
      if (!t._effectiveAudible) continue;
      const st = t.steps[stepIdx];
      if (st.on) triggerEngine(t, st.vel);
    }
  });
};

document.getElementById('stop').onclick = () => {
  stopTransport();
  for (let i = 0; i < NUM_STEPS; i++) paintPlayhead(-1);
  renderGrid();
};

// ===== Boot =====
tracks.push(createTrack('Track 1', 'kick808'));
tracks.push(createTrack('Track 2', 'synth'));
// Optional: add a sampler track quickly
// tracks.push(createTrack('Track 3', 'sampler'));

selectedTrackIndex = 0;
refreshAndSelect(selectedTrackIndex);
