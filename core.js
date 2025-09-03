// core.js
export const ctx = new (window.AudioContext || window.webkitAudioContext)();
export const master = ctx.createGain();
master.gain.value = 0.9;
master.connect(ctx.destination);

// ===== Utilities =====
export function clampInt(v, lo, hi) {
  v = Math.floor(v);
  return Math.max(lo, Math.min(hi, v));
}

export const NUM_STEPS = 16;

// ===== Transport =====
let isPlaying = false, stepIdx = 0, loopTimer = null;

function intervalMs(bpm) {
  return ((60 / bpm) / 4) * 1000; // 16th notes
}

export function startTransport(bpm, onStep) {
  if (isPlaying) return;
  isPlaying = true;
  stepIdx = 0;

  const stepInterval = intervalMs(bpm);

  loopTimer = setInterval(() => {
    onStep(stepIdx);
    stepIdx = (stepIdx + 1) % NUM_STEPS;
  }, stepInterval);
}

export function stopTransport() {
  isPlaying = false;
  clearInterval(loopTimer);
}
