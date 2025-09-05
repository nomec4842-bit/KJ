import { ctx, master, clampInt } from './core.js';
import { synthBlip, kick808, snare808, hat808, clap909, samplerPlay } from './engines.js';

export const STEP_CHOICES = [4, 8, 12, 16, 24, 32];

export const defaults = {
  synth:   { cutoff:2000, q:1, a:0.01, d:0.2, s:0.6, r:0.2, baseFreq:220 },
  kick808: { freq:55, pitchDecay:0.08, ampDecay:0.45, click:0.12 },
  snare808:{ tone:180, noise:0.6, decay:0.22 },
  hat808:  { decay:0.06, hpf:8000 },
  clap909: { bursts:3, spread:0.02, decay:0.10 },
  sampler: { start:0, end:1, semis:0, gain:1, loop:false },
};

const clone = o => JSON.parse(JSON.stringify(o));
const makeStep = () => ({ on:false, vel:1.0 });
const makeNote = (start=0, length=1, pitch=0, vel=1) => ({ start, length, pitch, vel });

function makeBus(){
  const gain = ctx.createGain();
  let pan = null; try { pan = ctx.createStereoPanner(); } catch {}
  if (pan){ gain.connect(pan).connect(master); return { gain, pan, hasPan:true }; }
  else   { gain.connect(master);               return { gain, pan:null, hasPan:false }; }
}

export function createTrack(name, engine='synth', length=16){
  const bus = makeBus();
  return {
    name, engine,
    mode: 'steps',           // 'steps' | 'piano'
    length,
    pos: -1,
    steps: Array.from({length}, makeStep),
    notes: [],               // for piano roll

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
      sampler: clone(defaults.sampler),
    },

    sample: { buffer:null, name:'' },
  };
}

export function resizeTrackSteps(track, newLen){
  newLen = clampInt(newLen, 1, 128);
  const old = track.steps;
  const next = new Array(newLen);
  for (let i=0;i<newLen;i++){
    next[i] = old[i] ? { on: !!old[i].on, vel: old[i].vel ?? 1 } : makeStep();
  }
  track.steps = next;
  track.length = newLen;
  track.pos = Math.min(Math.max(track.pos, -1), newLen-1);

  // trim notes if needed
  track.notes = track.notes
    .map(n => ({...n, start: Math.max(0, Math.min(n.start, newLen-1)),
                 length: Math.max(1, Math.min(n.length, newLen - n.start))}))
    .filter(n => n.length > 0);
}

export function triggerEngine(track, vel=1, semis=0){
  switch(track.engine){
    case 'synth':    return synthBlip(track.params.synth,    track.gainNode, vel, semis);
    case 'kick808':  return kick808(track.params.kick808,    track.gainNode, vel);
    case 'snare808': return snare808(track.params.snare808,  track.gainNode, vel);
    case 'hat808':   return hat808(track.params.hat808,      track.gainNode, vel);
    case 'clap909':  return clap909(track.params.clap909,    track.gainNode, vel);
    case 'sampler':  return samplerPlay(track.params.sampler,track.gainNode, vel, track.sample, semis);
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

/* ---------- Piano roll helpers ---------- */
export function notesStartingAt(track, step){
  return track.notes.filter(n => n.start === step);
}
export function toggleNoteAt(track, step, pitch, vel=1){
  const idx = track.notes.findIndex(n => n.start===step && n.pitch===pitch);
  if (idx>=0){ track.notes.splice(idx,1); return; }
  track.notes.push(makeNote(step, 1, pitch, vel));
}
export function stretchNoteEnding(track, step, pitch, newEndStep){
  const n = track.notes.find(n => n.start===step && n.pitch===pitch);
  if (!n) return;
  const end = Math.max(n.start+1, Math.min(newEndStep, track.length));
  n.length = end - n.start;
}
