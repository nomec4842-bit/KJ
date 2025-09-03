// ui.js

/**
 * Refreshes the track selector options.
 */
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

/**
 * Render the mixer + engine params panel for a given track.
 * Returns a function to bind events after insertion.
 */
export function renderParams(containerEl, track, makeFieldHtml) {
  const t = track;
  const eng = t.engine;
  const p = t.params[eng];

  const field = (label, inputHtml, hint = '') => makeFieldHtml(label, inputHtml, hint);

  let html = '';

  // Mixer section
  html += `<div class="badge">Mixer</div>`;
  html += field('Volume', `<input id="mx_gain" type="range" min="0" max="1" step="0.01" value="${t.gain}">`);
  html += field('Pan', `<input id="mx_pan" type="range" min="-1" max="1" step="0.01" value="${t.pan}">`);
  html += field('Mute / Solo',
    `<button id="mx_mute" class="toggle ${t.mute ? 'active' : ''}">Mute</button>
     <button id="mx_solo" class="toggle ${t.solo ? 'active' : ''}">Solo</button>`);

  // Engine params
  html += `<div class="badge">Instrument • ${eng}</div>`;

  if (eng === 'synth') {
    html += field('Base Freq', `<input id="p_base" type="number" min="50" max="2000" step="1" value="${p.baseFreq}">`, 'Hz');
    html += field('Cutoff', `<input id="p_cutoff" type="range" min="100" max="12000" step="1" value="${p.cutoff}">`, 'LPF Hz');
    html += field('Q', `<input id="p_q" type="range" min="0.1" max="20" step="0.1" value="${p.q}">`);
    html += field('ADSR',
      `<input id="p_a" type="range" min="0" max="1" step="0.01" value="${p.a}">
       <input id="p_d" type="range" min="0" max="1.5" step="0.01" value="${p.d}">
       <input id="p_s" type="range" min="0" max="1" step="0.01" value="${p.s}">
       <input id="p_r" type="range" min="0" max="2" step="0.01" value="${p.r}">`,
      'A / D / S / R');
  }
  if (eng === 'kick808') {
    html += field('Pitch (Hz)', `<input id="k_freq" type="range" min="20" max="200" step="1" value="${p.freq}">`);
    html += field('Pitch Decay', `<input id="k_pdec" type="range" min="0.005" max="1" step="0.005" value="${p.pitchDecay}">`, 'sec');
    html += field('Amp Decay', `<input id="k_adec" type="range" min="0.05" max="2" step="0.01" value="${p.ampDecay}">`, 'sec');
    html += field('Click', `<input id="k_click" type="range" min="0" max="1" step="0.01" value="${p.click}">`);
  }
  if (eng === 'snare808') {
    html += field('Tone (Hz)', `<input id="n_tone" type="range" min="100" max="400" step="1" value="${p.tone}">`);
    html += field('Noise', `<input id="n_noise" type="range" min="0" max="1" step="0.01" value="${p.noise}">`);
    html += field('Decay', `<input id="n_decay" type="range" min="0.05" max="1" step="0.01" value="${p.decay}">`, 'sec');
  }
  if (eng === 'hat808') {
    html += field('Decay', `<input id="h_decay" type="range" min="0.01" max="1" step="0.01" value="${p.decay}">`, 'sec');
    html += field('HPF', `<input id="h_hpf" type="range" min="2000" max="12000" step="50" value="${p.hpf}">`, 'Hz');
  }
  if (eng === 'clap909') {
    html += field('Bursts', `<input id="c_bursts" type="number" min="2" max="5" step="1" value="${p.bursts}">`);
    html += field('Spread', `<input id="c_spread" type="range" min="0.005" max="0.06" step="0.001" value="${p.spread}">`, 'sec');
    html += field('Decay', `<input id="c_decay" type="range" min="0.05" max="1.5" step="0.01" value="${p.decay}">`, 'sec');
  }

  containerEl.innerHTML = html;

  // Return a binder so main can wire to actual state
  return function bindParamEvents({ applyMixer, t }) {
    const mg = document.getElementById('mx_gain'); if (mg) mg.oninput = e => { t.gain = +e.target.value; applyMixer(); };
    const mp = document.getElementById('mx_pan');  if (mp) mp.oninput = e => { t.pan  = +e.target.value; applyMixer(); };
    const mb = document.getElementById('mx_mute'); if (mb) mb.onclick = () => { t.mute = !t.mute; mb.classList.toggle('active', t.mute); applyMixer(); };
    const sb = document.getElementById('mx_solo'); if (sb) sb.onclick = () => { t.solo = !t.solo; sb.classList.toggle('active', t.solo); applyMixer(); };

    if (eng === 'synth') {
      ['p_base','p_cutoff','p_q','p_a','p_d','p_s','p_r'].forEach(id => {
        const el = document.getElementById(id);
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
      ['k_freq','k_pdec','k_adec','k_click'].forEach(id => {
        const el = document.getElementById(id);
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
      ['n_tone','n_noise','n_decay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.snare808;
          p.tone  = +document.getElementById('n_tone').value;
          p.noise = +document.getElementById('n_noise').value;
          p.decay = +document.getElementById('n_decay').value;
        };
      });
    }
    if (eng === 'hat808') {
      ['h_decay','h_hpf'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.hat808;
          p.decay = +document.getElementById('h_decay').value;
          p.hpf   = +document.getElementById('h_hpf').value;
        };
      });
    }
    if (eng === 'clap909') {
      ['c_bursts','c_spread','c_decay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => {
          const p = t.params.clap909;
          p.bursts = Math.max(2, Math.min(5, +document.getElementById('c_bursts').value));
          p.spread = +document.getElementById('c_spread').value;
          p.decay  = +document.getElementById('c_decay').value;
        };
      });
    }
  };
}

/**
 * Small helper to generate <div class="field"> rows.
 */
export function makeField(label, inputHtml, hint = '') {
  return `
    <div class="field">
      <label>${label}</label>
      <div class="inline">${inputHtml}${hint ? `<span class="hint">${hint}</span>` : ''}</div>
    </div>`;
}
