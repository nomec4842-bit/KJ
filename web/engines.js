import { ctx } from './core.js';
import {
  isDspReady,
  renderSynthSamples,
  renderKickSamples,
  renderSnareSamples,
  renderHatSamples,
  renderClapSamples,
} from './dsp.js';

function playSamples(samples, dest, when) {
  if (!samples || samples.length === 0) return null;
  const target = dest || ctx.destination;
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 1;
  source.buffer = buffer;
  source.connect(gain).connect(target);
  const startTime = Number.isFinite(when) ? when : ctx.currentTime;
  source.start(startTime);
  const stopTime = startTime + buffer.duration + 0.05;
  source.stop(stopTime);
  source.onended = () => {
    try { source.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  };
  return { source, gain };
}

/* ===========================
   Synth (supports semitone offset)
   =========================== */
export function synthBlip(p, dest, vel = 1, semis = 0, when) {
  if (!isDspReady()) return;
  const samples = renderSynthSamples(p, vel, semis);
  playSamples(samples, dest, when);
}

/* ===========================
   808 Kick
   =========================== */
export function kick808(p, dest, vel = 1, when) {
  if (!isDspReady()) return;
  const samples = renderKickSamples(p, vel);
  playSamples(samples, dest, when);
}

/* ===========================
   808 Snare
   =========================== */
export function snare808(p, dest, vel = 1, when) {
  if (!isDspReady()) return;
  const samples = renderSnareSamples(p, vel);
  playSamples(samples, dest, when);
}

/* ===========================
   808 Hat
   =========================== */
export function hat808(p, dest, vel = 1, when) {
  if (!isDspReady()) return;
  const samples = renderHatSamples(p, vel);
  playSamples(samples, dest, when);
}

/* ===========================
   909 Clap
   =========================== */
export function clap909(p, dest, vel = 1, when) {
  if (!isDspReady()) return;
  const samples = renderClapSamples(p, vel);
  playSamples(samples, dest, when);
}

/* ===========================
   Sampler (supports semitone offset)
   =========================== */
export function samplerPlay(p, dest, vel = 1, sample, semis = 0, when) {
  if (!sample?.buffer) return;
  const startTime = Number.isFinite(when) ? when : ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;

  const totalSemis = (p.semis ?? 0) + (semis || 0);
  const rate = Math.pow(2, totalSemis / 12);
  src.playbackRate.setValueAtTime(rate, startTime);

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

  src.connect(vca).connect(dest || ctx.destination);
  src.start(startTime, startSec, Math.max(0.005, endSec - startSec));
}
