// effects.js — pooled, allocation-free visual effects: tracers,
// impact puffs, muzzle flashes and explosions. Every pool entry is
// created once at startup and recycled; update() never allocates.

import * as THREE from 'three';

const TRACER_POOL = 24;
const PUFF_POOL = 32;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 }),
    );
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  const puffs = [];
  const puffGeo = new THREE.SphereGeometry(0.09, 6, 5);
  for (let i = 0; i < PUFF_POOL; i++) {
    const mesh = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let puffIdx = 0;

  // One reusable explosion shell + light.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8a3d, 0, 22, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  // Muzzle flash: a small additive sprite quad at the gun tip.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  flash.visible = false;
  scene.add(flash);
  let flashLife = 0;

  const tmpColor = new THREE.Color();

  return {
    tracer(ax, ay, az, bx, by, bz, color) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % TRACER_POOL;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = ax; pos[1] = ay; pos[2] = az;
      pos[3] = bx; pos[4] = by; pos[5] = bz;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.95;
      t.life = 0.25;
    },
    impact(x, y, z, color, count) {
      const n = count || 5;
      for (let i = 0; i < n; i++) {
        const p = puffs[puffIdx];
        puffIdx = (puffIdx + 1) % PUFF_POOL;
        p.mesh.position.set(x, y, z);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 0.95;
        p.mesh.visible = true;
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 2.5;
        p.vx = Math.cos(a) * s;
        p.vy = 1 + Math.random() * 2;
        p.vz = Math.sin(a) * s;
        p.life = 0.35 + Math.random() * 0.2;
      }
    },
    explosion(x, y, z) {
      boom.position.set(x, y + 0.4, z);
      boom.visible = true;
      boom.scale.setScalar(0.3);
      boom.material.opacity = 0.95;
      boomLight.position.set(x, y + 1.2, z);
      boomLight.intensity = 60;
      boomLife = 0.55;
    },
    muzzle(x, y, z, yaw, pitch) {
      flash.position.set(x, y, z);
      flash.rotation.set(pitch, yaw, Math.random() * Math.PI);
      flash.visible = true;
      flash.material.opacity = 0.95;
      flashLife = 0.05;
      tmpColor.setHex(0xffd27a);
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
        else t.line.material.opacity = Math.min(0.95, t.life / 0.25);
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 6 * dt;
        p.mesh.material.opacity = p.life * 2.2;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / 0.55;
        boom.scale.setScalar(0.3 + k * 6.5);
        boom.material.opacity = Math.max(0, 0.95 * (1 - k));
        boomLight.intensity = Math.max(0, 60 * (1 - k));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) {
          flash.visible = false;
          flash.material.opacity = 0;
        }
      }
    },
  };
}
