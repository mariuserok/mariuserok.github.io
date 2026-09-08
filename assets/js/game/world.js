/* ═══════════════════════════════════════════════════════════
   The open world.

   Nothing is stored. Every rock is a pure function of the cell it
   lives in, so the world is infinite, identical on every machine,
   and costs one hash per object to rebuild. The item list is only
   regenerated when the ship crosses a cell boundary.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SG = (window.SG = window.SG || {});
  var M = SG.M;

  var CELL = 460; // metres per cell
  var RADIUS = 7; // cells generated around the ship
  var ROCK_VARIANTS = 4;
  var SPIRE_VARIANTS = 2;

  function Item() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.s = 1;
    this.kind = 0; // 0 rock, 1 spire
    this.v = 0; // mesh variant
    this.r = 1; // collision radius
    this.q = M.quat();
    this.spin = 0;
    this.ax = 0;
    this.ay = 1;
    this.az = 0;
  }

  function create() {
    var pool = [];
    var items = []; // live slice of pool
    var lastCX = 1e9,
      lastCZ = 1e9;
    var spinQ = M.quat();

    function take() {
      var n = items.length;
      if (n >= pool.length) pool.push(new Item());
      var it = pool[n];
      items.push(it);
      return it;
    }

    function build(cx, cz) {
      items.length = 0;
      for (var dz = -RADIUS; dz <= RADIUS; dz++) {
        for (var dx = -RADIUS; dx <= RADIUS; dx++) {
          var gx = cx + dx,
            gz = cz + dz;

          // Grounded boulders and spires.
          var n = Math.floor(M.hash2(gx, gz, 1) * 4);
          for (var k = 0; k < n; k++) {
            var it = take();
            it.x = (gx + M.hash2(gx, gz, 10 + k)) * CELL;
            it.z = (gz + M.hash2(gx, gz, 30 + k)) * CELL;
            var tall = M.hash2(gx, gz, 50 + k);
            if (tall > 0.72) {
              it.kind = 1;
              it.s = 26 + M.hash2(gx, gz, 60 + k) * 74;
              it.y = 0;
              it.v = Math.floor(M.hash2(gx, gz, 70 + k) * SPIRE_VARIANTS);
              it.r = it.s * 1.1;
              M.qAxisAngle(it.q, 0, 1, 0, M.hash2(gx, gz, 80 + k) * M.TAU);
              it.spin = 0;
            } else {
              it.kind = 0;
              it.s = 10 + M.hash2(gx, gz, 60 + k) * 34;
              it.y = it.s * 0.45;
              it.v = Math.floor(M.hash2(gx, gz, 70 + k) * ROCK_VARIANTS);
              it.r = it.s * 1.05;
              M.qAxisAngle(it.q, 0, 1, 0, M.hash2(gx, gz, 80 + k) * M.TAU);
              it.spin = 0;
            }
          }

          // Drifting asteroids at flight altitude — these are the ones
          // you actually have to weave through.
          var m = Math.floor(M.hash2(gx, gz, 2) * 5);
          for (var j = 0; j < m; j++) {
            var f = take();
            f.kind = 0;
            f.x = (gx + M.hash2(gx, gz, 110 + j)) * CELL;
            f.z = (gz + M.hash2(gx, gz, 130 + j)) * CELL;
            f.y = 45 + M.hash2(gx, gz, 150 + j) * 300;
            f.s = 5 + M.hash2(gx, gz, 170 + j) * 16;
            f.v = Math.floor(M.hash2(gx, gz, 190 + j) * ROCK_VARIANTS);
            f.r = f.s * 1.05;
            var a1 = M.hash2(gx, gz, 210 + j) * M.TAU;
            var a2 = M.hash2(gx, gz, 230 + j) * M.TAU;
            M.qAxisAngle(f.q, 0, 1, 0, a1);
            f.ax = Math.sin(a2);
            f.ay = Math.cos(a2) * 0.6;
            f.az = Math.cos(a1) * 0.8;
            var al = Math.hypot(f.ax, f.ay, f.az) || 1;
            f.ax /= al;
            f.ay /= al;
            f.az /= al;
            f.spin = (M.hash2(gx, gz, 250 + j) - 0.5) * 0.5;
          }
        }
      }
    }

    return {
      items: items,
      cell: CELL,
      /* Returns true when the item list changed. */
      update: function (px, pz) {
        var cx = Math.floor(px / CELL),
          cz = Math.floor(pz / CELL);
        if (cx === lastCX && cz === lastCZ) return false;
        lastCX = cx;
        lastCZ = cz;
        build(cx, cz);
        return true;
      },
      /* Advances the drifting asteroids. */
      spinItems: function (dt) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it.spin) continue;
          M.qAxisAngle(spinQ, it.ax, it.ay, it.az, it.spin * dt);
          M.qMul(it.q, spinQ, it.q);
          M.qNorm(it.q, it.q);
        }
      },
      /* Nearest item overlapping a sphere, or null. Brute force over the
         live list is fine — it is under a thousand entries and the early
         reject is two subtractions.
         Rocks are spheres; spires are vertical capsules standing on the
         ground, which is why they are tested separately. */
      hit: function (p, radius) {
        var best = null,
          bestD = Infinity;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var dx = p[0] - it.x,
            dz = p[2] - it.z;
          var flat = dx * dx + dz * dz;
          var d2;
          if (it.kind === 1) {
            var reachS = it.s * 0.75 + radius;
            if (flat > reachS * reachS) continue;
            if (p[1] > it.s * 2 + radius) continue;
            d2 = flat;
            if (d2 >= reachS * reachS) continue;
          } else {
            var reachR = it.r + radius;
            if (flat > reachR * reachR) continue;
            var dy = p[1] - it.y;
            d2 = flat + dy * dy;
            if (d2 >= reachR * reachR) continue;
          }
          if (d2 < bestD) {
            bestD = d2;
            best = it;
          }
        }
        return best;
      },
    };
  }

  SG.World = {
    create: create,
    CELL: CELL,
    ROCK_VARIANTS: ROCK_VARIANTS,
    SPIRE_VARIANTS: SPIRE_VARIANTS,
  };
})();
