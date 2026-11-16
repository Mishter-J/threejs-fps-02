// effects.js — every visual effect is preallocated and pooled: tracers,
// impact puffs, the explosion flash and the muzzle light are created once
// and reused, so the hot loop never calls `new` and never adds or removes
// objects from the scene while the game runs.
import * as THREE from 'three';

const TRACER_COUNT = 16;
const PUFF_COUNT = 24;

export function createEffects(scene) {
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i++) {
    const m = new THREE.Mesh(
      tracerGeo,
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
    );
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }

  const puffGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const puffs = [];
  for (let i = 0; i < PUFF_COUNT; i++) {
    const m = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({ color: 0xd8c49a, transparent: true, opacity: 0 }),
    );
    m.visible = false;
    scene.add(m);
    puffs.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }

  // One reusable explosion sphere and one reusable point light.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff9a3c, 0, 30, 1.6);
  scene.add(boomLight);

  // Muzzle light: a single point light that jumps to the gun and fades.
  const muzzleLight = new THREE.PointLight(0xffd27a, 0, 12, 1.8);
  scene.add(muzzleLight);

  let tracerNext = 0;
  let puffNext = 0;
  let boomLife = 0;

  return {
    // A bright line from the muzzle to the hit point. `from`/`to` are
    // THREE.Vector3s owned by the caller; the tracer copies their values.
    tracer(from, to, color) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const midZ = (from.z + to.z) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.01) return;
      t.mesh.position.set(midX, midY, midZ);
      t.mesh.lookAt(to.x, to.y, to.z);
      t.mesh.scale.set(1, 1, len);
      t.mesh.material.color.setHex(color);
      t.mesh.material.opacity = 0.9;
      t.mesh.visible = true;
      t.life = 0.07;
    },
    // A burst of 6 small debris cubes at a wall or body hit.
    puff(x, y, z, color) {
      for (let n = 0; n < 6; n++) {
        const p = puffs[puffNext];
        puffNext = (puffNext + 1) % PUFF_COUNT;
        p.mesh.position.set(x, y, z);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 0.95;
        p.mesh.visible = true;
        p.life = 0.45;
        const a = Math.random() * Math.PI * 2;
        const b = Math.random() * Math.PI - Math.PI / 2;
        const sp = 2 + Math.random() * 2.5;
        p.vx = Math.cos(a) * Math.cos(b) * sp;
        p.vy = Math.abs(Math.sin(b)) * sp + 1;
        p.vz = Math.sin(a) * Math.cos(b) * sp;
      }
    },
    explosion(x, y, z) {
      boom.position.set(x, y + 0.6, z);
      boom.scale.setScalar(0.5);
      boom.material.opacity = 0.95;
      boom.visible = true;
      boomLife = 0.6;
      boomLight.position.set(x, y + 1.5, z);
      boomLight.intensity = 60;
    },
    muzzle(x, y, z) {
      muzzleLight.position.set(x, y, z);
      muzzleLight.intensity = 14;
    },
    // Advance every pooled effect by dt seconds. Called once per frame.
    update(dt) {
      for (let i = 0; i < TRACER_COUNT; i++) {
        const t = tracers[i];
        if (!t.mesh.visible) continue;
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (let i = 0; i < PUFF_COUNT; i++) {
        const p = puffs[i];
        if (!p.mesh.visible) continue;
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 6 * dt;
        p.mesh.material.opacity = Math.max(0, p.life / 0.45);
        if (p.life <= 0) p.mesh.visible = false;
      }
      if (boom.visible) {
        boomLife -= dt;
        boom.scale.addScalar(dt * 22);
        boom.material.opacity = Math.max(0, boomLife / 0.6) * 0.95;
        boomLight.intensity = Math.max(0, boomLife / 0.6) * 60;
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      if (muzzleLight.intensity > 0) {
        muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 160);
      }
    },
  };
}
