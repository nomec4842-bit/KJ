import { ctx, clampInt } from './core.js';
import { getStepVelocity } from './tracks.js';

const TAU = Math.PI * 2;

function wrapPhase(v = 0) {
  const frac = v % 1;
  return frac < 0 ? frac + 1 : frac;
}

const LFO_SHAPES = {
  sine: (phase) => Math.sin(phase * TAU),
  triangle: (phase) => 1 - 4 * Math.abs(0.5 - (phase % 1)),
  square: (phase) => ((phase % 1) < 0.5 ? 1 : -1),
  saw: (phase) => ((phase % 1) * 2) - 1,
  ramp: (phase) => ((phase % 1) * 2) - 1,
};

export const SAMPLE_HOLD_INPUT_OPTIONS = Object.freeze([
  { value: 'random', label: 'Random' },
  { value: 'stepVelocity', label: 'Step Velocity' },
]);

const DEFAULT_SAMPLE_INPUT = SAMPLE_HOLD_INPUT_OPTIONS[0]?.value || 'random';

const SAMPLE_INPUT_HANDLERS = {
  random() {
    return (Math.random() * 2) - 1;
  },
  stepVelocity(track) {
    if (!track || !Array.isArray(track.steps) || !track.steps.length) return 0;
    const index = Number(track.pos);
    if (!Number.isFinite(index) || index < 0) return 0;
    const step = track.steps[index % track.steps.length];
    if (!step || typeof step !== 'object') return 0;
    const fallback = step.on ? 1 : 0;
    const velocity = getStepVelocity(step, fallback);
    if (!Number.isFinite(velocity)) return 0;
    const clamped = Math.max(0, Math.min(1, velocity));
    return (clamped * 2) - 1;
  },
};

function evaluateLfo(track, mod) {
  const opts = mod?.options || {};
  const now = (ctx?.currentTime ?? (performance.now() / 1000));
  const state = mod._state || (mod._state = {
    phase: wrapPhase(opts.phase ?? 0),
    lastTime: now,
  });

  const rate = Number(opts.rate);
  const freq = Number.isFinite(rate) ? Math.max(0, rate) : 1;
  const elapsed = Math.max(0, now - (state.lastTime ?? now));
  if (freq > 0) {
    state.phase = wrapPhase(state.phase + elapsed * freq);
  } else if (Number.isFinite(opts.phase)) {
    state.phase = wrapPhase(opts.phase);
  }
  state.lastTime = now;

  const shapeKey = typeof opts.shape === 'string' ? opts.shape.toLowerCase() : 'sine';
  const shapeFn = LFO_SHAPES[shapeKey] || LFO_SHAPES.sine;
  let value = shapeFn(state.phase);

  if (opts.unipolar) value = (value + 1) / 2;
  if (Number.isFinite(opts.bias)) value += opts.bias;
  const depth = Number(opts.depth);
  if (Number.isFinite(depth)) value *= depth;

  return value;
}

function evaluateSampleHold(track, mod) {
  const opts = mod?.options || {};
  const state = mod._state || (mod._state = {
    remaining: 0,
    value: 0,
    lastStep: null,
  });

  const holdRaw = Number(opts.hold);
  const holdSteps = clampInt(Number.isFinite(holdRaw) ? holdRaw : 1, 1, 128);

  const currentStep = Number(track?.pos);
  if (Number.isFinite(currentStep)) {
    if (state.lastStep !== currentStep) {
      state.lastStep = currentStep;
      const remaining = Number(state.remaining);
      state.remaining = Number.isFinite(remaining) ? remaining - 1 : 0;
    }
  } else {
    state.lastStep = null;
    state.remaining = 0;
  }

  if (!Number.isFinite(state.remaining) || state.remaining <= 0) {
    const inputKeyRaw = typeof opts.sampleInput === 'string' ? opts.sampleInput : '';
    const inputKey = SAMPLE_INPUT_HANDLERS[inputKeyRaw] ? inputKeyRaw : DEFAULT_SAMPLE_INPUT;
    const sampler = SAMPLE_INPUT_HANDLERS[inputKey] || SAMPLE_INPUT_HANDLERS[DEFAULT_SAMPLE_INPUT];
    const next = sampler(track, mod);
    state.value = Number.isFinite(next) ? next : 0;
    state.remaining = holdSteps;
  }

  let value = Number(state.value);
  if (!Number.isFinite(value)) value = 0;

  if (opts.unipolar) value = (value + 1) / 2;
  if (Number.isFinite(opts.bias)) value += opts.bias;
  const depth = Number(opts.depth);
  if (Number.isFinite(depth)) value *= depth;

  return value;
}

const SOURCES = {
  lfo: evaluateLfo,
  sampleHold: evaluateSampleHold,
  samplehold: evaluateSampleHold,
};

function normalizeTarget(target) {
  if (Array.isArray(target)) {
    return target.map(t => `${t}`.trim()).filter(Boolean);
  }
  if (typeof target === 'string') {
    return target.split('.').map(p => p.trim()).filter(Boolean);
  }
  return [];
}

function assignOffset(root, path, value) {
  if (!Number.isFinite(value) || value === 0) return;
  const parts = [...path];
  const last = parts.pop();
  if (!last) return;
  let cursor = root;
  for (const key of parts) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  const current = cursor[last];
  cursor[last] = Number.isFinite(current) ? current + value : value;
}

export function applyMods(track) {
  if (!track || !Array.isArray(track.mods) || !track.mods.length) return null;

  const paramOffsets = {};
  const effectOffsets = {};
  let paramsTouched = false;
  let effectsTouched = false;

  for (const mod of track.mods) {
    if (!mod || typeof mod !== 'object') continue;
    if (mod.enabled === false) continue;
    const rawSource = typeof mod.source === 'string' ? mod.source : '';
    const handler = SOURCES[rawSource] || SOURCES[rawSource.toLowerCase?.()];
    if (!handler) continue;
    const normalized = handler(track, mod);
    const amount = Number(mod.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const delta = normalized * amount;
    if (!Number.isFinite(delta) || delta === 0) continue;
    const path = normalizeTarget(mod.target);
    if (!path.length) continue;

    const prefix = path[0]?.toLowerCase?.();
    if (prefix === 'fx' || prefix === 'stepfx' || prefix === 'effects' || prefix === 'effect') {
      if (path.length < 3) continue;
      const rawType = path[1];
      const effectType = typeof rawType === 'string' ? rawType.trim() : '';
      if (!effectType) continue;
      let effectPath = path.slice(2);
      if (effectPath[0]?.toLowerCase?.() === 'config') {
        effectPath = effectPath.slice(1);
      }
      if (!effectPath.length) continue;
      const key = effectType.toLowerCase();
      if (!key) continue;
      const bucket = effectOffsets[key] || (effectOffsets[key] = {});
      assignOffset(bucket, effectPath, delta);
      effectsTouched = true;
      continue;
    }

    assignOffset(paramOffsets, path, delta);
    paramsTouched = true;
  }

  if (!paramsTouched && !effectsTouched) return null;

  const result = {};
  if (paramsTouched) result.params = paramOffsets;
  if (effectsTouched) result.effects = effectOffsets;
  return result;
}
