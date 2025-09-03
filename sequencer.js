// sequencer.js
import { NUM_STEPS } from './core.js';

/**
 * Build the 16-step grid UI.
 * @param {HTMLElement} seqEl - container element
 * @param {(i:number)=>void} onToggle - toggle handler for a step index
 * @param {(i:number, vel:number)=>void} onSetVel - set velocity (0.1..1.0) for a step index
 * @returns {{gridCells:HTMLElement[], update:(getStep:(i:number)=>{on:boolean,vel:number})=>void, paint:(i:number)=>void}}
 */
export function createGrid(seqEl, onToggle, onSetVel) {
  const gridCells = [];

  for (let i = 0; i < NUM_STEPS; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;

    // velocity bar
    const velBar = document.createElement('div');
    velBar.className = 'vel';
    cell.appendChild(velBar);

    // Click: delegate to onToggle (now supports OFF in main.js)
    cell.addEventListener('click', () => onToggle(i));

    // Drag: set velocity continuously (main.js implements OFF threshold)
    let dragging = false, startY = 0;
    const setFromY = (y) => {
      const dy = (startY - y); // up = louder
      const v = Math.max(0.0, Math.min(1.0, 0.5 + dy / 120));
      onSetVel(i, v);
    };
    cell.addEventListener('pointerdown', (e) => {
      dragging = true; startY = e.clientY; cell.setPointerCapture(e.pointerId);
    });
    cell.addEventListener('pointermove', (e) => { if (dragging) setFromY(e.clientY); });
    cell.addEventListener('pointerup',   (e) => { dragging = false; try { cell.releasePointerCapture(e.pointerId);} catch {} });

    seqEl.appendChild(cell);
    gridCells.push(cell);
  }

  // Render helpers
  function update(getStep) {
    for (let i = 0; i < NUM_STEPS; i++) {
      const st = getStep(i);
      const cell = gridCells[i];
      cell.classList.toggle('on', !!st?.on);
      const bar = cell.querySelector('.vel');
      if (bar) bar.style.height = st?.on ? Math.round((st.vel || 0) * 100) + '%' : '0';
    }
  }
  function paint(i) {
    gridCells.forEach(c => c.classList.remove('playhead'));
    const cell = gridCells[i];
    if (cell) cell.classList.add('playhead');
  }

  return { gridCells, update, paint };
}
