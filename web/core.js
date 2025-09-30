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
function intervalMs(bpm) { return ((60 / bpm) / 4) * 1000; }

export function startTransport(bpm, onTick) {
  if (_isPlaying) return;
  _isPlaying = true;
  const ms = intervalMs(bpm);
  _timer = setInterval(() => { try { onTick(); } catch(e) { console.error(e); } }, ms);
}

export function stopTransport() {
  _isPlaying = false;
  if (_timer) clearInterval(_timer);
  _timer = null;
}

export async function ensureAudioReady() {
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (err) { console.warn('Audio resume failed', err); }
  }
  await dspReady;
}
