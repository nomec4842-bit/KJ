import { ctx } from './core.js';
import {
  isDspReady,
  renderSynthSamples,
  renderJunoSamples,
  renderNoiseSamples,
  renderKickSamples,
  renderSnareSamples,
  renderHatSamples,
  renderClapSamples,
} from './dsp.js';

const DECLICK_TIME_SEC = 0.004;

function applyDeclickEnvelope(gainNode, peakGain, startTime, playDurationSec) {
  const peak = Number.isFinite(peakGain) ? Math.max(0, peakGain) : 1;
  const duration = Number.isFinite(playDurationSec) ? Math.max(0.001, playDurationSec) : 0.001;
  const fadeTime = Math.min(DECLICK_TIME_SEC, duration * 0.45);
  const fadeInEnd = startTime + fadeTime;
  const fadeOutStart = startTime + Math.max(fadeTime, duration - fadeTime);
  const stopTime = startTime + duration;

  gainNode.gain.cancelScheduledValues(startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peak, fadeInEnd);
  gainNode.gain.setValueAtTime(peak, fadeOutStart);
  gainNode.gain.linearRampToValueAtTime(0, stopTime);
  return stopTime;
}

function playSamples(samples, dest, when, durationSec) {
  if (!samples || samples.length === 0) return null;
  const target = dest || ctx.destination;
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.connect(gain).connect(target);
  const startTime = Number.isFinite(when) ? when : ctx.currentTime;
  const playDuration = Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(buffer.duration, durationSec)
    : buffer.duration;
  const stopTime = applyDeclickEnvelope(gain, 1, startTime, playDuration);
  if (playDuration) {
    source.start(startTime, 0, playDuration);
  } else {
    source.start(startTime);
  }
  source.stop(stopTime + 0.005);
  source.onended = () => {
    try { source.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  };
  return { source, gain };
}

/* ===========================
   Synth (supports semitone offset)
   =========================== */
export function synthBlip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSynthSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}


export function juno60Blip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderJunoSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}

export function tb303Blip(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const accent = Number.isFinite(Number(p?.accent)) ? Math.max(0, Number(p.accent)) : 0;
  const mapped = {
    baseFreq: p?.baseFreq ?? 110,
    cutoff: p?.cutoff ?? 1800,
    q: p?.q ?? 12,
    a: p?.a ?? 0.003,
    d: p?.d ?? 0.2,
    s: p?.s ?? 0.15,
    r: p?.r ?? 0.08,
    wavetable: !!p?.wavetable,
    morph: p?.morph ?? 0,
  };
  const samples = renderSynthSamples(mapped, vel * (1 + accent * 0.5), semis);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   Noise Synth (polyphonic)
   =========================== */
export function noiseSynth(p, dest, vel = 1, semis = 0, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderNoiseSamples(p, vel, semis);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Kick
   =========================== */
export function kick808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderKickSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Snare
   =========================== */
export function snare808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderSnareSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   808 Hat
   =========================== */
export function hat808(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderHatSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   909 Clap
   =========================== */
export function clap909(p, dest, vel = 1, when, durationSec) {
  if (!isDspReady()) return;
  const samples = renderClapSamples(p, vel);
  playSamples(samples, dest, when, durationSec);
}

/* ===========================
   Sampler (supports semitone offset)
   =========================== */
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

  let finalNode = vca;
  let panner = null;
  if (Number.isFinite(pan)) {
    try {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startTime);
      finalNode.connect(panner);
      finalNode = panner;
    } catch {}
  }

  const clipDrive = Number.isFinite(drive) ? Math.max(0, Math.min(1, drive)) : 0;
  if (clipDrive > 0.001) {
    const shaper = ctx.createWaveShaper();
    const amount = 1 + clipDrive * 25;
    const samples = 2048;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    finalNode.connect(shaper);
    finalNode = shaper;
  }

  finalNode.connect(target);

  const clipDelay = Number.isFinite(delay) ? Math.max(0, Math.min(1, delay)) : 0;
  if (clipDelay > 0.001) {
    const delayNode = ctx.createDelay(0.6);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    delayNode.delayTime.setValueAtTime(0.08 + clipDelay * 0.32, startTime);
    feedback.gain.setValueAtTime(0.15 + clipDelay * 0.45, startTime);
    wet.gain.setValueAtTime(clipDelay * 0.45, startTime);
    finalNode.connect(delayNode);
    delayNode.connect(feedback);
    feedback.connect(delayNode);
    delayNode.connect(wet).connect(target);
  }

  const clipReverb = Number.isFinite(reverb) ? Math.max(0, Math.min(1, reverb)) : 0;
  if (clipReverb > 0.001) {
    const convolver = ctx.createConvolver();
    const wet = ctx.createGain();
    const irLen = Math.max(1, Math.floor(ctx.sampleRate * 0.35));
    const ir = ctx.createBuffer(1, irLen, ctx.sampleRate);
    const data = ir.getChannelData(0);
    for (let i = 0; i < irLen; i++) {
      const decay = Math.pow(1 - i / irLen, 2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    convolver.buffer = ir;
    wet.gain.setValueAtTime(clipReverb * 0.5, startTime);
    finalNode.connect(convolver);
    convolver.connect(wet).connect(target);
  }

  src.connect(vca);
  const maxDur = Math.max(0.005, endSec - startSec);
  const duration = Number.isFinite(durationSec) && durationSec > 0
    ? Math.min(maxDur, durationSec)
    : maxDur;
  applyDeclickEnvelope(vca, (p.gain ?? 1) * vel, startTime, duration);
  src.start(startTime, startSec, duration);
  src.stop(startTime + duration + 0.005);
}
