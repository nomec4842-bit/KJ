// ui.js
import {
  STEP_CHOICES,
  createModulator,
  removeModulator,
  getStepVelocity,
  setStepVelocity,
} from './tracks.js';

const MOD_SOURCES = [
  { value: 'lfo', label: 'LFO' },
];

const LFO_SHAPE_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'saw', label: 'Saw' },
  { value: 'ramp', label: 'Ramp' },
];

const TARGETS_BY_ENGINE = {
  synth: [
    { value: 'synth.baseFreq', label: 'Base Freq' },
    { value: 'synth.cutoff', label: 'Filter Cutoff' },
    { value: 'synth.q', label: 'Filter Q' },
    { value: 'synth.a', label: 'Env Attack' },
    { value: 'synth.d', label: 'Env Decay' },
    { value: 'synth.s', label: 'Env Sustain' },
    { value: 'synth.r', label: 'Env Release' },
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

function getTargetOptionsForTrack(track) {
  if (track?.engine && TARGETS_BY_ENGINE[track.engine]) {
    return TARGETS_BY_ENGINE[track.engine];
  }
  return FALLBACK_TARGETS;
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

export function refreshTrackSelect(selectEl, tracks, selectedIndex) {
  selectEl.innerHTML = '';
  tracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i + 1}. ${t.name} (${t.engine})`;
    selectEl.appendChild(opt);
  });
  selectEl.value = String(selectedIndex);
}

function createInlineStepEditor(rootEl) {
  if (!rootEl) return null;

  let onToggle = null;
  let buttons = [];

  function handleClick(index) {
    if (typeof onToggle === 'function') {
      onToggle(index);
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
      btn.setAttribute('aria-label', `Toggle step ${i + 1}`);
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

  function setOnToggle(fn) {
    onToggle = typeof fn === 'function' ? fn : null;
  }

  return { rebuild, update, paint, setOnToggle };
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

export function renderParams(containerEl, track, makeFieldHtml) {
  const t = track;
  const eng = t.engine;
  const p = t.params[eng];
  const field = (label, inputHtml, hint='') => makeFieldHtml(label, inputHtml, hint);

  let html = '';

  // Mixer
  html += `<div class="badge">Mixer</div>`;
  html += field('Volume', `<input id="mx_gain" type="range" min="0" max="1" step="0.01" value="${t.gain}">`);
  html += field('Pan',    `<input id="mx_pan"  type="range" min="-1" max="1" step="0.01" value="${t.pan}">`);
  html += field('Mute / Solo',
    `<button id="mx_mute" class="toggle ${t.mute?'active':''}">Mute</button>
     <button id="mx_solo" class="toggle ${t.solo?'active':''}">Solo</button>`);

  // Steps per track
  const opts = STEP_CHOICES.map(n => `<option value="${n}" ${n===t.length?'selected':''}>${n}</option>`).join('');
  const stepInline = `
    <div class="step-inline">
      <select id="trk_steps">${opts}</select>
      <div id="trk_stepEditor" class="step-inline-grid" role="group" aria-label="Track steps"></div>
    </div>`;
  html += field('Steps', stepInline, 'per-track length & toggles');

  const stepParamsPanel = `
    <div id="trk_stepParams" class="step-detail placeholder">
      <span class="hint">Step parameter controls will appear here.</span>
    </div>`;
  html += field('Step Params', stepParamsPanel);

  const stepFxPanel = `
    <div id="trk_stepFx" class="step-detail placeholder">
      <span class="hint">Step effect controls will appear here.</span>
    </div>`;
  html += field('Step Effects', stepFxPanel);

  // Instrument block
  html += `<div class="badge">Instrument • ${eng}</div>`;

  if (eng === 'synth') {
    html += field('Base Freq', `<input id="p_base" type="number" min="50" max="2000" step="1" value="${p.baseFreq}">`, 'Hz');
    html += field('Cutoff',    `<input id="p_cutoff" type="range" min="100" max="12000" step="1" value="${p.cutoff}">`, 'LPF Hz');
    html += field('Q',         `<input id="p_q" type="range" min="0.1" max="20" step="0.1" value="${p.q}">`);
    html += field('ADSR',
      `<input id="p_a" type="range" min="0" max="1" step="0.01" value="${p.a}">
       <input id="p_d" type="range" min="0" max="1.5" step="0.01" value="${p.d}">
       <input id="p_s" type="range" min="0" max="1" step="0.01" value="${p.s}">
       <input id="p_r" type="range" min="0" max="2" step="0.01" value="${p.r}">`,
      'A / D / S / R');
  }

  if (eng === 'kick808') {
    html += field('Pitch (Hz)',   `<input id="k_freq" type="range" min="20" max="200" step="1" value="${p.freq}">`);
    html += field('Pitch Decay',  `<input id="k_pdec" type="range" min="0.005" max="1" step="0.005" value="${p.pitchDecay}">`, 'sec');
    html += field('Amp Decay',    `<input id="k_adec" type="range" min="0.05" max="2" step="0.01" value="${p.ampDecay}">`, 'sec');
    html += field('Click',        `<input id="k_click" type="range" min="0" max="1" step="0.01" value="${p.click}">`);
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

  const stepEditorRoot = containerEl.querySelector('#trk_stepEditor');
  const inlineStepEditor = createInlineStepEditor(stepEditorRoot);
  if (inlineStepEditor) {
    containerEl._inlineStepEditor = inlineStepEditor;
  } else if (containerEl._inlineStepEditor) {
    delete containerEl._inlineStepEditor;
  }

  const stepParamsRoot = containerEl.querySelector('#trk_stepParams');
  const stepParamsEditor = createStepParamsPanel(stepParamsRoot, track);
  if (stepParamsEditor) {
    containerEl._stepParamsEditor = stepParamsEditor;
  } else if (containerEl._stepParamsEditor) {
    delete containerEl._stepParamsEditor;
  }

  const modRackEl = containerEl.querySelector('#modRack');
  renderModulationRack(modRackEl, track);

  return function bindParamEvents({ applyMixer, t, onStepsChange, onSampleFile, onStepToggle, onStepParamsChange }) {
    // Mixer
    const mg=document.getElementById('mx_gain'); if (mg) mg.oninput = e => { t.gain = +e.target.value; applyMixer(); };
    const mp=document.getElementById('mx_pan');  if (mp) mp.oninput = e => { t.pan  = +e.target.value; applyMixer(); };
    const mb=document.getElementById('mx_mute'); if (mb) mb.onclick = () => { t.mute = !t.mute; mb.classList.toggle('active', t.mute); applyMixer(); };
    const sb=document.getElementById('mx_solo'); if (sb) sb.onclick = () => { t.solo = !t.solo; sb.classList.toggle('active', t.solo); applyMixer(); };

    // Steps
    const sSel = document.getElementById('trk_steps');
    if (inlineStepEditor) {
      inlineStepEditor.setOnToggle((index) => {
        if (!t.steps || !Array.isArray(t.steps)) return;
        const step = t.steps[index];
        if (!step) return;
        const previous = getStepVelocity(step, 1);
        step.on = !step.on;
        if (step.on) {
          const nextVel = previous > 0 ? previous : 1;
          setStepVelocity(step, nextVel);
        } else {
          setStepVelocity(step, previous);
        }
        inlineStepEditor.update(t.steps);
        if (stepParamsEditor) stepParamsEditor.refresh();
        if (typeof onStepToggle === 'function') onStepToggle(index, step);
      });
      inlineStepEditor.rebuild(t.length ?? (t.steps ? t.steps.length : 0));
      inlineStepEditor.update(t.steps);
      inlineStepEditor.paint(t.pos ?? -1);
    }
    if (sSel) sSel.onchange = e => {
      const v = parseInt(e.target.value, 10);
      if (!Number.isNaN(v)) {
        onStepsChange && onStepsChange(v);
        if (inlineStepEditor) {
          inlineStepEditor.rebuild(t.length ?? (t.steps ? t.steps.length : 0));
          inlineStepEditor.update(t.steps);
          inlineStepEditor.paint(t.pos ?? -1);
        }
      }
    };

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

    // Engine params
    if (eng === 'synth') {
      ['p_base','p_cutoff','p_q','p_a','p_d','p_s','p_r'].forEach(id=>{
        const el=document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.synth;
          p.baseFreq = +document.getElementById('p_base').value;
          p.cutoff   = +document.getElementById('p_cutoff').value;
          p.q        = +document.getElementById('p_q').value;
          p.a        = +document.getElementById('p_a').value;
          p.d        = +document.getElementById('p_d').value;
          p.s        = +document.getElementById('p_s').value;
          p.r        = +document.getElementById('p_r').value;
        };
      });
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
    const { target: targetOverride, options: extraOptions, ...rest } = extra || {};
    const options = getTargetOptionsForTrack(track);
    const defaultTarget = targetOverride ?? options?.[0]?.value ?? '';
    const mod = createModulator(track, {
      source: 'lfo',
      amount: 0,
      target: defaultTarget,
      options: { rate: 1, shape: 'sine', ...(extraOptions || {}) },
      ...rest,
    });
    if (!mod.options || typeof mod.options !== 'object') mod.options = {};
    if (mod.options.rate === undefined) mod.options.rate = 1;
    if (typeof mod.options.shape !== 'string') mod.options.shape = 'sine';
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
    row.appendChild(createModCell('Source', sourceSelect));

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

    const updateSourceControls = () => {
      const currentSource = mod.source ?? sourceSelect.value ?? '';
      const isLfo = `${currentSource}`.toLowerCase() === 'lfo';
      shapeCell.style.display = isLfo ? '' : 'none';
      if (isLfo && typeof mod.options.shape !== 'string') {
        mod.options.shape = shapeSelect.value || 'sine';
      }
    };
    sourceSelect.onchange = (ev) => {
      const value = ev.target.value || 'lfo';
      mod.source = value;
      updateSourceControls();
    };
    updateSourceControls();

    const rateInput = document.createElement('input');
    rateInput.type = 'number';
    rateInput.min = '0';
    rateInput.step = '0.01';
    const rateVal = Number(mod.options.rate);
    rateInput.value = Number.isFinite(rateVal) ? `${rateVal}` : '1';
    rateInput.oninput = (ev) => {
      const value = Number.parseFloat(ev.target.value);
      if (!Number.isFinite(value)) return;
      mod.options.rate = value;
    };
    row.appendChild(createModCell('Rate', rateInput));

    const depthInput = document.createElement('input');
    depthInput.type = 'number';
    depthInput.step = '0.01';
    const depthVal = Number(mod.amount);
    depthInput.value = Number.isFinite(depthVal) ? `${depthVal}` : '0';
    depthInput.oninput = (ev) => {
      const value = Number.parseFloat(ev.target.value);
      mod.amount = Number.isFinite(value) ? value : 0;
    };
    row.appendChild(createModCell('Depth', depthInput));

    const targetSelect = document.createElement('select');
    const baseOptions = [...getTargetOptionsForTrack(track)];
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

  const addLfoBtn = document.createElement('button');
  addLfoBtn.type = 'button';
  addLfoBtn.className = 'ghost';
  addLfoBtn.textContent = '+ Add LFO';
  addLfoBtn.onclick = () => {
    addModWithDefaults({ source: 'lfo' });
  };
  actions.appendChild(addLfoBtn);
  rootEl.appendChild(actions);
}

export function makeField(label, inputHtml, hint='') {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="inline">${inputHtml}${hint ? `<span class="hint">${hint}</span>` : ''}</div>
    </div>`;
}
