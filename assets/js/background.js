/* ═══════════════════════════════════════════════════════
   WebGL background — raymarched infinite lattice
   Pure WebGL 1, no libraries.
   ═══════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var canvas = document.getElementById("bg");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var gl =
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    }) || canvas.getContext("experimental-webgl");

  if (!gl) {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }",
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2  uRes;",
    "uniform float uTime;",
    "uniform vec2  uMouse;",
    "uniform float uScroll;",

    "mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }",

    "float sdOcta(vec3 p, float s){ p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }",

    "float hash(vec3 p){ return fract(sin(dot(p, vec3(27.17, 112.61, 57.53))) * 43758.5453); }",

    // infinite repeated, slowly twisting lattice of octahedra
    "float map(vec3 p){",
    "  p.xy *= rot(p.z * 0.055 + uTime * 0.05);",
    "  vec3 id = floor(p / 3.2 + 0.5);",
    "  vec3 q  = p - 3.2 * id;",
    "  float seed = hash(id);",
    "  float wob  = sin(uTime * 0.8 + seed * 12.0) * 0.5 + 0.5;",
    "  return sdOcta(q, 0.16 + 0.34 * wob);",
    "}",

    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",

    "  vec3 ro = vec3(uMouse.x * 0.5, uMouse.y * -0.35, uTime * 1.15 + uScroll * 16.0);",
    "  vec3 rd = normalize(vec3(uv, 1.3));",
    "  rd.yz *= rot(uMouse.y *  0.16);",
    "  rd.xz *= rot(uMouse.x * -0.20);",
    "  rd.xy *= rot(sin(uTime * 0.07) * 0.12);",

    "  vec3  col = vec3(0.0);",
    "  float t   = 0.0;",

    // march the lattice, accumulating glow near every surface
    "  for (int i = 0; i < 64; i++){",
    "    vec3  p = ro + rd * t;",
    "    float d = map(p);",
    "    float glow = 0.006 / (0.006 + d * d);",
    "    float m    = 0.5 + 0.5 * sin(p.z * 0.075 + uTime * 0.16);",
    "    vec3  tint = mix(vec3(0.10, 0.72, 0.95), vec3(0.62, 0.24, 0.96), m);",
    "    tint = mix(tint, vec3(0.95, 0.35, 0.68), 0.3 * (0.5 + 0.5 * sin(p.z * 0.041 - 1.7)));",
    // shapes passing close to the camera fade out instead of flooding the screen
    "    float near = smoothstep(0.6, 9.0, t);",
    "    col += tint * glow * 0.05 * near * exp(-t * 0.085);",
    "    t += max(d, 0.05);",
    "    if (t > 36.0) break;",
    "  }",

    // faint drifting starfield
    "  vec2 sp = uv * 16.0 + vec2(uTime * 0.02, 0.0);",
    "  float star = pow(hash(vec3(floor(sp), 1.0)), 280.0);",
    "  col += vec3(0.4, 0.6, 1.0) * star * 0.6;",

    // deep-space ambient + tone map
    "  col += vec3(0.012, 0.016, 0.034) * (1.0 - length(uv) * 0.6);",
    "  col = 1.0 - exp(-col * 1.5);",
    "  col = pow(max(col, 0.0), vec3(1.08));",

    // vignette keeps the centre readable
    "  col *= 1.0 - clamp(dot(uv, uv) * 0.85, 0.0, 0.78);",
    "  col *= 0.9;",

    // dithering kills banding in the dark gradients
    "  col += (hash(vec3(gl_FragCoord.xy, uTime)) - 0.5) * 0.012;",

    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("link:", gl.getProgramInfoLog(prog));
    document.documentElement.classList.add("no-webgl");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  var aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "uRes");
  var uTime = gl.getUniformLocation(prog, "uTime");
  var uMouse = gl.getUniformLocation(prog, "uMouse");
  var uScroll = gl.getUniformLocation(prog, "uScroll");

  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var scroll = 0,
    scrollTarget = 0;
  var running = true;
  var start = performance.now();

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    // render below native resolution: the shader is heavy, the look is soft anyway
    var scale = w > 1600 ? 0.8 : 1.0;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.25) * scale;
    var pw = Math.max(1, Math.floor(w * dpr));
    var ph = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      gl.viewport(0, 0, pw, ph);
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  window.addEventListener(
    "pointermove",
    function (e) {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  window.addEventListener(
    "scroll",
    function () {
      var max = document.body.scrollHeight - window.innerHeight;
      scrollTarget = max > 0 ? window.scrollY / max : 0;
    },
    { passive: true },
  );

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) {
      start = performance.now() - clock * 1000;
      requestAnimationFrame(frame);
    }
  });

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    running = false;
  });

  var clock = 0;

  function frame(now) {
    if (!running) return;
    clock = (now - start) / 1000;

    mouse.x += (mouse.tx - mouse.x) * 0.045;
    mouse.y += (mouse.ty - mouse.y) * 0.045;
    scroll += (scrollTarget - scroll) * 0.07;

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduced ? 0.0 : clock);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uScroll, scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
