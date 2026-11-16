// map.js — Dustline Yard, an original three-lane map. Vanguard (attackers)
// spawn west and push east down Mid, the north A lane or the south B lane;
// Jackals defend the two sites in the east corners. The palette is desert
// dusk: sand ground, terracotta walls, teal Site A, rust Site B, so the
// scene reads at a glance and the sites are visible from across the yard.
// All textures are drawn on canvases in code — no image assets, no network.
import * as THREE from 'three';
import { makeCollider } from './collision.js';

const YARD = { x0: -32, x1: 32, z0: -22, z1: 22 };

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#c9a06b';
    g.fillRect(0, 0, w, h);
    // Sand speckle.
    for (let i = 0; i < 5200; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(120,84,44,0.25)' : 'rgba(240,214,160,0.25)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Worn lane strips running east-west.
    g.fillStyle = 'rgba(90,60,28,0.16)';
    g.fillRect(0, 150, w, 60);
    g.fillRect(0, 330, w, 60);
    // Paving grid.
    g.strokeStyle = 'rgba(80,54,26,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo((i * w) / 8, 0);
      g.lineTo((i * w) / 8, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * h) / 8);
      g.lineTo(w, (i * h) / 8);
      g.stroke();
    }
  }, 8, 6);
}

function wallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b98d5f';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,58,28,0.18)' : 'rgba(235,200,150,0.18)';
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    // Dark base stripe and teal top trim, the yard's signature.
    g.fillStyle = '#5d4126';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#1f6f6b';
    g.fillRect(0, 0, w, 10);
    g.strokeStyle = 'rgba(60,36,16,0.4)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, 4, 1);
}

function crateTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#7a6a42';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4a3f28';
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, h);
    g.moveTo(w, 0);
    g.lineTo(0, h);
    g.stroke();
    g.fillStyle = 'rgba(240,220,170,0.5)';
    g.font = 'bold 20px sans-serif';
    g.fillText('S-7', 12, 30);
  });
}

function letterTexture(letter, color) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff8e8';
    g.font = 'bold 72px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 64, 68);
  });
}

export function buildMap(scene) {
  const colliders = [];
  const addBox = (x0, z0, x1, z1, h, mat, y0 = 0) => {
    const geo = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    m.castShadow = h > 1.5;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push(makeCollider(x0, z0, x1, z1, h));
    return m;
  };

  // ---- light and sky -------------------------------------------------
  // A vertical gradient sky (pale blue to warm dusk) instead of a flat
  // colour: the horizon reads as a desert evening, not a blank wall.
  scene.background = canvasTexture(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a8c8de');
    grad.addColorStop(0.55, '#e8d3a8');
    grad.addColorStop(1, '#f3d9a4');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xeed9ac, 55, 135);
  const hemi = new THREE.HemisphereLight(0xfff2d0, 0x8a6a44, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.9);
  sun.position.set(30, 42, -24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  // A second, weaker fill from the west so the spawn side is not in shadow.
  const fill = new THREE.DirectionalLight(0xcfd8ff, 0.35);
  fill.position.set(-30, 20, 30);
  scene.add(fill);

  // ---- ground --------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 44),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a3f30, roughness: 0.9 });
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x9a7f52, roughness: 1 });

  // ---- outer walls ---------------------------------------------------
  addBox(YARD.x0 - 1, YARD.z0 - 1, YARD.x0, YARD.z1 + 1, 4.5, wallMat);
  addBox(YARD.x1, YARD.z0 - 1, YARD.x1 + 1, YARD.z1 + 1, 4.5, wallMat);
  addBox(YARD.x0, YARD.z0 - 1, YARD.x1, YARD.z0, 4.5, wallMat);
  addBox(YARD.x0, YARD.z1, YARD.x1, YARD.z1 + 1, 4.5, wallMat);

  // ---- interior: the mid wall with two door gaps, lane dividers ------
  addBox(-0.5, -22, 0.5, -8, 4, wallMat); // mid wall, north half
  addBox(-0.5, 8, 0.5, 22, 4, wallMat); // mid wall, south half
  addBox(-14, -10.5, 6, -9.5, 3.5, wallMat); // A lane / mid divider
  addBox(-6, 9.5, 14, 10.5, 3.5, wallMat); // mid / B lane divider
  addBox(7.5, -22, 8.5, -16, 3.5, wallMat); // A pocket west wall
  addBox(7.5, 16, 8.5, 22, 3.5, wallMat); // B pocket west wall

  // ---- cover crates (the firefight furniture) ------------------------
  const crates = [
    [-2.5, -2.5, 2.5, 2.5, 2.0], // mid block: splits mid into two lanes
    [-25, -7, -23, -5, 1.4], [-25, 5, -23, 7, 1.4], // spawn cover
    [-13, -5, -11, -3, 1.6], [-13, 4, -11, 6, 1.6],
    [3, 5, 5, 7, 1.5],
    [11, -6, 13, -4, 1.8], [11, 2, 13, 4, 1.2],
    [17, -13, 19, -11, 1.5], [17, 11, 19, 13, 1.5],
    [-7, -17, -5, -15, 1.6], [-7, 15, -5, 17, 1.6],
    [21, -7, 23, -5, 1.3], [21, 5, 23, 7, 1.3],
  ];
  for (const [x0, z0, x1, z1, h] of crates) addBox(x0, z0, x1, z1, h, crateMat);

  // ---- sandbag lines guarding each site ------------------------------
  const bags = [
    [19, -11.5, 21, -10.8, 1.0], [25, -11.5, 27, -10.8, 1.0],
    [19, 10.8, 21, 11.5, 1.0], [25, 10.8, 27, 11.5, 1.0],
    [-4, -0.9, -2, -0.2, 1.0], [2, 0.2, 4, 0.9, 1.0],
  ];
  for (const [x0, z0, x1, z1, h] of bags) addBox(x0, z0, x1, z1, h, sandbagMat);

  // ---- barrels -------------------------------------------------------
  const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.15, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a3d22, roughness: 0.7, metalness: 0.25 });
  for (const [x, z] of [[-18, -12], [-18, 12], [14, -8], [14, 8], [28, -20], [28, 20]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 0.58, z);
    b.castShadow = true;
    scene.add(b);
    colliders.push(makeCollider(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 1.15));
  }

  // ---- watchtower over the A lane ------------------------------------
  const postGeo = new THREE.BoxGeometry(0.3, 3.4, 0.3);
  for (const [x, z] of [[-19, -19], [-16, -19], [-19, -16], [-16, -16]]) {
    const p = new THREE.Mesh(postGeo, darkMat);
    p.position.set(x, 1.7, z);
    p.castShadow = true;
    scene.add(p);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 4.2), darkMat);
  deck.position.set(-17.5, 3.5, -17.5);
  deck.castShadow = true;
  scene.add(deck);
  colliders.push(makeCollider(-19.2, -19.2, -15.8, -15.8, 3.4));

  // ---- sites: coloured pads + floating letters -----------------------
  const sites = {
    A: { x: 24, z: -15, color: '#1f8a7a' },
    B: { x: 24, z: 15, color: '#c65a2e' },
  };
  for (const key of ['A', 'B']) {
    const s = sites[key];
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.8 }),
    );
    pad.position.set(s.x, 0.07, s.z);
    pad.receiveShadow = true;
    scene.add(pad);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: letterTexture(key, s.color),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    sign.position.set(s.x, 4.6, s.z);
    scene.add(sign);
    // A striped border so the plant zone reads from the ground too.
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.05, 8.4),
      new THREE.MeshBasicMaterial({ color: 0xfff8e8 }),
    );
    border.position.set(s.x, 0.03, s.z);
    scene.add(border);
  }

  // ---- the bomb prop (hidden until planted) --------------------------
  const bombMesh = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
  );
  bombBody.position.y = 0.15;
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  bombLight.position.set(0.18, 0.34, 0);
  bombMesh.add(bombBody);
  bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);

  // ---- floodlight poles along mid ------------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const [x, z] of [[-10, -7.5], [10, 7.5]]) {
    const pole = new THREE.Mesh(poleGeo, darkMat);
    pole.position.set(x, 2.5, z);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), lampMat);
    lamp.position.set(x, 5.05, z);
    scene.add(lamp);
  }

  return {
    colliders,
    sites,
    bombMesh,
    bounds: YARD,
    spawns: {
      vanguard: [
        [-28, 0], [-28, -3], [-28, 3], [-26, -6], [-26, 6],
      ],
      jackals: [
        [26, -14], [26, -10], [26, 14], [26, 10], [20, 0],
      ],
    },
    routes: {
      attackMid: [[-28, 0], [-14, 0], [-6, -4], [6, -4], [14, 0], [20, -6], [24, -12]],
      attackA: [[-28, 0], [-22, -8], [-12, -14], [0, -15], [12, -15], [20, -15]],
      attackB: [[-28, 0], [-22, 8], [-14, 13], [-6, 15], [6, 15], [14, 15], [20, 15]],
      holdA: [[22, -13], [26, -17], [18, -12]],
      holdB: [[22, 13], [26, 17], [18, 12]],
      holdMid: [[8, 2], [10, 4], [-2, -6]],
    },
  };
}
