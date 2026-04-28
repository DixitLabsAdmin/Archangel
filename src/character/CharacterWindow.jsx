// src/character/CharacterWindow.jsx
//
// Wraps the character with desktop-companion behaviors:
// click-through outside the character zone, drag-to-move, click-to-summon,
// and state sync from the main process.

import React, { useEffect, useRef, useState } from 'react';
import Character from './Character.jsx';
import { STATES } from '../shared/palette.js';

const DRAG_THRESHOLD = 5;

// How long a glow change lasts before reverting to default. 0 = sticky.
const GLOW_DURATION = 8000;

export default function CharacterWindow() {
  const rootRef = useRef(null);
  const [state, setState] = useState(STATES.IDLE);
  const [glowMode, setGlowMode] = useState('default');

  const dragRef = useRef({ pressed: false, moved: false, startX: 0, startY: 0 });
  const lastMouseEventToggleRef = useRef(false);
  const lastDragMoveTimeRef = useRef(0);
  const glowTimerRef = useRef(null);

  useEffect(() => {
    if (!window.eurelyas) return;
    const unsub = window.eurelyas.onState(({ event, glow }) => {
      if (event === 'summoned')        setState(STATES.SUMMONED);
      else if (event === 'dismissed')  setState(STATES.IDLE);
      else if (event === 'thinking')   setState(STATES.THINKING);
      else if (event === 'speaking')   setState(STATES.SPEAKING);
      else if (event === 'sleep')      setState(STATES.SLEEPING);
      else if (event === 'wake')       setState(STATES.IDLE);

      // Mood event sets the glow
      if (event === 'mood' && glow) {
        setGlowMode(glow);
        if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
        if (glow !== 'default' && GLOW_DURATION > 0) {
          glowTimerRef.current = setTimeout(() => setGlowMode('default'), GLOW_DURATION);
        }
      }
    });
    return unsub;
  }, []);

  const handleMouseMove = (e) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const inside = dist < rect.width * 0.32;

    const shouldIgnore = !inside;
    if (shouldIgnore !== lastMouseEventToggleRef.current) {
      lastMouseEventToggleRef.current = shouldIgnore;
      window.eurelyas?.setMouseEvents(shouldIgnore);
    }

    if (dragRef.current.pressed) {
      const dx = e.screenX - dragRef.current.startX;
      const dy = e.screenY - dragRef.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragRef.current.moved = true;
        const now = performance.now();
        if (now - lastDragMoveTimeRef.current > 16) {
          lastDragMoveTimeRef.current = now;
          window.eurelyas?.dragMove();
        }
      }
    }
  };

  const handleMouseDown = (e) => {
    dragRef.current = { pressed: true, moved: false, startX: e.screenX, startY: e.screenY };
    window.eurelyas?.dragStart();
  };

  const handleMouseUp = () => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.pressed = false;
    if (wasDrag) {
      window.eurelyas?.dragEnd();
    } else {
      window.eurelyas?.characterClicked();
    }
  };

  return (
    <div
      ref={rootRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        cursor: dragRef.current.pressed ? 'grabbing' : 'grab',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      <Character state={state} glowMode={glowMode} />
    </div>
  );
}
