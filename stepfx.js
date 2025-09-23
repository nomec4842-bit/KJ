export const STEP_FX_TYPES = Object.freeze({
  NONE: '',
});

export const STEP_FX_DEFAULTS = Object.freeze({});

function cloneFxDefaults() {
  return { type: STEP_FX_TYPES.NONE, config: {} };
}

export function normalizeStepFx(definition) {
  if (!definition || typeof definition !== 'object') {
    return cloneFxDefaults();
  }

  const type = typeof definition.type === 'string' ? definition.type.trim() : '';
  if (!type || type === STEP_FX_TYPES.NONE) {
    return cloneFxDefaults();
  }

  return cloneFxDefaults();
}

export function createStepFx() {
  return cloneFxDefaults();
}
