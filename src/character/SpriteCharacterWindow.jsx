// src/character/SpriteCharacterWindow.jsx
// Drop-in replacement for CharacterWindow.jsx that uses sprite poses.
// Handles click-through, drag-to-move, click-to-summon, and animation actions.
//
// State→pose mapping:
//   THINKING  → blast   (combat stance, magic circle — Eurelyas working)
//   SPEAKING  → guide   (wings spread, staff raised — Eurelyas counseling)
//   otherwise → idle    (the floating, breathing default)
//
// An explicit `action` event with a `pose` overrides the auto mapping for
// its duration. Useful when Claude emits an <action pose="..."/> tag.

import React, { useEffect, useRef, useState } from 'react';
import SpriteCharacter from './SpriteCharacter.jsx';
import { STATES } from '../shared/palette.js';

const DRAG_THRESHOLD = 5;

// How long an explicit action pose holds before reverting. 0 = sticky.
const ACTION_DURATIONS = {
  spread:     8000,
  staff_down: 6000,
  guide:      6000,   // blessing / offering counsel — overlaps with SPEAKING
  blast:      5000,   // casting / decisive action — overlaps with THINKING
  idle:       0
};

// State-driven pose. Used when no explicit action pose is active.
function poseForState(state) {
  if (state === STATES.THINKING || state === STATES.WORKING) return 'blast';
  if (state === STATES.SPEAKING) return 'guide';
  return 'idle';
}

export default function SpriteCharacterWindow() {
  const rootRef = useRef(null);
  const [state, setState] = useState(STATES.IDLE);
  // actionPose: an explicit pose set by an action event. Overrides state pose
  // until its timer expires. null when no override is active.
  const [actionPose, setActionPose] = useState(null);
  const [glowMode, setGlowMode] = useState('default');
  const dragRef = useRef({ pressed: false, moved: false, startX: 0, startY: 0 });
  const actionTimerRef = useRef(null);

  // Effective pose: explicit action wins, otherwise derive from state.
  const pose = actionPose || poseForState(state);

  // State sync from main process
  useEffect(() => {
    if (!window.eurelyas) return;
    const unsub = window.eurelyas.onState(({ event, pose: newPose, glow }) => {
      if (event === 'summoned')  setState(STATES.SUMMONED);
      if (event === 'dismissed') { setState(STATES.IDLE); setActionPose(null); }
      if (event === 'thinking')  setState(STATES.THINKING);
      if (event === 'speaking')  setState(STATES.SPEAKING);
      if (event === 'working')   setState(STATES.WORKING);
      if (event === 'sleep')     setState(STATES.SLEEPING);
      if (event === 'wake')      setState(STATES.IDLE);

      // Action-driven pose change — explicit override of state pose
      if (event === 'action' && newPose) {
        setActionPose(newPose);
        if (glow) setGlowMode(glow);

        if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
        const duration = ACTION_DURATIONS[newPose] ?? 0;
        if (duration > 0) {
          actionTimerRef.current = setTimeout(() => {
            setActionPose(null);
            setGlowMode('default');
          }, duration);
        }
      }

      // Direct glow change (mood tag)
      if ((event === 'glow' || event === 'mood') && glow) {
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
