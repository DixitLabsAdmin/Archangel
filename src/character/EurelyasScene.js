// src/character/EurelyasScene.js
// Procedural Three.js build of Eurelyas.
// Designed so the entire figure can later be swapped for a GLB/GLTF model
// without changing the state machine, animations, or IPC integration.

import * as THREE from 'three';
import { PALETTE, STATES } from '../shared/palette.js';

export class EurelyasScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = STATES.IDLE;
    this.stateStart = performance.now();
    this.scale = 0.6;          // idle scale
    this.targetScale = 0.6;
    this.opacity = 1;
    this.targetOpacity = 1;
    this.hover = 0;            // 0..1 for mouse-over glow

    this._initRenderer();
    this._initScene();
    this._buildCharacter();
    this._initParticles();
    this._tick = this._tick.bind(this);
    this._startTime = performance.now();
    requestAnimationFrame(this._tick);

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false
    });
    this.renderer.setClearColor(0x000000, 0);   // fully transparent
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 1.5, 6);
    this.camera.lookAt(0, 1.2, 0);

    // Soft fill from above (dawn light)
    const key = new THREE.DirectionalLight(0xfff0d0, 1.1);
    key.position.set(2, 4, 3);
    this.scene.add(key);

    // Cool rim from behind (icy blue shadow tones)
    const rim = new THREE.DirectionalLight(0xa8c4e8, 0.8);
    rim.position.set(-2, 2, -3);
    this.scene.add(rim);

    // Ambient
    this.scene.add(new THREE.AmbientLight(0xd0dce8, 0.35));

    // Golden staff-tip point light (dynamic)
    this.staffLight = new THREE.PointLight(new THREE.Color(PALETTE.goldGlow), 0, 5);
    this.scene.add(this.staffLight);
  }

  _buildCharacter() {
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // ============= MATERIALS =============
    const robeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.robeLight),
      roughness: 0.85,
      metalness: 0.0,
      emissive: new THREE.Color(PALETTE.robeShadow),
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 1
    });
    const robeShadowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.robeShadow),
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 1
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.goldMid),
      roughness: 0.35,
      metalness: 0.85,
      emissive: new THREE.Color(PALETTE.goldDeep),
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 1
    });
    const goldBrightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.goldLight),
      roughness: 0.25,
      metalness: 0.9,
      emissive: new THREE.Color(PALETTE.goldGlow),
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 1
    });
    const featherMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.featherLight),
      roughness: 0.7,
      metalness: 0.0,
      emissive: new THREE.Color(PALETTE.featherEdge),
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.goldMid),
      roughness: 0.3,
      metalness: 0.9,
      emissive: new THREE.Color(PALETTE.goldDeep),
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 1
    });

    this.materials = { robeMat, robeShadowMat, goldMat, goldBrightMat, featherMat, helmetMat };

    // ============= BODY =============
    // Torso: tapered robe (cone frustum)
    const torsoGeo = new THREE.CylinderGeometry(0.5, 0.75, 1.6, 24, 1, true);
    const torso = new THREE.Mesh(torsoGeo, robeMat);
    torso.position.y = 1.2;
    this.root.add(torso);

    // Robe skirt — flares out below torso, legs visible through implied drape
    const skirtGeo = new THREE.ConeGeometry(1.1, 1.4, 24, 1, true);
    const skirt = new THREE.Mesh(skirtGeo, robeShadowMat);
    skirt.position.y = -0.3;
    this.root.add(skirt);

    // Inside of robe (darker, shows when moving)
    const skirtInsideGeo = new THREE.ConeGeometry(0.95, 1.25, 24, 1, true);
    const skirtInsideMat = robeShadowMat.clone();
    skirtInsideMat.color = new THREE.Color(PALETTE.robeDeep);
    skirtInsideMat.side = THREE.BackSide;
    const skirtInside = new THREE.Mesh(skirtInsideGeo, skirtInsideMat);
    skirtInside.position.y = -0.25;
    this.root.add(skirtInside);

    // Shoulders / pauldrons — gold trim
    const shoulderGeo = new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const shoulderL = new THREE.Mesh(shoulderGeo, goldMat);
    shoulderL.position.set(-0.5, 1.85, 0);
    shoulderL.rotation.z = 0.2;
    this.root.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.5;
    shoulderR.rotation.z = -0.2;
    this.root.add(shoulderR);

    // Chest plate — subtle gold V
    const chestGeo = new THREE.TorusGeometry(0.25, 0.04, 8, 20, Math.PI);
    const chest = new THREE.Mesh(chestGeo, goldBrightMat);
    chest.position.set(0, 1.55, 0.4);
    chest.rotation.z = Math.PI;
    this.root.add(chest);

    // Belt / cinch at waist
    const beltGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 24);
    const belt = new THREE.Mesh(beltGeo, goldMat);
    belt.position.y = 0.55;
    belt.rotation.x = Math.PI / 2;
    this.root.add(belt);

    // ============= ARMS =============
    this.armL = this._buildArm(-1);
    this.armR = this._buildArm(1);
    this.root.add(this.armL, this.armR);

    // ============= HELMET (Angemon-style — only mouth and chin visible) =============
    this.helmet = this._buildHelmet(helmetMat, goldBrightMat, robeMat);
    this.helmet.position.y = 2.2;
    this.root.add(this.helmet);

    // ============= WINGS =============
    this.wingsLargeL = this._buildWing(featherMat, 1.4, 0.9, 7);   // large primary L
    this.wingsLargeR = this._buildWing(featherMat, 1.4, 0.9, 7);
    this.wingsSmallL = this._buildWing(featherMat, 0.85, 0.55, 5); // secondary
    this.wingsSmallR = this._buildWing(featherMat, 0.85, 0.55, 5);

    this.wingsLargeL.position.set(-0.4, 1.85, -0.15);
    this.wingsLargeR.position.set(0.4, 1.85, -0.15);
    this.wingsLargeR.scale.x = -1;

    this.wingsSmallL.position.set(-0.35, 1.55, -0.05);
    this.wingsSmallR.position.set(0.35, 1.55, -0.05);
    this.wingsSmallR.scale.x = -1;

    this.root.add(this.wingsLargeL, this.wingsLargeR, this.wingsSmallL, this.wingsSmallR);

    // ============= STAFF (perfect circular gold pole) =============
    this.staff = this._buildStaff(goldBrightMat, goldMat);
    this.staff.position.set(0.75, 0.7, 0.2);   // held in right hand
    this.staff.rotation.z = 0.1;
    this.root.add(this.staff);

    // Idle floating offset
    this.root.position.y = 0;
  }

  _buildArm(side) {
    const arm = new THREE.Group();
    const sleeveGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.9, 12);
    const sleeve = new THREE.Mesh(sleeveGeo, this.materials.robeMat);
    sleeve.position.y = -0.45;
    arm.add(sleeve);

    const cuffGeo = new THREE.TorusGeometry(0.18, 0.04, 8, 16);
    const cuff = new THREE.Mesh(cuffGeo, this.materials.goldMat);
    cuff.position.y = -0.9;
    cuff.rotation.x = Math.PI / 2;
    arm.add(cuff);

    // Hand hint
    const handGeo = new THREE.SphereGeometry(0.1, 12, 10);
    const hand = new THREE.Mesh(handGeo, this.materials.robeShadowMat);
    hand.position.y = -1.0;
    arm.add(hand);

    arm.position.set(side * 0.55, 1.75, 0);
    arm.rotation.z = side * 0.15;
    return arm;
  }

  _buildHelmet(helmetMat, goldBrightMat, robeMat) {
    const helmet = new THREE.Group();

    // Dome — covers eyes and nose (top 2/3 of head)
    const domeGeo = new THREE.SphereGeometry(0.38, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const dome = new THREE.Mesh(domeGeo, helmetMat);
    dome.position.y = 0.05;
    helmet.add(dome);

    // Helmet crest — vertical fin along top
    const crestShape = new THREE.Shape();
    crestShape.moveTo(0, 0);
    crestShape.lineTo(0.35, 0.1);
    crestShape.lineTo(0.45, -0.05);
    crestShape.lineTo(-0.45, -0.05);
    crestShape.lineTo(-0.35, 0.1);
    crestShape.lineTo(0, 0);
    const crestGeo = new THREE.ExtrudeGeometry(crestShape, { depth: 0.03, bevelEnabled: false });
    const crest = new THREE.Mesh(crestGeo, goldBrightMat);
    crest.position.set(-0.015, 0.32, -0.1);
    crest.rotation.x = -0.2;
    helmet.add(crest);

    // Side wing-fins (small swept accents, Angemon-ish)
    const finGeo = new THREE.ConeGeometry(0.1, 0.4, 4, 1);
    const finL = new THREE.Mesh(finGeo, goldBrightMat);
    finL.position.set(-0.32, 0.05, -0.05);
    finL.rotation.z = -1.2;
    finL.rotation.y = 0.4;
    helmet.add(finL);
    const finR = finL.clone();
    finR.position.x = 0.32;
    finR.rotation.z = 1.2;
    finR.rotation.y = -0.4;
    helmet.add(finR);

    // Visor rim — horizontal gold band at the base of the dome (the edge that hides eyes)
    const visorGeo = new THREE.TorusGeometry(0.38, 0.035, 8, 32, Math.PI);
    const visor = new THREE.Mesh(visorGeo, goldBrightMat);
    visor.position.y = -0.1;
    visor.rotation.x = Math.PI / 2;
    visor.rotation.y = Math.PI;
    helmet.add(visor);

    // Lower jaw / chin — exposed (mouth + chin visible below the visor)
    const jawGeo = new THREE.SphereGeometry(0.28, 20, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.35);
    const jaw = new THREE.Mesh(jawGeo, this.materials.robeLight
      ? new THREE.MeshStandardMaterial({
          color: new THREE.Color(PALETTE.robeLight),
          roughness: 0.6,
          emissive: new THREE.Color(PALETTE.robeMid),
          emissiveIntensity: 0.1,
          transparent: true,
          opacity: 1
        })
      : robeMat);
    jaw.position.y = -0.05;
    helmet.add(jaw);

    return helmet;
  }

  _buildWing(featherMat, length, height, featherCount) {
    const wing = new THREE.Group();

    // Wing bone — a curved strip spline
    const bone = new THREE.Group();
    wing.add(bone);

    // Feathers — stacked overlapping planes, each rotated slightly
    const featherGeo = this._makeFeatherGeometry();
    for (let i = 0; i < featherCount; i++) {
      const t = i / (featherCount - 1);
      const feather = new THREE.Mesh(featherGeo, featherMat.clone());

      // position along wing curve (arc outward and slightly downward)
      const angle = t * 0.9 + 0.1;
      const x = -Math.sin(angle) * length * (0.4 + t * 0.6);
      const y = Math.cos(angle) * height * 0.3 - t * 0.15;
      const z = -t * 0.05;
      feather.position.set(x, y, z);

      // scale — tips are smaller
      const s = 1 - t * 0.35;
      feather.scale.set(s, s, s);

      // rotation — fan outward
      feather.rotation.z = angle + Math.PI / 2;
      feather.rotation.y = -t * 0.3;

      // subtle color variation — deeper shadow on inner feathers
      const innerBlend = 1 - t;
      const featherColor = new THREE.Color(PALETTE.featherLight).lerp(new THREE.Color(PALETTE.featherMid), innerBlend * 0.3);
      feather.material.color = featherColor;

      bone.add(feather);
    }

    wing.userData.bone = bone;
    return wing;
  }

  _makeFeatherGeometry() {
    // Elongated teardrop shape — narrower at root, rounded at tip
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.08, 0.3, 0.05, 0.6);
    shape.quadraticCurveTo(0.02, 0.75, 0, 0.8);
    shape.quadraticCurveTo(-0.02, 0.75, -0.05, 0.6);
    shape.quadraticCurveTo(-0.08, 0.3, 0, 0);
    return new THREE.ShapeGeometry(shape);
  }

  _buildStaff(goldBrightMat, goldMat) {
    const staff = new THREE.Group();

    // The perfect circular gold pole
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.2, 24);
    const pole = new THREE.Mesh(poleGeo, goldBrightMat);
    staff.add(pole);

    // Subtle grip band at middle
    const gripGeo = new THREE.TorusGeometry(0.04, 0.015, 8, 20);
    const grip = new THREE.Mesh(gripGeo, goldMat);
    grip.rotation.x = Math.PI / 2;
    staff.add(grip);

    // Crown orb (top) — where light gathers in THINKING state
    const orbGeo = new THREE.SphereGeometry(0.08, 20, 16);
    const orbMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.goldGlow),
      emissive: new THREE.Color(PALETTE.energyBloom),
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 1
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.y = 1.15;
    staff.add(orb);
    this.staffOrb = orb;

    return staff;
  }

  _initParticles() {
    // Drifting light motes / feather fragments
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i*3 + 0] = (Math.random() - 0.5) * 3;
      positions[i*3 + 1] = Math.random() * 3;
      positions[i*3 + 2] = (Math.random() - 0.5) * 2;
      velocities[i*3 + 0] = (Math.random() - 0.5) * 0.002;
      velocities[i*3 + 1] = -0.003 - Math.random() * 0.004;
      velocities[i*3 + 2] = (Math.random() - 0.5) * 0.001;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(PALETTE.energyBloom),
      size: 0.05,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.particles = new THREE.Points(geo, mat);
    this.particleVelocities = velocities;
    this.particleCount = count;
    this.scene.add(this.particles);
  }

  _updateParticles(dt) {
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.particleCount; i++) {
      pos[i*3+0] += this.particleVelocities[i*3+0];
      pos[i*3+1] += this.particleVelocities[i*3+1];
      pos[i*3+2] += this.particleVelocities[i*3+2];
      if (pos[i*3+1] < -1) {
        pos[i*3+0] = (Math.random() - 0.5) * 2;
        pos[i*3+1] = 3;
        pos[i*3+2] = (Math.random() - 0.5) * 2;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- State control ----------
  setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this.stateStart = performance.now();

    switch (newState) {
      case STATES.IDLE:      this.targetScale = 0.6; this.targetOpacity = 1; break;
      case STATES.AWARE:     this.targetScale = 0.72; this.targetOpacity = 1; break;
      case STATES.SUMMONED:  this.targetScale = 1.0; this.targetOpacity = 1; break;
      case STATES.THINKING:  this.targetScale = 1.0; this.targetOpacity = 1; break;
      case STATES.SPEAKING:  this.targetScale = 1.0; this.targetOpacity = 1; break;
      case STATES.DISMISSED: this.targetScale = 0.6; this.targetOpacity = 1; break;
      case STATES.SLEEPING:  this.targetScale = 0.5; this.targetOpacity = 0.4; break;
    }
  }

  setHover(isHovering) {
    this.targetHover = isHovering ? 1 : 0;
  }

  // ---------- Animation loop ----------
  _tick() {
    const now = performance.now();
    const elapsed = (now - this._startTime) / 1000;
    const stateT = (now - this.stateStart) / 1000;
    const dt = 1/60;

    // Smooth scale/opacity toward target
    this.scale += (this.targetScale - this.scale) * 0.08;
    this.opacity += (this.targetOpacity - this.opacity) * 0.08;
    this.hover += ((this.targetHover ?? 0) - this.hover) * 0.12;
    this.root.scale.setScalar(this.scale);

    // Apply opacity to all materials
    Object.values(this.materials).forEach(m => { m.opacity = this.opacity; });
    if (this.staffOrb) this.staffOrb.material.opacity = this.opacity;

    // Breathing: gentle vertical bob, always on
    const breath = Math.sin(elapsed * 1.2) * 0.05;
    this.root.position.y = breath;

    // Slight sway
    this.root.rotation.y = Math.sin(elapsed * 0.4) * 0.08 + this.hover * 0.15;

    // Wing animation by state
    const flapT = elapsed * 1.5;
    let wingSpread, wingFlap;
    switch (this.state) {
      case STATES.IDLE:
      case STATES.DISMISSED:
      case STATES.SLEEPING:
        wingSpread = 0.35;                          // folded
        wingFlap = Math.sin(flapT) * 0.03;
        break;
      case STATES.AWARE:
        wingSpread = 0.55;
        wingFlap = Math.sin(flapT * 1.3) * 0.05;
        break;
      case STATES.SUMMONED:
        wingSpread = Math.min(1.0, stateT * 1.8);   // unfurl over ~0.5s
        wingFlap = Math.sin(flapT * 1.2) * 0.08;
        break;
      case STATES.THINKING:
      case STATES.SPEAKING:
        wingSpread = 1.0;
        wingFlap = Math.sin(flapT * 1.0) * 0.06;
        break;
      default:
        wingSpread = 0.5; wingFlap = 0;
    }

    // Large wings — apply spread (Y rotation) + flap (Z rotation)
    if (this.wingsLargeL) {
      this.wingsLargeL.rotation.y = -wingSpread * 0.8;
      this.wingsLargeL.rotation.z = wingFlap;
      this.wingsLargeR.rotation.y = wingSpread * 0.8;
      this.wingsLargeR.rotation.z = -wingFlap;
    }
    // Small wings — slightly different phase for that "alive" layered look
    if (this.wingsSmallL) {
      const smallFlap = Math.sin(flapT * 1.4 + 0.5) * 0.08;
      this.wingsSmallL.rotation.y = -wingSpread * 0.65;
      this.wingsSmallL.rotation.z = smallFlap;
      this.wingsSmallR.rotation.y = wingSpread * 0.65;
      this.wingsSmallR.rotation.z = -smallFlap;
    }

    // Staff orb glow by state
    if (this.staffOrb) {
      let orbIntensity = 0.3;
      if (this.state === STATES.THINKING) {
        orbIntensity = 0.5 + Math.sin(elapsed * 3) * 0.3 + 0.4;
      } else if (this.state === STATES.SPEAKING) {
        orbIntensity = 0.6 + Math.sin(elapsed * 6) * 0.2;
      } else if (this.state === STATES.SUMMONED) {
        orbIntensity = 0.4 + Math.sin(elapsed * 2) * 0.15;
      } else if (this.state === STATES.AWARE) {
        orbIntensity = 0.35;
      }
      this.staffOrb.material.emissiveIntensity = orbIntensity * this.opacity;
      // Staff tip light
      const orbWorld = new THREE.Vector3();
      this.staffOrb.getWorldPosition(orbWorld);
      this.staffLight.position.copy(orbWorld);
      this.staffLight.intensity = orbIntensity * 1.2;
    }

    // Hover glow — subtle golden lift on all gold mats
    const hoverGlow = 0.15 + this.hover * 0.4;
    this.materials.goldBrightMat.emissiveIntensity = hoverGlow * 2;

    // Sleeping: fade particles
    this.particles.material.opacity = this.state === STATES.SLEEPING ? 0.1 : 0.5;

    this._updateParticles(dt);

    this.renderer.render(this.scene, this.camera);
    this._rafId = requestAnimationFrame(this._tick);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    this.renderer.dispose();
  }
}
