
(function SCRealism50() {
  "use strict";
  console.log("%c[v1.7.16] realism-50 + default 1095 + center-label names", "color:#0f0;font-size:14px;font-weight:bold");

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function PD() {
    try { return window.PROVINCE_DATA || (typeof PROVINCE_DATA !== "undefined" ? PROVINCE_DATA : {}); } catch (e) { return {}; }
  }
  function toast(msg, cls) {
    try { if (typeof window.log === "function") window.log(msg, cls || "text-slate-300"); } catch (e) {}
  }

  // Shared state
  var R = window.__SC_REALISM = window.__SC_REALISM || {
    warWeariness: {},
    stability: {},
    legitimacy: {},
    unrest: {},
    lastSeason: null,
    convoyRaids: 0,
    lastPulseDay: null
  };

  function monthOf(g) {
    try { return (g.date && g.date.getMonth) ? g.date.getMonth() : 0; } catch (e) { return 0; }
  }
  function seasonOf(m) {
    if (m >= 2 && m <= 4) return "ilkbahar";
    if (m >= 5 && m <= 7) return "yaz";
    if (m >= 8 && m <= 10) return "sonbahar";
    return "kış";
  }

  function ensureCountry(iso) {
    var g = GS(); if (!g || !g.countries || !g.countries[iso]) return null;
    var c = g.countries[iso];
    if (c._realismInit) return c;
    c._realismInit = true;
    // 1-10 baseline fields
    c.warWeariness = c.warWeariness || 0;
    c.stability = c.stability != null ? c.stability : 50;
    c.legitimacy = c.legitimacy != null ? c.legitimacy : 70;
    c.unrest = c.unrest || 0;
    c.conscriptionLaw = c.conscriptionLaw || "gönüllü";
    c.economyLaw = c.economyLaw || "sivil";
    c.tradeLaw = c.tradeLaw || "serbest";
    c.intel = c.intel || 0;
    c.fuel = c.fuel != null ? c.fuel : 1000;
    c.rubber = c.rubber != null ? c.rubber : 50;
    c.tungsten = c.tungsten != null ? c.tungsten : 30;
    c.chromium = c.chromium != null ? c.chromium : 30;
    c.aluminum = c.aluminum != null ? c.aluminum : 40;
    c.convoys = c.convoys != null ? c.convoys : 50;
    c.nuclear = c.nuclear || 0;
    c.faction = c.faction || null;
    return c;
  }

  function provinceOwner(name) {
    try {
      if (typeof getProvinceOwner === "function") return getProvinceOwner(name);
      var g = GS();
      return (g && g.provinceOwners && g.provinceOwners[name]) || "NEUTRAL";
    } catch (e) { return "NEUTRAL"; }
  }

  function forEachOwned(iso, fn) {
    var g = GS(); if (!g || !g.provinceOwners) return;
    Object.keys(g.provinceOwners).forEach(function (pn) {
      if (g.provinceOwners[pn] === iso) fn(pn);
    });
  }

  // --- Daily / weekly pulse ---
  function realismPulse() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var dayKey = g.date ? (g.date.getFullYear() + "-" + g.date.getMonth() + "-" + g.date.getDate()) : null;
    if (dayKey && dayKey === R.lastPulseDay) return;
    R.lastPulseDay = dayKey;

    var month = monthOf(g);
    var season = seasonOf(month);
    if (R.lastSeason !== season) {
      R.lastSeason = season;
      toast("Mevsim: " + season, "text-cyan-400");
    }

    var pd = PD();
    Object.keys(g.countries || {}).forEach(function (iso) {
      var c = ensureCountry(iso);
      if (!c) return;

      // 1) Seasonal attrition / recovery
      var seasonMod = season === "kış" ? 0.85 : season === "yaz" ? 1.05 : 1.0;
      // 2) Manpower recovery
      if (c.manpower != null) {
        var baseRec = (c.conscriptionLaw === "zorunlu") ? 40 : (c.conscriptionLaw === "kapsamlı" ? 25 : 12);
        c.manpower += Math.floor(baseRec * seasonMod);
      }
      // 3) War weariness while at war
      var atWar = false;
      try {
        if (g.wars) {
          Object.keys(g.wars).forEach(function (wid) {
            var w = g.wars[wid];
            if (!w || w.ended) return;
            if ((w.attackers && w.attackers.indexOf(iso) >= 0) || (w.defenders && w.defenders.indexOf(iso) >= 0)) atWar = true;
          });
        }
      } catch (e) {}
      if (atWar) {
        c.warWeariness = Math.min(100, (c.warWeariness || 0) + 0.15);
        c.stability = Math.max(0, (c.stability || 50) - 0.05);
      } else {
        c.warWeariness = Math.max(0, (c.warWeariness || 0) - 0.2);
        c.stability = Math.min(100, (c.stability || 50) + 0.03);
      }
      // 4) High weariness → unrest
      if (c.warWeariness > 60) c.unrest = Math.min(100, (c.unrest || 0) + 0.1);
      else c.unrest = Math.max(0, (c.unrest || 0) - 0.05);

      // 5) Fuel drain if many tanks/air
      var tanks = (c.stockpile && c.stockpile.tanks) || 0;
      var planes = (c.stockpile && (c.stockpile.fighters || 0) + (c.stockpile.bombers || 0)) || 0;
      c.fuel = Math.max(0, (c.fuel || 0) - Math.floor(tanks * 0.02 + planes * 0.03));

      // 6) Economy law income tweak
      if (c.money != null) {
        var eco = c.economyLaw === "savaş" ? 1.15 : c.economyLaw === "seferber" ? 1.08 : 1.0;
        // soft passive income
        c.money += Math.floor(3 * eco * seasonMod);
      }

      // 7) Trade law / convoy dependency for majors near coast — soft bonus
      if (c.tradeLaw === "serbest" && c.convoys > 20) {
        if (c.money != null) c.money += 2;
      }

      // 8) Stability low → factory output penalty flag
      c._outputMod = (c.stability < 30) ? 0.75 : (c.stability < 50 ? 0.9 : 1.0);
      if (c.unrest > 70) c._outputMod *= 0.85;

      // 9) Winter northern supply hit
      if (season === "kış") {
        var northPen = 0;
        forEachOwned(iso, function (pn) {
          var meta = pd[pn];
          if (meta && meta.cy < 1600) northPen++;
        });
        if (northPen > 5 && c.fuel != null) c.fuel = Math.max(0, c.fuel - 5);
      }
    });

    // 10) Random small incident (rare)
    if (Math.random() < 0.02) {
      var isos = Object.keys(g.countries || {});
      if (isos.length) {
        var pick = isos[Math.floor(Math.random() * isos.length)];
        var cc = g.countries[pick];
        if (cc) {
          var roll = Math.random();
          if (roll < 0.25) { cc.unrest = (cc.unrest || 0) + 3; toast(pick + ": grev dalgası", "text-amber-400"); }
          else if (roll < 0.5) { cc.stability = Math.min(100, (cc.stability || 50) + 2); }
          else if (roll < 0.75 && cc.money != null) { cc.money += 15; toast(pick + ": ticaret patlaması", "text-emerald-400"); }
          else if (cc.fuel != null) { cc.fuel = Math.max(0, cc.fuel - 20); toast(pick + ": yakıt darboğazı", "text-orange-400"); }
        }
      }
    }
  }

  // Wrap gameTick once
  function wrapTick() {
    var prev = window.gameTick;
    if (typeof prev !== "function") return false;
    if (prev._realism50) return true;
    window.gameTick = function () {
      try { prev.apply(this, arguments); } catch (e) { console.warn(e); }
      try { realismPulse(); } catch (e) {}
    };
    window.gameTick._realism50 = true;
    return true;
  }
  if (!wrapTick()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (wrapTick() || tries > 40) clearInterval(iv);
    }, 250);
  }

  // Combat width / terrain modifiers hook
  if (typeof window.getTerrainCombatMod !== "function") {
    window.getTerrainCombatMod = function (provinceName) {
      var meta = PD()[provinceName];
      if (!meta) return 1;
      if (meta.terrain === "mountains") return 0.7;
      if (meta.terrain === "forest") return 0.85;
      if (meta.terrain === "desert") return 0.9;
      if (meta.terrain === "tundra") return 0.8;
      if (meta.terrain === "hills") return 0.9;
      return 1;
    };
  }

  // Supply distance soft helper
  window.scSupplyFactor = function (iso, provinceName) {
    var g = GS(); if (!g) return 1;
    var c = g.countries[iso]; if (!c) return 1;
    var pd = PD();
    var meta = pd[provinceName]; if (!meta) return 1;
    var cap = null;
    try {
      if (c.capital && pd[c.capital]) cap = pd[c.capital];
    } catch (e) {}
    if (!cap) return 1;
    var dx = (meta.cx || 0) - (cap.cx || 0);
    var dy = (meta.cy || 0) - (cap.cy || 0);
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 800) return 0.7;
    if (dist > 400) return 0.85;
    return 1;
  };

  // Expose law changers for UI (optional)
  window.scSetConscription = function (iso, law) {
    var c = ensureCountry(iso || (GS() && GS().player));
    if (!c) return;
    c.conscriptionLaw = law;
    toast("Askere alma: " + law, "text-amber-300");
  };
  window.scSetEconomyLaw = function (iso, law) {
    var c = ensureCountry(iso || (GS() && GS().player));
    if (!c) return;
    c.economyLaw = law;
    toast("Ekonomi: " + law, "text-amber-300");
  };

  // One-time init when game starts
  var _boot = setInterval(function () {
    var g = GS();
    if (!g || !g.countries) return;
    Object.keys(g.countries).forEach(ensureCountry);
    clearInterval(_boot);
  }, 1000);
})();
