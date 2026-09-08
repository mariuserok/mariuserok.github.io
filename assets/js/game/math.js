/* ═══════════════════════════════════════════════════════════
   Vector / quaternion / matrix maths.

   Everything is out-parameter style: the caller owns the
   destination array. Nothing in here allocates, because all of
   it runs inside the frame loop.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SG = (window.SG = window.SG || {});

  var TAU = Math.PI * 2;

  function v3(x, y, z) {
    var o = new Float32Array(3);
    o[0] = x || 0;
    o[1] = y || 0;
    o[2] = z || 0;
    return o;
  }
  function v3set(o, x, y, z) {
    o[0] = x;
    o[1] = y;
    o[2] = z;
    return o;
  }
  function v3copy(o, a) {
    o[0] = a[0];
    o[1] = a[1];
    o[2] = a[2];
    return o;
  }
  function v3add(o, a, b) {
    o[0] = a[0] + b[0];
    o[1] = a[1] + b[1];
    o[2] = a[2] + b[2];
    return o;
  }
  function v3sub(o, a, b) {
    o[0] = a[0] - b[0];
    o[1] = a[1] - b[1];
    o[2] = a[2] - b[2];
    return o;
  }
  function v3scale(o, a, s) {
    o[0] = a[0] * s;
    o[1] = a[1] * s;
    o[2] = a[2] * s;
    return o;
  }
  /* o = a + b * s — the workhorse for integration. */
  function v3addScaled(o, a, b, s) {
    o[0] = a[0] + b[0] * s;
    o[1] = a[1] + b[1] * s;
    o[2] = a[2] + b[2] * s;
    return o;
  }
  function v3dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function v3cross(o, a, b) {
    var ax = a[0],
      ay = a[1],
      az = a[2],
      bx = b[0],
      by = b[1],
      bz = b[2];
    o[0] = ay * bz - az * by;
    o[1] = az * bx - ax * bz;
    o[2] = ax * by - ay * bx;
    return o;
  }
  function v3len(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  }
  function v3len2(a) {
    return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  }
  function v3dist(a, b) {
    var x = a[0] - b[0],
      y = a[1] - b[1],
      z = a[2] - b[2];
    return Math.sqrt(x * x + y * y + z * z);
  }
  function v3dist2(a, b) {
    var x = a[0] - b[0],
      y = a[1] - b[1],
      z = a[2] - b[2];
    return x * x + y * y + z * z;
  }
  function v3norm(o, a) {
    var l = v3len(a);
    if (l < 1e-8) return v3set(o, 0, 0, 0);
    return v3scale(o, a, 1 / l);
  }
  function v3lerp(o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  }

  /* ── Quaternions, stored [x, y, z, w] ──────────────────── */
  function quat() {
    var o = new Float32Array(4);
    o[3] = 1;
    return o;
  }
  function qIdentity(o) {
    o[0] = o[1] = o[2] = 0;
    o[3] = 1;
    return o;
  }
  function qCopy(o, a) {
    o[0] = a[0];
    o[1] = a[1];
    o[2] = a[2];
    o[3] = a[3];
    return o;
  }
  function qMul(o, a, b) {
    var ax = a[0],
      ay = a[1],
      az = a[2],
      aw = a[3],
      bx = b[0],
      by = b[1],
      bz = b[2],
      bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by;
    o[1] = aw * by - ax * bz + ay * bw + az * bx;
    o[2] = aw * bz + ax * by - ay * bx + az * bw;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  }
  function qNorm(o, a) {
    var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]);
    if (l < 1e-8) return qIdentity(o);
    l = 1 / l;
    o[0] = a[0] * l;
    o[1] = a[1] * l;
    o[2] = a[2] * l;
    o[3] = a[3] * l;
    return o;
  }
  /* Axis must already be unit length. */
  function qAxisAngle(o, x, y, z, angle) {
    var h = angle * 0.5,
      s = Math.sin(h);
    o[0] = x * s;
    o[1] = y * s;
    o[2] = z * s;
    o[3] = Math.cos(h);
    return o;
  }
  /* Intrinsic pitch (X) then yaw (Y) then roll (Z), all in ship space. */
  function qEuler(o, px, py, pz) {
    var cx = Math.cos(px * 0.5),
      sx = Math.sin(px * 0.5),
      cy = Math.cos(py * 0.5),
      sy = Math.sin(py * 0.5),
      cz = Math.cos(pz * 0.5),
      sz = Math.sin(pz * 0.5);
    o[0] = sx * cy * cz + cx * sy * sz;
    o[1] = cx * sy * cz - sx * cy * sz;
    o[2] = cx * cy * sz - sx * sy * cz;
    o[3] = cx * cy * cz + sx * sy * sz;
    return o;
  }
  /* v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v) */
  function qRotate(o, q, v) {
    var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3],
      vx = v[0],
      vy = v[1],
      vz = v[2];
    var tx = 2 * (y * vz - z * vy),
      ty = 2 * (z * vx - x * vz),
      tz = 2 * (x * vy - y * vx);
    o[0] = vx + w * tx + (y * tz - z * ty);
    o[1] = vy + w * ty + (z * tx - x * tz);
    o[2] = vz + w * tz + (x * ty - y * tx);
    return o;
  }
  function qSlerp(o, a, b, t) {
    var ax = a[0],
      ay = a[1],
      az = a[2],
      aw = a[3],
      bx = b[0],
      by = b[1],
      bz = b[2],
      bw = b[3];
    var cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    var s0, s1;
    if (1 - cos > 1e-6) {
      var om = Math.acos(cos),
        sin = Math.sin(om);
      s0 = Math.sin((1 - t) * om) / sin;
      s1 = Math.sin(t * om) / sin;
    } else {
      s0 = 1 - t;
      s1 = t;
    }
    o[0] = s0 * ax + s1 * bx;
    o[1] = s0 * ay + s1 * by;
    o[2] = s0 * az + s1 * bz;
    o[3] = s0 * aw + s1 * bw;
    return o;
  }
  /* Shortest rotation that takes unit vector `from` to unit vector `to`. */
  var _axis = v3();
  function qBetween(o, from, to) {
    var d = v3dot(from, to);
    if (d > 0.999999) return qIdentity(o);
    if (d < -0.999999) {
      // Any perpendicular axis will do for a 180° flip.
      v3set(_axis, 0, 1, 0);
      v3cross(_axis, from, _axis);
      if (v3len2(_axis) < 1e-6) v3cross(_axis, from, v3set(_axis, 1, 0, 0));
      v3norm(_axis, _axis);
      return qAxisAngle(o, _axis[0], _axis[1], _axis[2], Math.PI);
    }
    v3cross(_axis, from, to);
    o[0] = _axis[0];
    o[1] = _axis[1];
    o[2] = _axis[2];
    o[3] = 1 + d;
    return qNorm(o, o);
  }

  /* ── 4x4 matrices, column-major to match GL ────────────── */
  function mat4() {
    var o = new Float32Array(16);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  }
  function m4Identity(o) {
    o[0] = 1;
    o[1] = 0;
    o[2] = 0;
    o[3] = 0;
    o[4] = 0;
    o[5] = 1;
    o[6] = 0;
    o[7] = 0;
    o[8] = 0;
    o[9] = 0;
    o[10] = 1;
    o[11] = 0;
    o[12] = 0;
    o[13] = 0;
    o[14] = 0;
    o[15] = 1;
    return o;
  }
  function m4Perspective(o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy * 0.5),
      nf = 1 / (near - far);
    o[0] = f / aspect;
    o[1] = 0;
    o[2] = 0;
    o[3] = 0;
    o[4] = 0;
    o[5] = f;
    o[6] = 0;
    o[7] = 0;
    o[8] = 0;
    o[9] = 0;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[12] = 0;
    o[13] = 0;
    o[14] = 2 * far * near * nf;
    o[15] = 0;
    return o;
  }
  /* Writes the view matrix, and stores the camera basis in `basis`
     (right, up, forward) so the sky pass can build rays without a
     matrix inverse. */
  var _f = v3(),
    _s = v3(),
    _u = v3();
  function m4LookAt(o, eye, center, up, basis) {
    v3norm(_f, v3sub(_f, center, eye));
    v3norm(_s, v3cross(_s, _f, up));
    v3cross(_u, _s, _f);
    if (basis) {
      v3copy(basis.right, _s);
      v3copy(basis.up, _u);
      v3copy(basis.fwd, _f);
    }
    o[0] = _s[0];
    o[1] = _u[0];
    o[2] = -_f[0];
    o[3] = 0;
    o[4] = _s[1];
    o[5] = _u[1];
    o[6] = -_f[1];
    o[7] = 0;
    o[8] = _s[2];
    o[9] = _u[2];
    o[10] = -_f[2];
    o[11] = 0;
    o[12] = -v3dot(_s, eye);
    o[13] = -v3dot(_u, eye);
    o[14] = v3dot(_f, eye);
    o[15] = 1;
    return o;
  }
  function m4Mul(o, a, b) {
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4],
        b1 = b[c * 4 + 1],
        b2 = b[c * 4 + 2],
        b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  }
  /* Builds translate * rotate * uniform-scale, used by the mesh builder. */
  function m4Compose(o, pos, q, scale) {
    var x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
    var x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    var xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    var sx = scale[0],
      sy = scale[1],
      sz = scale[2];
    o[0] = (1 - (yy + zz)) * sx;
    o[1] = (xy + wz) * sx;
    o[2] = (xz - wy) * sx;
    o[3] = 0;
    o[4] = (xy - wz) * sy;
    o[5] = (1 - (xx + zz)) * sy;
    o[6] = (yz + wx) * sy;
    o[7] = 0;
    o[8] = (xz + wy) * sz;
    o[9] = (yz - wx) * sz;
    o[10] = (1 - (xx + yy)) * sz;
    o[11] = 0;
    o[12] = pos[0];
    o[13] = pos[1];
    o[14] = pos[2];
    o[15] = 1;
    return o;
  }
  function m4TransformPoint(o, m, p) {
    var x = p[0],
      y = p[1],
      z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  }

  /* ── Scalars ───────────────────────────────────────────── */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  /* Frame-rate independent easing: the fraction of the way to the
     target that survives `dt` seconds. */
  function damp(a, b, lambda, dt) {
    return lerp(a, b, 1 - Math.exp(-lambda * dt));
  }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* Deterministic hash — the whole world is rebuilt from these,
     so it must be stable across machines and reloads. */
  function hash2(x, y, seed) {
    var h = x * 374761393 + y * 668265263 + (seed || 0) * 1274126177;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function hash1(i, seed) {
    return hash2(i, i * 57 + 11, seed);
  }
  /* Tiny seeded PRNG for one-off generation at load time. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  SG.M = {
    TAU: TAU,
    v3: v3,
    v3set: v3set,
    v3copy: v3copy,
    v3add: v3add,
    v3sub: v3sub,
    v3scale: v3scale,
    v3addScaled: v3addScaled,
    v3dot: v3dot,
    v3cross: v3cross,
    v3len: v3len,
    v3len2: v3len2,
    v3dist: v3dist,
    v3dist2: v3dist2,
    v3norm: v3norm,
    v3lerp: v3lerp,
    quat: quat,
    qIdentity: qIdentity,
    qCopy: qCopy,
    qMul: qMul,
    qNorm: qNorm,
    qAxisAngle: qAxisAngle,
    qEuler: qEuler,
    qRotate: qRotate,
    qSlerp: qSlerp,
    qBetween: qBetween,
    mat4: mat4,
    m4Identity: m4Identity,
    m4Perspective: m4Perspective,
    m4LookAt: m4LookAt,
    m4Mul: m4Mul,
    m4Compose: m4Compose,
    m4TransformPoint: m4TransformPoint,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    smoothstep: smoothstep,
    hash1: hash1,
    hash2: hash2,
    rng: rng,
  };
})();
