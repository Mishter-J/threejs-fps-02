// input.js — keyboard + mouse state, pointer lock, and the action
// queue the simulation consumes once per fixed step. Mouse deltas
// accumulate between steps so no look input is lost at low frame
// rates. Pointer lock is best-effort: if the browser refuses it
// (headless screenshots), look still works from raw mouse movement.

export function createInput(canvas) {
  const keys = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let firing = false;
  let locked = false;
  let lockFailed = false;
  const pressed = new Set(); // edge-triggered keys, consumed by sim
  const codeMap = {
    KeyW: 'f', ArrowUp: 'f',
    KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l',
    KeyD: 'r', ArrowRight: 'r',
    ControlLeft: 'crouch', KeyC: 'crouch', ShiftLeft: 'crouch',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button === 0) firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }
  function onLockError() {
    lockFailed = true;
    locked = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);

  return {
    get locked() {
      return locked;
    },
    get lockFailed() {
      return lockFailed;
    },
    requestLock() {
      if (locked || lockFailed) return;
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { lockFailed = true; });
      } catch (e) {
        lockFailed = true;
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Movement state for this step.
    moveState() {
      const out = { f: false, b: false, l: false, r: false, crouch: false };
      for (const code of keys) {
        const m = codeMap[code];
        if (m) out[m] = true;
      }
      return out;
    },
    // Accumulated look delta since the last call (radians pre-scaled
    // by the caller with sensitivity).
    consumeLook() {
      const d = { dx: lookDX, dy: lookDY };
      lookDX = 0;
      lookDY = 0;
      return d;
    },
    get firing() {
      return firing;
    },
    // True once per physical key press, until consumed.
    wasPressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    consumePressed(code) {
      return this.wasPressed(code);
    },
    clearPressed() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
    },
  };
}
