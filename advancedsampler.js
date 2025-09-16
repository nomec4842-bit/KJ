// advancedsampler.js
const DEFAULT_ADV_STATE = Object.freeze({
  fine: 0,
  recordBars: 1,
  manualStretchBeats: 0,
  manualStretchSeconds: 0,
  activeStretchSeconds: 0,
  selectedMarkerId: 'manual',
  markerCounter: 0,
  markers: [
    { id: 'marker-start', position: 0, locked: true, stretchBeats: 0, stretchSeconds: 0 },
    { id: 'marker-end', position: 1, locked: true, stretchBeats: 0, stretchSeconds: 0 },
  ],
});

const CLAMP_EPSILON = 0.001;

function cloneState(state) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}

function clamp01(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return 0;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

function beatsToSeconds(beats, tempo) {
  const b = Number(beats);
  const t = Number(tempo);
  if (!Number.isFinite(b) || !Number.isFinite(t) || b <= 0 || t <= 0) return 0;
  return (60 / t) * b;
}

function secondsToBeats(seconds, tempo) {
  const s = Number(seconds);
  const t = Number(tempo);
  if (!Number.isFinite(s) || !Number.isFinite(t) || s <= 0 || t <= 0) return 0;
  return s / (60 / t);
}

function createMarkerId(counter) {
  return `marker-${counter}`;
}

function ensureMarkerStructure(marker, fallbackId = 'marker') {
  if (!marker || typeof marker !== 'object') {
    return {
      id: fallbackId,
      position: 0,
      locked: false,
      stretchBeats: 0,
      stretchSeconds: 0,
    };
  }
  const clone = { ...marker };
  if (typeof clone.id !== 'string' || !clone.id) clone.id = fallbackId;
  clone.position = clamp01(clone.position ?? 0);
  clone.locked = !!clone.locked;
  const beats = Number(clone.stretchBeats);
  clone.stretchBeats = Number.isFinite(beats) && beats > 0 ? beats : 0;
  const secs = Number(clone.stretchSeconds);
  clone.stretchSeconds = Number.isFinite(secs) && secs > 0 ? secs : 0;
  return clone;
}

export function createAdvancedSamplerState(overrides = {}) {
  const base = cloneState(DEFAULT_ADV_STATE);
  return sanitizeAdvancedSamplerState({ ...base, ...overrides });
}

export function sanitizeAdvancedSamplerState(state) {
  if (!state || typeof state !== 'object') {
    return createAdvancedSamplerState();
  }

  const adv = state;
  adv.fine = clamp(adv.fine ?? 0, -1200, 1200);
  const bars = Math.floor(Number(adv.recordBars));
  adv.recordBars = Number.isFinite(bars) && bars > 0 ? clamp(bars, 1, 64) : 1;

  adv.manualStretchBeats = Math.max(0, Number(adv.manualStretchBeats) || 0);
  adv.manualStretchSeconds = Math.max(0, Number(adv.manualStretchSeconds) || 0);
  adv.activeStretchSeconds = Math.max(0, Number(adv.activeStretchSeconds) || 0);

  if (typeof adv.markerCounter !== 'number' || adv.markerCounter < 0) {
    adv.markerCounter = 0;
  }

  const safeMarkers = Array.isArray(adv.markers) ? adv.markers.slice() : [];
  const normalized = safeMarkers.map((m, i) => ensureMarkerStructure(m, createMarkerId(adv.markerCounter + i + 1)));

  const markersById = new Map();
  const deduped = [];
  for (const marker of normalized) {
    if (markersById.has(marker.id)) continue;
    markersById.set(marker.id, marker);
    deduped.push(marker);
  }

  const haveStart = deduped.some(m => m.locked && Math.abs(m.position) <= CLAMP_EPSILON);
  if (!haveStart) {
    deduped.push({ id: 'marker-start', position: 0, locked: true, stretchBeats: 0, stretchSeconds: 0 });
  }

  const haveEnd = deduped.some(m => m.locked && Math.abs(m.position - 1) <= CLAMP_EPSILON);
  if (!haveEnd) {
    deduped.push({ id: 'marker-end', position: 1, locked: true, stretchBeats: 0, stretchSeconds: 0 });
  }

  deduped.sort((a, b) => a.position - b.position);

  // Ensure locked boundary ids are stable
  deduped[0].id = 'marker-start';
  deduped[0].position = 0;
  deduped[0].locked = true;
  deduped[0].stretchBeats = Math.max(0, Number(deduped[0].stretchBeats) || 0);
  deduped[0].stretchSeconds = Math.max(0, Number(deduped[0].stretchSeconds) || 0);

  const last = deduped[deduped.length - 1];
  last.id = 'marker-end';
  last.position = 1;
  last.locked = true;
  last.stretchBeats = 0;
  last.stretchSeconds = 0;

  for (let i = 1; i < deduped.length - 1; i++) {
    const marker = deduped[i];
    if (Math.abs(marker.position) <= CLAMP_EPSILON) marker.position = CLAMP_EPSILON;
    if (Math.abs(marker.position - 1) <= CLAMP_EPSILON) marker.position = 1 - CLAMP_EPSILON;
    const prev = deduped[i - 1];
    const next = deduped[i + 1];
    const min = prev ? prev.position + CLAMP_EPSILON : 0;
    const max = next ? next.position - CLAMP_EPSILON : 1;
    marker.position = clamp(marker.position, min, max);
    if (typeof marker.id !== 'string' || !marker.id || marker.id === 'marker-start' || marker.id === 'marker-end') {
      marker.id = createMarkerId(++adv.markerCounter);
    }
    const beats = Number(marker.stretchBeats);
    marker.stretchBeats = Number.isFinite(beats) && beats > 0 ? beats : 0;
    const secs = Number(marker.stretchSeconds);
    marker.stretchSeconds = Number.isFinite(secs) && secs > 0 ? secs : 0;
  }

  adv.markers = deduped;

  const maxCounter = adv.markers.reduce((max, marker) => {
    const match = /marker-(\d+)/.exec(marker.id);
    if (!match) return max;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, adv.markerCounter);
  adv.markerCounter = Math.max(adv.markerCounter, maxCounter);

  if (adv.selectedMarkerId === undefined || adv.selectedMarkerId === null) {
    adv.selectedMarkerId = 'manual';
  }
  if (adv.selectedMarkerId !== 'manual') {
    const exists = adv.markers.some(m => m.id === adv.selectedMarkerId);
    if (!exists) adv.selectedMarkerId = 'manual';
  }

  return adv;
}

export function resetAdvancedSamplerState(params, options = {}) {
  if (!params || typeof params !== 'object') return createAdvancedSamplerState();
  const adv = sanitizeAdvancedSamplerState(params.advancedState);
  const { keepFine = true, keepRecordBars = true } = options;
  if (!keepFine) adv.fine = 0;
  if (!keepRecordBars) adv.recordBars = 1;
  adv.manualStretchBeats = 0;
  adv.manualStretchSeconds = 0;
  adv.activeStretchSeconds = 0;
  adv.selectedMarkerId = 'manual';
  adv.markers = adv.markers.filter(m => m.locked);
  adv.markers.forEach(marker => {
    marker.stretchBeats = 0;
    marker.stretchSeconds = 0;
  });
  adv.markerCounter = 0;
  params.advancedState = sanitizeAdvancedSamplerState(adv);
  return params.advancedState;
}

function buildElement(tag, className, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

function createCanvas(width = 600, height = 140) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'advSampler__canvas';
  return canvas;
}

function getTempo() {
  const tempoInput = document.getElementById('tempo');
  const value = Number(tempoInput?.value);
  if (!Number.isFinite(value) || value <= 0) return 120;
  return value;
}

function describeSlice(start, end, index) {
  const startPct = formatPercent(start);
  const endPct = formatPercent(end);
  const lengthPct = formatPercent(end - start);
  const n = index + 1;
  return `Slice ${n}: ${startPct} → ${endPct} (${lengthPct})`;
}

function createSummaryText(seconds, tempo) {
  if (!seconds || seconds <= 0) return '(no stretch applied)';
  const beats = secondsToBeats(seconds, tempo);
  if (!beats) return `≈ ${seconds.toFixed(2)} s`;
  return `${beats.toFixed(2)} beats ≈ ${seconds.toFixed(2)} s`;
}

export function mountAdvancedSampler(hostEl, context = {}) {
  if (!hostEl) return null;
  if (typeof hostEl.__advSamplerDispose === 'function') {
    try { hostEl.__advSamplerDispose(); } catch {}
    hostEl.__advSamplerDispose = null;
  }
  const { track, params, startInput, endInput } = context;

  hostEl.innerHTML = '';
  hostEl.classList.add('advSampler');

  if (!track || !params) {
    const msg = buildElement('div', 'hint', ['No track selected.']);
    hostEl.appendChild(msg);
    return null;
  }

  const adv = sanitizeAdvancedSamplerState(params.advancedState);
  params.advancedState = adv;

  const canvasWrap = buildElement('div', 'advSampler__canvasWrap');
  const overlay = buildElement('div', 'advSampler__overlay');
  const regionEl = buildElement('div', 'advSampler__region');
  overlay.appendChild(regionEl);

  const startHandle = buildElement('div', 'advSampler__handle advSampler__handle--start');
  const endHandle = buildElement('div', 'advSampler__handle advSampler__handle--end');
  overlay.appendChild(startHandle);
  overlay.appendChild(endHandle);

  const markersLayer = buildElement('div', 'advSampler__markers');
  overlay.appendChild(markersLayer);

  const canvas = createCanvas(Math.max(480, hostEl.clientWidth || 480));
  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(overlay);

  const hint = buildElement('div', 'hint advSampler__hint', [
    'Drag handles to adjust the window. Shift+Click to add a marker, Alt+Click to remove one.',
  ]);

  const sliceRow = buildElement('div', 'advSampler__row');
  const sliceLabel = buildElement('span', 'advSampler__label', ['Slice']);
  const sliceSelect = buildElement('select', 'advSampler__select');
  sliceRow.appendChild(sliceLabel);
  sliceRow.appendChild(sliceSelect);

  const stretchRow = buildElement('div', 'advSampler__row');
  const stretchLabel = buildElement('span', 'advSampler__label', ['Stretch to']);
  const stretchInput = document.createElement('input');
  stretchInput.type = 'number';
  stretchInput.min = '0';
  stretchInput.step = '0.25';
  stretchInput.className = 'advSampler__number';
  const stretchHint = buildElement('span', 'hint advSampler__stretchHint');
  stretchRow.appendChild(stretchLabel);
  stretchRow.appendChild(stretchInput);
  stretchRow.appendChild(stretchHint);

  const fineRow = buildElement('div', 'advSampler__row');
  const fineLabel = buildElement('span', 'advSampler__label', ['Fine tune']);
  const fineRange = document.createElement('input');
  fineRange.type = 'range';
  fineRange.min = '-100';
  fineRange.max = '100';
  fineRange.step = '1';
  fineRange.className = 'advSampler__range';
  const fineNumber = document.createElement('input');
  fineNumber.type = 'number';
  fineNumber.step = '1';
  fineNumber.min = '-1200';
  fineNumber.max = '1200';
  fineNumber.className = 'advSampler__number';
  const fineUnit = buildElement('span', 'hint', ['cents']);
  fineRow.appendChild(fineLabel);
  fineRow.appendChild(fineRange);
  fineRow.appendChild(fineNumber);
  fineRow.appendChild(fineUnit);

  const recordRow = buildElement('div', 'advSampler__row');
  const recordLabel = buildElement('span', 'advSampler__label', ['Record length']);
  const recordInput = document.createElement('input');
  recordInput.type = 'number';
  recordInput.min = '1';
  recordInput.max = '64';
  recordInput.step = '1';
  recordInput.className = 'advSampler__number';
  const recordHint = buildElement('span', 'hint', ['bars']);
  recordRow.appendChild(recordLabel);
  recordRow.appendChild(recordInput);
  recordRow.appendChild(recordHint);

  const markerControls = buildElement('div', 'advSampler__row advSampler__row--markers');
  const markerLabel = buildElement('span', 'advSampler__label', ['Markers']);
  const addWrap = buildElement('div', 'advSampler__add');
  const addInput = document.createElement('input');
  addInput.type = 'number';
  addInput.min = '0';
  addInput.max = '1';
  addInput.step = '0.01';
  addInput.className = 'advSampler__number';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add';
  addBtn.className = 'ghost';
  addWrap.appendChild(addInput);
  addWrap.appendChild(addBtn);
  markerControls.appendChild(markerLabel);
  markerControls.appendChild(addWrap);

  const markerList = buildElement('div', 'advSampler__markerList');

  hostEl.appendChild(canvasWrap);
  hostEl.appendChild(hint);
  hostEl.appendChild(sliceRow);
  hostEl.appendChild(stretchRow);
  hostEl.appendChild(fineRow);
  hostEl.appendChild(recordRow);
  hostEl.appendChild(markerControls);
  hostEl.appendChild(markerList);

  const markerElements = new Map();

  function computeSlices() {
    const list = [];
    const markers = adv.markers;
    for (let i = 0; i < markers.length - 1; i++) {
      const current = markers[i];
      const next = markers[i + 1];
      list.push({
        id: current.id,
        start: current.position,
        end: next.position,
        marker: current,
        index: i,
      });
    }
    return list;
  }

  function updateSliceOptions() {
    const slices = computeSlices();
    sliceSelect.innerHTML = '';
    const manualOpt = document.createElement('option');
    manualOpt.value = 'manual';
    manualOpt.textContent = 'Manual (start/end sliders)';
    sliceSelect.appendChild(manualOpt);
    slices.forEach(slice => {
      const opt = document.createElement('option');
      opt.value = slice.id;
      opt.textContent = describeSlice(slice.start, slice.end, slice.index);
      sliceSelect.appendChild(opt);
    });
    sliceSelect.value = adv.selectedMarkerId || 'manual';
    if (sliceSelect.value !== 'manual') {
      const exists = slices.some(s => s.id === sliceSelect.value);
      if (!exists) {
        adv.selectedMarkerId = 'manual';
        sliceSelect.value = 'manual';
      }
    }
  }

  function updateStretchSummary() {
    const tempo = getTempo();
    let seconds = 0;
    if (adv.selectedMarkerId === 'manual') {
      seconds = adv.manualStretchSeconds;
      const beats = Math.max(0, Number(adv.manualStretchBeats) || 0);
      stretchInput.value = beats ? beats.toString() : '';
    } else {
      const marker = adv.markers.find(m => m.id === adv.selectedMarkerId);
      const beats = marker?.stretchBeats ?? 0;
      const secs = marker?.stretchSeconds ?? 0;
      stretchInput.value = beats ? beats.toString() : '';
      seconds = secs;
    }
    adv.activeStretchSeconds = seconds;
    stretchHint.textContent = createSummaryText(seconds, tempo);
  }

  function updateFineControls() {
    fineRange.value = Number(adv.fine ?? 0).toString();
    fineNumber.value = Number(adv.fine ?? 0).toString();
  }

  function updateRecordInput() {
    recordInput.value = Number(adv.recordBars ?? 1).toString();
  }

  function applyRange(start, end, { fromSelection = false } = {}) {
    const s = clamp(start, 0, 1);
    const e = clamp(end, 0, 1);
    const startNorm = Math.min(s, e - CLAMP_EPSILON);
    const endNorm = Math.max(e, startNorm + CLAMP_EPSILON);
    params.start = startNorm;
    params.end = endNorm;
    if (startInput) startInput.value = startNorm.toFixed(2);
    if (endInput) endInput.value = endNorm.toFixed(2);
    if (!fromSelection) {
      adv.selectedMarkerId = 'manual';
    }
    updateOverlay();
  }

  function updateOverlay() {
    const startPct = params.start * 100;
    const endPct = params.end * 100;
    regionEl.style.left = `${startPct}%`;
    regionEl.style.width = `${Math.max(0, endPct - startPct)}%`;
    startHandle.style.left = `${startPct}%`;
    endHandle.style.left = `${endPct}%`;
    adv.markers.forEach(marker => {
      const markerEl = markerElements.get(marker.id);
      if (markerEl) {
        markerEl.style.left = `${marker.position * 100}%`;
        markerEl.classList.toggle('is-selected', adv.selectedMarkerId === marker.id);
        markerEl.classList.toggle('is-locked', !!marker.locked);
      }
    });
  }

  function rebuildMarkers() {
    markersLayer.innerHTML = '';
    markerElements.clear();
    adv.markers.forEach(marker => {
      if (marker.id === 'marker-end') return; // do not render end marker handle
      const markerEl = buildElement('div', 'advSampler__marker');
      markerEl.dataset.markerId = marker.id;
      markerEl.style.left = `${marker.position * 100}%`;
      markerEl.classList.toggle('is-locked', !!marker.locked);
      markerElements.set(marker.id, markerEl);
      markersLayer.appendChild(markerEl);
    });
    updateOverlay();
  }

  function renderMarkerList() {
    markerList.innerHTML = '';
    const slices = computeSlices();
    slices.forEach(slice => {
      const marker = slice.marker;
      const item = buildElement('div', 'advSampler__markerRow');
      const name = buildElement('span', 'advSampler__markerName', [describeSlice(slice.start, slice.end, slice.index)]);
      const beatsInput = document.createElement('input');
      beatsInput.type = 'number';
      beatsInput.step = '0.25';
      beatsInput.min = '0';
      beatsInput.className = 'advSampler__number';
      beatsInput.value = marker.stretchBeats ? marker.stretchBeats.toString() : '';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'ghost';
      removeBtn.disabled = !!marker.locked;

      item.appendChild(name);
      item.appendChild(beatsInput);
      item.appendChild(removeBtn);

      if (!marker.locked) {
        removeBtn.onclick = (ev) => {
          ev.stopPropagation();
          const idx = adv.markers.findIndex(m => m.id === marker.id);
          if (idx > 0) {
            adv.markers.splice(idx, 1);
            sanitizeAdvancedSamplerState(adv);
            if (adv.selectedMarkerId === marker.id) {
              adv.selectedMarkerId = 'manual';
            }
            rebuildMarkers();
            updateSliceOptions();
            renderMarkerList();
            updateStretchSummary();
          }
        };
      } else {
        removeBtn.onclick = (ev) => ev.stopPropagation();
      }

      beatsInput.oninput = () => {
        const value = Number(beatsInput.value);
        if (!Number.isFinite(value) || value <= 0) {
          marker.stretchBeats = 0;
          marker.stretchSeconds = 0;
        } else {
          marker.stretchBeats = value;
          marker.stretchSeconds = beatsToSeconds(value, getTempo());
        }
        if (adv.selectedMarkerId === marker.id) {
          adv.activeStretchSeconds = marker.stretchSeconds;
          updateStretchSummary();
        }
      };

      item.onclick = () => {
        adv.selectedMarkerId = marker.id;
        applyRange(slice.start, slice.end, { fromSelection: true });
        sliceSelect.value = marker.id;
        updateStretchSummary();
        updateOverlay();
      };

      markerList.appendChild(item);
    });
  }

  function drawWaveform() {
    const ctx = canvas.getContext('2d');
    const buffer = track.sample?.buffer;
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.height;

    canvas.width = Math.max(480, hostEl.clientWidth || width);
    canvas.height = height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1b212d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!buffer) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Load a sample to view the waveform.', canvas.width / 2, canvas.height / 2);
      return;
    }

    const channelData = buffer.getChannelData(0);
    const step = Math.ceil(channelData.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.strokeStyle = '#4aa3ff';
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const start = x * step;
      let min = 1.0;
      let max = -1.0;
      for (let i = 0; i < step && start + i < channelData.length; i++) {
        const sample = channelData[start + i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const y1 = (1 + min) * amp;
      const y2 = (1 + max) * amp;
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }
    ctx.stroke();
  }

  function addMarker(position) {
    const pos = clamp(position, 0, 1);
    const marker = {
      id: createMarkerId(++adv.markerCounter),
      position: pos,
      locked: false,
      stretchBeats: 0,
      stretchSeconds: 0,
    };
    adv.markers.push(marker);
    sanitizeAdvancedSamplerState(adv);
    rebuildMarkers();
    updateSliceOptions();
    renderMarkerList();
    updateStretchSummary();
  }

  function removeNearestMarker(position) {
    const markers = adv.markers.filter(m => !m.locked);
    if (!markers.length) return;
    let nearest = null;
    let distance = Infinity;
    for (const marker of markers) {
      const d = Math.abs(marker.position - position);
      if (d < distance) {
        distance = d;
        nearest = marker;
      }
    }
    if (!nearest) return;
    const threshold = 0.05;
    if (distance > threshold) return;
    const idx = adv.markers.findIndex(m => m.id === nearest.id);
    if (idx >= 0) {
      adv.markers.splice(idx, 1);
      sanitizeAdvancedSamplerState(adv);
      if (adv.selectedMarkerId === nearest.id) adv.selectedMarkerId = 'manual';
      rebuildMarkers();
      updateSliceOptions();
      renderMarkerList();
      updateStretchSummary();
    }
  }

  function markerPointerHandler(ev) {
    const markerId = ev.currentTarget.dataset.markerId;
    const marker = adv.markers.find(m => m.id === markerId);
    if (!marker || marker.locked) return;
    const rect = overlay.getBoundingClientRect();
    let pointerId = ev.pointerId;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(pointerId);

    const move = (event) => {
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const idx = adv.markers.findIndex(m => m.id === marker.id);
      if (idx <= 0 || idx >= adv.markers.length - 1) return;
      const prev = adv.markers[idx - 1];
      const next = adv.markers[idx + 1];
      const min = prev.position + CLAMP_EPSILON;
      const max = next.position - CLAMP_EPSILON;
      marker.position = clamp(x, min, max);
      updateOverlay();
      renderMarkerList();
      sanitizeAdvancedSamplerState(adv);
      updateSliceOptions();
    };

    const up = () => {
      ev.currentTarget.releasePointerCapture(pointerId);
      ev.currentTarget.removeEventListener('pointermove', move);
      ev.currentTarget.removeEventListener('pointerup', up);
      ev.currentTarget.removeEventListener('pointercancel', up);
      sanitizeAdvancedSamplerState(adv);
      rebuildMarkers();
      updateSliceOptions();
      renderMarkerList();
      updateStretchSummary();
    };

    ev.currentTarget.addEventListener('pointermove', move);
    ev.currentTarget.addEventListener('pointerup', up);
    ev.currentTarget.addEventListener('pointercancel', up);
  }

  function attachMarkerEvents() {
    markersLayer.querySelectorAll('.advSampler__marker').forEach(el => {
      if (el.classList.contains('is-locked')) return;
      el.addEventListener('pointerdown', markerPointerHandler);
    });
  }

  function handleHandleDrag(handleEl, type) {
    handleEl.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const pointerId = ev.pointerId;
      handleEl.setPointerCapture(pointerId);
      const move = (event) => {
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        if (type === 'start') {
          params.start = Math.min(x, params.end - CLAMP_EPSILON);
          if (startInput) startInput.value = params.start.toFixed(2);
          adv.selectedMarkerId = 'manual';
        } else {
          params.end = Math.max(x, params.start + CLAMP_EPSILON);
          if (endInput) endInput.value = params.end.toFixed(2);
          adv.selectedMarkerId = 'manual';
        }
        updateOverlay();
        updateSliceOptions();
        updateStretchSummary();
      };
      const up = () => {
        handleEl.releasePointerCapture(pointerId);
        handleEl.removeEventListener('pointermove', move);
        handleEl.removeEventListener('pointerup', up);
        handleEl.removeEventListener('pointercancel', up);
      };
      handleEl.addEventListener('pointermove', move);
      handleEl.addEventListener('pointerup', up);
      handleEl.addEventListener('pointercancel', up);
    });
  }

  function syncFromParams() {
    sanitizeAdvancedSamplerState(adv);
    if (typeof params.start === 'number') params.start = clamp(params.start, 0, 1);
    else params.start = 0;
    if (typeof params.end === 'number') params.end = clamp(params.end, 0, 1);
    else params.end = 1;
    if (params.end <= params.start + CLAMP_EPSILON) params.end = Math.min(1, params.start + 0.1);
    if (startInput) startInput.value = params.start.toFixed(2);
    if (endInput) endInput.value = params.end.toFixed(2);
    updateOverlay();
    updateSliceOptions();
    renderMarkerList();
    updateStretchSummary();
    updateFineControls();
    updateRecordInput();
    drawWaveform();
    attachMarkerEvents();
  }

  function onResize() {
    drawWaveform();
    updateOverlay();
  }

  window.addEventListener('resize', onResize);
  const tempoInput = document.getElementById('tempo');
  const tempoListener = () => updateStretchSummary();
  if (tempoInput) {
    tempoInput.addEventListener('input', tempoListener);
    tempoInput.addEventListener('change', tempoListener);
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const norm = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    if (ev.shiftKey) {
      addMarker(norm);
      attachMarkerEvents();
      return;
    }
    if (ev.altKey) {
      removeNearestMarker(norm);
      return;
    }
    // plain click sets manual selection start near click
    const center = (params.start + params.end) / 2;
    if (norm < center) {
      params.start = Math.min(norm, params.end - CLAMP_EPSILON);
      if (startInput) startInput.value = params.start.toFixed(2);
    } else {
      params.end = Math.max(norm, params.start + CLAMP_EPSILON);
      if (endInput) endInput.value = params.end.toFixed(2);
    }
    adv.selectedMarkerId = 'manual';
    updateOverlay();
    updateSliceOptions();
    updateStretchSummary();
  });

  addBtn.onclick = () => {
    const value = Number(addInput.value);
    if (!Number.isFinite(value)) return;
    addMarker(clamp01(value));
    addInput.value = '';
    attachMarkerEvents();
  };

  sliceSelect.onchange = () => {
    const value = sliceSelect.value;
    if (value === 'manual') {
      adv.selectedMarkerId = 'manual';
      updateStretchSummary();
      updateOverlay();
      return;
    }
    const slice = computeSlices().find(s => s.id === value);
    if (!slice) return;
    adv.selectedMarkerId = slice.id;
    applyRange(slice.start, slice.end, { fromSelection: true });
    updateStretchSummary();
    updateOverlay();
  };

  stretchInput.oninput = () => {
    const beats = Number(stretchInput.value);
    const tempo = getTempo();
    if (!Number.isFinite(beats) || beats <= 0) {
      if (adv.selectedMarkerId === 'manual') {
        adv.manualStretchBeats = 0;
        adv.manualStretchSeconds = 0;
      } else {
        const marker = adv.markers.find(m => m.id === adv.selectedMarkerId);
        if (marker) {
          marker.stretchBeats = 0;
          marker.stretchSeconds = 0;
        }
      }
      adv.activeStretchSeconds = 0;
      stretchHint.textContent = '(no stretch applied)';
      return;
    }
    const seconds = beatsToSeconds(beats, tempo);
    if (adv.selectedMarkerId === 'manual') {
      adv.manualStretchBeats = beats;
      adv.manualStretchSeconds = seconds;
    } else {
      const marker = adv.markers.find(m => m.id === adv.selectedMarkerId);
      if (marker) {
        marker.stretchBeats = beats;
        marker.stretchSeconds = seconds;
      }
    }
    adv.activeStretchSeconds = seconds;
    stretchHint.textContent = createSummaryText(seconds, tempo);
  };

  fineRange.oninput = () => {
    adv.fine = clamp(fineRange.value, -1200, 1200);
    fineNumber.value = adv.fine;
  };

  fineNumber.oninput = () => {
    const value = clamp(fineNumber.value, -1200, 1200);
    adv.fine = value;
    fineRange.value = value;
  };

  recordInput.oninput = () => {
    const value = Math.floor(Number(recordInput.value));
    if (!Number.isFinite(value) || value <= 0) {
      adv.recordBars = 1;
    } else {
      adv.recordBars = clamp(value, 1, 64);
    }
    recordInput.value = adv.recordBars.toString();
  };

  handleHandleDrag(startHandle, 'start');
  handleHandleDrag(endHandle, 'end');

  rebuildMarkers();
  attachMarkerEvents();
  syncFromParams();

  const handle = {
    syncFromParams,
    notifyManualRange() {
      adv.selectedMarkerId = 'manual';
      updateSliceOptions();
      updateStretchSummary();
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      if (tempoInput) {
        tempoInput.removeEventListener('input', tempoListener);
        tempoInput.removeEventListener('change', tempoListener);
      }
      hostEl.__advSamplerDispose = null;
    },
  };

  hostEl.__advSamplerDispose = handle.dispose;

  return handle;
}
