// sequencer.js

/**
 * Build the step grid UI for ONE visible track.
 * You can change its length later via setLength().
 */
export function createGrid(seqEl, onToggle, onSetVel, onDoubleToggle) {
  let gridCells = [];
  let currentLen = 16;

  function rebuild(len){
    currentLen = len;
    seqEl.innerHTML = '';
    gridCells = [];

    for (let i = 0; i < len; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;

      const velBar = document.createElement('div');
      velBar.className = 'vel';
      cell.appendChild(velBar);

      // --- Double-click/tap handling ---
      let lastTap = 0;
      const DOUBLE_MS = 280;

      // Native dblclick (desktop)
      cell.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (onDoubleToggle) onDoubleToggle(i);
      });

      // Manual double detection for taps/clicks
      cell.addEventListener('click', () => {
        if (!onDoubleToggle) {
          onToggle(i);
          return;
        }

        const now = performance.now();
        if (now - lastTap < DOUBLE_MS) {
          onDoubleToggle(i);
          lastTap = 0;
        } else {
          lastTap = now;
          onToggle(i);
        }
      });

      // Drag velocity
      let dragging=false, startY=0;
      const setFromY = (y)=>{
        const dy = (startY - y); // up = louder
        const v = Math.max(0.0, Math.min(1.0, 0.5 + dy/120));
        onSetVel(i, v);
      };
      cell.addEventListener('pointerdown', (e)=>{ dragging=true; startY=e.clientY; cell.setPointerCapture(e.pointerId); });
      cell.addEventListener('pointermove', (e)=>{ if(dragging) setFromY(e.clientY); });
      cell.addEventListener('pointerup',   (e)=>{ dragging=false; try{ cell.releasePointerCapture(e.pointerId);}catch{} });

      seqEl.appendChild(cell);
      gridCells.push(cell);
    }
  }

  function update(getStep){
    for (let i=0;i<currentLen;i++){
      const st = getStep(i);
      const cell = gridCells[i];
      cell.classList.toggle('on', !!st?.on);
      const bar = cell.querySelector('.vel');
      if (bar) bar.style.height = st?.on ? Math.round((st.vel || 0)*100)+'%' : '0';
    }
  }

  // Paint playhead for the visible track only
  function paint(stepIndex){
    gridCells.forEach(c=>c.classList.remove('playhead'));
    if (stepIndex>=0 && stepIndex<currentLen){
      const cell = gridCells[stepIndex];
      if (cell) cell.classList.add('playhead');
    }
  }

  // initial
  rebuild(16);

  return { update, paint, setLength: rebuild };
}
