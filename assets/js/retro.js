/* ═══════════════════════════════════════════════════════════
   Retro Room — a facilitated retrospective in one file
   State lives in localStorage; sharing happens through an
   exported blob or a compressed URL. There is no server yet,
   so every write path is local and every read path is treated
   as untrusted input.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var KEY = "retro:board";
  var ME = "retro:me";
  var ACCENTS = ["cyan", "violet", "pink", "amber", "green", "blue"];
  var VAR = {
    cyan: "#22d3ee",
    violet: "#a855f7",
    pink: "#f472b6",
    amber: "#fbbf24",
    green: "#4ade80",
    blue: "#60a5fa",
  };

  function uid() {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.prototype.map
      .call(a, function (b) {
        return b.toString(36);
      })
      .join("")
      .slice(0, 10);
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      /* private mode: the board simply won't survive a refresh */
    }
    return null;
  }

  /* ── Templates ────────────────────────────────────────── */
  var TEMPLATES = [
    {
      id: "ssc",
      name: "Start / Stop / Continue",
      desc: "The dependable default.",
      cols: [
        ["Start doing", "What should we begin?", "green"],
        ["Stop doing", "What is costing us more than it gives?", "pink"],
        ["Continue doing", "What is working — keep it.", "cyan"],
      ],
    },
    {
      id: "msg",
      name: "Mad / Sad / Glad",
      desc: "Leads with how the sprint felt.",
      cols: [
        ["Mad", "What made you angry?", "pink"],
        ["Sad", "What disappointed you?", "violet"],
        ["Glad", "What made you happy?", "green"],
      ],
    },
    {
      id: "wwd",
      name: "Went well / To improve",
      desc: "Short and neutral.",
      cols: [
        ["Went well", "Worth celebrating.", "green"],
        ["To improve", "Worth fixing.", "amber"],
        ["Questions", "Things nobody could answer.", "blue"],
      ],
    },
    {
      id: "l4",
      name: "The 4 Ls",
      desc: "Good when the team is stuck in complaints.",
      cols: [
        ["Liked", "Enjoyed doing.", "green"],
        ["Learned", "New knowledge.", "cyan"],
        ["Lacked", "Missing or blocked.", "amber"],
        ["Longed for", "Wished we had.", "violet"],
      ],
    },
    {
      id: "sail",
      name: "Sailboat",
      desc: "Visual, good for a longer look ahead.",
      cols: [
        ["Wind", "What pushes us forward.", "cyan"],
        ["Anchors", "What slows us down.", "amber"],
        ["Rocks", "Risks ahead.", "pink"],
        ["Island", "Where we are heading.", "green"],
      ],
    },
    {
      id: "kalm",
      name: "KALM",
      desc: "Keep, Add, Less, More.",
      cols: [
        ["Keep", "Already good.", "green"],
        ["Add", "Something new.", "cyan"],
        ["Less of", "Dial it down.", "amber"],
        ["More of", "Dial it up.", "violet"],
      ],
    },
  ];

  var PHASES = [
    { id: "setup", n: "Setup" },
    {
      id: "write",
      n: "Write",
      title: "Quiet writing",
      hint: "Everyone writes on their own. No discussion yet — that is the whole point.",
    },
    {
      id: "group",
      n: "Group",
      title: "Reveal and group",
      hint: "Read them out. Drag a card onto another to merge duplicates into one theme.",
    },
    {
      id: "vote",
      n: "Vote",
      title: "Dot voting",
      hint: "Spend your votes on what you most want to talk about.",
    },
    {
      id: "discuss",
      n: "Discuss",
      title: "Discussion",
      hint: "Top of the list first. Capture an action before moving on.",
    },
    {
      id: "wrap",
      n: "Wrap",
      title: "Wrap up",
      hint: "Agree the actions and take them with you.",
    },
  ];

  function phaseIndex(id) {
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return i;
    return 0;
  }

  /* ── State ────────────────────────────────────────────── */
  var S = null;
  var me = null;

  function loadMe() {
    var raw = store(ME);
    try {
      me = raw ? JSON.parse(raw) : null;
    } catch (e) {
      me = null;
    }
    if (!me || typeof me.id !== "string") me = { id: uid(), name: "" };
    saveMe();
  }
  function saveMe() {
    store(ME, JSON.stringify(me));
  }

  function newBoard(tplId) {
    var tpl =
      TEMPLATES.filter(function (t) {
        return t.id === tplId;
      })[0] || TEMPLATES[0];
    return {
      v: 1,
      title: "",
      tpl: tpl.id,
      tplName: tpl.name,
      created: new Date().toISOString(),
      phase: "setup",
      settings: { write: 5, votes: 3, discuss: 5, anon: false, blind: true },
      cols: tpl.cols.map(function (c, i) {
        return {
          id: "c" + i + uid().slice(0, 4),
          t: c[0],
          hint: c[1],
          c: c[2],
        };
      }),
      cards: [],
      actions: [],
      cursor: 0,
      done: [],
    };
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      store(KEY, JSON.stringify(S));
    }, 250);
  }

  /* Anything read from storage, a file or a URL is untrusted. */
  function sanitize(raw) {
    if (!raw || typeof raw !== "object")
      throw new Error("That is not a board.");
    var str = function (v, max) {
      return typeof v === "string" ? v.slice(0, max) : "";
    };
    var num = function (v, lo, hi, dflt) {
      var n = parseInt(v, 10);
      return isNaN(n) ? dflt : clamp(n, lo, hi);
    };

    var cols = (Array.isArray(raw.cols) ? raw.cols : [])
      .slice(0, 8)
      .map(function (c, i) {
        c = c || {};
        return {
          id: str(c.id, 40) || "c" + i,
          t: str(c.t, 60) || "Column " + (i + 1),
          hint: str(c.hint, 140),
          c: ACCENTS.indexOf(c.c) >= 0 ? c.c : ACCENTS[i % ACCENTS.length],
        };
      });
    if (!cols.length) throw new Error("That board has no columns.");
    var colIds = cols.map(function (c) {
      return c.id;
    });

    var cards = (Array.isArray(raw.cards) ? raw.cards : [])
      .slice(0, 600)
      .map(function (c) {
        c = c || {};
        return {
          id: str(c.id, 40) || uid(),
          col: colIds.indexOf(str(c.col, 40)) >= 0 ? c.col : colIds[0],
          text: str(c.text, 1000),
          who: str(c.who, 40),
          whoId: str(c.whoId, 40),
          parent: str(c.parent, 40) || null,
          votes: (Array.isArray(c.votes) ? c.votes : [])
            .slice(0, 200)
            .map(function (v) {
              return str(v, 40);
            }),
          created: str(c.created, 40) || new Date().toISOString(),
        };
      })
      .filter(function (c) {
        return c.text.trim();
      });

    var ids = cards.map(function (c) {
      return c.id;
    });
    cards.forEach(function (c) {
      // Drop dangling or self-referential parents so rendering can't loop.
      if (c.parent && (ids.indexOf(c.parent) < 0 || c.parent === c.id))
        c.parent = null;
    });
    cards.forEach(function (c) {
      if (!c.parent) return;
      var p = cards.filter(function (x) {
        return x.id === c.parent;
      })[0];
      if (p && p.parent) c.parent = p.parent; // flatten to one level
    });

    var actions = (Array.isArray(raw.actions) ? raw.actions : [])
      .slice(0, 200)
      .map(function (a) {
        a = a || {};
        return {
          id: str(a.id, 40) || uid(),
          text: str(a.text, 400),
          owner: str(a.owner, 60),
          done: !!a.done,
        };
      });

    var st = raw.settings || {};
    return {
      v: 1,
      title: str(raw.title, 120),
      tpl: str(raw.tpl, 20) || "ssc",
      tplName: str(raw.tplName, 60) || "Custom",
      created: str(raw.created, 40) || new Date().toISOString(),
      phase: PHASES.filter(function (p) {
        return p.id === raw.phase;
      }).length
        ? raw.phase
        : "write",
      settings: {
        write: num(st.write, 1, 60, 5),
        votes: num(st.votes, 1, 20, 3),
        discuss: num(st.discuss, 1, 60, 5),
        anon: !!st.anon,
        blind: st.blind === undefined ? true : !!st.blind,
      },
      cols: cols,
      cards: cards,
      actions: actions,
      cursor: num(raw.cursor, 0, 999, 0),
      done: (Array.isArray(raw.done) ? raw.done : [])
        .slice(0, 600)
        .map(function (d) {
          return str(d, 40);
        }),
    };
  }

  /* ── Card helpers ─────────────────────────────────────── */
  function roots(colId) {
    return S.cards.filter(function (c) {
      return !c.parent && (!colId || c.col === colId);
    });
  }
  function kids(id) {
    return S.cards.filter(function (c) {
      return c.parent === id;
    });
  }
  function byId(id) {
    return S.cards.filter(function (c) {
      return c.id === id;
    })[0];
  }
  function voteCount(card) {
    return (
      card.votes.length +
      kids(card.id).reduce(function (n, k) {
        return n + k.votes.length;
      }, 0)
    );
  }
  function myVotes() {
    return S.cards.reduce(function (n, c) {
      return (
        n +
        c.votes.filter(function (v) {
          return v === me.id;
        }).length
      );
    }, 0);
  }
  function colOf(id) {
    return (
      S.cols.filter(function (c) {
        return c.id === id;
      })[0] || S.cols[0]
    );
  }
  function topics() {
    return roots()
      .slice()
      .sort(function (a, b) {
        return (
          voteCount(b) - voteCount(a) || a.created.localeCompare(b.created)
        );
      });
  }

  /* ── Toast ────────────────────────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("is-on");
    }, 2600);
  }

  function copyText(text, label) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return dialogText("Copy this", text);
    }
    navigator.clipboard.writeText(text).then(
      function () {
        toast(label || "Copied to clipboard.");
      },
      function () {
        dialogText("Copy this", text);
      },
    );
  }

  /* ── Timer ────────────────────────────────────────────── */
  var T = { total: 0, left: 0, endsAt: 0, running: false, fired: false };
  var actx = null;

  function chime() {
    try {
      if (!actx)
        actx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18, 0.36].forEach(function (d, i) {
        var o = actx.createOscillator();
        var g = actx.createGain();
        o.type = "sine";
        o.frequency.value = [880, 1108, 1318][i];
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(actx.destination);
        var t0 = actx.currentTime + d;
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.start(t0);
        o.stop(t0 + 0.55);
      });
    } catch (e) {
      /* audio blocked — the visual flash still fires */
    }
  }

  function setTimer(minutes) {
    T.total = Math.round(minutes * 60000);
    T.left = T.total;
    T.running = false;
    T.fired = false;
    paintTimer();
  }
  function toggleTimer() {
    if (T.running) {
      T.left = Math.max(0, T.endsAt - Date.now());
      T.running = false;
    } else {
      if (T.left <= 0) T.left = T.total;
      T.endsAt = Date.now() + T.left;
      T.running = true;
      T.fired = false;
      if (!actx) chimeUnlock();
    }
    paintTimer();
  }
  function chimeUnlock() {
    // Creating the context inside a click keeps autoplay policy happy.
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) {
      actx = null;
    }
  }

  function paintTimer() {
    var box = $("#timer");
    var left = T.running ? Math.max(0, T.endsAt - Date.now()) : T.left;
    var over = left <= 0;
    var secs = Math.ceil(left / 1000);
    $("#timerTime").textContent =
      String(Math.floor(secs / 60)).padStart(2, "0") +
      ":" +
      String(secs % 60).padStart(2, "0");
    $("#timerToggle").textContent = T.running ? "❚❚" : "▶";
    box.classList.toggle("is-warn", !over && left <= 60000);
    box.classList.toggle("is-over", over);
    if (over && T.running && !T.fired) {
      T.fired = true;
      T.running = false;
      T.left = 0;
      chime();
      var f = $("#flash");
      f.classList.remove("is-on");
      void f.offsetWidth;
      f.classList.add("is-on");
      toast("Time is up.");
    }
  }
  setInterval(paintTimer, 250);

  /* ── Render ───────────────────────────────────────────── */
  function render() {
    document.body.dataset.phase = S.phase;
    $("#boardTitle").value = S.title;
    renderSteps();
    var i = phaseIndex(S.phase);
    var p = PHASES[i];
    $("#timer").hidden = S.phase === "setup" || S.phase === "wrap";
    $("#barHint").textContent = p.hint || "";
    $("#prevPhase").disabled = i === 0;
    $("#nextPhase").disabled = i === PHASES.length - 1;
    $("#nextPhase").textContent =
      i === PHASES.length - 2 ? "Finish →" : "Next →";

    if (S.phase === "setup") renderSetup();
    if (S.phase === "write" || S.phase === "group" || S.phase === "vote")
      renderBoard();
    if (S.phase === "discuss") renderDiscuss();
    if (S.phase === "wrap") renderWrap();
    save();
  }

  function renderSteps() {
    var box = $("#steps");
    box.textContent = "";
    var cur = phaseIndex(S.phase);
    PHASES.forEach(function (p, i) {
      var b = document.createElement("button");
      b.className = "step" + (i < cur ? " is-done" : "");
      b.setAttribute("aria-current", String(i === cur));
      var n = document.createElement("b");
      n.textContent = i < cur ? "✓" : String(i + 1);
      var s = document.createElement("span");
      s.textContent = p.n;
      b.appendChild(n);
      b.appendChild(s);
      b.addEventListener("click", function () {
        goPhase(p.id);
      });
      box.appendChild(b);
    });
  }

  /* ── Setup ────────────────────────────────────────────── */
  function renderSetup() {
    var box = $("#templates");
    if (box.dataset.built !== "1") {
      TEMPLATES.forEach(function (t) {
        var b = document.createElement("button");
        b.className = "tpl";
        b.dataset.tpl = t.id;
        var n = document.createElement("b");
        n.className = "tpl__n";
        n.textContent = t.name;
        var d = document.createElement("small");
        d.className = "tpl__d";
        d.textContent = t.desc;
        var cols = document.createElement("span");
        cols.className = "tpl__cols";
        t.cols.forEach(function (c) {
          var i = document.createElement("i");
          i.style.setProperty("--c", VAR[c[2]]);
          cols.appendChild(i);
        });
        b.appendChild(n);
        b.appendChild(d);
        b.appendChild(cols);
        b.addEventListener("click", function () {
          S.tpl = t.id;
          S.tplName = t.name;
          S.cols = t.cols.map(function (c, i) {
            return {
              id: "c" + i + uid().slice(0, 4),
              t: c[0],
              hint: c[1],
              c: c[2],
            };
          });
          S.cards = [];
          renderSetup();
          save();
        });
        box.appendChild(b);
      });
      box.dataset.built = "1";
    }
    $$(".tpl", box).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tpl === S.tpl));
    });
    $("#setName").value = me.name;
    $("#setWrite").value = S.settings.write;
    $("#setVotes").value = S.settings.votes;
    $("#setDiscuss").value = S.settings.discuss;
    $("#setAnon").checked = S.settings.anon;
    $("#setBlind").checked = S.settings.blind;
  }

  function readSettings() {
    me.name = $("#setName").value.trim().slice(0, 40);
    saveMe();
    S.settings.write = clamp(parseInt($("#setWrite").value, 10) || 5, 1, 60);
    S.settings.votes = clamp(parseInt($("#setVotes").value, 10) || 3, 1, 20);
    S.settings.discuss = clamp(
      parseInt($("#setDiscuss").value, 10) || 5,
      1,
      60,
    );
    S.settings.anon = $("#setAnon").checked;
    S.settings.blind = $("#setBlind").checked;
  }

  /* ── Board ────────────────────────────────────────────── */
  function renderBoard() {
    var p = PHASES[phaseIndex(S.phase)];
    var bar = $("#phasebar");
    bar.textContent = "";
    var t = document.createElement("span");
    t.className = "phasebar__t";
    t.textContent = p.title;
    var d = document.createElement("span");
    d.className = "phasebar__d";
    d.textContent = p.hint;
    var sp = document.createElement("span");
    sp.className = "phasebar__spacer";
    bar.appendChild(t);
    bar.appendChild(d);
    bar.appendChild(sp);

    if (S.phase === "write" && S.settings.blind) {
      var hidden = S.cards.filter(function (c) {
        return c.whoId !== me.id;
      }).length;
      var h = document.createElement("span");
      h.className = "phasebar__d";
      h.textContent = hidden
        ? plural(hidden, "card") + " from others stay covered until Group."
        : "Blind writing is on.";
      bar.appendChild(h);
    }

    if (S.phase === "vote") {
      var used = myVotes();
      var budget = S.settings.votes;
      var b = document.createElement("div");
      b.className = "budget";
      var lbl = document.createElement("span");
      lbl.textContent = budget - used + " of " + budget + " votes left";
      var dots = document.createElement("span");
      dots.className = "budget__dots";
      for (var i = 0; i < budget; i++) {
        var dot = document.createElement("i");
        if (i < used) dot.className = "is-on";
        dots.appendChild(dot);
      }
      b.appendChild(dots);
      b.appendChild(lbl);
      bar.appendChild(b);
    }

    var wrap = $("#columns");
    wrap.textContent = "";
    S.cols.forEach(function (col, ci) {
      var el = document.createElement("section");
      el.className = "col";
      el.dataset.col = col.id;
      el.style.setProperty("--c", VAR[col.c]);

      var head = document.createElement("header");
      head.className = "col__head";
      var title = document.createElement("div");
      title.className = "col__title";
      var n = document.createElement("span");
      n.className = "n";
      n.textContent = String(ci + 1);
      var tt = document.createElement("span");
      tt.textContent = col.t;
      var cnt = document.createElement("span");
      cnt.className = "col__count";
      var all = S.cards.filter(function (c) {
        return c.col === col.id;
      }).length;
      cnt.textContent = String(all);
      title.appendChild(n);
      title.appendChild(tt);
      title.appendChild(cnt);
      head.appendChild(title);
      if (col.hint) {
        var hint = document.createElement("p");
        hint.className = "col__hint";
        hint.textContent = col.hint;
        head.appendChild(hint);
      }
      el.appendChild(head);

      var body = document.createElement("div");
      body.className = "col__body";
      var list = roots(col.id);
      if (S.phase === "vote")
        list = list.slice().sort(function (a, b2) {
          return voteCount(b2) - voteCount(a);
        });
      if (!list.length) {
        var empty = document.createElement("div");
        empty.className = "col__empty";
        empty.textContent =
          S.phase === "write" ? "Nothing here yet." : "Empty.";
        body.appendChild(empty);
      }
      list.forEach(function (card) {
        body.appendChild(cardEl(card));
      });
      el.appendChild(body);

      if (S.phase === "write" || S.phase === "group")
        el.appendChild(composer(col));
      wrap.appendChild(el);
    });
  }

  function composer(col) {
    var box = document.createElement("div");
    box.className = "composer";
    var ta = document.createElement("textarea");
    ta.placeholder = "Add a card…";
    ta.maxLength = 1000;
    ta.dataset.col = col.id;
    var row = document.createElement("div");
    row.className = "composer__row";
    var btn = document.createElement("button");
    btn.className = "btn btn--primary";
    btn.type = "button";
    btn.textContent = "Add";
    var hint = document.createElement("span");
    hint.className = "composer__hint";
    hint.textContent = "Enter to add";
    row.appendChild(btn);
    row.appendChild(hint);
    box.appendChild(ta);
    box.appendChild(row);

    function add() {
      var text = ta.value.trim();
      if (!text) return;
      S.cards.push({
        id: uid(),
        col: col.id,
        text: text,
        who: me.name,
        whoId: me.id,
        parent: null,
        votes: [],
        created: new Date().toISOString(),
      });
      ta.value = "";
      render();
      var next = $('.composer textarea[data-col="' + cssEsc(col.id) + '"]');
      if (next) next.focus();
    }
    btn.addEventListener("click", add);
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        add();
      }
    });
    return box;
  }

  function cssEsc(s) {
    return window.CSS && CSS.escape
      ? CSS.escape(s)
      : s.replace(/["\\]/g, "\\$&");
  }

  function cardEl(card) {
    var el = document.createElement("article");
    el.className = "card";
    el.dataset.id = card.id;

    var children = kids(card.id);
    if (children.length) {
      var badge = document.createElement("span");
      badge.className = "card__badge";
      badge.textContent = children.length + 1 + " merged";
      el.appendChild(badge);
    }

    var blind = S.phase === "write" && S.settings.blind && card.whoId !== me.id;
    var p = document.createElement("p");
    p.className = "card__text";
    if (blind) {
      el.classList.add("is-blind");
      p.textContent = "Hidden until the reveal";
    } else {
      p.textContent = card.text;
    }
    el.appendChild(p);

    if (!blind && children.length) {
      var g = document.createElement("div");
      g.className = "card__group";
      children.forEach(function (k) {
        var row = document.createElement("div");
        row.className = "sub";
        var dot = document.createElement("span");
        dot.textContent = "•";
        var txt = document.createElement("span");
        txt.className = "sub__text";
        txt.textContent = k.text;
        row.appendChild(dot);
        row.appendChild(txt);
        if (S.phase === "group") {
          var x = document.createElement("button");
          x.className = "icon-btn sub__x";
          x.type = "button";
          x.title = "Split out of this group";
          x.textContent = "⤴";
          x.addEventListener("click", function () {
            k.parent = null;
            render();
          });
          row.appendChild(x);
        }
        g.appendChild(row);
      });
      el.appendChild(g);
    }

    var foot = document.createElement("div");
    foot.className = "card__foot";

    if (S.phase === "vote") {
      var votes = voteCount(card);
      var mine = card.votes.filter(function (v) {
        return v === me.id;
      }).length;
      var vb = document.createElement("button");
      vb.className = "vote" + (mine ? " is-mine" : "");
      vb.type = "button";
      vb.textContent = "▲ " + votes;
      vb.title = mine ? "Click to take your vote back" : "Vote for this";
      vb.disabled = !mine && myVotes() >= S.settings.votes;
      vb.addEventListener("click", function () {
        if (mine) {
          var i = card.votes.indexOf(me.id);
          if (i >= 0) card.votes.splice(i, 1);
        } else if (myVotes() < S.settings.votes) {
          card.votes.push(me.id);
        } else {
          return toast("You are out of votes. Take one back first.");
        }
        render();
      });
      foot.appendChild(vb);
    } else if (voteCount(card)) {
      var vs = document.createElement("span");
      vs.className = "vote";
      vs.textContent = "▲ " + voteCount(card);
      foot.appendChild(vs);
    }

    var who = document.createElement("span");
    who.className = "card__who";
    who.textContent = blind
      ? ""
      : S.settings.anon
        ? ""
        : card.who || (card.whoId === me.id ? "you" : "anonymous");
    foot.appendChild(who);

    if (!blind) {
      var acts = document.createElement("span");
      acts.className = "card__acts";
      if (card.whoId === me.id || S.phase === "group") {
        acts.appendChild(
          iconBtn("✎", "Edit", function () {
            editCard(el, card);
          }),
        );
      }
      acts
        .appendChild(
          iconBtn("✕", "Delete", function () {
            confirmDlg("Delete this card?", card.text, function () {
              kids(card.id).forEach(function (k) {
                k.parent = null;
              });
              S.cards = S.cards.filter(function (c) {
                return c.id !== card.id;
              });
              render();
            });
          }),
        )
        .classList.add("icon-btn--danger");
      foot.appendChild(acts);
    }
    el.appendChild(foot);

    if (S.phase === "group") makeDraggable(el, card);
    return el;
  }

  function iconBtn(glyph, title, fn) {
    var b = document.createElement("button");
    b.className = "icon-btn";
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.textContent = glyph;
    b.addEventListener("click", fn);
    return b;
  }

  function editCard(el, card) {
    var ta = document.createElement("textarea");
    ta.className = "card__edit";
    ta.value = card.text;
    ta.maxLength = 1000;
    var txt = $(".card__text", el);
    el.replaceChild(ta, txt);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    var commit = function () {
      var v = ta.value.trim();
      if (v) card.text = v;
      render();
    };
    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        ta.removeEventListener("blur", commit);
        render();
      }
    });
  }

  /* ── Drag to move / merge ─────────────────────────────── */
  function makeDraggable(el, card) {
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (e.target.closest("button, textarea, input, a")) return;

      var startX = e.clientX;
      var startY = e.clientY;
      var rect = el.getBoundingClientRect();
      var offX = startX - rect.left;
      var offY = startY - rect.top;
      var clone = null;
      var target = null;

      function move(ev) {
        if (!clone) {
          if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6)
            return;
          clone = el.cloneNode(true);
          clone.classList.add("is-drag");
          clone.style.width = rect.width + "px";
          document.body.appendChild(clone);
          el.classList.add("is-ghost");
        }
        clone.style.left = ev.clientX - offX + "px";
        clone.style.top = ev.clientY - offY + "px";

        $$(".is-merge").forEach(function (n) {
          n.classList.remove("is-merge");
        });
        $$(".is-drop").forEach(function (n) {
          n.classList.remove("is-drop");
        });
        target = null;
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!under) return;
        var onCard = under.closest(".card");
        if (onCard && onCard !== el && onCard.dataset.id !== card.id) {
          onCard.classList.add("is-merge");
          target = { kind: "merge", id: onCard.dataset.id };
          return;
        }
        var onCol = under.closest(".col");
        if (onCol) {
          onCol.classList.add("is-drop");
          target = { kind: "move", id: onCol.dataset.col };
        }
      }

      function up() {
        el.releasePointerCapture && safeRelease(el, e.pointerId);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (clone) clone.remove();
        el.classList.remove("is-ghost");
        $$(".is-merge").forEach(function (n) {
          n.classList.remove("is-merge");
        });
        $$(".is-drop").forEach(function (n) {
          n.classList.remove("is-drop");
        });
        if (!clone || !target) return;

        if (target.kind === "merge") {
          var host = byId(target.id);
          if (!host) return;
          var rootId = host.parent || host.id;
          if (rootId === card.id) return;
          kids(card.id).forEach(function (k) {
            k.parent = rootId;
          });
          card.parent = rootId;
          card.col = byId(rootId).col;
          toast("Merged into one theme.");
        } else if (target.kind === "move" && card.col !== target.id) {
          card.col = target.id;
          kids(card.id).forEach(function (k) {
            k.col = target.id;
          });
        }
        render();
      }

      el.setPointerCapture && safeCapture(el, e.pointerId);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }
  function safeCapture(el, id) {
    try {
      el.setPointerCapture(id);
    } catch (e) {
      /* capture is a nicety, dragging still works without it */
    }
  }
  function safeRelease(el, id) {
    try {
      el.releasePointerCapture(id);
    } catch (e) {
      /* already released */
    }
  }

  /* ── Discuss ──────────────────────────────────────────── */
  function renderDiscuss() {
    var list = topics();
    S.cursor = clamp(S.cursor, 0, Math.max(0, list.length - 1));
    $("#agendaCount").textContent = list.length
      ? S.done.length + " / " + list.length
      : "";

    var ol = $("#agendaList");
    ol.textContent = "";
    list.forEach(function (card, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.className =
        "agenda__item" + (S.done.indexOf(card.id) >= 0 ? " is-done" : "");
      b.setAttribute("aria-current", String(i === S.cursor));
      var n = document.createElement("span");
      n.className = "agenda__n";
      n.textContent = String(i + 1);
      var t = document.createElement("span");
      t.className = "agenda__t";
      t.textContent = card.text;
      var v = document.createElement("span");
      v.className = "agenda__v";
      v.textContent = "▲" + voteCount(card);
      b.appendChild(n);
      b.appendChild(t);
      b.appendChild(v);
      b.addEventListener("click", function () {
        S.cursor = i;
        setTimer(S.settings.discuss);
        render();
      });
      li.appendChild(b);
      ol.appendChild(li);
    });

    var box = $("#topic");
    box.textContent = "";
    if (!list.length) {
      var e = document.createElement("p");
      e.className = "topic__empty";
      e.textContent = "No cards to discuss yet. Go back and add some.";
      box.appendChild(e);
      return;
    }

    var card = list[S.cursor];
    var col = colOf(card.col);
    box.style.setProperty("--c", VAR[col.c]);

    var tag = document.createElement("span");
    tag.className = "topic__tag";
    tag.textContent = col.t;
    box.appendChild(tag);

    var h = document.createElement("h2");
    h.className = "topic__text";
    h.textContent = card.text;
    box.appendChild(h);

    var meta = document.createElement("p");
    meta.className = "topic__meta";
    var bits = [
      "▲ " + plural(voteCount(card), "vote"),
      "topic " + (S.cursor + 1) + " of " + list.length,
    ];
    if (!S.settings.anon && card.who) bits.push("raised by " + card.who);
    meta.textContent = bits.join("  ·  ");
    box.appendChild(meta);

    var children = kids(card.id);
    if (children.length) {
      var also = document.createElement("div");
      also.className = "topic__also";
      var h4 = document.createElement("h4");
      h4.textContent = "Others said the same";
      var ul = document.createElement("ul");
      children.forEach(function (k) {
        var li = document.createElement("li");
        li.textContent = k.text;
        ul.appendChild(li);
      });
      also.appendChild(h4);
      also.appendChild(ul);
      box.appendChild(also);
    }

    var actWrap = document.createElement("div");
    var h4b = document.createElement("h4");
    h4b.className = "wrap__sub";
    h4b.textContent = "Actions from this topic";
    actWrap.appendChild(h4b);
    actWrap.appendChild(actionList());
    actWrap.appendChild(actionForm());
    box.appendChild(actWrap);

    var nav = document.createElement("div");
    nav.className = "topic__nav";
    var prev = document.createElement("button");
    prev.className = "btn";
    prev.textContent = "← Previous";
    prev.disabled = S.cursor === 0;
    prev.addEventListener("click", function () {
      S.cursor--;
      setTimer(S.settings.discuss);
      render();
    });
    var next = document.createElement("button");
    next.className = "btn btn--primary";
    next.textContent =
      S.cursor >= list.length - 1 ? "Done — wrap up →" : "Discussed, next →";
    next.addEventListener("click", function () {
      if (S.done.indexOf(card.id) < 0) S.done.push(card.id);
      if (S.cursor >= list.length - 1) return goPhase("wrap");
      S.cursor++;
      setTimer(S.settings.discuss);
      render();
    });
    var skip = document.createElement("button");
    skip.className = "btn";
    skip.textContent = "Skip";
    skip.disabled = S.cursor >= list.length - 1;
    skip.addEventListener("click", function () {
      S.cursor++;
      setTimer(S.settings.discuss);
      render();
    });
    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(skip);
    box.appendChild(nav);
  }

  /* ── Actions ──────────────────────────────────────────── */
  function actionList() {
    var box = document.createElement("div");
    box.className = "actions";
    if (!S.actions.length) {
      var e = document.createElement("p");
      e.className = "empty";
      e.textContent = "No actions yet. A retro without actions is just a chat.";
      box.appendChild(e);
      return box;
    }
    S.actions.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "action" + (a.done ? " is-done" : "");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = a.done;
      cb.setAttribute("aria-label", "Mark done");
      cb.addEventListener("change", function () {
        a.done = cb.checked;
        render();
      });
      var t = document.createElement("span");
      t.className = "action__t";
      t.textContent = a.text;
      var o = document.createElement("span");
      o.className = "action__o";
      o.textContent = a.owner || "unassigned";
      var x = iconBtn("✕", "Remove action", function () {
        S.actions = S.actions.filter(function (n) {
          return n.id !== a.id;
        });
        render();
      });
      x.classList.add("icon-btn--danger");
      row.appendChild(cb);
      row.appendChild(t);
      row.appendChild(o);
      row.appendChild(x);
      box.appendChild(row);
    });
    return box;
  }

  function actionForm() {
    var f = document.createElement("form");
    f.className = "actionadd actionadd--inline";
    var t = document.createElement("input");
    t.placeholder = "Action — who does what by when?";
    t.maxLength = 240;
    var o = document.createElement("input");
    o.placeholder = "Owner";
    o.maxLength = 40;
    var b = document.createElement("button");
    b.className = "btn btn--primary";
    b.type = "submit";
    b.textContent = "Add";
    f.appendChild(t);
    f.appendChild(o);
    f.appendChild(b);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = t.value.trim();
      if (!text) return;
      S.actions.push({
        id: uid(),
        text: text,
        owner: o.value.trim(),
        done: false,
      });
      render();
      toast("Action captured.");
    });
    return f;
  }

  /* ── Wrap ─────────────────────────────────────────────── */
  function renderWrap() {
    var people = {};
    S.cards.forEach(function (c) {
      if (c.whoId) people[c.whoId] = 1;
    });
    var stats = [
      [S.cards.length, S.cards.length === 1 ? "card" : "cards"],
      [roots().length, roots().length === 1 ? "theme" : "themes"],
      [
        S.cards.reduce(function (n, c) {
          return n + c.votes.length;
        }, 0),
        "votes cast",
      ],
      [S.actions.length, S.actions.length === 1 ? "action" : "actions"],
      [
        Object.keys(people).length,
        Object.keys(people).length === 1 ? "contributor" : "contributors",
      ],
    ];
    var box = $("#wrapStats");
    box.textContent = "";
    stats.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "stat";
      var b = document.createElement("b");
      b.textContent = String(s[0]);
      var sp = document.createElement("span");
      sp.textContent = s[1];
      d.appendChild(b);
      d.appendChild(sp);
      box.appendChild(d);
    });

    var host = $("#wrapActions");
    host.textContent = "";
    host.appendChild(actionList());
    $("#wrapPreview").textContent = toMarkdown();
  }

  /* ── Export ───────────────────────────────────────────── */
  function boardTitle() {
    return S.title.trim() || "Retrospective";
  }

  function toMarkdown() {
    var out = [];
    out.push("# " + boardTitle());
    out.push("");
    out.push(
      "_" + new Date(S.created).toLocaleDateString() + " · " + S.tplName + "_",
    );
    out.push("");
    S.cols.forEach(function (col) {
      var list = roots(col.id).sort(function (a, b) {
        return voteCount(b) - voteCount(a);
      });
      if (!list.length) return;
      out.push("## " + col.t);
      out.push("");
      list.forEach(function (c) {
        var v = voteCount(c);
        out.push(
          "- " + (v ? "**" + v + "▲** " : "") + c.text.replace(/\n+/g, " "),
        );
        kids(c.id).forEach(function (k) {
          out.push("  - " + k.text.replace(/\n+/g, " "));
        });
      });
      out.push("");
    });
    out.push("## Action items");
    out.push("");
    if (!S.actions.length) out.push("- _None agreed._");
    S.actions.forEach(function (a) {
      out.push(
        "- [" +
          (a.done ? "x" : " ") +
          "] " +
          a.text +
          (a.owner ? " — **" + a.owner + "**" : ""),
      );
    });
    out.push("");
    return out.join("\n");
  }

  function toPlain() {
    return toMarkdown()
      .replace(/^#+ /gm, "")
      .replace(/\*\*/g, "")
      .replace(/^_|_$/gm, "")
      .replace(/^- \[ \] /gm, "[ ] ")
      .replace(/^- \[x\] /gm, "[x] ");
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function b64urlFromBytes(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesFromB64url(s) {
    var t = s.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4) t += "=";
    var bin = atob(t);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodeBoard() {
    var json = JSON.stringify(S);
    if (!window.CompressionStream) {
      return Promise.resolve(
        "r" + b64urlFromBytes(new TextEncoder().encode(json)),
      );
    }
    var stream = new Blob([json])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return "z" + b64urlFromBytes(new Uint8Array(buf));
    });
  }
  function decodeBoard(code) {
    var kind = code.charAt(0);
    var bytes = bytesFromB64url(code.slice(1));
    if (kind === "r") return Promise.resolve(new TextDecoder().decode(bytes));
    if (kind !== "z" || !window.DecompressionStream)
      return Promise.reject(new Error("Unsupported link format."));
    var stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).text();
  }

  function shareLink() {
    encodeBoard().then(
      function (code) {
        var url = location.origin + location.pathname + "#b=" + code;
        if (url.length > 30000) {
          return toast(
            "This board is too big for a link — use Download JSON instead.",
          );
        }
        copyText(url, "Share link copied — anyone with it sees a snapshot.");
      },
      function () {
        toast("Could not build a link. Use Download JSON instead.");
      },
    );
  }

  /* ── Dialogs ──────────────────────────────────────────── */
  var dlg = $("#dlg");
  function openDlg(build) {
    dlg.textContent = "";
    var box = document.createElement("div");
    box.className = "dlg__in";
    build(box, function () {
      dlg.close();
    });
    dlg.appendChild(box);
    dlg.showModal();
  }

  function confirmDlg(title, body, onYes) {
    openDlg(function (box, close) {
      var h = document.createElement("h3");
      h.textContent = title;
      var p = document.createElement("p");
      p.textContent = body;
      var row = document.createElement("div");
      row.className = "dlg__row";
      var no = document.createElement("button");
      no.className = "btn";
      no.textContent = "Cancel";
      no.addEventListener("click", close);
      var yes = document.createElement("button");
      yes.className = "btn btn--danger";
      yes.textContent = "Yes, do it";
      yes.addEventListener("click", function () {
        close();
        onYes();
      });
      row.appendChild(no);
      row.appendChild(yes);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(row);
    });
  }

  function dialogText(title, text) {
    openDlg(function (box, close) {
      var h = document.createElement("h3");
      h.textContent = title;
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.readOnly = true;
      var row = document.createElement("div");
      row.className = "dlg__row";
      var ok = document.createElement("button");
      ok.className = "btn btn--primary";
      ok.textContent = "Close";
      ok.addEventListener("click", close);
      row.appendChild(ok);
      box.appendChild(h);
      box.appendChild(ta);
      box.appendChild(row);
      ta.focus();
      ta.select();
    });
  }

  function importDlg() {
    openDlg(function (box, close) {
      var h = document.createElement("h3");
      h.textContent = "Import a board";
      var p = document.createElement("p");
      p.textContent =
        "Paste an exported board or a share link. Merge keeps your current cards and adds theirs — handy when everyone wrote on their own device.";
      var ta = document.createElement("textarea");
      ta.placeholder = '{"v":1,…}   or   https://…/retro/#b=z…';
      var file = document.createElement("input");
      file.type = "file";
      file.accept = "application/json,.json";
      file.style.marginTop = "10px";
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (f.size > 2000000) return toast("That file is too big.");
        f.text().then(function (t) {
          ta.value = t;
        });
      });
      var row = document.createElement("div");
      row.className = "dlg__row";
      var cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", close);
      var merge = document.createElement("button");
      merge.className = "btn";
      merge.textContent = "Merge cards";
      var replace = document.createElement("button");
      replace.className = "btn btn--primary";
      replace.textContent = "Replace board";

      function parse() {
        var raw = ta.value.trim();
        if (!raw) throw new Error("Nothing pasted.");
        var m = /#b=([A-Za-z0-9\-_]+)/.exec(raw);
        if (m) return decodeBoard(m[1]).then(JSON.parse);
        return Promise.resolve(JSON.parse(raw));
      }
      function run(mode) {
        Promise.resolve()
          .then(parse)
          .then(sanitize)
          .then(function (b) {
            if (mode === "replace") {
              S = b;
              toast("Board replaced.");
            } else {
              var seen = {};
              S.cards.forEach(function (c) {
                seen[c.id] = 1;
              });
              var colIds = S.cols.map(function (c) {
                return c.id;
              });
              var added = 0;
              b.cards.forEach(function (c) {
                if (seen[c.id]) return;
                // Columns differ between boards; fall back by position.
                if (colIds.indexOf(c.col) < 0) {
                  var i = b.cols
                    .map(function (x) {
                      return x.id;
                    })
                    .indexOf(c.col);
                  c.col = colIds[clamp(i, 0, colIds.length - 1)] || colIds[0];
                }
                c.parent = null;
                S.cards.push(c);
                added++;
              });
              b.actions.forEach(function (a) {
                if (
                  !S.actions.filter(function (x) {
                    return x.id === a.id;
                  }).length
                )
                  S.actions.push(a);
              });
              toast(plural(added, "card") + " merged in.");
            }
            close();
            if (S.phase === "setup") S.phase = "group";
            render();
          })
          .catch(function (err) {
            toast(err.message || "Could not read that board.");
          });
      }
      merge.addEventListener("click", function () {
        run("merge");
      });
      replace.addEventListener("click", function () {
        run("replace");
      });

      row.appendChild(cancel);
      row.appendChild(merge);
      row.appendChild(replace);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(ta);
      box.appendChild(file);
      box.appendChild(row);
      ta.focus();
    });
  }

  function menuDlg() {
    var items = [
      [
        "Import or merge a board",
        "Paste an export, a link, or a JSON file.",
        importDlg,
      ],
      [
        "Download this board",
        "A JSON file you can re-import later.",
        function () {
          download(
            boardTitle()
              .replace(/[^\w\-]+/g, "-")
              .toLowerCase() + ".json",
            JSON.stringify(S, null, 2),
          );
        },
      ],
      ["Copy a share link", "A compressed snapshot in a URL.", shareLink],
      [
        "Reset all votes",
        "Keeps the cards, clears the dots.",
        function () {
          confirmDlg(
            "Reset every vote?",
            "The cards stay, the votes go.",
            function () {
              S.cards.forEach(function (c) {
                c.votes = [];
              });
              render();
              toast("Votes cleared.");
            },
          );
        },
      ],
      [
        "Start a new retro",
        "Wipes this board from your browser.",
        function () {
          confirmDlg(
            "Start over?",
            "This board is only stored in your browser, so it will be gone for good. Export it first if you need it.",
            function () {
              S = newBoard(S.tpl);
              setTimer(S.settings.write);
              render();
              toast("Fresh board.");
            },
          );
        },
      ],
    ];
    openDlg(function (box, close) {
      var h = document.createElement("h3");
      h.textContent = "Board";
      var menu = document.createElement("div");
      menu.className = "menu";
      items.forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button";
        var strong = document.createElement("span");
        strong.textContent = it[0];
        var small = document.createElement("small");
        small.textContent = it[1];
        var col = document.createElement("span");
        col.appendChild(strong);
        col.appendChild(small);
        b.appendChild(col);
        b.addEventListener("click", function () {
          close();
          it[2]();
        });
        menu.appendChild(b);
      });
      box.appendChild(h);
      box.appendChild(menu);
    });
  }

  function helpDlg() {
    var keys = [
      ["1 – 6", "Jump to a column's card box while writing"],
      ["Enter", "Add the card (Shift+Enter for a new line)"],
      ["T", "Start or pause the timer"],
      ["← →", "Previous / next topic while discussing"],
      ["?", "This help"],
      ["Esc", "Close a dialog"],
    ];
    openDlg(function (box, close) {
      var h = document.createElement("h3");
      h.textContent = "Keyboard";
      var g = document.createElement("div");
      g.className = "keys";
      keys.forEach(function (k) {
        var kbd = document.createElement("kbd");
        kbd.textContent = k[0];
        var s = document.createElement("span");
        s.textContent = k[1];
        g.appendChild(kbd);
        g.appendChild(s);
      });
      var p = document.createElement("p");
      p.style.marginTop = "18px";
      p.textContent =
        "Everything is stored in this browser only. Nothing is uploaded anywhere — to share, export the board or copy a share link.";
      var row = document.createElement("div");
      row.className = "dlg__row";
      var ok = document.createElement("button");
      ok.className = "btn btn--primary";
      ok.textContent = "Got it";
      ok.addEventListener("click", close);
      row.appendChild(ok);
      box.appendChild(h);
      box.appendChild(g);
      box.appendChild(p);
      box.appendChild(row);
    });
  }

  /* ── Phase movement ───────────────────────────────────── */
  function goPhase(id) {
    if (S.phase === "setup" && id !== "setup") readSettings();
    if (id === "write") setTimer(S.settings.write);
    if (id === "discuss") setTimer(S.settings.discuss);
    if (id === "group" && S.settings.blind) S.settings.blind = false;
    S.phase = id;
    render();
    var main = $("#app");
    if (main) main.scrollTop = 0;
  }

  /* ── Wiring ───────────────────────────────────────────── */
  function wire() {
    $("#boardTitle").addEventListener("input", function (e) {
      S.title = e.target.value.slice(0, 120);
      save();
    });
    $("#startBoard").addEventListener("click", function () {
      readSettings();
      goPhase("write");
    });
    $("#importBtn").addEventListener("click", importDlg);
    $("#menuBtn").addEventListener("click", menuDlg);
    $("#helpBtn").addEventListener("click", helpDlg);
    $("#presenterBtn").addEventListener("click", function () {
      var on = document.body.classList.toggle("is-presenter");
      $("#presenterBtn").setAttribute("aria-pressed", String(on));
      store("retro:presenter", on ? "1" : "0");
    });
    $("#prevPhase").addEventListener("click", function () {
      goPhase(PHASES[Math.max(0, phaseIndex(S.phase) - 1)].id);
    });
    $("#nextPhase").addEventListener("click", function () {
      goPhase(PHASES[Math.min(PHASES.length - 1, phaseIndex(S.phase) + 1)].id);
    });
    $("#timerToggle").addEventListener("click", toggleTimer);
    $("#timerReset").addEventListener("click", function () {
      setTimer(S.phase === "discuss" ? S.settings.discuss : S.settings.write);
    });
    $("#timerPlus").addEventListener("click", function () {
      T.total += 60000;
      if (T.running) T.endsAt += 60000;
      else T.left += 60000;
      T.fired = false;
      paintTimer();
    });

    $("#wrapActionAdd").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = $("#wrapActionText");
      var o = $("#wrapActionOwner");
      var text = t.value.trim();
      if (!text) return;
      S.actions.push({
        id: uid(),
        text: text,
        owner: o.value.trim(),
        done: false,
      });
      t.value = "";
      o.value = "";
      render();
    });

    $(".exports").addEventListener("click", function (e) {
      var kind = e.target.getAttribute("data-export");
      if (!kind) return;
      if (kind === "md")
        copyText(
          toMarkdown(),
          "Markdown copied — paste it into Teams or a wiki.",
        );
      if (kind === "text") copyText(toPlain(), "Plain text copied.");
      if (kind === "json")
        download(
          boardTitle()
            .replace(/[^\w\-]+/g, "-")
            .toLowerCase() + ".json",
          JSON.stringify(S, null, 2),
        );
      if (kind === "link") shareLink();
    });

    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
        document.activeElement.tagName,
      );
      if (e.key === "?" && !typing) {
        e.preventDefault();
        return helpDlg();
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        /^[1-6]$/.test(e.key) &&
        (S.phase === "write" || S.phase === "group")
      ) {
        var col = S.cols[parseInt(e.key, 10) - 1];
        if (!col) return;
        var ta = $('.composer textarea[data-col="' + cssEsc(col.id) + '"]');
        if (ta) {
          e.preventDefault();
          ta.focus();
        }
      }
      if (e.key.toLowerCase() === "t" && !$("#timer").hidden) {
        e.preventDefault();
        toggleTimer();
      }
      if (
        S.phase === "discuss" &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        var list = topics();
        var i = clamp(
          S.cursor + (e.key === "ArrowRight" ? 1 : -1),
          0,
          list.length - 1,
        );
        if (i !== S.cursor) {
          S.cursor = i;
          setTimer(S.settings.discuss);
          render();
        }
      }
    });

    window.addEventListener("beforeunload", function () {
      store(KEY, JSON.stringify(S));
    });
  }

  /* ── Boot ─────────────────────────────────────────────── */
  function boot() {
    loadMe();
    if (store("retro:presenter") === "1") {
      document.body.classList.add("is-presenter");
      $("#presenterBtn").setAttribute("aria-pressed", "true");
    }

    var hash = /^#b=([A-Za-z0-9\-_]+)$/.exec(location.hash || "");
    var saved = store(KEY);
    try {
      S = saved ? sanitize(JSON.parse(saved)) : newBoard("ssc");
    } catch (e) {
      S = newBoard("ssc");
    }
    wire();
    setTimer(S.settings.write);
    render();

    if (hash) {
      decodeBoard(hash[1])
        .then(JSON.parse)
        .then(sanitize)
        .then(function (b) {
          history.replaceState(null, "", location.pathname);
          confirmDlg(
            "Open the shared board?",
            "This link contains a retro" +
              (b.title ? ' called "' + b.title + '"' : "") +
              " with " +
              b.cards.length +
              " cards. Opening it replaces the board currently in this browser.",
            function () {
              S = b;
              S.phase = S.phase === "setup" ? "group" : S.phase;
              render();
              toast("Shared board loaded.");
            },
          );
        })
        .catch(function () {
          toast("That share link could not be read.");
        });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
