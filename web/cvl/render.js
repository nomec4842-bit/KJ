import { CVL_LANE_HEIGHT, CVL_RATES, CVL_STEP_WIDTH } from './constants.js';
import { getAllowedRates } from './state.js';
import { drawWaveform } from './waveform.js';
import { bindCvlDragAndDrop } from './dnd.js';

export function renderCvlPanel({
  panelEl,
  rootEl,
  track,
  tempoBpm,
  sampleCache,
  onSampleFile,
  onSave,
}) {
  if (!panelEl || !rootEl) return;
  if (!track || track.type !== 'cvl') {
    panelEl.classList.add('is-hidden');
    rootEl.innerHTML = '';
    return;
  }

  panelEl.classList.remove('is-hidden');

  const samples = Array.isArray(track.cvl?.samples) ? track.cvl.samples : [];
  const clips = Array.isArray(track.cvl?.clips) ? track.cvl.clips : [];
  const lanes = Number.isFinite(Number(track.cvl?.lanes)) ? Math.max(1, Math.round(track.cvl.lanes)) : 6;
  const timelineSteps = Math.max(1, Number.isFinite(track.length) ? track.length : 16);
  const timelineWidth = timelineSteps * CVL_STEP_WIDTH;
  const rateOptions = CVL_RATES.map((rate) => (
    `<option value="${rate.value}" ${rate.value === track.cvl.scrubberRate ? 'selected' : ''}>${rate.label}</option>`
  )).join('');

  const sampleList = samples.length
    ? samples.map((sample) => `<li draggable="true" data-sample="${sample.name}">${sample.name}</li>`).join('')
    : '<li class="cvl-empty">No samples loaded.</li>';

  const rulerMarks = [];
  for (let i = 0; i < timelineSteps; i += 4) {
    rulerMarks.push(`<div class="cvl-ruler-mark" style="left:${i * CVL_STEP_WIDTH}px">${(i / 4) + 1}</div>`);
  }

  const laneRows = Array.from({ length: lanes }, (_, index) => {
    const laneClips = clips.filter((clip) => clip.lane === index);
    const clipEls = laneClips.map((clip) => {
      const left = Math.max(0, clip.start * CVL_STEP_WIDTH);
      const width = Math.max(CVL_STEP_WIDTH, clip.length * CVL_STEP_WIDTH);
      const safeName = clip.sampleName || 'Sample';
      return `
        <div class="cvl-clip" style="left:${left}px;width:${width}px" data-clip="${clip.id}" title="${safeName}">
          <div class="cvl-clip-label">${safeName}</div>
          <canvas class="cvl-clip-wave" width="${Math.max(1, Math.round(width))}" height="28"></canvas>
        </div>
      `;
    }).join('');
    return `
      <div class="cvl-lane">
        <div class="cvl-lane-label">Lane ${index + 1}</div>
        <div class="cvl-lane-track" data-lane="${index}" style="width:${timelineWidth}px;height:${CVL_LANE_HEIGHT}px">
          ${clipEls}
        </div>
      </div>
    `;
  }).join('');

  rootEl.innerHTML = `
    <div class="cvl-window">
      <div class="cvl-header">
        <label class="ctrl">
          Sample Loader
          <input id="cvl_sample" type="file" accept="audio/*">
        </label>
        <div class="cvl-controls">
          <label class="ctrl">
            Scrubber Mod Rate
            <select id="cvl_scrubberRate">${rateOptions}</select>
          </label>
          <label class="ctrl">
            Depth
            <input id="cvl_scrubberDepth" type="range" min="0" max="1" step="0.01" value="${track.cvl.scrubberDepth ?? 0}">
          </label>
          <label class="ctrl cvl-snap">
            Snap to Grid
            <input id="cvl_snap" type="checkbox" ${track.cvl.snap !== false ? 'checked' : ''}>
          </label>
        </div>
      </div>
      <div class="cvl-body">
        <aside class="cvl-bin">
          <h4>Sample Bin</h4>
          <ul>${sampleList}</ul>
        </aside>
        <div class="cvl-lanes">
          <div class="cvl-ruler" style="width:${timelineWidth}px">
            ${rulerMarks.join('')}
          </div>
          ${laneRows}
        </div>
      </div>
    </div>
  `;

  const sampleInput = rootEl.querySelector('#cvl_sample');
  if (sampleInput && typeof onSampleFile === 'function') {
    sampleInput.onchange = (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      onSampleFile(file);
      ev.target.value = '';
    };
  }

  const rateSelect = rootEl.querySelector('#cvl_scrubberRate');
  if (rateSelect) {
    rateSelect.onchange = (ev) => {
      const value = ev.target.value;
      const allowed = getAllowedRates();
      track.cvl.scrubberRate = allowed.has(value) ? value : '1/16';
      onSave?.();
    };
  }

  const depthControl = rootEl.querySelector('#cvl_scrubberDepth');
  if (depthControl) {
    depthControl.oninput = (ev) => {
      const value = Number(ev.target.value);
      track.cvl.scrubberDepth = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    };
    depthControl.onchange = () => {
      onSave?.();
    };
  }

  const snapToggle = rootEl.querySelector('#cvl_snap');
  if (snapToggle) {
    snapToggle.onchange = (ev) => {
      track.cvl.snap = !!ev.target.checked;
      onSave?.();
    };
  }

  bindCvlDragAndDrop({
    rootEl,
    track,
    samples,
    timelineSteps,
    tempoBpm,
    onSave,
    onReRender: () => renderCvlPanel({
      panelEl,
      rootEl,
      track,
      tempoBpm,
      sampleCache,
      onSampleFile,
      onSave,
    }),
  });

  const clipEls = rootEl.querySelectorAll('.cvl-clip');
  clipEls.forEach((clipEl) => {
    const clipId = clipEl.dataset.clip;
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    const sampleBuffer = sampleCache?.[clip.sampleName];
    const canvas = clipEl.querySelector('canvas');
    if (canvas && sampleBuffer) {
      drawWaveform(canvas, sampleBuffer);
    }
  });
}
