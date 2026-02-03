import {
  createTrack,
  resizeTrackSteps,
  createModulator,
  normalizeStep,
  getStepVelocity,
  setStepVelocity,
  normalizeTrackEffects,
  syncTrackEffects,
} from './tracks.js';

// structuredClone is not universally supported in all browsers, so fall back to
// JSON serialization when it's unavailable. This ensures pattern cloning works
// across environments without throwing a ReferenceError.
const clone = globalThis.structuredClone
  ? (obj) => globalThis.structuredClone(obj)
  : (obj) => JSON.parse(JSON.stringify(obj));

export function serializePattern(name, tracks, patternLen16 = 16) {
  return {
    name,
    len16: Math.max(1, Math.floor(patternLen16)),
    tracks: tracks.map(t => ({
      name: t.name,
      engine: t.engine,
      length: t.length,
      steps: t.steps.map(s => {
        const normalized = normalizeStep(s);
        return {
          on: !!normalized.on,
          vel: normalized.vel,
          params: clone(normalized.params),
          fx: clone(normalized.fx),
        };
      }),
      mode: t.mode || 'steps',
      arp: t.arp ? clone(t.arp) : null,
      notes: (t.notes || []).map(n => ({
        start: n.start|0,
        length: Math.max(1, n.length|0),
        pitch: n.pitch|0,
        vel: n.vel ?? 1
      })),
      gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
      params: clone(t.params),
      effects: clone(t.effects || {}),
      sampleName: t.sample?.name || '',
      mods: Array.isArray(t.mods) ? t.mods
        .filter(mod => mod && typeof mod === 'object')
        .map(mod => ({
          id: mod.id,
          source: mod.source,
          amount: Number.isFinite(mod.amount) ? mod.amount : Number(mod.amount) || 0,
          target: Array.isArray(mod.target) ? [...mod.target] : mod.target,
          options: clone(mod.options || {}),
          enabled: mod.enabled !== false,
        })) : []
    }))
  };
}

export function instantiatePattern(pat, sampleCache = {}) {
  const tracks = [];
  for (const td of pat.tracks) {
    const t = createTrack(td.name, td.engine, td.length);
    resizeTrackSteps(t, td.length);
    for (let i = 0; i < td.length; i++) {
      const source = td.steps?.[i];
      const normalizedStep = normalizeStep(source);
      normalizedStep.on = !!source?.on;
      const velocity = getStepVelocity(source, normalizedStep.on ? 1 : 0);
      normalizedStep.params = clone(normalizedStep.params);
      normalizedStep.fx = clone(normalizedStep.fx);
      setStepVelocity(normalizedStep, velocity);
      t.steps[i] = normalizedStep;
    }
    t.mode = td.mode || 'steps';
    t.arp = td.arp && typeof td.arp === 'object' ? clone(td.arp) : null;
    t.notes = Array.isArray(td.notes) ? td.notes.map(n => ({
      start: Math.max(0, Math.min(td.length - 1, n.start|0)),
      length: Math.max(1, Math.min(td.length - (n.start|0), n.length|0)),
      pitch: n.pitch|0,
      vel: n.vel ?? 1
    })) : [];
    t.gain = td.gain; t.pan = td.pan; t.mute = td.mute; t.solo = td.solo;
    t.params = clone(td.params);
    t.effects = normalizeTrackEffects(td.effects);
    syncTrackEffects(t);
    if (Array.isArray(td.mods)) {
      for (const mod of td.mods) {
        if (!mod || typeof mod !== 'object') continue;
        const amount = Number(mod.amount);
        createModulator(t, {
          id: mod.id,
          source: mod.source ?? 'lfo',
          amount: Number.isFinite(amount) ? amount : 0,
          target: Array.isArray(mod.target) ? [...mod.target] : mod.target,
          options: clone(mod.options || {}),
          enabled: mod.enabled !== false,
        });
      }
    }
    if (td.engine === 'sampler' && td.sampleName && sampleCache[td.sampleName]) {
      t.sample = { buffer: sampleCache[td.sampleName], name: td.sampleName };
    }
    tracks.push(t);
  }
  return { tracks, len16: pat.len16, name: pat.name };
}

export function clonePatternData(p) {
  return clone(p);
}
