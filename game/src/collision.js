// collision.js — pure geometry, no rendering. Walls, crates and props are
// axis-aligned boxes on the ground plane; everything that moves is a circle
// of a fixed radius. Two queries, both allocation-free in the hot path:
//   moveCircle — slide a circle along the boxes, axis by axis.
//   segmentBlocked — 3D line-of-sight test against the boxes (slab method).
// Module-level scratch vectors are reused so the per-frame tests allocate
// nothing at all.

export function makeCollider(x0, z0, x1, z1, height) {
  return { x0, z0, x1, z1, h: height };
}

// Keep a circle inside the yard. Walls normally do this, but a detour or a
// slide can push a mover onto a wall's outer face; the clamp is the last
// line of defence so no bot or player ever leaves the map.
export function clampBounds(pos, r, b) {
  if (pos.x < b.x0 + r) pos.x = b.x0 + r;
  if (pos.x > b.x1 - r) pos.x = b.x1 - r;
  if (pos.z < b.z0 + r) pos.z = b.z0 + r;
  if (pos.z > b.z1 - r) pos.z = b.z1 - r;
}

// Move a circle (pos.x/z, radius r) by (dx, dz) without entering any box.
// Returns nothing; pos is corrected in place. Axis-separated motion gives
// natural sliding along walls instead of sticking in corners.
export function moveCircle(pos, r, dx, dz, boxes) {
  pos.x += dx;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (pos.x + r > b.x0 && pos.x - r < b.x1 && pos.z + r > b.z0 && pos.z - r < b.z1) {
      if (dx > 0) pos.x = b.x0 - r;
      else if (dx < 0) pos.x = b.x1 + r;
    }
  }
  pos.z += dz;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (pos.x + r > b.x0 && pos.x - r < b.x1 && pos.z + r > b.z0 && pos.z - r < b.z1) {
      if (dz > 0) pos.z = b.z0 - r;
      else if (dz < 0) pos.z = b.z1 + r;
    }
  }
}

// Is the point inside any box (with a margin)? Used for spawn safety checks.
export function insideAny(x, z, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
  }
  return false;
}

// True when the segment from eye (ax, ay, az) to (bx, by, bz) is blocked by
// any box. A box blocks only where its top is above the segment at the
// crossing point, so low crates block crouched sightlines but not standing
// ones, and shots over a crate can still land.
export function segmentBlocked(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const sx = slabT(ax, dx, b.x0, b.x1);
    if (sx === null) continue;
    const sz = slabT(az, dz, b.z0, b.z1);
    if (sz === null) continue;
    const lo = Math.max(sx[0], sz[0], 0);
    const hi = Math.min(sx[1], sz[1], 1);
    if (lo > hi) continue;
    // The segment crosses the box footprint between lo and hi; it is
    // blocked if the segment is below the box top anywhere in that span.
    const yLo = ay + dy * lo;
    const yHi = ay + dy * hi;
    if (Math.min(yLo, yHi) < b.h) return true;
  }
  return false;
}

// Slab interval for one axis; null when the segment never enters the slab.
function slabT(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) {
    if (o < lo || o > hi) return null;
    return [0, 1];
  }
  let a = (lo - o) / d;
  let c = (hi - o) / d;
  if (a > c) {
    const t = a;
    a = c;
    c = t;
  }
  return [a, c];
}

// Ray against one box, for bullet wall hits. Returns the distance along the
// ray (dir must be normalised) or Infinity when it misses.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  const sx = slabT(ox, dx, b.x0, b.x1);
  if (sx === null) return Infinity;
  const sz = slabT(oz, dz, b.z0, b.z1);
  if (sz === null) return Infinity;
  const sy = slabT(oy, dy, 0, b.h);
  if (sy === null) return Infinity;
  const lo = Math.max(sx[0], sz[0], sy[0], 0);
  const hi = Math.min(sx[1], sz[1], sy[1], maxDist);
  return lo <= hi ? lo : Infinity;
}

// Nearest wall distance along a ray, over all boxes.
export function rayWalls(ox, oy, oz, dx, dy, dz, boxes, maxDist) {
  let best = maxDist;
  for (let i = 0; i < boxes.length; i++) {
    const d = rayBox(ox, oy, oz, dx, dy, dz, boxes[i], best);
    if (d < best) best = d;
  }
  return best;
}
