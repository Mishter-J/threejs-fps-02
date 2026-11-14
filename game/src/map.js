// map.js — Dustline Yard, the original map for Sandline Protocol.
//
// A desert freight yard, 44 x 36 m, with three lanes (north, mid, south),
// two bomb sites and long sightlines. All solids are AABBs in WALLS, which
// collision.js and the bots' line-of-sight tests read; buildMap turns the
// same data into three.js meshes, so the visible map and the played map
// can never drift apart.

import * as THREE from 'three';

// { minX, maxX, minZ, maxZ, height, mat } — mat picks a palette material.
export const WALLS = [
  // Outer walls.
  { minX: -23, maxX: 23, minZ: -19, maxZ: -18, height: 3.4, mat: 'wall' },
  { minX: -23, maxX: 23, minZ: 18, maxZ: 19, height: 3.4, mat: 'wall' },
  { minX: -23, maxX: -22, minZ: -18, maxZ: 18, height: 3.4, mat: 'wall' },
  { minX: 22, maxX: 23, minZ: -18, maxZ: 18, height: 3.4, mat: 'wall' },
  // Site A enclosure (north-west): entry from the east and the south.
  { minX: -22, maxX: -13, minZ: -13.5, maxZ: -12.5, height: 3, mat: 'wall' },
  { minX: -14.5, maxX: -13.5, minZ: -12.5, maxZ: -5, height: 3, mat: 'wall' },
  // Mid structures.
  { minX: -6, maxX: -1, minZ: -6, maxZ: -5, height: 3, mat: 'concrete' },
  { minX: 1, maxX: 6, minZ: 5, maxZ: 6, height: 3, mat: 'concrete' },
  { minX: -1, maxX: 1, minZ: -1, maxZ: 1, height: 3, mat: 'concrete' },
  { minX: -2, maxX: 2, minZ: -14, maxZ: -13, height: 2.6, mat: 'concrete' },
  { minX: 6, maxX: 7, minZ: -14, maxZ: -6, height: 3, mat: 'wall' },
  { minX: -7, maxX: -6, minZ: 8, maxZ: 14, height: 3, mat: 'wall' },
  // Site B enclosure (south-east): entry from the west and the south.
  { minX: 13, maxX: 22, minZ: 11, maxZ: 12.5, height: 3, mat: 'wall' },
  { minX: 13, maxX: 14, minZ: 4, maxZ: 8, height: 3, mat: 'wall' },
  // Freight containers (tall cover).
  { minX: -21, maxX: -18.5, minZ: 0, maxZ: 3, height: 2.6, mat: 'teal' },
  { minX: 19, maxX: 21.5, minZ: -2, maxZ: 1, height: 2.6, mat: 'rust' },
  // Silo bases at Site B.
  { minX: 18.5, maxX: 20.5, minZ: 14, maxZ: 16, height: 4, mat: 'metal' },
  { minX: 19, maxX: 21, minZ: 8, maxZ: 10, height: 4, mat: 'metal' },
  // Crates: low cover — they block movement, not a standing sightline.
  { minX: -9, maxX: -7, minZ: -9, maxZ: -7, height: 1.1, mat: 'crate' },
  { minX: 7, maxX: 9, minZ: 7, maxZ: 9, height: 1.1, mat: 'crate' },
  { minX: -17, maxX: -15, minZ: 3, maxZ: 5, height: 1.1, mat: 'crate' },
  { minX: 11, maxX: 13, minZ: -9, maxZ: -7, height: 1.1, mat: 'crate' },
  { minX: 1, maxX: 3, minZ: 11, maxZ: 13, height: 1.1, mat: 'crate' },
  { minX: -5, maxX: -3, minZ: -13, maxZ: -11, height: 1.1, mat: 'crate' },
  { minX: 13, maxX: 15, minZ: 1, maxZ: 3, height: 1.1, mat: 'crate' },
  { minX: -3, maxX: -1, minZ: 13, maxZ: 15, height: 1.1, mat: 'crate' },
];

export const SITES = [
  { id: 'A', x: -16, z: -12, r: 4.5 },
  { id: 'B', x: 16, z: 12, r: 4.5 },
];

export const ATK_SPAWN = [
  { x: -18, z: 14, yaw: Math.PI / 2 },
  { x: -19.5, z: 12.5, yaw: Math.PI / 2 },
  { x: -16.5, z: 15.5, yaw: Math.PI / 2 },
  { x: -20, z: 16, yaw: Math.PI / 2 },
];

export const DEF_SPAWN = [
  { x: 18, z: -14, yaw: -Math.PI / 2 },
  { x: 16.5, z: -12.5, yaw: -Math.PI / 2 },
  { x: 19.5, z: -15.5, yaw: -Math.PI / 2 },
  { x: 16, z: -15.5, yaw: -Math.PI / 2 },
  { x: 20, z: -12, yaw: -Math.PI / 2 },
];

// Waypoint graph the bots walk: node {x, z}, edges by index.
export const WAYPOINTS = [
  { x: -18, z: 14 }, { x: -18, z: 4 }, { x: -18, z: -6 }, { x: -16, z: -12 },
  { x: -10, z: -12 }, { x: -10, z: -16 }, { x: 0, z: -16 }, { x: 10, z: -16 },
  { x: 18, z: -14 }, { x: 18, z: -6 }, { x: 10, z: -6 }, { x: 0, z: 0 },
  { x: -10, z: 0 }, { x: -10, z: 6 }, { x: 0, z: 10 }, { x: 10, z: 12 },
  { x: 16, z: 12 }, { x: 18, z: 6 }, { x: -14, z: 10 },
];
export const WAY_EDGES = [
  [0, 1], [0, 18], [1, 2], [1, 12], [2, 3], [3, 4], [4, 5], [4, 12],
  [5, 6], [5, 12], [6, 7], [6, 11], [7, 8], [7, 10], [8, 9], [9, 10],
  [9, 17], [10, 11], [10, 15], [11, 12], [12, 13], [13, 14], [13, 18],
  [14, 15], [15, 16], [16, 17], [18, 1],
];

/** The site whose circle (x, z) stands in, or null. */
export function siteAt(x, z) {
  for (const s of SITES) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return s;
  }
  return null;
}

/** Index of the waypoint nearest (x, z). */
export function nearestWaypoint(x, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x;
    const dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- visuals

const PALETTE = {
  wall: 0xa08c66, concrete: 0x8d8271, teal: 0x2f6f6a, rust: 0xb65c2e,
  metal: 0x9aa0a3, crate: 0xb08d55, ground: 0xb59a68, dark: 0x4a3f30,
};

/** Procedural sand: a canvas texture, so the game ships no image assets. */
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b59a68';
  g.fillRect(0, 0, 512, 512);
  // Speckles.
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${v}, ${v - 25}, ${v - 70}, 0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // Faint paving grid.
  g.strokeStyle = 'rgba(90, 70, 45, 0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A site marker: a letter in a ring, drawn on a transparent canvas. */
function siteTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Build the whole visible map into `scene`. Returns the meshes bullets
 * raycast against (walls, containers, silos) and the site marker meshes.
 */
export function buildMap(scene) {
  const materials = {};
  for (const [name, color] of Object.entries(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: name === 'metal' ? 0.55 : 0.05 });
  }
  const trim = new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.85 });

  // Sky, fog and sun.
  scene.background = new THREE.Color(0xe6d3a3);
  scene.fog = new THREE.Fog(0xe6d3a3, 42, 95);
  const hemi = new THREE.HemisphereLight(0xfff2d0, 0xa8906a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b8, 2.4);
  sun.position.set(18, 30, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 38),
    new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Walls, containers, silos and crates from the same WALLS data the
  // simulation collides with.
  const wallMeshes = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const m = new THREE.Mesh(boxGeo, materials[w.mat] ?? materials.wall);
    m.scale.set(w.maxX - w.minX, w.height, w.maxZ - w.minZ);
    m.position.set((w.minX + w.maxX) / 2, w.height / 2, (w.minZ + w.maxZ) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    wallMeshes.push(m);
    // A dark cap line on tall walls so edges read at a glance.
    if (w.height >= 2.6) {
      const cap = new THREE.Mesh(boxGeo, trim);
      cap.scale.set(w.maxX - w.minX + 0.06, 0.12, w.maxZ - w.minZ + 0.06);
      cap.position.set(m.position.x, w.height - 0.06, m.position.z);
      scene.add(cap);
    }
  }

  // Silo drums on the B silo bases.
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x7d8487, roughness: 0.45, metalness: 0.7 });
  for (const [x, z] of [[19.5, 15], [20, 9]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5.2, 20), drumMat);
    drum.position.set(x, 2.6, z);
    drum.castShadow = true;
    scene.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), drumMat);
    dome.position.set(x, 5.2, z);
    scene.add(dome);
  }

  // Site markers painted on the ground.
  const siteMeshes = [];
  for (const s of SITES) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 5.4),
      new THREE.MeshBasicMaterial({ map: siteTexture(s.id, s.id === 'A' ? '#c23b2e' : '#1f6f8b'), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(s.x, 0.03, s.z);
    scene.add(mark);
    siteMeshes.push(mark);
  }

  // Distant dunes outside the walls, so the horizon is not flat colour.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xc9a86b, roughness: 1 });
  for (const [x, z, w, h] of [[-30, 0, 14, 5], [30, -8, 16, 7], [0, -30, 20, 6], [8, 30, 18, 5], [-28, 26, 12, 4]]) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), duneMat);
    dune.scale.set(w, h, w * 0.7);
    dune.position.set(x, -0.5, z);
    scene.add(dune);
  }
  return { wallMeshes, siteMeshes };
}
