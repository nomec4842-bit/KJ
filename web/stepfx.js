import { clampInt } from './core.js';

export const STEP_FX_TYPES = Object.freeze({
  NONE: '',
  DELAY: 'delay',
  DUCK: 'duck',
  MULTIBAND_DUCK: 'multiband-duck',
});

const DELAY_DEFAULT = Object.freeze({
  mix: 0.5,
  feedback: 0.45,
  spacing: 0.5,
  repeats: 2,
});

const DUCK_DEFAULT = Object.freeze({
  depthDb: 12,
  attack: 0.05,
  hold: 0.2,
  release: 0.3,
  includeSelf: false,
});

const MULTIBAND_DUCK_DEFAULT = Object.freeze({
  lowDepthDb: 14,
  midDepthDb: 8,
  highDepthDb: 4,
  attack: 0.05,
  hold: 0.2,
  release: 0.3,
  includeSelf: false,
});

export const STEP_FX_DEFAULTS = Object.freeze({
  [STEP_FX_TYPES.DELAY]: DELAY_DEFAULT,
  [STEP_FX_TYPES.DUCK]: DUCK_DEFAULT,
  [STEP_FX_TYPES.MULTIBAND_DUCK]: MULTIBAND_DUCK_DEFAULT,
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
  if (rawType === STEP_FX_TYPES.DUCK) {
    return {
      type: STEP_FX_TYPES.DUCK,
      config: { ...DUCK_DEFAULT },
    };
  }
  if (rawType === STEP_FX_TYPES.MULTIBAND_DUCK) {
    return {
      type: STEP_FX_TYPES.MULTIBAND_DUCK,
      config: { ...MULTIBAND_DUCK_DEFAULT },
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

function normalizeDuckConfig(config) {
  const defaults = DUCK_DEFAULT;
  const source = config && typeof config === 'object' ? config : {};
  const depthDb = clampNumber(source.depthDb, 0, 36, defaults.depthDb);
  const attack = clampNumber(source.attack, 0, 4, defaults.attack);
  const hold = clampNumber(source.hold, 0, 8, defaults.hold);
  const release = clampNumber(source.release, 0, 8, defaults.release);
  const includeSelf = source.includeSelf === true;
  return { depthDb, attack, hold, release, includeSelf };
}

function normalizeMultibandDuckConfig(config) {
  const defaults = MULTIBAND_DUCK_DEFAULT;
  const source = config && typeof config === 'object' ? config : {};
  const lowDepthDb = clampNumber(source.lowDepthDb, 0, 36, defaults.lowDepthDb);
  const midDepthDb = clampNumber(source.midDepthDb, 0, 36, defaults.midDepthDb);
  const highDepthDb = clampNumber(source.highDepthDb, 0, 36, defaults.highDepthDb);
  const attack = clampNumber(source.attack, 0, 4, defaults.attack);
  const hold = clampNumber(source.hold, 0, 8, defaults.hold);
  const release = clampNumber(source.release, 0, 8, defaults.release);
  const includeSelf = source.includeSelf === true;
  return { lowDepthDb, midDepthDb, highDepthDb, attack, hold, release, includeSelf };
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
  if (rawType === STEP_FX_TYPES.DUCK) {
    return {
      type: STEP_FX_TYPES.DUCK,
      config: normalizeDuckConfig(definition.config),
    };
  }
  if (rawType === STEP_FX_TYPES.MULTIBAND_DUCK) {
    return {
      type: STEP_FX_TYPES.MULTIBAND_DUCK,
      config: normalizeMultibandDuckConfig(definition.config),
    };
  }

  return cloneFxDefaults();
}

export function createStepFx(type = STEP_FX_TYPES.NONE) {
  return cloneFxDefaults(type);
}
