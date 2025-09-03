// engines.js
import { ctx } from './core.js';

// ===== Synth =====
export function synthBlip(p, dest, vel=1){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const vca = ctx.createGain();

  osc.type='sawtooth'; osc.frequency.setValueAtTime(p.baseFreq, now);
  lpf.type='lowpass'; lpf.frequency.value=p.cutoff; lpf.Q.value=p.q;
  vca.gain.value=0;
  osc.connect(lpf).connect(vca).connect(dest);

  vca.gain.setValueAtTime(0, now);
  vca.gain.linearRampToValueAtTime(0.25*vel, now + p.a);
  vca.gain.linearRampToValueAtTime(0.25*p.s*vel, now + p.a + p.d);
  vca.gain.setTargetAtTime(0.0001, now + 0.22, Math.max(0.01, p.r));

  osc.start(now); osc.stop(now + 0.5 + p.r);
}

// ===== Kick =====
export function kick808(p, dest, vel){
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const vca = ctx.createGain();
  osc.type='sine';
  osc.frequency.setValueAtTime(Math.max(20, p.freq*3), now);
  osc.frequency.exponentialRampToValueAtTime(p.freq, now + p.pitchDecay);
  vca.gain.setValueAtTime(1.0*vel, now);
  vca.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.05, p.ampDecay));
  osc.connect(vca).connect(dest);
  osc.start(now); osc.stop(now + Math.max(0.3, p.ampDecay + 0.1));

  if (p.click > 0){
    const clickBuf = ctx.createBuffer(1, ctx.sampleRate*0.01, ctx.sampleRate);
    const ch = clickBuf.getChannelData(0);
    for (let i=0;i<ch.length;i++) ch[i] = (Math.random()*2-1) * Math.exp(-i/ch.length);
    const click = ctx.createBufferSource(); click.buffer = clickBuf;
    const g = ctx.createGain(); g.gain.value = p.click * vel;
    click.connect(g).connect(dest); click.start(now);
  }
}

// ===== Snare =====
export function snare808(p, dest, vel){
  const now = ctx.currentTime;
  const tone = ctx.createOscillator();
  const tGain = ctx.createGain();
  tone.type='triangle'; tone.frequency.value=p.tone;
  tGain.gain.value=0.3 * vel;
  tone.connect(tGain).connect(dest);
  tGain.gain.exponentialRampToValueAtTime(0.001, now + p.decay);
  tone.start(now); tone.stop(now + p.decay + 0.1);

  const bufDur = Math.max(0.05, p.decay);
  const buf = ctx.createBuffer(1, ctx.sampleRate*bufDur, ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hpf = ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=1200;
  const nGain = ctx.createGain(); nGain.gain.value = p.noise * vel;
  src.connect(hpf).connect(nGain).connect(dest);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + bufDur);
  src.start(now); src.stop(now + bufDur);
}

// ===== Hat =====
export function hat808(p, dest, vel){
  const now = ctx.currentTime;
  const dur = Math.max(0.01, p.decay);
  const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i=0;i<ch.length;i++) ch[i] = Math.random()*2-1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=p.hpf;
  const vca = ctx.createGain(); vca.gain.value = 0.25 * vel;
  src.connect(hp).connect(vca).connect(dest);
  vca.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.start(now); src.stop(now + dur);
}

// ===== Clap =====
export function clap909(p, dest, vel){
  const now = ctx.currentTime;
  const bursts = Math.max(2, Math.min(5, p.bursts));
  const spread = Math.max(0.005, p.spread);
  const tail = Math.max(0.05, p.decay);
  for (let i=0;i<bursts;i++){
    const t = now + i*spread;
    const buf = ctx.createBuffer(1, ctx.sampleRate*tail, ctx.sampleRate);
    const ch = buf.getChannelData(0); for (let j=0;j<ch.length;j++) ch[j] = Math.random()*2-1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2000; bp.Q.value=0.7;
    const vca = ctx.createGain(); vca.gain.value = 0.3 * vel;
    src.connect(bp).connect(vca).connect(dest);
    vca.gain.exponentialRampToValueAtTime(0.001, t + tail);
    src.start(t); src.stop(t + tail);
  }
}
