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

// ===== Sequencer Grid =====
const OFF_THRESHOLD = 0.15;

const grid = createGrid(
  seqEl,
  // onToggle (single tap): cycle OFF → 100 → 60 → 30 → OFF
  (i) => {
    const st = currentTrack().steps[i];
    if (!st.on) {
      st.on = true; st.vel = 1.0;
    } else if (st.vel > 0.95) {
      st.vel = 0.6;
    } else if (st.vel > 0.55) {
      st.vel = 0.3;
    } else {
      st.on = false; st.vel = 0;
    }
    renderGrid();
  },
  // onSetVel (drag): drag below threshold turns OFF
  (i, v) => {
    const st = currentTrack().steps[i];
    if (v < OFF_THRESHOLD) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
    renderGrid();
  },
  // onDoubleToggle (double tap/click): quick place/remove
  (i) => {
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
function renderParamsPanel(){
  const binder = renderParams(paramsEl, currentTrack(), makeField);
  binder({ applyMixer: () => applyMixer(tracks), t: currentTrack() });
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
selectedTrackIndex = 0;
refreshAndSelect(selectedTrackIndex);
