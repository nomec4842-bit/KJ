export const BEEPBOX_SYNTH_ENGINES = Object.freeze([
  { id: 'beepbox_chip', label: 'BeepBox Chip' },
  { id: 'beepbox_fm', label: 'BeepBox FM' },
  { id: 'beepbox_pwm', label: 'BeepBox PWM' },
  { id: 'beepbox_harmonics', label: 'BeepBox Harmonics' },
  { id: 'beepbox_pickedString', label: 'BeepBox Picked String' },
  { id: 'beepbox_spectrum', label: 'BeepBox Spectrum' },
  { id: 'beepbox_supersaw', label: 'BeepBox Supersaw' },
]);

export const BEEPBOX_SYNTH_ENGINE_IDS = Object.freeze(BEEPBOX_SYNTH_ENGINES.map((engine) => engine.id));

export function isBeepboxSynthEngine(engine) {
  return BEEPBOX_SYNTH_ENGINE_IDS.includes(engine);
}

function cloneSynthParams(params) {
  const base = params && typeof params === 'object' ? params : {};
  const cloned = {
    ...base,
    oscillators: Array.isArray(base.oscillators)
      ? base.oscillators.slice(0, 3).map((osc) => ({ ...(osc && typeof osc === 'object' ? osc : {}) }))
      : [],
  };
  while (cloned.oscillators.length < 3) {
    cloned.oscillators.push({});
  }
  return cloned;
}

const BEEPBOX_PRESETS = Object.freeze({
  beepbox_chip: {
    a: 0.001, d: 0.12, s: 0.35, r: 0.08,
    cutoff: 6000, q: 0.7,
    wavetable: true, morph: 2048,
  },
  beepbox_fm: {
    a: 0.002, d: 0.18, s: 0.45, r: 0.16,
    cutoff: 10000, q: 0.9,
    wavetable: true, morph: 0,
  },
  beepbox_pwm: {
    a: 0.003, d: 0.2, s: 0.55, r: 0.18,
    cutoff: 2400, q: 4,
    wavetable: true, morph: 2048,
  },
  beepbox_harmonics: {
    a: 0.01, d: 0.22, s: 0.6, r: 0.24,
    cutoff: 5200, q: 1.4,
    wavetable: true, morph: 1365,
  },
  beepbox_pickedString: {
    a: 0.001, d: 0.08, s: 0.1, r: 0.1,
    cutoff: 1800, q: 3.5,
    wavetable: false, morph: 0,
  },
  beepbox_spectrum: {
    a: 0.004, d: 0.24, s: 0.5, r: 0.22,
    cutoff: 12000, q: 0.8,
    wavetable: true, morph: 512,
  },
  beepbox_supersaw: {
    a: 0.008, d: 0.25, s: 0.65, r: 0.24,
    cutoff: 7000, q: 0.75,
    wavetable: false, morph: 0,
    threeOsc: true,
    oscillatorPitches: [-0.07, 0, 0.07],
  },
});

export function getBeepboxSynthParams(engine, params) {
  const preset = BEEPBOX_PRESETS[engine];
  if (!preset) return params;

  const synth = cloneSynthParams(params);
  const baseFreq = Number(synth.baseFreq) || 220;
  Object.assign(synth, preset);

  if (preset.threeOsc) {
    const pitches = Array.isArray(preset.oscillatorPitches) ? preset.oscillatorPitches : [0, 0, 0];
    synth.oscillators = synth.oscillators.map((osc, index) => {
      const detuneSemis = Number(pitches[index]) || 0;
      const detunedFreq = baseFreq * Math.pow(2, detuneSemis / 12);
      return {
        ...osc,
        ...preset,
        threeOsc: undefined,
        oscillatorPitches: undefined,
        baseFreq: detunedFreq,
      };
    });
  }

  return synth;
}
