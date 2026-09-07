/* ═══════════════════════════════════════════════════════
   mariuserok — interactions
   ═══════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  var $ = function (sel, ctx) {
    return (ctx || document).querySelector(sel);
  };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };
  var clamp = function (v, a, b) {
    return Math.min(b, Math.max(a, v));
  };

  /* ── Loader ──────────────────────────────────────────── */
  (function loader() {
    var el = $("#loader"),
      bar = $("#loaderBar"),
      pct = $("#loaderPct");
    if (!el) return;
    var value = 0;
    var timer = setInterval(function () {
      value = Math.min(96, value + Math.random() * 18);
      bar.style.width = value + "%";
      pct.textContent = Math.floor(value) + "%";
    }, 120);

    function finish() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      bar.style.width = "100%";
      pct.textContent = "100%";
      setTimeout(function () {
        el.classList.add("is-done");
        document.body.classList.add("is-ready");
      }, 320);
    }

    if (document.readyState === "complete") setTimeout(finish, 500);
    else
      window.addEventListener("load", function () {
        setTimeout(finish, 400);
      });
    // never trap the page behind a stalled resource
    setTimeout(finish, 4000);
  })();

  /* ── Custom cursor ───────────────────────────────────── */
  if (finePointer && !reduced) {
    var dot = $("#cursorDot"),
      ring = $("#cursorRing");
    var cx = window.innerWidth / 2,
      cy = window.innerHeight / 2;
    var rx = cx,
      ry = cy;

    window.addEventListener(
      "pointermove",
      function (e) {
        cx = e.clientX;
        cy = e.clientY;
        dot.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      },
      { passive: true },
    );

    (function trail() {
      rx += (cx - rx) * 0.16;
      ry += (cy - ry) * 0.16;
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      requestAnimationFrame(trail);
    })();

    document.addEventListener("pointerover", function (e) {
      if (e.target.closest("a,button,[data-tilt],[data-magnetic]"))
        ring.classList.add("is-hot");
    });
    document.addEventListener("pointerout", function (e) {
      if (e.target.closest("a,button,[data-tilt],[data-magnetic]"))
        ring.classList.remove("is-hot");
    });
  }

  /* ── Magnetic elements ───────────────────────────────── */
  if (finePointer && !reduced) {
    $$("[data-magnetic]").forEach(function (el) {
      var raf = null,
        tx = 0,
        ty = 0,
        x = 0,
        y = 0;

      function loop() {
        x += (tx - x) * 0.2;
        y += (ty - y) * 0.2;
        el.style.transform =
          "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
        if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1)
          raf = requestAnimationFrame(loop);
        else raf = null;
      }
      function kick() {
        if (!raf) raf = requestAnimationFrame(loop);
      }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * 0.32;
        ty = (e.clientY - (r.top + r.height / 2)) * 0.42;
        kick();
      });
      el.addEventListener("pointerleave", function () {
        tx = 0;
        ty = 0;
        kick();
      });
    });
  }

  /* ── 3D tilt cards ───────────────────────────────────── */
  if (finePointer && !reduced) {
    $$("[data-tilt]").forEach(function (el) {
      var max = parseFloat(el.dataset.tiltMax || "9");
      var accent = el.dataset.accent;
      if (accent) el.style.setProperty("--a", accent);

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        el.style.transform =
          "perspective(1000px) rotateY(" +
          ((px - 0.5) * max * 2).toFixed(2) +
          "deg)" +
          " rotateX(" +
          ((0.5 - py) * max * 2).toFixed(2) +
          "deg)" +
          " translateZ(14px)";
      });

      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
      });
    });
  } else {
    $$("[data-tilt][data-accent]").forEach(function (el) {
      el.style.setProperty("--a", el.dataset.accent);
    });
  }

  /* ── Reveal on scroll ────────────────────────────────── */
  (function reveal() {
    var items = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (i) {
        i.classList.add("is-visible");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var siblings = Array.prototype.slice
            .call(el.parentElement.children)
            .filter(function (n) {
              return n.classList.contains("reveal");
            });
          el.style.transitionDelay = siblings.indexOf(el) * 90 + "ms";
          el.classList.add("is-visible");
          io.unobserve(el);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    items.forEach(function (i) {
      io.observe(i);
    });
  })();

  /* ── Skill bars ──────────────────────────────────────── */
  (function skills() {
    var bars = $$("[data-skill]");
    if (!bars.length || !("IntersectionObserver" in window)) {
      bars.forEach(function (b) {
        b.style.setProperty("--w", b.dataset.skill + "%");
        b.classList.add("is-filled");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          el.style.setProperty("--w", el.dataset.skill + "%");
          el.classList.add("is-filled");
          io.unobserve(el);
        });
      },
      { threshold: 0.4 },
    );
    bars.forEach(function (b) {
      io.observe(b);
    });
  })();

  /* ── Animated counters ───────────────────────────────── */
  (function counters() {
    var nums = $$("[data-count]");
    if (!nums.length) return;

    function run(el) {
      var target = parseFloat(el.dataset.count);
      var suffix = el.dataset.suffix || "";
      var dur = 1500,
        t0 = performance.now();
      (function step(now) {
        var p = clamp((now - t0) / dur, 0, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + (p === 1 ? suffix : "");
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }

    if (!("IntersectionObserver" in window)) {
      nums.forEach(run);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          run(e.target);
          io.unobserve(e.target);
        });
      },
      { threshold: 0.6 },
    );
    nums.forEach(function (n) {
      io.observe(n);
    });
  })();

  /* ── Nav: sticky, progress, scroll spy ───────────────── */
  (function navigation() {
    var nav = $("#nav");
    var bar = $("#progressBar");
    var links = $$("[data-nav]");
    var sections = links
      .map(function (l) {
        return $(l.getAttribute("href"));
      })
      .filter(Boolean);
    var ticking = false;

    function update() {
      var y = window.scrollY;
      nav.classList.toggle("is-stuck", y > 40);

      var max = document.body.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";

      var current = -1;
      sections.forEach(function (sec, i) {
        if (sec.getBoundingClientRect().top <= window.innerHeight * 0.35)
          current = i;
      });
      links.forEach(function (l, i) {
        l.classList.toggle("is-active", i === current);
      });

      ticking = false;
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  })();

  /* ── Mobile menu ─────────────────────────────────────── */
  (function menu() {
    var burger = $("#burger"),
      panel = $("#mobileMenu");
    if (!burger || !panel) return;

    function setOpen(open) {
      burger.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
    }
    burger.addEventListener("click", function () {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });
    panel.addEventListener("click", function (e) {
      if (e.target.tagName === "A") setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  })();

  /* ── Hero parallax ───────────────────────────────────── */
  if (!reduced) {
    var layers = $$("[data-parallax]");
    if (layers.length) {
      var px = 0,
        py = 0,
        tpx = 0,
        tpy = 0;

      window.addEventListener(
        "pointermove",
        function (e) {
          tpx = (e.clientX / window.innerWidth) * 2 - 1;
          tpy = (e.clientY / window.innerHeight) * 2 - 1;
        },
        { passive: true },
      );

      (function loop() {
        px += (tpx - px) * 0.06;
        py += (tpy - py) * 0.06;
        layers.forEach(function (l) {
          var depth = parseFloat(l.dataset.parallax) * 60;
          l.style.transform =
            "translate3d(" +
            (px * depth).toFixed(2) +
            "px," +
            (py * depth).toFixed(2) +
            "px,0)";
        });
        requestAnimationFrame(loop);
      })();
    }
  }

  /* ── Text scramble on hover ──────────────────────────── */
  (function scramble() {
    var CHARS = "!<>-_\\/[]{}—=+*^?#________ΔΞΣΩ01";
    $$("[data-glitch]").forEach(function (el) {
      var original = el.dataset.glitch;
      var raf = null,
        busy = false;

      function play() {
        if (busy || reduced) return;
        busy = true;
        el.classList.add("is-glitching");
        var frame = 0;
        var queue = original.split("").map(function (ch, i) {
          return {
            ch: ch,
            start: Math.floor(Math.random() * 12),
            end: Math.floor(Math.random() * 12) + i + 6,
          };
        });

        (function tick() {
          var out = "",
            done = 0;
          queue.forEach(function (q) {
            if (frame >= q.end) {
              out += q.ch;
              done++;
            } else if (frame >= q.start) {
              out += CHARS[Math.floor(Math.random() * CHARS.length)];
            } else {
              out += q.ch;
            }
          });
          el.textContent = out;
          if (done === queue.length) {
            el.textContent = original;
            el.classList.remove("is-glitching");
            busy = false;
            return;
          }
          frame++;
          raf = requestAnimationFrame(tick);
        })();
      }

      el.addEventListener("pointerenter", play);
      el.addEventListener("focus", play);
      window.addEventListener("pagehide", function () {
        if (raf) cancelAnimationFrame(raf);
      });
    });
  })();

  /* ── Smooth anchor scrolling ─────────────────────────── */
  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute("href");
    if (id === "#") return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
    history.replaceState(null, "", id);
  });

  /* ── Misc ────────────────────────────────────────────── */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  console.log(
    "%c mariuserok ",
    "background:linear-gradient(90deg,#22d3ee,#a855f7);color:#04060a;font-weight:700;padding:4px 8px;border-radius:4px;",
  );
})();
