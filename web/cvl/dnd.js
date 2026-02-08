import { CVL_STEP_WIDTH } from './constants.js';

export function bindCvlDragAndDrop({
  rootEl,
  track,
  samples,
  timelineSteps,
  tempoBpm,
  onSave,
  onReRender,
}) {
  if (!rootEl || !track) return;
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
      onReRender?.();
    });
  });
}
