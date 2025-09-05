// patterns.js
import { createTrack, resizeTrackSteps } from './tracks.js';

// Save current runtime state into a pattern
export function serializePattern(name, tracks, patternLen16 = 16) {
  return {
    name,
    len16: Math.max(1, Math.floor(patternLen16)),
    tracks: tracks.map(t => ({
      name: t.name,
      engine: t.engine,
      length: t.length,

      // STEP data
      steps: t.steps.map(s => ({ on: !!s.on, vel: s.vel ?? 1 })),

      // PIANO ROLL data
      mode: t.mode || 'steps',
      notes: (t.notes || []).map(n => ({
        start: n.start|0,
        length: Math.max(1, n.length|0),
        pitch: n.pitch|0,
        vel: n.vel ?? 1
      })),

      // Mixer/params/sample
      gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
      params: structuredClone(t.params),
      sampleName: t.sample?.name || ''
    }))
  };
}

// Load runtime state from a serialized pattern
export function instantiatePattern(pat, sampleCache = {}) {
  const tracks = [];
  for (const td of pat.tracks) {
    const t = createTrack(td.name, td.engine, td.length);

    // Steps
    resizeTrackSteps(t, td.length);
    for (let i = 0; i < td.length; i++) {
      const s = td.steps[i];
      t.steps[i].on = !!s?.on;
      t.steps[i].vel = (s?.vel ?? 1);
    }

    // Piano roll
    t.mode = td.mode || 'steps';
    t.notes = Array.isArray(td.notes) ? td.notes.map(n => ({
      start: Math.max(0, Math.min(td.length - 1, n.start|0)),
      length: Math.max(1, Math.min(td.length - (n.start|0), n.length|0)),
      pitch: n.pitch|0,
      vel: n.vel ?? 1
    })) : [];

    // Mixer/params/sample
    t.gain = td.gain; t.pan = td.pan; t.mute = td.mute; t.solo = td.solo;
    t.params = structuredClone(td.params);

    if (td.engine === 'sampler' && td.sampleName && sampleCache[td.sampleName]) {
      t.sample = { buffer: sampleCache[td.sampleName], name: td.sampleName };
    }

    tracks.push(t);
  }
  return { tracks, len16: pat.len16, name: pat.name };
}

export function clonePatternData(p) {
  return structuredClone(p);
}
