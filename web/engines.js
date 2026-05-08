import {
  isDspReady,
  renderKickSamples,
  renderSnareSamples,
  renderHatSamples,
  renderClapSamples,
} from './dsp.js';
import { playSamples } from './engine-utils.js';

export { synthBlip } from './synth-engine.js';
export { juno60Blip } from './juno60-engine.js';
export { tb303Blip } from './tb303-engine.js';
export { noiseSynth } from './noise-engine.js';
export { samplerPlay } from './sampler-engine.js';

/* ===========================
   808 Kick
   =========================== */
export function kick808(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderKickSamples(p, vel);
  return playSamples(samples, dest, when, durationSec, { pitchSemis: semis });
}

/* ===========================
   808 Snare
   =========================== */
export function snare808(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSnareSamples(p, vel);
  return playSamples(samples, dest, when, durationSec, { pitchSemis: semis });
}

/* ===========================
   808 Hat
   =========================== */
export function hat808(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderHatSamples(p, vel);
  return playSamples(samples, dest, when, durationSec, { pitchSemis: semis });
}

/* ===========================
   909 Clap
   =========================== */
export function clap909(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderClapSamples(p, vel);
  return playSamples(samples, dest, when, durationSec, { pitchSemis: semis });
}
