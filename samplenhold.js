// samplenhold.js
import { STEP_FX_TYPES, normalizeStepFx } from './tracks.js';

export function buildOffsetFromPath(pathParts, value) {
  if (!Array.isArray(pathParts) || !pathParts.length) return null;
  if (!Number.isFinite(value) || value === 0) return null;
  const root = {};
  let cursor = root;
  for (let i = 0; i < pathParts.length; i++) {
    const key = pathParts[i];
    if (!key) return null;
    if (i === pathParts.length - 1) {
      cursor[key] = value;
    } else {
      const next = {};
      cursor[key] = next;
      cursor = next;
    }
  }
  return root;
}

export function prepareSampleHoldConfig(baseConfig = {}, offsets = null) {
  const working = { ...(baseConfig || {}) };
  if (!offsets || typeof offsets !== 'object') {
    return working;
  }

  let amountTouched = false;
  let minTouched = false;
  let maxTouched = false;

  const apply = (target, source) => {
    if (!target || typeof target !== 'object' || !source || typeof source !== 'object') return;
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (target[key] && typeof target[key] === 'object') {
          apply(target[key], value);
        }
        continue;
      }
      if (!Number.isFinite(value) || value === 0) continue;
      const current = Number(target[key]);
      if (!Number.isFinite(current)) continue;
      target[key] = current + value;
      if (key === 'amount') amountTouched = true;
      else if (key === 'min') minTouched = true;
      else if (key === 'max') maxTouched = true;
    }
  };

  apply(working, offsets);

  if (amountTouched) {
    const baseAmountRaw = Number(baseConfig?.amount);
    const baseAmount = Number.isFinite(baseAmountRaw) ? Math.abs(baseAmountRaw) : 0;
    const nextAmountRaw = Number(working.amount);
    const nextAmount = Number.isFinite(nextAmountRaw) ? Math.abs(nextAmountRaw) : 0;
    const safeAmount = Math.max(0, nextAmount);
    working.amount = safeAmount;

    if (baseAmount > 0) {
      const baseMin = Number(baseConfig?.min);
      const baseMax = Number(baseConfig?.max);
      if (!minTouched && Number.isFinite(baseMin)) {
        const minRatio = baseMin / baseAmount;
        working.min = minRatio * safeAmount;
      }
      if (!maxTouched && Number.isFinite(baseMax)) {
        const maxRatio = baseMax / baseAmount;
        working.max = maxRatio * safeAmount;
      }
    }
  }

  const candidates = [
    Number.isFinite(working.amount) ? Math.abs(working.amount) : NaN,
    Number.isFinite(working.min) ? Math.abs(working.min) : NaN,
    Number.isFinite(working.max) ? Math.abs(working.max) : NaN,
  ].filter(Number.isFinite);
  if (candidates.length) {
    working.amount = Math.max(...candidates);
  } else if (Number.isFinite(baseConfig?.amount)) {
    working.amount = Math.abs(baseConfig.amount);
  }

  if (Number.isFinite(working.min) && Number.isFinite(working.max) && working.min > working.max) {
    const tmp = working.min;
    working.min = working.max;
    working.max = tmp;
  }

  return working;
}

export function evaluateSampleHoldFx(track, step, stepIndex, effectOffsets) {
  if (!track || !step) return null;
  const normalized = normalizeStepFx(step.fx);
  if (normalized.type !== STEP_FX_TYPES.SAMPLE_HOLD) return null;
  step.fx = normalized;
  const baseConfig = normalized.config || {};
  const effectKey = `${normalized.type ?? ''}`.toLowerCase();
  const overrides = effectOffsets && typeof effectOffsets === 'object'
    ? effectOffsets[effectKey]
    : null;
  const cfg = prepareSampleHoldConfig(baseConfig, overrides);
  const target = typeof cfg.target === 'string' ? cfg.target.trim() : '';
  if (!target) return null;

  const min = Number(cfg.min);
  const max = Number(cfg.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const chance = Number(cfg.chance);
  const probability = Number.isFinite(chance) ? Math.max(0, Math.min(1, chance)) : 0;
  const holdValue = Number(cfg.hold);
  const holdSteps = Number.isFinite(holdValue) ? Math.max(1, Math.min(128, Math.floor(holdValue))) : 1;

  if (!track._stepFxState || typeof track._stepFxState !== 'object') {
    track._stepFxState = {};
  }
  const store = track._stepFxState;
  if (!store.sampleHold || typeof store.sampleHold !== 'object') {
    store.sampleHold = {};
  }
  const sampleStore = store.sampleHold;
  const key = `${stepIndex}:${target}`;
  let state = sampleStore[key];
  if (!state || typeof state !== 'object') {
    state = sampleStore[key] = { remaining: 0, value: 0 };
  }

  if (!Number.isFinite(state.remaining)) state.remaining = 0;
  if (!Number.isFinite(state.value)) state.value = 0;

  if (state.remaining <= 0) {
    const shouldSample = Math.random() <= probability || !Number.isFinite(state.value);
    if (shouldSample) {
      const span = max - min;
      const next = span === 0 ? min : (min + Math.random() * span);
      state.value = Number.isFinite(next) ? next : 0;
      state.remaining = holdSteps;
    } else {
      state.remaining = 1;
    }
  }

  if (state.remaining > 0) state.remaining -= 1;

  const value = Number(state.value);
  if (!Number.isFinite(value)) {
    state.value = 0;
    return null;
  }

  const targetKey = target.toLowerCase();
  if (targetKey === 'velocity' || targetKey === 'vel' || targetKey === 'step.velocity') {
    if (value === 0) return { velocityOffset: 0 };
    return { velocityOffset: value };
  }

  const pathParts = target.split('.').map(p => p.trim()).filter(Boolean);
  const offsets = buildOffsetFromPath(pathParts, value);
  if (offsets) return { paramOffsets: offsets };
  return null;
}
