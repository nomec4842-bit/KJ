// pianoroll.js
// Minimal 24-row (C2..B3) × N-steps grid piano roll with click + shift-drag length
import { toggleNoteAt, stretchNoteEnding } from './tracks.js';

export function createPianoRoll(container, getTrack, onChange){
  let cols = 16, rows = 24; // C2..B3
  container.innerHTML = '';
  container.style.display = 'grid';
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(22px,1fr))`;
  container.style.gap = '6px';
  const cells = [];

  function pitchToRow(p){ return (rows-1) - (p - 0); } // p=0 at bottom
  function rowToPitch(r){ return (rows-1) - r; }

  function rebuild(len){
    cols = len;
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${cols}, minmax(22px,1fr))`;
    cells.length = 0;

    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.height = '20px';
        cell.dataset.col = c;
        cell.dataset.row = r;

        const velBar = document.createElement('div');
        velBar.className = 'vel';
        velBar.style.height = '0%';
        cell.appendChild(velBar);

        // interactions
        let dragging = false, startCol = null, pitch = rowToPitch(r);

        cell.addEventListener('pointerdown', (e)=>{
          dragging = true;
          startCol = c;
          cell.setPointerCapture(e.pointerId);
          if (e.shiftKey){
            // shift+down will stretch if note exists; else place and wait to stretch
            toggleNoteAt(getTrack(), c, pitch, 1);
          } else {
            toggleNoteAt(getTrack(), c, pitch, 1);
          }
          onChange();
        });
        cell.addEventListener('pointermove', (e)=>{
          if (!dragging) return;
          if (!e.shiftKey) return; // only stretch with Shift
          const tr = getTrack();
          const endCol = Math.max(c, startCol);
          stretchNoteEnding(tr, startCol, pitch, endCol+1);
          onChange();
        });
        cell.addEventListener('pointerup', (e)=>{
          dragging = false;
          try{ cell.releasePointerCapture(e.pointerId);}catch{}
        });

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
    // draw notes as filled spans across their length
    for (const n of t.notes){
      const r = pitchToRow(n.pitch);
      for (let x=0; x<n.length; x++){
        const c = n.start + x;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const idx = r*cols + c;
        const cell = cells[idx];
        cell.classList.add('on');
        const bar = cell.querySelector('.vel');
        if (bar) bar.style.height = Math.round((n.vel || 1)*100)+'%';
      }
    }
  }

  function paintPlayhead(step){
    // optional: highlight current column (cheap pass)
    // remove any old borders
    for (let i=0;i<cells.length;i++){
      const cell = cells[i];
      const col = Number(cell.dataset.col);
      cell.classList.toggle('playhead', col === step);
    }
  }

  rebuild(cols);

  return {
    setLength: rebuild,
    update,
    paint: paintPlayhead
  };
}
