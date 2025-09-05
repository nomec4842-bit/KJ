import { ctx } from './core.js';

/* ===========================
   Synth (supports semitone offset)
   =========================== */
export function synthBlip(p, dest, vel = 1, semis = 0) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lpf = ctx.createBiquadFilter();
  const vca = ctx.createGain();

  const base = Math.max(20, p.baseFreq ?? 220);
  const freq = base * Math.pow(2, (semis || 0) / 12);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, now);

  lpf.type = 'lowpass';
  lpf.frequency.value = p.cutoff ?? 2000;
  lpf.Q.value = p.q ?? 1;

  vca.gain.value = 0;
  osc.connect(lpf).connect(vca).connect(dest);

  const A = Math.max(0, p.a ?? 0.01);
  const D = Math.max(0, p.d ?? 0.2);
  const S = Math.max(0, Math.min(1, p.s ?? 0.6));
  const R = Math.max(0, p.r ?? 0.2);

  vca.gain.setValueAtTime(0, now);
  vca.gain.linearRampToValueAtTime(0.25 * vel, now + A);
  vca.gain.linearRampToValueAtTime(0.25 * S * vel, now + A + D);
  vca.gain.setTargetAtTime(0.0001, now + 0.22, Math.max(0.01, R));

  osc.start(now);
  osc.stop(now + 0.5 + R);
}

/* ===========================
   808 Kick
   =========================== */
export function kick808(p, dest, vel = 1) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const vca = ctx.createGain();

  const f = Math.max(20, p.freq ?? 55);
  const pdec = Math.max(0.005, p.pitchDecay ?? 0.08);
  const adec = Math.max(0.05, p.ampDecay ?? 0.45);
  const clickAmt = Math.max(0, p.click ?? 0.12);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(Math.max(20, f * 3), now);
  osc.frequency.exponentialRampToValueAtTime(f, now + pdec);

  vca.gain.setValueAtTime(1.0 * vel, now);
  vca.gain.exponentialRampToValueAtTime(0.001, now + adec);

  osc.connect(vca).connect(dest);
  osc.start(now);
  osc.stop(now + Math.max(0.3, adec + 0.1));

  if (clickAmt > 0) {
    const len = Math.floor(ctx.sampleRate * 0.01);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / len);
    const click = ctx.createBufferSource(); click.buffer = buf;
    const g = ctx.createGain(); g.gain.value = clickAmt * vel;
    click.connect(g).connect(dest);
    click.start(now);
  }
}

/* ===========================
   808 Snare
   =========================== */
export function snare808(p, dest, vel = 1) {
  const now = ctx.currentTime;

  const toneHz = Math.max(60, p.tone ?? 180);
  const tone = ctx.createOscillator();
  const tGain = ctx.createGain();
  tone.type = 'triangle';
  tone.frequency.value = toneHz;
  tGain.gain.value = 0.3 * vel;
  tone.connect(tGain).connect(dest);

  const dec = Math.max(0.05, p.decay ?? 0.22);
  tGain.gain.exponentialRampToValueAtTime(0.001, now + dec);
  tone.start(now);
  tone.stop(now + dec + 0.1);

  const noiseAmt = Math.max(0, p.noise ?? 0.6);
  const bufDur = dec;
  const nlen = Math.max(1, Math.floor(ctx.sampleRate * bufDur));
  const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nch = nbuf.getChannelData(0);
  for (let i = 0; i < nlen; i++) nch[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource(); src.buffer = nbuf;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 1200;
  const nGain = ctx.createGain(); nGain.gain.value = noiseAmt * vel;
  src.connect(hpf).connect(nGain).connect(dest);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + bufDur);
  src.start(now);
  src.stop(now + bufDur);
}

/* ===========================
   808 Hat
   =========================== */
export function hat808(p, dest, vel = 1) {
  const now = ctx.currentTime;
  const dur = Math.max(0.01, p.decay ?? 0.06);
  const hpfHz = Math.max(1000, p.hpf ?? 8000);

  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpfHz;
  const vca = ctx.createGain(); vca.gain.value = 0.25 * vel;

  src.connect(hp).connect(vca).connect(dest);
  vca.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.start(now);
  src.stop(now + dur);
}

/* ===========================
   909 Clap
   =========================== */
export function clap909(p, dest, vel = 1) {
  const now = ctx.currentTime;
  const bursts = Math.max(2, Math.min(5, p.bursts ?? 3));
  const spread = Math.max(0.005, p.spread ?? 0.02);
  const tail = Math.max(0.05, p.decay ?? 0.1);

  for (let i = 0; i < bursts; i++) {
    const t = now + i * spread;

    const len = Math.max(1, Math.floor(ctx.sampleRate * tail));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let j = 0; j < len; j++) ch[j] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
    const vca = ctx.createGain(); vca.gain.value = 0.3 * vel;

    src.connect(bp).connect(vca).connect(dest);
    vca.gain.exponentialRampToValueAtTime(0.001, t + tail);
    src.start(t);
    src.stop(t + tail);
  }
}

/* ===========================
   Sampler (supports semitone offset)
   =========================== */
export function samplerPlay(p, dest, vel = 1, sample, semis = 0) {
  if (!sample?.buffer) return;
  const now = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;

  const totalSemis = (p.semis ?? 0) + (semis || 0);
  const rate = Math.pow(2, totalSemis / 12);
  src.playbackRate.setValueAtTime(rate, now);

  const dur = sample.buffer.duration;
  const startNorm = Math.max(0, Math.min(1, p.start ?? 0));
  const endNorm = Math.max(startNorm, Math.min(1, p.end ?? 1));
  const startSec = startNorm * dur;
  const endSec = Math.max(startSec + 0.005, endNorm * dur);

  src.loop = !!p.loop;
  if (src.loop) {
    src.loopStart = startSec;
    src.loopEnd = endSec;
  }

  const vca = ctx.createGain();
  vca.gain.value = (p.gain ?? 1) * vel;

  src.connect(vca).connect(dest);
  src.start(now, startSec, Math.max(0.005, endSec - startSec));
}
