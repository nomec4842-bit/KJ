// main.js
import { ctx, startTransport, stopTransport } from './core.js';
import { createTrack, triggerEngine, applyMixer, resizeTrackSteps } from './tracks.js';
import { createGrid } from './sequencer.js';
import { refreshTrackSelect, renderParams, makeField } from './ui.js';

// ----- DOM refs -----
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');
const paramsEl    = document.getElementById('params');

// ----- App state -----
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

// ---- Helper: sync new track to selected track (length + phase) ----
function syncTrackToSelected(t) {
  const baseLen = currentTrack()?.length ?? 16;
  resizeTrackSteps(t, baseLen);
  const selPos = currentTrack()?.pos ?? -1;
  t.pos = selPos >= 0 ? (selPos % t.length) : -1;
}

// ----- Grid (single visible track) -----
const OFF_THRESHOLD = 0.15;
const grid = createGrid(
  seqEl,
  // onToggle: OFF → 100% → 60% → 30% → OFF
  (i) => {
    const st = currentTrack().steps[i];
    if (!st.on) { st.on = true; st.vel = 1.0; }
    else if (st.vel > 0.95) { st.vel = 0.6; }
    else if (st.vel > 0.55) { st.vel = 0.3; }
    else { st.on = false; st.vel = 0; }
    renderGrid();
  },
  // onSetVel: drag below threshold clears
  (i, v) => {
    const st = currentTrack().steps[i];
    if (v < OFF_THRESHOLD) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
    renderGrid();
  },
  // onDoubleToggle: quick place/remove
  (i) => {
    const st = currentTrack().steps[i];
    if (st.on) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = 1.0; }
    renderGrid();
  }
);

function renderGrid(){ grid.update((i)=>currentTrack().steps[i]); }
function paintForSelected(){ grid.paint(currentTrack().pos); }

// ----- Params panel -----
async function handleSampleFile(file){
  if (!file) return;
  const ab = await file.arrayBuffer();
  const buffer = await ctx.decodeAudioData(ab);
  const t = currentTrack();
  t.sample = { buffer, name: file.name || 'sample' };
  const p = t.params.sampler;
  p.start = Math.max(0, Math.min(1, p.start ?? 0));
  p.end   = Math.max(p.start, Math.min(1, p.end ?? 1));
  renderParamsPanel(); // refresh to show filename
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

// ----- UI wiring -----
trackSel.addEventListener('change', (e) => {
  selectedTrackIndex = Math.max(0, Math.min(+e.target.value, tracks.length - 1));
  refreshAndSelect(selectedTrackIndex);
});

addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  // create with default, then sync to selected
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

// ----- Transport (per-track polymeter ticks) -----
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

    paintForSelected(); // shows selected track’s playhead
  });
};

document.getElementById('stop').onclick = () => {
  stopTransport();
  for (const t of tracks) t.pos = -1;
  paintForSelected();
  renderGrid();
};

// ----- Boot -----
tracks.push(createTrack('Kick',  'kick808', 16));
tracks.push(createTrack('Hat',   'hat808',  12)); // example polymeter
tracks.push(createTrack('Synth', 'synth',   16));
// tracks.push(createTrack('Samp', 'sampler', 16)); // optional sampler track
selectedTrackIndex = 0;
refreshAndSelect(selectedTrackIndex);
