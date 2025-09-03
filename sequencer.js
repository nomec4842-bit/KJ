// sequencer.js
import { NUM_STEPS } from './core.js';

/**
 * Build the 16-step grid UI.
 * @param {HTMLElement} seqEl - container element
 * @param {(i:number)=>void} onToggle - single tap/click handler (cycle)
 * @param {(i:number, vel:number)=>void} onSetVel - drag velocity handler
 * @param {(i:number)=>void} onDoubleToggle - double tap/click handler (place/remove)
 * @returns {{gridCells:HTMLElement[], update:(getStep:(i:number)=>{on:boolean,vel:number})=>void, paint:(i:number)=>void}}
 */
export function createGrid(seqEl, onToggle, onSetVel, onDoubleToggle) {
  const gridCells = [];
  const DOUBLE_MS = 280;

  for (let i = 0; i < NUM_STEPS; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;

    // velocity bar
    const velBar = document.createElement('div');
    velBar.className = 'vel';
    cell.appendChild(velBar);

    // --- Double-tap/click detection (suppresses single on double) ---
    let lastTap = 0;
    let singleTimer = null;

    const handleSingle = () => onToggle(i);
    const handleDouble = () => {
      if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
      if (onDoubleToggle) onDoubleToggle(i);
    };

    // Desktop dblclick support
    cell.addEventListener('dblclick', (e) => {
      e.preventDefault();
      handleDouble();
    });

    // Unified click path with manual double detection (works for touch-generated clicks too)
    cell.addEventListener('click', () => {
      const now = performance.now();
      if (now - lastTap < DOUBLE_MS) {
        handleDouble();
        lastTap = 0;
      } else {
        lastTap = now;
        singleTimer = setTimeout(() => { handleSingle(); singleTimer = null; }, DOUBLE_MS);
      }
    });

    // Drag: set velocity continuously (main.js enforces OFF threshold)
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
