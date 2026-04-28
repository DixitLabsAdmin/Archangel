// src/character/SpriteCharacterWindow.jsx
// Drop-in replacement for CharacterWindow.jsx that uses sprite poses.
// Handles click-through, drag-to-move, click-to-summon, and animation actions.

import React, { useEffect, useRef, useState } from 'react';
import SpriteCharacter from './SpriteCharacter.jsx';
import { STATES } from '../shared/palette.js';

const DRAG_THRESHOLD = 5;

// How long an action lasts before auto-reverting to idle. 0 = sticky (stays).
const ACTION_DURATIONS = {
  spread:    8000,   // wings spread for 8 seconds
  staff_down: 6000,  // staff pointed down for 6 seconds
  idle:       0      // sticky
};

export default function SpriteCharacterWindow() {
  const rootRef = useRef(null);
  const [state, setState] = useState(STATES.IDLE);
  const [pose, setPose] = useState('idle');
  const [glowMode, setGlowMode] = useState('default');
  const dragRef = useRef({ pressed: false, moved: false, startX: 0, startY: 0 });
  const actionTimerRef = useRef(null);

  // State sync
  useEffect(() => {
    if (!window.eurelyas) return;
    const unsub = window.eurelyas.onState(({ event, pose: newPose, glow }) => {
      if (event === 'summoned')  setState(STATES.SUMMONED);
      if (event === 'dismissed') setState(STATES.IDLE);
      if (event === 'thinking')  setState(STATES.THINKING);
      if (event === 'speaking')  setState(STATES.SPEAKING);

      // Action-driven pose change
      if (event === 'action' && newPose) {
        setPose(newPose);
        if (glow) setGlowMode(glow);

        // Auto-revert after duration
        if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
        const duration = ACTION_DURATIONS[newPose] || 0;
        if (duration > 0) {
          actionTimerRef.current = setTimeout(() => {
            setPose('idle');
            setGlowMode('default');
          }, duration);
        }
      }

      // Direct glow change
      if (event === 'glow' && glow) {
        setGlowMode(glow);
      }
    });
    return unsub;
  }, []);

  const handleMouseMove = (e) => {
    const rect = rootRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    const hitRadius = rect.width * 0.32;
    const inside = dist < hitRadius;

    if (window.eurelyas) window.eurelyas.setMouseEvents(!inside);

    if (dragRef.current.pressed) {
      const dx = e.screenX - dragRef.current.startX;
      const dy = e.screenY - dragRef.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragRef.current.moved = true;
        window.eurelyas?.dragMove();
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
      <SpriteCharacter state={state} pose={pose} glowMode={glowMode} />
    </div>
  );
}
