// world.js — builds the EMBER YARD map from config.js data and owns
// every spatial query the simulation needs: circle-vs-wall collision,
// 3D segment line-of-sight, and ray-vs-wall hits for bullets.
// Geometry is plain three.js boxes with a flat-shaded dusk palette;
// no textures are loaded, so the game needs no asset files at all.

import * as THREE from 'three';
import { MAP, PALETTE } from './config.js';

function boxMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05 });
}

export function buildWorld(scene) {
  const colliders = [];
  const mats = {
    wallA: boxMat(PALETTE.wallA),
    wallB: boxMat(PALETTE.wallB),
    wallC: boxMat(PALETTE.wallC),
    crate: boxMat(PALETTE.crate),
    crateB: boxMat(PALETTE.crateB),
    container: boxMat(PALETTE.container),
  };

  // Ground: a big slab plus a painted grid so movement reads at a glance.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(MAP.halfW * 2 + 2, 0.2, MAP.halfD * 2 + 2),
    new THREE.MeshStandardMaterial({ color: 0x4a4350, roughness: 1 }),
  );
  ground.position.set(0, -0.1, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(MAP.halfW * 2, 23, PALETTE.groundLine, PALETTE.groundLine);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  function addBox(spec, collide) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mats[spec.mat]);
    mesh.position.set(spec.x, spec.h / 2, spec.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) {
      colliders.push({
        minX: spec.x - spec.w / 2, maxX: spec.x + spec.w / 2,
        minZ: spec.z - spec.d / 2, maxZ: spec.z + spec.d / 2,
        top: spec.h,
      });
    }
    return mesh;
  }

  for (const w of MAP.walls) addBox(w, true);
  for (const c of MAP.crates) addBox(c, true);

  // Bomb sites: glowing floor rings + a floating marker pillar.
  const siteMeshes = {};
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const color = key === 'A' ? PALETTE.siteA : PALETTE.siteB;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(site.r - 0.4, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.x, 0.025, site.z);
    scene.add(disc);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 5, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    );
    beam.position.set(site.x, 2.5, site.z);
    scene.add(beam);
    siteMeshes[key] = { ring, disc, beam };
  }

  // Dusk sky: big gradient dome (vertex-coloured sphere, BackSide).
  const skyGeo = new THREE.SphereGeometry(180, 24, 12);
  const skyColors = [];
  const top = new THREE.Color(0x1c1426);
  const horizon = new THREE.Color(0xd96a2e);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 180;
    const c = horizon.clone().lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.15)));
    skyColors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Distant silhouettes: dark boxes on the horizon so the yard feels
  // like part of a city, not a floating room.
  const silMat = new THREE.MeshBasicMaterial({ color: 0x241a2e, fog: false });
  const silhouettes = [
    [-60, -40, 18, 26], [30, -70, 26, 34], [70, -20, 16, 22],
    [-70, 30, 22, 30], [60, 55, 20, 18], [-30, 70, 24, 26],
  ];
  for (const [x, z, w, h] of silhouettes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), silMat);
    m.position.set(x, h / 2 - 1, z);
    scene.add(m);
  }

  // Lighting: warm low sun + cool ambient fill, dusk palette.
  const hemi = new THREE.HemisphereLight(0x9a7aaa, 0x3a2a20, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 2.2);
  sun.position.set(-28, 22, -14);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x5a7a9a, 0.55);
  fill.position.set(20, 14, 24);
  scene.add(fill);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 150);

  return {
    colliders,
    siteMeshes,
    bounds: { halfW: MAP.halfW, halfD: MAP.halfD },

    // Push a circle (x, z, radius) out of every collider it overlaps.
    // Returns nothing; mutates the passed {x, z} object in place.
    resolveCircle(p, radius) {
      for (const c of colliders) {
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * radius;
          p.z = cz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the smallest overlap.
          const pushL = p.x - c.minX + radius;
          const pushR = c.maxX - p.x + radius;
          const pushT = p.z - c.minZ + radius;
          const pushB = c.maxZ - p.z + radius;
          const m = Math.min(pushL, pushR, pushT, pushB);
          if (m === pushL) p.x = c.minX - radius;
          else if (m === pushR) p.x = c.maxX + radius;
          else if (m === pushT) p.z = c.minZ - radius;
          else p.z = c.maxZ + radius;
        }
      }
      p.x = Math.max(-MAP.halfW + radius, Math.min(MAP.halfW - radius, p.x));
      p.z = Math.max(-MAP.halfD + radius, Math.min(MAP.halfD - radius, p.z));
    },

    // True when the segment a->b is not blocked by any collider taller
    // than the segment at the crossing point (low crates don't block
    // a standing sightline, tall walls do).
    lineOfSight(ax, ay, az, bx, by, bz) {
      const dx = bx - ax;
      const dz = bz - az;
      for (const c of colliders) {
        // Slab test in 2D, then check height at the entry point.
        let t0 = 0;
        let t1 = 1;
        let ok = true;
        const axes = [
          [dx, c.minX - ax, c.maxX - ax],
          [dz, c.minZ - az, c.maxZ - az],
        ];
        for (const [d, lo, hi] of axes) {
          if (Math.abs(d) < 1e-9) {
            if (ax < lo || ax > hi) { ok = false; break; }
          } else {
            let ta = lo / d;
            let tb = hi / d;
            if (ta > tb) { const t = ta; ta = tb; tb = t; }
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 > t1) { ok = false; break; }
          }
        }
        if (!ok) continue;
        const tHit = Math.max(0, t0);
        const yAt = ay + (by - ay) * tHit;
        if (yAt < c.top - 0.05) return false;
      }
      return true;
    },

    // Nearest wall hit along a ray, or null. Used for bullet impacts
    // and for grenade bounces. out is a reused object {dist, x, y, z}.
    rayHit(ox, oy, oz, dx, dy, dz, maxDist, out) {
      let best = Infinity;
      let bx = 0;
      let by = 0;
      let bz = 0;
      for (const c of colliders) {
        // 3D slab test against the box (0..top in y).
        let t0 = 0;
        let t1 = maxDist;
        let ok = true;
        const axes = [
          [dx, c.minX - ox, c.maxX - ox],
          [dy, -oy, c.top - oy],
          [dz, c.minZ - oz, c.maxZ - oz],
        ];
        for (const [d, lo, hi] of axes) {
          if (Math.abs(d) < 1e-9) {
            if (0 < lo || 0 > hi) { ok = false; break; }
          } else {
            let ta = lo / d;
            let tb = hi / d;
            if (ta > tb) { const t = ta; ta = tb; tb = t; }
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 > t1) { ok = false; break; }
          }
        }
        if (!ok || t0 >= best) continue;
        best = t0;
        bx = ox + dx * t0;
        by = oy + dy * t0;
        bz = oz + dz * t0;
      }
      // Ground plane.
      if (dy < -1e-9) {
        const t = -oy / dy;
        if (t >= 0 && t < best && t <= maxDist) {
          best = t;
          bx = ox + dx * t;
          by = 0;
          bz = oz + dz * t;
        }
      }
      if (best === Infinity) return null;
      out.dist = best;
      out.x = bx;
      out.y = by;
      out.z = bz;
      return out;
    },
  };
}
