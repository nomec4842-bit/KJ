import { toggleNoteAt, stretchNoteEnding } from './tracks.js';

// 24-row (C2..B3) piano roll; quantized to step grid
export function createPianoRoll(container, getTrack, onChange, onSelect){
  let cols = 16, rows = 24; // pitch 0..23
  let selectedCol = -1;
  container.innerHTML = '';
  container.style.display = 'grid';
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(22px,1fr))`;
  container.style.gap = '6px';
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

        let dragging=false, startCol=null;
        const pitch = rowToPitch(r);

        cell.addEventListener('pointerdown', (e)=>{
          dragging = true;
          startCol = c;
          cell.setPointerCapture(e.pointerId);
          if (typeof onSelect === 'function') {
            onSelect(c);
          }
          // place or toggle
          toggleNoteAt(getTrack(), c, pitch, 1);
          onChange();
        });
        cell.addEventListener('pointermove', (e)=>{
          if (!dragging) return;
          if (!e.shiftKey) return; // stretch only when Shift held
          const tr = getTrack();
          const endCol = Math.max(c, startCol);
          stretchNoteEnding(tr, startCol, pitch, endCol+1);
          onChange();
        });
        cell.addEventListener('pointerup', (e)=>{
          dragging=false;
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
