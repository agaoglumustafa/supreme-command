// ============================================================
(function SCPlayableFix() {
  "use strict";

  window.scCountMapPaths = function () {
    try {
      return document.querySelectorAll("#game-map path.country-path, #game-map path").length;
    } catch (e) { return 0; }
  };

  window.scForceHideMenus = function () {
    ["main-menu-screen", "lobby-screen", "sc-tutorial", "credits-modal", "mp-lobby-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.setAttribute("aria-hidden", "true");
    });
  };

  window.scShowGameShell = function () {
    scForceHideMenus();
    var root = document.getElementById("game-root");
    if (root) {
      root.style.setProperty("display", "flex", "important");
      root.style.setProperty("visibility", "visible", "important");
      root.style.opacity = "1";
    }
    var top = document.getElementById("top-bar");
    if (top) {
      top.style.setProperty("display", "flex", "important");
      top.style.visibility = "visible";
    }
    var mc = document.getElementById("map-container");
    if (mc) {
      mc.style.visibility = "visible";
      mc.style.opacity = "1";
    }
  };

  // Full map redraw if wiped
  window.scRedrawMap = function () {
    return new Promise(function (resolve) {
      try {
        if (typeof d3 === "undefined") return resolve(false);
        var svg = d3.select("#game-map");
        if (svg.empty()) return resolve(false);
        var g = svg.select("g");
        if (g.empty()) g = svg.append("g");
        // clear only paths, keep structure
        g.selectAll("path").remove();
        var url = (typeof MAP_JSON_URL !== "undefined") ? MAP_JSON_URL : "./assets/maps/1081/map.json";
        d3.json(url).then(function (provinces) {
          if (!provinces || !provinces.length) {
            console.warn("[playable] map.json empty");
            return resolve(false);
          }
          g.selectAll("path")
            .data(provinces)
            .enter()
            .append("path")
            .attr("d", function (d) { return d.path; })
            .attr("class", "country-path")
            .attr("id", function (d) { return String(d.name).replace(/[^a-zA-Z0-9_]/g, "_"); })
            .attr("data-name", function (d) { return d.name; })
            .style("fill", function (d) {
              var owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(d.name) : "NEUTRAL";
              return (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
            })
            .style("stroke", "rgba(0,0,0,0.2)")
            .style("stroke-width", 0.02)
            .on("click", function (event, d) {
              if (typeof handleProvinceClick === "function") handleProvinceClick(event, d);
            })
            .on("contextmenu", function (event, d) {
              event.preventDefault();
              if (typeof handleProvinceClick === "function") handleProvinceClick(event, d);
            });
          try {
            if (typeof refreshMapColors === "function") refreshMapColors();
          } catch (e) {}
          // Fit view
          try {
            var bounds = g.node().getBBox();
            var zoom = d3.zoom();
            var scale = Math.min(
              (window.innerWidth - 80) / Math.max(bounds.width, 1),
              (window.innerHeight - 80) / Math.max(bounds.height, 1)
            ) * 0.85;
            svg.call(zoom.transform, d3.zoomIdentity
              .translate(window.innerWidth / 2, window.innerHeight / 2)
              .scale(scale)
              .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2));
          } catch (e) {}
          console.log("[playable] map redrawn →", provinces.length);
          resolve(true);
        }).catch(function (e) {
          console.error("[playable] map fetch", e);
          resolve(false);
        });
      } catch (e) {
        console.error("[playable] redraw", e);
        resolve(false);
      }
    });
  };

  // Reliable political color paint (bypass broken wrappers)
  window.scPaintPolitical = function () {
    try {
      // Delegate to single source of truth — avoids opacity/fill fight (blink)
      if (typeof refreshMapColors === "function") {
        refreshMapColors();
        return;
      }
      var occ = GameState.occupations || {};
      d3.selectAll("#game-map path.country-path").each(function () {
        var path = d3.select(this);
        var name = path.attr("data-name");
        if (!name) return;
        var owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : (provinceOwners[name] || "NEUTRAL");
        var color = (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
        if (occ[name] && occ[name] !== owner) {
          var oColor = (GameState.countries[occ[name]] && GameState.countries[occ[name]].color) || "#fbbf24";
          var blended = (typeof blendHexColors === "function") ? blendHexColors(color, oColor, 0.48) : oColor;
          path.style("fill", blended);
        } else {
          path.style("fill", color);
        }
        path.style("opacity", null);
      });
    } catch (e) {
      console.warn("[paint]", e);
    }
  };

  // Wrap startGame to always show shell + ensure map
  (function wrapStart() {
    var prev = window.startGame;
    if (typeof prev !== "function") return;
    window.startGame = async function () {
      var r;
      try {
        r = await prev.apply(this, arguments);
      } catch (e) {
        console.error("[start]", e);
      }
      try {
        scShowGameShell();
        var n = scCountMapPaths();
        if (n < 100) {
          console.warn("[playable] map missing after start (" + n + ") — redraw");
          await scRedrawMap();
        }
        scPaintPolitical();
        scShowGameShell();
        // Keep menus dead for a few seconds (fight any re-show)
        var i = 0;
        var iv = setInterval(function () {
          scShowGameShell();
          if (++i > 15) clearInterval(iv);
        }, 200);
      } catch (e) {
        console.error("[playable post-start]", e);
      }
      return r;
    };
  })();

  // One-click playable: from main menu go TUR modern
  window.scQuickPlay = async function () {
    try {
      if (typeof mainMenuNewGame === "function") mainMenuNewGame();
      await new Promise(function (r) { setTimeout(r, 100); });
      var ls = document.getElementById("lobby-country-select");
      if (ls) {
        if ([].some.call(ls.options, function (o) { return o.value === "TUR"; })) ls.value = "TUR";
      }
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) ss.value = "modern";
      GameState.player = "TUR";
      if (typeof startGame === "function") await startGame();
      scShowGameShell();
      if (scCountMapPaths() < 100) await scRedrawMap();
      scPaintPolitical();
      try {
        if (typeof log === "function") log("Hızlı oyun: Türkiye · Modern", "text-emerald-400");
      } catch (e) {}
      return true;
    } catch (e) {
      console.error("[quickplay]", e);
      return false;
    }
  };

  // CSS nuclear
  var style = document.createElement("style");
  style.id = "sc-playable-css";
  style.textContent = [
    "#main-menu-screen.hidden,#lobby-screen.hidden,#sc-tutorial,#credits-modal.hidden,#mp-lobby-modal.hidden{",
    "display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important;z-index:-1!important;}",
    "#game-root{min-height:0;}",
    "#map-container{background:#031a5c!important;}",
    ".country-path{cursor:pointer;}"
  ].join("");
  if (document.head) document.head.appendChild(style);
  else document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });

  // Watchdog: if game running but map empty, redraw once
  var _wdOnce = false;
  setInterval(function () {
    try {
      if (!GameState || !GameState.running || GameState.gameOver) return;
      if (scCountMapPaths() >= 100) { _wdOnce = false; return; }
      if (_wdOnce) return;
      _wdOnce = true;
      console.warn("[playable] watchdog redraw");
      scRedrawMap().then(function () { scPaintPolitical(); scShowGameShell(); });
    } catch (e) {}
  }, 2500);

  console.log("[playable] map redraw · menu lock · quickplay ready");
})();

// ============================================================
// PLAYABLE HARD LOCK — keep menus dead while running + SP polish
// ============================================================
(function SCHardPlayable() {
  "use strict";

  function hardHideMenus() {
    ["main-menu-screen", "lobby-screen", "sc-tutorial", "credits-modal", "mp-lobby-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("opacity", "0", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("z-index", "-1", "important");
    });
  }

  function ensureShell() {
    hardHideMenus();
    var root = document.getElementById("game-root");
    if (root) {
      root.style.setProperty("display", "flex", "important");
      root.style.setProperty("visibility", "visible", "important");
      root.style.opacity = "1";
    }
    var top = document.getElementById("top-bar");
    if (top) {
      top.style.setProperty("display", "flex", "important");
      top.style.visibility = "visible";
      top.style.opacity = "1";
    }
    var mc = document.getElementById("map-container");
    if (mc) {
      mc.style.visibility = "visible";
      mc.style.opacity = "1";
    }
    var logp = document.getElementById("log-panel");
    if (logp) logp.classList.remove("hidden");
  }

  // Soft lock — only if menu leaked back (anti-blink: not every 400ms)
  setInterval(function () {
    try {
      if (!window.GameState || !GameState.running || GameState.gameOver) return;
      var mm = document.getElementById("main-menu-screen");
      var lb = document.getElementById("lobby-screen");
      var leaked = (mm && mm.style.display !== "none" && !mm.classList.contains("hidden")) ||
                   (lb && lb.style.display !== "none" && !lb.classList.contains("hidden"));
      if (leaked) ensureShell();
      if (!document.body.classList.contains("sc-ingame")) document.body.classList.add("sc-ingame");
    } catch (e) {}
  }, 2500);

  // Patch startGame one more time — last wins
  var _prevStart = window.startGame;
  window.startGame = async function () {
    var r;
    try {
      if (typeof _prevStart === "function") r = await _prevStart.apply(this, arguments);
    } catch (e) {
      console.error("[hard-start]", e);
    }
    try {
      GameState.running = true;
      ensureShell();
      if (typeof scCountMapPaths === "function" && scCountMapPaths() < 100 && typeof scRedrawMap === "function") {
        await scRedrawMap();
      }
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      ensureShell();
      // aggressive lock for first 5s
      var i = 0;
      var iv = setInterval(function () {
        ensureShell();
        if (++i > 25) clearInterval(iv);
      }, 200);
    } catch (e) {
      console.error("[hard post-start]", e);
    }
    return r;
  };

  // One-button reliable SP: TUR modern
  window.scForcePlay = async function () {
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls) ls.value = "TUR";
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) ss.value = "modern";
      GameState.player = "TUR";
      if (typeof startGame === "function") await startGame();
      ensureShell();
      return true;
    } catch (e) {
      console.error("[forcePlay]", e);
      return false;
    }
  };

  // Extra CSS nuclear
  var st = document.createElement("style");
  st.id = "sc-hard-playable-css";
  st.textContent = [
    "body.sc-ingame #main-menu-screen,",
    "body.sc-ingame #lobby-screen,",
    "body.sc-ingame #credits-modal,",
    "body.sc-ingame #mp-lobby-modal,",
    "body.sc-ingame #sc-tutorial {",
    "  display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;",
    "}",
    "body.sc-ingame #game-root { display:flex!important; visibility:visible!important; }",
    "body.sc-ingame #top-bar { display:flex!important; visibility:visible!important; }"
  ].join("");
  (document.head || document.documentElement).appendChild(st);

  // Toggle body class with running state
  setInterval(function () {
    try {
      if (GameState && GameState.running && !GameState.gameOver) {
        if (!document.body.classList.contains("sc-ingame")) document.body.classList.add("sc-ingame");
      } else {
        if (document.body.classList.contains("sc-ingame")) document.body.classList.remove("sc-ingame");
      }
    } catch (e) {}
  }, 2000);

  console.log("[hard-playable] menu lock + forcePlay ready");
})();



// Ensure GameState is reachable from window (classic script const is not on window)
(function(){
  try {
    if (typeof GameState !== "undefined") window.GameState = GameState;
    if (typeof provinceOwners !== "undefined") window.provinceOwners = provinceOwners;
  } catch (e) {}
})();

// ===== SC RELEASE POLISH v1.1.3 =====
(function SCRelease113() {
  "use strict";

  function showEl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("hidden");
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("z-index", id === "main-menu-screen" ? "60" : "50", "important");
  }
  function hideEl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add("hidden");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("z-index", "-1", "important");
  }

  // Reliable menu navigation
  window.mainMenuNewGame = function () {
    hideEl("main-menu-screen");
    hideEl("credits-modal");
    hideEl("mp-lobby-modal");
    showEl("lobby-screen");
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls && !ls.value) ls.value = "TUR";
      var ss = document.getElementById("lobby-scenario-select");
      if (ss && !ss.value) ss.value = "modern";
    } catch (e) {}
  };
  window.mainMenuBack = function () {
    hideEl("lobby-screen");
    hideEl("mp-lobby-modal");
    showEl("main-menu-screen");
    try { if (typeof refreshContinueButton === "function") refreshContinueButton(); } catch (e) {}
  };

  // Final start wrapper — always last
  var _relPrev = window.startGame;
  window.startGame = async function startGameRelease() {
    var err = null;
    try {
      if (typeof _relPrev === "function") await _relPrev.apply(this, arguments);
    } catch (e) {
      err = e;
      console.error("[release-start]", e);
    }
    try {
      if (typeof GameState !== "undefined") GameState.running = true;
      hideEl("main-menu-screen");
      hideEl("lobby-screen");
      hideEl("credits-modal");
      hideEl("mp-lobby-modal");
      document.body.classList.add("sc-ingame");
      var root = document.getElementById("game-root");
      if (root) {
        root.style.setProperty("display", "flex", "important");
        root.style.setProperty("visibility", "visible", "important");
      }
      var top = document.getElementById("top-bar");
      if (top) top.style.setProperty("display", "flex", "important");
      if (typeof scCountMapPaths === "function" && scCountMapPaths() < 100 && typeof scRedrawMap === "function") {
        await scRedrawMap();
      }
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      // Keep menus dead 6s
      var n = 0;
      var iv = setInterval(function () {
        hideEl("main-menu-screen");
        hideEl("lobby-screen");
        if (++n > 30) clearInterval(iv);
      }, 200);
    } catch (e2) {
      console.error("[release-post]", e2);
    }
    if (err) throw err;
  };

  // Force play always available
  window.scForcePlay = async function () {
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls) {
        try { ls.value = "TUR"; } catch (e) {}
      }
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) {
        try { ss.value = "modern"; } catch (e) {}
      }
      if (typeof GameState !== "undefined") GameState.player = "TUR";
      hideEl("main-menu-screen");
      showEl("lobby-screen");
      await new Promise(function (r) { setTimeout(r, 80); });
      if (typeof startGame === "function") await startGame();
      hideEl("main-menu-screen");
      hideEl("lobby-screen");
      document.body.classList.add("sc-ingame");
      return true;
    } catch (e) {
      console.error("[scForcePlay]", e);
      try {
        if (typeof showToast === "function") showToast("Başlatma hatası: " + (e && e.message ? e.message : e), "bad");
      } catch (e2) {}
      return false;
    }
  };

  // Continuous menu lock while running
  setInterval(function () {
    try {
      if (typeof GameState === "undefined" || !GameState.running || GameState.gameOver) {
        document.body.classList.remove("sc-ingame");
        return;
      }
      document.body.classList.add("sc-ingame");
      ["main-menu-screen", "lobby-screen", "credits-modal", "mp-lobby-modal", "sc-tutorial"].forEach(hideEl);
    } catch (e) {}
  }, 500);

  console.log("[release v1.1.3] menu nav + forcePlay + lock");
})();


// ===== SC HOUR ONE — first-hour engagement =====
// Goal: player should not stare at a quiet map for the first ~1h of real play.
(function SCHourOne() {
  "use strict";

  var DAY_MS = 24 * 3600 * 1000;
  var WINDOW_DAYS = 120; // first ~4 game months = dense opening

  function GS() {
    try { return window.GameState || (typeof GameState !== "undefined" ? GameState : null); } catch (e) { return null; }
  }

  function ensureHour() {
    var g = GS();
    if (!g) return null;
    if (!g.hourOne) {
      g.hourOne = {
        startMs: g.date ? g.date.getTime() : Date.now(),
        dayIndex: 0,
        lastPulseDay: -1,
        lastNewsDay: -1,
        missionsDone: {},
        flashWars: 0,
        tensionBoosted: false,
        introFired: false
      };
    }
    return g.hourOne;
  }

  function daysSinceStart(g, h) {
    if (!g || !g.date || !h) return 0;
    return Math.max(0, Math.floor((g.date.getTime() - h.startMs) / DAY_MS));
  }

  function inOpening(g, h) {
    return daysSinceStart(g, h) <= WINDOW_DAYS;
  }

  function neighborsOfPlayer(g) {
    var out = [];
    try {
      if (typeof countriesShareBorder !== "function") return out;
      Object.keys(g.countries || {}).forEach(function (iso) {
        if (iso === g.player) return;
        if (countriesShareBorder(iso, g.player)) out.push(iso);
      });
    } catch (e) {}
    return out;
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function nameOf(g, iso) {
    var c = g.countries[iso];
    return (c && c.name) || iso;
  }

  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(msg, kind || "info");
      else if (typeof log === "function") log(msg, "text-amber-300");
    } catch (e) {}
  }

  function slog(msg, cls) {
    try { if (typeof log === "function") log(msg, cls || "text-slate-300"); } catch (e) {}
  }

  // ----- Opening missions (auto-tracked) -----
  var MISSIONS = [
    {
      id: "focus_start",
      title: "Milli odak başlat",
      hint: "Sol panelden bir milli odak seç — ilk 2 hafta içinde.",
      check: function (g) {
        var p = g.countries[g.player];
        return !!(p && (p.activeFocus || (p.completedFocuses && p.completedFocuses.length)));
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 250;
        p.manpower = (p.manpower || 0) + 8000;
        slog("🎯 GÖREV: Milli odak — +250 hazine, +8K İG", "text-emerald-400");
        toast("Görev tamam: Milli odak", "good");
      }
    },
    {
      id: "build_civ",
      title: "1 sivil fabrika kur / yükselt",
      hint: "Ekonomi paneli veya inşa ile sivil fabrika sayını artır.",
      check: function (g, h) {
        var p = g.countries[g.player];
        if (!p) return false;
        if (h.baseCiv == null) h.baseCiv = p.civFactories || 0;
        return (p.civFactories || 0) > h.baseCiv;
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 400;
        slog("🎯 GÖREV: Sivil fabrika — +400 hazine", "text-emerald-400");
        toast("Görev tamam: Sanayi", "good");
      }
    },
    {
      id: "raise_div",
      title: "Orduyu büyüt",
      hint: "En az +2 piyade tümeni kur (stok / seferberlik).",
      check: function (g, h) {
        var p = g.countries[g.player];
        if (!p || !p.divisions) return false;
        var inf = p.divisions.inf || 0;
        if (h.baseInf == null) h.baseInf = inf;
        return inf >= h.baseInf + 2;
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.stockpile = p.stockpile || {};
        p.stockpile.guns = (p.stockpile.guns || 0) + 1200;
        slog("🎯 GÖREV: Ordu büyütme — +1200 tüfek", "text-emerald-400");
        toast("Görev tamam: Seferberlik", "good");
      }
    },
    {
      id: "survive_crisis",
      title: "İlk krizi atlat",
      hint: "Açılış krizlerinden birini seçimle çöz.",
      check: function (g, h) { return !!h.crisisResolved; },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 300;
        g.globalTension = Math.max(0, (g.globalTension || 0) - 3);
        slog("🎯 GÖREV: Kriz yönetimi — +300 hazine, gerilim −3", "text-emerald-400");
        toast("Görev tamam: Kriz", "good");
      }
    }
  ];

  function checkMissions(g, h) {
    MISSIONS.forEach(function (m) {
      if (h.missionsDone[m.id]) return;
      try {
        if (m.check(g, h)) {
          h.missionsDone[m.id] = true;
          m.reward(g);
          try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
        }
      } catch (e) {}
    });
  }

  // ----- Scripted crises (modal when possible) -----
  function fireChoiceEvent(title, desc, choices) {
    try {
      if (typeof showEventModal === "function") {
        // generic fallback below
      }
    } catch (e) {}
    // Build a lightweight modal compatible with existing event-modal id
    if (document.getElementById("event-modal")) return false;
    var modal = document.createElement("div");
    modal.id = "event-modal";
    modal.className = "fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 p-4";
    var btns = choices.map(function (c, i) {
      return '<button type="button" data-i="' + i + '" class="w-full text-left px-3 py-2 mb-2 rounded border border-slate-600 bg-slate-900 hover:border-amber-600 text-sm text-slate-200">' +
        c.label + "</button>";
    }).join("");
    modal.innerHTML =
      '<div class="w-full max-w-md rounded border border-amber-800/50 bg-[#12161f] shadow-2xl overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-slate-800 bg-[#0e1219]">' +
      '<div class="text-[10px] uppercase tracking-widest text-amber-600 font-bold">Açılış Krizi</div>' +
      '<h2 class="text-base font-bold text-amber-100 mt-1">' + title + "</h2></div>" +
      '<div class="px-4 py-3 text-sm text-slate-300 leading-relaxed">' + desc + "</div>" +
      '<div class="px-4 py-3 border-t border-slate-800">' + btns + "</div></div>";
    document.body.appendChild(modal);
    modal.querySelectorAll("button[data-i]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-i"), 10);
        try { choices[idx].fn(); } catch (e) { console.warn(e); }
        modal.remove();
        var g = GS();
        var h = ensureHour();
        if (h) h.crisisResolved = true;
        try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
      });
    });
    return true;
  }

  function crisisBorder(g, h) {
    var n = pick(neighborsOfPlayer(g));
    if (!n) n = pick(Object.keys(g.countries || {}).filter(function (x) { return x !== g.player; }));
    if (!n) return;
    var nm = nameOf(g, n);
    fireChoiceEvent(
      "Sınır Olayı — " + nm,
      nm + " birlikleri sınırda 'tatbikat' adı altında yığınak yaptı. Basın galeyanda. Nasıl karşılık veriyorsun?",
      [
        {
          label: "Diplomatik nota ver (gerilim +2, ilişki −5)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 2);
            if (!g.relations) g.relations = {};
            g.relations[n] = (g.relations[n] || 0) - 5;
            slog("📜 Nota: " + nm + " protesto edildi.", "text-yellow-300");
          }
        },
        {
          label: "Karşılık yığınak (para −120, gerilim +6, ordu moral +)",
          fn: function () {
            var p = g.countries[g.player];
            if (p) p.money = Math.max(0, (p.money || 0) - 120);
            g.globalTension = Math.min(100, (g.globalTension || 0) + 6);
            if (p && p.divisions) p.divisions.inf = (p.divisions.inf || 0) + 1;
            slog("🪖 Sınır yığınağı: " + nm + " karşısında 1 tümen konuşlandı.", "text-orange-400");
          }
        },
        {
          label: "Görmezden gel (gerilim +1, istikrar riski)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 1);
            var p = g.countries[g.player];
            if (p) p.stability = Math.max(20, (p.stability || 55) - 4);
            slog("😶 Kriz yok sayıldı — muhalefet sert eleştirdi.", "text-slate-400");
          }
        }
      ]
    );
  }

  function crisisEconomy(g, h) {
    fireChoiceEvent(
      "Bütçe Krizi",
      "Hazine beklenenden zayıf geldi. Kabine ikiye bölündü: kemer sıkma mı, açık mı?",
      [
        {
          label: "Kemer sık (para +180, fabrika verimi −3% 60 gün)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = (p.money || 0) + 180;
            p.factoryEfficiency = Math.max(0.7, (p.factoryEfficiency || 1) - 0.03);
            slog("💰 Kemer sıkma paketi kabul edildi.", "text-yellow-300");
          }
        },
        {
          label: "Açık ver, silahlan (para −100, +800 tüfek, gerilim +3)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = Math.max(0, (p.money || 0) - 100);
            p.stockpile = p.stockpile || {};
            p.stockpile.guns = (p.stockpile.guns || 0) + 800;
            g.globalTension = Math.min(100, (g.globalTension || 0) + 3);
            slog("🔫 Silahlanma kredisi açıldı.", "text-orange-400");
          }
        },
        {
          label: "Dış borç (para +500, ilişki maliyeti — komşular −8)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = (p.money || 0) + 500;
            if (!g.relations) g.relations = {};
            neighborsOfPlayer(g).forEach(function (iso) {
              g.relations[iso] = (g.relations[iso] || 0) - 8;
            });
            slog("🏦 Dış borç alındı — komşular tedirgin.", "text-amber-300");
          }
        }
      ]
    );
  }

  function crisisRefugees(g, h) {
    var n = pick(neighborsOfPlayer(g)) || "Bölge";
    var nm = typeof n === "string" && g.countries[n] ? nameOf(g, n) : "komşu bölge";
    fireChoiceEvent(
      "Mülteci Dalgası",
      nm + " tarafından sınırına onlarca bin sivil yığıldı. Kabul mü, geri çevirme mi?",
      [
        {
          label: "Kabul et (+15K İG, para −150, istikrar −3)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.manpower = (p.manpower || 0) + 15000;
            p.money = Math.max(0, (p.money || 0) - 150);
            p.stability = Math.max(15, (p.stability || 55) - 3);
            slog("🏕️ Mülteciler kabul edildi.", "text-cyan-300");
          }
        },
        {
          label: "Sınırı kapat (gerilim +5, ilişki −12)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 5);
            if (g.countries[n] && g.relations) g.relations[n] = (g.relations[n] || 0) - 12;
            slog("🚧 Sınır kapatıldı — uluslararası tepki.", "text-orange-400");
          }
        },
        {
          label: "Geçici kamplar (para −80, İG +6K)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = Math.max(0, (p.money || 0) - 80);
            p.manpower = (p.manpower || 0) + 6000;
            slog("⛺ Geçici kamplar kuruldu.", "text-slate-300");
          }
        }
      ]
    );
  }

  function maybeScriptedCrisis(g, h, day) {
    if (document.getElementById("event-modal")) return;
    // Day 3, 12, 28, 45, 70...
    var slots = [3, 12, 28, 45, 70, 95];
    if (slots.indexOf(day) === -1) return;
    if (h["crisis_" + day]) return;
    h["crisis_" + day] = true;
    var roll = Math.random();
    if (roll < 0.34) crisisBorder(g, h);
    else if (roll < 0.67) crisisEconomy(g, h);
    else crisisRefugees(g, h);
  }

  // ----- World news pulse (log spam that feels alive) -----
  var NEWS = [
    function (g) {
      var a = pick(Object.keys(g.countries)); var b = pick(Object.keys(g.countries));
      if (!a || !b || a === b) return null;
      return "📰 " + nameOf(g, a) + " ile " + nameOf(g, b) + " arasında ticaret görüşmeleri sürüyor.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "🏭 " + nameOf(g, a) + " yeni bir silah fabrikasını devreye aldı." : null;
    },
    function (g) {
      return "📡 Küresel gerilim: %" + Math.floor(g.globalTension || 0) + " — borsalar temkinli.";
    },
    function (g) {
      var a = pick(neighborsOfPlayer(g));
      return a ? "🚨 İstihbarat: " + nameOf(g, a) + " sınırında olağan dışı hareketlilik." : "🚨 İstihbarat: bölgede tatbikat yoğunluğu arttı.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "🕊️ " + nameOf(g, a) + " barış çağrısı yayımladı (propaganda olabilir)." : null;
    },
    function (g) {
      return "⚔️ Ani çatışma raporları: uzak bir cephede topçu ateşi duyuldu.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "👷 " + nameOf(g, a) + " içinde grev dalgası — üretim düştü." : null;
    }
  ];

  function pulseNews(g, h, day) {
    if (day === h.lastNewsDay) return;
    if (day % 2 !== 0) return; // every other day in opening
    h.lastNewsDay = day;
    var fn = pick(NEWS);
    var line = fn && fn(g);
    if (line) slog(line, "text-slate-400");
  }

  // ----- AI flash wars (not on player, but visible) -----
  function maybeFlashWar(g, h, day) {
    if (h.flashWars >= 5) return;
    if (day < 5 || day % 11 !== 0) return;
    if (Math.random() > 0.55) return;
    var keys = Object.keys(g.countries || {}).filter(function (iso) {
      return iso !== g.player && g.countries[iso] && !g.countries[iso].isCapitulated;
    });
    if (keys.length < 2) return;
    var a = pick(keys);
    var b = pick(keys.filter(function (x) { return x !== a; }));
    if (!a || !b) return;
    h.flashWars++;
    g.globalTension = Math.min(100, (g.globalTension || 0) + 4 + Math.floor(Math.random() * 5));
    var ca = g.countries[a], cb = g.countries[b];
    if (ca) ca.money = Math.max(0, (ca.money || 0) - 60);
    if (cb) cb.money = Math.max(0, (cb.money || 0) - 50);
    slog("⚔️ BÖLGESEL ÇATIŞMA: " + nameOf(g, a) + " × " + nameOf(g, b) + " — gerilim yükseldi!", "text-red-400");
    toast(nameOf(g, a) + " savaşa girdi", "bad");
  }

  // ----- Neighbor harassment -----
  function maybeNeighborPressure(g, h, day) {
    if (day < 6 || day % 9 !== 0) return;
    var n = pick(neighborsOfPlayer(g));
    if (!n) return;
    if (!g.relations) g.relations = {};
    g.relations[n] = (g.relations[n] || 0) - (2 + Math.floor(Math.random() * 4));
    g.globalTension = Math.min(100, (g.globalTension || 0) + 1);
    if (Math.random() < 0.5 && typeof pushInboxMessage === "function") {
      try {
        pushInboxMessage({
          from: n,
          type: "warning",
          text: "Sınır hattındaki hareketleriniz endişe verici. Açıklama bekliyoruz.",
          expiresWeeks: 4
        });
      } catch (e) {}
    } else {
      slog("⚠️ " + nameOf(g, n) + " sınır protestosu yayımladı.", "text-orange-300");
    }
  }

  // ----- Mission strip UI -----
  function ensureMissionStrip(g, h) {
    return; /* MISSION_STRIP_OFF */
    if (!inOpening(g, h)) {
      var dead = document.getElementById("sc-hour-missions");
      if (dead) dead.remove();
      return;
    }
    var el = document.getElementById("sc-hour-missions");
    if (!el) {
      el = document.createElement("div");
      el.id = "sc-hour-missions";
      el.style.cssText = "position:fixed;top:3.25rem;left:50%;transform:translateX(-50%);z-index:90;max-width:min(640px,94vw);width:100%;pointer-events:none;";
      document.body.appendChild(el);
    }
    var pending = MISSIONS.filter(function (m) { return !h.missionsDone[m.id]; }).slice(0, 3);
    if (!pending.length) {
      el.innerHTML = '<div style="margin:0 auto;width:fit-content;background:rgba(6,20,12,.88);border:1px solid #2d6b52;color:#86efac;font:11px/1.3 system-ui;padding:6px 12px;border-radius:6px;">✓ Açılış görevleri tamam — dünya hâlâ hareketli</div>';
      return;
    }
    el.innerHTML =
      '<div style="margin:0 auto;background:rgba(12,14,20,.92);border:1px solid #3f3f46;border-radius:8px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.45);">' +
      '<div style="font:10px system-ui;letter-spacing:.14em;text-transform:uppercase;color:#c4a35a;margin-bottom:4px;">İlk saat hedefleri · gün ' + daysSinceStart(g, h) + "/" + WINDOW_DAYS + "</div>" +
      pending.map(function (m) {
        return '<div style="font:12px system-ui;color:#e2e8f0;margin:2px 0;"><span style="color:#fbbf24;">▸</span> <b>' + m.title + "</b> <span style=\"color:#94a3b8;font-size:11px;\">— " + m.hint + "</span></div>";
      }).join("") +
      "</div>";
  }

  function introOnce(g, h) {
    if (h.introFired) return;
    h.introFired = true;
    if (!h.tensionBoosted) {
      g.globalTension = Math.min(100, Math.max(28, (g.globalTension || 0) + 12));
      h.tensionBoosted = true;
    }
    // seed mission baselines
    var p = g.countries[g.player];
    if (p) {
      h.baseCiv = p.civFactories || 0;
      h.baseInf = (p.divisions && p.divisions.inf) || 0;
    }
    slog("🔥 AÇILIŞ: Bölge kaynıyor. İlk 4 ay kritik — görevlerini tamamla, krizleri yönet.", "text-amber-300 font-bold");
    toast("Açılış fazı: dünya hareketleniyor", "info");
    try {
      if (typeof pushInboxMessage === "function") {
        pushInboxMessage({
          from: g.player,
          type: "greet",
          text: "Kurmay başkanı: Komşular teyakkazda. Odak seç, orduyu kur, ilk krize hazır ol.",
          expiresWeeks: 8
        });
      }
    } catch (e) {}
  }

  function hourPulse(){ return; /* HOUR_ONE_DISABLED */ }
  function hourPulse_DISABLED() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var h = ensureHour();
    if (!h) return;
    if (!g.date) return;
    // bind start on first running tick
    if (!h._bound) {
      h.startMs = g.date.getTime();
      h._bound = true;
    }
    var day = daysSinceStart(g, h);
    h.dayIndex = day;
    if (!inOpening(g, h)) {
      ensureMissionStrip(g, h);
      return;
    }
    introOnce(g, h);
    if (day !== h.lastPulseDay) {
      h.lastPulseDay = day;
      pulseNews(g, h, day);
      maybeScriptedCrisis(g, h, day);
      maybeFlashWar(g, h, day);
      maybeNeighborPressure(g, h, day);
      // denser random events in opening
      if (day > 0 && day % 3 === 0 && typeof processRandomEvents === "function" && Math.random() < 0.65) {
        try { processRandomEvents(); } catch (e) {}
      }
    }
    checkMissions(g, h);
    ensureMissionStrip(g, h);
  }

  // Wrap gameTick
  var _tick = typeof gameTick === "function" ? gameTick : null;
  if (_tick) {
    window.gameTick = function () {
      try { _tick.apply(this, arguments); } catch (e) { console.warn("[tick]", e); }
      try { hourPulse(); } catch (e) { console.warn("[hourOne]", e); }
    };
  } else {
    // poll if tick name not yet bound
    var tries = 0;
  /* interval removed (hourPulse/refreshDock blink) */
  }

  // Boost AI aggression slightly during opening via processAITick wrap
  var _ai = window.processAITick;
  if (typeof processAITick === "function" || _ai) {
    var prevAI = window.processAITick || processAITick;
    window.processAITick = function () {
      var g = GS();
      var h = g && ensureHour();
      var old = g && g.aiAggression;
      if (g && h && inOpening(g, h)) {
        g.aiAggression = Math.max(old || 1, 1.35);
      }
      try { return prevAI.apply(this, arguments); } finally {
        if (g && old != null) g.aiAggression = old;
      }
    };
  }

  // Also run pulse on interval as safety if tick wrapper misses
  /* interval removed (hourPulse/refreshDock blink) */

  console.log("[hour-one] first-hour engagement online");
})();


// ===== SC PROGRESSION — growth loop + AI map + rank =====
// Makes the campaign develop: recruit → fight → take land → rank up → harder world.
(function SCProgression() {
  "use strict";

  function GS() {
    try { return window.GameState || (typeof GameState !== "undefined" ? GameState : null); } catch (e) { return null; }
  }
  function owners() {
    try { return window.provinceOwners || (typeof provinceOwners !== "undefined" ? provinceOwners : null); } catch (e) { return null; }
  }
  function slog(msg, cls) {
    try { if (typeof log === "function") log(msg, cls || "text-slate-300"); } catch (e) {}
  }
  function toast(msg, kind) {
    try { if (typeof showToast === "function") showToast(msg, kind || "info"); } catch (e) {}
  }
  function paint() {
    try {
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      else if (typeof refreshMapColors === "function") refreshMapColors();
    } catch (e) {}
  }
  function hud() {
    try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
  }
  function cname(g, iso) {
    var c = g.countries[iso];
    return (c && c.name) || iso;
  }
  function countProvs(po, iso) {
    if (!po) return 0;
    var n = 0;
    for (var k in po) if (po[k] === iso) n++;
    return n;
  }
  function totalDivs(c) {
    if (!c || !c.divisions) return 0;
    return (c.divisions.inf || 0) + (c.divisions.art || 0) + (c.divisions.arm || 0);
  }
  function powerOf(g, iso) {
    var c = g.countries[iso];
    if (!c) return 0;
    var po = owners();
    var prov = countProvs(po, iso);
    var fac = (c.civFactories || 0) + (c.milFactories || 0) * 1.4;
    var div = totalDivs(c);
    return prov * 2 + fac * 3 + div * 4 + (c.money || 0) / 200;
  }

  // ---------- Rank / campaign stage ----------
  var RANKS = [
    { id: "minor", title: "Bölgesel Güç", minProv: 0, color: "#94a3b8" },
    { id: "regional", title: "Bölgesel Aktör", minProv: 12, color: "#38bdf8" },
    { id: "major", title: "Büyük Güç", minProv: 35, color: "#a78bfa" },
    { id: "great", title: "Büyük Devlet", minProv: 70, color: "#fbbf24" },
    { id: "super", title: "Süper Güç", minProv: 140, color: "#f87171" }
  ];

  function ensureProg(g) {
    if (!g.progression) {
      g.progression = {
        rankId: "minor",
        lastRank: "minor",
        lastAiExpandDay: -99,
        lastDockRefresh: 0,
        conquests: 0,
        warsWon: 0,
        stage: 1,
        stageNotes: {}
      };
    }
    return g.progression;
  }

  function currentRank(g) {
    var po = owners();
    var n = countProvs(po, g.player);
    var rank = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) {
      if (n >= RANKS[i].minProv) rank = RANKS[i];
    }
    // industry can bump one tier
    var p = g.countries[g.player];
    var fac = p ? (p.civFactories || 0) + (p.milFactories || 0) : 0;
    if (fac >= 60 && rank.id === "regional") rank = RANKS[2];
    if (fac >= 100 && rank.id === "major") rank = RANKS[3];
    return rank;
  }

  function applyRankBonuses(g, rank) {
    var p = g.countries[g.player];
    if (!p) return;
    // soft passive by rank
    var mul = { minor: 1, regional: 1.04, major: 1.08, great: 1.12, super: 1.18 };
    g.playerProdMul = mul[rank.id] || 1;
  }

  function checkRankUp(g, prog) {
    var rank = currentRank(g);
    prog.rankId = rank.id;
    if (rank.id !== prog.lastRank) {
      var up = RANKS.findIndex(function (r) { return r.id === rank.id; }) >
               RANKS.findIndex(function (r) { return r.id === prog.lastRank; });
      prog.lastRank = rank.id;
      applyRankBonuses(g, rank);
      if (up) {
        slog("🏅 RÜTBE: " + rank.title + " — üretim ve prestij arttı.", "text-amber-300 font-bold");
        toast("Rütbe: " + rank.title, "good");
        var p = g.countries[g.player];
        if (p) {
          p.money = (p.money || 0) + 350;
          p.manpower = (p.manpower || 0) + 12000;
        }
        hud();
      }
    } else {
      applyRankBonuses(g, rank);
    }
    // update HUD chip
    var chip = document.getElementById("sc-rank-chip");
    if (chip) {
      chip.textContent = rank.title;
      chip.style.color = rank.color;
    }
  }

  // ---------- Province transfer helper ----------
  function transferProvinces(fromIso, toIso, maxN, onlyBorder) {
    var po = owners();
    var g = GS();
    if (!po || !g) return [];
    g.occupations = g.occupations || {};
    var gn = typeof getProvinceNeighbors === "function" ? getProvinceNeighbors : window.getProvinceNeighbors;
    var pool = [];
    for (var name in po) {
      if (po[name] !== fromIso) continue;
      if (g.occupations[name] && g.occupations[name] !== fromIso) continue;
      if (onlyBorder !== false && gn) {
        try {
          var neigh = gn(name) || [];
          var touches = neigh.some(function (nb) {
            return po[nb] === toIso || g.occupations[nb] === toIso;
          });
          if (!touches) continue;
        } catch (e) { continue; }
      }
      pool.push(name);
    }
    // NO fallback to interior random provinces
    if (!pool.length) return [];
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var taken = pool.slice(0, Math.max(0, maxN || 1));
    taken.forEach(function (pr) {
      // occupation only — do not change provinceOwners
      g.occupations[pr] = toIso;
    });
    return taken;
  }



  // ---------- Player war: drip occupation ----------
  function dripPlayerWars(g, prog) {
    var wars = g.activeWars || [];
    if (!wars.length) return;
    wars.forEach(function (w) {
      if (!w || !w.target) return;
      var atk = w.attacker || g.player;
      // only drip if player is involved
      if (atk !== g.player && w.target !== g.player) return;
      var winner = atk === g.player ? g.player : (w.target === g.player ? null : atk);
      // player attacking AI
      if (atk === g.player && (w.progress || 0) >= 18 && Math.random() < 0.10) {
        var n = 1 + ((w.progress || 0) > 55 ? 1 : 0);
        var taken = transferProvinces(w.target, g.player, n, true);
        if (taken.length) {
          prog.conquests += taken.length;
          g.occupations = g.occupations || {};
          taken.forEach(function (pr) { g.occupations[pr] = g.player; });
          slog("🏴 Cephe ilerledi: " + taken.length + " eyalet (" + cname(g, w.target) + ") kontrolüne geçti.", "text-emerald-400");
          toast("+" + taken.length + " eyalet", "good");
          paint();
          hud();
        }
      }
      // AI attacking player — lose provinces slowly
      if (w.target === g.player && (w.progress || 0) < 40 && Math.random() < 0.06) {
        var lost = transferProvinces(g.player, atk, 1, true);
        if (lost.length) {
          slog("💥 Geri çekilme: " + lost.length + " eyalet " + cname(g, atk) + " eline geçti!", "text-red-400");
          toast("Eyalet kaybedildi", "bad");
          paint();
          hud();
        }
      }
    });
  }

  // ---------- AI expands on the map ----------
  function aiExpand(g, prog, dayKey) {
    // Rare, war-only front occupation — no random world land grabs
    var minDays = (g && g._aiExpandMinDays) || 28;
    var chance = (g && g._aiExpandChance) || 0.08;
    if (dayKey - prog.lastAiExpandDay < minDays) return;
    if (Math.random() > chance) return;
    prog.lastAiExpandDay = dayKey;
    var po = owners();
    if (!po) return;
    var wars = g.activeWars || [];
    if (!wars.length && !(g.aiWars && g.aiWars.length)) return;
    // Pick a war pair
    var pair = null;
    if (wars.length) {
      var w = wars[Math.floor(Math.random() * wars.length)];
      pair = { atk: w.attacker || g.player, def: w.target };
    } else if (g.aiWars && g.aiWars.length) {
      var aw = g.aiWars[Math.floor(Math.random() * g.aiWars.length)];
      pair = { atk: aw.a || aw.attacker, def: aw.b || aw.target };
    }
    if (!pair || !pair.atk || !pair.def) return;
    var strong = pair.atk;
    var victim = pair.def;
    if (Math.random() < 0.35) { strong = pair.def; victim = pair.atk; }
    if (strong === g.player) return; // player front handled elsewhere
    var taken = transferProvinces(victim, strong, 1, true);
    if (!taken.length) return;
    g.globalTension = Math.min(100, (g.globalTension || 0) + 1);
    slog("⚔️ İşgal: " + cname(g, strong) + " → " + taken.length + " eyalet (" + cname(g, victim) + ")", "text-orange-300");
    paint();
  }

  // ---------- Quick actions (exported) ----------
  window.scQuickTrainInf = function () {
    var g = GS();
    if (!g || !g.running) return false;
    var p = g.countries[g.player];
    if (!p) return false;
    p.stockpile = p.stockpile || { guns: 0, artillery: 0, tanks: 0 };
    p.divisions = p.divisions || { inf: 0, art: 0, arm: 0 };
    var mp = 8000, guns = 400, cost = 80;
    if ((p.manpower || 0) < mp) { slog("Yetersiz insan gücü.", "text-red-400"); toast("İG yetersiz", "bad"); return false; }
    if ((p.stockpile.guns || 0) < guns) { slog("Yetersiz tüfek stoku — üretim hatlarını doldur.", "text-red-400"); toast("Tüfek yok", "bad"); return false; }
    if ((p.money || 0) < cost) { slog("Yetersiz hazine.", "text-red-400"); return false; }
    p.manpower -= mp;
    p.stockpile.guns -= guns;
    p.money -= cost;
    p.divisions.inf = (p.divisions.inf || 0) + 1;
    slog("🪖 +1 Piyade Tümeni (acele seferberlik).", "text-emerald-400");
    toast("+1 Piyade", "good");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickBuildCiv = function () {
    if (typeof buildFactory === "function") {
      try { buildFactory("civ"); refreshDock(); return true; } catch (e) {}
    }
    var g = GS();
    var p = g && g.countries[g.player];
    if (!p) return false;
    if ((p.money || 0) < 800) { slog("Sivil fabrika için 800 hazine gerekir.", "text-red-400"); return false; }
    p.money -= 800;
    p.civFactories = (p.civFactories || 0) + 1;
    slog("🏭 +1 Sivil fabrika.", "text-yellow-400");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickBuildMil = function () {
    if (typeof buildFactory === "function") {
      try { buildFactory("mil"); refreshDock(); return true; } catch (e) {}
    }
    var g = GS();
    var p = g && g.countries[g.player];
    if (!p) return false;
    if ((p.money || 0) < 1000) { slog("Askeri fabrika için 1000 hazine gerekir.", "text-red-400"); return false; }
    p.money -= 1000;
    p.milFactories = (p.milFactories || 0) + 1;
    slog("🏭 +1 Askeri fabrika.", "text-yellow-400");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickJustifySelected = function () {
    var g = GS();
    if (!g) return;
    var iso = g.selectedCountry;
    if (!iso || iso === g.player) {
      slog("Haritadan yabancı bir ülke eyaleti seç.", "text-yellow-400");
      toast("Düşman eyalet seç", "info");
      return;
    }
    if (typeof startJustification === "function") startJustification(iso);
    else {
      g.justifications = g.justifications || [];
      if (!g.justifications.some(function (j) { return j.target === iso; })) {
        g.justifications.push({ target: iso, progress: 0 });
        slog("Gerekçe hazırlanıyor: " + cname(g, iso), "text-orange-400");
      }
    }
    refreshDock();
  };

  window.scQuickDeclareSelected = function () {
    var g = GS();
    if (!g) return;
    var iso = g.selectedCountry;
    if (!iso || iso === g.player) {
      slog("Savaş için yabancı ülke seç.", "text-yellow-400");
      return;
    }
    if (typeof declareWar === "function") declareWar(iso);
    else if (window.declareWar) window.declareWar(iso);
    refreshDock();
  };

  // ---------- Command dock UI ----------
  function refreshDock() {
    /* CMD_DOCK_DISABLED — alt komut bandı kaldırıldı */
    try {
      var d0 = document.getElementById("sc-cmd-dock");
      if (d0) { d0.style.display = "none"; d0.innerHTML = ""; }
    } catch (e) {}
  }

  function progressionPulse() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var prog = ensureProg(g);
    var dk = dayKeyOf(g);
    checkRankUp(g, prog);
    dripPlayerWars(g, prog);
    aiExpand(g, prog, dk);
    // hourOne day index if present
    var dayApprox = 0;
    if (g.hourOne && g.hourOne.startMs && g.date) {
      dayApprox = Math.floor((g.date.getTime() - g.hourOne.startMs) / 86400000);
    } else {
      dayApprox = dk % 10000;
    }
    campaignStage(g, prog, dayApprox);
    if (dk !== prog.lastDockRefresh) {
      prog.lastDockRefresh = dk;
      refreshDock();
    }
  }

  // wrap gameTick
  function wrapTick() {
    var prev = window.gameTick;
    if (typeof prev !== "function") return false;
    if (prev._progWrapped) return true;
    window.gameTick = function () {
      try { prev.apply(this, arguments); } catch (e) { console.warn(e); }
      try { progressionPulse(); } catch (e) { console.warn("[progression]", e); }
    };
    window.gameTick._progWrapped = true;
    return true;
  }
  if (!wrapTick()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (wrapTick() || tries > 50) clearInterval(iv);
    }, 200);
  }

  // export helpers used by dock
  try {
    if (typeof trainDivision === "function") window.trainDivision = trainDivision;
    if (typeof buildFactory === "function") window.buildFactory = buildFactory;
    if (typeof startJustification === "function") window.startJustification = startJustification;
  } catch (e) {}

  // refresh dock often while running
  /* interval removed (hourPulse/refreshDock blink) */

  // when province selected, refresh dock
  var _hpc = window.handleProvinceClick;
  // can't easily wrap declaration; poll selectedCountry
  var lastSel = null;
  /* interval removed (hourPulse/refreshDock blink) */

  console.log("[progression] rank · dock · AI expand · war drip online");
})();
