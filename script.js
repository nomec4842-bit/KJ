// ===== Audio core =====
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);

// ===== UI refs =====
const tempoInput  = document.getElementById('tempo');
const trackSel    = document.getElementById('trackSelect');
const addTrackBtn = document.getElementById('addTrack');
const engineSel   = document.getElementById('engine');
const seqEl       = document.getElementById('sequencer');
const paramsEl    = document.getElementById('params');

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
    renderGrid();
  });
  let tmr; cell.addEventListener('touchstart', ()=>{ tmr=setTimeout(()=>cell.click(), 350); });
  cell.addEventListener('touchend', ()=> clearTimeout(tmr));
  seqEl.appendChild(cell);
  gridCells.push(cell);
}

// ===== Track defaults & model =====
const defaults = {
  synth: { cutoff:2000, q:1, a:0.01, d:0.2, s:0.6, r:0.2, baseFreq:220 },
  kick808: { freq:55, pitchDecay:0.08, ampDecay:0.45, click:0.12 },
  snare808:{ tone:180, noise:0.6, decay:0.22 },
  hat808:  { decay:0.06, hpf:8000 },
  clap909: { bursts:3, spread:0.02, decay:0.10 },
};
const clone = (o)=> JSON.parse(JSON.stringify(o));

function createTrack(name, engine='synth'){
  // per-track bus: gain -> pan -> master
  const gain = ctx.createGain(); gain.gain.value = 0.9;
  const pan  = ctx.createStereoPanner(); pan.pan.value = 0;
  gain.connect(pan).connect(master);

  return {
    name,
    engine,                // 'synth' | 'kick808' | 'snare808' | 'hat808' | 'clap909'
    steps: Array.from({length:NUM_STEPS}, () => false),

    // mixer state
    gainNode: gain,
    panNode: pan,
    gain: 0.9,            // 0..1
    pan: 0,               // -1..1
    mute: false,
    solo: false,

    // instrument params
    params: {
      synth:   clone(defaults.synth),
      kick808: clone(defaults.kick808),
      snare808:clone(defaults.snare808),
      hat808:  clone(defaults.hat808),
      clap909: clone(defaults.clap909),
    }
  };
}

const tracks = [];
let selectedTrackIndex = 0;

// Seed demo tracks
tracks.push(createTrack('Track 1', 'kick808'));
tracks.push(createTrack('Track 2', 'synth'));
refreshTrackSelect();
selectTrack(0);

// ===== Transport =====
let isPlaying = false;
let stepIdx = 0;
let loopTimer = null;
const intervalMs = (bpm)=> ((60 / bpm) / 4) * 1000; // 16th notes

function start() {
  if (isPlaying) return;
  isPlaying = true;
  stepIdx = 0;
  const bpm = clampInt(+tempoInput.value || 120, 40, 300);
  const stepInterval = intervalMs(bpm);

  loopTimer = setInterval(() => {
    paintPlayhead(stepIdx);

    // Apply mixer (mute/solo) each tick
    applyMixer();

    // Trigger audible tracks
    for (const t of tracks) {
      if (!t._effectiveAudible) continue;
      if (t.steps[stepIdx]) triggerEngine(t.engine, t.params[t.engine], t.gainNode);
    }

    stepIdx = (stepIdx + 1) % NUM_STEPS;
  }, stepInterval);
}
function stop(){ isPlaying=false; clearInterval(loopTimer); gridCells.forEach(c=>c.classList.remove('playhead')); }
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
  engineSel.value = currentTrack().engine;
  renderGrid();
  renderParams();
}
const currentTrack = ()=> tracks[selectedTrackIndex];

trackSel.addEventListener('change', e => selectTrack(+e.target.value));

addTrackBtn.addEventListener('click', () => {
  const n = tracks.length + 1;
  tracks.push(createTrack(`Track ${n}`, 'synth'));
  refreshTrackSelect();
  selectTrack(tracks.length - 1);
});

engineSel.addEventListener('change', e => {
  const t = currentTrack();
  t.engine = e.target.value;
  refreshTrackSelect();
  renderParams();
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

// ===== Mixer =====
function applyMixer(){
  const anySolo = tracks.some(t => t.solo);
  for (const t of tracks){
    const audible = !t.mute && (!anySolo || t.solo);
    t._effectiveAudible = audible;
    t.gainNode.gain.value = audible ? t.gain : 0;
    t.panNode.pan.value = t.pan;
  }
}

// ===== Params UI (Mixer + Engine params) =====
function renderParams(){
  const t = currentTrack();
  const eng = t.engine;
  const p = t.params[eng];

  const field = (label, inputHtml, hint='') => `
    <div class="field">
      <label>${label}</label>
      <div class="inline">${inputHtml}${hint?`<span class="hint">${hint}</span>`:''}</div>
    </div>`;

  let html = '';

  // Mixer section
  html += `<div class="badge">Mixer</div>`;
  html += field('Volume', `<input id="mx_gain" type="range" min="0" max="1" step="0.01" value="${t.gain}">`);
  html += field('Pan', `<input id="mx_pan" type="range" min="-1" max="1" step="0.01" value="${t.pan}">`);
  html += field('Mute / Solo',
    `<button id="mx_mute" class="toggle ${t.mute?'active':''}">Mute</button>
     <button id="mx_solo" class="toggle ${t.solo?'active':''}">Solo</button>`);

  // Engine params
  html += `<div class="badge">Instrument • ${eng}</div>`;

  if (eng === 'synth'){
    html += field('Base Freq',
      `<input id="p_base" type="number" min="50" max="2000" step="1" value="${p.baseFreq}">`, 'Hz');
    html += field('Cutoff',
      `<input id="p_cutoff" type="range" min="100" max="12000" step="1" value="${p.cutoff}">`, 'LPF Hz');
    html += field('Q',
      `<input id="p_q" type="range" min="0.1" max="20" step="0.1" value="${p.q}">`);
    html += field('ADSR',
      `<input id="p_a" type="range" min="0" max="1" step="0.01" value="${p.a}">
       <input id="p_d" type="range" min="0" max="1.5" step="0.01" value="${p.d}">
       <input id="p_s" type="range" min="0" max="1" step="0.01" value="${p.s}">
       <input id="p_r" type="range" min="0" max="2" step="0.01" value="${p.r}">`,
       'A / D / S / R');
  }
  if (eng === 'kick808'){
    html += field('Pitch (Hz)', `<input id="k_freq" type="range" min="20" max="200" step="1" value="${p.freq}">`);
    html += field('Pitch Decay', `<input id="k_pdec" type="range" min="0.005" max="1" step="0.005" value="${p.pitchDecay}">`, 'sec');
    html += field('Amp Decay', `<input id="k_adec" type="range" min="0.05" max="2" step="0.01" value="${p.ampDecay}">`, 'sec');
    html += field('Click', `<input id="k_click" type="range" min="0" max="1" step="0.01" value="${p.click}">`);
  }
  if (eng === 'snare808'){
    html += field('Tone (Hz)', `<input id="n_tone" type="range" min="100" max="400" step="1" value="${p.tone}">`);
    html += field('Noise', `<input id="n_noise" type="range" min="0" max="1" step="0.01" value="${p.noise}">`);
    html += field('Decay', `<input id="n_decay" type="range" min="0.05" max="1" step="0.01" value="${p.decay}">`, 'sec');
  }
  if (eng === 'hat808'){
    html += field('Decay', `<input id="h_decay" type="range" min="0.01" max="1" step="0.01" value="${p.decay}">`, 'sec');
    html += field('HPF', `<input id="h_hpf" type="range" min="2000" max="12000" step="50" value="${p.hpf}">`, 'Hz');
  }
  if (eng === 'clap909'){
    html += field('Bursts', `<input id="c_bursts" type="number" min="2" max="5" step="1" value="${p.bursts}">`);
    html += field('Spread', `<input id="c_spread" type="range" min="0.005" max="0.06" step="0.001" value="${p.spread}">`, 'sec');
    html += field('Decay', `<input id="c_decay" type="range" min="0.05" max="1.5" step="0.01" value="${p.decay}">`, 'sec');
  }

  paramsEl.innerHTML = html;
  bindParamEvents();
}

function bindParamEvents(){
  const t = currentTrack();
  const eng = t.engine;
  const p = t.params[eng];

  // Mixer controls
  document.getElementById('mx_gain').oninput = (e)=>{
    t.gain = +e.target.value;
    applyMixer();
  };
  document.getElementById('mx_pan').oninput = (e)=>{
    t.pan = +e.target.value;
    applyMixer();
  };
  const muteBtn = document.getElementById('mx_mute');
  const soloBtn = document.getElementById('mx_solo');
  muteBtn.onclick = ()=>{ t.mute = !t.mute; muteBtn.classList.toggle('active', t.mute); applyMixer(); };
  soloBtn.onclick = ()=>{ t.solo = !t.solo; soloBtn.classList.toggle('active', t.solo); applyMixer(); };

  // Engine params
  if (eng === 'synth'){
    ['p_base','p_cutoff','p_q','p_a','p_d','p_s','p_r'].forEach(id=>{
      const el = document.getElementById(id);
      el.oninput = () => {
        p.baseFreq = +document.getElementById('p_base').value;
        p.cutoff   = +document.getElementById('p_cutoff').value;
        p.q        = +document.getElementById('p_q').value;
        p.a        = +document.getElementById('p_a').value;
        p.d        = +document.getElementById('p_d').value;
        p.s        = +document.getElementById('p_s').value;
        p.r        = +document.getElementById('p_r').value;
      };
    });
  }
  if (eng === 'kick808'){
    ['k_freq','k_pdec','k_adec','k_click'].forEach(id=>{
      document.getElementById(id).oninput = ()=>{
        p.freq = +document.getElementById('k_freq').value;
        p.pitchDecay = +document.getElementById('k_pdec').value;
        p.ampDecay   = +document.getElementById('k_adec').value;
        p.click      = +document.getElementById('k_click').value;
      };
    });
  }
  if (eng === 'snare808'){
    ['n_tone','n_noise','n_decay'].forEach(id=>{
      document.getElementById(id).oninput = ()=>{
        p.tone  = +document.getElementById('n_tone').value;
        p.noise = +document.getElementById('n_noise').value;
        p.decay = +document.getElementById('n_decay').value;
      };
    });
  }
  if (eng === 'hat808'){
    ['h_decay','h_hpf'].forEach(id=>{
      document.getElementById(id).oninput = ()=>{
        p.decay = +document.getElementById('h_decay').value;
        p.hpf   = +document.getElementById('h_hpf').value;
      };
    });
  }
  if (eng === 'clap909'){
    ['c_bursts','c_spread','c_decay'].forEach(id=>{
      document.getElementById(id).oninput = ()=>{
        p.bursts = clampInt(+document.getElementById('c_bursts').value, 2, 5);
        p.spread = +document.getElementById('c_spread').value;
        p.decay  = +document.getElementById('c_decay').value;
      };
    });
  }
}

// ===== Engines (send to per-track bus) =====
function triggerEngine(name, p, dest){
  switch(name){
    case 'synth':    synthBlip(p, dest); break;
    case 'kick808':  kick808(p, dest);   break;
    case 'snare808': snare808(p, dest);  break;
    case 'hat808':   hat808(p, dest);    break;
    case 'clap909':  clap909(p, dest);   break;
    default: synthBlip(defaults.synth, dest);
  }
}

function synthBlip(p, dest){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const vca = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(p.baseFreq, now);

  lpf.type = 'lowpass'; lpf.frequency.value = p.cutoff; lpf.Q.value = p.q;
  vca.gain.value = 0;

  osc.connect(lpf).connect(vca).connect(dest);

  vca.gain.setValueAtTime(0, now);
  vca.gain.linearRampToValueAtTime(0.25, now + p.a);
  vca.gain.linearRampToValueAtTime(0.25 * p.s, now + p.a + p.d);
  vca.gain.setTargetAtTime(0.0001, now + 0.22, Math.max(0.01, p.r));

  osc.start(now);
  osc.stop(now + 0.5 + p.r);
}

function kick808(p, dest){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const vca = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(Math.max(20, p.freq*3), now);
  osc.frequency.exponentialRampToValueAtTime(p.freq, now + p.pitchDecay);

  vca.gain.setValueAtTime(1.0, now);
  vca.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.05, p.ampDecay));

  osc.connect(vca).connect(dest);
  osc.start(now);
  osc.stop(now + Math.max(0.3, p.ampDecay + 0.1));

  if (p.click > 0){
    const clickBuf = ctx.createBuffer(1, ctx.sampleRate * 0.01, ctx.sampleRate);
    const ch = clickBuf.getChannelData(0);
    for (let i=0;i<ch.length;i++) ch[i] = (Math.random()*2-1) * Math.exp(-i/ch.length);
    const click = ctx.createBufferSource(); click.buffer = clickBuf;
    const g = ctx.createGain(); g.gain.value = p.click;
    click.connect(g).connect(dest); click.start(now);
  }
}

function snare808(p, dest){
  const now = ctx.currentTime;

  const tone = ctx.createOscillator();
  const tGain = ctx.createGain();
  tone.type = 'triangle'; tone.frequency.value = p.tone;
  tGain.gain.value = 0.3;
  tone.connect(tGain).connect(dest);
  tGain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
  tone.start(now); tone.stop(now + p.decay + 0.1);

  const bufDur = Math.max(0.05, p.decay);
  const buf = ctx.createBuffer(1, ctx.sampleRate*bufDur, ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value = 1200;
  const nGain = ctx.createGain(); nGain.gain.value = p.noise;

  src.connect(hpf).connect(nGain).connect(dest);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + bufDur);
  src.start(now); src.stop(now + bufDur);
}

function hat808(p, dest){
  const now = ctx.currentTime;
  const dur = Math.max(0.01, p.decay);

  const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = p.hpf;
  const vca = ctx.createGain(); vca.gain.value = 0.25;

  src.connect(hp).connect(vca).connect(dest);
  vca.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.start(now); src.stop(now + dur);
}

function clap909(p, dest){
  const now = ctx.currentTime;
  const bursts = clampInt(p.bursts, 2, 5);
  const spread = Math.max(0.005, p.spread);
  const tail = Math.max(0.05, p.decay);

  for(let i=0;i<bursts;i++){
    const t = now + i*spread;
    const buf = ctx.createBuffer(1, ctx.sampleRate*tail, ctx.sampleRate);
    const ch = buf.getChannelData(0); for (let j=0;j<ch.length;j++) ch[j] = Math.random()*2-1;

    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
    const vca = ctx.createGain(); vca.gain.value = 0.3;

    src.connect(bp).connect(vca).connect(dest);
    vca.gain.exponentialRampToValueAtTime(0.001, t + tail);
    src.start(t); src.stop(t + tail);
  }
}

// ===== helpers =====
function clampInt(v, lo, hi){ v = Math.floor(v); return Math.max(lo, Math.min(hi, v)); }
