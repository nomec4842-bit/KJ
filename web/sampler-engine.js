import { ctx } from './core.js';
import { applyDeclickEnvelope } from './engine-utils.js';

function createDriveCurve(drive) {
  const amount = 1 + Math.max(0, Math.min(1, Number(drive) || 0)) * 25;
  const samples = 2048;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export function samplerPlay(p, dest, vel = 1, sample, semis = 0, when, durationSec, options = {}) {
  if (!sample?.buffer) return;
  const startTime = Number.isFinite(when) ? when : ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;

  const totalSemis = (p.semis ?? 0) + (semis || 0);
  const rate = Math.pow(2, totalSemis / 12);
  src.playbackRate.setValueAtTime(rate, startTime);

  const dur = sample.buffer.duration;
  const startNorm = Math.max(0, Math.min(1, p.start ?? 0));
  const endNorm = Math.max(startNorm, Math.min(1, p.end ?? 1));
  const startSec = startNorm * dur;
  const endSec = Math.max(startSec + 0.005, endNorm * dur);

  src.loop = !!p.loop;
  if (src.loop) {
    src.loopStart = startSec;
    src.loopEnd = endSec;
  }

  const vca = ctx.createGain();
  const target = dest || ctx.destination;
  const pan = Number(options.pan);
  const drive = Number(options.drive);
  const delay = Number(options.delay);
  const reverb = Number(options.reverb);
  const realtimeEffects = options.realtimeEffects === true;

  let finalNode = vca;
  let panner = null;
  if (Number.isFinite(pan) || realtimeEffects) {
    try {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0, startTime);
      finalNode.connect(panner);
      finalNode = panner;
    } catch {}
  }

  const clipDrive = Number.isFinite(drive) ? Math.max(0, Math.min(1, drive)) : 0;
  let shaper = null;
  if (clipDrive > 0.001 || realtimeEffects) {
    shaper = ctx.createWaveShaper();
    shaper.curve = createDriveCurve(clipDrive);
    shaper.oversample = '2x';
    finalNode.connect(shaper);
    finalNode = shaper;
  }

  finalNode.connect(target);

  const clipDelay = Number.isFinite(delay) ? Math.max(0, Math.min(1, delay)) : 0;
  let delayNode = null;
  let delayFeedback = null;
  let delayWet = null;
  if (clipDelay > 0.001 || realtimeEffects) {
    delayNode = ctx.createDelay(0.6);
    delayFeedback = ctx.createGain();
    delayWet = ctx.createGain();
    delayNode.delayTime.setValueAtTime(0.08 + clipDelay * 0.32, startTime);
    delayFeedback.gain.setValueAtTime(0.15 + clipDelay * 0.45, startTime);
    delayWet.gain.setValueAtTime(clipDelay * 0.45, startTime);
    finalNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet).connect(target);
  }

  const clipReverb = Number.isFinite(reverb) ? Math.max(0, Math.min(1, reverb)) : 0;
  let reverbWet = null;
  if (clipReverb > 0.001 || realtimeEffects) {
    const convolver = ctx.createConvolver();
    reverbWet = ctx.createGain();
    const irLen = Math.max(1, Math.floor(ctx.sampleRate * 0.35));
    const ir = ctx.createBuffer(1, irLen, ctx.sampleRate);
    const data = ir.getChannelData(0);
    for (let i = 0; i < irLen; i++) {
      const decay = Math.pow(1 - i / irLen, 2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    convolver.buffer = ir;
    reverbWet.gain.setValueAtTime(clipReverb * 0.5, startTime);
    finalNode.connect(convolver);
    convolver.connect(reverbWet).connect(target);
  }

  src.connect(vca);
  const maxDur = Math.max(0.005, endSec - startSec);
  const duration = Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(maxDur, durationSec)
    : maxDur;
  applyDeclickEnvelope(vca, (p.gain ?? 1) * vel, startTime, duration);
  src.start(startTime, startSec, duration);
  src.stop(startTime + duration + 0.005);
  const setClipEffects = (next = {}, whenTime = ctx.currentTime) => {
    const effectTime = Number.isFinite(whenTime) ? whenTime : ctx.currentTime;
    const nextPan = Number(next.pan);
    if (panner?.pan && Number.isFinite(nextPan)) {
      try { panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, nextPan)), effectTime, 0.01); } catch {}
    }
    const nextDrive = Number(next.drive);
    if (shaper && Number.isFinite(nextDrive)) {
      shaper.curve = createDriveCurve(nextDrive);
    }
    const nextDelay = Number(next.delay);
    if (delayNode && delayFeedback && delayWet && Number.isFinite(nextDelay)) {
      const clamped = Math.max(0, Math.min(1, nextDelay));
      try { delayNode.delayTime.setTargetAtTime(0.08 + clamped * 0.32, effectTime, 0.02); } catch {}
      try { delayFeedback.gain.setTargetAtTime(0.15 + clamped * 0.45, effectTime, 0.02); } catch {}
      try { delayWet.gain.setTargetAtTime(clamped * 0.45, effectTime, 0.02); } catch {}
    }
    const nextReverb = Number(next.reverb);
    if (reverbWet && Number.isFinite(nextReverb)) {
      try { reverbWet.gain.setTargetAtTime(Math.max(0, Math.min(1, nextReverb)) * 0.5, effectTime, 0.02); } catch {}
    }
  };

  src.onended = () => {
    try { src.disconnect(); } catch {}
    try { vca.disconnect(); } catch {}
  };
  return { source: src, gain: vca, playbackRate: rate, setClipEffects };
}
