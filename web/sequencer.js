// sequencer.js
import { getStepVelocity } from './tracks.js';

/**
 * Build the step grid UI for ONE visible track.
 * You can change its length later via setLength().
 */
export function createGrid(seqEl, onToggle, onDoubleToggle, onSelect) {
  let gridCells = [];
  let currentLen = 16;
  let selectedIndex = -1;

  const toIndex = (value) => {
    if (value === null || value === undefined) return -1;
    const num = Number(value);
    if (!Number.isFinite(num)) return -1;
    return Math.trunc(num);
  };

  function select(index) {
    const len = gridCells.length;
    let next = toIndex(index);
    if (next < 0 || next >= len) next = -1;

    if (selectedIndex >= 0 && selectedIndex < len) {
      const prevCell = gridCells[selectedIndex];
      if (prevCell) prevCell.classList.remove('selected');
    }

    selectedIndex = next;
    if (selectedIndex >= 0 && selectedIndex < len) {
      const cell = gridCells[selectedIndex];
      if (cell) cell.classList.add('selected');
    }
  }

  function rebuild(len){
    currentLen = len;
    const prevSelected = selectedIndex;
    selectedIndex = -1;
    seqEl.innerHTML = '';
    gridCells = [];

    for (let i = 0; i < len; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;

      const velBar = document.createElement('div');
      velBar.className = 'vel';
      velBar.style.height = '0%';
      cell.appendChild(velBar);

      // --- Double-click/tap handling ---
      let lastTap = 0;
      const DOUBLE_MS = 280;

      let skipClick = false;
      let longPressTimer = null;
      const LONG_PRESS_MS = 420;

      const cancelLongPress = () => {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      const triggerSelect = (shouldSkip = true) => {
        if (typeof onSelect !== 'function') return;
        cancelLongPress();
        if (shouldSkip) skipClick = true;
        onSelect(i);
      };

      cell.addEventListener('contextmenu', (e) => {
        if (typeof onSelect !== 'function') return;
        e.preventDefault();
        triggerSelect(false);
      });

      cell.addEventListener('pointerdown', (e) => {
        if (typeof onSelect !== 'function') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        cancelLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          triggerSelect();
        }, LONG_PRESS_MS);
      });

      const clearPendingSelect = () => {
        cancelLongPress();
      };

      cell.addEventListener('pointerup', clearPendingSelect);
      cell.addEventListener('pointerleave', clearPendingSelect);
      cell.addEventListener('pointercancel', clearPendingSelect);
      cell.addEventListener('pointerout', clearPendingSelect);

      // Native dblclick (desktop)
      cell.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (onDoubleToggle) onDoubleToggle(i);
      });

      // Manual double detection for taps/clicks
      cell.addEventListener('click', () => {
        if (skipClick) {
          skipClick = false;
          lastTap = 0;
          return;
        }
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
      seqEl.appendChild(cell);
      gridCells.push(cell);
    }

    select(prevSelected);
  }

  function update(getStep){
    for (let i=0;i<currentLen;i++){
      const st = getStep(i);
      const cell = gridCells[i];
      cell.classList.toggle('on', !!st?.on);
      const bar = cell.querySelector('.vel');
      if (bar){
        const vel = getStepVelocity(st, st?.on ? 1 : 0);
        const clamped = Math.max(0, Math.min(1, vel));
        bar.style.height = Math.round(clamped * 100) + '%';
      }
      if (cell){
        const vel = getStepVelocity(st, 0);
        const clamped = Math.max(0, Math.min(1, vel));
        cell.title = `Step ${i + 1} • Vel ${Math.round(clamped * 127)}`;
      }
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

  return { update, paint, setLength: rebuild, select };
}
