// player.js — the first-person controller: acceleration-based
// movement with friction, crouching, wall collision through the
// world's circle resolver, and health/armor. No rendering here
// except the camera transform the caller reads back.

import * as THREE from 'three';
import { PLAYER } from './config.js';

export function createPlayer(world, spawn) {
  return {
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: spawn.x < 0 ? -Math.PI / 2 : Math.PI / 2, // face the enemy spawn
    pitch: 0,
    crouched: false,
    eyeHeight: PLAYER.eyeStand,
    health: PLAYER.health,
    armor: 0,
    alive: true,
    speed: 0,
    stepTimer: 0,

    eye() {
      return { x: this.pos.x, y: this.eyeHeight, z: this.pos.z };
    },
    forward() {
      return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    },
    right() {
      return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    },

    // dt fixed step. input: {f, b, l, r, crouch}. Returns distance
    // walked this step (for footstep sounds).
    update(dt, input, world) {
      if (!this.alive) return 0;
      this.crouched = !!input.crouch;
      const targetHeight = this.crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
      const eyeTarget = this.crouched ? PLAYER.eyeCrouch : PLAYER.eyeStand;
      this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, dt * 12);

      const maxSpeed = this.crouched ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
      const fwd = this.forward();
      const rgt = this.right();
      const wish = new THREE.Vector3();
      if (input.f) wish.add(fwd);
      if (input.b) wish.sub(fwd);
      if (input.r) wish.add(rgt);
      if (input.l) wish.sub(rgt);
      if (wish.lengthSq() > 0) wish.normalize();

      // Accelerate toward the wish direction, friction when idle.
      this.vel.x += wish.x * PLAYER.accel * dt;
      this.vel.z += wish.z * PLAYER.accel * dt;
      const damp = Math.exp(-PLAYER.friction * dt);
      if (wish.lengthSq() === 0) {
        this.vel.x *= damp;
        this.vel.z *= damp;
      }
      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (hSpeed > maxSpeed) {
        this.vel.x *= maxSpeed / hSpeed;
        this.vel.z *= maxSpeed / hSpeed;
      }
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const p = { x: this.pos.x, z: this.pos.z };
      world.resolveCircle(p, PLAYER.radius);
      this.pos.x = p.x;
      this.pos.z = p.z;
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      return this.speed * dt;
    },

    // Damage with armor absorption. Returns actual health lost.
    damage(amount) {
      if (!this.alive) return 0;
      let remaining = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, amount * 0.5);
        this.armor -= absorbed;
        remaining = amount - absorbed;
      }
      this.health -= remaining;
      if (this.health <= 0) {
        this.health = 0;
        this.alive = false;
      }
      return remaining;
    },

    reset(spawn) {
      this.pos.set(spawn.x, 0, spawn.z);
      this.vel.set(0, 0, 0);
      this.yaw = spawn.x < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.pitch = 0;
      this.health = PLAYER.health;
      this.armor = 0;
      this.alive = true;
      this.crouched = false;
      this.eyeHeight = PLAYER.eyeStand;
      this.speed = 0;
    },
  };
}
