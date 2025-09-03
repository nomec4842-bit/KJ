// --- Audio setup ---
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

// --- UI + Sequencer ---
const engineSel = document.getElementById('engine');
const tempoInput = document.getElementById('tempo');
const seqEl = document.getElementById('sequencer');

const steps = [];
const NUM_STEPS = 16;

for (let i = 0; i < NUM_STEPS; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.index = i;
  cell.addEventListener('click', () => cell.classList.toggle('on'));

  // long-press opens future per-step inspector; for now, just toggle
  let t; cell.addEventListener('touchstart', ()=>{ t=setTimeout(()=>cell.classList.toggle('on'), 350); });
  cell.addEventListener('touchend', ()=> clearTimeout(t));

  seqEl.appendChild(cell);
  steps.push(cell);
}

// --- Transport ---
let isPlaying = false;
let stepIdx = 0;
let timer = null;

function scheduleIntervalMs(bpm){ return ((60 / bpm) / 4) * 1000; } // 16ths

function start() {
  if (isPlaying) return;
  isPlaying = true;
  stepIdx = 0;

  const bpm = clampInt(+(tempoInput.value || 120), 40, 300);
  const interval = scheduleIntervalMs(bpm);

  timer = setInterval(() => {
    paintPlayhead(stepIdx);

    if (steps[stepIdx].classList.contains('on')) {
      triggerEngine(engineSel.value);
    }

    stepIdx = (stepIdx + 1) % steps.length;
  }, interval);
}

function stop() {
  isPlaying = false;
  clearInterval(timer);
  steps.forEach(c => c.classList.remove('playhead'));
}

document.getElementById('play').onclick = async () => { await ctx.resume(); start(); };
document.getElementById('stop').onclick = stop;

// --- Visuals ---
function paintPlayhead(i){
  steps.forEach(c => c.classList.remove('playhead'));
  const cell = steps[i];
  if (cell) cell.classList.add('playhead');
}

// --- Engines ---
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
  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const vca = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);

  lpf.type = 'lowpass'; lpf.frequency.value = 2000; lpf.Q.value = 1;
  vca.gain.value = 0;

  osc.connect(lpf).connect(vca).connect(master);

  // simple ADSR-ish
  const now = ctx.currentTime;
  vca.gain.setValueAtTime(0, now);
  vca.gain.linearRampToValueAtTime(0.25, now + 0.01);   // A
  vca.gain.linearRampToValueAtTime(0.15, now + 0.18);   // D
  vca.gain.setTargetAtTime(0.0001, now + 0.22, 0.12);   // R

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

  // tonal body
  const tone = ctx.createOscillator();
  const tGain = ctx.createGain();
  tone.type = 'triangle';
  tone.frequency.value = 180;
  tGain.gain.value = 0.3;
  tone.connect(tGain).connect(master);
  tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  tone.start(now); tone.stop(now + 0.3);

  // noise
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

// --- tiny helpers ---
function clampInt(v, lo, hi){ v = Math.floor(v); return Math.max(lo, Math.min(hi, v)); }
