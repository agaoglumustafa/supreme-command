
/**
 * Supreme Command v1.9.1 — GERÇEK SC sistemleri
 * Odak ağacı · Yasalar · Üretim hatları · İstikrar/SD · PP
 * Mevcut GameState.v27 / v30 ile uyumlu; yoksa kendi state'ini kurar.
 */
(function SCHoi4Systems() {
  "use strict";
  console.log("%c[v1.9.3] Komuta: odak · yasa · üretim", "color:#e8c547;font-weight:bold");

  function GS() { return window.GameState || null; }
  function playerISO() {
    var g = GS();
    return g ? g.player : null;
  }
  function country() {
    var g = GS();
    if (!g || !g.player || !g.countries) return null;
    return g.countries[g.player] || null;
  }

  // ---------- State bootstrap ----------
  function ensureState() {
    var g = GS();
    if (!g) return null;
    if (!g.hoi) g.hoi = {};
    var h = g.hoi;
    if (h.pp == null) {
      h.pp = (g.v30 && g.v30.politicalPower != null) ? g.v30.politicalPower : 50;
    }
    if (h.stability == null) h.stability = 55;
    if (h.warSupport == null) h.warSupport = 40;
    if (!h.laws) {
      h.laws = {
        economy: "civilian",      // civilian | early | partial | war | total
        conscription: "volunteer", // volunteer | limited | extensive | scraping
        trade: "export"            // free | export | limited | closed
      };
    }
    if (!h.focus) {
      h.focus = { current: null, progress: 0, done: {} };
    }
    if (!h.production) {
      h.production = {
        mil: 5,
        civ: 8,
        lines: [
          { id: "inf", name: "Piyade ekipmanı", weight: 3, stock: 200, need: 0 },
          { id: "art", name: "Topçu", weight: 1, stock: 40, need: 0 },
          { id: "tank", name: "Tank", weight: 0, stock: 10, need: 0 },
          { id: "plane", name: "Uçak", weight: 0, stock: 5, need: 0 }
        ]
      };
    }
    if (!h.armyXP) h.armyXP = 0;
    // mirror to country for UI
    var c = country();
    if (c) {
      c.pp = h.pp;
      c.stability = h.stability;
      c.warSupport = h.warSupport;
      c.politicalPower = h.pp;
    }
    if (g.v30) g.v30.politicalPower = h.pp;
    return h;
  }

  // ---------- Laws data ----------
  var LAWS = {
    economy: {
      civilian: { label: "Sivil Ekonomi", cost: 0, mil: 0.6, civ: 1.15, pp: 0 },
      early: { label: "Erken Seferberlik", cost: 50, mil: 0.85, civ: 1.0, pp: -0.05 },
      partial: { label: "Kısmi Seferberlik", cost: 75, mil: 1.0, civ: 0.9, pp: -0.1 },
      war: { label: "Savaş Ekonomisi", cost: 100, mil: 1.25, civ: 0.75, pp: -0.15 },
      total: { label: "Totaler Krieg", cost: 150, mil: 1.5, civ: 0.55, pp: -0.25 }
    },
    conscription: {
      volunteer: { label: "Gönüllü", cost: 0, manpower: 0.015, training: 1.0 },
      limited: { label: "Sınırlı Zorunlu", cost: 40, manpower: 0.025, training: 0.95 },
      extensive: { label: "Geniş Zorunlu", cost: 80, manpower: 0.04, training: 0.85 },
      scraping: { label: "Dipte Tarak", cost: 120, manpower: 0.06, training: 0.7 }
    },
    trade: {
      free: { label: "Serbest Ticaret", cost: 0, resources: 1.15, factory: 0.95 },
      export: { label: "İhracat Odaklı", cost: 30, resources: 1.05, factory: 1.0 },
      limited: { label: "Sınırlı İhracat", cost: 50, resources: 0.9, factory: 1.05 },
      closed: { label: "Kapalı Ekonomi", cost: 80, resources: 0.7, factory: 1.1 }
    }
  };

  // ---------- National Focus (generic tree) ----------
  var FOCUS_TREE = [
    { id: "army_effort", name: "Ordu Çabası", days: 35, req: null, effect: function (h) { h.armyXP += 25; h.production.mil += 1; toast("Ordu XP +25, +1 askeri fabrika"); } },
    { id: "equipment_effort", name: "Ekipman Çabası", days: 35, req: "army_effort", effect: function (h) { var l = h.production.lines.find(function (x) { return x.id === "inf"; }); if (l) l.weight = Math.min(8, l.weight + 2); toast("Piyade üretim ağırlığı arttı"); } },
    { id: "artillery_effort", name: "Topçu Çabası", days: 35, req: "equipment_effort", effect: function (h) { var l = h.production.lines.find(function (x) { return x.id === "art"; }); if (l) l.weight = Math.min(6, l.weight + 2); toast("Topçu üretimi arttı"); } },
    { id: "motorization", name: "Motorize", days: 42, req: "army_effort", effect: function (h) { var l = h.production.lines.find(function (x) { return x.id === "tank"; }); if (l) l.weight = Math.min(5, l.weight + 1); h.production.mil += 1; toast("+1 tank hattı ağırlığı, +1 askeri fab"); } },
    { id: "industrial_effort", name: "Sanayi Çabası", days: 35, req: null, effect: function (h) { h.production.civ += 2; toast("+2 sivil fabrika"); } },
    { id: "construction_effort", name: "İnşaat Çabası", days: 35, req: "industrial_effort", effect: function (h) { h.production.civ += 1; h.production.mil += 1; toast("+1 sivil, +1 askeri fabrika"); } },
    { id: "armament_effort", name: "Silahlanma", days: 42, req: "construction_effort", effect: function (h) { h.production.mil += 2; toast("+2 askeri fabrika"); } },
    { id: "political_effort", name: "Siyasi Çaba", days: 35, req: null, effect: function (h) { h.pp += 50; h.stability = Math.min(100, h.stability + 5); toast("+50 PP, +5 istikrar"); } },
    { id: "collectivist", name: "Kolektif Ruh", days: 42, req: "political_effort", effect: function (h) { h.warSupport = Math.min(100, h.warSupport + 10); h.stability = Math.min(100, h.stability + 5); toast("+10 savaş desteği"); } },
    { id: "militarism", name: "Militarizm", days: 42, req: "political_effort", effect: function (h) { h.warSupport = Math.min(100, h.warSupport + 15); h.armyXP += 15; toast("+15 SD, +15 ordu XP"); } },
    { id: "air_effort", name: "Hava Çabası", days: 40, req: "industrial_effort", effect: function (h) { var l = h.production.lines.find(function (x) { return x.id === "plane"; }); if (l) l.weight = Math.min(5, l.weight + 2); toast("Uçak üretimi arttı"); } },
    { id: "doctrine_land", name: "Kara Doktrini", days: 50, req: "army_effort", effect: function (h) { h.armyXP += 50; toast("+50 ordu XP (doktrin)"); } }
  ];

  function toast(msg) {
    try {
      if (typeof window.showToast === "function") window.showToast(msg, "info");
      else if (typeof window.scToast === "function") window.scToast(msg);
      else console.log("[hoi]", msg);
    } catch (e) {}
  }

  function spendPP(n) {
    var h = ensureState();
    if (!h || h.pp < n) return false;
    h.pp -= n;
    sync();
    return true;
  }

  function sync() {
    var h = ensureState();
    if (!h) return;
    var c = country();
    if (c) {
      c.pp = h.pp;
      c.stability = h.stability;
      c.warSupport = h.warSupport;
      c.politicalPower = h.pp;
    }
    var g = GS();
    if (g && g.v30) g.v30.politicalPower = h.pp;
    try {
      if (typeof window.refreshHoiPanels === "function") window.refreshHoiPanels();
    } catch (e) {}
  }

  // ---------- Daily tick ----------
  function dailyTick() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var h = ensureState();
    if (!h) return;

    // PP income
    var lawEco = LAWS.economy[h.laws.economy] || LAWS.economy.civilian;
    var ppGain = 1.2 + (lawEco.pp || 0);
    // stability/war support soft income
    var atWar = isAtWar();
    if (atWar) {
      h.warSupport = Math.max(5, h.warSupport - 0.08);
      h.stability = Math.max(10, h.stability - 0.04);
      ppGain *= 0.85;
    } else {
      h.stability = Math.min(100, h.stability + 0.05);
      h.warSupport = Math.min(100, h.warSupport + 0.02);
    }
    h.pp = Math.min(500, h.pp + ppGain);

    // Production
    var milEff = (lawEco.mil || 1) * (h.production.mil || 1);
    var totalW = 0;
    h.production.lines.forEach(function (l) { totalW += Math.max(0, l.weight || 0); });
    if (totalW < 0.01) totalW = 1;
    h.production.lines.forEach(function (l) {
      var share = (l.weight || 0) / totalW;
      var out = milEff * share * 2.2; // daily equipment
      l.stock = Math.round((l.stock || 0) + out);
    });

    // Focus progress
    if (h.focus.current) {
      h.focus.progress = (h.focus.progress || 0) + 1;
      var node = FOCUS_TREE.find(function (f) { return f.id === h.focus.current; });
      if (node && h.focus.progress >= node.days) {
        try { node.effect(h); } catch (e) { console.warn(e); }
        h.focus.done[node.id] = true;
        h.focus.current = null;
        h.focus.progress = 0;
        toast("Odak tamamlandı: " + node.name);
      }
    }

    // Manpower soft regen from conscription
    var con = LAWS.conscription[h.laws.conscription] || LAWS.conscription.volunteer;
    var c = country();
    if (c) {
      if (c.manpower == null) c.manpower = 50000;
      c.manpower = Math.min(5e6, (c.manpower || 0) + Math.floor((c.manpower || 50000) * (con.manpower || 0.01) * 0.002));
    }

    sync();
  }

  function isAtWar() {
    var g = GS();
    if (!g || !g.wars) return false;
    var p = g.player;
    try {
      return Object.keys(g.wars).some(function (id) {
        var w = g.wars[id];
        if (!w || w.ended) return false;
        return (w.attackers && w.attackers.indexOf(p) >= 0) || (w.defenders && w.defenders.indexOf(p) >= 0);
      });
    } catch (e) { return false; }
  }

  // ---------- UI Panels ----------
  function injectPanels() {
    // Use politics tab if exists, else production area, else create politics content
    var host = document.getElementById("content-dashboard");
    if (!host) return;
    if (document.getElementById("hoi-sys-root")) return;

    var root = document.createElement("div");
    root.id = "hoi-sys-root";
    root.className = "space-y-3";
    root.innerHTML =
      '<div class="text-[10px] uppercase tracking-widest text-amber-500/90 font-bold">Komuta — Komuta sistemleri</div>' +
      '<div id="hoi-sys-stats" class="grid grid-cols-4 gap-2 text-center"></div>' +
      '<div class="grid grid-cols-1 gap-3">' +
      '  <div id="hoi-sys-laws" class="border border-slate-700/80 rounded p-2 bg-slate-950/40"></div>' +
      '  <div id="hoi-sys-focus" class="border border-slate-700/80 rounded p-2 bg-slate-950/40"></div>' +
      '  <div id="hoi-sys-prod" class="border border-slate-700/80 rounded p-2 bg-slate-950/40"></div>' +
      '</div>';
    host.insertBefore(root, host.firstChild);
  }

  window.refreshHoiPanels = function () {
    var h = ensureState();
    if (!h) return;
    injectPanels();

    var stats = document.getElementById("hoi-sys-stats");
    if (stats) {
      stats.innerHTML =
        chip("PP", Math.floor(h.pp)) +
        chip("İstikrar", Math.round(h.stability) + "%") +
        chip("Savaş D.", Math.round(h.warSupport) + "%") +
        chip("Ordu XP", Math.floor(h.armyXP || 0));
    }

    // Laws
    var lawsEl = document.getElementById("hoi-sys-laws");
    if (lawsEl) {
      var html = '<div class="text-[11px] font-bold text-slate-200 mb-2">Yasalar</div>';
      html += lawBlock("economy", "Ekonomi", h);
      html += lawBlock("conscription", "Askere Alma", h);
      html += lawBlock("trade", "Ticaret", h);
      lawsEl.innerHTML = html;
      lawsEl.querySelectorAll("[data-law]").forEach(function (btn) {
        btn.onclick = function () {
          var type = btn.getAttribute("data-law");
          var key = btn.getAttribute("data-key");
          setLaw(type, key);
        };
      });
    }

    // Focus
    var foc = document.getElementById("hoi-sys-focus");
    if (foc) {
      var cur = h.focus.current ? FOCUS_TREE.find(function (f) { return f.id === h.focus.current; }) : null;
      var html = '<div class="text-[11px] font-bold text-slate-200 mb-2">Ulusal Odak</div>';
      if (cur) {
        var pct = Math.min(100, Math.round((h.focus.progress / cur.days) * 100));
        html += '<div class="text-[11px] text-amber-300 mb-1">Devam: ' + cur.name + ' (' + pct + '%)</div>';
        html += '<div class="h-2 bg-slate-800 rounded overflow-hidden mb-2"><div style="width:' + pct + '%;height:100%;background:#c9a227"></div></div>';
      } else {
        html += '<div class="text-[10px] text-slate-500 mb-2">Aktif odak yok — birini seç</div>';
      }
      html += '<div class="grid grid-cols-2 gap-0.5 max-h-40 overflow-y-auto">';
      FOCUS_TREE.forEach(function (f) {
        var done = !!h.focus.done[f.id];
        var locked = f.req && !h.focus.done[f.req];
        var active = h.focus.current === f.id;
        var cls = done ? "opacity-40" : locked ? "opacity-30" : active ? "border-amber-500 text-amber-300" : "hover:border-slate-500";
        html += '<button type="button" data-focus="' + f.id + '" class="text-left text-[10px] px-2 py-1.5 border border-slate-700 rounded bg-slate-900/80 ' + cls + '" ' +
          (done || locked || active || h.focus.current ? "disabled" : "") + ">" +
          f.name + ' <span class="text-slate-500">' + f.days + 'g</span></button>';
      });
      html += "</div>";
      foc.innerHTML = html;
      foc.querySelectorAll("[data-focus]").forEach(function (btn) {
        btn.onclick = function () {
          startFocus(btn.getAttribute("data-focus"));
        };
      });
    }

    // Production
    var prod = document.getElementById("hoi-sys-prod");
    if (prod) {
      var html = '<div class="flex justify-between items-center mb-2">' +
        '<div class="text-[11px] font-bold text-slate-200">Üretim</div>' +
        '<div class="text-[10px] font-mono text-slate-400">Fab: ' + h.production.mil + ' askerî · ' + h.production.civ + ' sivil</div></div>';
      h.production.lines.forEach(function (l) {
        html += '<div class="flex items-center gap-2 mb-1.5 text-[10px]">' +
          '<div class="w-24 text-slate-300 truncate">' + l.name + '</div>' +
          '<input type="range" min="0" max="8" value="' + (l.weight || 0) + '" data-line="' + l.id + '" class="flex-1 accent-amber-600"/>' +
          '<div class="w-8 text-center font-mono text-amber-400">' + (l.weight || 0) + '</div>' +
          '<div class="w-14 text-right font-mono text-slate-400">' + Math.floor(l.stock || 0) + '</div></div>';
      });
      prod.innerHTML = html;
      prod.querySelectorAll("input[data-line]").forEach(function (inp) {
        inp.oninput = function () {
          var id = inp.getAttribute("data-line");
          var line = h.production.lines.find(function (x) { return x.id === id; });
          if (line) {
            line.weight = parseInt(inp.value, 10) || 0;
            window.refreshHoiPanels();
          }
        };
      });
    }

    // top bar mirror
    try {
      var el;
      el = document.getElementById("hoi-top-pp"); if (el) el.textContent = String(Math.floor(h.pp));
      el = document.getElementById("hoi-top-stab"); if (el) el.textContent = Math.round(h.stability) + "%";
      el = document.getElementById("hoi-top-ws"); if (el) el.textContent = Math.round(h.warSupport) + "%";
      el = document.getElementById("hoi-stab"); if (el) el.textContent = Math.round(h.stability) + "%";
      el = document.getElementById("hoi-ws"); if (el) el.textContent = Math.round(h.warSupport) + "%";
      el = document.getElementById("hoi-pp"); if (el) el.textContent = String(Math.floor(h.pp));
    } catch (e) {}
  };

  function chip(k, v) {
    return '<div class="rounded border border-slate-700 bg-slate-900/80 p-2"><div class="text-[9px] uppercase tracking-wider text-slate-500">' + k + '</div><div class="text-sm font-mono text-amber-300 font-bold">' + v + '</div></div>';
  }

  function lawBlock(type, title, h) {
    var cur = h.laws[type];
    var opts = LAWS[type];
    var html = '<div class="mb-2"><div class="text-[10px] text-slate-400 mb-1">' + title + ' · <span class="text-amber-400">' + (opts[cur] && opts[cur].label) + '</span></div><div class="flex flex-wrap gap-1">';
    Object.keys(opts).forEach(function (k) {
      var o = opts[k];
      var active = k === cur;
      html += '<button type="button" data-law="' + type + '" data-key="' + k + '" class="text-[9px] px-2 py-1 border rounded ' +
        (active ? "border-amber-500 text-amber-300 bg-amber-950/30" : "border-slate-700 text-slate-400 hover:border-slate-500") + '">' +
        o.label + (o.cost ? " (" + o.cost + "PP)" : "") + "</button>";
    });
    html += "</div></div>";
    return html;
  }

  function setLaw(type, key) {
    var h = ensureState();
    if (!h || !LAWS[type] || !LAWS[type][key]) return;
    if (h.laws[type] === key) return;
    var cost = LAWS[type][key].cost || 0;
    if (cost > 0 && !spendPP(cost)) {
      toast("Yetersiz siyasi güç (" + Math.floor(h.pp) + "/" + cost + ")");
      return;
    }
    h.laws[type] = key;
    // sync v27 conscription if exists
    var g = GS();
    if (g && g.v27 && type === "conscription") g.v27.conscription = key;
    toast("Yasa: " + LAWS[type][key].label);
    window.refreshHoiPanels();
  }

  function startFocus(id) {
    var h = ensureState();
    if (!h || h.focus.current) return;
    var node = FOCUS_TREE.find(function (f) { return f.id === id; });
    if (!node) return;
    if (h.focus.done[id]) return;
    if (node.req && !h.focus.done[node.req]) {
      toast("Önce gerekli odağı tamamla");
      return;
    }
    h.focus.current = id;
    h.focus.progress = 0;
    toast("Odak başladı: " + node.name);
    window.refreshHoiPanels();
  }

  // Combat bonus from stability / doctrines (soft)
  window.scHoiCombatFactor = function (iso) {
    var g = GS();
    if (!g || !g.hoi || iso !== g.player) return 1;
    var h = g.hoi;
    var f = 1;
    f += ((h.stability || 50) - 50) * 0.002;
    f += ((h.warSupport || 40) - 40) * 0.0015;
    f += Math.min(0.15, (h.armyXP || 0) * 0.0004);
    var eco = LAWS.economy[h.laws.economy];
    if (eco) f *= 0.95 + (eco.mil || 1) * 0.05;
    return Math.max(0.7, Math.min(1.35, f));
  };

  // Hook gameTick for daily
  var lastKey = null;
  function onTick() {
    var g = GS();
    if (!g || !g.date) return;
    var key = g.date.getFullYear() + "-" + g.date.getMonth() + "-" + g.date.getDate();
    if (key === lastKey) return;
    lastKey = key;
    dailyTick();
    window.refreshHoiPanels();
  }

  var _gt = window.gameTick;
  if (typeof _gt === "function") {
    window.gameTick = function () {
      var r = _gt.apply(this, arguments);
      try { onTick(); } catch (e) {}
      return r;
    };
  } else {
    setInterval(function () { try { onTick(); } catch (e) {} }, 2000);
  }

  // Boot panels when game runs
  setInterval(function () {
    try {
      var g = GS();
      if (g && g.running) {
        ensureState();
        injectPanels();
        window.refreshHoiPanels();
      }
    } catch (e) {}
  }, 2500);

  // Start game wrap
  var _sg = window.startGame;
  if (typeof _sg === "function" && !_sg._hoiSys) {
    window.startGame = async function () {
      var r = await _sg.apply(this, arguments);
      setTimeout(function () {
        ensureState();
        injectPanels();
        window.refreshHoiPanels();
        toast("komuta sistemleri hazır — Özet sekmesinde odak / yasa / üretim");
      }, 800);
      return r;
    };
    window.startGame._hoiSys = true;
  }

  // Export API
  window.scHoi = {
    ensureState: ensureState,
    startFocus: startFocus,
    setLaw: setLaw,
    spendPP: spendPP,
    FOCUS_TREE: FOCUS_TREE,
    LAWS: LAWS
  };
})();
