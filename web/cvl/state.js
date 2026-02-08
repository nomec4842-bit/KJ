import { CVL_RATES } from './constants.js';

function normalizeSamples(samples = []) {
  return samples
    .filter((sample) => sample && typeof sample === 'object')
    .map((sample) => ({
      name: sample.name || 'Sample',
      duration: Number.isFinite(Number(sample.duration)) ? Number(sample.duration) : null,
    }));
}

function normalizeClips(clips = []) {
  return clips
    .filter((clip) => clip && typeof clip === 'object')
    .map((clip) => ({
      id: clip.id || `clip-${Math.random().toString(36).slice(2, 9)}`,
      lane: Number.isFinite(Number(clip.lane)) ? Math.max(0, Math.trunc(clip.lane)) : 0,
      start: Number.isFinite(Number(clip.start)) ? Math.max(0, Math.trunc(clip.start)) : 0,
      length: Number.isFinite(Number(clip.length)) ? Math.max(1, Math.trunc(clip.length)) : 4,
      sampleName: clip.sampleName || '',
    }));
}

export function getAllowedRates() {
  return new Set(CVL_RATES.map((rate) => rate.value));
}

export function normalizeCvlState(cvl) {
  if (!cvl || typeof cvl !== 'object') {
    return {
      lanes: 6,
      samples: [],
      clips: [],
      scrubberRate: '1/16',
      scrubberDepth: 0,
      snap: true,
    };
  }

  const lanes = Number(cvl.lanes);
  const scrubberDepth = Number(cvl.scrubberDepth);
  const scrubberRate = typeof cvl.scrubberRate === 'string' ? cvl.scrubberRate : '';
  const allowedRates = getAllowedRates();

  return {
    lanes: Number.isFinite(lanes) ? Math.max(1, Math.min(12, Math.round(lanes))) : 6,
    samples: normalizeSamples(cvl.samples),
    clips: normalizeClips(cvl.clips),
    scrubberRate: allowedRates.has(scrubberRate) ? scrubberRate : '1/16',
    scrubberDepth: Number.isFinite(scrubberDepth)
      ? Math.max(0, Math.min(1, scrubberDepth))
      : 0,
    snap: cvl.snap !== false,
  };
}
