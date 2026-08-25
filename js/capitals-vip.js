// ===== Capitals VIP · full assignment · name over capital · move capital =====
(function SCCapitalsVIP() {
  "use strict";

  // Canonical capital province per ISO (modern map names)
  var CAP_MODERN = {
    TUR: "Ankara", DEU: "Brandenburg", USA: "Virginia", RUS: "Moscow",
    GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", JPN: "Kanto",
    CHN: "Hebei", IND: "Delhi", BRA: "Goiás", POL: "Warszawa", ESP: "Madrid",
    SAU: "Nejd", IRN: "Tehran", EGY: "Cairo", KOR: "Gyeonggi", PRK: "Pyongan-Hwanghae",
    AUS: "New_South_Wales", CAN: "Southern_Ontario", MEX: "Mexico_City", ARG: "Buenos_Aires",
    NLD: "Holland", BEL: "Vlaanderen", SWE: "Södermanland", NOR: "Oslofjord", FIN: "Uusimaa",
    GRC: "Attica", ROU: "Muntenia", HUN: "Northern_Hungary", CZE: "Bohemia",
    AUT: "Ostmark", CHE: "Swiss_Plateau", PRT: "Lisbon", IRL: "Leinster",
    UKR: "Kyiv", BLR: "Minsk", SRB: "Serbia", BGR: "Sofia", HRV: "Croatia",
    ISR: "Palestine", IRQ: "Baghdad", SYR: "Damascus", JOR: "Jordan", LBN: "Lebanon",
    PAK: "West_Punjab", BGD: "East_Bengal", IDN: "Java", THA: "Siam", VNM: "Tonkin",
    MYS: "Malaya", SGP: "Singapore", PHL: "Luzon", NZL: "North_Island",
    ZAF: "Transvaal", NGA: "Lagos", ETH: "Shewa", KEN: "Nairobi",
    DZA: "Algiers", MAR: "Casablanca", TUN: "Tunisia", LBY: "Tripoli",
    CHL: "Santiago", COL: "Cundinamarca", PER: "Lima", VEN: "Miranda",
    TWN: "Taiwan", KAZ: "Alma_Ata", AZE: "Azerbaijan", GEO: "Georgia", ARM: "Armenia",
    AFG: "Kabul", UZB: "Tashkent", CUB: "Cuba", PAN: "Panamá",
    DNK: "Sjaelland", EST: "Harju", LVA: "Vidzeme", LTU: "Aukštaitija",
    SVK: "Eastern_Slovakia", SVN: "North_Slovenia", BIH: "Bosnia", MKD: "Macedonia",
    ALB: "Albania", MNE: "Montenegro", RKS: "Kosovo", MDA: "Moldova", CYP: "Cyprus",
    MLT: "Malta", LUX: "Luxembourg", ISL: "Iceland",
    ABK: "Abkhazia", SML: "Somaliland", SOM: "Jubaland", DJI: "French_Somaliland",
    ARE: "Abu_Dhabi", QAT: "Qatar", KWT: "Kuwait", BHR: "Bahrain", OMN: "Oman", YEM: "South_Yemen",
    PSE: "Palestine", LKA: "Ceylon", NPL: "Nepal", BTN: "Bhutan", MMR: "Sagaing",
    KHM: "Cambodia", LAO: "Laos", MNG: "Khövsgöl", TJK: "Stalinabad", TKM: "Ashkhabad",
    KGZ: "Pamir",
    AGO: "Luanda", COD: "Leopoldville", COG: "Middle_Congo", CAF: "Equatorial_Africa",
    CMR: "Cameroon", GAB: "Gabon", GHA: "Ghana", CIV: "Ivory_Coast", SEN: "Senegal",
    MLI: "Bamako", NER: "Niger", TCD: "Chad", SDN: "Khartoum", SSD: "Upper_Nile",
    UGA: "Uganda", TZA: "Tanganyika", RWA: "Rwanda", BDI: "Burundi", MOZ: "Zambezia_Moçambique",
    ZMB: "Barotziland", ZWE: "Rhodesia", NAM: "Khomas", BWA: "Bechuanaland", MWI: "Malawi",
    MDG: "Madagascar", GIN: "Guinea", GNB: "Portuguese_Guinea", SLE: "Sierra_Leone",
    LBR: "Liberia", TGO: "Togo", BEN: "Dahomey", BFA: "Upper_Volta", MRT: "Mauritania",
    GMB: "Gambia", GNQ: "Equatorial_Guinea", ERI: "Eritrea",
    BOL: "La_Paz", PRY: "Paraguay", URY: "Montevideo", ECU: "Ecuador",
    GTM: "Guatemala", HND: "Honduras", SLV: "El_Salvador", NIC: "Nicaragua", CRI: "Costa_Rica",
    HTI: "Haiti", DOM: "Dominican_Republic", JAM: "Jamaica", CUB: "Cuba",
    GUY: "British_Guyana", SUR: "Suriname", BLZ: "British_Honduras",
    PNG: "Kaiser-Wilhelmsland", FJI: "Fiji", SLB: "Solomon_Islands", VUT: "Vanuatu",
    WSM: "Samoa", TLS: "East_Timor", BRN: "Brunei",
    BHS: "Northern_Bahamas", TTO: "Trinidad", ATG: "Leeward_Islands", LCA: "Windward_Islands",
    CPV: "Cabo_Verde", STP: "Sao_Tome", COM: "Comoro_Islands", SYC: "Seychelles",
    MUS: "Mauritius", MDV: "Maldives", MHL: "Marshall_Islands", FSM: "Caroline_Islands",
    PLW: "Palau", KIR: "Gilbert_Islands", TUV: "Ellice_Islands", NRU: "Nauru", SHN: "Saint_Helena"
  };

  var CAP_WW1 = Object.assign({}, CAP_MODERN, {
    TUR: "Istanbul", RUS: "Saint_Petersburg", POL: "Warszawa"
  });
  var CAP_WW2 = Object.assign({}, CAP_MODERN, {
    RUS: "Moscow", CHN: "Chongqing"
  });

  function packFor(sid) {
    if (sid === "ww1" || sid === "1914") return CAP_WW1;
    if (sid === "ww2" || sid === "1939") return CAP_WW2;
    return CAP_MODERN;
  }

  function ownersMap() {
    try {
      return window.provinceOwners || {};
    } catch (e) {
      return {};
    }
  }

  function ownedBy(iso) {
    var po = ownersMap();
    var out = [];
    for (var p in po) if (po[p] === iso) out.push(p);
    return out;
  }

  function resolveCapital(iso, preferred) {
    var po = ownersMap();
    var land = ownedBy(iso);
    if (preferred && po[preferred] === iso) return preferred;
    if (preferred && po[preferred]) {
      // province exists but wrong owner — still use if unowned mapping later
    }
    if (preferred && land.indexOf(preferred) >= 0) return preferred;
    // fuzzy match
    if (preferred && land.length) {
      var pl = preferred.toLowerCase().replace(/_/g, "");
      for (var i = 0; i < land.length; i++) {
        var ll = land[i].toLowerCase().replace(/_/g, "");
        if (ll.indexOf(pl.slice(0, 5)) >= 0 || pl.indexOf(ll.slice(0, 5)) >= 0) return land[i];
      }
    }
    return land[0] || preferred || null;
  }

  window.getCountryCapital = function (iso, scenarioId) {
    var sid = scenarioId || (window.GameState && GameState.scenarioId) || "modern";
    var pack = packFor(sid);
    var pref = pack[iso] || CAP_MODERN[iso] || null;
    // live override
    try {
      if (GameState.capitals && GameState.capitals[iso]) return GameState.capitals[iso];
      if (GameState.countries && GameState.countries[iso] && GameState.countries[iso].capital)
        return GameState.countries[iso].capital;
    } catch (e) {}
    return resolveCapital(iso, pref);
  };

  window.applyCapitalsAndIdentity = function (scenarioId) {
    var sid = scenarioId || (window.GameState && GameState.scenarioId) || "modern";
    if (!window.GameState || !GameState.countries) return 0;
    GameState.capitals = GameState.capitals || {};
    var pack = packFor(sid);
    var n = 0;
    // all countries with land
    var po = ownersMap();
    var isos = {};
    for (var p in po) isos[po[p]] = 1;
    Object.keys(GameState.countries).forEach(function (iso) {
      isos[iso] = 1;
    });
    Object.keys(isos).forEach(function (iso) {
      if (!iso || iso === "NEUTRAL") return;
      var pref = pack[iso] || CAP_MODERN[iso] || null;
      var cap = resolveCapital(iso, pref);
      if (!cap) return;
      GameState.capitals[iso] = cap;
      if (GameState.countries[iso]) {
        GameState.countries[iso].capital = cap;
        GameState.countries[iso].capitalLost = false;
      }
      n++;
    });
    try {
      if (typeof window.updateCapitalMarkers === "function") window.updateCapitalMarkers();
    } catch (e) {}
    console.log("[capitals-vip] assigned", n, "capitals");
    return n;
  };

  // --- VIP effects ---
  function isCapitalProvince(pName) {
    try {
      var caps = GameState.capitals || {};
      for (var iso in caps) if (caps[iso] === pName) return iso;
    } catch (e) {}
    return null;
  }

  // Boost supply at capitals
  var prevSupply = window.getProvinceSupply;
  window.getProvinceSupply = function (pName) {
    var s = typeof prevSupply === "function" ? prevSupply(pName) : 0.5;
    try {
      var iso = isCapitalProvince(pName);
      if (iso) s = Math.min(1, s + 0.3);
      // occupied enemy capital — still high strategic value but contested
      if (GameState.occupations && GameState.occupations[pName]) {
        var legal = (window.provinceOwners && provinceOwners[pName]) || null;
        if (legal && GameState.capitals && GameState.capitals[legal] === pName) {
          s = Math.max(s, 0.55);
        }
      }
    } catch (e) {}
    return s;
  };

  // PP / money tick bonus for controlling own capital
  function capitalVipTick() {
    try {
      if (!GameState || !GameState.countries || !GameState.capitals) return;
      var po = ownersMap();
      Object.keys(GameState.capitals).forEach(function (iso) {
        var c = GameState.countries[iso];
        if (!c) return;
        var cap = GameState.capitals[iso];
        if (!cap) return;
        var owner = po[cap];
        var occ = GameState.occupations && GameState.occupations[cap];
        if (owner === iso && !occ) {
          // own capital safe
          c.money = (c.money || 0) + 2;
          c.politicalPower = (c.politicalPower || 0) + 0.15;
          c.manpower = (c.manpower || 0) + 5;
          c.capitalLost = false;
        } else if (occ && occ !== iso) {
          // capital occupied by enemy — heavy penalties
          c.capitalLost = true;
          c.politicalPower = Math.max(0, (c.politicalPower || 0) - 0.4);
          c.money = Math.max(0, (c.money || 0) - 3);
        } else if (owner !== iso) {
          c.capitalLost = true;
        }
      });
    } catch (e) {}
  }

  // Hook game tick lightly
  setInterval(function () {
    try {
      if (GameState && GameState.running) capitalVipTick();
    } catch (e) {}
  }, 8000);

  // --- Change capital ---
  window.scSetCapital = function (iso, provinceName) {
    iso = iso || (GameState && GameState.player);
    if (!iso || !provinceName) return false;
    var po = ownersMap();
    if (po[provinceName] !== iso) {
      try {
        if (typeof showToast === "function")
          showToast("Başkent yalnız kendi eyaletinde olabilir", "bad");
      } catch (e) {}
      return false;
    }
    if (GameState.occupations && GameState.occupations[provinceName]) {
      try {
        if (typeof showToast === "function")
          showToast("İşgal altındaki eyalet başkent olamaz", "bad");
      } catch (e) {}
      return false;
    }
    GameState.capitals = GameState.capitals || {};
    var old = GameState.capitals[iso];
    GameState.capitals[iso] = provinceName;
    if (GameState.countries[iso]) {
      GameState.countries[iso].capital = provinceName;
      GameState.countries[iso].capitalLost = false;
      // cost
      GameState.countries[iso].money = Math.max(0, (GameState.countries[iso].money || 0) - 150);
      GameState.countries[iso].politicalPower = Math.max(
        0,
        (GameState.countries[iso].politicalPower || 0) - 20
      );
    }
    try {
      if (typeof showToast === "function")
        showToast("Yeni başkent: " + provinceName.replace(/_/g, " ") + " (−150₺, −20 PP)", "good");
      if (typeof log === "function")
        log("Başkent taşındı: " + (old || "?") + " → " + provinceName, "text-amber-300");
    } catch (e) {}
    try {
      if (typeof window.updateCapitalMarkers === "function") window.updateCapitalMarkers();
      if (typeof window.scRefreshCountryNames === "function") window.scRefreshCountryNames(true);
    } catch (e) {}
    return true;
  };

  window.scMoveCapitalToSelected = function () {
    try {
      var p =
        window.selectedProvince ||
        GameState.selectedProvince ||
        (document.getElementById("sel-province-name") &&
          document.getElementById("sel-province-name").textContent);
      if (!p || p === "—" || p === "-") {
        if (typeof showToast === "function") showToast("Önce kendi eyaletini seç", "bad");
        return;
      }
      p = String(p).trim().replace(/\s+/g, "_");
      // try both forms
      var po = ownersMap();
      if (!po[p]) {
        var alt = Object.keys(po).find(function (k) {
          return k.replace(/_/g, " ") === p.replace(/_/g, " ");
        });
        if (alt) p = alt;
      }
      scSetCapital(GameState.player, p);
    } catch (e) {
      console.warn(e);
    }
  };

  // UI button injection
  function ensureCapitalBtn() {
    return; // buton altyapı paneline taşındı
    if (document.getElementById("sc-btn-move-capital")) return;
    var host =
      document.getElementById("province-actions") ||
      document.getElementById("left-panel") ||
      document.getElementById("side-panel");
    if (!host) return;
    var btn = document.createElement("button");
    btn.id = "sc-btn-move-capital";
    btn.type = "button";
    btn.className =
      "w-full mt-2 py-2 text-[11px] font-bold uppercase tracking-wider border border-amber-700 bg-amber-950/40 text-amber-200 rounded";
    btn.textContent = "★ Başkenti buraya taşı";
    btn.onclick = function () {
      window.scMoveCapitalToSelected();
    };
    host.appendChild(btn);
  }

  // VIP capital markers — stronger look
  var prevMarkers = window.updateCapitalMarkers;
  window.updateCapitalMarkers = function () {
    if (typeof prevMarkers === "function") {
      try {
        prevMarkers();
      } catch (e) {}
    }
    try {
      if (GameState.settings && GameState.settings.showCapitals === false) return;
      var svg = document.querySelector("#game-map svg") || document.querySelector("svg");
      if (!svg) return;
      // style capital markers
      svg.querySelectorAll(".capital-marker, circle.capital-marker, g.capital-layer circle").forEach(function (el) {
        el.setAttribute("r", el.getAttribute("r") || "2.2");
        el.style.fill = "#fbbf24";
        el.style.stroke = "#78350f";
        el.style.strokeWidth = "0.6";
        el.style.filter = "drop-shadow(0 0 2px #f59e0b)";
      });
    } catch (e) {}
  };

  // --- Name labels ABOVE capital ---
  window.scCapitalPoint = function (iso) {
    try {
      var cap = window.getCountryCapital(iso);
      if (!cap) return null;
      // path centroid
      var path =
        document.querySelector('path[data-name="' + cap + '"]') ||
        document.querySelector('path[data-province="' + cap + '"]') ||
        document.querySelector("#province-" + CSS.escape(cap));
      if (!path && window.provincePaths && window.provincePaths[cap]) path = window.provincePaths[cap];
      if (path && typeof path.getBBox === "function") {
        var b = path.getBBox();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, province: cap };
      }
      // PROVINCE_DATA centroid
      var PD = window.PROVINCE_DATA;
      if (PD && PD[cap]) {
        var d = PD[cap];
        if (d.cx != null) return { x: d.cx, y: d.cy, province: cap };
        if (d.x != null) return { x: d.x, y: d.y, province: cap };
      }
    } catch (e) {}
    return null;
  };

  // Patch country name renderer to prefer capital anchor
  function patchNameAnchor() {
    // disabled: names use land centroid + howareu offsets
  }

  // Deeper patch into polish aggregate if available
  function patchPolishCentroid() {
    // Override getCountryCapital already done; polish uses province centroids avg.
    // Provide helper used if polish checks window.scCountryAnchor
    window.scCountryAnchor = function (iso) {
      return window.scCapitalPoint(iso);
    };
  }

  // Enhance polish-cleanup path if it exposes refresh — inject capital into aggregate
  function hookLabelBuild() {
    // capital snap disabled — centroid + optional howareu offsets only
  }

  function boot() {
    try {
      applyCapitalsAndIdentity(GameState && GameState.scenarioId);
    } catch (e) {}
    patchNameAnchor();
    patchPolishCentroid();
    hookLabelBuild();
    ensureCapitalBtn();
    setTimeout(ensureCapitalBtn, 2000);
    setTimeout(function () {
      try {
        applyCapitalsAndIdentity(GameState && GameState.scenarioId);
        if (typeof window.updateCapitalMarkers === "function") updateCapitalMarkers();
      } catch (e) {}
    }, 1500);
    // after startGame
    var prev = window.startGame;
    if (typeof prev === "function" && !prev._capVip) {
      window.startGame = async function () {
        var r = await prev.apply(this, arguments);
        applyCapitalsAndIdentity(GameState.scenarioId);
        ensureCapitalBtn();
        setTimeout(function () {
          applyCapitalsAndIdentity(GameState.scenarioId);
          if (typeof updateCapitalMarkers === "function") updateCapitalMarkers();
          if (typeof window.scRefreshCountryNames === "function") scRefreshCountryNames(true);
        }, 800);
        return r;
      };
      window.startGame._capVip = true;
    }
    console.log("[capitals-vip] full map · VIP · move capital · name anchor");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
