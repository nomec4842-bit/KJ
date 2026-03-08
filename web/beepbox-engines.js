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

