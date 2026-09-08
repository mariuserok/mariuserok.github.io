/* ═══════════════════════════════════════════════════════════
   MART-OS 3.11 — a desktop that fits in one file
   Everything runs client-side. No network calls, no storage
   beyond a couple of UI preferences, no dependencies.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Tiny helpers ─────────────────────────────────────── */
  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pref(key, val) {
    try {
      if (val === undefined) return localStorage.getItem("martos:" + key);
      localStorage.setItem("martos:" + key, val);
    } catch (e) {
      /* private mode — preferences just won't persist */
    }
    return null;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /* ── Beeps ────────────────────────────────────────────── */
  var sound = pref("snd") === "1";
  var actx = null;
  function beep(freq, ms, type) {
    if (!sound) return;
    try {
      if (!actx)
        actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(actx.destination);
      var t = actx.currentTime;
      o.start(t);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.stop(t + ms / 1000);
    } catch (e) {
      sound = false;
    }
  }

  /* ── Clipboard ────────────────────────────────────────── */
  function copy(text, status) {
    if (!text) return say(status, "Nothing to copy.", "bad");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          say(status, "Copied " + text.length + " chars to clipboard.", "ok");
        },
        function () {
          say(
            status,
            "Clipboard blocked by the browser. Select + Ctrl-C.",
            "bad",
          );
        },
      );
    } else {
      say(status, "No clipboard API here. Select + Ctrl-C.", "bad");
    }
    beep(1400, 40);
  }

  function say(node, msg, kind) {
    if (!node) return;
    node.textContent = msg;
    node.className = "status" + (kind ? " is-" + kind : "");
  }

  /* ═══ BOOT SEQUENCE ═════════════════════════════════════ */
  var BOOT = [
    "<b>MART BIOS v3.11</b>  (C) 1995-2026 Marius Industries",
    "Aarhus, Denmark  ·  All rights reserved, most wrongs too",
    "",
    "CPU     : Caffeine-Driven Engineer @ 4.2 GHz",
    "Memory  : 640K conventional  <i>OK</i>",
    "          65536K extended    <i>OK</i>",
    "Cache   : L1 opinions enabled",
    "",
    "Detecting IDE drives ...",
    "  Primary Master   : ANGULAR-SSD      <i>OK</i>",
    "  Primary Slave    : DOTNET-CORE-8    <i>OK</i>",
    "  Secondary Master : GCP-HORIZON      <i>OK</i>",
    "  Secondary Slave  : <u>NODE_MODULES  NOT FOUND</u>",
    "",
    "Frameworks detected .......... <i>0</i>",
    "Build step required .......... <i>NO</i>",
    "Trackers loaded .............. <i>0</i>",
    "Vibes ........................ <i>IMMACULATE</i>",
    "",
    "Loading MART-OS 3.11 for Workgroups",
  ];

  function runBoot(done) {
    var out = $("#bootOut");
    var boot = $("#boot");
    var skipped = false;

    function finish() {
      if (skipped) return;
      skipped = true;
      document.removeEventListener("keydown", finish);
      boot.removeEventListener("pointerdown", finish);
      boot.classList.add("is-gone");
      beep(880, 70);
      setTimeout(
        function () {
          boot.remove();
          done();
        },
        reduced ? 0 : 450,
      );
    }

    document.addEventListener("keydown", finish);
    boot.addEventListener("pointerdown", finish);
    // Background tabs throttle timers to ~1s, which would strand the BIOS
    // screen for half a minute. Hard-stop the animation either way.
    setTimeout(finish, 6000);

    if (reduced) {
      out.innerHTML = BOOT.join("\n");
      setTimeout(finish, 400);
      return;
    }

    var i = 0;
    var cursor = document.createElement("span");
    cursor.className = "boot__cursor";

    (function tick() {
      if (skipped) return;
      if (i >= BOOT.length) {
        var dots = 0;
        var load = setInterval(function () {
          if (skipped) return clearInterval(load);
          out.appendChild(document.createTextNode("."));
          if (++dots > 8) {
            clearInterval(load);
            finish();
          }
        }, 90);
        return;
      }
      var line = document.createElement("div");
      line.innerHTML = BOOT[i] || "&nbsp;"; // fixed strings above, no user input
      out.appendChild(line);
      out.appendChild(cursor);
      if (BOOT[i].trim()) beep(1800 + (i % 5) * 120, 8, "square");
      i++;
      setTimeout(tick, BOOT[i - 1] === "" ? 30 : 62);
    })();
  }

  /* ═══ WINDOW MANAGER ════════════════════════════════════ */
  var layer = $("#windows");
  var taskbar = $("#tasks");
  var open = {}; // id -> win record
  var z = 10;
  var cascade = 0;

  // Measured live: a window opened before a resize must not end up stranded.
  function viewport() {
    return {
      w: layer.clientWidth || window.innerWidth || 1024,
      h: layer.clientHeight || window.innerHeight || 700,
    };
  }

  function focusWin(w) {
    Object.keys(open).forEach(function (k) {
      open[k].el.classList.remove("is-active");
      open[k].task.classList.remove("is-active");
    });
    w.el.classList.add("is-active");
    w.task.classList.add("is-active");
    w.el.classList.remove("is-min");
    w.el.style.zIndex = ++z;
    if (w.onFocus) w.onFocus();
  }

  function closeWin(w) {
    w.el.remove();
    w.task.remove();
    if (w.onClose) w.onClose();
    delete open[w.id];
    beep(320, 60);
    var rest = Object.keys(open);
    if (rest.length) focusWin(open[rest[rest.length - 1]]);
  }

  function drag(handle, onMove) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (e.target.closest(".win__btn")) return;
      var start = { x: e.clientX, y: e.clientY };
      handle.setPointerCapture(e.pointerId);
      var move = function (ev) {
        onMove(ev.clientX - start.x, ev.clientY - start.y);
        start.x = ev.clientX;
        start.y = ev.clientY;
      };
      var up = function () {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
      e.preventDefault();
    });
  }

  function openApp(id) {
    var app = APPS.filter(function (a) {
      return a.id === id;
    })[0];
    if (!app) return;
    // A shortcut, not a program — it leaves the desktop instead of opening a window.
    if (app.link) {
      beep(900, 60);
      window.open(app.link, "_blank", "noopener");
      return;
    }
    if (open[id]) return focusWin(open[id]);

    var el = document.createElement("section");
    el.className = "win";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", app.name);
    el.innerHTML =
      '<header class="win__bar">' +
      '<span class="win__title"></span>' +
      '<span class="win__btns">' +
      '<button class="win__btn" data-act="min" aria-label="Minimise">_</button>' +
      '<button class="win__btn" data-act="max" aria-label="Maximise">□</button>' +
      '<button class="win__btn win__btn--x" data-act="close" aria-label="Close">X</button>' +
      "</span></header>" +
      '<div class="win__body"></div>' +
      '<div class="win__grip" aria-hidden="true"></div>';
    $(".win__title", el).textContent = app.name;

    var vp = viewport();
    var w = clamp(app.w || 560, 300, vp.w - 24);
    var h = clamp(app.h || 420, 160, vp.h - 24);
    var off = (cascade++ % 7) * 26;
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.left = clamp(46 + off, 4, Math.max(4, vp.w - w - 4)) + "px";
    el.style.top = clamp(24 + off, 4, Math.max(4, vp.h - h - 4)) + "px";
    layer.appendChild(el);

    var task = document.createElement("button");
    task.className = "task";
    task.textContent = app.name;
    taskbar.appendChild(task);

    var rec = { id: id, el: el, task: task, body: $(".win__body", el) };
    open[id] = rec;

    task.addEventListener("click", function () {
      if (
        el.classList.contains("is-active") &&
        !el.classList.contains("is-min")
      ) {
        el.classList.add("is-min");
        task.classList.remove("is-active");
      } else focusWin(rec);
    });

    el.addEventListener("pointerdown", function () {
      if (!el.classList.contains("is-active")) focusWin(rec);
    });

    $(".win__btns", el).addEventListener("click", function (e) {
      var act = e.target.getAttribute("data-act");
      if (act === "close") closeWin(rec);
      else if (act === "min") {
        el.classList.add("is-min");
        task.classList.remove("is-active");
        beep(400, 40);
      } else if (act === "max") {
        el.classList.toggle("is-max");
        beep(700, 40);
        if (rec.onResize) rec.onResize();
      }
    });

    drag($(".win__bar", el), function (dx, dy) {
      if (el.classList.contains("is-max")) return;
      var v = viewport();
      el.style.left =
        clamp(el.offsetLeft + dx, -el.offsetWidth + 90, v.w - 60) + "px";
      el.style.top = clamp(el.offsetTop + dy, 0, v.h - 34) + "px";
    });

    drag($(".win__grip", el), function (dx, dy) {
      if (el.classList.contains("is-max")) return;
      var v = viewport();
      el.style.width = clamp(el.offsetWidth + dx, 300, v.w - 8) + "px";
      el.style.height = clamp(el.offsetHeight + dy, 160, v.h - 8) + "px";
      if (rec.onResize) rec.onResize();
    });

    app.build(rec.body, rec);
    focusWin(rec);
    beep(1000, 45);
    return rec;
  }

  /* ═══ APPS ══════════════════════════════════════════════ */
  /* Static markup is assigned via innerHTML; every piece of
     user-supplied data goes in with textContent. */

  var APPS = [];
  function app(def) {
    APPS.push(def);
  }

  /* ── Terminal ─────────────────────────────────────────── */
  app({
    id: "term",
    name: "Terminal",
    glyph: ">_",
    hint: "shell",
    w: 620,
    h: 400,
    build: function (body) {
      body.style.padding = "6px";
      body.innerHTML =
        '<div class="term">' +
        '<pre class="term__log"></pre>' +
        '<div class="term__line"><span class="term__ps1">C:\\MART&gt;</span>' +
        '<input class="term__in" spellcheck="false" autocomplete="off" aria-label="Command"></div>' +
        "</div>";
      var log = $(".term__log", body);
      var input = $(".term__in", body);
      var hist = [];
      var hi = -1;

      function print(text, cls) {
        var s = document.createElement("span");
        s.textContent = text + "\n";
        if (cls) s.className = cls;
        log.appendChild(s);
        log.scrollTop = log.scrollHeight;
      }

      print("MART-OS Command Interpreter [Version 3.11]");
      print("Type `help` for the list of commands.\n", "c-dim");

      var CMD = {
        help: function () {
          print("Available commands:");
          print(
            "  help              this list\n" +
              "  ls / dir          list installed programs\n" +
              "  open <app>        launch a program\n" +
              "  theme <name>      teal | amber | green | grape\n" +
              "  neofetch          system info, obviously\n" +
              "  whoami            identity crisis\n" +
              "  date              current date and time\n" +
              "  echo <text>       say it back\n" +
              "  roll <n>d<s>      dice, for planning poker\n" +
              "  clear             wipe the screen\n" +
              "  exit              close this terminal",
            "c-dim",
          );
        },
        ls: function () {
          APPS.forEach(function (a) {
            print("  " + a.id.padEnd(10) + a.name);
          });
        },
        open: function (arg) {
          if (!arg) return print("usage: open <app>   (try `ls`)", "c-bad");
          var hit = APPS.filter(function (a) {
            return a.id === arg.toLowerCase();
          })[0];
          if (!hit) return print("No such program: " + arg, "c-bad");
          openApp(hit.id);
          print("Launching " + hit.name + " ...", "c-ok");
        },
        theme: function (arg) {
          if (["teal", "amber", "green", "grape"].indexOf(arg) < 0)
            return print("usage: theme teal|amber|green|grape", "c-bad");
          setTheme(arg);
          print("Display adapter reconfigured: " + arg, "c-ok");
        },
        neofetch: function () {
          print(
            "       ◈◈◈        marius@mart-os\n" +
              "     ◈◈   ◈◈      ---------------\n" +
              "    ◈◈  ◈  ◈◈     OS:      MART-OS 3.11 for Workgroups\n" +
              "    ◈◈  ◈  ◈◈     Host:    IT Kort & Anlæg, OK a.m.b.a.\n" +
              "     ◈◈   ◈◈      Shell:   vanilla.js\n" +
              "       ◈◈◈        WM:      hand-rolled, 0 deps\n" +
              "                  Uptime:  since Dec 1st 2025\n" +
              "                  Pkgs:    " +
              APPS.length +
              " (built-in)\n" +
              "                  Theme:   " +
              desktop.getAttribute("data-theme"),
          );
        },
        whoami: function () {
          print("marius  (aka MART)  ·  Software Engineer  ·  Kort & Anlæg");
        },
        date: function () {
          print(new Date().toString());
        },
        echo: function (arg) {
          print(arg || "");
        },
        roll: function (arg) {
          var m = /^(\d{0,3})d(\d{1,3})$/.exec((arg || "1d6").trim());
          if (!m) return print("usage: roll 2d20", "c-bad");
          var n = clamp(parseInt(m[1] || "1", 10), 1, 100);
          var s = clamp(parseInt(m[2], 10), 2, 1000);
          var rolls = [];
          var sum = 0;
          for (var i = 0; i < n; i++) {
            var r = Math.floor(Math.random() * s) + 1;
            rolls.push(r);
            sum += r;
          }
          print(rolls.join(" + ") + (n > 1 ? "  =  " + sum : ""), "c-ok");
        },
        clear: function () {
          log.textContent = "";
        },
        exit: function () {
          closeWin(open.term);
        },
        sudo: function () {
          print("Nice try. You're already the administrator here.", "c-bad");
        },
      };
      CMD.dir = CMD.ls;
      CMD.cls = CMD.clear;

      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          if (!hist.length) return;
          hi = clamp(hi + (e.key === "ArrowUp" ? -1 : 1), 0, hist.length - 1);
          input.value = hist[hi];
          return;
        }
        if (e.key !== "Enter") return;
        var raw = input.value;
        input.value = "";
        print("C:\\MART> " + raw);
        beep(1500, 20);
        if (!raw.trim()) return;
        hist.push(raw);
        hi = hist.length;
        var sp = raw.trim().indexOf(" ");
        var cmd = (sp < 0 ? raw.trim() : raw.trim().slice(0, sp)).toLowerCase();
        var arg = sp < 0 ? "" : raw.trim().slice(sp + 1);
        if (CMD[cmd]) CMD[cmd](arg);
        else print("Bad command or file name: " + cmd, "c-bad");
      });

      $(".term", body).addEventListener("click", function () {
        input.focus();
      });
      setTimeout(function () {
        input.focus();
      }, 30);
    },
  });

  /* ── JSON Lab ─────────────────────────────────────────── */
  app({
    id: "json",
    name: "JSON Lab",
    glyph: "{}",
    hint: "format · validate · inspect",
    w: 660,
    h: 520,
    build: function (body) {
      body.innerHTML =
        '<div class="row">' +
        '<button class="btn btn--go" data-a="pretty">Prettify</button>' +
        '<button class="btn" data-a="min">Minify</button>' +
        '<button class="btn" data-a="sort">Sort keys</button>' +
        '<button class="btn" data-a="esc">To string</button>' +
        '<button class="btn" data-a="unesc">From string</button>' +
        '<span class="spacer"></span>' +
        '<span class="lbl">indent</span>' +
        '<select class="sel" data-indent><option>2</option><option>4</option><option>tab</option></select>' +
        '<button class="btn" data-a="copy">Copy</button>' +
        "</div>" +
        '<textarea class="ta" spellcheck="false" placeholder=\'{"paste":"your json here"}\'></textarea>' +
        '<div class="status"></div>' +
        '<div class="row" style="margin-top:8px"><span class="lbl">Result</span></div>' +
        '<pre class="out out--fixed"></pre>';

      var ta = $(".ta", body);
      var out = $(".out", body);
      var status = $(".status", body);
      var indent = $("[data-indent]", body);

      function ind() {
        var v = indent.value;
        return v === "tab" ? "\t" : parseInt(v, 10);
      }

      function parse() {
        var txt = ta.value.trim();
        if (!txt) throw new Error("Nothing to parse — the textarea is empty.");
        try {
          return JSON.parse(txt);
        } catch (err) {
          // JSON.parse messages carry a character offset; turn it into line:col
          var m = /position (\d+)/.exec(err.message);
          if (m) {
            var upto = txt.slice(0, parseInt(m[1], 10));
            var line = upto.split("\n").length;
            var col = upto.length - upto.lastIndexOf("\n");
            throw new Error(
              err.message + "  →  line " + line + ", column " + col,
            );
          }
          throw err;
        }
      }

      function sortDeep(v) {
        if (Array.isArray(v)) return v.map(sortDeep);
        if (v && typeof v === "object") {
          return Object.keys(v)
            .sort()
            .reduce(function (acc, k) {
              acc[k] = sortDeep(v[k]);
              return acc;
            }, {});
        }
        return v;
      }

      function stats(v) {
        var keys = 0,
          nodes = 0,
          depth = 0;
        (function walk(n, d) {
          nodes++;
          depth = Math.max(depth, d);
          if (Array.isArray(n))
            n.forEach(function (c) {
              walk(c, d + 1);
            });
          else if (n && typeof n === "object")
            Object.keys(n).forEach(function (k) {
              keys++;
              walk(n[k], d + 1);
            });
        })(v, 1);
        return nodes + " nodes · " + keys + " keys · depth " + depth;
      }

      function show(data) {
        out.textContent = JSON.stringify(data, null, ind());
        say(status, "Valid JSON — " + stats(data), "ok");
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (!a) return;
        try {
          if (a === "copy") return copy(out.textContent, status);
          if (a === "esc") {
            out.textContent = JSON.stringify(ta.value);
            return say(status, "Escaped into a JSON string literal.", "ok");
          }
          if (a === "unesc") {
            var un = JSON.parse(ta.value);
            if (typeof un !== "string")
              throw new Error("That is not a JSON string.");
            out.textContent = un;
            return say(status, "Unescaped.", "ok");
          }
          var data = parse();
          if (a === "pretty") show(data);
          if (a === "min") {
            out.textContent = JSON.stringify(data);
            say(
              status,
              "Minified: " +
                ta.value.length +
                " → " +
                out.textContent.length +
                " bytes",
              "ok",
            );
          }
          if (a === "sort") show(sortDeep(data));
        } catch (err) {
          out.textContent = "";
          say(status, err.message, "bad");
          beep(200, 120, "sawtooth");
        }
      });
    },
  });

  /* ── Base64 ───────────────────────────────────────────── */
  app({
    id: "b64",
    name: "Base64 Codec",
    glyph: "B64",
    hint: "encode · decode",
    w: 600,
    h: 460,
    build: function (body) {
      body.innerHTML =
        '<div class="row">' +
        '<button class="btn btn--go" data-a="enc">Encode ▼</button>' +
        '<button class="btn" data-a="dec">Decode ▲</button>' +
        '<label class="lbl"><input type="checkbox" data-url> URL-safe</label>' +
        '<span class="spacer"></span>' +
        '<button class="btn" data-a="copy">Copy</button>' +
        '<button class="btn" data-a="swap">⇅ Swap</button>' +
        "</div>" +
        '<textarea class="ta" data-in spellcheck="false" placeholder="plain text"></textarea>' +
        '<div class="status"></div>' +
        '<div class="row" style="margin-top:8px"><span class="lbl">Output</span></div>' +
        '<pre class="out"></pre>';

      var ta = $("[data-in]", body);
      var out = $(".out", body);
      var status = $(".status", body);
      var urlSafe = $("[data-url]", body);

      // btoa is latin1-only; round-trip through UTF-8 bytes so emoji survive
      function enc(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = "";
        bytes.forEach(function (b) {
          bin += String.fromCharCode(b);
        });
        var b = btoa(bin);
        return urlSafe.checked
          ? b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
          : b;
      }
      function dec(str) {
        var s = str.trim().replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) s += "=";
        var bin = atob(s);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (!a) return;
        try {
          if (a === "copy") return copy(out.textContent, status);
          if (a === "swap") {
            ta.value = out.textContent;
            out.textContent = "";
            return say(status, "Output moved to input.", "ok");
          }
          if (!ta.value) throw new Error("Give me something to work with.");
          out.textContent = a === "enc" ? enc(ta.value) : dec(ta.value);
          say(
            status,
            (a === "enc" ? "Encoded" : "Decoded") +
              " · " +
              ta.value.length +
              " → " +
              out.textContent.length +
              " chars",
            "ok",
          );
        } catch (err) {
          out.textContent = "";
          say(status, "That is not valid Base64.", "bad");
          beep(200, 120, "sawtooth");
        }
      });
    },
  });

  /* ── JWT ──────────────────────────────────────────────── */
  app({
    id: "jwt",
    name: "JWT Decoder",
    glyph: "JWT",
    hint: "inspect tokens",
    w: 640,
    h: 540,
    build: function (body) {
      body.innerHTML =
        '<div class="marq"><span>⚠ SIGNATURES ARE NOT VERIFIED — this decodes only. Never paste a production token into any tool you do not control. ⚠</span></div>' +
        '<textarea class="ta" style="min-height:90px" spellcheck="false" placeholder="eyJhbGciOi..."></textarea>' +
        '<div class="row" style="margin-top:8px"><button class="btn btn--go" data-a="go">Decode</button>' +
        '<button class="btn" data-a="clear">Clear</button></div>' +
        '<div class="status"></div>' +
        '<fieldset class="fieldset"><legend>Header</legend><pre class="out" data-h style="min-height:40px"></pre></fieldset>' +
        '<fieldset class="fieldset"><legend>Payload</legend><pre class="out" data-p style="min-height:40px"></pre></fieldset>' +
        '<fieldset class="fieldset"><legend>Claims</legend><dl class="kv" data-c></dl></fieldset>';

      var ta = $(".ta", body);
      var status = $(".status", body);
      var hOut = $("[data-h]", body);
      var pOut = $("[data-p]", body);
      var claims = $("[data-c]", body);

      function b64url(s) {
        var t = s.replace(/-/g, "+").replace(/_/g, "/");
        while (t.length % 4) t += "=";
        var bin = atob(t);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
      }

      function addClaim(k, v, kind) {
        var dt = document.createElement("dt");
        dt.textContent = k;
        var dd = document.createElement("dd");
        dd.textContent = v;
        if (kind) dd.style.color = kind === "bad" ? "var(--bad)" : "var(--ok)";
        claims.appendChild(dt);
        claims.appendChild(dd);
      }

      function go() {
        claims.textContent = "";
        hOut.textContent = pOut.textContent = "";
        var parts = ta.value.trim().split(".");
        if (parts.length < 2) {
          say(status, "A JWT has at least two dot-separated parts.", "bad");
          return beep(200, 120, "sawtooth");
        }
        try {
          var head = b64url(parts[0]);
          var load = b64url(parts[1]);
          hOut.textContent = JSON.stringify(head, null, 2);
          pOut.textContent = JSON.stringify(load, null, 2);

          var now = Date.now() / 1000;
          addClaim(
            "algorithm",
            head.alg || "—",
            head.alg === "none" ? "bad" : "",
          );
          if (load.exp) {
            var left = load.exp - now;
            addClaim(
              "expires",
              new Date(load.exp * 1000).toLocaleString() +
                (left > 0
                  ? "  (in " + human(left) + ")"
                  : "  (EXPIRED " + human(-left) + " ago)"),
              left > 0 ? "ok" : "bad",
            );
          }
          if (load.iat)
            addClaim("issued", new Date(load.iat * 1000).toLocaleString());
          if (load.nbf)
            addClaim("not before", new Date(load.nbf * 1000).toLocaleString());
          ["iss", "aud", "sub", "scope"].forEach(function (k) {
            if (load[k]) addClaim(k, String(load[k]));
          });
          addClaim(
            "signature",
            parts[2] ? parts[2].slice(0, 24) + "… (unverified)" : "none",
          );
          say(status, "Decoded. Signature was NOT checked.", "ok");
        } catch (err) {
          say(status, "Could not decode — malformed Base64URL or JSON.", "bad");
          beep(200, 120, "sawtooth");
        }
      }

      function human(s) {
        s = Math.abs(Math.round(s));
        if (s < 60) return s + "s";
        if (s < 3600) return Math.round(s / 60) + "m";
        if (s < 86400) return Math.round(s / 3600) + "h";
        return Math.round(s / 86400) + "d";
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (a === "go") go();
        if (a === "clear") {
          ta.value = "";
          claims.textContent = "";
          hOut.textContent = pOut.textContent = "";
          say(status, "");
        }
      });
    },
  });

  /* ── Hasher ───────────────────────────────────────────── */
  app({
    id: "hash",
    name: "Hasher",
    glyph: "#",
    hint: "SHA + CRC32",
    w: 600,
    h: 430,
    build: function (body) {
      body.innerHTML =
        '<textarea class="ta" spellcheck="false" placeholder="text to digest"></textarea>' +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn btn--go" data-a="go">Compute all</button>' +
        '<label class="lbl"><input type="checkbox" data-up> UPPERCASE</label>' +
        "</div>" +
        '<div class="status"></div>' +
        '<dl class="kv" data-res style="margin-top:8px"></dl>';

      var ta = $(".ta", body);
      var res = $("[data-res]", body);
      var status = $(".status", body);
      var up = $("[data-up]", body);

      function crc32(str) {
        var bytes = new TextEncoder().encode(str);
        var c,
          crc = 0xffffffff;
        for (var i = 0; i < bytes.length; i++) {
          c = (crc ^ bytes[i]) & 0xff;
          for (var j = 0; j < 8; j++)
            c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
          crc = (crc >>> 8) ^ c;
        }
        return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
      }

      function hex(buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      }

      function line(k, v) {
        var dt = document.createElement("dt");
        dt.textContent = k;
        var dd = document.createElement("dd");
        dd.textContent = up.checked ? v.toUpperCase() : v;
        dd.style.cursor = "pointer";
        dd.title = "click to copy";
        dd.addEventListener("click", function () {
          copy(dd.textContent, status);
        });
        res.appendChild(dt);
        res.appendChild(dd);
      }

      $("[data-a=go]", body).addEventListener("click", function () {
        res.textContent = "";
        var txt = ta.value;
        if (!txt)
          return say(
            status,
            "Empty input hashes just fine, but try text.",
            "bad",
          );
        line("crc32", crc32(txt));
        line(
          "length",
          txt.length +
            " chars / " +
            new TextEncoder().encode(txt).length +
            " bytes",
        );
        if (!window.crypto || !crypto.subtle) {
          return say(
            status,
            "SHA needs a secure context (https or localhost).",
            "bad",
          );
        }
        var data = new TextEncoder().encode(txt);
        var algs = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        Promise.all(
          algs.map(function (a) {
            return crypto.subtle.digest(a, data);
          }),
        ).then(function (bufs) {
          bufs.forEach(function (b, i) {
            line(algs[i].toLowerCase(), hex(b));
          });
          say(status, "Digested. Click any value to copy.", "ok");
          beep(1200, 50);
        });
      });
    },
  });

  /* ── ID Forge ─────────────────────────────────────────── */
  app({
    id: "uuid",
    name: "ID Forge",
    glyph: "ID",
    hint: "uuid · nanoid · ulid",
    w: 560,
    h: 420,
    build: function (body) {
      body.innerHTML =
        '<div class="row">' +
        '<span class="lbl">Kind</span>' +
        '<select class="sel" data-kind>' +
        '<option value="v4">UUID v4</option>' +
        '<option value="ulid">ULID (sortable)</option>' +
        '<option value="nano">Nano ID (21)</option>' +
        '<option value="short">Short ID (8)</option>' +
        '<option value="hex">Hex key (32)</option>' +
        "</select>" +
        '<span class="lbl">How many</span>' +
        '<input class="fld fld--sm" data-n type="number" value="8" min="1" max="500">' +
        '<label class="lbl"><input type="checkbox" data-caps> CAPS</label>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--go" data-a="go">Forge</button>' +
        '<button class="btn" data-a="copy">Copy</button>' +
        "</div>" +
        '<pre class="out out--fixed" style="max-height:none;min-height:230px"></pre>' +
        '<div class="status"></div>';

      var out = $(".out", body);
      var status = $(".status", body);
      var kind = $("[data-kind]", body);
      var n = $("[data-n]", body);
      var caps = $("[data-caps]", body);

      function rnd(len) {
        var a = new Uint8Array(len);
        crypto.getRandomValues(a);
        return a;
      }
      function fromAlphabet(len, alpha) {
        var a = rnd(len),
          s = "";
        for (var i = 0; i < len; i++) s += alpha[a[i] % alpha.length];
        return s;
      }
      function uuid4() {
        if (crypto.randomUUID) return crypto.randomUUID();
        var b = rnd(16);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var h = Array.prototype.map
          .call(b, function (x) {
            return x.toString(16).padStart(2, "0");
          })
          .join("");
        return [
          h.slice(0, 8),
          h.slice(8, 12),
          h.slice(12, 16),
          h.slice(16, 20),
          h.slice(20),
        ].join("-");
      }
      function ulid() {
        var A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
        var t = Date.now(),
          time = "";
        for (var i = 9; i >= 0; i--) {
          time = A[t % 32] + time;
          t = Math.floor(t / 32);
        }
        return time + fromAlphabet(16, A);
      }

      function go() {
        var count = clamp(parseInt(n.value, 10) || 1, 1, 500);
        var list = [];
        for (var i = 0; i < count; i++) {
          var v;
          if (kind.value === "v4") v = uuid4();
          else if (kind.value === "ulid") v = ulid();
          else if (kind.value === "nano")
            v = fromAlphabet(
              21,
              "useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict",
            );
          else if (kind.value === "short")
            v = fromAlphabet(8, "23456789ABCDEFGHJKLMNPQRSTUVWXYZ");
          else
            v = Array.prototype.map
              .call(rnd(16), function (x) {
                return x.toString(16).padStart(2, "0");
              })
              .join("");
          list.push(caps.checked ? v.toUpperCase() : v);
        }
        out.textContent = list.join("\n");
        say(
          status,
          count + " identifiers, generated with crypto.getRandomValues.",
          "ok",
        );
        beep(1600, 30);
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (a === "go") go();
        if (a === "copy") copy(out.textContent, status);
      });
      go();
    },
  });

  /* ── URL codec ────────────────────────────────────────── */
  app({
    id: "url",
    name: "URL Codec",
    glyph: "%",
    hint: "encode · parse query",
    w: 620,
    h: 470,
    build: function (body) {
      body.innerHTML =
        '<div class="row">' +
        '<button class="btn btn--go" data-a="enc">Encode</button>' +
        '<button class="btn" data-a="dec">Decode</button>' +
        '<button class="btn" data-a="comp">Encode (component)</button>' +
        '<button class="btn" data-a="parse">Parse URL</button>' +
        "</div>" +
        '<textarea class="ta" style="min-height:90px" spellcheck="false" placeholder="https://example.com/path?a=1&amp;b=hello world"></textarea>' +
        '<div class="status"></div>' +
        '<pre class="out" style="margin-top:8px"></pre>' +
        '<dl class="kv" data-parts style="margin-top:8px"></dl>';

      var ta = $(".ta", body);
      var out = $(".out", body);
      var parts = $("[data-parts]", body);
      var status = $(".status", body);

      function kv(k, v) {
        var dt = document.createElement("dt");
        dt.textContent = k;
        var dd = document.createElement("dd");
        dd.textContent = v;
        parts.appendChild(dt);
        parts.appendChild(dd);
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (!a) return;
        parts.textContent = "";
        out.textContent = "";
        try {
          if (a === "enc") out.textContent = encodeURI(ta.value);
          if (a === "comp") out.textContent = encodeURIComponent(ta.value);
          if (a === "dec") out.textContent = decodeURIComponent(ta.value);
          if (a === "parse") {
            var u = new URL(ta.value.trim());
            kv("protocol", u.protocol);
            kv("host", u.host);
            if (u.port) kv("port", u.port);
            kv("path", u.pathname);
            if (u.hash) kv("hash", u.hash);
            var any = false;
            u.searchParams.forEach(function (v, k) {
              kv("? " + k, v);
              any = true;
            });
            if (!any) kv("query", "(none)");
            return say(status, "Parsed.", "ok");
          }
          say(status, "Done — " + out.textContent.length + " chars.", "ok");
        } catch (err) {
          say(
            status,
            a === "parse"
              ? "Not a valid absolute URL."
              : "Malformed percent-encoding.",
            "bad",
          );
          beep(200, 120, "sawtooth");
        }
      });
    },
  });

  /* ── Epoch machine ────────────────────────────────────── */
  app({
    id: "time",
    name: "Epoch Machine",
    glyph: "T",
    hint: "timestamps",
    w: 600,
    h: 470,
    build: function (body, rec) {
      body.innerHTML =
        '<fieldset class="fieldset"><legend>Right now</legend>' +
        '<dl class="kv" data-now></dl></fieldset>' +
        '<fieldset class="fieldset"><legend>Convert</legend>' +
        '<div class="row"><input class="fld" data-in placeholder="1767225600  ·  2026-01-01T00:00:00Z  ·  now"></div>' +
        '<div class="row"><button class="btn btn--go" data-a="go">Convert</button>' +
        '<button class="btn" data-a="now">Use now</button>' +
        '<button class="btn" data-a="copy">Copy ISO</button></div>' +
        '<dl class="kv" data-res></dl></fieldset>' +
        '<div class="status"></div>';

      var now = $("[data-now]", body);
      var res = $("[data-res]", body);
      var input = $("[data-in]", body);
      var status = $(".status", body);
      var iso = "";

      function fill(dl, pairs) {
        dl.textContent = "";
        pairs.forEach(function (p) {
          var dt = document.createElement("dt");
          dt.textContent = p[0];
          var dd = document.createElement("dd");
          dd.textContent = p[1];
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
      }

      function tick() {
        var d = new Date();
        fill(now, [
          ["unix (s)", String(Math.floor(d.getTime() / 1000))],
          ["unix (ms)", String(d.getTime())],
          ["iso 8601", d.toISOString()],
          ["local", d.toString().replace(/ \(.*\)$/, "")],
          ["zone", Intl.DateTimeFormat().resolvedOptions().timeZone],
        ]);
      }
      tick();
      var timer = setInterval(tick, 1000);
      rec.onClose = function () {
        clearInterval(timer);
      };

      function rel(d) {
        var diff = (d.getTime() - Date.now()) / 1000;
        var abs = Math.abs(diff);
        var units = [
          [31536000, "year"],
          [2592000, "month"],
          [86400, "day"],
          [3600, "hour"],
          [60, "minute"],
          [1, "second"],
        ];
        for (var i = 0; i < units.length; i++) {
          if (abs >= units[i][0]) {
            var n = Math.round(abs / units[i][0]);
            return (
              n +
              " " +
              units[i][1] +
              (n === 1 ? "" : "s") +
              (diff < 0 ? " ago" : " from now")
            );
          }
        }
        return "right now";
      }

      function convert() {
        var raw = input.value.trim();
        var d;
        if (!raw || raw.toLowerCase() === "now") d = new Date();
        else if (/^-?\d{1,11}$/.test(raw))
          d = new Date(parseInt(raw, 10) * 1000);
        else if (/^-?\d{12,}$/.test(raw)) d = new Date(parseInt(raw, 10));
        else d = new Date(raw);

        if (isNaN(d.getTime())) {
          res.textContent = "";
          return say(
            status,
            "Could not read that as a date or timestamp.",
            "bad",
          );
        }
        iso = d.toISOString();
        fill(res, [
          ["unix (s)", String(Math.floor(d.getTime() / 1000))],
          ["unix (ms)", String(d.getTime())],
          ["iso 8601", iso],
          ["utc", d.toUTCString()],
          ["local", d.toLocaleString()],
          ["relative", rel(d)],
          ["weekday", d.toLocaleDateString(undefined, { weekday: "long" })],
          ["week no.", String(isoWeek(d))],
        ]);
        say(status, "Converted.", "ok");
      }

      function isoWeek(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
        var start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return Math.ceil(((t - start) / 86400000 + 1) / 7);
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (a === "go") convert();
        if (a === "now") {
          input.value = String(Math.floor(Date.now() / 1000));
          convert();
        }
        if (a === "copy") copy(iso, status);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") convert();
      });
    },
  });

  /* ── Regex lab ────────────────────────────────────────── */
  app({
    id: "regex",
    name: "Regex Lab",
    glyph: ".*",
    hint: "test · highlight",
    w: 640,
    h: 500,
    build: function (body) {
      body.innerHTML =
        '<div class="row row--tight">' +
        '<span class="lbl">/</span><input class="fld" data-pat placeholder="\\b(\\w+)@(\\w+)\\.\\w+" style="flex:1">' +
        '<span class="lbl">/</span><input class="fld fld--sm" data-flags value="gi" style="width:70px">' +
        "</div>" +
        '<textarea class="ta" data-subj spellcheck="false" placeholder="test string">Reach me at mart@ok.dk or shout across the office.</textarea>' +
        '<div class="status"></div>' +
        '<div class="row" style="margin-top:8px"><span class="lbl">Highlighted</span></div>' +
        '<pre class="out hl" data-hl></pre>' +
        '<div class="row" style="margin-top:8px"><span class="lbl">Matches</span></div>' +
        '<pre class="out" data-m style="min-height:70px"></pre>';

      var pat = $("[data-pat]", body);
      var flags = $("[data-flags]", body);
      var subj = $("[data-subj]", body);
      var hl = $("[data-hl]", body);
      var mOut = $("[data-m]", body);
      var status = $(".status", body);

      function run() {
        hl.textContent = "";
        mOut.textContent = "";
        if (!pat.value) return say(status, "Enter a pattern.", "");
        if (subj.value.length > 200000)
          return say(
            status,
            "Subject too large — keep it under 200 000 chars.",
            "bad",
          );
        var re;
        try {
          var f = flags.value.replace(/[^gimsuy]/g, "");
          if (f.indexOf("g") < 0) f += "g";
          re = new RegExp(pat.value, f);
        } catch (err) {
          return say(status, "Invalid pattern: " + err.message, "bad");
        }

        var text = subj.value;
        var last = 0;
        var count = 0;
        var lines = [];
        var m;
        var guard = 0;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          if (++guard > 5000) break;
          if (m.index >= last) {
            hl.appendChild(document.createTextNode(text.slice(last, m.index)));
            var mk = document.createElement("mark");
            mk.textContent = m[0];
            hl.appendChild(mk);
            last = m.index + m[0].length;
          }
          count++;
          var row = "#" + count + " @" + m.index + "  " + JSON.stringify(m[0]);
          for (var g = 1; g < m.length; g++)
            row +=
              "\n     $" +
              g +
              " = " +
              (m[g] === undefined ? "(no match)" : JSON.stringify(m[g]));
          if (m.groups)
            Object.keys(m.groups).forEach(function (k) {
              row += "\n     <" + k + "> = " + JSON.stringify(m.groups[k]);
            });
          lines.push(row);
          if (m[0] === "") re.lastIndex++; // zero-length match: step forward or loop forever
        }
        hl.appendChild(document.createTextNode(text.slice(last)));
        mOut.textContent = lines.join("\n") || "(no matches)";
        say(
          status,
          count +
            (count === 1 ? " match" : " matches") +
            (guard > 5000 ? " — stopped at 5000" : ""),
          count ? "ok" : "",
        );
      }

      [pat, flags, subj].forEach(function (el) {
        el.addEventListener("input", run);
      });
      run();
    },
  });

  /* ── Diff ─────────────────────────────────────────────── */
  app({
    id: "diff",
    name: "Diff-o-Matic",
    glyph: "±",
    hint: "compare text",
    w: 700,
    h: 520,
    build: function (body) {
      body.innerHTML =
        '<div class="grid2">' +
        '<div><div class="lbl">Original</div><textarea class="ta" data-a1 spellcheck="false"></textarea></div>' +
        '<div><div class="lbl">Changed</div><textarea class="ta" data-b1 spellcheck="false"></textarea></div>' +
        "</div>" +
        '<div class="row" style="margin-top:8px"><button class="btn btn--go" data-a="go">Compare</button>' +
        '<label class="lbl"><input type="checkbox" data-ws checked> ignore trailing space</label>' +
        '<label class="lbl"><input type="checkbox" data-ctx> only changes</label></div>' +
        '<div class="status"></div>' +
        '<pre class="out out--fixed diff" data-out style="margin-top:8px"></pre>';

      var A = $("[data-a1]", body);
      var B = $("[data-b1]", body);
      var out = $("[data-out]", body);
      var status = $(".status", body);
      var ws = $("[data-ws]", body);
      var ctx = $("[data-ctx]", body);

      function lcsDiff(a, b) {
        var n = a.length,
          m = b.length;
        var dp = [];
        for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
        for (i = n - 1; i >= 0; i--)
          for (var j = m - 1; j >= 0; j--)
            dp[i][j] =
              a[i] === b[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        var res = [];
        i = 0;
        j = 0;
        while (i < n && j < m) {
          if (a[i] === b[j]) (res.push(["=", a[i++]]), j++);
          else if (dp[i + 1][j] >= dp[i][j + 1]) res.push(["-", a[i++]]);
          else res.push(["+", b[j++]]);
        }
        while (i < n) res.push(["-", a[i++]]);
        while (j < m) res.push(["+", b[j++]]);
        return res;
      }

      $("[data-a=go]", body).addEventListener("click", function () {
        var norm = function (s) {
          return ws.checked ? s.replace(/[ \t]+$/, "") : s;
        };
        var a = A.value.split("\n").map(norm);
        var b = B.value.split("\n").map(norm);
        if (a.length > 2500 || b.length > 2500) {
          return say(
            status,
            "Keep it under 2500 lines per side — this is an O(n·m) diff.",
            "bad",
          );
        }
        out.textContent = "";
        var d = lcsDiff(a, b);
        var add = 0,
          del = 0;
        d.forEach(function (row) {
          if (row[0] === "+") add++;
          if (row[0] === "-") del++;
          if (ctx.checked && row[0] === "=") return;
          var s = document.createElement("span");
          s.className =
            row[0] === "+" ? "d-add" : row[0] === "-" ? "d-del" : "d-eq";
          s.textContent = row[0] + " " + row[1];
          out.appendChild(s);
        });
        say(
          status,
          add +
            " added · " +
            del +
            " removed" +
            (add + del ? "" : " — files are identical"),
          add + del ? "ok" : "",
        );
        beep(add + del ? 900 : 1400, 50);
      });
    },
  });

  /* ── Colour lab ───────────────────────────────────────── */
  app({
    id: "color",
    name: "Colour Lab",
    glyph: "RGB",
    hint: "convert · contrast",
    w: 560,
    h: 520,
    build: function (body) {
      body.innerHTML =
        '<div class="row"><input class="fld" data-in value="#22d3ee" placeholder="#22d3ee · rgb(34,211,238) · hsl(187 84% 53%)">' +
        '<input type="color" data-pick value="#22d3ee" style="width:52px;height:34px;padding:0;border:2px solid var(--face-dkr)"></div>' +
        '<div class="swatch" data-sw></div>' +
        '<div class="ramp" data-ramp></div>' +
        '<div class="status"></div>' +
        '<dl class="kv" data-res style="margin-top:8px"></dl>';

      var input = $("[data-in]", body);
      var pick = $("[data-pick]", body);
      var sw = $("[data-sw]", body);
      var ramp = $("[data-ramp]", body);
      var res = $("[data-res]", body);
      var status = $(".status", body);

      function parse(str) {
        var s = str.trim().toLowerCase();
        var m;
        if ((m = /^#?([0-9a-f]{3})$/.exec(s)))
          return [
            parseInt(m[1][0] + m[1][0], 16),
            parseInt(m[1][1] + m[1][1], 16),
            parseInt(m[1][2] + m[1][2], 16),
          ];
        if ((m = /^#?([0-9a-f]{6})$/.exec(s)))
          return [
            parseInt(m[1].slice(0, 2), 16),
            parseInt(m[1].slice(2, 4), 16),
            parseInt(m[1].slice(4, 6), 16),
          ];
        if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s)))
          return [+m[1], +m[2], +m[3]].map(function (v) {
            return clamp(v, 0, 255);
          });
        if ((m = /^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/.exec(s)))
          return hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100);
        return null;
      }

      function hsl2rgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        var m = l - c / 2;
        var r = [
          [c, x, 0],
          [x, c, 0],
          [0, c, x],
          [0, x, c],
          [x, 0, c],
          [c, 0, x],
        ][Math.floor(h / 60) % 6];
        return r.map(function (v) {
          return Math.round((v + m) * 255);
        });
      }

      function rgb2hsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        var mx = Math.max(r, g, b),
          mn = Math.min(r, g, b),
          d = mx - mn;
        var l = (mx + mn) / 2;
        var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        var h = 0;
        if (d !== 0) {
          if (mx === r) h = ((g - b) / d) % 6;
          else if (mx === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        return [h, Math.round(s * 100), Math.round(l * 100)];
      }

      function hex(rgb) {
        return (
          "#" +
          rgb
            .map(function (v) {
              return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
            })
            .join("")
        );
      }

      function lum(rgb) {
        var a = rgb.map(function (v) {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      }
      function ratio(a, b) {
        var l1 = lum(a),
          l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      function grade(r) {
        return r >= 7
          ? "AAA"
          : r >= 4.5
            ? "AA"
            : r >= 3
              ? "AA large only"
              : "fails";
      }

      function kv(k, v, click) {
        var dt = document.createElement("dt");
        dt.textContent = k;
        var dd = document.createElement("dd");
        dd.textContent = v;
        if (click !== false) {
          dd.style.cursor = "pointer";
          dd.title = "click to copy";
          dd.addEventListener("click", function () {
            copy(v, status);
          });
        }
        res.appendChild(dt);
        res.appendChild(dd);
      }

      function render() {
        var rgb = parse(input.value);
        if (!rgb) {
          res.textContent = "";
          return say(
            status,
            "Unrecognised colour. Try #22d3ee or rgb(34,211,238).",
            "bad",
          );
        }
        var h = hex(rgb);
        var hs = rgb2hsl(rgb[0], rgb[1], rgb[2]);
        pick.value = h;
        sw.style.background = h;
        sw.style.color = lum(rgb) > 0.35 ? "#000" : "#fff";
        sw.textContent = h.toUpperCase();

        ramp.textContent = "";
        for (var i = 0; i < 10; i++) {
          var l = 5 + i * 10;
          var c = hex(hsl2rgb(hs[0], hs[1] / 100, l / 100));
          var bar = document.createElement("i");
          bar.style.background = c;
          bar.title = c;
          ramp.appendChild(bar);
        }

        res.textContent = "";
        kv("hex", h);
        kv("rgb", "rgb(" + rgb.join(", ") + ")");
        kv("hsl", "hsl(" + hs[0] + " " + hs[1] + "% " + hs[2] + "%)");
        kv("css var", "--brand: " + h + ";");
        var onWhite = ratio(rgb, [255, 255, 255]);
        var onBlack = ratio(rgb, [0, 0, 0]);
        kv("on white", onWhite.toFixed(2) + " : 1  → " + grade(onWhite), false);
        kv("on black", onBlack.toFixed(2) + " : 1  → " + grade(onBlack), false);
        kv("luminance", lum(rgb).toFixed(4), false);
        say(status, "Click any value to copy it.", "ok");
      }

      input.addEventListener("input", render);
      pick.addEventListener("input", function () {
        input.value = pick.value;
        render();
      });
      render();
    },
  });

  /* ── Case bender ──────────────────────────────────────── */
  app({
    id: "case",
    name: "Case Bender",
    glyph: "Aa",
    hint: "camel · kebab · slug",
    w: 600,
    h: 470,
    build: function (body) {
      body.innerHTML =
        '<textarea class="ta" style="min-height:80px" spellcheck="false" placeholder="Vaskeportal Sponsor Report">Horizon migration checklist</textarea>' +
        '<div class="status"></div>' +
        '<dl class="kv" data-res style="margin-top:8px"></dl>';

      var ta = $(".ta", body);
      var res = $("[data-res]", body);
      var status = $(".status", body);

      function words(s) {
        return s
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/[_\-.]+/g, " ")
          .replace(/[^\p{L}\p{N} ]+/gu, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
      }

      function render() {
        var w = words(ta.value);
        var lower = w.map(function (x) {
          return x.toLowerCase();
        });
        var caps = lower.map(function (x) {
          return x.charAt(0).toUpperCase() + x.slice(1);
        });
        var forms = [
          ["camelCase", lower[0] ? lower[0] + caps.slice(1).join("") : ""],
          ["PascalCase", caps.join("")],
          ["snake_case", lower.join("_")],
          ["SCREAMING_SNAKE", lower.join("_").toUpperCase()],
          ["kebab-case", lower.join("-")],
          ["Title Case", caps.join(" ")],
          [
            "Sentence case",
            caps.length ? caps[0] + " " + lower.slice(1).join(" ") : "",
          ],
          ["UPPER", ta.value.toUpperCase()],
          ["lower", ta.value.toLowerCase()],
          ["url-slug", lower.join("-").replace(/[^a-z0-9-]/g, "")],
          ["dot.path", lower.join(".")],
          [
            "sPoNgEbOb",
            ta.value
              .split("")
              .map(function (c, i) {
                return i % 2 ? c.toUpperCase() : c.toLowerCase();
              })
              .join(""),
          ],
          ["reversed", ta.value.split("").reverse().join("")],
        ];
        res.textContent = "";
        forms.forEach(function (f) {
          var dt = document.createElement("dt");
          dt.textContent = f[0];
          var dd = document.createElement("dd");
          dd.textContent = f[1];
          dd.style.cursor = "pointer";
          dd.title = "click to copy";
          dd.addEventListener("click", function () {
            copy(f[1], status);
          });
          res.appendChild(dt);
          res.appendChild(dd);
        });
        say(
          status,
          w.length +
            " words · " +
            ta.value.length +
            " chars · " +
            ta.value.split(/\n/).length +
            " lines",
          "",
        );
      }
      ta.addEventListener("input", render);
      render();
    },
  });

  /* ── Lorem ────────────────────────────────────────────── */
  app({
    id: "lorem",
    name: "Lorem 5000",
    glyph: "¶",
    hint: "filler text",
    w: 600,
    h: 460,
    build: function (body) {
      body.innerHTML =
        '<div class="row">' +
        '<span class="lbl">Flavour</span>' +
        '<select class="sel" data-kind><option value="latin">Classic Latin</option>' +
        '<option value="corp">Corporate</option><option value="dev">Developer</option>' +
        '<option value="hacker">1337 Hacker</option></select>' +
        '<span class="lbl">Paragraphs</span><input class="fld fld--sm" data-n type="number" value="3" min="1" max="30">' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--go" data-a="go">Generate</button>' +
        '<button class="btn" data-a="copy">Copy</button></div>' +
        '<pre class="out" style="min-height:250px;max-height:none"></pre>' +
        '<div class="status"></div>';

      var BANK = {
        latin:
          "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum",
        corp: "synergy leverage stakeholder alignment roadmap deliverable bandwidth paradigm holistic scalable actionable insight touchpoint deep dive circle back low hanging fruit move the needle value add core competency best practice north star quarterly outcome cadence workstream enablement transformation journey ideation blue sky operationalise",
        dev: "refactor deploy rollback container pipeline artifact dependency injection idempotent eventually consistent race condition null reference stack trace hotfix technical debt code review merge conflict feature flag observability latency throughput cache invalidation off by one works on my machine ship it",
        hacker:
          "mainframe firewall proxy payload zero day root shell kernel panic packet sniffer encryption backdoor daemon buffer overflow honeypot rainbow table brute force social engineering air gap dark fibre mesh node handshake protocol override access granted",
      };

      var out = $(".out", body);
      var status = $(".status", body);
      var kind = $("[data-kind]", body);
      var n = $("[data-n]", body);

      function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
      }

      function go() {
        var bank = BANK[kind.value].split(" ");
        var count = clamp(parseInt(n.value, 10) || 1, 1, 30);
        var paras = [];
        for (var p = 0; p < count; p++) {
          var sentences = [];
          var sc = 3 + Math.floor(Math.random() * 4);
          for (var s = 0; s < sc; s++) {
            var wc = 6 + Math.floor(Math.random() * 12);
            var w = [];
            for (var i = 0; i < wc; i++) w.push(pick(bank));
            var sentence = w.join(" ");
            sentences.push(
              sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".",
            );
          }
          paras.push(sentences.join(" "));
        }
        if (kind.value === "latin") paras[0] = "Lorem ipsum " + paras[0];
        out.textContent = paras.join("\n\n");
        say(
          status,
          count +
            " paragraphs · " +
            out.textContent.split(/\s+/).length +
            " words · " +
            out.textContent.length +
            " chars",
          "ok",
        );
      }

      body.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        if (a === "go") go();
        if (a === "copy") copy(out.textContent, status);
      });
      go();
    },
  });

  /* ── Base converter ───────────────────────────────────── */
  app({
    id: "base",
    name: "Base Converter",
    glyph: "01",
    hint: "bin · oct · dec · hex",
    w: 560,
    h: 430,
    build: function (body) {
      body.innerHTML =
        '<fieldset class="fieldset"><legend>Enter a value in any field</legend>' +
        '<div class="row"><span class="lbl" style="width:74px">DEC 10</span><input class="fld" data-b="10" style="flex:1"></div>' +
        '<div class="row"><span class="lbl" style="width:74px">HEX 16</span><input class="fld" data-b="16" style="flex:1"></div>' +
        '<div class="row"><span class="lbl" style="width:74px">OCT 8</span><input class="fld" data-b="8" style="flex:1"></div>' +
        '<div class="row"><span class="lbl" style="width:74px">BIN 2</span><input class="fld" data-b="2" style="flex:1"></div>' +
        '<div class="row"><span class="lbl" style="width:74px">B36</span><input class="fld" data-b="36" style="flex:1"></div>' +
        "</fieldset>" +
        '<div class="status"></div>' +
        '<dl class="kv" data-extra style="margin-top:8px"></dl>';

      var fields = $$("[data-b]", body);
      var status = $(".status", body);
      var extra = $("[data-extra]", body);

      function render(value, from) {
        fields.forEach(function (f) {
          if (f === from) return;
          var b = parseInt(f.getAttribute("data-b"), 10);
          f.value = value === null ? "" : value.toString(b).toUpperCase();
        });
        extra.textContent = "";
        if (value === null) return;
        var bits = value === 0 ? 1 : Math.floor(Math.log2(Math.abs(value))) + 1;
        [
          ["bits needed", String(bits)],
          [
            "bytes",
            value / 1024 >= 1
              ? (value / 1024).toFixed(2) + " KiB"
              : value + " B",
          ],
          [
            "as char",
            value > 31 && value < 1114112 ? String.fromCodePoint(value) : "—",
          ],
          [
            "padded bin",
            value.toString(2).padStart(Math.ceil(bits / 8) * 8, "0"),
          ],
          [
            "is power of 2",
            (value & (value - 1)) === 0 && value > 0 ? "yes" : "no",
          ],
        ].forEach(function (p) {
          var dt = document.createElement("dt");
          dt.textContent = p[0];
          var dd = document.createElement("dd");
          dd.textContent = p[1];
          extra.appendChild(dt);
          extra.appendChild(dd);
        });
      }

      fields.forEach(function (f) {
        f.addEventListener("input", function () {
          var b = parseInt(f.getAttribute("data-b"), 10);
          var raw = f.value.trim().replace(/^0[xbo]/i, "");
          if (!raw) return (render(null, f), say(status, ""));
          var v = parseInt(raw, b);
          if (isNaN(v) || !new RegExp("^[0-9a-z]+$", "i").test(raw)) {
            return say(status, "Not a valid base-" + b + " number.", "bad");
          }
          if (v > Number.MAX_SAFE_INTEGER) {
            return say(
              status,
              "Beyond 2^53 — JavaScript would start lying to you.",
              "bad",
            );
          }
          render(v, f);
          say(status, "Converted from base " + b + ".", "ok");
        });
      });
      fields[0].value = "255";
      fields[0].dispatchEvent(new Event("input"));
    },
  });

  /* ── Snake ────────────────────────────────────────────── */
  app({
    id: "snake",
    name: "Snake.exe",
    glyph: "~",
    hint: "look busy",
    w: 460,
    h: 500,
    build: function (body, rec) {
      body.innerHTML =
        '<div class="row"><button class="btn btn--go" data-a="go">New game</button>' +
        '<span class="lbl">Score <b data-score>0</b></span>' +
        '<span class="lbl">Best <b data-best>0</b></span>' +
        '<span class="spacer"></span><span class="lbl">arrows / WASD</span></div>' +
        '<canvas class="snake" width="320" height="320" tabindex="0"></canvas>' +
        '<div class="status">Click the board, then press an arrow key.</div>';

      var cv = $(".snake", body);
      var ctx = cv.getContext("2d");
      var status = $(".status", body);
      var scoreEl = $("[data-score]", body);
      var bestEl = $("[data-best]", body);
      var N = 16,
        S = 20;
      var snake, dir, next, food, timer, score;
      var best = parseInt(pref("snakeBest") || "0", 10);
      bestEl.textContent = best;

      function place() {
        do {
          food = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 };
        } while (
          snake.some(function (s) {
            return s.x === food.x && s.y === food.y;
          })
        );
      }

      function draw() {
        var css = getComputedStyle(document.documentElement);
        ctx.fillStyle = getComputedStyle(cv).backgroundColor;
        ctx.fillRect(0, 0, cv.width, cv.height);
        var ink = css.getPropertyValue("--screen-ink").trim() || "#33ff66";
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(food.x * S + 4, food.y * S + 4, S - 8, S - 8);
        ctx.globalAlpha = 1;
        ctx.fillRect(food.x * S + 6, food.y * S + 6, S - 12, S - 12);
        snake.forEach(function (s, i) {
          ctx.globalAlpha = i === 0 ? 1 : 0.85 - (i / snake.length) * 0.45;
          ctx.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2);
        });
        ctx.globalAlpha = 1;
      }

      function stop(msg) {
        clearInterval(timer);
        timer = null;
        if (score > best) {
          best = score;
          bestEl.textContent = best;
          pref("snakeBest", String(best));
          msg += "  New personal best!";
        }
        say(status, msg, "bad");
        beep(160, 260, "sawtooth");
      }

      function step() {
        dir = next;
        var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N)
          return stop("You hit the wall. Score " + score + ".");
        if (
          snake.some(function (s) {
            return s.x === head.x && s.y === head.y;
          })
        )
          return stop("You ate yourself. Score " + score + ".");
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score++;
          scoreEl.textContent = score;
          beep(1200 + score * 25, 40);
          place();
        } else snake.pop();
        draw();
      }

      function start() {
        clearInterval(timer);
        snake = [{ x: 8, y: 8 }];
        dir = next = { x: 1, y: 0 };
        score = 0;
        scoreEl.textContent = "0";
        place();
        draw();
        timer = setInterval(step, 110);
        say(status, "Go.", "ok");
        cv.focus();
      }

      var KEYS = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };

      cv.addEventListener("keydown", function (e) {
        var d = KEYS[e.key] || KEYS[e.key.toLowerCase()];
        if (!d) return;
        e.preventDefault();
        if (!timer) start();
        if (d.x === -dir.x && d.y === -dir.y) return; // no instant 180s
        next = d;
      });

      $("[data-a=go]", body).addEventListener("click", start);
      rec.onClose = function () {
        clearInterval(timer);
      };
      snake = [{ x: 8, y: 8 }];
      score = 0;
      place();
      draw();
    },
  });

  /* ── About ────────────────────────────────────────────── */
  app({
    id: "about",
    name: "About MART-OS",
    glyph: "i",
    hint: "read me",
    w: 560,
    h: 440,
    build: function (body) {
      body.innerHTML =
        '<div class="about">' +
        '<div class="marq"><span>★ MART-OS 3.11 for Workgroups ★ 0 dependencies ★ 0 build steps ★ 0 trackers ★ 0 network calls ★ works offline ★ view source, it is all right there ★</span></div>' +
        "<h3>MART-OS 3.11</h3>" +
        "<p>A desktop full of the small tools I keep re-googling, rebuilt as one page that " +
        "runs entirely in your browser. Nothing you type here leaves this tab — there is no " +
        "backend to send it to.</p>" +
        "<p>Written in plain HTML, CSS and JavaScript. No framework, no bundler, no " +
        "package manager. The window manager, the raymarched portfolio background, the " +
        "diff algorithm and the CRT are all hand-rolled.</p>" +
        "<p><b>Keyboard:</b> Esc closes the top window · Alt+T opens the terminal · " +
        "arrows drive Snake.</p>" +
        "<p>Built by Marius (MART), Software Engineer in IT Kort &amp; Anlæg at OK a.m.b.a., Aarhus.</p>" +
        '<p><a href="../index.html">← Back to the portfolio</a> &nbsp;·&nbsp; ' +
        '<a href="https://github.com/mariuserok" target="_blank" rel="noopener noreferrer">GitHub</a>' +
        ' &nbsp;·&nbsp; <a href="mailto:mart@ok.dk">mart@ok.dk</a></p>' +
        '<p style="opacity:.6">Server-side features are coming later. This is the client.</p>' +
        "</div>";
    },
  });

  /* ── Shortcut to Retro Room ───────────────────────────── */
  app({
    id: "retro",
    name: "Retro Room",
    glyph: "◎",
    hint: "run a retrospective",
    link: "../retro/index.html",
  });

  /* ── Shortcut to Voidrunner ───────────────────────────── */
  app({
    id: "voidrunner",
    name: "Voidrunner",
    glyph: "▲",
    hint: "fly a spaceship",
    link: "../game/index.html",
  });

  /* ═══ SHELL WIRING ══════════════════════════════════════ */
  var desktop = $("#desktop");

  function setTheme(name) {
    desktop.setAttribute("data-theme", name);
    pref("theme", name);
    $$("[data-theme-set]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-theme-set") === name);
    });
  }

  function buildDesktop() {
    var icons = $("#icons");
    var list = $("#startList");
    // Double-click is the period-correct gesture, but it is miserable on touch.
    var touch = window.matchMedia("(hover: none)").matches;
    APPS.forEach(function (a) {
      // Shortcuts are real anchors: popup blockers never eat them, and
      // middle-click / ctrl-click behave the way people expect.
      var b = document.createElement(a.link ? "a" : "button");
      b.className = "icon";
      b.setAttribute("role", "listitem");
      if (a.link) {
        b.href = a.link;
        b.target = "_blank";
        b.rel = "noopener noreferrer";
      }
      var g = document.createElement("span");
      g.className = "icon__glyph";
      g.textContent = a.glyph;
      var l = document.createElement("span");
      l.className = "icon__label";
      l.textContent = a.name;
      b.appendChild(g);
      b.appendChild(l);
      b.addEventListener("click", function () {
        $$(".icon").forEach(function (i) {
          i.classList.remove("is-sel");
        });
        b.classList.add("is-sel");
        if (touch && !a.link) openApp(a.id);
      });
      if (!a.link) {
        b.addEventListener("dblclick", function () {
          openApp(a.id);
        });
        b.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openApp(a.id);
          }
        });
      }
      icons.appendChild(b);

      var mi = document.createElement(a.link ? "a" : "button");
      mi.className = "startmenu__item";
      if (a.link) {
        mi.href = a.link;
        mi.target = "_blank";
        mi.rel = "noopener noreferrer";
      }
      var mb = document.createElement("b");
      mb.textContent = a.glyph;
      var ms = document.createElement("span");
      ms.textContent = a.name;
      var mh = document.createElement("small");
      mh.textContent = a.hint;
      mi.appendChild(mb);
      mi.appendChild(ms);
      mi.appendChild(mh);
      mi.addEventListener("click", function () {
        toggleMenu(false);
        if (!a.link) openApp(a.id);
      });
      list.appendChild(mi);
    });
  }

  var menu = $("#startMenu");
  var startBtn = $("#startBtn");
  function toggleMenu(force) {
    var show = force === undefined ? menu.hidden : force;
    menu.hidden = !show;
    startBtn.setAttribute("aria-expanded", String(show));
    if (show) beep(700, 40);
  }
  startBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", function (e) {
    if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false);
  });
  $("#themes").addEventListener("click", function (e) {
    var t = e.target.getAttribute("data-theme-set");
    if (t) {
      setTheme(t);
      beep(1500, 40);
    }
  });

  /* Tray toggles */
  var crt = $("#crt");
  var crtBtn = $("#crtBtn");
  var sndBtn = $("#sndBtn");
  function setCrt(on) {
    crt.hidden = !on;
    crtBtn.setAttribute("aria-pressed", String(on));
    pref("crt", on ? "1" : "0");
  }
  crtBtn.addEventListener("click", function () {
    setCrt(crt.hidden);
  });
  sndBtn.addEventListener("click", function () {
    sound = !sound;
    sndBtn.setAttribute("aria-pressed", String(sound));
    pref("snd", sound ? "1" : "0");
    beep(1200, 60);
  });
  sndBtn.setAttribute("aria-pressed", String(sound));

  /* Clock */
  (function clock() {
    var el = $("#clock");
    setInterval(function () {
      var d = new Date();
      el.textContent =
        pad(d.getHours()) +
        ":" +
        pad(d.getMinutes()) +
        ":" +
        pad(d.getSeconds());
    }, 1000);
    var d = new Date();
    el.textContent =
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  })();

  /* Pull stranded windows back after a viewport change */
  window.addEventListener("resize", function () {
    var v = viewport();
    Object.keys(open).forEach(function (k) {
      var el = open[k].el;
      if (el.classList.contains("is-max")) return;
      el.style.width = Math.min(el.offsetWidth, v.w - 8) + "px";
      el.style.height = Math.min(el.offsetHeight, v.h - 8) + "px";
      el.style.left =
        clamp(el.offsetLeft, 4, Math.max(4, v.w - el.offsetWidth - 4)) + "px";
      el.style.top = clamp(el.offsetTop, 0, Math.max(0, v.h - 34)) + "px";
      if (open[k].onResize) open[k].onResize();
    });
  });

  /* Global keys */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!menu.hidden) return toggleMenu(false);
      var top = Object.keys(open)
        .map(function (k) {
          return open[k];
        })
        .filter(function (w) {
          return w.el.classList.contains("is-active");
        })[0];
      if (top) closeWin(top);
    }
    if (e.altKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      openApp("term");
    }
  });

  /* ── Go ───────────────────────────────────────────────── */
  buildDesktop();
  setTheme(pref("theme") || "teal");
  setCrt(pref("crt") !== "0");

  runBoot(function () {
    openApp("about");
    openApp("term");
  });

  // eslint-disable-next-line no-console
  console.log(
    "%cMART-OS 3.11%c\nEverything here is vanilla JS. Type `help` in the terminal.",
    "font:700 22px monospace;color:#33ff66",
    "font:13px monospace;color:#888",
  );
})();
