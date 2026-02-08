const CVL_RATES = [
  { value: '1/1', label: '1/1 (Whole)' },
  { value: '1/2', label: '1/2' },
  { value: '1/2D', label: '1/2 Dotted' },
  { value: '1/2T', label: '1/2 Triplet' },
  { value: '1/4', label: '1/4' },
  { value: '1/4D', label: '1/4 Dotted' },
  { value: '1/4T', label: '1/4 Triplet' },
  { value: '1/8', label: '1/8' },
  { value: '1/8D', label: '1/8 Dotted' },
  { value: '1/8T', label: '1/8 Triplet' },
  { value: '1/16', label: '1/16' },
  { value: '1/16D', label: '1/16 Dotted' },
  { value: '1/16T', label: '1/16 Triplet' },
  { value: '1/32', label: '1/32' },
  { value: '1/32D', label: '1/32 Dotted' },
  { value: '1/32T', label: '1/32 Triplet' },
];

const CVL_STEP_WIDTH = 26;
const CVL_LANE_HEIGHT = 56;

function normalizeSamples(samples = []) {
  return samples
    .filter((sample) => sample && typeof sample === 'object')
    .map((sample) => ({
      name: sample.name || 'Sample',
      duration: Number.isFinite(Number(sample.duration)) ? Number(sample.duration) : null,
    }));
}

function normalizeClips(clips = []) {
  return clips
    .filter((clip) => clip && typeof clip === 'object')
    .map((clip) => ({
      id: clip.id || `clip-${Math.random().toString(36).slice(2, 9)}`,
      lane: Number.isFinite(Number(clip.lane)) ? Math.max(0, Math.trunc(clip.lane)) : 0,
      start: Number.isFinite(Number(clip.start)) ? Math.max(0, Math.trunc(clip.start)) : 0,
      length: Number.isFinite(Number(clip.length)) ? Math.max(1, Math.trunc(clip.length)) : 4,
      sampleName: clip.sampleName || '',
    }));
}

function getAllowedRates() {
  return new Set(CVL_RATES.map((rate) => rate.value));
}

export function normalizeCvlState(cvl) {
  if (!cvl || typeof cvl !== 'object') {
    return {
      lanes: 6,
      samples: [],
      clips: [],
      scrubberRate: '1/16',
      scrubberDepth: 0,
      snap: true,
    };
  }

  const lanes = Number(cvl.lanes);
  const scrubberDepth = Number(cvl.scrubberDepth);
  const scrubberRate = typeof cvl.scrubberRate === 'string' ? cvl.scrubberRate : '';
  const allowedRates = getAllowedRates();

  return {
    lanes: Number.isFinite(lanes) ? Math.max(1, Math.min(12, Math.round(lanes))) : 6,
    samples: normalizeSamples(cvl.samples),
    clips: normalizeClips(cvl.clips),
    scrubberRate: allowedRates.has(scrubberRate) ? scrubberRate : '1/16',
    scrubberDepth: Number.isFinite(scrubberDepth)
      ? Math.max(0, Math.min(1, scrubberDepth))
      : 0,
    snap: cvl.snap !== false,
  };
}

function drawWaveform(canvas, buffer) {
  if (!canvas || !buffer) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  ctx2d.fillStyle = '#1f2a3a';
  ctx2d.fillRect(0, 0, width, height);
  ctx2d.strokeStyle = '#6ab8ff';
  ctx2d.lineWidth = 1;
  const channel = buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channel.length / width));
  ctx2d.beginPath();
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(channel.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i++) {
      const value = channel[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const y1 = ((1 + min) / 2) * height;
    const y2 = ((1 + max) / 2) * height;
    ctx2d.moveTo(x + 0.5, y1);
    ctx2d.lineTo(x + 0.5, y2);
  }
  ctx2d.stroke();
}

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

  const binItems = rootEl.querySelectorAll('.cvl-bin li[draggable="true"]');
  binItems.forEach((item) => {
    item.addEventListener('dragstart', (ev) => {
      const sampleName = item.dataset.sample || '';
      ev.dataTransfer?.setData('text/plain', sampleName);
      ev.dataTransfer?.setData('application/x-cvl-sample', sampleName);
      ev.dataTransfer?.setDragImage(item, 20, 20);
    });
  });

  const laneTracks = rootEl.querySelectorAll('.cvl-lane-track');
  laneTracks.forEach((laneEl) => {
    laneEl.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    });
    laneEl.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const sampleName = ev.dataTransfer?.getData('application/x-cvl-sample')
        || ev.dataTransfer?.getData('text/plain');
      if (!sampleName) return;
      const laneIndex = Number(laneEl.dataset.lane || 0);
      const rect = laneEl.getBoundingClientRect();
      const offsetX = ev.clientX - rect.left;
      const rawStep = Math.max(0, Math.round(offsetX / CVL_STEP_WIDTH));
      const startStep = track.cvl.snap ? Math.round(rawStep) : rawStep;
      const sample = samples.find((s) => s.name === sampleName);
      const duration = Number(sample?.duration);
      const bpm = Number.isFinite(tempoBpm) ? tempoBpm : 120;
      const lengthFromDuration = Number.isFinite(duration)
        ? Math.max(1, Math.round((duration * bpm * 4) / 60))
        : 4;
      const length = Math.min(lengthFromDuration, timelineSteps - startStep);
      const clip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        lane: laneIndex,
        start: Math.max(0, Math.min(startStep, timelineSteps - 1)),
        length: Math.max(1, length),
        sampleName,
      };
      if (!Array.isArray(track.cvl.clips)) track.cvl.clips = [];
      track.cvl.clips.push(clip);
      onSave?.();
      renderCvlPanel({
        panelEl,
        rootEl,
        track,
        tempoBpm: bpm,
        sampleCache,
        onSampleFile,
        onSave,
      });
    });
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
