// src/character/Character.jsx
//
// Eurelyas as a single composed image. No layered rig.
// State controls scale and animation intensity. Glow mode controls color.

import React, { memo, useEffect, useRef, useState } from 'react';
import { PALETTE, STATES } from '../shared/palette.js';
import eurelyasImg from './assets/eurelyas.png';

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

function CharacterInner({ state, glowMode = 'default' }) {
  const startRef = useRef(performance.now());
  const [bob, setBob] = useState(0);
  const rafRef = useRef();

  const isSleeping = state === STATES.SLEEPING;

  // Single rAF loop for the gentle breathing/hover. ~30fps, stops when sleeping.
  useEffect(() => {
    if (isSleeping) return;
    let alive = true;
    let lastTick = 0;
    const TICK_MS = 33;
    const tick = (now) => {
      if (!alive) return;
      if (now - lastTick >= TICK_MS) {
        lastTick = now;
        const t = (now - startRef.current) / 1000;
        setBob(Math.sin(t * 1.0) * 4);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [isSleeping]);

  // State-driven scale
  const scale =
    state === STATES.SUMMONED || state === STATES.THINKING || state === STATES.SPEAKING ? 1.0
    : state === STATES.AWARE    ? 0.78
    : isSleeping                ? 0.55
    : 0.65;

  const opacity = isSleeping ? 0.35 : 1.0;

  const glow = GLOW[glowMode] || GLOW.default;

  // State-driven glow intensity
  const stateGlowMul =
    state === STATES.THINKING ? 1.2
    : state === STATES.SPEAKING ? 1.4
    : state === STATES.SUMMONED ? 1.0
    : state === STATES.AWARE    ? 0.6
    : 0.5;
  const glowIntensity = glow.intensity * stateGlowMul;

  // Glow filter — single drop-shadow, GPU-cheap
  const glowFilter = `drop-shadow(0 0 ${30 * glowIntensity}px rgba(${glow.color},${0.55 * glowIntensity}))`;

  // Pulse during thinking/speaking — CSS animation, no JS overhead
  const pulse = state === STATES.THINKING || state === STATES.SPEAKING;

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', position: 'relative'
    }}>
      <div style={{
        position: 'relative',
        transform: `scale(${scale}) translateY(${bob}px)`,
        transition: 'transform 0.6s cubic-bezier(0.33, 1, 0.68, 1)',
        opacity,
        filter: glowFilter,
        animation: pulse ? 'eurelyas-pulse 2s ease-in-out infinite' : 'none',
        willChange: 'transform, filter'
      }}>
        <img
          src={eurelyasImg}
          alt="Eurelyas"
          draggable={false}
          style={{
            width: '480px',
            height: 'auto',
            maxHeight: '95vh',
            maxWidth: '95vw',
            userSelect: 'none',
            pointerEvents: 'none',
            display: 'block'
          }}
        />
      </div>

      {/* Particles only during active states */}
      {!isSleeping && (state === STATES.THINKING || state === STATES.SPEAKING || state === STATES.SUMMONED) && (
        <ParticleLayer state={state} glow={glow} />
      )}

      <style>{`
        @keyframes eurelyas-pulse {
          0%, 100% { filter: drop-shadow(0 0 ${30 * glowIntensity}px rgba(${glow.color},${0.5 * glowIntensity})); }
          50%      { filter: drop-shadow(0 0 ${60 * glowIntensity}px rgba(${glow.color},${0.85 * glowIntensity})) drop-shadow(0 0 ${100 * glowIntensity}px rgba(${glow.color},${0.5 * glowIntensity})); }
        }
      `}</style>
    </div>
  );
}

export default memo(CharacterInner);

const ParticleLayer = memo(function ParticleLayer({ state, glow }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
