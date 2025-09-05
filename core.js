export const ctx = new (window.AudioContext || window.webkitAudioContext)();

export const master = ctx.createGain();
master.gain.value = 0.9;
master.connect(ctx.destination);

export function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

// 16th-note scheduler (simple interval; good enough for MVP)
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
