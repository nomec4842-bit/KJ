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

/* ---------------- DOM ---------------- */
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

const playBtn = document.getElementById('play');
const stopBtn = document.getElementById('stop');

/* Per-track chain UI mount (create if missing) */
let trackChainView = document.getElementById('trackChainView');
if (!trackChainView) {
  trackChainView = document.createElement('div');
  trackChainView.id = 'trackChainView';
  trackChainView.style.marginTop = '10px';
  (seqEl?.parentElement || document.body).appendChild(trackChainView);
}

/* ---------------- App State ---------------- */
const tracks = [];
let selectedTrackIndex = 0;
const currentTrack = () => tracks[selectedTrackIndex];

const sampleCache = {};
const song = {
  patterns: [],
  current: 0, // selected row in the pattern library
};

/* ---------------- Safety / Normalization ---------------- */
function normalizeTrack(t) {
  if (!t) return t;
  t.name   = t.name   ?? 'Track';
  t.mode   = t.mode   ?? 'steps';               // 'steps' | 'piano'
  t.length = Math.max(1, (t.length ?? 16)|0);   // never 0/NaN
  t.pos    = Number.isInteger(t.pos) ? t.pos : -1;

  // steps array for step mode
  if (!Array.isArray(t.steps) || t.steps.length !== t.length) {
    t.steps = Array.from({ length: t.length }, () => ({ on:false, vel:0 }));
  }

  // playback flag (some UIs set this later)
  if (typeof t._effectiveAudible !== 'boolean') t._effectiveAudible = true;

  // per-track chain defaults
  if (!Array.isArray(t.chain) || t.chain.length === 0) {
    t.chain = [{ pattern: song.current ?? 0, repeats: 1 }];
  }
  t.chainPos    = Number.isInteger(t.chainPos) ? t.chainPos : 0;
  const slotRep = t.chain[t.chainPos]?.repeats;
  t.repeatsLeft = Math.max(1, (t.repeatsLeft ?? (slotRep ?? 1))|0);
  return t;
}

/* ---------------- Save Pattern Snapshot ---------------- */
function saveCurrentPatternSnapshot() {
  if (!song.patterns.length) return;
  const name = song.patterns[song.current]?.name || `P${song.current+1}`;
  const curLen = Math.max(1, song.patterns[song.current]?.len16 || 16);
  song.patterns[song.current] = serializePattern(name, tracks, curLen);
}

/* ---------------- Editors ---------------- */
const stepGrid = createGrid(
  seqEl,
  (i) => {
    const st = currentTrack().steps[i];
    if (!st.on) { st.on = true; st.vel = 1; }
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
    else { st.on = true; st.vel = 1; }
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
function syncToggleFromTrack(){ togglePiano.checked = currentTrack().mode === 'piano'; }

/* ---------------- Params ---------------- */
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
      normalizeTrack(currentTrack());
      showEditorForTrack();
      paintPlayhead();
      renderTrackChains(); // length changes affect wrap cadence
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
  renderTrackChains();
}

/* ---------------- Pattern Library ---------------- */
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
  const { tracks: newTracks } = instantiatePattern(pat, sampleCache) || { tracks: [] };

  // Merge musical data; keep per-track chain state/name/engine
  const byName = Object.create(null);
  newTracks.forEach(nt => { byName[nt.name] = nt; });

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const src = byName[t.name] ?? newTracks[i];
    if (src) {
      const keep = { chain:t.chain, chainPos:t.chainPos, repeatsLeft:t.repeatsLeft, name:t.name, engine:t.engine };
      Object.assign(t, src);
      Object.assign(t, keep);
      normalizeTrack(t);
      t.pos = -1;
    } else {
      // No matching source; still normalize to avoid runtime errors
      normalizeTrack(t);
    }
  }

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
  cur.len16 = Math.max(1, Math.floor(Number(newLen16)||16));
  patLenInput.value = cur.len16;
}

/* ---------------- Per-Track Chaining ---------------- */
function ensureTrackChainInit(t){
  if (!t.chain || !t.chain.length) {
    t.chain = [{ pattern: song.current ?? 0, repeats: 1 }];
    t.chainPos = 0;
    t.repeatsLeft = 1;
  } else {
    t.chainPos = Number.isInteger(t.chainPos) ? t.chainPos : 0;
    t.repeatsLeft = Math.max(1, (t.repeatsLeft ?? (t.chain[t.chainPos]?.repeats ?? 1))|0);
  }
}

function advanceTrackChain(t) {
  normalizeTrack(t);
  ensureTrackChainInit(t);

  if (t.repeatsLeft > 1) {
    t.repeatsLeft--;
    return;
  }

  // Move to next slot
  t.chainPos = (t.chainPos + 1) % t.chain.length;
  const slot = t.chain[t.chainPos];
  t.repeatsLeft = Math.max(1, (slot?.repeats ?? 1)|0);

  // Load pattern data for THIS track only
  const pat = song.patterns?.[slot?.pattern];
  if (!pat) { t.pos = -1; return; }

  const res = instantiatePattern(pat, sampleCache);
  const patTracks = (res && Array.isArray(res.tracks)) ? res.tracks : [];
  const nt = patTracks.find(x => x.name === t.name) ?? patTracks[tracks.indexOf(t)] ?? null;

  if (nt) {
    const keep = { chain:t.chain, chainPos:t.chainPos, repeatsLeft:t.repeatsLeft, name:t.name, engine:t.engine, _effectiveAudible:t._effectiveAudible };
    Object.assign(t, nt);
    Object.assign(t, keep);
    normalizeTrack(t);
  }

  t.pos = -1; // start fresh on next tick
}

/* ---------------- Per-Track Chain UI ---------------- */
function renderTrackChains(){
  trackChainView.innerHTML = '';
  tracks.forEach((t, ti) => {
    normalizeTrack(t);
    ensureTrackChainInit(t);

    const row = document.createElement('div');
    row.className = 'track-chain-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.margin = '2px 0';

    const label = document.createElement('div');
    label.textContent = t.name + ':';
    label.style.minWidth = '80px';
    label.style.opacity = '0.85';
    row.appendChild(label);

    t.chain.forEach((slot, si) => {
      const btn = document.createElement('button');
      btn.className = 'chain-slot' + (si === t.chainPos ? ' active' : '');
      btn.textContent = `${song.patterns[slot.pattern]?.name || `P${slot.pattern+1}`} ×${slot.repeats}`;
      btn.style.padding = '4px 6px';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid var(--border,#333)';
      btn.style.background = si === t.chainPos ? 'var(--accent,#444)' : 'transparent';

      btn.onclick = () => {
        t.chainPos = si;
        t.repeatsLeft = slot.repeats;
        t.pos = -1;
        renderTrackChains();
      };
      btn.oncontextmenu = (e) => {
        e.preventDefault();
        const n = prompt('Repeats (1–32):', String(slot.repeats));
        if (n != null) {
          const v = Math.max(1, Math.min(32, Math.floor(Number(n)||1)));
          slot.repeats = v;
          if (si === t.chainPos) t.repeatsLeft = v;
          renderTrackChains();
        }
      };

      row.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = 'Add chain slot (uses current pattern)';
    addBtn.style.padding = '4px 6px';
    addBtn.onclick = () => {
      t.chain.push({ pattern: song.current, repeats: 1 });
      renderTrackChains();
    };
    row.appendChild(addBtn);

    const clrBtn = document.createElement('button');
    clrBtn.textContent = 'Clear';
    clrBtn.title = 'Clear chain';
    clrBtn.style.padding = '4px 6px';
    clrBtn.onclick = () => {
      t.chain = [{ pattern: song.current, repeats: 1 }];
      t.chainPos = 0;
      t.repeatsLeft = 1;
      renderTrackChains();
    };
    row.appendChild(clrBtn);

    const stat = document.createElement('div');
    stat.style.marginLeft = 'auto';
    const slot = t.chain[t.chainPos];
    stat.textContent = `(pos ${t.pos < 0 ? '-' : t.pos+1}/${Math.max(1,t.length)}) • repeats ${t.repeatsLeft}/${slot?.repeats ?? 1}`;
    row.appendChild(stat);

    trackChainView.appendChild(row);
  });
}

/* ---------------- UI wiring ---------------- */
trackSel?.addEventListener('change', (e) => {
  selectedTrackIndex = Math.max(0, Math.min(+e.target.value, tracks.length - 1));
  refreshAndSelect(selectedTrackIndex);
});
addTrackBtn?.addEventListener('click', () => {
  const n = tracks.length + 1;
  const t = createTrack(`Track ${n}`, 'synth', 16);
  normalizeTrack(t);
  t.chain = [{ pattern: song.current, repeats: 1 }];
  t.chainPos = 0;
  t.repeatsLeft = 1;
  tracks.push(t);
  selectedTrackIndex = tracks.length - 1;
  refreshAndSelect(selectedTrackIndex);
});
engineSel?.addEventListener('change', (e) => {
  currentTrack().engine = e.target.value;
  normalizeTrack(currentTrack());
  refreshAndSelect(selectedTrackIndex);
});

patternSel?.addEventListener('change', (e) => { saveCurrentPatternSnapshot(); switchToPattern(+e.target.value); });
addPatternBtn?.addEventListener('click', () => { saveCurrentPatternSnapshot(); addNewPattern(); switchToPattern(song.current); });
dupPatternBtn?.addEventListener('click', () => { saveCurrentPatternSnapshot(); duplicateCurrentPattern(); switchToPattern(song.current); });
patLenInput?.addEventListener('change', (e) => {
  const cur = song.patterns[song.current];
  if (cur) {
    cur.len16 = Math.max(1, Math.floor(Number(e.target.value)||16));
    patLenInput.value = cur.len16;
  }
});

togglePiano?.addEventListener('change', () => {
  const t = currentTrack();
  t.mode = togglePiano.checked ? 'piano' : 'steps';
  normalizeTrack(t);
  showEditorForTrack();
});

/* ---------------- Transport ---------------- */
playBtn && (playBtn.onclick = async () => {
  await ctx.resume();
  const bpmRaw = Number(tempoInput?.value ?? 120);
  const bpm = Math.min(300, Math.max(40, Number.isFinite(bpmRaw) ? bpmRaw : 120));

  startTransport(bpm, () => {
    applyMixer(tracks);

    for (const t of tracks) {
      normalizeTrack(t);

      const L = Math.max(1, t.length|0);
      t.pos = ((t.pos|0) + 1) % L;

      if ((t._effectiveAudible ?? true) === true) {
        if (t.mode === 'piano') {
          const notes = (typeof notesStartingAt === 'function' ? notesStartingAt(t, t.pos) : []) || [];
          for (const n of notes) triggerEngine?.(t, n?.vel ?? 1, n?.pitch);
        } else {
          const st = Array.isArray(t.steps) ? t.steps[t.pos] : null;
          if (st && st.on) triggerEngine?.(t, st.vel ?? 1);
        }
      }

      // Per-track chain: advance when THIS track wraps
      if (t.pos === 0) advanceTrackChain(t);
    }

    paintPlayhead?.();

    // Throttle UI refresh to keep it light
    window.__kj_ui_counter = (window.__kj_ui_counter || 0) + 1;
    if ((window.__kj_ui_counter % 3) === 0) renderTrackChains?.();
  });
});

stopBtn && (stopBtn.onclick = () => {
  stopTransport();
  for (const t of tracks) t.pos = -1;
  paintPlayhead?.();
  renderCurrentEditor?.();
  renderTrackChains?.();
});

/* ---------------- Boot ---------------- */
tracks.push(normalizeTrack(createTrack('Kick',  'kick808', 16)));
tracks.push(normalizeTrack(createTrack('Hat',   'hat808',  12)));
tracks.push(normalizeTrack(createTrack('Synth', 'synth',   16)));

for (const t of tracks) {
  t.chain = [{ pattern: 0, repeats: 1 }];
  t.chainPos = 0;
  t.repeatsLeft = 1;
  normalizeTrack(t);
}
selectedTrackIndex = 0;

song.patterns.push(serializePattern('P1', tracks, 16));
song.current = 0;

refreshAndSelect(selectedTrackIndex);
refreshPatternSelect();
renderTrackChains();

/* Optional: lightweight heartbeat logging (comment out if noisy)
if (!window.__kj_log) {
  window.__kj_log = 0;
  setInterval(() => {
    console.log('[KJ] tick',
      tracks.map(tr => `${tr.name}:${tr.pos}/${tr.length} r${tr.repeatsLeft}`).join(' | ')
    );
  }, 600);
}
*/
