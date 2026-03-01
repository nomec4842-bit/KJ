import { isDspReady, renderSynthSamples } from './dsp.js';
import { playSamples } from './engine-utils.js';

export function synthBlip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSynthSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}
