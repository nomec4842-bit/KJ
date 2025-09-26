import { clampInt } from './core.js';

export const STEP_FX_TYPES = Object.freeze({
  NONE: '',
  DELAY: 'delay',
});

const DELAY_DEFAULT = Object.freeze({
  mix: 0.5,
  feedback: 0.45,
  spacing: 0.5,
  repeats: 2,
});

export const STEP_FX_DEFAULTS = Object.freeze({
  [STEP_FX_TYPES.DELAY]: DELAY_DEFAULT,
});

function cloneFxDefaults(type = STEP_FX_TYPES.NONE) {
  const rawType = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (!rawType || rawType === 'none' || rawType === STEP_FX_TYPES.NONE) {
    return { type: STEP_FX_TYPES.NONE, config: {} };
  }
  if (rawType === STEP_FX_TYPES.DELAY) {
    return {
      type: STEP_FX_TYPES.DELAY,
      config: { ...DELAY_DEFAULT },
    };
  }
  return { type: STEP_FX_TYPES.NONE, config: {} };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function normalizeDelayConfig(config) {
  const defaults = DELAY_DEFAULT;
  const source = config && typeof config === 'object' ? config : {};

  const mix = clampNumber(source.mix, 0, 1, defaults.mix);
  const feedback = clampNumber(source.feedback, 0, 0.95, defaults.feedback);
  const spacing = clampNumber(source.spacing, 0.05, 4, defaults.spacing);
  const repeatsRaw = Number(source.repeats);
  const repeatsRounded = Number.isFinite(repeatsRaw) ? Math.round(repeatsRaw) : defaults.repeats;
  const repeats = clampInt(repeatsRounded, 0, 8);

  return { mix, feedback, spacing, repeats };
}

export function normalizeStepFx(definition) {
  if (!definition || typeof definition !== 'object') {
    return cloneFxDefaults();
  }

  const rawType = typeof definition.type === 'string' ? definition.type.trim().toLowerCase() : '';
  if (!rawType || rawType === 'none' || rawType === STEP_FX_TYPES.NONE) {
    return cloneFxDefaults();
  }

  if (rawType === STEP_FX_TYPES.DELAY) {
    return {
      type: STEP_FX_TYPES.DELAY,
      config: normalizeDelayConfig(definition.config),
    };
  }

  return cloneFxDefaults();
}

export function createStepFx(type = STEP_FX_TYPES.NONE) {
  return cloneFxDefaults(type);
}
