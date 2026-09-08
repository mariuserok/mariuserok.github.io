/* ═══════════════════════════════════════════════════════════
   Thin WebGL2 layer: shader compilation, meshes, instancing.
   No abstractions beyond what the renderer actually uses.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SG = (window.SG = window.SG || {});

  /* Attribute slots are fixed so every shader and every mesh agree
     without querying locations at runtime. */
  var LOC = {
    POS: 0,
    NORMAL: 1,
    I_POS_SCALE: 2,
    I_QUAT: 3,
    I_TINT: 4,
    COLOR: 5,
  };

  function context(canvas) {
    var gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    });
    return gl;
  }

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(
        (type === gl.VERTEX_SHADER ? "Vertex" : "Fragment") + " shader: " + log
      );
    }
    return s;
  }

  function program(gl, vsSrc, fsSrc, uniformNames) {
    var vs = shader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = shader(gl, gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error("Link: " + log);
    }
    var u = {};
    for (var i = 0; i < uniformNames.length; i++) {
      u[uniformNames[i]] = gl.getUniformLocation(p, uniformNames[i]);
    }
    return { prog: p, u: u };
  }

  /* geo: { positions: Float32Array, normals: Float32Array, count: int }
     Meshes are non-indexed — they are low-poly and flat-shaded, so
     sharing vertices would mean sharing normals, which we don't want. */
  function mesh(gl, geo) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.POS);
    gl.vertexAttribPointer(LOC.POS, 3, gl.FLOAT, false, 0, 0);

    var nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.NORMAL);
    gl.vertexAttribPointer(LOC.NORMAL, 3, gl.FLOAT, false, 0, 0);

    // rgb + emissive, so one model can mix matte hull and glowing engines.
    var cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, geo.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.COLOR);
    gl.vertexAttribPointer(LOC.COLOR, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return { vao: vao, count: geo.count, radius: geo.radius || 1, inst: null };
  }

  /* Adds per-instance attributes: position+scale, orientation, tint.
     One interleaved buffer, 12 floats per instance. */
  var STRIDE = 12 * 4;
  function instanced(gl, m, max) {
    gl.bindVertexArray(m.vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, max * STRIDE, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(LOC.I_POS_SCALE);
    gl.vertexAttribPointer(LOC.I_POS_SCALE, 4, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(LOC.I_POS_SCALE, 1);

    gl.enableVertexAttribArray(LOC.I_QUAT);
    gl.vertexAttribPointer(LOC.I_QUAT, 4, gl.FLOAT, false, STRIDE, 16);
    gl.vertexAttribDivisor(LOC.I_QUAT, 1);

    gl.enableVertexAttribArray(LOC.I_TINT);
    gl.vertexAttribPointer(LOC.I_TINT, 4, gl.FLOAT, false, STRIDE, 32);
    gl.vertexAttribDivisor(LOC.I_TINT, 1);

    gl.bindVertexArray(null);
    m.inst = { buf: buf, max: max, data: new Float32Array(max * 12), n: 0 };
    return m;
  }

  /* Appends one instance to the CPU-side buffer. */
  function push(m, px, py, pz, scale, q, r, g, b, emissive) {
    var I = m.inst;
    if (I.n >= I.max) return false;
    var o = I.n * 12;
    var d = I.data;
    d[o] = px;
    d[o + 1] = py;
    d[o + 2] = pz;
    d[o + 3] = scale;
    d[o + 4] = q[0];
    d[o + 5] = q[1];
    d[o + 6] = q[2];
    d[o + 7] = q[3];
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = emissive;
    I.n++;
    return true;
  }

  function upload(gl, m) {
    var I = m.inst;
    if (!I.n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, I.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, I.data, 0, I.n * 12);
  }

  function drawInstanced(gl, m) {
    if (!m.inst.n) return;
    gl.bindVertexArray(m.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, m.inst.n);
  }

  SG.GL = {
    LOC: LOC,
    context: context,
    program: program,
    mesh: mesh,
    instanced: instanced,
    push: push,
    upload: upload,
    drawInstanced: drawInstanced,
  };
})();
