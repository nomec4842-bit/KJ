import { isDspReady, renderSynthSamples } from './dsp.js';
import { playSamples } from './engine-utils.js';

export function tb303Blip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const accent = Number.isFinite(Number(p?.accent)) ? Math.max(0, Number(p.accent)) : 0;
  const mapped = {
    baseFreq: p?.baseFreq ?? 110,
    cutoff: p?.cutoff ?? 1800,
    q: p?.q ?? 12,
    a: p?.a ?? 0.003,
    d: p?.d ?? 0.2,
    s: p?.s ?? 0.15,
    r: p?.r ?? 0.08,
    wavetable: !!p?.wavetable,
    morph: p?.morph ?? 0,
  };
  const samples = renderSynthSamples(mapped, vel * (1 + accent * 0.5), semis);
  playSamples(samples, dest, when, durationSec);
}
