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

/* ---------- DOM ---------- */
const tempoInput   = document.getElementById('tempo');
const trackSel     = document.getElementById('trackSelect');
const addTrackBtn  = document.getElementById('addTrack');
const engineSel    = document.getElementById('engine');
const seqEl        = document.getElementById('sequencer');
const paramsEl     = document.getElementById('params');

const patternSel     = document.getElementById('patternSelect');
const addPatternBtn  = document.getElementById('addPattern');
const dupPatternBtn  = document.getElementById('dupPattern');
const patLenInput    = document.getElementById('patLen');

const togglePiano  = document.getElementById('togglePiano');
const playBtn      = document.getElementById('play');
const stopBtn      = document.getElementById('stop');

/* ---------- State ---------- */
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {};
const song = { patterns: [], current: 0 };

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
  },
  (i, v) => { // drag for velocity
    const st = currentTrack().steps[i];
    if (v < 0.15) { st.on = false; st.vel = 0; }
    else { st.on = true; st.vel = v; }
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
    }
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
function refreshPatternSelect() {
  patternSel.innerHTML = '';
  song.patterns.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i+1}. ${p.name || 'Pattern'}`;
    patternSel.appendChild(opt);
  });
  patternSel.value = String(song.current);
}

/* ---------- Transport ---------- */
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

      if (t.mode === 'piano') {
        const notes = notesStartingAt?.(t, t.pos) || [];
        for (const n of notes) triggerEngine?.(t, n.vel ?? 1, n.pitch);
      } else {
        const st = t.steps[t.pos];
        if (st?.on) triggerEngine?.(t, st.vel);
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
