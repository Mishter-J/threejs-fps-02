// effects.js — short-lived visuals: tracers, muzzle flashes, impact
// sparks and explosions.
//
// Everything here is pooled: a fixed set of line and point objects is
// reused, so the hot loop makes no new objects per frame. Each effect is
// a small record { kind, t, dur, ... } updated in place.

import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_BURSTS = 16;

export function createEffects(scene) {
  // Tracer pool: one Line each, hidden when idle.
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, t: 0, dur: 0 });
  }
  // Spark-burst pool: one Points cloud each.
  const bursts = [];
  for (let i = 0; i < MAX_BURSTS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0 }));
    pts.frustumCulled = false;
    scene.add(pts);
    bursts.push({ pts, vel: new Float32Array(24 * 3), t: 0, dur: 0 });
  }
  // Muzzle flash: a small sprite with a radial-gradient texture plus a
  // point light, shared by everyone.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fg = flashCanvas.getContext('2d');
  const grad = fg.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
  grad.addColorStop(0.4, 'rgba(255, 190, 90, 0.85)');
  grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
  fg.fillStyle = grad;
  fg.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashMat = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
  scene.add(flashLight);
  let flashT = 0;

  // Explosion: an expanding transparent sphere plus a light.
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8a3a, 0, 26, 1.6);
  scene.add(boomLight);
  let boomT = 0;

  return {
    /** A bright line from muzzle to impact, fading over `dur` seconds. */
    tracer(from, to, dur = 0.09) {
      let slot = tracers.find((t) => t.t <= 0);
      if (!slot) slot = tracers[0];
      const p = slot.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.t = dur;
      slot.dur = dur;
      slot.line.material.opacity = 0.9;
    },

    /** A burst of sparks at a point. */
    sparks(at, n = 16) {
      let slot = bursts.find((b) => b.t <= 0);
      if (!slot) slot = bursts[0];
      const p = slot.pts.geometry.attributes.position.array;
      for (let i = 0; i < 24; i++) {
        const k = i < n ? 1 : 0;
        p[i * 3] = at.x;
        p[i * 3 + 1] = at.y;
        p[i * 3 + 2] = at.z;
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.35) * Math.PI;
        const s = (2 + Math.random() * 4) * k;
        slot.vel[i * 3] = Math.cos(a) * Math.cos(e) * s;
        slot.vel[i * 3 + 1] = Math.sin(e) * s + 1.5;
        slot.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      }
      slot.pts.geometry.attributes.position.needsUpdate = true;
      slot.t = 0.45;
      slot.dur = 0.45;
      slot.pts.material.opacity = 1;
    },

    /** Muzzle flash at a position, facing the camera. */
    muzzle(at, camera) {
      flash.position.copy(at);
      flash.lookAt(camera.position);
      flash.visible = true;
      flashMat.opacity = 1;
      flashLight.position.copy(at);
      flashLight.intensity = 14;
      flashT = 0.06;
    },

    /** Explosion at a point: sphere, light and sparks together. */
    explosion(at) {
      boom.position.copy(at);
      boom.visible = true;
      boomT = 0.6;
      boomLight.position.set(at.x, at.y + 1, at.z);
      boomLight.intensity = 60;
      this.sparks(at, 24);
    },

    update(dt, camera) {
      for (const t of tracers) {
        if (t.t <= 0) continue;
        t.t -= dt;
        t.line.material.opacity = Math.max(0, (t.t / t.dur)) * 0.9;
        if (t.t <= 0) t.line.material.opacity = 0;
      }
      for (const b of bursts) {
        if (b.t <= 0) continue;
        b.t -= dt;
        const p = b.pts.geometry.attributes.position.array;
        for (let i = 0; i < 24; i++) {
          p[i * 3] += b.vel[i * 3] * dt;
          p[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
          p[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
          b.vel[i * 3 + 1] -= 9 * dt;
        }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = Math.max(0, b.t / b.dur);
      }
      if (flashT > 0) {
        flashT -= dt;
        flashMat.opacity = Math.max(0, flashT / 0.06);
        flashLight.intensity = Math.max(0, flashT / 0.06) * 14;
        flash.lookAt(camera.position);
        if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; }
      }
      if (boomT > 0) {
        boomT -= dt;
        const k = 1 - Math.max(0, boomT / 0.6);
        boom.scale.setScalar(1 + k * 7);
        boomMat.opacity = Math.max(0, boomT / 0.6) * 0.55;
        boomLight.intensity = Math.max(0, boomT / 0.6) * 60;
        if (boomT <= 0) { boom.visible = false; boomLight.intensity = 0; }
      }
    },
  };
}
