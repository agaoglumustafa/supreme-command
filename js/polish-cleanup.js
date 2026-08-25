// ===== SC Polish Cleanup v1.4.0 =====
// Country names on map · strip clutter · scenario factions · sell land picker · hash routes
(function SCPolishCleanup() {
  "use strict";

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function owners() {
    try {
      return window.provinceOwners || (typeof provinceOwners !== "undefined" ? provinceOwners : {});
    } catch (e) { return {}; }
  }
  function slog(msg, cls) {
    try {
      if (typeof window.log === "function") window.log(msg, cls || "text-slate-300");
    } catch (e) {}
  }
  function toast(msg, kind) {
    try {
      if (typeof window.showToast === "function") window.showToast(msg, kind || "info");
    } catch (e) {}
  }

  // =====================================================================
  // 1) HOI-style country names on map
  // =====================================================================
  function mapZoomGroup() {
    var svg = document.querySelector("#game-map");
    if (!svg) return null;
    if (window.__SC_MAP_G && window.__SC_MAP_G.isConnected) return window.__SC_MAP_G;
    var g = svg.querySelector(":scope > g");
    if (g) window.__SC_MAP_G = g;
    return g || svg;
  }

  function ensureNameLayer() {
    var parent = mapZoomGroup();
    if (!parent) return null;
    var layer = document.getElementById("sc-country-names");
    if (layer && layer.parentNode !== parent) {
      try { parent.appendChild(layer); } catch (e) {}
    }
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.setAttribute("id", "sc-country-names");
      layer.setAttribute("pointer-events", "none");
      parent.appendChild(layer);
    }
    return layer;
  }

  var lastNameKey = "";

  function countryDisplayName(g, iso) {
    if (typeof window.scCountryLabel === "function") {
      var lab = window.scCountryLabel(iso, "auto");
      try { return String(lab).toLocaleUpperCase("tr-TR"); } catch (e) { return String(lab).toUpperCase(); }
    }
    var c = g.countries && g.countries[iso];
    if (!c) return iso;
    var n = (c.shortName || c.name || iso);
    var k = window.__SC_ZOOM_K || 1;
    if (k < 1.2 && c.shortName) n = c.shortName;
    try {
      return String(n).toLocaleUpperCase("tr-TR");
    } catch (e) {
      return String(n).toUpperCase();
    }
  }

  function namesEnabled() {
    try {
      var g = GS();
      if (g && g.settings && g.settings.showCountryNames === false) return false;
      var ls = localStorage.getItem("sc_showCountryNames");
      if (ls === "0") return false;
    } catch (e) {}
    return true;
  }

  function currentZoomK() {
    try {
      if (window.__SC_ZOOM_K && isFinite(window.__SC_ZOOM_K)) return window.__SC_ZOOM_K;
      var gEl = mapZoomGroup();
      if (gEl) {
        var tr = gEl.getAttribute("transform") || "";
        var m = /scale\(([^)]+)\)/.exec(tr) || /matrix\(([^,]+)/.exec(tr);
        if (m) return parseFloat(m[1]) || 1;
      }
    } catch (e) {}
    return 1;
  }

  /** Nearer zoom → smaller countries get labels */
  function passesLod(a, k) {
    if (k >= 3.5) return a.n >= 1 || a.area >= 8;
    if (k >= 2.2) return a.n >= 2 || a.area >= 25;
    if (k >= 1.4) return a.n >= 4 || a.area >= 60;
    if (k >= 0.9) return a.n >= 8 || a.area >= 120;
    if (k >= 0.55) return a.n >= 16 || a.area >= 220;
    return a.n >= 28 || a.area >= 400; // far: only big nations
  }

  function refreshCountryNames(force) {
    var g = GS();
    var po = owners();
    var layer = ensureNameLayer();
    if (!layer) return;

    if (!namesEnabled()) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      lastNameKey = "off";
      return;
    }
    if (!g || !g.running || !po) return;

    var k = currentZoomK();
    var kBucket = Math.round(k * 4) / 4; // quantize for cache

    var agg = Object.create(null);
    var paths = document.querySelectorAll("#game-map path.country-path");
    for (var i = 0; i < paths.length; i++) {
      var el = paths[i];
      var name = el.getAttribute("data-name");
      if (!name) continue;
      var iso = po[name];
      if (!iso || iso === "NEUTRAL") continue;
      try {
        var b = el.getBBox();
        var area = Math.max(0.01, b.width * b.height);
        if (!agg[iso]) agg[iso] = { ax: 0, ay: 0, area: 0, n: 0, minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
        agg[iso].ax += (b.x + b.width / 2) * area;
        agg[iso].ay += (b.y + b.height / 2) * area;
        agg[iso].area += area;
        agg[iso].n += 1;
        if (b.x < agg[iso].minX) agg[iso].minX = b.x;
        if (b.y < agg[iso].minY) agg[iso].minY = b.y;
        if (b.x + b.width > agg[iso].maxX) agg[iso].maxX = b.x + b.width;
        if (b.y + b.height > agg[iso].maxY) agg[iso].maxY = b.y + b.height;
      } catch (e) {}
    }

    var keyParts = [];
    Object.keys(agg).forEach(function (iso) {
      if (passesLod(agg[iso], k)) keyParts.push(iso + ":" + agg[iso].n);
    });
    var key = kBucket + "|" + keyParts.sort().join("|");
    if (!force && key === lastNameKey && layer.childNodes.length) return;
    lastNameKey = key;

    while (layer.firstChild) layer.removeChild(layer.firstChild);

    Object.keys(agg).forEach(function (iso) {
      var a = agg[iso];
      if (!passesLod(a, k)) return;
      if (a.n < 1) return;
      var label = (typeof window.scCountryLabel === "function") ? window.scCountryLabel(iso, "auto") : countryDisplayName(g, iso);
      try {
        var ren2 = (GameState.nameOverrides && GameState.nameOverrides[iso]) || (window.__SC_NAME_OVERRIDES && window.__SC_NAME_OVERRIDES[iso]);
        if (ren2) label = ren2;
      } catch (e) {}
      if (!label) return; // silinen / topraksız ülke ismi yok
      if (a.n < 2 && a.area < 40 && k < 2.5) return;
      var cx = a.ax / a.area;
      var cy = a.ay / a.area;
      // İsim ofset istisnaları (howareu editörü)
      try {
        var off = null;
        try {
          if (GameState.nameOffsets && GameState.nameOffsets[iso]) off = GameState.nameOffsets[iso];
          else if (window.__SC_NAME_OFFSETS && window.__SC_NAME_OFFSETS[iso]) off = window.__SC_NAME_OFFSETS[iso];
        } catch (e2) {}
        if (off) { cx += (+off.dx || 0); cy += (+off.dy || 0); }
        var ren = (GameState.nameOverrides && GameState.nameOverrides[iso]) || (window.__SC_NAME_OVERRIDES && window.__SC_NAME_OVERRIDES[iso]);
        if (ren) { /* label text handled below */ }
      } catch (e) {}
      var boxW = Math.max(4, (a.maxX || cx + 2) - (a.minX || cx - 2));
      var boxH = Math.max(3, (a.maxY || cy + 2) - (a.minY || cy - 2));
      var byArea = Math.sqrt(a.area) * 0.22;
      var byWidth = (boxW * 0.72) / Math.max(3, label.length * 0.62);
      var byHeight = boxH * 0.22;
      var fs = Math.min(byArea, byWidth, byHeight);
      fs = Math.max(2.2, Math.min(7.5, fs));
      if (k < 0.7) fs = Math.min(fs, 5.5);

      var tEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tEl.setAttribute("x", String(cx));
      tEl.setAttribute("y", String(cy));
      tEl.setAttribute("text-anchor", "middle");
      tEl.setAttribute("dominant-baseline", "middle");
      tEl.setAttribute("font-family", "Georgia, 'Times New Roman', serif");
      tEl.setAttribute("font-size", String(fs.toFixed(2)));
      tEl.setAttribute("font-weight", "600");
      tEl.setAttribute("letter-spacing", "0.04em");
      tEl.setAttribute("fill", "rgba(248,250,252,0.72)");
      tEl.setAttribute("stroke", "rgba(15,23,42,0.45)");
      tEl.setAttribute("stroke-width", "0.2");
      tEl.setAttribute("paint-order", "stroke");
      tEl.setAttribute("data-iso", iso);
      tEl.textContent = label;
      layer.appendChild(tEl);

      try {
        var bb = tEl.getBBox();
        if (bb.width > boxW * 0.92 || bb.height > boxH * 0.85) {
          var sx = (boxW * 0.92) / Math.max(0.1, bb.width);
          var sy = (boxH * 0.85) / Math.max(0.1, bb.height);
          var s = Math.min(1, sx, sy);
          if (s < 0.98) tEl.setAttribute("font-size", String(Math.max(2.0, fs * s).toFixed(2)));
        }
      } catch (e) {}
    });
  }
  window.scRefreshCountryNames = refreshCountryNames;
  window.scOnZoomNames = function (k) {
    window.__SC_ZOOM_K = k;
    try { refreshCountryNames(false); } catch (e) {}
  };



  // =====================================================================
  // 2) Strip clutter UI
  // =====================================================================
  function stripClutter() {
    ["sc-cmd-dock", "sc-atmo-dock", "sc-viral-hud", "sc-camp-hud"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = "none";
        try { el.innerHTML = ""; } catch (e) {}
      }
    });
    // remove injected menu buttons
    ["mm-campaigns", "mm-workshop"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    // neuter openers
    window.scOpenTimelapse = function () { toast("Harita akışı kapatıldı", "info"); };
    window.scOpenWorkshop = function () { toast("Atölye kapatıldı", "info"); };
    window.scSendUltimatum = function () { toast("Ültimatom kaldırıldı", "info"); };
    window.scOpenCampaigns = function () { /* keep optional via route later */ };
  }

  // Disable atmosphere dock creation by overriding after load
  function killAtmoDock() {
    var dock = document.getElementById("sc-atmo-dock");
    if (dock) {
      dock.style.display = "none";
      dock.innerHTML = "";
    }
  }

  // =====================================================================
  // 3) Sell land — player picks province, priced by value
  // =====================================================================
  var sellMode = null; // { targetIso }

  function provinceValue(pName) {
    var pd = window.PROVINCE_DATA || {};
    var d = pd[pName] || {};
    var base = 280;
    var infra = (d.infrastructureLevel || 1) * 60;
    var res = d.primaryResource ? 90 : 0;
    if (d.primaryResource === "oil" || d.primaryResource === "steel") res = 140;
    var pop = typeof d.population === "number" ? Math.min(200, Math.floor(d.population / 50000)) : 40;
    return Math.round(base + infra + res + pop);
  }

  window.sellLandTo = function (iso) {
    var g = GS();
    if (!g) return;
    if (typeof isHostileToward === "function" && isHostileToward(iso)) {
      slog("Düşmana arazi satılmaz.", "text-red-500");
      return;
    }
    sellMode = { targetIso: iso };
    toast("Satılacak kendi eyaletine tıkla", "info");
    slog("Arazi satışı: " + ((g.countries[iso] && g.countries[iso].name) || iso) + " — eyalet seç", "text-emerald-300");
  };

  function trySellOnProvince(pName) {
    if (!sellMode) return false;
    var g = GS();
    var po = owners();
    if (!g || !po) return false;
    if (po[pName] !== g.player) {
      toast("Yalnız kendi eyaletini satabilirsin", "bad");
      return true;
    }
    var myCount = Object.keys(po).filter(function (k) { return po[k] === g.player; }).length;
    if (myCount < 2) {
      toast("Son eyalet satılamaz", "bad");
      sellMode = null;
      return true;
    }
    var iso = sellMode.targetIso;
    var price = provinceValue(pName);
    var buyer = g.countries[iso];
    var seller = g.countries[g.player];
    if (buyer && buyer.money != null && buyer.money < price) {
      // still allow — AI pays what it can / goes near zero
      price = Math.min(price, Math.max(50, buyer.money || 0));
    }
    po[pName] = iso;
    if (seller && seller.money != null) seller.money += price;
    if (buyer && buyer.money != null) buyer.money = Math.max(0, buyer.money - price);
    if (!g.relations) g.relations = {};
    g.relations[iso] = Math.min(100, (g.relations[iso] || 0) + 10);
    slog(
      "🗺️ Satıldı: " + String(pName).replace(/_/g, " ") + " → " + ((buyer && buyer.name) || iso) + " (+" + price + "💰)",
      "text-emerald-400"
    );
    toast("+" + price + " · " + String(pName).replace(/_/g, " "), "good");
    sellMode = null;
    try {
      if (typeof refreshMapColors === "function") refreshMapColors();
      if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
      if (typeof updateHUD === "function") updateHUD();
      if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
      refreshCountryNames();
    } catch (e) {}
    return true;
  }

  function bindSellClick() {
    var svg = document.querySelector("#game-map");
    if (!svg || svg._scSellBound) return;
    svg._scSellBound = true;
    svg.addEventListener(
      "click",
      function (ev) {
        if (!sellMode) return;
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var name = t.getAttribute("data-name");
        if (!name) return;
        if (trySellOnProvince(name)) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      },
      true
    );
  }

  // =====================================================================
  // 4) Scenario factions (not 1939 labels on modern/1914)
  // =====================================================================
  function reseedFactions() {
    var g = GS();
    if (!g) return;
    if (!g.hoi) g.hoi = { factions: {}, armyXP: 0, navyXP: 0, airXP: 0, researchSlots: 2, guarantees: {} };
    var sid = g.scenarioId || "modern";
    var F;
    if (sid === "ww2") {
      F = {
        axis: { name: "Mihver", leader: "DEU", members: [] },
        allies: { name: "Müttefikler", leader: "GBR", members: [] },
        comintern: { name: "Komintern", leader: "RUS", members: [] }
      };
    } else if (sid === "ww1") {
      F = {
        entente: { name: "İtilaf Devletleri", leader: "GBR", members: [] },
        central: { name: "İttifak Devletleri", leader: "DEU", members: [] },
        neutral_bloc: { name: "Tarafsızlar", leader: null, members: [] }
      };
    } else {
      // modern
      F = {
        west: { name: "Batı İttifakı", leader: "USA", members: [] },
        eurasia: { name: "Avrasya Hizası", leader: "RUS", members: [] },
        nonaligned: { name: "Bağlantısızlar", leader: null, members: [] }
      };
    }
    g.hoi.factions = F;

    function join(iso, fid) {
      if (!g.countries[iso]) return;
      Object.keys(F).forEach(function (id) {
        F[id].members = (F[id].members || []).filter(function (m) { return m !== iso; });
      });
      if (F[fid] && F[fid].members.indexOf(iso) < 0) F[fid].members.push(iso);
      g.countries[iso].faction = fid;
    }

    if (sid === "ww2") {
      ["DEU", "ITA", "JPN"].forEach(function (x) { join(x, "axis"); });
      ["GBR", "FRA", "USA"].forEach(function (x) { join(x, "allies"); });
      join("RUS", "comintern");
    } else if (sid === "ww1") {
      ["DEU", "AUT", "HUN"].forEach(function (x) { join(x, "central"); });
      // Ottoman if present as TUR
      join("TUR", "central");
      ["GBR", "FRA", "RUS", "USA", "ITA"].forEach(function (x) { join(x, "entente"); });
    } else {
      ["USA", "GBR", "FRA", "DEU", "CAN", "AUS"].forEach(function (x) { join(x, "west"); });
      ["RUS", "CHN", "IRN"].forEach(function (x) { join(x, "eurasia"); });
      ["TUR", "IND", "BRA", "IDN", "SAU"].forEach(function (x) { join(x, "nonaligned"); });
    }

    // clear stale axis/allies keys from country.faction if not in F
    Object.keys(g.countries || {}).forEach(function (iso) {
      var c = g.countries[iso];
      if (!c) return;
      if (c.faction && !F[c.faction]) c.faction = null;
    });
  }
  window.scReseedFactions = reseedFactions;

  // wrap getFactionOf stays compatible

  // =====================================================================
  // 5) Hash routes — clean main menu subpages
  // =====================================================================
  function showOnly(id) {
    ["main-menu-screen", "lobby-screen", "credits-modal"].forEach(function (x) {
      var el = document.getElementById(x);
      if (!el) return;
      if (x === id) {
        el.classList.remove("hidden");
        el.style.display = "";
      } else if (x === "credits-modal") {
        el.classList.add("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
  }

  function routeFromHash() {
    var h = (location.hash || "#/").replace(/^#/, "") || "/";
    if (h.charAt(0) !== "/") h = "/" + h;
    // if in game, don't yank menus
    var g = GS();
    if (g && g.running) return;

    if (h === "/" || h === "/menu") {
      showOnly("main-menu-screen");
    } else if (h === "/play" || h === "/lobby" || h === "/new") {
      showOnly("lobby-screen");
      try {
        if (typeof mainMenuNewGame === "function") {
          /* already showing lobby */
        }
      } catch (e) {}
    } else if (h === "/mp") {
      showOnly("lobby-screen");
      try {
        if (typeof mainMenuMultiplayer === "function") mainMenuMultiplayer();
      } catch (e) {}
    } else if (h === "/about" || h === "/credits") {
      showOnly("main-menu-screen");
      try {
        if (typeof mainMenuCredits === "function") mainMenuCredits();
      } catch (e) {}
    } else if (h === "/settings") {
      showOnly("main-menu-screen");
      try {
        if (typeof openSettingsModal === "function") openSettingsModal();
        else if (typeof toggleSettings === "function") toggleSettings();
      } catch (e) {}
    }
  }

  function wireMenuHashes() {
    var map = [
      ["mm-quick-play", "#/play"],
      // new game buttons
    ];
    // rewrite menu button handlers lightly
    var menu = document.getElementById("main-menu-screen");
    if (!menu || menu._scHashWired) return;
    menu._scHashWired = true;
    menu.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn) return;
      var oc = btn.getAttribute("onclick") || "";
      if (oc.indexOf("mainMenuNewGame") >= 0 || btn.id === "mm-quick-play") {
        try { history.replaceState(null, "", "#/play"); } catch (e) {}
      } else if (oc.indexOf("mainMenuMultiplayer") >= 0) {
        try { history.replaceState(null, "", "#/mp"); } catch (e) {}
      } else if (oc.indexOf("mainMenuCredits") >= 0) {
        try { history.replaceState(null, "", "#/about"); } catch (e) {}
      } else if (oc.indexOf("openSettingsModal") >= 0 || oc.indexOf("toggleSettings") >= 0) {
        try { history.replaceState(null, "", "#/settings"); } catch (e) {}
      }
    });
  }

  // clean main menu: remove extra injected stuff, keep core
  function tidyMainMenu() {
    stripClutter();
    // remove "Hızlı Başla" chaotic styling? keep but simpler label
    var qp = document.getElementById("mm-quick-play");
    if (qp) qp.textContent = "Hızlı Başla";
  }

  // =====================================================================
  // Espionage soft-disable: block starting new spy missions if function exists
  // =====================================================================
  function softDisableEspionage() {
    try {
      if (typeof window.startSpyMission === "function" && !window.startSpyMission._off) {
        window.startSpyMission = function () {
          toast("Casusluk sistemi kapalı", "info");
        };
        window.startSpyMission._off = true;
      }
    } catch (e) {}
    // hide spy buttons if any labeled
    document.querySelectorAll("[onclick*='Spy'], [onclick*='spy'], [onclick*='Casus'], [onclick*='casus']").forEach(function (el) {
      try { el.style.display = "none"; } catch (e) {}
    });
  }

  // =====================================================================
  // Boot
  // =====================================================================
  var seeded = false;
  function onRunning() {
    stripClutter();
    killAtmoDock();
    bindSellClick();
    softDisableEspionage();
    refreshCountryNames();
    if (!seeded) {
      reseedFactions();
      seeded = true;
    }
    // kill hourOne residual flags
    try {
      var g = GS();
      if (g && g.hourOne) {
        g.hourOne._disabled = true;
        g.hourOne.introFired = true;
        g.hourOne.tensionBoosted = true;
      }
    } catch (e) {}
  }

  var _ranOnce = false;
  function boot() {
    tidyMainMenu();
    wireMenuHashes();
    window.addEventListener("hashchange", routeFromHash);
    stripClutter();
    killAtmoDock();
    softDisableEspionage();
    // One-shot cleanup after load — no periodic redraw (anti-blink)
    setTimeout(function () {
      stripClutter();
      killAtmoDock();
      tidyMainMenu();
    }, 1500);
    setTimeout(function () {
      stripClutter();
      var g = GS();
      if (g && g.running) onRunning();
    }, 4000);
    // rare safety: only strip clutter, never forced name rebuild
    setInterval(function () {
      stripClutter();
      killAtmoDock();
      var g = GS();
      if (g && g.running && !_ranOnce) {
        onRunning();
        _ranOnce = true;
      }
    }, 8000);
    console.log("[polish] stable · names on zoom only · clutter stripped");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
