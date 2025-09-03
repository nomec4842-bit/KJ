// tracks.js
import { ctx, master, NUM_STEPS, clampInt } from './core.js';
import { synthBlip, kick808, snare808, hat808, clap909, samplerPlay } from './engines.js';

export const defaults = {
  synth:   { cutoff:2000, q:1, a:0.01, d:0.2, s:0.6, r:0.2, baseFreq:220 },
  kick808: { freq:55, pitchDecay:0.08, ampDecay:0.45, click:0.12 },
  snare808:{ tone:180, noise:0.6, decay:0.22 },
  hat808:  { decay:0.06, hpf:8000 },
  clap909: { bursts:3, spread:0.02, decay:0.10 },
  sampler: { start:0, end:1, semis:0, gain:1, loop:false }, // NEW
};
const clone = o => JSON.parse(JSON.stringify(o));
const blankStep = () => ({ on:false, vel:1.0 });

function makeBus(){
  const gain = ctx.createGain();
  let pan = null; try { pan = ctx.createStereoPanner(); } catch {}
  if (pan){ gain.connect(pan).connect(master); return { gain, pan, hasPan:true }; }
  else   { gain.connect(master);               return { gain, pan:null, hasPan:false }; }
}

export function createTrack(name, engine='synth'){
  const bus = makeBus();
  return {
    name, engine,
    steps: Array.from({length:NUM_STEPS}, blankStep),

    gainNode: bus.gain,
    panNode: bus.pan,
    _hasPan: bus.hasPan,
    gain: 0.9, pan: 0, mute: false, solo: false,

    params: {
      synth:   clone(defaults.synth),
      kick808: clone(defaults.kick808),
      snare808:clone(defaults.snare808),
      hat808:  clone(defaults.hat808),
      clap909: clone(defaults.clap909),
      sampler: clone(defaults.sampler), // NEW
    },

    // sample storage for sampler engine
    sample: { buffer: null, name: '' }, // NEW
  };
}

export function triggerEngine(track, vel=1){
  switch(track.engine){
    case 'synth':    return synthBlip(track.params.synth,    track.gainNode, vel);
    case 'kick808':  return kick808(track.params.kick808,    track.gainNode, vel);
    case 'snare808': return snare808(track.params.snare808,  track.gainNode, vel);
    case 'hat808':   return hat808(track.params.hat808,      track.gainNode, vel);
    case 'clap909':  return clap909(track.params.clap909,    track.gainNode, vel);
    case 'sampler':  return samplerPlay(track.params.sampler,track.gainNode, vel, track.sample); // NEW
  }
}

export function applyMixer(tracks){
  const anySolo = tracks.some(t=>t.solo);
  for (const t of tracks){
    const audible = !t.mute && (!anySolo || t.solo);
    t._effectiveAudible = audible;
    t.gainNode.gain.value = audible ? t.gain : 0;
    if (t._hasPan && t.panNode){ try { t.panNode.pan.value = t.pan; } catch{} }
  }
}
