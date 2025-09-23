import { clampInt } from './core.js';

export const STEP_FX_TYPES = Object.freeze({
  NONE: '',
  SAMPLE_HOLD: 'sampleHold',
});

export const STEP_FX_DEFAULTS = Object.freeze({
  [STEP_FX_TYPES.SAMPLE_HOLD]: Object.freeze({
    target: 'velocity',
    min: -0.25,
    max: 0.25,
    amount: 0.25,
    chance: 1,
    hold: 1,
  }),
});

function cloneFxDefaults(type = STEP_FX_TYPES.NONE) {
  if (type === STEP_FX_TYPES.SAMPLE_HOLD) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.SAMPLE_HOLD];
    return {
      type,
      config: {
        target: defaults.target,
        min: defaults.min,
        max: defaults.max,
        amount: defaults.amount,
        chance: defaults.chance,
        hold: defaults.hold,
      },
    };
  }
  return { type: STEP_FX_TYPES.NONE, config: {} };
}

export function normalizeStepFx(definition) {
  if (!definition || typeof definition !== 'object') {
    return cloneFxDefaults();
  }

  const type = typeof definition.type === 'string' ? definition.type.trim() : '';
  if (!type || !(type in STEP_FX_DEFAULTS)) {
    return cloneFxDefaults();
  }

  if (type === STEP_FX_TYPES.SAMPLE_HOLD) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.SAMPLE_HOLD];
    const source = definition.config && typeof definition.config === 'object'
      ? definition.config
      : {};

    let min = Number(source.min);
    if (!Number.isFinite(min)) {
      const amount = Number(source.amount);
      min = Number.isFinite(amount) ? -Math.abs(amount) : defaults.min;
    }

    let max = Number(source.max);
    if (!Number.isFinite(max)) {
      const amount = Number(source.amount);
      max = Number.isFinite(amount) ? Math.abs(amount) : defaults.max;
    }

    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    const chance = Number(source.chance);
    const normalizedChance = Number.isFinite(chance)
      ? Math.max(0, Math.min(1, chance))
      : defaults.chance;

    const hold = Number(source.hold);
    const normalizedHold = Number.isFinite(hold) ? hold : defaults.hold;
    const holdSteps = clampInt(normalizedHold, 1, 128);

    let amount = Number(source.amount);
    if (!Number.isFinite(amount)) {
      amount = Math.max(Math.abs(min), Math.abs(max), defaults.amount);
    } else {
      amount = Math.max(0, Math.abs(amount));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      amount = Math.max(Math.abs(min), Math.abs(max), defaults.amount);
    }

    const target = typeof source.target === 'string' ? source.target : defaults.target;

    return {
      type,
      config: {
        target,
        min,
        max,
        amount,
        chance: normalizedChance,
        hold: holdSteps,
      },
    };
  }

  return cloneFxDefaults();
}

export function createStepFx(type = STEP_FX_TYPES.NONE) {
  if (type === STEP_FX_TYPES.SAMPLE_HOLD) {
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.SAMPLE_HOLD];
    return normalizeStepFx({
      type,
      config: { ...defaults },
    });
  }
  return cloneFxDefaults();
}
