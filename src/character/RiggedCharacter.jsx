// src/character/RiggedCharacter.jsx
//
// Eurelyas as a rigged 2D character. Body, wings, and staff are separate
// transparent PNGs layered with absolute positioning. Each layer has its
// own CSS transform anchored at an anatomical pivot, so wings can flap
// and the staff can rotate independently of the body.
//
// All animation is CSS / inline transforms — no animation library, no canvas
// per-frame redraw. Browser handles compositing on the GPU. Cheap.

import React, { memo, useEffect, useRef, useState } from 'react';
import { PALETTE, STATES } from '../shared/palette.js';

import bodyImg   from './assets/eurelyas_body.png';
import wingsImg  from './assets/eurelyas_wings.png';
import staffImg  from './assets/eurelyas_staff.png';
import layersData from './assets/layers.json';

// === Glow palettes ===
const GLOW = {
  default: { color: '255,233,168', intensity: 1.0 },
  warm:    { color: '255,183,120', intensity: 1.1 },
  cool:    { color: '168,216,240', intensity: 0.9 },
  intense: { color: '255,255,255', intensity: 1.4 },
  dim:     { color: '255,233,168', intensity: 0.4 },
  crimson: { color: '232,155,122', intensity: 1.0 },
  serene:  { color: '200,216,255', intensity: 0.85 }
};

// === Pose definitions ===
// Each pose specifies transforms for each rig part. Transforms are applied
// over a 0.7s ease so transitions look natural.
const POSES = {
  idle: {
    body:  { transform: 'translate(0,0) scale(1)' },
    wings: { transform: 'translate(0,0) scale(1)' },
    staff: { transform: 'translate(0,0) rotate(0deg)' }
  },
  spread: {
    body:  { transform: 'translate(0,-4px) scale(1.02)' },
    wings: { transform: 'translate(0,-6px) scale(1.18)' },
    staff: { transform: 'translate(0,0) rotate(-8deg)' }
  },
  staff_down: {
    body:  { transform: 'translate(0,0) scale(1)' },
    wings: { transform: 'translate(0,0) scale(0.95)' },
    // Pivot at the grip — staff rotates so orb points down
    staff: { transform: 'translate(8px,40px) rotate(75deg)' }
  }
};

function RiggedCharacterInner({ state, pose = 'idle', glowMode = 'default' }) {
  const startRef = useRef(performance.now());
  const [breathOffset, setBreathOffset] = useState(0);
  const [wingFlap, setWingFlap] = useState(0);
  const rafRef = useRef();

  // Sleeping = no animation loop, no particles
  const isSleeping = state === STATES.SLEEPING;

  // Single rAF loop. Skips ticks when sleeping. Throttled to ~30fps for the
  // gentle motion — the eye can't tell the difference and it halves CPU.
  useEffect(() => {
    if (isSleeping) return;
    let alive = true;
    let lastTick = 0;
    const TICK_MS = 33;  // ~30fps
    const tick = (now) => {
      if (!alive) return;
      if (now - lastTick >= TICK_MS) {
        lastTick = now;
        const t = (now - startRef.current) / 1000;
        setBreathOffset(Math.sin(t * 1.0) * 0.5);
        setWingFlap(Math.sin(t * 1.5) * 1.2);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [isSleeping]);

  // Whole-character scale by state
  const charScale =
    state === STATES.SUMMONED || state === STATES.THINKING || state === STATES.SPEAKING ? 1.0
    : state === STATES.AWARE    ? 0.78
    : isSleeping                ? 0.55
    : 0.65;
  const charOpacity = isSleeping ? 0.35 : 1.0;

  // Glow strength by state
  const glow = GLOW[glowMode] || GLOW.default;
  const stateGlowMul =
    state === STATES.THINKING ? 1.2
    : state === STATES.SPEAKING ? 1.4
    : state === STATES.SUMMONED ? 1.0
    : state === STATES.AWARE    ? 0.6
    : 0.5;
  const glowOpacity = glow.intensity * stateGlowMul;
  const glowFilter = `drop-shadow(0 0 ${30 * glowOpacity}px rgba(${glow.color},${0.5 * glowOpacity}))`;

  const currentPose = POSES[pose] || POSES.idle;

  // Each layer's transform combines pose + continuous motion
  const wingsTransform = `${currentPose.wings.transform} rotate(${wingFlap}deg)`;
  const bodyTransform = `${currentPose.body.transform} translateY(${breathOffset}px)`;
  const staffTransform = currentPose.staff.transform;

  // Pivots, computed once
  const { canvas, pivots } = layersData;
  const wingsPivot = `${pivots.wings.x * 100}% ${pivots.wings.y * 100}%`;
  const bodyPivot  = `${pivots.body.x * 100}% ${pivots.body.y * 100}%`;
  const staffPivot = `${pivots.staff.x * 100}% ${pivots.staff.y * 100}%`;

  // Aspect-correct render box (480px wide character)
  const renderWidth = 420;  // fits comfortably in a 480px window with margin
  const renderHeight = renderWidth * (canvas.height / canvas.width);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', position: 'relative'
    }}>
      <div style={{
        position: 'relative',
        width: renderWidth,
        height: renderHeight,
        transform: `scale(${charScale})`,
        transition: 'transform 0.6s cubic-bezier(0.33, 1, 0.68, 1)',
        opacity: charOpacity,
        filter: glowFilter,
        willChange: 'transform, filter'
      }}>
        {/* WINGS (back layer) */}
        <img
          src={wingsImg}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            transform: wingsTransform,
            transformOrigin: wingsPivot,
            transition: 'transform 0.7s cubic-bezier(0.33, 1, 0.68, 1)',
            pointerEvents: 'none',
            userSelect: 'none',
            willChange: 'transform'
          }}
        />
        {/* BODY (middle layer) */}
        <img
          src={bodyImg}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            transform: bodyTransform,
            transformOrigin: bodyPivot,
            transition: 'transform 0.7s cubic-bezier(0.33, 1, 0.68, 1)',
            pointerEvents: 'none',
            userSelect: 'none',
            willChange: 'transform'
          }}
        />
        {/* STAFF (front layer) */}
        <img
          src={staffImg}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            transform: staffTransform,
            transformOrigin: staffPivot,
            transition: 'transform 0.7s cubic-bezier(0.33, 1, 0.68, 1)',
            pointerEvents: 'none',
            userSelect: 'none',
            willChange: 'transform'
          }}
        />
      </div>

      {/* Particles only when actively engaged - skip otherwise to save GPU */}
      {!isSleeping && (state === STATES.THINKING || state === STATES.SPEAKING || state === STATES.SUMMONED) && (
        <ParticleLayer state={state} glow={glow} />
      )}
    </div>
  );
}

export default memo(RiggedCharacterInner);

// Lightweight particle system. Only renders when needed (see render gate above).
const ParticleLayer = memo(function ParticleLayer({ state, glow }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const intensity = state === STATES.THINKING || state === STATES.SPEAKING ? 1.5 : 0.7;
    let alive = true;

    const draw = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (Math.random() < intensity * 0.3) {
        particlesRef.current.push({
          x: canvas.width * 0.5 + (Math.random() - 0.5) * canvas.width * 0.4,
          y: canvas.height * 0.6,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.5 - Math.random() * 1,
          life: 1,
          size: 1 + Math.random() * 2
        });
      }

      // Cap particles to prevent unbounded growth
      if (particlesRef.current.length > 60) particlesRef.current.length = 60;

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.008;
        if (p.life <= 0) return false;
        const alpha = p.life * 0.7;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 8);
        grad.addColorStop(0, `rgba(${glow.color},${alpha})`);
        grad.addColorStop(1, `rgba(${glow.color},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 8, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [state, glow]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', mixBlendMode: 'screen'
      }}
    />
  );
});
