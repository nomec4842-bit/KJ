import { isDspReady, renderJunoSamples } from './dsp.js';
import { playSamples } from './engine-utils.js';

export function juno60Blip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderJunoSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}
