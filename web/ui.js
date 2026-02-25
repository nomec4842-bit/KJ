// ui.js
import {
  createModulator,
  removeModulator,
  getStepVelocity,
  setStepVelocity,
  STEP_FX_TYPES,
  STEP_FX_DEFAULTS,
  normalizeStepFx,
  TRACK_FX_DEFAULTS,
  normalizeTrackEffects,
} from './tracks.js';
import { SAMPLE_HOLD_INPUT_OPTIONS } from './mods.js';

const MOD_SOURCES = [
  { value: 'lfo', label: 'LFO' },
  { value: 'sampleHold', label: 'Sample & Hold' },
];

const LFO_SHAPE_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'saw', label: 'Saw' },
  { value: 'ramp', label: 'Ramp' },
];

const SYNTH_BASE_TARGETS = [
  { value: 'synth.baseFreq', label: 'Base Freq' },
  { value: 'synth.cutoff', label: 'Filter Cutoff' },
  { value: 'synth.q', label: 'Filter Q' },
  { value: 'synth.a', label: 'Env Attack' },
  { value: 'synth.d', label: 'Env Decay' },
  { value: 'synth.s', label: 'Env Sustain' },
  { value: 'synth.r', label: 'Env Release' },
];

const SYNTH_MORPH_TARGET = { value: 'synth.morph', label: 'Morph' };

const TARGETS_BY_ENGINE = {
  synth: [...SYNTH_BASE_TARGETS],
  tb303: [
    { value: 'tb303.baseFreq', label: 'Base Freq' },
    { value: 'tb303.cutoff', label: 'Filter Cutoff' },
    { value: 'tb303.q', label: 'Resonance' },
    { value: 'tb303.a', label: 'Env Attack' },
    { value: 'tb303.d', label: 'Env Decay' },
    { value: 'tb303.s', label: 'Env Sustain' },
    { value: 'tb303.r', label: 'Env Release' },
    { value: 'tb303.accent', label: 'Accent' },
    { value: 'tb303.morph', label: 'Morph' },
  ],
  noise: [
    { value: 'noise.cutoff', label: 'Filter Cutoff' },
    { value: 'noise.q', label: 'Filter Q' },
    { value: 'noise.a', label: 'Env Attack' },
    { value: 'noise.d', label: 'Env Decay' },
    { value: 'noise.s', label: 'Env Sustain' },
    { value: 'noise.r', label: 'Env Release' },
    { value: 'noise.gain', label: 'Gain' },
  ],
  kick808: [
    { value: 'kick808.freq', label: 'Pitch' },
    { value: 'kick808.pitchDecay', label: 'Pitch Decay' },
    { value: 'kick808.ampDecay', label: 'Amp Decay' },
    { value: 'kick808.click', label: 'Click' },
  ],
  snare808: [
    { value: 'snare808.tone', label: 'Tone' },
    { value: 'snare808.noise', label: 'Noise' },
    { value: 'snare808.decay', label: 'Decay' },
  ],
  hat808: [
    { value: 'hat808.decay', label: 'Decay' },
    { value: 'hat808.hpf', label: 'HPF' },
  ],
  clap909: [
    { value: 'clap909.bursts', label: 'Bursts' },
    { value: 'clap909.spread', label: 'Spread' },
    { value: 'clap909.decay', label: 'Decay' },
  ],
  sampler: [
    { value: 'sampler.start', label: 'Start' },
    { value: 'sampler.end', label: 'End' },
    { value: 'sampler.semis', label: 'Semitones' },
    { value: 'sampler.gain', label: 'Gain' },
  ],
};

const FALLBACK_TARGETS = Object.freeze(
  Object.values(TARGETS_BY_ENGINE).flat()
);

const NOTE_PARAM_TARGETS = [
  { value: 'vel', label: 'Velocity' },
  { value: 'chance', label: 'Chance' },
  { value: 'length', label: 'Length' },
];

const CVL_TARGETS = [
  { value: 'cvl.scrubber', label: 'CVL Scrubber' },
];

function getNoteTargetOptions(track) {
  if (!track || !Array.isArray(track.noteModTargets) || !track.noteModTargets.length) return [];
  const options = [];
  track.noteModTargets.forEach((target) => {
    const step = Number(target?.step);
    const pitch = Number(target?.pitch);
    if (!Number.isFinite(step) || !Number.isFinite(pitch)) return;
    const stepIndex = Math.max(0, Math.trunc(step));
    const pitchValue = Math.trunc(pitch);
    const prefixLabel = `Note ${stepIndex + 1} · Pitch ${pitchValue}`;
    NOTE_PARAM_TARGETS.forEach((param) => {
      options.push({
        value: `note.${stepIndex}.${pitchValue}.${param.value}`,
        label: `${prefixLabel} ${param.label}`,
      });
    });
  });
  return options;
}

function withNoteTargets(track, options) {
  const noteOptions = getNoteTargetOptions(track);
  if (!noteOptions.length) return options;
  return [...options, ...noteOptions];
}

function getTargetOptionsForTrack(track) {
  const engine = track?.engine;
  const isCvl = track?.type === 'cvl';
  if (engine && TARGETS_BY_ENGINE[engine]) {
    if (engine === 'synth') {
      const synthParams = track?.params?.synth || {};
      if (synthParams.threeOsc) {
        const oscillators = Array.isArray(synthParams.oscillators) ? synthParams.oscillators : [];
        const options = [];
        oscillators.slice(0, 3).forEach((osc, index) => {
          const prefix = `synth.oscillators.${index}`;
          const labelPrefix = `Osc ${index + 1}`;
          SYNTH_BASE_TARGETS.forEach((target) => {
            const suffix = target.value.replace('synth.', '');
            options.push({
              value: `${prefix}.${suffix}`,
              label: `${labelPrefix} ${target.label}`,
            });
          });
          if (osc?.wavetable) {
            options.push({
              value: `${prefix}.morph`,
              label: `${labelPrefix} ${SYNTH_MORPH_TARGET.label}`,
            });
          }
        });
        const merged = isCvl ? [...options, ...CVL_TARGETS] : options;
        return withNoteTargets(track, merged);
      }
      const options = [...TARGETS_BY_ENGINE.synth];
      if (synthParams.wavetable) {
        options.push(SYNTH_MORPH_TARGET);
      }
      const merged = isCvl ? [...options, ...CVL_TARGETS] : options;
      return withNoteTargets(track, merged);
    }
    const options = TARGETS_BY_ENGINE[engine];
    const merged = isCvl ? [...options, ...CVL_TARGETS] : options;
    return withNoteTargets(track, merged);
  }
  const merged = isCvl ? [...FALLBACK_TARGETS, ...CVL_TARGETS] : FALLBACK_TARGETS;
  return withNoteTargets(track, merged);
}

function createModCell(labelText, controlEl) {
  const wrap = document.createElement('div');
  wrap.className = 'mod-cell';
  const label = document.createElement('span');
  label.textContent = labelText;
  wrap.appendChild(label);
  wrap.appendChild(controlEl);
  return wrap;
}

function formatSliderValue(value, maxDecimals = 3) {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  let decimals = Math.max(0, Math.min(6, maxDecimals));
  if (abs >= 1000) decimals = 0;
  else if (abs >= 100) decimals = Math.min(decimals, 1);
  else if (abs >= 10) decimals = Math.min(decimals, 2);
  const str = value.toFixed(decimals);
  return str.replace(/\.0+$|(?<=\.\d*[1-9])0+$/g, '').replace(/\.$/, '');
}

function createSliderControl(options = {}) {
  const {
    min = 0,
    max = 1,
    step = 0.01,
    value = 0,
    allowExtend = false,
    format = (val) => formatSliderValue(val),
    parseDisplay = (text) => Number.parseFloat(text),
    className = '',
  } = options || {};

  const wrap = document.createElement('div');
  wrap.className = ['slider-control', className].filter(Boolean).join(' ');

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = `${min}`;
  slider.max = `${max}`;
  slider.step = `${step}`;
  slider.value = `${value}`;
  slider.className = 'slider-control-input';

  const valueEl = document.createElement('span');
  valueEl.className = 'slider-control-value';
  valueEl.contentEditable = 'true';
  valueEl.spellcheck = false;
  valueEl.setAttribute('aria-disabled', 'false');

  const applyStep = (val) => {
    const stepVal = Number(slider.step);
    if (!Number.isFinite(stepVal) || stepVal <= 0) return val;
    const minVal = Number(slider.min);
    const steps = Math.round((val - minVal) / stepVal);
    const quantized = minVal + steps * stepVal;
    return Number.isFinite(quantized) ? Number(quantized.toFixed(6)) : val;
  };

  const extendRangeIfNeeded = (val) => {
    if (!allowExtend || !Number.isFinite(val)) return;
    if (val < Number(slider.min)) slider.min = `${val}`;
    if (val > Number(slider.max)) slider.max = `${val}`;
  };

  const clampToRange = (val) => {
    if (!Number.isFinite(val)) return Number(slider.value);
    let result = applyStep(val);
    if (!allowExtend) {
      const minVal = Number(slider.min);
      const maxVal = Number(slider.max);
      if (result < minVal) result = minVal;
      if (result > maxVal) result = maxVal;
    }
    return result;
  };

  const updateDisplay = () => {
    const current = Number(slider.value);
    valueEl.textContent = format(current);
  };

  let changeHandler = typeof options.onChange === 'function' ? options.onChange : null;

  const notify = (val, source) => {
    if (typeof changeHandler === 'function') changeHandler(val, { source });
  };

  slider.addEventListener('input', () => {
    const current = Number(slider.value);
    valueEl.textContent = format(current);
    notify(current, 'slider');
  });

  valueEl.addEventListener('focus', () => {
    valueEl.dataset.prevValue = valueEl.textContent || '';
  });

  valueEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      valueEl.blur();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      valueEl.textContent = valueEl.dataset.prevValue ?? format(Number(slider.value));
      valueEl.blur();
    }
  });

  valueEl.addEventListener('blur', () => {
    const text = valueEl.textContent ?? '';
    const parsed = parseDisplay(text);
    if (!Number.isFinite(parsed)) {
      valueEl.textContent = format(Number(slider.value));
      return;
    }
    extendRangeIfNeeded(parsed);
    const finalVal = clampToRange(parsed);
    slider.value = `${finalVal}`;
    valueEl.textContent = format(finalVal);
    notify(finalVal, 'input');
  });

  wrap.appendChild(slider);
  wrap.appendChild(valueEl);
  updateDisplay();

  return {
    wrap,
    input: slider,
    valueEl,
    setOnChange(fn) {
      changeHandler = typeof fn === 'function' ? fn : null;
    },
    setValue(val, { silent = false } = {}) {
      if (!Number.isFinite(val)) return;
      extendRangeIfNeeded(val);
      const finalVal = clampToRange(val);
      slider.value = `${finalVal}`;
      valueEl.textContent = format(finalVal);
      if (!silent) notify(finalVal, 'programmatic');
    },
    updateDisplay,
  };
}

export function refreshTrackSelect(selectEl, tracks, selectedIndex) {
  selectEl.innerHTML = '';
  tracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    const typeLabel = t.type === 'cvl' ? 'CVL' : 'Standard';
    opt.textContent = `${i + 1}. ${t.name} (${typeLabel} • ${t.engine})`;
    selectEl.appendChild(opt);
  });
  selectEl.value = String(selectedIndex);
}

function createInlineStepEditor(rootEl) {
  if (!rootEl) return null;

  let onSelect = null;
  let buttons = [];

  function handleClick(index) {
    if (typeof onSelect === 'function') {
      onSelect(index);
    }
  }

  function rebuild(length) {
    const len = Math.max(0, Number.isFinite(length) ? Math.trunc(length) : 0);
    buttons = [];
    rootEl.innerHTML = '';
    for (let i = 0; i < len; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini-step';
      btn.dataset.index = String(i);
      btn.setAttribute('aria-label', `Select step ${i + 1}`);
      btn.setAttribute('aria-pressed', 'false');
      btn.title = `Step ${i + 1}`;
      const velBar = document.createElement('div');
      velBar.className = 'vel';
      velBar.style.height = '0%';
      btn.appendChild(velBar);
      btn.addEventListener('click', () => handleClick(i));
      rootEl.appendChild(btn);
      buttons.push(btn);
    }
  }

  function update(steps = []) {
    buttons.forEach((btn, idx) => {
      const step = steps[idx];
      const active = !!step?.on;
      btn.classList.toggle('on', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      const bar = btn.querySelector('.vel');
      if (bar) {
        const vel = getStepVelocity(step, active ? 1 : 0);
        const clamped = Math.max(0, Math.min(1, vel));
        bar.style.height = Math.round(clamped * 100) + '%';
      }
      if (step) {
        const vel = getStepVelocity(step, 0);
        const clamped = Math.max(0, Math.min(1, vel));
        btn.title = `Step ${idx + 1} • Vel ${Math.round(clamped * 127)}`;
      } else {
        btn.title = `Step ${idx + 1}`;
      }
    });
  }

  function paint(stepIndex) {
    buttons.forEach(btn => btn.classList.remove('playhead'));
    if (stepIndex >= 0 && stepIndex < buttons.length) {
      buttons[stepIndex].classList.add('playhead');
    }
  }

  function setOnSelect(fn) {
    onSelect = typeof fn === 'function' ? fn : null;
  }

  return { rebuild, update, paint, setOnSelect };
}

function createStepParamsPanel(rootEl, track) {
  if (!rootEl) return null;

  let onChange = null;
  let selectedIndex = -1;
  let suppressEvents = false;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = '1';
  slider.className = 'step-param-slider';
  slider.setAttribute('aria-label', 'Step velocity');

  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.min = '0';
  numberInput.max = '127';
  numberInput.step = '1';
  numberInput.value = '127';
  numberInput.className = 'step-param-value';
  numberInput.setAttribute('aria-label', 'Step velocity (0-127)');
  numberInput.inputMode = 'numeric';

  const stateLabel = document.createElement('span');
  stateLabel.className = 'step-param-state hint';

  const controls = document.createElement('div');
  controls.className = 'step-param-controls';
  controls.appendChild(slider);
  controls.appendChild(numberInput);
  controls.appendChild(stateLabel);

  const showPlaceholder = (message) => {
    rootEl.innerHTML = `<span class="hint">${message}</span>`;
    rootEl.classList.add('placeholder');
  };

  const ensureControls = () => {
    if (rootEl.contains(controls)) return;
    rootEl.innerHTML = '';
    rootEl.classList.remove('placeholder');
    rootEl.appendChild(controls);
  };

  const updateStateLabel = (step) => {
    if (!step) {
      stateLabel.textContent = '';
      return;
    }
    stateLabel.textContent = step.on ? 'On' : 'Off';
  };

  const commitVelocity = (value) => {
    if (selectedIndex < 0) return;
    const steps = track?.steps;
    if (!Array.isArray(steps)) return;
    const step = steps[selectedIndex];
    if (!step) return;
    const normalized = Math.max(0, Math.min(1, Number(value) || 0));
    setStepVelocity(step, normalized);
    suppressEvents = true;
    slider.value = String(normalized);
    numberInput.value = String(Math.round(normalized * 127));
    suppressEvents = false;
    updateStateLabel(step);
    if (typeof onChange === 'function') onChange(selectedIndex, step);
  };

  slider.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const val = Number(ev.target.value);
    if (!Number.isFinite(val)) return;
    commitVelocity(val);
  });

  numberInput.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const midi = Number.parseInt(ev.target.value, 10);
    if (!Number.isFinite(midi)) return;
    const normalized = Math.max(0, Math.min(1, midi / 127));
    commitVelocity(normalized);
  });

  const updateSelection = (index) => {
    selectedIndex = Number.isInteger(index) ? index : -1;
    if (!track || track.mode !== 'steps') {
      showPlaceholder('Step parameters are available in Steps mode.');
      return;
    }
    const steps = track.steps;
    if (!Array.isArray(steps) || selectedIndex < 0 || selectedIndex >= steps.length) {
      showPlaceholder('Select a step to edit velocity.');
      return;
    }
    const step = steps[selectedIndex];
    ensureControls();
    const vel = getStepVelocity(step, step?.on ? 1 : 0);
    const clamped = Math.max(0, Math.min(1, vel));
    suppressEvents = true;
    slider.value = String(clamped);
    numberInput.value = String(Math.round(clamped * 127));
    suppressEvents = false;
    slider.disabled = false;
    numberInput.disabled = false;
    updateStateLabel(step);
  };

  showPlaceholder('Select a step to edit velocity.');

  return {
    updateSelection,
    refresh() {
      updateSelection(selectedIndex);
    },
    setOnChange(fn) {
      onChange = typeof fn === 'function' ? fn : null;
    },
  };
}

export function createPianoNoteParamsPanel(rootEl, getTrack) {
  if (!rootEl) return null;

  let onChange = null;
  let selectedNote = null;
  let suppressEvents = false;

  const makeGroup = (labelText) => {
    const group = document.createElement('div');
    group.className = 'note-param-group';

    const label = document.createElement('span');
    label.className = 'note-param-label';
    label.textContent = labelText;
    group.appendChild(label);

    return { group };
  };

  const velSlider = document.createElement('input');
  velSlider.type = 'range';
  velSlider.min = '0';
  velSlider.max = '1';
  velSlider.step = '0.01';
  velSlider.value = '1';
  velSlider.className = 'note-param-slider';
  velSlider.setAttribute('aria-label', 'Note velocity');

  const velNumber = document.createElement('input');
  velNumber.type = 'number';
  velNumber.min = '0';
  velNumber.max = '127';
  velNumber.step = '1';
  velNumber.value = '127';
  velNumber.className = 'note-param-value';
  velNumber.setAttribute('aria-label', 'Note velocity (0-127)');
  velNumber.inputMode = 'numeric';

  const chanceSlider = document.createElement('input');
  chanceSlider.type = 'range';
  chanceSlider.min = '0';
  chanceSlider.max = '1';
  chanceSlider.step = '0.01';
  chanceSlider.value = '1';
  chanceSlider.className = 'note-param-slider';
  chanceSlider.setAttribute('aria-label', 'Note chance');

  const chanceNumber = document.createElement('input');
  chanceNumber.type = 'number';
  chanceNumber.min = '0';
  chanceNumber.max = '100';
  chanceNumber.step = '1';
  chanceNumber.value = '100';
  chanceNumber.className = 'note-param-value';
  chanceNumber.setAttribute('aria-label', 'Note chance (0-100)');
  chanceNumber.inputMode = 'numeric';

  const lengthSlider = document.createElement('input');
  lengthSlider.type = 'range';
  lengthSlider.min = '1';
  lengthSlider.max = '16';
  lengthSlider.step = '0.01';
  lengthSlider.value = '1';
  lengthSlider.className = 'note-param-slider';
  lengthSlider.setAttribute('aria-label', 'Note length');

  const lengthNumber = document.createElement('input');
  lengthNumber.type = 'number';
  lengthNumber.min = '1';
  lengthNumber.max = '16';
  lengthNumber.step = '0.0001';
  lengthNumber.value = '1';
  lengthNumber.className = 'note-param-value';
  lengthNumber.setAttribute('aria-label', 'Note length (steps)');
  lengthNumber.inputMode = 'decimal';

  const stateLabel = document.createElement('span');
  stateLabel.className = 'note-param-state hint';

  const modToggle = document.createElement('input');
  modToggle.type = 'checkbox';
  modToggle.className = 'note-param-toggle-input';
  modToggle.setAttribute('aria-label', 'Add note to mod matrix targets');

  const modToggleLabel = document.createElement('label');
  modToggleLabel.className = 'note-param-toggle';
  modToggleLabel.appendChild(modToggle);
  modToggleLabel.appendChild(document.createTextNode('Add to mod matrix'));

  const controls = document.createElement('div');
  controls.className = 'note-param-controls';

  const velGroup = makeGroup('Velocity');
  velGroup.group.appendChild(velSlider);
  velGroup.group.appendChild(velNumber);
  controls.appendChild(velGroup.group);

  const chanceGroup = makeGroup('Chance');
  chanceGroup.group.appendChild(chanceSlider);
  chanceGroup.group.appendChild(chanceNumber);
  controls.appendChild(chanceGroup.group);

  const lengthGroup = makeGroup('Length');
  lengthGroup.group.appendChild(lengthSlider);
  lengthGroup.group.appendChild(lengthNumber);
  controls.appendChild(lengthGroup.group);

  const modGroup = makeGroup('Mod Matrix');
  modGroup.group.appendChild(modToggleLabel);
  controls.appendChild(modGroup.group);

  controls.appendChild(stateLabel);

  const showPlaceholder = (message) => {
    rootEl.innerHTML = `<span class="hint">${message}</span>`;
    rootEl.classList.add('placeholder');
  };

  const ensureControls = () => {
    if (rootEl.contains(controls)) return;
    rootEl.innerHTML = '';
    rootEl.classList.remove('placeholder');
    rootEl.appendChild(controls);
  };

  const updateStateLabel = (note) => {
    if (!note) {
      stateLabel.textContent = '';
      return;
    }
    stateLabel.textContent = `Step ${note.start + 1} · Pitch ${note.pitch}`;
  };

  const getNoteKey = (note) => {
    const step = note?.start ?? note?.step;
    return `${step}:${note?.pitch}`;
  };

  const hasNoteTarget = (track, note) => {
    if (!track || !note || !Array.isArray(track.noteModTargets)) return false;
    const key = getNoteKey(note);
    return track.noteModTargets.some((target) => getNoteKey(target) === key);
  };

  const setNoteTarget = (track, note, enabled) => {
    if (!track || !note) return;
    if (!Array.isArray(track.noteModTargets)) track.noteModTargets = [];
    const key = getNoteKey(note);
    const existingIndex = track.noteModTargets.findIndex((target) => getNoteKey(target) === key);
    if (enabled && existingIndex === -1) {
      track.noteModTargets.push({ step: note.start, pitch: note.pitch });
      return;
    }
    if (!enabled && existingIndex !== -1) {
      track.noteModTargets.splice(existingIndex, 1);
    }
  };

  const getMaxLength = (note, track) => {
    const trackLength = Number(track?.length);
    if (!note || !Number.isFinite(trackLength)) return 16;
    return Math.max(1, trackLength - note.start);
  };

  const commitNote = (note, updates = {}, trackOverride) => {
    if (!note) return;
    const track = trackOverride || getTrack?.();
    let changed = false;
    if (updates.vel !== undefined) {
      const velValue = Number(updates.vel);
      const nextVel = Number.isFinite(velValue) ? Math.max(0, Math.min(1, velValue)) : note.vel;
      if (Number.isFinite(nextVel) && nextVel !== note.vel) {
        note.vel = nextVel;
        changed = true;
      }
    }
    if (updates.chance !== undefined) {
      const chanceValue = Number(updates.chance);
      const nextChance = Number.isFinite(chanceValue) ? Math.max(0, Math.min(1, chanceValue)) : note.chance;
      if (Number.isFinite(nextChance) && nextChance !== note.chance) {
        note.chance = nextChance;
        changed = true;
      }
    }
    if (updates.length !== undefined) {
      const lengthValue = Number(updates.length);
      const maxLength = getMaxLength(note, track);
      const nextLength = Number.isFinite(lengthValue) ? lengthValue : note.length;
      const clamped = Math.max(1, Math.min(maxLength, nextLength));
      if (Number.isFinite(clamped) && clamped !== note.length) {
        note.length = clamped;
        changed = true;
      }
    }
    const vel = Number.isFinite(Number(note.vel)) ? Math.max(0, Math.min(1, note.vel)) : 1;
    const chance = Number.isFinite(Number(note.chance)) ? Math.max(0, Math.min(1, note.chance)) : 1;
    const maxLength = getMaxLength(note, track);
    const length = Number.isFinite(Number(note.length)) ? Math.max(1, Math.min(maxLength, note.length)) : 1;
    suppressEvents = true;
    velSlider.value = String(vel);
    velNumber.value = String(Math.round(vel * 127));
    chanceSlider.value = String(chance);
    chanceNumber.value = String(Math.round(chance * 100));
    lengthSlider.max = String(maxLength);
    lengthNumber.max = String(maxLength);
    lengthSlider.value = String(length);
    lengthNumber.value = String(length);
    suppressEvents = false;
    updateStateLabel(note);
    if (changed && typeof onChange === 'function') onChange(note);
  };

  velSlider.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const value = Number(ev.target.value);
    if (!Number.isFinite(value)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { vel: value });
  });

  velNumber.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const midi = Number.parseInt(ev.target.value, 10);
    if (!Number.isFinite(midi)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { vel: Math.max(0, Math.min(127, midi)) / 127 });
  });

  chanceSlider.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const value = Number(ev.target.value);
    if (!Number.isFinite(value)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { chance: value });
  });

  chanceNumber.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const percent = Number.parseInt(ev.target.value, 10);
    if (!Number.isFinite(percent)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { chance: Math.max(0, Math.min(100, percent)) / 100 });
  });

  lengthSlider.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const value = Number(ev.target.value);
    if (!Number.isFinite(value)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { length: value }, track);
  });

  lengthNumber.addEventListener('input', (ev) => {
    if (suppressEvents) return;
    const value = Number.parseFloat(ev.target.value);
    if (!Number.isFinite(value)) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!note) return;
    commitNote(note, { length: value }, track);
  });

  modToggle.addEventListener('change', (ev) => {
    if (suppressEvents) return;
    const track = getTrack?.();
    const note = findSelectedNote(track);
    if (!track || !note) return;
    setNoteTarget(track, note, !!ev.target.checked);
    if (typeof onChange === 'function') onChange(note);
  });

  function findSelectedNote(track) {
    if (!track || !Array.isArray(track.notes)) return null;
    if (!selectedNote) return null;
    return track.notes.find((note) => (
      note.start === selectedNote.step && note.pitch === selectedNote.pitch
    )) || null;
  }

  const updateSelection = (noteInfo) => {
    selectedNote = noteInfo && typeof noteInfo === 'object'
      ? { step: Number(noteInfo.step), pitch: Number(noteInfo.pitch) }
      : null;
    refresh();
  };

  const refresh = () => {
    const track = getTrack?.();
    if (!track || track.mode !== 'piano') {
      showPlaceholder('Note parameters are available in Piano Roll mode.');
      return;
    }
    const note = findSelectedNote(track);
    if (!note) {
      showPlaceholder('Select a note to edit velocity, chance, and length.');
      return;
    }
    ensureControls();
    commitNote(note, {}, track);
    suppressEvents = true;
    modToggle.checked = hasNoteTarget(track, note);
    modToggle.disabled = false;
    suppressEvents = false;
  };

  showPlaceholder('Select a note to edit velocity, chance, and length.');

  return {
    updateSelection,
    refresh,
    setOnChange(fn) {
      onChange = typeof fn === 'function' ? fn : null;
    },
  };
}

function createStepFxPanel(rootEl, track) {
  if (!rootEl) return null;

  let onChange = null;
  let selectedIndex = -1;
  let suppressEvents = false;

  let controlsWrap = null;
  let typeSelect = null;
  let delayControls = null;
  let duckControls = null;
  let multibandControls = null;
  let mixControl = null;
  let feedbackControl = null;
  let spacingControl = null;
  let repeatsInput = null;
  let duckDepthControl = null;
  let duckAttackControl = null;
  let duckHoldControl = null;
  let duckReleaseControl = null;
  let duckHint = null;
  let mbLowControl = null;
  let mbMidControl = null;
  let mbHighControl = null;
  let mbAttackControl = null;
  let mbHoldControl = null;
  let mbReleaseControl = null;
  let mbHint = null;

  const showPlaceholder = (message) => {
    rootEl.innerHTML = `<span class="hint">${message}</span>`;
    rootEl.classList.add('placeholder');
  };

  const createDisplaySlider = (labelText, options = {}) => {
    const {
      min = 0,
      max = 1,
      step = 0.01,
      format = (val) => formatSliderValue(val, 2),
      aria = labelText,
    } = options;

    const field = document.createElement('label');
    field.className = 'step-fx-field';

    const label = document.createElement('span');
    label.textContent = labelText;
    field.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = `${min}`;
    slider.max = `${max}`;
    slider.step = `${step}`;
    slider.value = `${min}`;
    slider.className = 'step-fx-slider';
    slider.setAttribute('aria-label', aria);
    field.appendChild(slider);

    const valueEl = document.createElement('span');
    valueEl.className = 'step-fx-readout';
    valueEl.textContent = format(min);
    field.appendChild(valueEl);

    const update = (value) => {
      const num = Number(value);
      const safe = Number.isFinite(num) ? num : min;
      valueEl.textContent = format(safe);
    };

    return { field, slider, valueEl, update };
  };

  const ensureControls = () => {
    if (controlsWrap) {
      if (!rootEl.contains(controlsWrap)) {
        rootEl.innerHTML = '';
        rootEl.appendChild(controlsWrap);
      }
      rootEl.classList.remove('placeholder');
      return;
    }

    controlsWrap = document.createElement('div');
    controlsWrap.className = 'step-fx-controls';

    const typeField = document.createElement('div');
    typeField.className = 'step-fx-field';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = 'Effect';
    typeField.appendChild(typeLabel);

    typeSelect = document.createElement('select');
    typeSelect.className = 'step-fx-select';
    typeSelect.setAttribute('aria-label', 'Step effect type');
    const typeOptions = [
      { value: STEP_FX_TYPES.NONE, label: 'None' },
      { value: STEP_FX_TYPES.DELAY, label: 'Delay' },
      { value: STEP_FX_TYPES.DUCK, label: 'Ducking' },
      { value: STEP_FX_TYPES.MULTIBAND_DUCK, label: 'Multiband Duck' },
    ];
    typeOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      typeSelect.appendChild(option);
    });
    typeField.appendChild(typeSelect);
    controlsWrap.appendChild(typeField);

    delayControls = document.createElement('div');
    delayControls.className = 'step-fx-delay';
    controlsWrap.appendChild(delayControls);

    const formatPercent = (val) => `${Math.round(Math.max(0, Math.min(1, val)) * 100)}%`;
    const formatDb = (val) => `${formatSliderValue(val, 1)} dB`;
    const formatSteps = (val) => `${formatSliderValue(val, 2)} st`;
    mixControl = createDisplaySlider('Mix', {
      min: 0,
      max: 1,
      step: 0.01,
      aria: 'Delay mix level',
      format: formatPercent,
    });
    feedbackControl = createDisplaySlider('Feedback', {
      min: 0,
      max: 0.95,
      step: 0.01,
      aria: 'Delay feedback',
      format: formatPercent,
    });
    spacingControl = createDisplaySlider('Spacing (steps)', {
      min: 0.05,
      max: 4,
      step: 0.05,
      aria: 'Delay spacing in steps',
      format: formatSteps,
    });

    delayControls.appendChild(mixControl.field);
    delayControls.appendChild(feedbackControl.field);
    delayControls.appendChild(spacingControl.field);

    const repeatsField = document.createElement('label');
    repeatsField.className = 'step-fx-field';
    const repeatsLabel = document.createElement('span');
    repeatsLabel.textContent = 'Repeats';
    repeatsField.appendChild(repeatsLabel);
    repeatsInput = document.createElement('input');
    repeatsInput.type = 'number';
    repeatsInput.min = '0';
    repeatsInput.max = '8';
    repeatsInput.step = '1';
    repeatsInput.value = '0';
    repeatsInput.className = 'step-fx-number';
    repeatsInput.setAttribute('aria-label', 'Delay repeats');
    repeatsField.appendChild(repeatsInput);
    delayControls.appendChild(repeatsField);

    const hint = document.createElement('span');
    hint.className = 'step-fx-hint';
    hint.textContent = 'Creates echoes after the main hit with adjustable mix, spacing, and feedback.';
    delayControls.appendChild(hint);

    duckControls = document.createElement('div');
    duckControls.className = 'step-fx-duck';
    controlsWrap.appendChild(duckControls);

    duckDepthControl = createDisplaySlider('Depth', {
      min: 0,
      max: 36,
      step: 0.5,
      aria: 'Ducking depth in decibels',
      format: formatDb,
    });
    duckAttackControl = createDisplaySlider('Attack (steps)', {
      min: 0,
      max: 4,
      step: 0.05,
      aria: 'Ducking attack in steps',
      format: formatSteps,
    });
    duckHoldControl = createDisplaySlider('Hold (steps)', {
      min: 0,
      max: 8,
      step: 0.05,
      aria: 'Ducking hold in steps',
      format: formatSteps,
    });
    duckReleaseControl = createDisplaySlider('Release (steps)', {
      min: 0,
      max: 8,
      step: 0.05,
      aria: 'Ducking release in steps',
      format: formatSteps,
    });

    duckControls.appendChild(duckDepthControl.field);
    duckControls.appendChild(duckAttackControl.field);
    duckControls.appendChild(duckHoldControl.field);
    duckControls.appendChild(duckReleaseControl.field);
    duckHint = document.createElement('span');
    duckHint.className = 'step-fx-hint';
    duckHint.textContent = 'Reduces the level of this track when the step hits.';
    duckControls.appendChild(duckHint);

    multibandControls = document.createElement('div');
    multibandControls.className = 'step-fx-multiband';
    controlsWrap.appendChild(multibandControls);

    mbLowControl = createDisplaySlider('Low Depth', {
      min: 0,
      max: 36,
      step: 0.5,
      aria: 'Low band ducking depth in decibels',
      format: formatDb,
    });
    mbMidControl = createDisplaySlider('Mid Depth', {
      min: 0,
      max: 36,
      step: 0.5,
      aria: 'Mid band ducking depth in decibels',
      format: formatDb,
    });
    mbHighControl = createDisplaySlider('High Depth', {
      min: 0,
      max: 36,
      step: 0.5,
      aria: 'High band ducking depth in decibels',
      format: formatDb,
    });
    mbAttackControl = createDisplaySlider('Attack (steps)', {
      min: 0,
      max: 4,
      step: 0.05,
      aria: 'Multiband ducking attack in steps',
      format: formatSteps,
    });
    mbHoldControl = createDisplaySlider('Hold (steps)', {
      min: 0,
      max: 8,
      step: 0.05,
      aria: 'Multiband ducking hold in steps',
      format: formatSteps,
    });
    mbReleaseControl = createDisplaySlider('Release (steps)', {
      min: 0,
      max: 8,
      step: 0.05,
      aria: 'Multiband ducking release in steps',
      format: formatSteps,
    });

    multibandControls.appendChild(mbLowControl.field);
    multibandControls.appendChild(mbMidControl.field);
    multibandControls.appendChild(mbHighControl.field);
    multibandControls.appendChild(mbAttackControl.field);
    multibandControls.appendChild(mbHoldControl.field);
    multibandControls.appendChild(mbReleaseControl.field);
    mbHint = document.createElement('span');
    mbHint.className = 'step-fx-hint';
    mbHint.textContent = 'Applies per-band gain reduction for more transparent sidechaining.';
    multibandControls.appendChild(mbHint);

    rootEl.innerHTML = '';
    rootEl.classList.remove('placeholder');
    rootEl.appendChild(controlsWrap);

    typeSelect.onchange = (ev) => {
      if (suppressEvents) return;
      const value = ev.target.value || STEP_FX_TYPES.NONE;
      commitEffectType(value);
    };

    mixControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mixControl.update(value);
      if (suppressEvents) return;
      commitDelayConfig({ mix: value });
    });

    feedbackControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      feedbackControl.update(value);
      if (suppressEvents) return;
      commitDelayConfig({ feedback: value });
    });

    spacingControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      spacingControl.update(value);
      if (suppressEvents) return;
      commitDelayConfig({ spacing: value });
    });

    repeatsInput.addEventListener('input', (ev) => {
      if (suppressEvents) return;
      const raw = Number.parseInt(ev.target.value, 10);
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(8, raw)) : 0;
      if (!Number.isFinite(raw) || clamped !== raw) {
        ev.target.value = String(clamped);
      }
      commitDelayConfig({ repeats: clamped });
    });

    duckDepthControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      duckDepthControl.update(value);
      if (suppressEvents) return;
      commitDuckingConfig({ depthDb: value });
    });

    duckAttackControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      duckAttackControl.update(value);
      if (suppressEvents) return;
      commitDuckingConfig({ attack: value });
    });

    duckHoldControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      duckHoldControl.update(value);
      if (suppressEvents) return;
      commitDuckingConfig({ hold: value });
    });

    duckReleaseControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      duckReleaseControl.update(value);
      if (suppressEvents) return;
      commitDuckingConfig({ release: value });
    });

    mbLowControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbLowControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ lowDepthDb: value });
    });

    mbMidControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbMidControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ midDepthDb: value });
    });

    mbHighControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbHighControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ highDepthDb: value });
    });

    mbAttackControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbAttackControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ attack: value });
    });

    mbHoldControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbHoldControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ hold: value });
    });

    mbReleaseControl.slider.addEventListener('input', (ev) => {
      const value = Number(ev.target.value);
      mbReleaseControl.update(value);
      if (suppressEvents) return;
      commitMultibandConfig({ release: value });
    });
  };

  const updateEffectVisibility = (type) => {
    if (delayControls) {
      const isDelay = type === STEP_FX_TYPES.DELAY;
      delayControls.style.display = isDelay ? '' : 'none';
    }
    if (duckControls) {
      const isDuck = type === STEP_FX_TYPES.DUCK;
      duckControls.style.display = isDuck ? '' : 'none';
    }
    if (multibandControls) {
      const isMultiband = type === STEP_FX_TYPES.MULTIBAND_DUCK;
      multibandControls.style.display = isMultiband ? '' : 'none';
    }
  };

  const syncDelayInputs = (config) => {
    if (!mixControl || !feedbackControl || !spacingControl || !repeatsInput) return;
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DELAY] || {};
    const cfg = config && typeof config === 'object' ? config : defaults;

    const mixVal = Number.isFinite(cfg.mix) ? cfg.mix : (defaults.mix ?? 0.5);
    const fbVal = Number.isFinite(cfg.feedback) ? cfg.feedback : (defaults.feedback ?? 0.45);
    const spacingVal = Number.isFinite(cfg.spacing) ? cfg.spacing : (defaults.spacing ?? 0.5);
    const repeatsVal = Number.isFinite(cfg.repeats) ? cfg.repeats : (defaults.repeats ?? 0);

    mixControl.slider.value = `${mixVal}`;
    mixControl.update(mixVal);
    feedbackControl.slider.value = `${fbVal}`;
    feedbackControl.update(fbVal);
    spacingControl.slider.value = `${spacingVal}`;
    spacingControl.update(spacingVal);
    repeatsInput.value = `${Math.max(0, Math.min(8, Math.round(repeatsVal)))}`;
  };

  const syncDuckingInputs = (config) => {
    if (!duckDepthControl || !duckAttackControl || !duckHoldControl || !duckReleaseControl) return;
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DUCK] || {};
    const cfg = config && typeof config === 'object' ? config : defaults;

    const depthVal = Number.isFinite(cfg.depthDb) ? cfg.depthDb : (defaults.depthDb ?? 12);
    const attackVal = Number.isFinite(cfg.attack) ? cfg.attack : (defaults.attack ?? 0.05);
    const holdVal = Number.isFinite(cfg.hold) ? cfg.hold : (defaults.hold ?? 0.2);
    const releaseVal = Number.isFinite(cfg.release) ? cfg.release : (defaults.release ?? 0.3);

    duckDepthControl.slider.value = `${depthVal}`;
    duckDepthControl.update(depthVal);
    duckAttackControl.slider.value = `${attackVal}`;
    duckAttackControl.update(attackVal);
    duckHoldControl.slider.value = `${holdVal}`;
    duckHoldControl.update(holdVal);
    duckReleaseControl.slider.value = `${releaseVal}`;
    duckReleaseControl.update(releaseVal);
  };

  const syncMultibandInputs = (config) => {
    if (!mbLowControl || !mbMidControl || !mbHighControl || !mbAttackControl || !mbHoldControl || !mbReleaseControl) return;
    const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.MULTIBAND_DUCK] || {};
    const cfg = config && typeof config === 'object' ? config : defaults;

    const lowVal = Number.isFinite(cfg.lowDepthDb) ? cfg.lowDepthDb : (defaults.lowDepthDb ?? 14);
    const midVal = Number.isFinite(cfg.midDepthDb) ? cfg.midDepthDb : (defaults.midDepthDb ?? 8);
    const highVal = Number.isFinite(cfg.highDepthDb) ? cfg.highDepthDb : (defaults.highDepthDb ?? 4);
    const attackVal = Number.isFinite(cfg.attack) ? cfg.attack : (defaults.attack ?? 0.05);
    const holdVal = Number.isFinite(cfg.hold) ? cfg.hold : (defaults.hold ?? 0.2);
    const releaseVal = Number.isFinite(cfg.release) ? cfg.release : (defaults.release ?? 0.3);

    mbLowControl.slider.value = `${lowVal}`;
    mbLowControl.update(lowVal);
    mbMidControl.slider.value = `${midVal}`;
    mbMidControl.update(midVal);
    mbHighControl.slider.value = `${highVal}`;
    mbHighControl.update(highVal);
    mbAttackControl.slider.value = `${attackVal}`;
    mbAttackControl.update(attackVal);
    mbHoldControl.slider.value = `${holdVal}`;
    mbHoldControl.update(holdVal);
    mbReleaseControl.slider.value = `${releaseVal}`;
    mbReleaseControl.update(releaseVal);
  };

  const commitEffectType = (type) => {
    if (selectedIndex < 0) return;
    const steps = track?.steps;
    if (!Array.isArray(steps) || selectedIndex >= steps.length) return;
    const step = steps[selectedIndex];
    if (!step) return;

    let nextFx;
    if (type === STEP_FX_TYPES.DELAY) {
      const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DELAY] || {};
      const baseConfig = step.fx?.type === STEP_FX_TYPES.DELAY
        ? step.fx.config
        : defaults;
      nextFx = normalizeStepFx({ type: STEP_FX_TYPES.DELAY, config: { ...baseConfig } });
    } else if (type === STEP_FX_TYPES.DUCK) {
      const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.DUCK] || {};
      const baseConfig = step.fx?.type === STEP_FX_TYPES.DUCK
        ? step.fx.config
        : defaults;
      nextFx = normalizeStepFx({ type: STEP_FX_TYPES.DUCK, config: { ...baseConfig } });
    } else if (type === STEP_FX_TYPES.MULTIBAND_DUCK) {
      const defaults = STEP_FX_DEFAULTS[STEP_FX_TYPES.MULTIBAND_DUCK] || {};
      const baseConfig = step.fx?.type === STEP_FX_TYPES.MULTIBAND_DUCK
        ? step.fx.config
        : defaults;
      nextFx = normalizeStepFx({ type: STEP_FX_TYPES.MULTIBAND_DUCK, config: { ...baseConfig } });
    } else {
      nextFx = normalizeStepFx({ type: STEP_FX_TYPES.NONE });
    }

    step.fx = nextFx;
    suppressEvents = true;
    typeSelect.value = nextFx.type || STEP_FX_TYPES.NONE;
    updateEffectVisibility(nextFx.type);
    syncDelayInputs(nextFx.config);
    syncDuckingInputs(nextFx.config);
    syncMultibandInputs(nextFx.config);
    suppressEvents = false;

    if (typeof onChange === 'function') onChange(selectedIndex, step);
  };

  const commitDelayConfig = (partial = {}) => {
    if (selectedIndex < 0) return;
    const steps = track?.steps;
    if (!Array.isArray(steps) || selectedIndex >= steps.length) return;
    const step = steps[selectedIndex];
    if (!step) return;

    const current = normalizeStepFx(step.fx);
    if (current.type !== STEP_FX_TYPES.DELAY) return;

    const merged = { ...current.config, ...partial };
    const nextFx = normalizeStepFx({ type: STEP_FX_TYPES.DELAY, config: merged });
    step.fx = nextFx;

    suppressEvents = true;
    syncDelayInputs(nextFx.config);
    suppressEvents = false;

    if (typeof onChange === 'function') onChange(selectedIndex, step);
  };

  const commitDuckingConfig = (partial = {}) => {
    if (selectedIndex < 0) return;
    const steps = track?.steps;
    if (!Array.isArray(steps) || selectedIndex >= steps.length) return;
    const step = steps[selectedIndex];
    if (!step) return;

    const current = normalizeStepFx(step.fx);
    if (current.type !== STEP_FX_TYPES.DUCK) return;

    const merged = { ...current.config, ...partial };
    const nextFx = normalizeStepFx({ type: STEP_FX_TYPES.DUCK, config: merged });
    step.fx = nextFx;

    suppressEvents = true;
    syncDuckingInputs(nextFx.config);
    suppressEvents = false;

    if (typeof onChange === 'function') onChange(selectedIndex, step);
  };

  const commitMultibandConfig = (partial = {}) => {
    if (selectedIndex < 0) return;
    const steps = track?.steps;
    if (!Array.isArray(steps) || selectedIndex >= steps.length) return;
    const step = steps[selectedIndex];
    if (!step) return;

    const current = normalizeStepFx(step.fx);
    if (current.type !== STEP_FX_TYPES.MULTIBAND_DUCK) return;

    const merged = { ...current.config, ...partial };
    const nextFx = normalizeStepFx({ type: STEP_FX_TYPES.MULTIBAND_DUCK, config: merged });
    step.fx = nextFx;

    suppressEvents = true;
    syncMultibandInputs(nextFx.config);
    suppressEvents = false;

    if (typeof onChange === 'function') onChange(selectedIndex, step);
  };

  const updateSelection = (index) => {
    selectedIndex = Number.isInteger(index) ? index : -1;
    if (!track || (track.mode !== 'steps' && track.mode !== 'piano')) {
      showPlaceholder('Step effects are available in Steps or Piano mode.');
      return;
    }
    const steps = track.steps;
    if (!Array.isArray(steps) || selectedIndex < 0 || selectedIndex >= steps.length) {
      showPlaceholder('Select a step to edit step effects.');
      return;
    }
    const step = steps[selectedIndex];
    if (!step) {
      showPlaceholder('Select a step to edit step effects.');
      return;
    }

    ensureControls();

    const normalized = normalizeStepFx(step.fx);
    if (step.fx !== normalized) {
      step.fx = normalized;
    }

    suppressEvents = true;
    typeSelect.value = normalized.type || STEP_FX_TYPES.NONE;
    updateEffectVisibility(normalized.type);
    syncDelayInputs(normalized.config);
    syncDuckingInputs(normalized.config);
    syncMultibandInputs(normalized.config);
    suppressEvents = false;
  };

  showPlaceholder('Select a step to edit step effects.');

  return {
    updateSelection,
    refresh() {
      updateSelection(selectedIndex);
    },
    setOnChange(fn) {
      onChange = typeof fn === 'function' ? fn : null;
    },
  };
}

function createTrackFxPanel(rootEl, track) {
  if (!rootEl) return null;
  if (!track) {
    rootEl.innerHTML = '<span class="hint">Select a track to edit track effects.</span>';
    rootEl.classList.add('placeholder');
    return null;
  }

  let onChange = null;
  let suppress = false;
  let selectedEffect = 'compression';

  const compressionDefaults = TRACK_FX_DEFAULTS?.compression || {};
  const eq3Defaults = TRACK_FX_DEFAULTS?.eq3 || {};

  const ensureTrackEffectState = () => {
    const normalized = normalizeTrackEffects(track.effects);
    if (track.effects !== normalized) {
      track.effects = normalized;
    }
    return track.effects;
  };

  const ensureCompressionState = () => {
    return ensureTrackEffectState().compression;
  };

  const ensureEq3State = () => {
    return ensureTrackEffectState().eq3;
  };

  const clamp = (value, min, max) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  };

  const wrap = document.createElement('div');
  wrap.className = 'track-fx-controls';

  const effectSelectWrap = document.createElement('label');
  effectSelectWrap.className = 'track-fx-effect-select';
  const effectSelectLabel = document.createElement('span');
  effectSelectLabel.textContent = 'Effect';
  const effectSelect = document.createElement('select');
  effectSelect.setAttribute('aria-label', 'Track effect type');
  const compressionOption = document.createElement('option');
  compressionOption.value = 'compression';
  compressionOption.textContent = 'Compression';
  effectSelect.appendChild(compressionOption);
  const eq3Option = document.createElement('option');
  eq3Option.value = 'eq3';
  eq3Option.textContent = '3-Band EQ';
  effectSelect.appendChild(eq3Option);
  effectSelectWrap.appendChild(effectSelectLabel);
  effectSelectWrap.appendChild(effectSelect);
  wrap.appendChild(effectSelectWrap);

  const toggleLabel = document.createElement('div');
  toggleLabel.className = 'track-fx-toggle';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  const toggleInputId = `trackFxToggle_${Math.random().toString(36).slice(2, 10)}`;
  toggleInput.id = toggleInputId;
  toggleInput.setAttribute('aria-label', 'Enable compression');
  const toggleText = document.createElement('label');
  toggleText.htmlFor = toggleInputId;
  toggleText.textContent = 'Compression';
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleText);
  wrap.appendChild(toggleLabel);

  const controls = document.createElement('div');
  controls.className = 'track-fx-grid';
  wrap.appendChild(controls);

  const effectPanels = {
    compression: document.createElement('div'),
    eq3: document.createElement('div'),
  };
  effectPanels.compression.className = 'track-fx-effect-panel';
  effectPanels.eq3.className = 'track-fx-effect-panel';
  controls.appendChild(effectPanels.compression);
  controls.appendChild(effectPanels.eq3);

  const hints = {
    compression: document.createElement('span'),
    eq3: document.createElement('span'),
  };

  const addControlRow = (panel, labelText, sliderControl) => {
    const row = document.createElement('div');
    row.className = 'track-fx-row';
    const label = document.createElement('span');
    label.className = 'track-fx-label';
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(sliderControl.wrap);
    panel.appendChild(row);
    return row;
  };

  const thresholdControl = createSliderControl({
    min: -60,
    max: 0,
    step: 1,
    value: Number.isFinite(compressionDefaults.threshold) ? compressionDefaults.threshold : -24,
    format: (val) => formatSliderValue(val, 1),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, -60, 0);
    },
  });
  addControlRow(effectPanels.compression, 'Threshold (dB)', thresholdControl);

  const ratioControl = createSliderControl({
    min: 1,
    max: 20,
    step: 0.1,
    value: Number.isFinite(compressionDefaults.ratio) ? compressionDefaults.ratio : 4,
    format: (val) => formatSliderValue(val, 2),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, 1, 20);
    },
  });
  addControlRow(effectPanels.compression, 'Ratio', ratioControl);

  const attackControl = createSliderControl({
    min: 0.001,
    max: 1,
    step: 0.001,
    value: Number.isFinite(compressionDefaults.attack) ? compressionDefaults.attack : 0.003,
    format: (val) => formatSliderValue(val, 3),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, 0.001, 1);
    },
  });
  addControlRow(effectPanels.compression, 'Attack (s)', attackControl);

  const releaseControl = createSliderControl({
    min: 0.01,
    max: 2,
    step: 0.01,
    value: Number.isFinite(compressionDefaults.release) ? compressionDefaults.release : 0.25,
    format: (val) => formatSliderValue(val, 3),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, 0.01, 2);
    },
  });
  addControlRow(effectPanels.compression, 'Release (s)', releaseControl);

  const kneeControl = createSliderControl({
    min: 0,
    max: 40,
    step: 0.5,
    value: Number.isFinite(compressionDefaults.knee) ? compressionDefaults.knee : 30,
    format: (val) => formatSliderValue(val, 1),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, 0, 40);
    },
  });
  addControlRow(effectPanels.compression, 'Knee (dB)', kneeControl);

  const eqLowControl = createSliderControl({
    min: -24,
    max: 24,
    step: 0.5,
    value: Number.isFinite(eq3Defaults.lowGain) ? eq3Defaults.lowGain : 0,
    format: (val) => formatSliderValue(val, 1),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, -24, 24);
    },
  });
  addControlRow(effectPanels.eq3, 'Low (dB)', eqLowControl);

  const eqMidControl = createSliderControl({
    min: -24,
    max: 24,
    step: 0.5,
    value: Number.isFinite(eq3Defaults.midGain) ? eq3Defaults.midGain : 0,
    format: (val) => formatSliderValue(val, 1),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, -24, 24);
    },
  });
  addControlRow(effectPanels.eq3, 'Mid (dB)', eqMidControl);

  const eqHighControl = createSliderControl({
    min: -24,
    max: 24,
    step: 0.5,
    value: Number.isFinite(eq3Defaults.highGain) ? eq3Defaults.highGain : 0,
    format: (val) => formatSliderValue(val, 1),
    parseDisplay: (text) => {
      const raw = Number.parseFloat(text);
      if (!Number.isFinite(raw)) return NaN;
      return clamp(raw, -24, 24);
    },
  });
  addControlRow(effectPanels.eq3, 'High (dB)', eqHighControl);

  hints.compression.className = 'track-fx-hint';
  hints.compression.textContent = 'Smooth out peaks and glue the track together with gentle compression.';
  effectPanels.compression.appendChild(hints.compression);
  hints.eq3.className = 'track-fx-hint';
  hints.eq3.textContent = 'Shape low, mid, and high tone on the track bus.';
  effectPanels.eq3.appendChild(hints.eq3);

  const sliderControls = [thresholdControl, ratioControl, attackControl, releaseControl, kneeControl];
  const eqControls = [eqLowControl, eqMidControl, eqHighControl];

  const selectEffect = (effect) => {
    selectedEffect = effect === 'eq3' ? 'eq3' : 'compression';
    effectPanels.compression.hidden = selectedEffect !== 'compression';
    effectPanels.eq3.hidden = selectedEffect !== 'eq3';
    toggleText.textContent = selectedEffect === 'eq3' ? '3-Band EQ' : 'Compression';
    toggleInput.setAttribute('aria-label', selectedEffect === 'eq3' ? 'Enable 3-band EQ' : 'Enable compression');
  };

  const setControlsEnabled = (enabled) => {
    const activeControls = selectedEffect === 'eq3' ? eqControls : sliderControls;
    const inactiveControls = selectedEffect === 'eq3' ? sliderControls : eqControls;
    activeControls.forEach(ctrl => {
      ctrl.input.disabled = !enabled;
      ctrl.valueEl.contentEditable = enabled ? 'true' : 'false';
      ctrl.valueEl.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
    inactiveControls.forEach(ctrl => {
      ctrl.input.disabled = true;
      ctrl.valueEl.contentEditable = 'false';
      ctrl.valueEl.setAttribute('aria-disabled', 'true');
    });
    controls.classList.toggle('track-fx-disabled', !enabled);
  };

  const applyUpdate = (partial = {}) => {
    const effects = ensureTrackEffectState();
    const comp = effects.compression;
    const eq = effects.eq3;
    let changed = false;

    if (partial.enabled !== undefined) {
      const enabled = !!partial.enabled;
      if (selectedEffect === 'eq3') {
        if (eq.enabled !== enabled) {
          eq.enabled = enabled;
          changed = true;
        }
      } else if (comp.enabled !== enabled) {
        comp.enabled = enabled;
        changed = true;
      }
    }
    if (partial.threshold !== undefined) {
      const next = clamp(partial.threshold, -60, 0);
      if (next !== null && comp.threshold !== next) {
        comp.threshold = next;
        changed = true;
      }
    }
    if (partial.ratio !== undefined) {
      const next = clamp(partial.ratio, 1, 20);
      if (next !== null && comp.ratio !== next) {
        comp.ratio = next;
        changed = true;
      }
    }
    if (partial.attack !== undefined) {
      const next = clamp(partial.attack, 0.001, 1);
      if (next !== null && comp.attack !== next) {
        comp.attack = next;
        changed = true;
      }
    }
    if (partial.release !== undefined) {
      const next = clamp(partial.release, 0.01, 2);
      if (next !== null && comp.release !== next) {
        comp.release = next;
        changed = true;
      }
    }
    if (partial.knee !== undefined) {
      const next = clamp(partial.knee, 0, 40);
      if (next !== null && comp.knee !== next) {
        comp.knee = next;
        changed = true;
      }
    }
    if (partial.lowGain !== undefined) {
      const next = clamp(partial.lowGain, -24, 24);
      if (next !== null && eq.lowGain !== next) {
        eq.lowGain = next;
        changed = true;
      }
    }
    if (partial.midGain !== undefined) {
      const next = clamp(partial.midGain, -24, 24);
      if (next !== null && eq.midGain !== next) {
        eq.midGain = next;
        changed = true;
      }
    }
    if (partial.highGain !== undefined) {
      const next = clamp(partial.highGain, -24, 24);
      if (next !== null && eq.highGain !== next) {
        eq.highGain = next;
        changed = true;
      }
    }


    suppress = true;
    refresh();
    suppress = false;

    if (changed && typeof onChange === 'function') onChange();
  };

  const refresh = () => {
    const comp = ensureCompressionState();
    const eq = ensureEq3State();
    suppress = true;
    effectSelect.value = selectedEffect;
    selectEffect(selectedEffect);
    const enabled = selectedEffect === 'eq3' ? !!eq.enabled : !!comp.enabled;
    toggleInput.checked = enabled;
    setControlsEnabled(enabled);
    thresholdControl.setValue(comp.threshold, { silent: true });
    ratioControl.setValue(comp.ratio, { silent: true });
    attackControl.setValue(comp.attack, { silent: true });
    releaseControl.setValue(comp.release, { silent: true });
    kneeControl.setValue(comp.knee, { silent: true });
    eqLowControl.setValue(eq.lowGain, { silent: true });
    eqMidControl.setValue(eq.midGain, { silent: true });
    eqHighControl.setValue(eq.highGain, { silent: true });
    sliderControls.forEach(ctrl => ctrl.updateDisplay());
    eqControls.forEach(ctrl => ctrl.updateDisplay());
    suppress = false;
  };

  effectSelect.addEventListener('change', () => {
    if (suppress) return;
    selectedEffect = effectSelect.value === 'eq3' ? 'eq3' : 'compression';
    refresh();
  });

  toggleInput.addEventListener('change', () => {
    if (suppress) return;
    applyUpdate({ enabled: toggleInput.checked });
  });
  thresholdControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ threshold: val });
  });
  ratioControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ ratio: val });
  });
  attackControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ attack: val });
  });
  releaseControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ release: val });
  });
  kneeControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ knee: val });
  });
  eqLowControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ lowGain: val });
  });
  eqMidControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ midGain: val });
  });
  eqHighControl.setOnChange((val) => {
    if (suppress) return;
    applyUpdate({ highGain: val });
  });

  rootEl.innerHTML = '';
  rootEl.classList.remove('placeholder');
  rootEl.appendChild(wrap);

  refresh();

  return {
    refresh,
    setOnChange(fn) {
      onChange = typeof fn === 'function' ? fn : null;
    },
  };
}


export function renderArpPanel(containerEl, track, makeFieldHtml) {
  if (!containerEl) return () => {};
  if (!track) {
    containerEl.innerHTML = '';
    return () => {};
  }
  const t = track;
  const field = (label, inputHtml, hint='') => makeFieldHtml(label, inputHtml, hint);

  const arp = t.arp || {};
  const arpRateOptions = [1, 2, 3, 4, 6, 8, 12, 16]
    .map((value) => `<option value="${value}" ${Number(arp.rate) === value ? 'selected' : ''}>${value}x</option>`)
    .join('');
  const arpDirectionOptions = [
    { value: 'up', label: 'Up' },
    { value: 'down', label: 'Down' },
    { value: 'upDown', label: 'Up-Down' },
    { value: 'random', label: 'Random' },
  ]
    .map(({ value, label }) => `<option value="${value}" ${arp.direction === value ? 'selected' : ''}>${label}</option>`)
    .join('');

  let html = '';
  html += `<div class="badge">Arpeggiator</div>`;
  html += field('Enabled', `<button id="arp_enabled" class="toggle ${arp.enabled ? 'active' : ''}">${arp.enabled ? 'On' : 'Off'}</button>`, 'Applies to piano roll notes');
  html += field('Rate', `<select id="arp_rate">${arpRateOptions}</select>`, 'Notes per step');
  html += field('Direction', `<select id="arp_direction">${arpDirectionOptions}</select>`);
  html += field('Octaves', `<input id="arp_octaves" type="number" min="1" max="4" step="1" value="${arp.octaves ?? 1}">`);
  html += field('Gate', `<input id="arp_gate" type="range" min="0.05" max="1" step="0.05" value="${arp.gate ?? 0.9}">`, 'Note length ratio');

  containerEl.innerHTML = html;

  return function bindArpEvents({ t: targetTrack, onArpChange }) {
    const ensureArp = () => {
      if (!targetTrack.arp || typeof targetTrack.arp !== 'object') targetTrack.arp = {};
    };
    const arpEnabled = document.getElementById('arp_enabled');
    if (arpEnabled) {
      arpEnabled.onclick = () => {
        ensureArp();
        targetTrack.arp.enabled = !targetTrack.arp.enabled;
        arpEnabled.classList.toggle('active', targetTrack.arp.enabled);
        arpEnabled.textContent = targetTrack.arp.enabled ? 'On' : 'Off';
        onArpChange && onArpChange();
      };
    }
    const arpRate = document.getElementById('arp_rate');
    if (arpRate) {
      arpRate.onchange = (e) => {
        ensureArp();
        const next = Math.round(Number(e.target.value));
        if (Number.isFinite(next)) targetTrack.arp.rate = next;
        onArpChange && onArpChange();
      };
    }
    const arpDirection = document.getElementById('arp_direction');
    if (arpDirection) {
      arpDirection.onchange = (e) => {
        ensureArp();
        targetTrack.arp.direction = e.target.value;
        onArpChange && onArpChange();
      };
    }
    const arpOctaves = document.getElementById('arp_octaves');
    if (arpOctaves) {
      arpOctaves.oninput = (e) => {
        ensureArp();
        const next = Math.round(Number(e.target.value));
        if (Number.isFinite(next)) targetTrack.arp.octaves = next;
      };
      arpOctaves.onchange = () => {
        onArpChange && onArpChange();
      };
    }
    const arpGate = document.getElementById('arp_gate');
    if (arpGate) {
      arpGate.oninput = (e) => {
        ensureArp();
        const next = Number(e.target.value);
        if (Number.isFinite(next)) targetTrack.arp.gate = next;
      };
      arpGate.onchange = () => {
        onArpChange && onArpChange();
      };
    }
  };
}

export function renderParams(containerEl, track, makeFieldHtml) {
  const t = track;
  const eng = t.engine;
  const p = t.params[eng];
  const field = (label, inputHtml, hint='') => makeFieldHtml(label, inputHtml, hint);
  const escapeHtml = (value) => `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  let html = '';

  // Mixer
  html += `<div class="badge">Mixer</div>`;
  html += field('Volume', `<input id="mx_gain" type="range" min="0" max="1" step="0.01" value="${t.gain}">`);
  html += field('Pan',    `<input id="mx_pan"  type="range" min="-1" max="1" step="0.01" value="${t.pan}">`);
  html += field('Mute / Solo',
    `<button id="mx_mute" class="toggle ${t.mute?'active':''}">Mute</button>
     <button id="mx_solo" class="toggle ${t.solo?'active':''}">Solo</button>`);

  // Steps per track
  const stepCountOptions = [4, 8, 16, 32, 64];
  const normalizedLength = Math.max(1, Math.trunc(Number.isFinite(Number(t.length)) ? Number(t.length) : 16));
  const isCustomLength = !stepCountOptions.includes(normalizedLength);
  const stepCountSelect = `<div class="step-count-inputs">
    <select id="trk_stepCount">${stepCountOptions
      .map((count) => `<option value="${count}" ${count === normalizedLength ? 'selected' : ''}>${count}</option>`)
      .join('')}
      <option value="custom" ${isCustomLength ? 'selected' : ''}>custom</option>
    </select>
    <input id="trk_stepCountCustom" type="number" min="1" step="1" value="${normalizedLength}" ${isCustomLength ? '' : 'disabled'}>
  </div>`;
  html += field('Step Count', stepCountSelect, 'Sequence length for this track');

  const stepParamsPanel = `
    <div id="trk_stepParams" class="step-detail placeholder">
      <span class="hint">Step parameter controls will appear here.</span>
    </div>`;
  html += field('Step Params', stepParamsPanel);

  const stepFxPanel = `
    <div id="trk_stepFx" class="step-detail placeholder">
      <span class="hint">Select a step to edit step effects.</span>
    </div>`;
  html += field('Step Effects', stepFxPanel);

  const trackFxPanel = `
    <div id="trk_trackFx" class="step-detail track-fx placeholder">
      <span class="hint">Track effects like compression appear here.</span>
    </div>`;
  html += field('Track Effects', trackFxPanel);

  if (t.type === 'cvl') {
    const clips = Array.isArray(t.cvl?.clips) ? t.cvl.clips : [];
    const selectedClip = clips.find((clip) => clip.id === t.cvl?.selectedClipId) || null;
    const selectedClipParams = selectedClip?.params || { start: 0, end: 1, gain: 1, pan: 0, pitch: 0 };
    const selectedClipEffects = selectedClip?.effects || { drive: 0, delay: 0, reverb: 0 };
    const cvlClipPanel = selectedClip
      ? `
        <div class="cvl-clip-editor-fields">
          <label class="ctrl">
            Gain
            <input id="cvl_clipGain" type="range" min="0" max="2" step="0.01" value="${selectedClipParams.gain}">
          </label>
          <label class="ctrl">
            Pan
            <input id="cvl_clipPan" type="range" min="-1" max="1" step="0.01" value="${selectedClipParams.pan}">
          </label>
          <label class="ctrl">
            Pitch
            <input id="cvl_clipPitch" type="range" min="-24" max="24" step="1" value="${selectedClipParams.pitch}">
          </label>
          <label class="ctrl">
            Start
            <input id="cvl_clipStart" type="range" min="0" max="1" step="0.001" value="${selectedClipParams.start}">
          </label>
          <label class="ctrl">
            End
            <input id="cvl_clipEnd" type="range" min="0" max="1" step="0.001" value="${selectedClipParams.end}">
          </label>
          <label class="ctrl">
            Drive
            <input id="cvl_clipDrive" type="range" min="0" max="1" step="0.01" value="${selectedClipEffects.drive}">
          </label>
          <label class="ctrl">
            Delay
            <input id="cvl_clipDelay" type="range" min="0" max="1" step="0.01" value="${selectedClipEffects.delay}">
          </label>
          <label class="ctrl">
            Reverb
            <input id="cvl_clipReverb" type="range" min="0" max="1" step="0.01" value="${selectedClipEffects.reverb}">
          </label>
        </div>
      `
      : '<span class="hint">Double tap a left trim handle to edit clip params + effects.</span>';
    html += field(
      'CVL Clip Params & Effects',
      `<div class="cvl-clip-editor-title">${selectedClip ? escapeHtml(selectedClip.sampleName || 'Sample') : 'No clip selected'}</div>${cvlClipPanel}`,
    );
  }

  // Instrument block
  html += `<div class="badge">Instrument • ${eng}</div>`;

  if (eng === 'synth') {
    const synthFields = (prefix, osc) => {
      let output = '';
      output += field('Base Freq', `<input id="${prefix}_base" type="number" min="50" max="2000" step="1" value="${osc.baseFreq}">`, 'Hz');
      output += field('Cutoff',    `<input id="${prefix}_cutoff" type="range" min="100" max="12000" step="1" value="${osc.cutoff}">`, 'LPF Hz');
      output += field('Q',         `<input id="${prefix}_q" type="range" min="0.1" max="20" step="0.1" value="${osc.q}">`);
      output += field('ADSR',
        `<input id="${prefix}_a" type="range" min="0" max="1" step="0.01" value="${osc.a}">
         <input id="${prefix}_d" type="range" min="0" max="1.5" step="0.01" value="${osc.d}">
         <input id="${prefix}_s" type="range" min="0" max="1" step="0.01" value="${osc.s}">
         <input id="${prefix}_r" type="range" min="0" max="2" step="0.01" value="${osc.r}">`,
        'A / D / S / R');
      const wavetableEnabled = !!osc.wavetable;
      const morphValue = Number.isFinite(osc.morph) ? osc.morph : 0;
      output += field('Wavetable',
        `<button id="${prefix}_wavetable" class="toggle ${wavetableEnabled ? 'active' : ''}">${wavetableEnabled ? 'On' : 'Off'}</button>`,
        'Enable wavetable morphing');
      const morphField = field('Morph',
        `<input id="${prefix}_morph" type="range" min="0" max="2048" step="1" value="${morphValue}">`,
        '0–2048 samples');
      output += `<div id="${prefix}_wavetablePanel" class="wavetable-morph ${wavetableEnabled ? 'visible' : ''}">${morphField}</div>`;
      return output;
    };

    const threeOscEnabled = !!p.threeOsc;
    html += field('3 Osc',
      `<button id="p_threeOsc" class="toggle ${threeOscEnabled ? 'active' : ''}">${threeOscEnabled ? 'On' : 'Off'}</button>`,
      'Enable three oscillators');

    if (threeOscEnabled) {
      const oscillators = Array.isArray(p.oscillators) ? p.oscillators : [];
      const activeOsc = Number.isInteger(p.activeOsc) ? p.activeOsc : 0;
      const tabs = [0, 1, 2].map((idx) => {
        const isActive = idx === activeOsc;
        return `<button class="synth-tab ${isActive ? 'active' : ''}" data-osc="${idx}" type="button">Osc ${idx + 1}</button>`;
      }).join('');
      html += `<div class="synth-tabs" role="tablist">${tabs}</div>`;
      html += `<div class="synth-osc-panels">`;
      [0, 1, 2].forEach((idx) => {
        const osc = oscillators[idx] || p;
        const isActive = idx === activeOsc;
        html += `<div class="synth-osc-panel ${isActive ? 'active' : ''}" data-osc="${idx}" role="tabpanel">`;
        html += synthFields(`p_osc${idx}`, osc);
        html += `</div>`;
      });
      html += `</div>`;
    } else {
      html += synthFields('p', p);
    }
  }

  if (eng === 'tb303') {
    html += field('Base Freq', `<input id="tb_base" type="number" min="40" max="500" step="1" value="${p.baseFreq}">`, 'Hz');
    html += field('Cutoff', `<input id="tb_cutoff" type="range" min="80" max="8000" step="1" value="${p.cutoff}">`, 'LPF Hz');
    html += field('Resonance', `<input id="tb_q" type="range" min="0.1" max="20" step="0.1" value="${p.q}">`);
    html += field('ADSR',
      `<input id="tb_a" type="range" min="0" max="1" step="0.001" value="${p.a}">
       <input id="tb_d" type="range" min="0" max="1.5" step="0.01" value="${p.d}">
       <input id="tb_s" type="range" min="0" max="1" step="0.01" value="${p.s}">
       <input id="tb_r" type="range" min="0" max="2" step="0.01" value="${p.r}">`,
      'A / D / S / R');
    html += field('Accent', `<input id="tb_accent" type="range" min="0" max="1" step="0.01" value="${p.accent}">`);
    const tbWavetableEnabled = !!p.wavetable;
    const tbMorphValue = Number.isFinite(p.morph) ? p.morph : 0;
    html += field('Wavetable',
      `<button id="tb_wavetable" class="toggle ${tbWavetableEnabled ? 'active' : ''}">${tbWavetableEnabled ? 'On' : 'Off'}</button>`,
      'Enable wavetable morphing');
    html += `<div id="tb_wavetablePanel" class="wavetable-morph ${tbWavetableEnabled ? 'visible' : ''}">`;
    html += field('Morph', `<input id="tb_morph" type="range" min="0" max="2048" step="1" value="${tbMorphValue}">`, '0–2048 samples');
    html += `</div>`;
  }

  if (eng === 'kick808') {
    html += field('Pitch (Hz)',   `<input id="k_freq" type="range" min="20" max="200" step="1" value="${p.freq}">`);
    html += field('Pitch Decay',  `<input id="k_pdec" type="range" min="0.005" max="1" step="0.005" value="${p.pitchDecay}">`, 'sec');
    html += field('Amp Decay',    `<input id="k_adec" type="range" min="0.05" max="2" step="0.01" value="${p.ampDecay}">`, 'sec');
    html += field('Click',        `<input id="k_click" type="range" min="0" max="1" step="0.01" value="${p.click}">`);
  }

  if (eng === 'noise') {
    html += field('Cutoff', `<input id="nz_cutoff" type="range" min="40" max="12000" step="10" value="${p.cutoff}">`, 'LPF Hz');
    html += field('Q', `<input id="nz_q" type="range" min="0.1" max="20" step="0.1" value="${p.q}">`);
    html += field('ADSR',
      `<input id="nz_a" type="range" min="0" max="1" step="0.01" value="${p.a}">
       <input id="nz_d" type="range" min="0" max="1.5" step="0.01" value="${p.d}">
       <input id="nz_s" type="range" min="0" max="1" step="0.01" value="${p.s}">
       <input id="nz_r" type="range" min="0" max="2" step="0.01" value="${p.r}">`,
      'A / D / S / R');
    html += field('Gain', `<input id="nz_gain" type="range" min="0" max="2" step="0.01" value="${p.gain}">`);
  }

  if (eng === 'snare808') {
    html += field('Tone (Hz)', `<input id="n_tone" type="range" min="100" max="400" step="1" value="${p.tone}">`);
    html += field('Noise',     `<input id="n_noise" type="range" min="0" max="1" step="0.01" value="${p.noise}">`);
    html += field('Decay',     `<input id="n_decay" type="range" min="0.05" max="1" step="0.01" value="${p.decay}">`, 'sec');
  }

  if (eng === 'hat808') {
    html += field('Decay', `<input id="h_decay" type="range" min="0.01" max="1" step="0.01" value="${p.decay}">`, 'sec');
    html += field('HPF',   `<input id="h_hpf"   type="range" min="2000" max="12000" step="50" value="${p.hpf}">`, 'Hz');
  }

  if (eng === 'clap909') {
    html += field('Bursts', `<input id="c_bursts" type="number" min="2" max="5" step="1" value="${p.bursts}">`);
    html += field('Spread', `<input id="c_spread" type="range" min="0.005" max="0.06" step="0.001" value="${p.spread}">`, 'sec');
    html += field('Decay',  `<input id="c_decay"  type="range" min="0.05" max="1.5" step="0.01" value="${p.decay}">`, 'sec');
  }

  if (eng === 'sampler') {
    const fileName = t.sample?.name ? `<span class="hint">${t.sample.name}</span>` : '<span class="hint">(no file)</span>';
    html += field('Sample', `<input id="sam_file" type="file" accept="audio/*"> ${fileName}`);
    html += field('Start',  `<input id="sam_start" type="range" min="0" max="1" step="0.01" value="${p.start}">`, '0–1');
    html += field('End',    `<input id="sam_end"   type="range" min="0" max="1" step="0.01" value="${p.end}">`, '0–1');
    html += field('Semitones', `<input id="sam_semi" type="number" min="-24" max="24" step="1" value="${p.semis}">`);
    html += field('Gain',   `<input id="sam_gain"  type="range" min="0" max="2" step="0.01" value="${p.gain}">`);
    html += field('Loop',   `<button id="sam_loop" class="toggle ${p.loop?'active':''}">${p.loop ? 'On' : 'Off'}</button>`);
    html += field('Advanced controls',
      `<label class="ctrl"><input id="sam_adv" type="checkbox" ${p.advanced ? 'checked' : ''}> Enable advanced sampler</label>`,
      'Show experimental sampler tools');
    html += `<div id="sam_advPanel" class="sampler-advanced ${p.advanced ? 'visible' : ''}">
      <div class="hint">Advanced sampler features will appear here.</div>
    </div>`;
  }

  html += `<div class="badge">Modulation</div>`;
  html += `<div id="modRack" class="mod-rack"></div>`;

  containerEl.innerHTML = html;

  if (containerEl._inlineStepEditor) delete containerEl._inlineStepEditor;

  const stepParamsRoot = containerEl.querySelector('#trk_stepParams');
  const stepParamsEditor = createStepParamsPanel(stepParamsRoot, track);
  if (stepParamsEditor) {
    containerEl._stepParamsEditor = stepParamsEditor;
  } else if (containerEl._stepParamsEditor) {
    delete containerEl._stepParamsEditor;
  }

  const stepFxRoot = containerEl.querySelector('#trk_stepFx');
  const stepFxEditor = createStepFxPanel(stepFxRoot, track);
  if (stepFxEditor) {
    containerEl._stepFxEditor = stepFxEditor;
  } else if (containerEl._stepFxEditor) {
    delete containerEl._stepFxEditor;
  }

  const trackFxRoot = containerEl.querySelector('#trk_trackFx');
  const trackFxEditor = createTrackFxPanel(trackFxRoot, track);
  if (trackFxEditor) {
    containerEl._trackFxEditor = trackFxEditor;
  } else if (containerEl._trackFxEditor) {
    delete containerEl._trackFxEditor;
  }

  const modRackEl = containerEl.querySelector('#modRack');
  renderModulationRack(modRackEl, track);

  return function bindParamEvents({ applyMixer, t, onStepsChange, onSampleFile, onStepSelect, onStepParamsChange, onStepFxChange, onTrackFxChange, onCvlClipChange, onParamsRerender }) {
    // Mixer
    const mg=document.getElementById('mx_gain'); if (mg) mg.oninput = e => { t.gain = +e.target.value; applyMixer(); };
    const mp=document.getElementById('mx_pan');  if (mp) mp.oninput = e => { t.pan  = +e.target.value; applyMixer(); };
    const mb=document.getElementById('mx_mute'); if (mb) mb.onclick = () => { t.mute = !t.mute; mb.classList.toggle('active', t.mute); applyMixer(); };
    const sb=document.getElementById('mx_solo'); if (sb) sb.onclick = () => { t.solo = !t.solo; sb.classList.toggle('active', t.solo); applyMixer(); };

    // Steps
    const stepCountSelectEl = document.getElementById('trk_stepCount');
    const stepCountCustomEl = document.getElementById('trk_stepCountCustom');
    const applyStepCount = (value) => {
      const nextLength = Math.trunc(Number(value));
      if (!Number.isFinite(nextLength) || nextLength < 1) return;
      if (typeof onStepsChange === 'function') onStepsChange(nextLength);
    };
    if (stepCountSelectEl) {
      stepCountSelectEl.onchange = (event) => {
        const selected = event?.target?.value ?? '';
        const isCustom = selected === 'custom';
        if (stepCountCustomEl) stepCountCustomEl.disabled = !isCustom;
        if (!isCustom) applyStepCount(selected);
      };
    }
    if (stepCountCustomEl) {
      stepCountCustomEl.oninput = (event) => {
        const raw = event?.target?.value ?? '';
        if (raw === '') return;
        if (stepCountSelectEl && stepCountSelectEl.value !== 'custom') {
          stepCountSelectEl.value = 'custom';
          stepCountCustomEl.disabled = false;
        }
        applyStepCount(raw);
      };
    }

    if (containerEl._stepParamsSelectionHandler) {
      containerEl.removeEventListener('stepselectionchange', containerEl._stepParamsSelectionHandler);
      delete containerEl._stepParamsSelectionHandler;
    }

    if (stepParamsEditor) {
      const paramsHandler = (ev) => {
        const detail = ev?.detail;
        if (!detail || detail.track !== t) return;
        const idx = Number.isInteger(detail.index) ? detail.index : -1;
        stepParamsEditor.updateSelection(idx);
      };
      containerEl._stepParamsSelectionHandler = paramsHandler;
      containerEl.addEventListener('stepselectionchange', paramsHandler);

      const selectedIndex = Number.isInteger(containerEl._selectedStepIndex)
        ? containerEl._selectedStepIndex
        : -1;
      stepParamsEditor.updateSelection(selectedIndex);
      stepParamsEditor.setOnChange((index, step) => {
        if (typeof onStepParamsChange === 'function') onStepParamsChange(index, step);
      });
    }

    const stepFxEditor = containerEl._stepFxEditor;
    if (containerEl._stepFxSelectionHandler) {
      containerEl.removeEventListener('stepselectionchange', containerEl._stepFxSelectionHandler);
      delete containerEl._stepFxSelectionHandler;
    }

    if (stepFxEditor) {
      const fxHandler = (ev) => {
        const detail = ev?.detail;
        if (!detail || detail.track !== t) return;
        const idx = Number.isInteger(detail.index) ? detail.index : -1;
        stepFxEditor.updateSelection(idx);
      };
      containerEl._stepFxSelectionHandler = fxHandler;
      containerEl.addEventListener('stepselectionchange', fxHandler);

      const selectedIndex = Number.isInteger(containerEl._selectedStepIndex)
        ? containerEl._selectedStepIndex
        : -1;
      stepFxEditor.updateSelection(selectedIndex);
      stepFxEditor.setOnChange((index, step) => {
        if (typeof onStepFxChange === 'function') onStepFxChange(index, step);
      });
    }

    const trackFxEditor = containerEl._trackFxEditor;
    if (trackFxEditor) {
      trackFxEditor.setOnChange(() => {
        if (typeof onTrackFxChange === 'function') onTrackFxChange();
      });
    }

    const selectedClipId = t.cvl?.selectedClipId;
    const selectedClip = Array.isArray(t.cvl?.clips)
      ? t.cvl.clips.find((clip) => clip.id === selectedClipId)
      : null;
    const bindClipControl = (selector, updater) => {
      const control = document.getElementById(selector);
      if (!control || !selectedClip) return;
      control.oninput = (ev) => {
        updater(Number(ev.target.value));
      };
      control.onchange = () => {
        if (typeof onCvlClipChange === 'function') onCvlClipChange();
      };
    };
    bindClipControl('cvl_clipGain', (value) => {
      selectedClip.params.gain = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
    });
    bindClipControl('cvl_clipPan', (value) => {
      selectedClip.params.pan = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    });
    bindClipControl('cvl_clipPitch', (value) => {
      selectedClip.params.pitch = Number.isFinite(value) ? Math.max(-24, Math.min(24, value)) : 0;
    });
    bindClipControl('cvl_clipStart', (value) => {
      const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      const currentEnd = Number.isFinite(Number(selectedClip.params.end)) ? Number(selectedClip.params.end) : 1;
      selectedClip.params.start = Math.min(next, currentEnd);
    });
    bindClipControl('cvl_clipEnd', (value) => {
      const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
      const currentStart = Number.isFinite(Number(selectedClip.params.start)) ? Number(selectedClip.params.start) : 0;
      selectedClip.params.end = Math.max(next, currentStart);
    });
    bindClipControl('cvl_clipDrive', (value) => {
      selectedClip.effects.drive = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    });
    bindClipControl('cvl_clipDelay', (value) => {
      selectedClip.effects.delay = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    });
    bindClipControl('cvl_clipReverb', (value) => {
      selectedClip.effects.reverb = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    });

    // Engine params
    if (eng === 'synth') {
      const synth = t.params.synth;
      const cloneOsc = (osc) => ({
        baseFreq: osc.baseFreq,
        cutoff: osc.cutoff,
        q: osc.q,
        a: osc.a,
        d: osc.d,
        s: osc.s,
        r: osc.r,
        wavetable: !!osc.wavetable,
        morph: osc.morph ?? 0,
      });
      const ensureOscillators = () => {
        const existing = Array.isArray(synth.oscillators) ? synth.oscillators : [];
        const baseOsc = cloneOsc(synth);
        synth.oscillators = Array.from({ length: 3 }, (_, idx) => existing[idx] ? existing[idx] : cloneOsc(idx === 0 ? baseOsc : baseOsc));
      };
      const syncSingleFromOsc = () => {
        const osc = Array.isArray(synth.oscillators) ? synth.oscillators[0] : null;
        if (!osc) return;
        synth.baseFreq = osc.baseFreq;
        synth.cutoff = osc.cutoff;
        synth.q = osc.q;
        synth.a = osc.a;
        synth.d = osc.d;
        synth.s = osc.s;
        synth.r = osc.r;
        synth.wavetable = !!osc.wavetable;
        synth.morph = osc.morph ?? 0;
      };
      const bindOscInputs = (prefix, osc) => {
        const base = document.getElementById(`${prefix}_base`);
        const cutoff = document.getElementById(`${prefix}_cutoff`);
        const q = document.getElementById(`${prefix}_q`);
        const a = document.getElementById(`${prefix}_a`);
        const d = document.getElementById(`${prefix}_d`);
        const s = document.getElementById(`${prefix}_s`);
        const r = document.getElementById(`${prefix}_r`);
        if (base) base.oninput = (e) => { osc.baseFreq = +e.target.value; };
        if (cutoff) cutoff.oninput = (e) => { osc.cutoff = +e.target.value; };
        if (q) q.oninput = (e) => { osc.q = +e.target.value; };
        if (a) a.oninput = (e) => { osc.a = +e.target.value; };
        if (d) d.oninput = (e) => { osc.d = +e.target.value; };
        if (s) s.oninput = (e) => { osc.s = +e.target.value; };
        if (r) r.oninput = (e) => { osc.r = +e.target.value; };
        const wavetableBtn = document.getElementById(`${prefix}_wavetable`);
        const morphSlider = document.getElementById(`${prefix}_morph`);
        const wavetablePanel = document.getElementById(`${prefix}_wavetablePanel`);

        if (wavetableBtn) {
          wavetableBtn.onclick = () => {
            osc.wavetable = !osc.wavetable;
            wavetableBtn.classList.toggle('active', osc.wavetable);
            wavetableBtn.textContent = osc.wavetable ? 'On' : 'Off';
            if (wavetablePanel) wavetablePanel.classList.toggle('visible', osc.wavetable);
            if (modRackEl) renderModulationRack(modRackEl, t);
          };
        }

        if (morphSlider) {
          morphSlider.oninput = (e) => {
            const value = Math.round(+e.target.value || 0);
            osc.morph = Math.max(0, Math.min(2048, value));
          };
        }
      };

      const threeOscToggle = document.getElementById('p_threeOsc');
      if (threeOscToggle) {
        threeOscToggle.onclick = () => {
          synth.threeOsc = !synth.threeOsc;
          if (synth.threeOsc) {
            ensureOscillators();
          } else {
            syncSingleFromOsc();
          }
          if (typeof onParamsRerender === 'function') onParamsRerender();
        };
      }

      if (synth.threeOsc) {
        ensureOscillators();
        synth.activeOsc = Number.isInteger(synth.activeOsc) ? synth.activeOsc : 0;
        const tabs = Array.from(containerEl.querySelectorAll('.synth-tab'));
        const panels = Array.from(containerEl.querySelectorAll('.synth-osc-panel'));
        const setActiveTab = (index) => {
          synth.activeOsc = index;
          tabs.forEach((btn) => {
            const btnIndex = Number(btn.dataset.osc);
            btn.classList.toggle('active', btnIndex === index);
          });
          panels.forEach((panel) => {
            const panelIndex = Number(panel.dataset.osc);
            panel.classList.toggle('active', panelIndex === index);
          });
        };
        tabs.forEach((btn) => {
          btn.onclick = () => {
            const idx = Number(btn.dataset.osc);
            if (!Number.isNaN(idx)) setActiveTab(idx);
          };
        });
        setActiveTab(Math.max(0, Math.min(2, synth.activeOsc)));
        synth.oscillators.forEach((osc, idx) => {
          bindOscInputs(`p_osc${idx}`, osc);
        });
      } else {
        bindOscInputs('p', synth);
      }
    }

    if (eng === 'tb303') {
      ['tb_base','tb_cutoff','tb_q','tb_a','tb_d','tb_s','tb_r','tb_accent'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.tb303;
          p.baseFreq = +document.getElementById('tb_base').value;
          p.cutoff = +document.getElementById('tb_cutoff').value;
          p.q = +document.getElementById('tb_q').value;
          p.a = +document.getElementById('tb_a').value;
          p.d = +document.getElementById('tb_d').value;
          p.s = +document.getElementById('tb_s').value;
          p.r = +document.getElementById('tb_r').value;
          p.accent = +document.getElementById('tb_accent').value;
        };
      });

      const tbWavetableBtn = document.getElementById('tb_wavetable');
      const tbMorphSlider = document.getElementById('tb_morph');
      const tbWavetablePanel = document.getElementById('tb_wavetablePanel');

      if (tbWavetableBtn) {
        tbWavetableBtn.onclick = () => {
          const p = t.params.tb303;
          p.wavetable = !p.wavetable;
          tbWavetableBtn.classList.toggle('active', p.wavetable);
          tbWavetableBtn.textContent = p.wavetable ? 'On' : 'Off';
          if (tbWavetablePanel) tbWavetablePanel.classList.toggle('visible', p.wavetable);
          if (modRackEl) renderModulationRack(modRackEl, t);
        };
      }

      if (tbMorphSlider) {
        tbMorphSlider.oninput = (e) => {
          const value = Math.round(+e.target.value || 0);
          t.params.tb303.morph = Math.max(0, Math.min(2048, value));
        };
      }
    }

    if (eng === 'kick808') {
      ['k_freq','k_pdec','k_adec','k_click'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.kick808;
          p.freq       = +document.getElementById('k_freq').value;
          p.pitchDecay = +document.getElementById('k_pdec').value;
          p.ampDecay   = +document.getElementById('k_adec').value;
          p.click      = +document.getElementById('k_click').value;
        };
      });
    }

    if (eng === 'noise') {
      ['nz_cutoff','nz_q','nz_a','nz_d','nz_s','nz_r','nz_gain'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.noise;
          p.cutoff = +document.getElementById('nz_cutoff').value;
          p.q = +document.getElementById('nz_q').value;
          p.a = +document.getElementById('nz_a').value;
          p.d = +document.getElementById('nz_d').value;
          p.s = +document.getElementById('nz_s').value;
          p.r = +document.getElementById('nz_r').value;
          p.gain = +document.getElementById('nz_gain').value;
        };
      });
    }

    if (eng === 'snare808') {
      ['n_tone','n_noise','n_decay'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.snare808;
          p.tone  = +document.getElementById('n_tone').value;
          p.noise = +document.getElementById('n_noise').value;
          p.decay = +document.getElementById('n_decay').value;
        };
      });
    }

    if (eng === 'hat808') {
      ['h_decay','h_hpf'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.hat808;
          p.decay = +document.getElementById('h_decay').value;
          p.hpf   = +document.getElementById('h_hpf').value;
        };
      });
    }

    if (eng === 'clap909') {
      ['c_bursts','c_spread','c_decay'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.clap909;
          p.bursts = Math.max(2, Math.min(5, +document.getElementById('c_bursts').value));
          p.spread = +document.getElementById('c_spread').value;
          p.decay  = +document.getElementById('c_decay').value;
        };
      });
    }

    if (eng === 'sampler') {
      const p = t.params.sampler;
      const f   = document.getElementById('sam_file');
      const sIn = document.getElementById('sam_start');
      const eIn = document.getElementById('sam_end');
      const semi= document.getElementById('sam_semi');
      const gIn = document.getElementById('sam_gain');
      const lBtn= document.getElementById('sam_loop');
      const adv = document.getElementById('sam_adv');
      const advPanel = document.getElementById('sam_advPanel');

      if (f && onSampleFile) f.onchange = (ev) => onSampleFile(ev.target.files?.[0] || null);
      if (sIn) sIn.oninput = e => { p.start = +e.target.value; };
      if (eIn) eIn.oninput = e => { p.end   = +e.target.value; };
      if (semi)semi.oninput= e => { p.semis = +e.target.value; };
      if (gIn) gIn.oninput = e => { p.gain  = +e.target.value; };
      if (lBtn)lBtn.onclick= () => { p.loop = !p.loop; lBtn.classList.toggle('active', p.loop); lBtn.textContent = p.loop ? 'On' : 'Off'; };
      if (adv) adv.onchange = (e) => {
        p.advanced = !!e.target.checked;
        if (advPanel) advPanel.classList.toggle('visible', p.advanced);
      };
    }
  };
}

export function renderModulationRack(rootEl, track) {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  if (!track) {
    const msg = document.createElement('div');
    msg.className = 'mod-empty';
    msg.textContent = 'No track selected.';
    rootEl.appendChild(msg);
    return;
  }

  if (!Array.isArray(track.mods)) track.mods = [];

  const mods = track.mods;
  const rerender = () => renderModulationRack(rootEl, track);
  const addModWithDefaults = (extra = {}) => {
    const {
      target: targetOverride,
      options: extraOptions,
      source: sourceOverride,
      ...rest
    } = extra || {};
    const options = getTargetOptionsForTrack(track);
    const defaultTarget = targetOverride ?? options?.[0]?.value ?? '';
    const source = typeof sourceOverride === 'string' && sourceOverride ? sourceOverride : 'lfo';
    const defaultSampleInput = (SAMPLE_HOLD_INPUT_OPTIONS && SAMPLE_HOLD_INPUT_OPTIONS[0]?.value) || 'random';
    const baseOptions = source === 'sampleHold'
      ? { sampleInput: defaultSampleInput, hold: 1 }
      : { rate: 1, shape: 'sine' };
    const mod = createModulator(track, {
      source,
      amount: 0,
      target: defaultTarget,
      options: { ...baseOptions, ...(extraOptions || {}) },
      ...rest,
    });
    if (!mod.options || typeof mod.options !== 'object') mod.options = {};
    if ((mod.source ?? source) === 'sampleHold') {
      if (typeof mod.options.sampleInput !== 'string' || !mod.options.sampleInput) {
        mod.options.sampleInput = baseOptions.sampleInput;
      }
      const holdVal = Number(mod.options.hold);
      mod.options.hold = Number.isFinite(holdVal)
        ? Math.max(1, Math.min(128, Math.round(holdVal)))
        : baseOptions.hold;
    } else {
      if (mod.options.rate === undefined) mod.options.rate = baseOptions.rate;
      if (typeof mod.options.shape !== 'string') mod.options.shape = baseOptions.shape;
    }
    rerender();
    return mod;
  };

  if (!mods.length) {
    const empty = document.createElement('div');
    empty.className = 'mod-empty';
    empty.textContent = 'No modulation sources.';
    rootEl.appendChild(empty);
  }

  mods.forEach((mod) => {
    if (!mod || typeof mod !== 'object') return;

    if (!mod.options || typeof mod.options !== 'object') mod.options = {};

    const row = document.createElement('div');
    row.className = 'mod-row';
    row.dataset.modId = mod.id || '';

    const sourceSelect = document.createElement('select');
    const sourceOptions = [...MOD_SOURCES];
    if (mod.source && !sourceOptions.some(opt => opt.value === mod.source)) {
      sourceOptions.push({ value: mod.source, label: mod.source });
    }
    sourceOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      sourceSelect.appendChild(option);
    });
    sourceSelect.value = mod.source || 'lfo';
    const sourceCell = createModCell('Source', sourceSelect);
    row.appendChild(sourceCell);

    const shapeSelect = document.createElement('select');
    const shapeValues = new Set();
    LFO_SHAPE_OPTIONS.forEach(opt => {
      shapeValues.add(opt.value);
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      shapeSelect.appendChild(option);
    });
    const savedShapeRaw = typeof mod.options.shape === 'string' ? mod.options.shape : '';
    const savedShapeKey = savedShapeRaw.toLowerCase();
    if (savedShapeRaw && !shapeValues.has(savedShapeKey)) {
      const customOption = document.createElement('option');
      customOption.value = savedShapeRaw;
      customOption.textContent = savedShapeRaw;
      shapeSelect.appendChild(customOption);
    }
    const initialShape = savedShapeRaw
      ? (shapeValues.has(savedShapeKey) ? savedShapeKey : savedShapeRaw)
      : 'sine';
    shapeSelect.value = initialShape;
    if (!savedShapeRaw || mod.options.shape !== initialShape) {
      mod.options.shape = initialShape;
    }
    shapeSelect.onchange = (ev) => {
      const value = ev.target.value || 'sine';
      mod.options.shape = value;
    };
    const shapeCell = createModCell('Waveform', shapeSelect);
    row.appendChild(shapeCell);

    const rateVal = Number(mod.options.rate);
    const rateControl = createSliderControl({
      min: 0,
      max: 20,
      step: 0.01,
      value: Number.isFinite(rateVal) ? rateVal : 1,
      allowExtend: true,
      format: (val) => formatSliderValue(val, 2),
      parseDisplay: (text) => {
        const raw = Number.parseFloat(text);
        if (!Number.isFinite(raw)) return NaN;
        return Math.max(0, raw);
      },
    });
    rateControl.setOnChange((val) => {
      const value = Number(val);
      if (!Number.isFinite(value)) return;
      mod.options.rate = value;
    });
    const rateCell = createModCell('Rate', rateControl.wrap);
    row.appendChild(rateCell);

    const sampleInputSelect = document.createElement('select');
    const availableSampleInputs = (Array.isArray(SAMPLE_HOLD_INPUT_OPTIONS) && SAMPLE_HOLD_INPUT_OPTIONS.length)
      ? SAMPLE_HOLD_INPUT_OPTIONS
      : [{ value: 'random', label: 'Random' }];
    const sampleInputValues = new Set();
    availableSampleInputs.forEach(opt => {
      sampleInputValues.add(opt.value);
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      sampleInputSelect.appendChild(option);
    });
    const defaultSampleInput = availableSampleInputs[0]?.value ?? 'random';
    let savedSampleInput = typeof mod.options.sampleInput === 'string' ? mod.options.sampleInput : '';
    if (!sampleInputValues.has(savedSampleInput)) {
      savedSampleInput = defaultSampleInput;
    }
    mod.options.sampleInput = savedSampleInput;
    sampleInputSelect.value = savedSampleInput;
    sampleInputSelect.onchange = (ev) => {
      const value = ev.target.value || defaultSampleInput;
      mod.options.sampleInput = value;
      if (mod._state && typeof mod._state === 'object') {
        mod._state.remaining = 0;
      }
    };
    const sampleInputCell = createModCell('Sample Input', sampleInputSelect);
    row.appendChild(sampleInputCell);

    const holdInitial = Number(mod.options.hold);
    const normalizedHold = Number.isFinite(holdInitial)
      ? Math.max(1, Math.min(128, Math.round(holdInitial)))
      : 1;
    mod.options.hold = normalizedHold;
    const holdControl = createSliderControl({
      min: 1,
      max: 128,
      step: 1,
      value: normalizedHold,
      format: (val) => formatSliderValue(Math.round(val), 0),
      parseDisplay: (text) => {
        const raw = Number.parseInt(text, 10);
        if (!Number.isFinite(raw)) return NaN;
        return Math.max(1, Math.min(128, raw));
      },
    });
    holdControl.setOnChange((val) => {
      const raw = Number(val);
      if (!Number.isFinite(raw)) return;
      const next = Math.max(1, Math.min(128, Math.round(raw)));
      mod.options.hold = next;
      if (mod._state && typeof mod._state === 'object') {
        mod._state.remaining = 0;
      }
    });
    const holdCell = createModCell('Hold Steps', holdControl.wrap);
    row.appendChild(holdCell);

    const updateSourceControls = () => {
      const currentSource = mod.source ?? sourceSelect.value ?? '';
      const normalizedSource = `${currentSource}`.toLowerCase();
      const isLfo = normalizedSource === 'lfo';
      const isSampleHold = normalizedSource === 'samplehold';

      shapeCell.style.display = isLfo ? '' : 'none';
      shapeSelect.disabled = !isLfo;
      shapeSelect.setAttribute('aria-disabled', isLfo ? 'false' : 'true');
      rateCell.style.display = isLfo ? '' : 'none';
      rateControl.input.disabled = !isLfo;
      rateControl.valueEl.contentEditable = isLfo ? 'true' : 'false';
      rateControl.valueEl.setAttribute('aria-disabled', isLfo ? 'false' : 'true');
      if (isLfo) {
        if (typeof mod.options.shape !== 'string') {
          mod.options.shape = shapeSelect.value || 'sine';
        }
        const rateValue = Number(mod.options.rate);
        const safeRate = Number.isFinite(rateValue) ? rateValue : 1;
        mod.options.rate = safeRate;
        rateControl.setValue(safeRate, { silent: true });
        rateControl.updateDisplay();
      }

      sampleInputCell.style.display = isSampleHold ? '' : 'none';
      holdCell.style.display = isSampleHold ? '' : 'none';
      sampleInputSelect.disabled = !isSampleHold;
      sampleInputSelect.setAttribute('aria-disabled', isSampleHold ? 'false' : 'true');
      holdControl.input.disabled = !isSampleHold;
      holdControl.valueEl.contentEditable = isSampleHold ? 'true' : 'false';
      holdControl.valueEl.setAttribute('aria-disabled', isSampleHold ? 'false' : 'true');
      if (isSampleHold) {
        if (typeof mod.options.sampleInput !== 'string' || !sampleInputValues.has(mod.options.sampleInput)) {
          mod.options.sampleInput = defaultSampleInput;
        }
        sampleInputSelect.value = mod.options.sampleInput;

        let holdVal = Number(mod.options.hold);
        if (!Number.isFinite(holdVal)) holdVal = 1;
        holdVal = Math.max(1, Math.min(128, Math.round(holdVal)));
        mod.options.hold = holdVal;
        holdControl.setValue(holdVal, { silent: true });
        holdControl.updateDisplay();
      }
    };

    sourceSelect.onchange = (ev) => {
      const value = ev.target.value || 'lfo';
      mod.source = value;
      updateSourceControls();
    };
    updateSourceControls();

    const depthVal = Number(mod.amount);
    const depthControl = createSliderControl({
      min: -1,
      max: 1,
      step: 0.01,
      value: Number.isFinite(depthVal) ? depthVal : 0,
      allowExtend: true,
      format: (val) => formatSliderValue(val, 3),
      parseDisplay: (text) => {
        const raw = Number.parseFloat(text);
        if (!Number.isFinite(raw)) return NaN;
        return raw;
      },
    });
    depthControl.setOnChange((val) => {
      const value = Number(val);
      mod.amount = Number.isFinite(value) ? value : 0;
    });
    row.appendChild(createModCell('Depth', depthControl.wrap));

    const targetSelect = document.createElement('select');
    const optionSource = getTargetOptionsForTrack(track);
    const baseOptions = [
      ...(Array.isArray(optionSource) ? optionSource : []),
    ];
    const currentTarget = Array.isArray(mod.target)
      ? mod.target.join('.')
      : (mod.target || '');
    if (currentTarget && !baseOptions.some(opt => opt.value === currentTarget)) {
      baseOptions.push({ value: currentTarget, label: currentTarget });
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose target';
    targetSelect.appendChild(placeholder);
    baseOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      targetSelect.appendChild(option);
    });
    targetSelect.value = currentTarget || '';
    targetSelect.onchange = (ev) => {
      const value = ev.target.value;
      mod.target = value || '';
    };
    row.appendChild(createModCell('Target', targetSelect));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ghost';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
      removeModulator(track, mod);
      rerender();
    };
    row.appendChild(removeBtn);

    rootEl.appendChild(row);
  });

  const actions = document.createElement('div');
  actions.className = 'mod-actions';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ghost';
  addBtn.textContent = '+ Add Modulation';
  addBtn.onclick = () => {
    addModWithDefaults();
  };
  actions.appendChild(addBtn);

  rootEl.appendChild(actions);
}

export function makeField(label, inputHtml, hint='') {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="inline">${inputHtml}${hint ? `<span class="hint">${hint}</span>` : ''}</div>
    </div>`;
}
