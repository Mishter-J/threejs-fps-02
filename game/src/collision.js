// collision.js — 2D AABB collision and line-of-sight for the map.
//
// The map is a flat yard: every solid is an axis-aligned box with a
// footprint (minX, maxX, minZ, maxZ) and a height. Movement collides in 2D
// (a circle against boxes); sight and bullets test the same boxes with a
// minimum height, so low crates block movement but not a standing sightline.

/** Circle (x, z, radius) pushed out of every box it overlaps. Returns true when a push happened. */
export function collideCircle(pos, radius, boxes) {
  let hit = false;
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.minX + radius;
      const pr = b.maxX - pos.x + radius;
      const pt = pos.z - b.minZ + radius;
      const pb = b.maxZ - pos.z + radius;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pt) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return hit;
}

/** Move a circle by (dx, dz) with collision, axis by axis so it slides along walls. */
export function moveCircle(pos, dx, dz, radius, boxes) {
  pos.x += dx;
  collideCircle(pos, radius, boxes);
  pos.z += dz;
  collideCircle(pos, radius, boxes);
}

/** Does the segment (x1,z1)-(x2,z2) cross any box taller than minHeight? */
export function segmentBlocked(x1, z1, x2, z2, boxes, minHeight = 1.4) {
  for (const b of boxes) {
    if (b.height <= minHeight) continue;
    if (segmentHitsBox(x1, z1, x2, z2, b)) return true;
  }
  return false;
}

// Slab test for a 2D segment against one AABB.
export function segmentHitsBox(x1, z1, x2, z2, b) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.minX || x1 > b.maxX) return false;
  } else {
    let t1 = (b.minX - x1) / dx;
    let t2 = (b.maxX - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < b.minZ || z1 > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - z1) / dz;
    let t2 = (b.maxZ - z1) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Distance from a point to the nearest box edge, for grenade bounces. */
export function insideBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}
