import { isDspReady, renderNoiseSamples } from './dsp.js';
import { playSamples } from './engine-utils.js';

export function noiseSynth(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderNoiseSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}
