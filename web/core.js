import { initDsp } from './dsp.js';

export const ctx = new (window.AudioContext || window.webkitAudioContext)();

export const master = ctx.createGain();
master.gain.value = 0.9;
master.connect(ctx.destination);

export const dspReady = initDsp(ctx.sampleRate);

export function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

let _isPlaying = false;
let _timer = null;
let _nextNoteTime = 0;
let _stepIndex = 0;

function secondsPer16th(bpm) {
  return (60 / bpm) / 4;
}

export function startTransport(bpm, onTick) {
  if (_isPlaying) return;
  _isPlaying = true;
  _stepIndex = 0;
  _nextNoteTime = ctx.currentTime;

  const lookaheadMs = 25;
  const scheduleAhead = 0.1;
  const stepSeconds = secondsPer16th(bpm);

  _timer = setInterval(() => {
    while (_nextNoteTime < ctx.currentTime + scheduleAhead) {
      try {
        onTick?.(_stepIndex, _nextNoteTime);
      } catch (err) {
        console.error(err);
      }
      _nextNoteTime += stepSeconds;
      _stepIndex += 1;
    }
  }, lookaheadMs);
}

export function stopTransport() {
  _isPlaying = false;
  if (_timer) clearInterval(_timer);
  _timer = null;
  _nextNoteTime = 0;
  _stepIndex = 0;
}

export async function ensureAudioReady() {
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (err) { console.warn('Audio resume failed', err); }
  }
  await dspReady;
}
