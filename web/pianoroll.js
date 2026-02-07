import { toggleNoteAt, stretchNoteEnding } from './tracks.js';

// 24-row (C2..B3) piano roll; quantized to step grid
export function createPianoRoll(container, getTrack, onChange, onSelect){
  let cols = 16, rows = 24; // pitch 0..23
  let selectedCol = -1;
  container.innerHTML = '';
  container.classList.add('piano-roll');
  container.classList.remove('step-sequencer');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(18px,1fr))`;
  container.style.gap = '2px';
  const cells = [];

  const pitchToRow = (p) => (rows-1) - p;
  const rowToPitch = (r) => (rows-1) - r;

  function applySelection(col){
    selectedCol = Number.isInteger(col) ? col : -1;
    for (const cell of cells){
      const cellCol = Number(cell.dataset.col);
      cell.classList.toggle('selected', cellCol === selectedCol);
    }
  }

  function rebuild(len){
    cols = len;
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${cols}, minmax(18px,1fr))`;
    cells.length = 0;

    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const cell = document.createElement('div');
        cell.className = 'cell piano-cell';
        cell.style.height = '18px';
        cell.dataset.col = c;
        cell.dataset.row = r;
        const pitch = rowToPitch(r);
        const blackKeyOffsets = new Set([1, 3, 6, 8, 10]);
        const pitchClass = pitch % 12;
        if (blackKeyOffsets.has(pitchClass)) {
          cell.classList.add('black-key');
        } else {
          cell.classList.add('white-key');
        }
        if (c % 4 === 0) {
          cell.classList.add('bar-start');
        }

        const velBar = document.createElement('div');
        velBar.className = 'vel';
        velBar.style.height = '0%';
        cell.appendChild(velBar);

        let dragging=false, startCol=null;
        let didStretch = false;
        let longPressTimer = null;
        let longPressTriggered = false;
        const LONG_PRESS_MS = 420;

        const cancelLongPress = () => {
          if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        const cancelLongPressForMouse = (e) => {
          if (e.pointerType === 'mouse') cancelLongPress();
        };

        const hasNoteAt = (track, col, notePitch) => {
          if (!track || !Array.isArray(track.notes)) return false;
          return track.notes.some((n) => (
            n.pitch === notePitch
            && col >= n.start
            && col < n.start + n.length
          ));
        };

        const findNoteAt = (track, col, notePitch) => {
          if (!track || !Array.isArray(track.notes)) return null;
          return track.notes.find((n) => (
            n.pitch === notePitch
            && col >= n.start
            && col < n.start + n.length
          )) || null;
        };

        const triggerSelect = () => {
          if (typeof onSelect === 'function') {
            const note = findNoteAt(getTrack(), c, pitch);
            if (note) {
              onSelect({ step: note.start, pitch: note.pitch });
            } else {
              onSelect(c);
            }
          }
        };

        cell.addEventListener('pointerdown', (e)=>{
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          dragging = true;
          startCol = c;
          didStretch = false;
          longPressTriggered = false;
          cell.setPointerCapture(e.pointerId);
          cancelLongPress();
          if (typeof onSelect === 'function') {
            longPressTimer = setTimeout(() => {
              longPressTimer = null;
              if (!hasNoteAt(getTrack(), c, pitch)) return;
              longPressTriggered = true;
              triggerSelect();
            }, LONG_PRESS_MS);
          }
        });
        cell.addEventListener('pointermove', (e)=>{
          if (!dragging) return;
          if (longPressTriggered) return;
          if (!e.shiftKey) return; // stretch only when Shift held
          const tr = getTrack();
          const endCol = Math.max(c, startCol);
          stretchNoteEnding(tr, startCol, pitch, endCol+1);
          didStretch = true;
          onChange();
        });
        cell.addEventListener('pointerup', (e)=>{
          dragging=false;
          cancelLongPress();
          if (!longPressTriggered && !didStretch) {
            toggleNoteAt(getTrack(), c, pitch, 1);
            onChange();
          }
          try{ cell.releasePointerCapture(e.pointerId);}catch{}
        });
        cell.addEventListener('pointercancel', ()=>{
          dragging = false;
          cancelLongPress();
        });
        cell.addEventListener('pointerleave', cancelLongPressForMouse);
        cell.addEventListener('pointerout', cancelLongPressForMouse);

        container.appendChild(cell);
        cells.push(cell);
      }
    }
  }

  function update(){
    const t = getTrack();
    // clear
    for (const cell of cells){
      cell.classList.remove('on');
      const bar = cell.querySelector('.vel'); if (bar) bar.style.height = '0%';
    }
    // draw notes
    for (const n of t.notes){
      const r = pitchToRow(n.pitch);
      for (let x=0; x<n.length; x++){
        const c = n.start + x;
        if (c<0 || c>=cols || r<0 || r>=rows) continue;
        const idx = r*cols + c;
        const cell = cells[idx];
        cell.classList.add('on');
        const bar = cell.querySelector('.vel');
        if (bar) bar.style.height = Math.round((n.vel || 1)*100)+'%';
      }
    }
  }

  function paint(step){
    for (const cell of cells){
      const col = Number(cell.dataset.col);
      cell.classList.toggle('playhead', col === step);
    }
  }

  rebuild(cols);

  return {
    setLength: (len) => {
      rebuild(len);
      const next = selectedCol >= 0 && selectedCol < len ? selectedCol : -1;
      applySelection(next);
    },
    update,
    paint,
    select: applySelection,
  };
}
