import { ctx } from './core.js';

const DECLICK_TIME_SEC = 0.004;

export function applyDeclickEnvelope(gainNode, peakGain, startTime, playDurationSec) {
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

export function playSamples(samples, dest, when, durationSec) {
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
