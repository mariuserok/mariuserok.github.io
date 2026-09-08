/* ═══════════════════════════════════════════════════════════
   Procedural geometry.

   Everything is built from a handful of primitives, welded by a
   builder, then flat-shaded (each triangle gets its own vertices
   and one face normal). That is what gives the faceted low-poly
   look, and it means no normal smoothing groups to worry about.

   Convention: models face -Z, matching the camera.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SG = (window.SG = window.SG || {});
  var M = SG.M;

  /* ── Primitives: plain arrays of positions + triangle indices ── */

  function box(w, h, d) {
    var x = w / 2,
      y = h / 2,
      z = d / 2;
    return {
      p: [
        -x,
        -y,
        -z,
        x,
        -y,
        -z,
        x,
        y,
        -z,
        -x,
        y,
        -z,
        -x,
        -y,
        z,
        x,
        -y,
        z,
        x,
        y,
        z,
        -x,
        y,
        z,
      ],
      i: [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
        0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
      ],
    };
  }

  /* Tapered tube along +Y, from -h/2 to +h/2. r1 = 0 gives a cone. */
  function tube(r0, r1, h, seg, capBottom, capTop) {
    var p = [],
      i = [],
      k;
    var y0 = -h / 2,
      y1 = h / 2;
    for (k = 0; k < seg; k++) {
      var a = (k / seg) * M.TAU;
      var c = Math.cos(a),
        s = Math.sin(a);
      p.push(c * r0, y0, s * r0);
      p.push(c * r1, y1, s * r1);
    }
    for (k = 0; k < seg; k++) {
      var a0 = k * 2,
        a1 = a0 + 1;
      var b0 = ((k + 1) % seg) * 2,
        b1 = b0 + 1;
      if (r0 > 0 || r1 > 0) i.push(a0, b0, b1, a0, b1, a1);
    }
    if (capBottom && r0 > 0) {
      var cb = p.length / 3;
      p.push(0, y0, 0);
      for (k = 0; k < seg; k++) i.push(cb, ((k + 1) % seg) * 2, k * 2);
    }
    if (capTop && r1 > 0) {
      var ct = p.length / 3;
      p.push(0, y1, 0);
      for (k = 0; k < seg; k++) i.push(ct, k * 2 + 1, ((k + 1) % seg) * 2 + 1);
    }
    return { p: p, i: i };
  }

  /* A swept wing: root chord at x=0, tip chord at x=span, swept back
     and tapered. Thin in Y. */
  function wing(span, rootChord, tipChord, sweep, thick) {
    var t = thick / 2;
    var p = [
      0,
      -t,
      -rootChord / 2,
      0,
      -t,
      rootChord / 2,
      0,
      t,
      rootChord / 2,
      0,
      t,
      -rootChord / 2,

      span,
      -t * 0.4,
      sweep - tipChord / 2,
      span,
      -t * 0.4,
      sweep + tipChord / 2,
      span,
      t * 0.4,
      sweep + tipChord / 2,
      span,
      t * 0.4,
      sweep - tipChord / 2,
    ];
    var i = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0,
      4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ];
    return { p: p, i: i };
  }

  function icosphere(sub) {
    var t = (1 + Math.sqrt(5)) / 2;
    var p = [
      -1,
      t,
      0,
      1,
      t,
      0,
      -1,
      -t,
      0,
      1,
      -t,
      0,
      0,
      -1,
      t,
      0,
      1,
      t,
      0,
      -1,
      -t,
      0,
      1,
      -t,
      t,
      0,
      -1,
      t,
      0,
      1,
      -t,
      0,
      -1,
      -t,
      0,
      1,
    ];
    var i = [
      0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11,
      10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4,
      9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ];
    // Normalise the base vertices onto the unit sphere.
    var v;
    for (v = 0; v < p.length; v += 3) {
      var l = Math.hypot(p[v], p[v + 1], p[v + 2]);
      p[v] /= l;
      p[v + 1] /= l;
      p[v + 2] /= l;
    }
    for (var s = 0; s < sub; s++) {
      var ni = [];
      var cache = {};
      var mid = function (a, b) {
        var key = a < b ? a + "_" + b : b + "_" + a;
        if (cache[key] !== undefined) return cache[key];
        var ax = p[a * 3],
          ay = p[a * 3 + 1],
          az = p[a * 3 + 2];
        var bx = p[b * 3],
          by = p[b * 3 + 1],
          bz = p[b * 3 + 2];
        var mx = (ax + bx) / 2,
          my = (ay + by) / 2,
          mz = (az + bz) / 2;
        var ml = Math.hypot(mx, my, mz);
        var idx = p.length / 3;
        p.push(mx / ml, my / ml, mz / ml);
        cache[key] = idx;
        return idx;
      };
      for (var f = 0; f < i.length; f += 3) {
        var a = i[f],
          b = i[f + 1],
          c = i[f + 2];
        var ab = mid(a, b),
          bc = mid(b, c),
          ca = mid(c, a);
        ni.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      }
      i = ni;
    }
    return { p: p, i: i };
  }

  function octahedron() {
    return {
      p: [0, 1, 0, 0, -1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1],
      i: [
        0, 4, 2, 0, 2, 5, 0, 5, 3, 0, 3, 4, 1, 2, 4, 1, 5, 2, 1, 3, 5, 1, 4, 3,
      ],
    };
  }

  /* ── Builder ───────────────────────────────────────────── */

  function Builder() {
    this.p = [];
    this.i = [];
    this.c = []; // rgb + emissive, per vertex
  }
  var _m = M.mat4(),
    _q = M.quat(),
    _tmp = M.v3(),
    _pos = M.v3(),
    _scale = M.v3();

  /* opts: { pos, rot:[ax,ay,az,angle], scale (number or [x,y,z]),
             color:[r,g,b], emissive, deform:fn(x,y,z)->radiusScale } */
  Builder.prototype.add = function (geo, opts) {
    opts = opts || {};
    var col = opts.color || [1, 1, 1];
    var em = opts.emissive || 0;
    var s = opts.scale === undefined ? 1 : opts.scale;
    if (typeof s === "number") M.v3set(_scale, s, s, s);
    else M.v3set(_scale, s[0], s[1], s[2]);
    var pp = opts.pos || [0, 0, 0];
    M.v3set(_pos, pp[0], pp[1], pp[2]);
    if (opts.rot) {
      M.v3norm(_tmp, M.v3set(_tmp, opts.rot[0], opts.rot[1], opts.rot[2]));
      M.qAxisAngle(_q, _tmp[0], _tmp[1], _tmp[2], opts.rot[3]);
    } else {
      M.qIdentity(_q);
    }
    M.m4Compose(_m, _pos, _q, _scale);

    var base = this.p.length / 3;
    for (var v = 0; v < geo.p.length; v += 3) {
      var x = geo.p[v],
        y = geo.p[v + 1],
        z = geo.p[v + 2];
      if (opts.deform) {
        var k = opts.deform(x, y, z);
        x *= k;
        y *= k;
        z *= k;
      }
      M.v3set(_tmp, x, y, z);
      M.m4TransformPoint(_tmp, _m, _tmp);
      this.p.push(_tmp[0], _tmp[1], _tmp[2]);
      this.c.push(col[0], col[1], col[2], em);
    }
    for (var f = 0; f < geo.i.length; f++) this.i.push(base + geo.i[f]);
    return this;
  };

  /* Adds the same geometry again with X negated, and flips winding so
     the mirrored half is not inside-out. */
  Builder.prototype.mirrorX = function (geo, opts) {
    this.add(geo, opts);
    var o2 = {};
    for (var k in opts) if (Object.hasOwn(opts, k)) o2[k] = opts[k];
    var p = opts.pos || [0, 0, 0];
    o2.pos = [-p[0], p[1], p[2]];
    if (opts.rot)
      o2.rot = [opts.rot[0], -opts.rot[1], -opts.rot[2], opts.rot[3]];
    var s = opts.scale === undefined ? 1 : opts.scale;
    o2.scale = typeof s === "number" ? [-s, s, s] : [-s[0], s[1], s[2]];
    var before = this.i.length;
    this.add(geo, o2);
    for (var f = before; f < this.i.length; f += 3) {
      var t = this.i[f + 1];
      this.i[f + 1] = this.i[f + 2];
      this.i[f + 2] = t;
    }
    return this;
  };

  /* Expands to non-indexed triangles with per-face normals. */
  Builder.prototype.finish = function () {
    var tris = this.i.length / 3;
    var positions = new Float32Array(tris * 9);
    var normals = new Float32Array(tris * 9);
    var colors = new Float32Array(tris * 12);
    var radius = 0;
    for (var f = 0; f < tris; f++) {
      var a = this.i[f * 3] * 3,
        b = this.i[f * 3 + 1] * 3,
        c = this.i[f * 3 + 2] * 3;
      var ax = this.p[a],
        ay = this.p[a + 1],
        az = this.p[a + 2];
      var bx = this.p[b],
        by = this.p[b + 1],
        bz = this.p[b + 2];
      var cx = this.p[c],
        cy = this.p[c + 1],
        cz = this.p[c + 2];
      var ux = bx - ax,
        uy = by - ay,
        uz = bz - az;
      var vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      var nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      var nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;

      var o = f * 9;
      positions[o] = ax;
      positions[o + 1] = ay;
      positions[o + 2] = az;
      positions[o + 3] = bx;
      positions[o + 4] = by;
      positions[o + 5] = bz;
      positions[o + 6] = cx;
      positions[o + 7] = cy;
      positions[o + 8] = cz;
      for (var n = 0; n < 3; n++) {
        normals[o + n * 3] = nx;
        normals[o + n * 3 + 1] = ny;
        normals[o + n * 3 + 2] = nz;
      }
      var co = f * 12;
      var src = [
        this.i[f * 3] * 4,
        this.i[f * 3 + 1] * 4,
        this.i[f * 3 + 2] * 4,
      ];
      for (var v = 0; v < 3; v++) {
        colors[co + v * 4] = this.c[src[v]];
        colors[co + v * 4 + 1] = this.c[src[v] + 1];
        colors[co + v * 4 + 2] = this.c[src[v] + 2];
        colors[co + v * 4 + 3] = this.c[src[v] + 3];
      }
      radius = Math.max(
        radius,
        ax * ax + ay * ay + az * az,
        bx * bx + by * by + bz * bz,
        cx * cx + cy * cy + cz * cz,
      );
    }
    return {
      positions: positions,
      normals: normals,
      colors: colors,
      count: tris * 3,
      radius: Math.sqrt(radius),
    };
  };

  /* ── Models ────────────────────────────────────────────── */

  var HULL = [0.62, 0.68, 0.86];
  var HULL_DARK = [0.24, 0.28, 0.42];
  var GLASS = [0.13, 0.8, 0.92];
  var ENGINE = [0.14, 0.85, 0.95];

  function ship() {
    var b = new Builder();
    var back = Math.PI / 2; // +Y tube → -Z
    // Fuselage: a hexagonal spindle tapering to the nose.
    b.add(tube(0.52, 0.1, 3.6, 6, true, true), {
      rot: [1, 0, 0, -back],
      pos: [0, 0, -0.2],
      color: HULL,
    });
    // Belly plate, slightly darker so the silhouette reads from below.
    b.add(box(0.7, 0.16, 1.9), { pos: [0, -0.34, 0.15], color: HULL_DARK });
    // Canopy.
    b.add(icosphere(1), {
      pos: [0, 0.3, -0.55],
      scale: [0.34, 0.26, 0.72],
      color: GLASS,
      emissive: 0.45,
    });
    // Main wings, swept back.
    b.mirrorX(wing(1.85, 1.5, 0.55, 0.85, 0.16), {
      pos: [0.42, -0.05, 0.35],
      color: HULL,
    });
    // Wingtip pylons.
    b.mirrorX(tube(0.11, 0.07, 1.1, 6, true, true), {
      pos: [2.2, -0.02, 1.05],
      rot: [1, 0, 0, -back],
      color: HULL_DARK,
    });
    // Tail fins.
    b.mirrorX(wing(0.75, 0.9, 0.35, 0.3, 0.12), {
      pos: [0.2, 0.25, 1.35],
      rot: [0, 0, 1, 1.15],
      color: HULL_DARK,
    });
    // Engine bells.
    b.mirrorX(tube(0.26, 0.3, 0.7, 8, false, false), {
      pos: [0.42, 0, 1.75],
      rot: [1, 0, 0, -back],
      color: HULL_DARK,
    });
    b.mirrorX(tube(0.22, 0.24, 0.14, 8, true, true), {
      pos: [0.42, 0, 2.06],
      rot: [1, 0, 0, -back],
      color: ENGINE,
      emissive: 1,
    });
    return b.finish();
  }

  function drone() {
    var b = new Builder();
    b.add(octahedron(), { scale: [0.85, 0.62, 1.15], color: [0.5, 0.24, 0.4] });
    b.add(octahedron(), {
      pos: [0, 0, -0.75],
      scale: 0.32,
      color: [1, 0.35, 0.5],
      emissive: 1.2,
    });
    b.mirrorX(box(0.18, 0.5, 1.1), {
      pos: [0.78, 0, 0.1],
      rot: [0, 0, 1, 0.35],
      color: [0.34, 0.16, 0.28],
    });
    b.mirrorX(tube(0.09, 0.06, 0.9, 5, true, true), {
      pos: [0.72, 0, -0.5],
      rot: [1, 0, 0, -Math.PI / 2],
      color: [0.6, 0.2, 0.35],
    });
    return b.finish();
  }

  /* A craggy asteroid. `seed` picks a stable variant. */
  function rock(seed) {
    var rand = M.rng(seed);
    var a = rand() * 10,
      c2 = rand() * 10,
      c3 = rand() * 10;
    var deform = function (x, y, z) {
      return (
        1 +
        0.3 * Math.sin(x * 3.1 + a) * Math.sin(y * 2.7 + c2) +
        0.22 * Math.sin(z * 4.3 + c3) * Math.sin(x * 2.1 + c2) +
        0.12 * Math.sin(y * 5.9 + c3)
      );
    };
    var g = 0.26 + rand() * 0.12;
    var b = new Builder();
    b.add(icosphere(1), {
      scale: [0.8 + rand() * 0.5, 0.7 + rand() * 0.5, 0.8 + rand() * 0.5],
      color: [g * 1.05, g, g * 1.25],
      deform: deform,
    });
    return b.finish();
  }

  /* A tall shard rising from the ground — gives the flat world scale. */
  function spire(seed) {
    var rand = M.rng(seed);
    var b = new Builder();
    var g = 0.2 + rand() * 0.1;
    var phase = rand() * 10;
    b.add(tube(1, 0.18 + rand() * 0.3, 2, 5 + ((seed % 3) | 0), true, true), {
      pos: [0, 1, 0],
      color: [g, g * 1.05, g * 1.5],
      deform: function (x, y, z) {
        return 1 + 0.14 * Math.sin(x * 5 + z * 3 + phase);
      },
    });
    b.add(tube(1.25, 0.9, 0.5, 5, true, true), {
      pos: [0, 0.25, 0],
      color: [g * 0.8, g * 0.85, g * 1.2],
    });
    return b.finish();
  }

  /* Projectile: a stretched octahedron, drawn additively. */
  function bolt() {
    var b = new Builder();
    b.add(octahedron(), {
      scale: [0.18, 0.18, 1.2],
      color: [1, 1, 1],
      emissive: 1,
    });
    return b.finish();
  }

  /* Debris / spark. */
  function shard() {
    var b = new Builder();
    b.add(octahedron(), {
      scale: [0.5, 0.5, 0.9],
      color: [1, 1, 1],
      emissive: 1,
    });
    return b.finish();
  }

  SG.Meshes = {
    Builder: Builder,
    box: box,
    tube: tube,
    wing: wing,
    icosphere: icosphere,
    octahedron: octahedron,
    ship: ship,
    drone: drone,
    rock: rock,
    spire: spire,
    bolt: bolt,
    shard: shard,
  };
})();
