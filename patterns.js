// patterns.js
import { createTrack, resizeTrackSteps } from './tracks.js';

// Serialize current runtime tracks into a pattern object
export function serializePattern(name, tracks, patternLen16 = 16) {
  return {
    name,
    len16: Math.max(1, Math.floor(patternLen16)),
    tracks: tracks.map(t => ({
      name: t.name,
      engine: t.engine,
      length: t.length,
      steps: t.steps.map(s => ({ on: !!s.on, vel: s.vel ?? 1 })),
      gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
      params: structuredClone(t.params),
      // keep sampler buffer by reference (not serialized), remember name for UX
      sampleName: t.sample?.name || ''
    }))
  };
}

// Rebuild runtime tracks from a serialized pattern.
// Optionally pass a sampleCache { [name]: AudioBuffer } to reattach buffers by name.
export function instantiatePattern(pat, sampleCache = {}) {
  const tracks = [];
  for (const td of pat.tracks) {
    const t = createTrack(td.name, td.engine, td.length);
    resizeTrackSteps(t, td.length);
    // copy steps
    for (let i = 0; i < td.length; i++) {
      const s = td.steps[i];
      t.steps[i].on = !!s.on;
      t.steps[i].vel = s.vel ?? 1;
    }
    // mixer
    t.gain = td.gain; t.pan = td.pan; t.mute = td.mute; t.solo = td.solo;
    // params
    t.params = structuredClone(td.params);
    // sampler buffer reconnect
    if (td.engine === 'sampler' && td.sampleName && sampleCache[td.sampleName]) {
      t.sample = { buffer: sampleCache[td.sampleName], name: td.sampleName };
    }
    tracks.push(t);
  }
  return { tracks, len16: pat.len16, name: pat.name };
}

// Deep clone (safe for plain data)
export function clonePatternData(p) {
  return structuredClone(p);
}
