// ===== Audio core =====
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

// ===== UI refs =====
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');

// ===== Sequencer/grid =====
const NUM_STEPS = 16;
const gridCells = [];
for (let i = 0; i < NUM_STEPS; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.index = i;
  cell.addEventListener('click', () => {
    const t = currentTrack();
    t.steps[i] = !t.steps[i];
    renderGrid(); // repaint the selected track
  });
  // Mobile long-press (future step inspector hook)
  let tmr; cell.addEventListener('touchstart', ()=>{ tmr=setTimeout(()=>cell.click(), 350); });
  cell.addEventListener('touchend', ()=> clearTimeout(tmr));

  seqEl.appendChild(cell);
  gridCells.push(cell);
}

// ===== Track model =====
function createTrack(name, engine='synth'){
  return {
    name,
    engine,            // 'synth' | 'kick808' | 'snare808' | 'hat808' | 'clap909'
    steps: Array.from({length:NUM_STEPS}, () => false)
  };
}

const tracks = [];
let selectedTrackIndex = 0;

// Seed a couple of tracks to demo layering
tracks.push(createTrack('Track 1', 'kick808'));
tracks.push(createTrack('Track 2', 'synth'));
refreshTrackSelect();
selectTrack(0);

// ===== Transport =====
let isPlaying = false;
let stepIdx = 0;
let loopTimer = null;

function intervalMs(bpm){ return ((60 / bpm) / 4) * 1000; } // 16th notes

function start() {
  if (isPlaying) return;
  isPlaying = true;
  stepIdx = 0;

  const bpm = clampInt(+tempoInput.value || 120, 40, 300);
  const stepInterval = intervalMs(bpm);

  loopTimer = setInterval(() => {
    // Visual playhead only on visible grid (selected track)
    paintPlayhead(stepIdx);

    // Trigger ALL tracks at this step if their step is active
    for (const t of tracks) {
      if (t.steps[stepIdx]) triggerEngine(t.engine);
    }

    stepIdx = (stepIdx + 1) % NUM_STEPS;
  }, stepInterval);
}

function stop() {
  isPlaying = false;
  clearInterval(loopTimer);
  gridCells.forEach(c => c.classList.remove('playhead'));
}

document.getElementById('play').onclick = async () => { await ctx.resume(); start(); };
document.getElementById('stop').onclick = stop;

// ===== Track UI =====
function refreshTrackSelect(){
  trackSel.innerHTML = '';
  tracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i+1}. ${t.name} (${t.engine})`;
    trackSel.appendChild(opt);
  });
  trackSel.value = String(selectedTrackIndex);
}

function selectTrack(i){
  selectedTrackIndex = clampInt(i, 0, tracks.length-1);
  trackSel.value = String(selectedTrackIndex);
  // reflect selected track props in header controls
  engineSel.value = currentTrack().engine;
  renderGrid();
}

function currentTrack(){ return tracks[selectedTrackIndex]; }

trackSel.addEventListener('change', (e) => selectTrack(+e.target.value));

addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  tracks.push(createTrack(`Track ${n}`, 'synth'));
  refreshTrackSelect();
  selectTrack(tracks.length - 1);
});

engineSel.addEventListener('change', (e) => {
  const t = currentTrack();
  t.engine = e.target.value;
  refreshTrackSelect(); // update labels like "(synth)"
});

// ===== Grid paint =====
function renderGrid(){
  const t = currentTrack();
  for (let i=0;i<NUM_STEPS;i++){
    gridCells[i].classList.toggle('on', !!t.steps[i]);
  }
}

function paintPlayhead(i){
  gridCells.forEach(c => c.classList.remove('playhead'));
  const cell = gridCells[i];
  if (cell) cell.classList.add('playhead');
}

// ===== Engines =====
function triggerEngine(name){
  switch(name){
    case 'synth':    synthBlip(); break;
    case 'kick808':  kick808();   break;
    case 'snare808': snare808();  break;
    case 'hat808':   hat808();    break;
    case 'clap909':  clap909();   break;
    default: synthBlip();
  }
}

function synthBlip(){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const vca = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);

  lpf.type = 'lowpass'; lpf.frequency.value = 2000; lpf.Q.value = 1;
  vca.gain.value = 0;

  osc.connect(lpf).connect(vca).connect(master);

  vca.gain.setValueAtTime(0, now);
  vca.gain.linearRampToValueAtTime(0.25, now + 0.01);
  vca.gain.linearRampToValueAtTime(0.15, now + 0.18);
  vca.gain.setTargetAtTime(0.0001, now + 0.22, 0.12);

  osc.start(now);
  osc.stop(now + 0.5);
}

function kick808(){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const vca = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.45);

  vca.gain.setValueAtTime(1.0, now);
  vca.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc.connect(vca).connect(master);
  osc.start(now);
  osc.stop(now + 0.5);

  // click
  const clickBuf = ctx.createBuffer(1, ctx.sampleRate * 0.01, ctx.sampleRate);
  const ch = clickBuf.getChannelData(0);
  for (let i=0;i<ch.length;i++) ch[i] = (Math.random()*2-1) * Math.exp(-i/ch.length);
  const click = ctx.createBufferSource(); click.buffer = clickBuf;
  const g = ctx.createGain(); g.gain.value = 0.12;
  click.connect(g).connect(master); click.start(now);
}

function snare808(){
  const now = ctx.currentTime;

  const tone = ctx.createOscillator();
  const tGain = ctx.createGain();
  tone.type = 'triangle'; tone.frequency.value = 180;
  tGain.gain.value = 0.3;
  tone.connect(tGain).connect(master);
  tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  tone.start(now); tone.stop(now + 0.3);

  const dur = 0.22;
  const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value = 1200;
  const nGain = ctx.createGain(); nGain.gain.value = 0.6;

  src.connect(hpf).connect(nGain).connect(master);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.start(now); src.stop(now + dur);
}

function hat808(){
  const now = ctx.currentTime;
  const dur = 0.06;

  const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 8000;
  const vca = ctx.createGain(); vca.gain.value = 0.25;

  src.connect(hp).connect(vca).connect(master);
  vca.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.start(now); src.stop(now + dur);
}

function clap909(){
  const now = ctx.currentTime;
  const bursts = 3;
  const spread = 0.02;

  for(let i=0;i<bursts;i++){
    const t = now + i*spread;
    const dur = 0.1;

    const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const ch = buf.getChannelData(0); for (let j=0;j<ch.length;j++) ch[j] = Math.random()*2-1;

    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
    const vca = ctx.createGain(); vca.gain.value = 0.3;

    src.connect(bp).connect(vca).connect(master);
    vca.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur);
  }
}

// ===== Tiny helpers =====
function clampInt(v, lo, hi){ v = Math.floor(v); return Math.max(lo, Math.min(hi, v)); }
