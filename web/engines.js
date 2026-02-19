import { ctx } from './core.js';
import {
  isDspReady,
  renderSynthSamples,
  renderNoiseSamples,
  renderKickSamples,
  renderSnareSamples,
  renderHatSamples,
  renderClapSamples,
} from './dsp.js';

const DECLICK_TIME_SEC = 0.004;

function applyDeclickEnvelope(gainNode, peakGain, startTime, playDurationSec) {
  const peak = Number.isFinite(peakGain) ? Math.max(0, peakGain) : 1;
  const duration = Number.isFinite(playDurationSec) ? Math.max(0.001, playDurationSec) : 0.001;
  const fadeTime = Math.min(DECLICK_TIME_SEC, duration * 0.45);
  const fadeInEnd = startTime + fadeTime;
  const fadeOutStart = startTime + Math.max(fadeTime, duration - fadeTime);
  const stopTime = startTime + duration;

  gainNode.gain.cancelScheduledValues(startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peak, fadeInEnd);
  gainNode.gain.setValueAtTime(peak, fadeOutStart);
  gainNode.gain.linearRampToValueAtTime(0, stopTime);
  return stopTime;
}

function playSamples(samples, dest, when, durationSec) {
  if (!samples || samples.length === 0) return null;
  const target = dest || ctx.destination;
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.connect(gain).connect(target);
  const startTime = Number.isFinite(when) ? when : ctx.currentTime;
  const playDuration = Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(buffer.duration, durationSec)
    : buffer.duration;
  const stopTime = applyDeclickEnvelope(gain, 1, startTime, playDuration);
  if (playDuration) {
    source.start(startTime, 0, playDuration);
  } else {
    source.start(startTime);
  }
  source.stop(stopTime + 0.005);
  source.onended = () => {
    try { source.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  };
  return { source, gain };
}

/* ===========================
   Synth (supports semitone offset)
   =========================== */
export function synthBlip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSynthSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   Noise Synth (polyphonic)
   =========================== */
export function noiseSynth(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderNoiseSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Kick
   =========================== */
export function kick808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderKickSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Snare
   =========================== */
export function snare808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSnareSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Hat
   =========================== */
export function hat808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderHatSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   909 Clap
   =========================== */
export function clap909(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderClapSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   Sampler (supports semitone offset)
   =========================== */
export function samplerPlay(p, dest, vel = 1, sample, semis = 0, when, durationSec) {
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

  src.connect(vca).connect(dest || ctx.destination);
  const maxDur = Math.max(0.005, endSec - startSec);
  const duration = Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(maxDur, durationSec)
    : maxDur;
  applyDeclickEnvelope(vca, (p.gain ?? 1) * vel, startTime, duration);
  src.start(startTime, startSec, duration);
  src.stop(startTime + duration + 0.005);
}
