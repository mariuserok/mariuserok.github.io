/* ═══════════════════════════════════════════════════════════
   VOIDRUNNER — third-person space shooter.

   One WebGL2 context, four draw programs, no libraries.
   The world is infinite and generated on the fly; nothing here
   talks to a server.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SG = window.SG;
  var M = SG.M,
    GL = SG.GL,
    M4 = M.mat4;

  var canvas = document.getElementById("scene");
  var gl = GL.context(canvas);
  var fatal = document.getElementById("fatal");
  if (!gl) {
    if (fatal) fatal.hidden = false;
    return;
  }

  /* ═══ Shaders ═════════════════════════════════════════════ */

  // Shared so that fog on the ground and on the models resolves to
  // exactly the sky behind them.
  var SKY_FN = `
vec3 skyColor(vec3 d){
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 lo = vec3(0.050, 0.058, 0.098);
  vec3 md = vec3(0.052, 0.040, 0.110);
  vec3 hi = vec3(0.012, 0.016, 0.038);
  vec3 c = mix(lo, md, smoothstep(0.34, 0.56, h));
  c = mix(c, hi, smoothstep(0.52, 0.98, h));
  c += vec3(0.05, 0.17, 0.25) * exp(-abs(d.y) * 8.0) * 0.55;
  return c;
}`;

  var NOISE_FN = `
float h31(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x),
                 mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x),
                 mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

  var skyProg = GL.program(
    gl,
    `#version 300 es
    uniform vec3 uRight, uUp, uFwd;
    uniform vec2 uTanHalf;
    out vec3 vRay;
    void main(){
      // Fullscreen triangle from gl_VertexID — no vertex buffer needed.
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
      vRay = uFwd + uRight * (p.x * uTanHalf.x) + uUp * (p.y * uTanHalf.y);
      gl_Position = vec4(p, 1.0, 1.0);
    }`,
    `#version 300 es
    precision highp float;
    in vec3 vRay;
    uniform float uTime;
    out vec4 frag;
    ${SKY_FN}
    ${NOISE_FN}
    void main(){
      vec3 d = normalize(vRay);
      vec3 col = skyColor(d);

      // Nebula and stars only exist above the horizon. The ground's fog
      // resolves to skyColor() alone, so anything extra down here shows
      // up as a hard seam where the ground quad runs out.
      float sky = smoothstep(0.0, 0.14, d.y);
      if (sky > 0.0){
        float n = vnoise(d * 3.0 + 11.0) * 0.6 + vnoise(d * 7.0) * 0.4;
        n = smoothstep(0.45, 0.95, n);
        col += mix(vec3(0.16, 0.05, 0.30), vec3(0.02, 0.16, 0.26), d.y * 0.5 + 0.5) * n * 0.5 * sky;

        // Two star layers at different densities.
        for (int L = 0; L < 2; L++){
          float sc = L == 0 ? 190.0 : 420.0;
          vec3 g = d * sc;
          vec3 id = floor(g);
          vec3 f = fract(g) - 0.5;
          float r = h31(id + float(L) * 37.0);
          if (r > 0.976){
            vec3 off = vec3(h31(id + 3.0), h31(id + 7.0), h31(id + 13.0)) - 0.5;
            float dd = length(f - off * 0.6);
            float tw = 0.75 + 0.25 * sin(uTime * 2.0 + r * 90.0);
            float b = smoothstep(0.16, 0.0, dd) * tw * (L == 0 ? 1.0 : 0.55);
            col += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h31(id + 21.0)) * b * sky;
          }
        }
      }
      frag = vec4(col, 1.0);
    }`,
    ["uRight", "uUp", "uFwd", "uTanHalf", "uTime"],
  );

  var groundProg = GL.program(
    gl,
    `#version 300 es
    layout(location = 0) in vec3 aPos;
    uniform mat4 uVP;
    uniform vec2 uCenter;
    uniform float uSize;
    out vec3 vWorld;
    void main(){
      vWorld = vec3(aPos.x * uSize + uCenter.x, 0.0, aPos.z * uSize + uCenter.y);
      gl_Position = uVP * vec4(vWorld, 1.0);
    }`,
    `#version 300 es
    precision highp float;
    in vec3 vWorld;
    uniform vec3 uCam;
    uniform float uFog;
    out vec4 frag;
    ${SKY_FN}
    void main(){
      vec3 v = vWorld - uCam;
      float dist = length(v);
      vec3 dir = v / dist;

      vec2 c1 = vWorld.xz / 60.0;
      vec2 g1 = abs(fract(c1 - 0.5) - 0.5) / fwidth(c1);
      float l1 = (1.0 - min(min(g1.x, g1.y), 1.0)) * (1.0 - smoothstep(300.0, 1800.0, dist));

      vec2 c2 = vWorld.xz / 600.0;
      vec2 g2 = abs(fract(c2 - 0.5) - 0.5) / fwidth(c2);
      float l2 = 1.0 - min(min(g2.x, g2.y), 1.0);

      vec3 col = vec3(0.028, 0.034, 0.058);
      col += vec3(0.05, 0.24, 0.32) * l1 * 0.45;
      col += vec3(0.34, 0.15, 0.58) * l2 * 0.75;

      float fog = clamp(1.0 - exp(-dist * uFog), 0.0, 1.0);
      col = mix(col, skyColor(dir), fog);
      frag = vec4(col, 1.0);
    }`,
    ["uVP", "uCenter", "uSize", "uCam", "uFog"],
  );

  var meshProg = GL.program(
    gl,
    `#version 300 es
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec3 aNormal;
    layout(location = 2) in vec4 aIPosScale;
    layout(location = 3) in vec4 aIQuat;
    layout(location = 4) in vec4 aITint;
    layout(location = 5) in vec4 aColor;
    uniform mat4 uVP;
    out vec3 vWorld;
    out vec3 vNormal;
    out vec4 vColor;
    out vec4 vTint;
    vec3 qrot(vec4 q, vec3 v){
      return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
    }
    void main(){
      vec3 p = qrot(aIQuat, aPos * aIPosScale.w) + aIPosScale.xyz;
      vWorld = p;
      vNormal = qrot(aIQuat, aNormal);
      vColor = aColor;
      vTint = aITint;
      gl_Position = uVP * vec4(p, 1.0);
    }`,
    `#version 300 es
    precision highp float;
    in vec3 vWorld;
    in vec3 vNormal;
    in vec4 vColor;
    in vec4 vTint;
    uniform vec3 uCam;
    uniform vec3 uLightDir;
    uniform float uFog;
    uniform int uMode;      // 0 = lit surface, 1 = additive glow
    out vec4 frag;
    ${SKY_FN}
    void main(){
      vec3 albedo = vColor.rgb * vTint.rgb;
      float emissive = vColor.a * vTint.a;

      if (uMode == 1){
        frag = vec4(albedo * emissive, 1.0);
        return;
      }

      vec3 n = normalize(vNormal);
      vec3 v = vWorld - uCam;
      float dist = length(v);
      vec3 dir = v / dist;

      float key = max(dot(n, uLightDir), 0.0);
      float fill = max(dot(n, -uLightDir), 0.0) * 0.35;
      float sky = n.y * 0.5 + 0.5;

      vec3 col = albedo * (0.14 + 0.12 * sky);
      col += albedo * vec3(1.0, 0.96, 0.88) * key;
      col += albedo * vec3(0.12, 0.16, 0.34) * fill;

      float rim = pow(1.0 - max(dot(n, -dir), 0.0), 3.0);
      col += vec3(0.13, 0.55, 0.72) * rim * 0.7;
      col += albedo * emissive * 2.4;

      float fog = clamp(1.0 - exp(-dist * uFog), 0.0, 1.0);
      col = mix(col, skyColor(dir), fog);
      frag = vec4(col, 1.0);
    }`,
    ["uVP", "uCam", "uLightDir", "uFog", "uMode"],
  );

  /* ═══ Geometry ════════════════════════════════════════════ */

  var Meshes = SG.Meshes;
  var emptyVAO = gl.createVertexArray();

  function inst(geo, max) {
    return GL.instanced(gl, GL.mesh(gl, geo), max);
  }

  var mShip = inst(Meshes.ship(), 1);
  var mDrone = inst(Meshes.drone(), 64);
  var mBolt = inst(Meshes.bolt(), 512);
  var mShard = inst(Meshes.shard(), 900);
  var mRocks = [];
  for (var i = 0; i < SG.World.ROCK_VARIANTS; i++) {
    mRocks.push(inst(Meshes.rock(1000 + i * 77), 420));
  }
  var mSpires = [];
  for (i = 0; i < SG.World.SPIRE_VARIANTS; i++) {
    mSpires.push(inst(Meshes.spire(500 + i * 31), 220));
  }

  // Ground: a unit quad the shader scales and re-centres on the ship.
  var groundVAO = gl.createVertexArray();
  gl.bindVertexArray(groundVAO);
  var gb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gb);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1,
    ]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(GL.LOC.POS);
  gl.vertexAttribPointer(GL.LOC.POS, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* ═══ Tunables ════════════════════════════════════════════ */

  var CFG = {
    cruise: 210,
    boost: 430,
    accel: 1.6,
    sens: 0.0045,
    center: 1.1,
    pitchRate: 1.35,
    yawRate: 1.05,
    rollRate: 2.6,
    turnSharp: 7.0,
    bank: 0.8,
    bankGain: 3.2,
    minY: 9,
    maxY: 1100,
    boltSpeed: 1150,
    boltLife: 1.9,
    fireGap: 0.1,
    enemyWant: 5,
    enemyRange: 1500,
    enemyStandoff: 260,
    enemySpeed: 175,
    enemyBolt: 520,
    drawDist: 3400,
    fog: 0.00055,
    far: 12000,
  };

  /* ═══ State ═══════════════════════════════════════════════ */

  var ship = {
    pos: M.v3(0, 140, 0),
    q: M.quat(),
    vel: M.v3(),
    speed: 0,
    throttle: 0.55,
    shield: 100,
    alive: true,
    hurtAt: -99,
    bumpAt: -99,
    pitchV: 0,
    yawV: 0,
    rollV: 0,
    fireTimer: 0,
    gun: 0,
    shake: 0,
  };

  var cam = {
    pos: M.v3(0, 150, 30),
    q: M.quat(),
    fov: 1.08,
    basis: { right: M.v3(), up: M.v3(), fwd: M.v3() },
  };

  var world = SG.World.create();

  function pool(n, make) {
    var a = new Array(n);
    for (var k = 0; k < n; k++) a[k] = make();
    return { a: a, n: n };
  }
  var bolts = pool(512, function () {
    return {
      on: false,
      pos: M.v3(),
      vel: M.v3(),
      q: M.quat(),
      life: 0,
      foe: false,
    };
  });
  var drones = pool(48, function () {
    return {
      on: false,
      pos: M.v3(),
      vel: M.v3(),
      q: M.quat(),
      hp: 0,
      fire: 0,
      phase: 0,
    };
  });
  var shards = pool(900, function () {
    return {
      on: false,
      pos: M.v3(),
      vel: M.v3(),
      q: M.quat(),
      spin: M.v3(),
      life: 0,
      max: 1,
      size: 1,
      col: M.v3(1, 1, 1),
    };
  });

  var game = {
    score: 0,
    kills: 0,
    best: 0,
    running: false,
    over: false,
    time: 0,
    fps: 60,
  };

  /* ═══ Scratch ═════════════════════════════════════════════ */
  var tmpA = M.v3(),
    tmpB = M.v3(),
    tmpC = M.v3(),
    fwd = M.v3(),
    up = M.v3(),
    right = M.v3(),
    camTarget = M.v3(),
    camOff = M.v3(),
    camLook = M.v3(),
    dq = M.quat(),
    tq = M.quat(),
    FORWARD = M.v3(0, 0, -1),
    UP = M.v3(0, 1, 0),
    RIGHT = M.v3(1, 0, 0);
  var proj = M4(),
    view = M4(),
    vp = M4();
  var lightDir = M.v3();
  M.v3norm(lightDir, M.v3set(M.v3(), 0.45, 0.72, 0.35));

  /* ═══ Input ═══════════════════════════════════════════════ */

  var keys = Object.create(null);
  var mouse = { dx: 0, dy: 0, aimX: 0, aimY: 0, fire: false, locked: false };

  var CODES = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    ShiftLeft: "boost",
    ShiftRight: "boost",
    Space: "fire",
    KeyQ: "rollL",
    KeyE: "rollR",
  };

  window.addEventListener("keydown", function (e) {
    if (e.code === "Escape") return;
    var k = CODES[e.code];
    if (k) {
      keys[k] = true;
      e.preventDefault();
    }
    if (e.code === "KeyP") togglePause();
    if (e.code === "KeyR" && game.over) restart();
  });
  window.addEventListener("keyup", function (e) {
    var k = CODES[e.code];
    if (k) {
      keys[k] = false;
      e.preventDefault();
    }
  });

  canvas.addEventListener("mousedown", function (e) {
    if (e.button === 0) mouse.fire = true;
  });
  window.addEventListener("mouseup", function (e) {
    if (e.button === 0) mouse.fire = false;
  });
  window.addEventListener("mousemove", function (e) {
    if (!mouse.locked) return;
    // Clamped so a flick of the wrist cannot spin the ship.
    mouse.dx += M.clamp(e.movementX, -90, 90);
    mouse.dy += M.clamp(e.movementY, -90, 90);
  });

  document.addEventListener("pointerlockchange", function () {
    mouse.locked = document.pointerLockElement === canvas;
    if (!mouse.locked && game.running) togglePause(true);
  });

  /* ═══ Spawning ════════════════════════════════════════════ */

  function spawnDrone() {
    for (var k = 0; k < drones.n; k++) {
      var d = drones.a[k];
      if (d.on) continue;
      var a = Math.random() * M.TAU;
      var r = 900 + Math.random() * 500;
      M.v3set(
        d.pos,
        ship.pos[0] + Math.cos(a) * r,
        M.clamp(ship.pos[1] + (Math.random() - 0.5) * 260, 60, 700),
        ship.pos[2] + Math.sin(a) * r,
      );
      M.v3set(d.vel, 0, 0, 0);
      M.qIdentity(d.q);
      d.hp = 3;
      d.fire = 0.6 + Math.random() * 1.2;
      d.phase = Math.random() * M.TAU;
      d.on = true;
      return d;
    }
    return null;
  }

  function spawnBolt(pos, dir, speed, foe) {
    for (var k = 0; k < bolts.n; k++) {
      var b = bolts.a[k];
      if (b.on) continue;
      M.v3copy(b.pos, pos);
      M.v3scale(b.vel, dir, speed);
      M.qBetween(b.q, FORWARD, dir);
      b.life = CFG.boltLife;
      b.foe = !!foe;
      b.on = true;
      return b;
    }
    return null;
  }

  function burst(pos, count, spread, r, g, bl, size) {
    for (var k = 0, made = 0; k < shards.n && made < count; k++) {
      var s = shards.a[k];
      if (s.on) continue;
      M.v3copy(s.pos, pos);
      M.v3set(
        s.vel,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      );
      M.qAxisAngle(s.q, 0, 1, 0, Math.random() * M.TAU);
      M.v3set(
        s.spin,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      );
      s.max = s.life = 0.35 + Math.random() * 0.7;
      s.size = size * (0.5 + Math.random());
      M.v3set(s.col, r, g, bl);
      s.on = true;
      made++;
    }
  }

  /* ═══ Update ══════════════════════════════════════════════ */

  function updateShip(dt) {
    // The mouse drives a virtual stick rather than the turn rate directly:
    // deflection accumulates from movement and self-centres when you stop.
    // Rate-per-delta steering feels twitchy and frame-rate dependent.
    mouse.aimX = M.clamp(mouse.aimX + mouse.dx * CFG.sens, -1, 1);
    mouse.aimY = M.clamp(mouse.aimY + mouse.dy * CFG.sens, -1, 1);
    mouse.dx = 0;
    mouse.dy = 0;
    mouse.aimX = M.damp(mouse.aimX, 0, CFG.center, dt);
    mouse.aimY = M.damp(mouse.aimY, 0, CFG.center, dt);

    var yawT = -mouse.aimX * CFG.yawRate;
    var pitchT = -mouse.aimY * CFG.pitchRate;
    var rollT = 0;
    var manualRoll = false;
    if (keys.left || keys.rollL) {
      rollT += CFG.rollRate;
      manualRoll = true;
    }
    if (keys.right || keys.rollR) {
      rollT -= CFG.rollRate;
      manualRoll = true;
    }

    // Bank into the turn. This has to drive towards a bank *angle*:
    // adding a roll rate proportional to yaw makes roll accumulate
    // without limit, and the ship eventually flies itself inverted.
    if (!manualRoll) {
      M.qRotate(right, ship.q, RIGHT);
      var bankNow = -right[1]; // +1 is rolled hard right
      var bankWant = M.clamp(-yawT / CFG.yawRate, -1, 1) * CFG.bank;
      rollT -= (bankWant - bankNow) * CFG.bankGain;
    }

    ship.yawV = M.damp(ship.yawV, yawT, CFG.turnSharp, dt);
    ship.pitchV = M.damp(ship.pitchV, pitchT, CFG.turnSharp, dt);
    ship.rollV = M.damp(ship.rollV, rollT, CFG.turnSharp * 0.8, dt);

    // Pitch and roll act on the ship's own axes. Yaw acts on the world
    // vertical: yawing about the body axis while banked tips the nose
    // down, so holding a turn would spiral you into the ground.
    M.qEuler(dq, ship.pitchV * dt, 0, ship.rollV * dt);
    M.qMul(ship.q, ship.q, dq);
    M.qAxisAngle(tq, 0, 1, 0, ship.yawV * dt);
    M.qMul(ship.q, tq, ship.q);
    M.qNorm(ship.q, ship.q);

    // Throttle and speed.
    if (keys.up) ship.throttle = M.clamp(ship.throttle + dt * 0.9, 0, 1);
    if (keys.down) ship.throttle = M.clamp(ship.throttle - dt * 1.2, 0, 1);
    var boosting = !!keys.boost && ship.alive;
    var target = (boosting ? CFG.boost : CFG.cruise) * ship.throttle;
    if (!ship.alive) target = 0;
    ship.speed = M.damp(
      ship.speed,
      target,
      boosting ? CFG.accel * 1.6 : CFG.accel,
      dt,
    );

    M.qRotate(fwd, ship.q, FORWARD);
    M.v3scale(ship.vel, fwd, ship.speed);
    M.v3addScaled(ship.pos, ship.pos, ship.vel, dt);

    // Soft floor and ceiling rather than a hard stop.
    if (ship.pos[1] < CFG.minY) {
      ship.pos[1] = M.damp(ship.pos[1], CFG.minY, 12, dt);
      if (ship.pos[1] < CFG.minY - 1 && ship.alive) damage(14, true);
    }
    if (ship.pos[1] > CFG.maxY)
      ship.pos[1] = M.damp(ship.pos[1], CFG.maxY, 6, dt);

    // Guns.
    ship.fireTimer -= dt;
    var firing = (mouse.fire || keys.fire) && ship.alive && game.running;
    if (firing && ship.fireTimer <= 0) {
      ship.fireTimer = CFG.fireGap;
      ship.gun ^= 1;
      M.qRotate(right, ship.q, RIGHT);
      M.v3addScaled(tmpA, ship.pos, right, ship.gun ? 2.2 : -2.2);
      M.v3addScaled(tmpA, tmpA, fwd, 1.5);
      spawnBolt(tmpA, fwd, CFG.boltSpeed + ship.speed, false);
      ship.shake = Math.min(ship.shake + 0.09, 0.4);
    }

    // Shield regen once you have been left alone for a moment.
    if (ship.alive && game.time - ship.hurtAt > 4) {
      ship.shield = Math.min(100, ship.shield + dt * 9);
    }

    // Engine trail.
    if (ship.alive && ship.speed > 40 && Math.random() < dt * 60) {
      M.qRotate(right, ship.q, RIGHT);
      for (var s = -1; s <= 1; s += 2) {
        M.v3addScaled(tmpA, ship.pos, fwd, -2.1);
        M.v3addScaled(tmpA, tmpA, right, s * 0.42);
        burst(tmpA, 1, 6, 0.2, 0.85, 1.0, 0.5 + (keys.boost ? 0.7 : 0));
      }
    }

    ship.shake = Math.max(0, ship.shake - dt * 1.6);

    // Terrain collision.
    if (ship.alive && game.time - ship.bumpAt > 0.6) {
      var it = world.hit(ship.pos, 3.2);
      if (it) {
        ship.bumpAt = game.time;
        var reach = (it.kind === 1 ? it.s * 0.75 : it.r) + 3.2;
        M.v3set(
          tmpB,
          ship.pos[0] - it.x,
          it.kind === 1 ? 0 : ship.pos[1] - it.y,
          ship.pos[2] - it.z,
        );
        if (M.v3len2(tmpB) < 1e-4) M.v3set(tmpB, 1, 0, 0);
        M.v3norm(tmpB, tmpB);
        // Eject all the way to the surface. Nudging is not enough: the
        // ship stays inside and takes the hit again on the next frame.
        ship.pos[0] = it.x + tmpB[0] * reach * 1.05;
        ship.pos[2] = it.z + tmpB[2] * reach * 1.05;
        if (it.kind === 0) ship.pos[1] = it.y + tmpB[1] * reach * 1.05;
        ship.speed *= 0.4;
        damage(18, true);
        burst(ship.pos, 16, 44, 1, 0.7, 0.3, 1.2);
      }
    }
  }

  function damage(amount, physical) {
    if (!ship.alive) return;
    ship.shield -= amount;
    ship.hurtAt = game.time;
    ship.shake = Math.min(ship.shake + (physical ? 0.55 : 0.3), 1);
    flash(physical ? 0.5 : 0.3);
    if (ship.shield <= 0) {
      ship.shield = 0;
      ship.alive = false;
      game.over = true;
      burst(ship.pos, 90, 90, 1, 0.6, 0.25, 2.4);
      showOverlay("over");
    }
  }

  /* Squared distance from point c to the segment a→b. Bolts cover far
     more ground per frame than their hit radius, so testing only the
     endpoint would let most shots tunnel through the target. */
  function segDist2(a, b, c) {
    var abx = b[0] - a[0],
      aby = b[1] - a[1],
      abz = b[2] - a[2];
    var acx = c[0] - a[0],
      acy = c[1] - a[1],
      acz = c[2] - a[2];
    var len2 = abx * abx + aby * aby + abz * abz;
    var t = len2 > 1e-6 ? (acx * abx + acy * aby + acz * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var dx = acx - abx * t,
      dy = acy - aby * t,
      dz = acz - abz * t;
    return dx * dx + dy * dy + dz * dz;
  }

  var prevPos = M.v3(),
    midPos = M.v3();
  var SHIP_HIT2 = 30,
    DRONE_HIT2 = 52;

  function updateBolts(dt) {
    for (var k = 0; k < bolts.n; k++) {
      var b = bolts.a[k];
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.on = false;
        continue;
      }
      M.v3copy(prevPos, b.pos);
      M.v3addScaled(b.pos, b.pos, b.vel, dt);
      M.v3lerp(midPos, prevPos, b.pos, 0.5);

      if (b.pos[1] < 0) {
        burst(b.pos, 4, 14, 0.3, 0.8, 1, 0.6);
        b.on = false;
        continue;
      }
      if (world.hit(b.pos, 1) || world.hit(midPos, 1)) {
        burst(b.pos, 5, 18, 0.6, 0.75, 1, 0.7);
        b.on = false;
        continue;
      }

      if (b.foe) {
        if (ship.alive && segDist2(prevPos, b.pos, ship.pos) < SHIP_HIT2) {
          damage(7, false);
          burst(b.pos, 6, 22, 1, 0.4, 0.5, 0.8);
          b.on = false;
        }
      } else {
        for (var d = 0; d < drones.n; d++) {
          var e = drones.a[d];
          if (!e.on) continue;
          if (segDist2(prevPos, b.pos, e.pos) > DRONE_HIT2) continue;
          e.hp--;
          burst(b.pos, 6, 26, 1, 0.55, 0.8, 0.8);
          b.on = false;
          if (e.hp <= 0) {
            e.on = false;
            game.score += 100;
            game.kills++;
            burst(e.pos, 34, 60, 1, 0.42, 0.55, 1.6);
          } else {
            game.score += 10;
          }
          break;
        }
      }
    }
  }

  function updateDrones(dt) {
    var alive = 0;
    for (var k = 0; k < drones.n; k++) {
      var e = drones.a[k];
      if (!e.on) continue;

      var dist = M.v3dist(e.pos, ship.pos);
      if (dist > CFG.enemyRange * 1.6) {
        e.on = false;
        continue;
      }
      alive++;

      M.v3sub(tmpA, ship.pos, e.pos);
      M.v3norm(tmpA, tmpA);

      // Hold a standoff distance and slide sideways so they are not
      // sitting ducks flying straight at you.
      e.phase += dt * 0.6;
      M.v3cross(tmpB, tmpA, UP);
      M.v3norm(tmpB, tmpB);
      var closing = dist > CFG.enemyStandoff ? 1 : -0.6;
      M.v3scale(tmpC, tmpA, CFG.enemySpeed * closing);
      M.v3addScaled(tmpC, tmpC, tmpB, Math.sin(e.phase) * CFG.enemySpeed * 0.8);
      tmpC[1] += Math.sin(e.phase * 1.7) * 30;

      e.vel[0] = M.damp(e.vel[0], tmpC[0], 1.4, dt);
      e.vel[1] = M.damp(e.vel[1], tmpC[1], 1.4, dt);
      e.vel[2] = M.damp(e.vel[2], tmpC[2], 1.4, dt);
      M.v3addScaled(e.pos, e.pos, e.vel, dt);
      if (e.pos[1] < 30) e.pos[1] = 30;

      // Face the player.
      M.qBetween(tq, FORWARD, tmpA);
      M.qSlerp(e.q, e.q, tq, 1 - Math.exp(-6 * dt));
      M.qNorm(e.q, e.q);

      e.fire -= dt;
      if (e.fire <= 0 && dist < 900 && ship.alive) {
        e.fire = 1.8 + Math.random() * 1.4;
        // Lead the target, but sloppily, so it stays dodgeable.
        M.v3addScaled(tmpB, ship.pos, ship.vel, (dist / CFG.enemyBolt) * 0.75);
        M.v3sub(tmpB, tmpB, e.pos);
        M.v3norm(tmpB, tmpB);
        // Deliberately sloppy: a perfect solution is not dodgeable.
        tmpB[0] += (Math.random() - 0.5) * 0.13;
        tmpB[1] += (Math.random() - 0.5) * 0.13;
        tmpB[2] += (Math.random() - 0.5) * 0.13;
        M.v3norm(tmpB, tmpB);
        spawnBolt(e.pos, tmpB, CFG.enemyBolt, true);
      }
    }

    if (alive < CFG.enemyWant && ship.alive && Math.random() < dt * 2.5)
      spawnDrone();
  }

  function updateShards(dt) {
    for (var k = 0; k < shards.n; k++) {
      var s = shards.a[k];
      if (!s.on) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.on = false;
        continue;
      }
      M.v3addScaled(s.pos, s.pos, s.vel, dt);
      M.v3scale(s.vel, s.vel, 1 - Math.min(1, dt * 1.6));
      var sl = M.v3len(s.spin) || 1;
      M.qAxisAngle(dq, s.spin[0] / sl, s.spin[1] / sl, s.spin[2] / sl, sl * dt);
      M.qMul(s.q, dq, s.q);
    }
  }

  function updateCamera(dt) {
    M.qRotate(fwd, ship.q, FORWARD);
    M.qRotate(up, ship.q, UP);

    // Carry the camera along with the ship's own motion first, then damp
    // only what is left over. Without this feedforward the offset is
    // measured after the ship has already moved, so the spring is always
    // chasing and settles ~30 m too far back.
    if (ship.alive) M.v3addScaled(cam.pos, cam.pos, ship.vel, dt);

    M.v3set(camTarget, 0, 0, 0);
    M.v3addScaled(camTarget, camTarget, fwd, -10.5 - ship.speed * 0.009);
    M.v3addScaled(camTarget, camTarget, up, 2.9);

    M.v3sub(camOff, cam.pos, ship.pos);
    var lag = ship.alive ? 7 : 2.5;
    camOff[0] = M.damp(camOff[0], camTarget[0], lag, dt);
    camOff[1] = M.damp(camOff[1], camTarget[1], lag, dt);
    camOff[2] = M.damp(camOff[2], camTarget[2], lag, dt);
    M.v3add(cam.pos, ship.pos, camOff);
    if (cam.pos[1] < 4) cam.pos[1] = 4;

    // Look ahead of the ship rather than at it.
    M.v3addScaled(camLook, ship.pos, fwd, 26);

    if (ship.shake > 0.001) {
      var s = ship.shake * ship.shake * 2.2;
      camLook[0] += (Math.random() - 0.5) * s;
      camLook[1] += (Math.random() - 0.5) * s;
      camLook[2] += (Math.random() - 0.5) * s;
    }

    // Roll the camera part-way with the ship: full roll is nauseating,
    // none of it makes banking invisible.
    M.v3lerp(tmpA, UP, up, 0.42);
    M.v3norm(tmpA, tmpA);

    var speedT = M.clamp(ship.speed / CFG.boost, 0, 1);
    cam.fov = M.damp(cam.fov, 1.02 + speedT * 0.3, 4, dt);

    M.m4LookAt(view, cam.pos, camLook, tmpA, cam.basis);
  }

  /* ═══ Render ══════════════════════════════════════════════ */

  var dpr = 1,
    W = 1,
    H = 1;
  var quality = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75) * quality;
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === W && h === H) return;
    W = w;
    H = h;
    canvas.width = w;
    canvas.height = h;
  }

  function pushInstances() {
    var k, e, s, b;
    for (k = 0; k < mRocks.length; k++) mRocks[k].inst.n = 0;
    for (k = 0; k < mSpires.length; k++) mSpires[k].inst.n = 0;
    mDrone.inst.n = 0;
    mBolt.inst.n = 0;
    mShard.inst.n = 0;
    mShip.inst.n = 0;

    var items = world.items;
    var dd = CFG.drawDist * CFG.drawDist;
    for (k = 0; k < items.length; k++) {
      var it = items[k];
      var dx = it.x - cam.pos[0],
        dz = it.z - cam.pos[2];
      if (dx * dx + dz * dz > dd) continue;
      var mesh = it.kind === 1 ? mSpires[it.v] : mRocks[it.v];
      GL.push(mesh, it.x, it.y, it.z, it.s, it.q, 1, 1, 1, 0);
    }

    for (k = 0; k < drones.n; k++) {
      e = drones.a[k];
      if (e.on)
        GL.push(mDrone, e.pos[0], e.pos[1], e.pos[2], 4.5, e.q, 1, 1, 1, 1);
    }

    if (ship.alive) {
      GL.push(
        mShip,
        ship.pos[0],
        ship.pos[1],
        ship.pos[2],
        1,
        ship.q,
        1,
        1,
        1,
        keys.boost ? 1.9 : 1,
      );
    }

    for (k = 0; k < bolts.n; k++) {
      b = bolts.a[k];
      if (!b.on) continue;
      if (M.v3dist2(b.pos, cam.pos) < 25) continue;
      if (b.foe)
        GL.push(
          mBolt,
          b.pos[0],
          b.pos[1],
          b.pos[2],
          2.6,
          b.q,
          1,
          0.34,
          0.45,
          1,
        );
      else
        GL.push(mBolt, b.pos[0], b.pos[1], b.pos[2], 2.2, b.q, 0.4, 1, 0.95, 1);
    }

    for (k = 0; k < shards.n; k++) {
      s = shards.a[k];
      if (!s.on) continue;
      // A glowing shard drifting through the camera plane is magnified
      // into a screen-filling triangle, so drop it and fade the rest in.
      var d2 = M.v3dist2(s.pos, cam.pos);
      if (d2 < 64) continue;
      var near = Math.min(1, (d2 - 64) / 340);
      var t = s.life / s.max;
      GL.push(
        mShard,
        s.pos[0],
        s.pos[1],
        s.pos[2],
        s.size * (0.4 + t * 0.8),
        s.q,
        s.col[0],
        s.col[1],
        s.col[2],
        t * t * 1.6 * near,
      );
    }
  }

  function render() {
    resize();
    gl.viewport(0, 0, W, H);

    M.m4Perspective(proj, cam.fov, W / H, 1.5, CFG.far);
    M.m4Mul(vp, proj, view);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky.
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProg.prog);
    gl.bindVertexArray(emptyVAO);
    var th = Math.tan(cam.fov * 0.5);
    gl.uniform3fv(skyProg.u.uRight, cam.basis.right);
    gl.uniform3fv(skyProg.u.uUp, cam.basis.up);
    gl.uniform3fv(skyProg.u.uFwd, cam.basis.fwd);
    gl.uniform2f(skyProg.u.uTanHalf, (th * W) / H, th);
    gl.uniform1f(skyProg.u.uTime, game.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Ground.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(groundProg.prog);
    gl.bindVertexArray(groundVAO);
    gl.uniformMatrix4fv(groundProg.u.uVP, false, vp);
    gl.uniform2f(groundProg.u.uCenter, cam.pos[0], cam.pos[2]);
    gl.uniform1f(groundProg.u.uSize, CFG.far * 0.78);
    gl.uniform3fv(groundProg.u.uCam, cam.pos);
    gl.uniform1f(groundProg.u.uFog, CFG.fog);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Solid meshes.
    pushInstances();
    gl.useProgram(meshProg.prog);
    gl.uniformMatrix4fv(meshProg.u.uVP, false, vp);
    gl.uniform3fv(meshProg.u.uCam, cam.pos);
    gl.uniform3fv(meshProg.u.uLightDir, lightDir);
    gl.uniform1f(meshProg.u.uFog, CFG.fog);
    gl.uniform1i(meshProg.u.uMode, 0);

    var k;
    for (k = 0; k < mRocks.length; k++) {
      GL.upload(gl, mRocks[k]);
      GL.drawInstanced(gl, mRocks[k]);
    }
    for (k = 0; k < mSpires.length; k++) {
      GL.upload(gl, mSpires[k]);
      GL.drawInstanced(gl, mSpires[k]);
    }
    GL.upload(gl, mDrone);
    GL.drawInstanced(gl, mDrone);
    GL.upload(gl, mShip);
    GL.drawInstanced(gl, mShip);

    // Glowing bits, additive and depth-tested but not depth-writing.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.uniform1i(meshProg.u.uMode, 1);
    GL.upload(gl, mBolt);
    GL.drawInstanced(gl, mBolt);
    GL.upload(gl, mShard);
    GL.drawInstanced(gl, mShard);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /* ═══ HUD ═════════════════════════════════════════════════ */

  var el = {
    speed: document.getElementById("hudSpeed"),
    thr: document.getElementById("hudThrottle"),
    shield: document.getElementById("hudShield"),
    shieldNum: document.getElementById("hudShieldNum"),
    score: document.getElementById("hudScore"),
    kills: document.getElementById("hudKills"),
    fps: document.getElementById("hudFps"),
    alt: document.getElementById("hudAlt"),
    reticle: document.getElementById("reticle"),
    flash: document.getElementById("flash"),
    overlay: document.getElementById("overlay"),
    finalScore: document.getElementById("finalScore"),
    finalKills: document.getElementById("finalKills"),
    boost: document.getElementById("hudBoost"),
  };

  var hudClock = 0;
  function updateHUD(dt) {
    hudClock -= dt;
    el.thr.style.transform = "scaleX(" + ship.throttle.toFixed(3) + ")";
    el.shield.style.transform =
      "scaleX(" + (ship.shield / 100).toFixed(3) + ")";
    el.boost.classList.toggle("is-on", !!keys.boost && ship.alive);
    if (hudClock > 0) return;
    hudClock = 0.1;
    el.speed.textContent = Math.round(ship.speed);
    el.alt.textContent = Math.round(ship.pos[1]);
    el.shieldNum.textContent = Math.round(ship.shield);
    el.score.textContent = game.score;
    el.kills.textContent = game.kills;
    el.fps.textContent = Math.round(game.fps);
  }

  // Reticle sits where the guns are actually pointing, projected to screen.
  function updateReticle() {
    M.qRotate(fwd, ship.q, FORWARD);
    M.v3addScaled(tmpA, ship.pos, fwd, 700);
    var x = tmpA[0],
      y = tmpA[1],
      z = tmpA[2];
    var cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    var cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    var cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.001) {
      el.reticle.style.opacity = "0";
      return;
    }
    el.reticle.style.opacity = ship.alive ? "1" : "0";
    el.reticle.style.transform =
      "translate(" +
      ((cx / cw) * 0.5 + 0.5) * canvas.clientWidth +
      "px," +
      ((-cy / cw) * 0.5 + 0.5) * canvas.clientHeight +
      "px) translate(-50%,-50%)";
  }

  var flashT = 0;
  function flash(amount) {
    flashT = Math.max(flashT, amount);
  }
  function updateFlash(dt) {
    if (flashT <= 0) return;
    flashT = Math.max(0, flashT - dt * 1.8);
    el.flash.style.opacity = flashT.toFixed(3);
  }

  /* ═══ Overlay / flow ══════════════════════════════════════ */

  function showOverlay(mode) {
    el.overlay.dataset.mode = mode;
    el.overlay.hidden = false;
    if (mode === "over") {
      game.best = Math.max(game.best, game.score);
      el.finalScore.textContent = game.score;
      el.finalKills.textContent = game.kills;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  function start() {
    hideOverlay();
    game.running = true;
    if (canvas.requestPointerLock) {
      var p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function togglePause(force) {
    if (game.over) return;
    var pausing = force === true ? true : game.running;
    if (pausing) {
      game.running = false;
      showOverlay("paused");
    } else {
      start();
    }
  }

  function restart() {
    M.v3set(ship.pos, 0, 140, 0);
    M.qIdentity(ship.q);
    M.v3set(ship.vel, 0, 0, 0);
    ship.speed = 0;
    ship.throttle = 0.55;
    ship.shield = 100;
    ship.alive = true;
    ship.shake = 0;
    ship.bumpAt = -99;
    ship.hurtAt = -99;
    ship.pitchV = ship.yawV = ship.rollV = 0;
    mouse.aimX = 0;
    mouse.aimY = 0;
    M.v3set(cam.pos, 0, 150, 30);
    for (var k = 0; k < bolts.n; k++) bolts.a[k].on = false;
    for (k = 0; k < drones.n; k++) drones.a[k].on = false;
    for (k = 0; k < shards.n; k++) shards.a[k].on = false;
    game.score = 0;
    game.kills = 0;
    game.over = false;
    flashT = 0;
    el.flash.style.opacity = "0";
    world.update(ship.pos[0], ship.pos[2]);
    // Make sure we did not spawn inside a rock.
    for (var guard = 0; guard < 12 && world.hit(ship.pos, 12); guard++) {
      ship.pos[1] += 60;
    }
    start();
  }

  document.addEventListener("click", function (e) {
    var act = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!act) {
      if (game.running && !mouse.locked && !game.over) start();
      return;
    }
    var a = act.getAttribute("data-act");
    if (a === "start") {
      restart();
    } else if (a === "resume") {
      start();
    } else if (a === "quality") {
      quality = quality === 1 ? 0.72 : quality === 0.72 ? 0.5 : 1;
      act.textContent =
        "Resolution: " +
        (quality === 1 ? "Full" : quality === 0.72 ? "Balanced" : "Fast");
      W = H = 0;
      resize();
    }
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "Escape" && game.running) togglePause(true);
  });
  window.addEventListener("blur", function () {
    if (game.running) togglePause(true);
  });

  /* ═══ Loop ════════════════════════════════════════════════ */

  function step(dt) {
    game.time += dt;
    if (game.running && !game.over) {
      updateShip(dt);
      updateBolts(dt);
      updateDrones(dt);
    }
    updateShards(dt);
    world.update(ship.pos[0], ship.pos[2]);
    world.spinItems(dt);
    updateCamera(dt);
    render();
    updateReticle();
    updateHUD(dt);
    updateFlash(dt);
  }

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    // A long stall (tab switch, breakpoint) must not teleport the ship.
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    game.fps = M.lerp(game.fps, 1 / dt, 0.08);
    step(dt);
  }

  world.update(0, 0);
  updateCamera(0.016);
  render();
  showOverlay("start");
  requestAnimationFrame(frame);

  /* Exposed for the console and for testing: the render loop is driven
     by rAF, which does not run in a hidden tab. */
  SG.game = {
    step: step,
    state: {
      ship: ship,
      cam: cam,
      game: game,
      bolts: bolts,
      drones: drones,
      shards: shards,
    },
    world: world,
    cfg: CFG,
    restart: restart,
    keys: keys,
    mouse: mouse,
    glError: function () {
      return gl.getError();
    },
  };
})();
