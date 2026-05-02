// src/character/SpriteCharacter.jsx
//
// Multi-pose Eurelyas with crossfade transitions and glow modes.
//
// Poses are loaded from src/character/assets/. Each pose is a separate
// transparent PNG. When you add a new pose image, just import it and add
// it to the POSES map below.
//
// Drop in new poses generated from Nano Banana / Midjourney etc. into
// src/character/assets/ as transparent PNGs. Recommended naming:
//   eurelyas_idle.png
//   eurelyas_wings_spread.png
//   eurelyas_staff_down.png
//
// If a pose file is missing, we fall back to idle silently.

import React, { useEffect, useState, useRef } from 'react';
import { PALETTE, STATES } from '../shared/palette.js';

// Vite import.meta.glob: pull every PNG in the assets directory.
// Lazy-loads each one only when needed, keeping startup fast.
const poseModules = import.meta.glob('./assets/eurelyas_*.png', { eager: true, query: '?url', import: 'default' });

// Build a lookup: 'idle' -> '/path/to/eurelyas_idle.png'
const POSES = {};
for (const [path, url] of Object.entries(poseModules)) {
  const match = path.match(/eurelyas_(\w+)\.png$/);
  if (match) POSES[match[1]] = url;
}

// Always need an idle. If the named idle isn't there, fall back to plain eurelyas.png.
if (!POSES.idle) {
  // Try plain eurelyas.png as a last resort (legacy single-pose mode)
  const legacy = import.meta.glob('./assets/eurelyas.png', { eager: true, query: '?url', import: 'default' });
  const legacyUrl = Object.values(legacy)[0];
  if (legacyUrl) POSES.idle = legacyUrl;
}

// Resolve a pose name to an actual URL, with idle fallback
function resolvePose(name) {
  return POSES[name] || POSES.idle;
}

export default function SpriteCharacter({ state, pose = 'idle', glowMode = 'default' }) {
  const [tilt, setTilt] = useState(0);
  const rafRef = useRef();
  const startRef = useRef(performance.now());

  useEffect(() => {
    const tick = () => {
      const t = (performance.now() - startRef.current) / 1000;
      setTilt(Math.sin(t * 0.4) * 3);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // State-driven scale
  const scale =
    state === STATES.SUMMONED || state === STATES.THINKING || state === STATES.SPEAKING || state === STATES.WORKING ? 1.0
    : state === STATES.AWARE    ? 0.78
    : state === STATES.SLEEPING ? 0.55
    : 0.65;

  const opacity =
    state === STATES.SLEEPING ? 0.35
    : state === STATES.AWARE  ? 0.95
    : 1.0;

  // Glow palette by mode (manual or action-driven)
  const glowMap = {
    default:   `0 0 30px ${PALETTE.goldGlow}, 0 0 60px ${PALETTE.energyWarm}`,
    warm:      `0 0 34px #FFB778, 0 0 65px #FF8855`,
    cool:      `0 0 34px ${PALETTE.awareCyan}, 0 0 65px #5B9BD5`,
    intense:   `0 0 44px #FFFFFF, 0 0 70px ${PALETTE.goldGlow}`,
    dim:       `0 0 16px rgba(255,233,168,0.3)`,
    crimson:   `0 0 34px #E89B7A, 0 0 65px #C46060`,
    serene:    `0 0 30px #C8D8FF, 0 0 60px #A8C0EC`
  };

  // State-driven default glow (overridden by glowMode if not 'default')
  const stateGlow =
    state === STATES.WORKING  ? `0 0 25px ${PALETTE.energyWarm}, 0 0 50px ${PALETTE.goldMid}`
    : state === STATES.THINKING ? `0 0 30px ${PALETTE.goldGlow}, 0 0 60px ${PALETTE.energyWarm}`
    : state === STATES.SPEAKING ? `0 0 36px ${PALETTE.goldGlow}, 0 0 70px ${PALETTE.energyBloom}`
    : state === STATES.SUMMONED ? `0 0 25px ${PALETTE.goldGlow}`
    : state === STATES.AWARE    ? `0 0 16px ${PALETTE.awareCyan}`
    : `0 0 10px rgba(255,233,168,0.3)`;

  const glow = glowMode !== 'default' ? glowMap[glowMode] || glowMap.default : stateGlow;
  const pulse = state === STATES.THINKING || state === STATES.SPEAKING;
  const working = state === STATES.WORKING;
  const poseUrl = resolvePose(pose);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'relative',
          transform: `scale(${scale}) rotate(${tilt}deg) translateY(${Math.sin(performance.now() * 0.001) * 8}px)`,
          transition: 'transform 0.6s cubic-bezier(0.33, 1, 0.68, 1)',
          opacity,
          filter: `drop-shadow(${glow})`,
          animation: working ? 'eurelyas-work 3s ease-in-out infinite' : pulse ? 'eurelyas-pulse 2s ease-in-out infinite' : 'eurelyas-float 4s ease-in-out infinite'
        }}
      >
        {/* Base pose layer with crossfade. We render every pose, but only the
            active one has opacity 1. CSS transitions handle the crossfade. */}
       <div style={{ position: 'relative', width: '210px', maxWidth: '80vw', aspectRatio: '1198 / 617' }}>
          {Object.entries(POSES).map(([name, url]) => (
            <img
              key={name}
              src={url}
              alt={`Eurelyas (${name})`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                pointerEvents: 'none',
                opacity: name === pose ? 1 : 0,
                transition: 'opacity 0.7s ease-in-out'
              }}
              draggable={false}
            />
          ))}
        </div>
	</div>
      <ParticleLayer state={state} glowMode={glowMode} />

      <style>{`
        @keyframes eurelyas-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes eurelyas-pulse {
          0%, 100% { filter: drop-shadow(0 0 22px ${PALETTE.goldGlow}); }
          50%      { filter: drop-shadow(0 0 40px ${PALETTE.goldGlow}) drop-shadow(0 0 60px ${PALETTE.energyBloom}); }
        }
        @keyframes eurelyas-work {
          0%, 100% { filter: drop-shadow(0 0 18px ${PALETTE.energyWarm}); }
          50%      { filter: drop-shadow(0 0 30px ${PALETTE.energyWarm}) drop-shadow(0 0 50px ${PALETTE.goldMid}); }
        }
      `}</style>
    </div>
  );
}

// Particle color shifts with glowMode for cohesive look
function ParticleLayer({ state, glowMode }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef();

  // Particle color depending on glow mode
  const particleColor =
    glowMode === 'cool' ? '200, 216, 255' :
    glowMode === 'warm' ? '255, 183, 120' :
    glowMode === 'crimson' ? '232, 155, 122' :
    glowMode === 'serene' ? '200, 216, 255' :
    glowMode === 'intense' ? '255, 255, 255' :
    '255, 233, 168';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);

    const intensity =
      state === STATES.SLEEPING ? 0
      : state === STATES.THINKING || state === STATES.SPEAKING ? 1.5
      : state === STATES.WORKING ? 1.2
      : state === STATES.SUMMONED ? 1
      : 0.4;

    const draw = () => {
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

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.008;
        if (p.life <= 0) return false;
        const alpha = p.life * 0.8;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 8);
        grad.addColorStop(0, `rgba(${particleColor},${alpha})`);
        grad.addColorStop(1, `rgba(${particleColor},0)`);
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
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [state, particleColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'screen'
      }}
    />
  );
}
