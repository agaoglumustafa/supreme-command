
/**
 * v1.9.7 — İşgal rengi karışımı + beceriye dayalı VP
 * - İşgal eyaleti = yasal sahip rengi + işgalci rengi karışımı
 * - Sahiplik (provinceOwners) işgal edilende kalır; kontrol occupations'ta
 * - Barışta işgaldeki eyaleti almak %50 daha az VP
 * - VP rastgele değil: işgal büyüklüğü, asker, eyalet sayısı
 */
(function SCOccupationVP() {
  "use strict";
  console.log("[v1.9.8] VP: arazi·iklim·kaynak·alan·ülke");

  function GS() { return window.GameState || null; }
  function owners() {
    try { return window.provinceOwners || {}; } catch (e) { return {}; }
  }

  function blend(a, b, t) {
    if (typeof window.blendHexColors === "function") return window.blendHexColors(a, b, t);
    t = Math.max(0, Math.min(1, t == null ? 0.5 : t));
    function parse(h) {
      h = String(h || "#334155").replace("#", "");
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
    }
    var A = parse(a), B = parse(b);
    var r = Math.round(A[0] + (B[0]-A[0])*t);
    var g = Math.round(A[1] + (B[1]-A[1])*t);
    var bl = Math.round(A[2] + (B[2]-A[2])*t);
    return "#" + [r,g,bl].map(function(x){ var s=x.toString(16); return s.length<2?"0"+s:s; }).join("");
  }

  // --- Paint occupied as mix (owner + occupier) ---
  function paintOccupationBlend() {
    var g = GS();
    if (!g || typeof d3 === "undefined") return;
    var occ = g.occupations || {};
    var po = owners();
    try {
      d3.selectAll(".country-path").each(function () {
        var path = d3.select(this);
        var name = path.attr("data-name");
        if (!name) return;
        var owner = po[name] || (typeof getProvinceOwner === "function" ? getProvinceOwner(name) : null);
        if (!owner) return;
        var occupier = occ[name];
        var baseCol = (g.countries[owner] && g.countries[owner].color) || "#1e293b";
        if (occupier && occupier !== owner) {
          var oCol = (g.countries[occupier] && g.countries[occupier].color) || "#fbbf24";
          // ~50% karışım
          path.style("fill", blend(baseCol, oCol, 0.5));
          path.classed("prov-occupied", true);
          path.style("stroke", oCol);
          path.style("stroke-width", "0.35");
        }
      });
    } catch (e) {}
  }

  var _rmc = window.refreshMapColors;
  if (typeof _rmc === "function" && !_rmc._occVp) {
    window.refreshMapColors = function () {
      var r = _rmc.apply(this, arguments);
      try { paintOccupationBlend(); } catch (e) {}
      return r;
    };
    window.refreshMapColors._occVp = true;
  }

  // --- Province value (skill weight) ---
  /** Eyalet VP ağırlığı: arazi + iklim + kaynak + yüzölçüm + sahip ülke */
  var TERRAIN_VP = {
    plains: 1.0, grassland: 1.0, forest: 1.15, jungle: 1.25,
    hills: 1.2, mountain: 1.45, mountains: 1.45, desert: 0.75,
    savanna: 0.9, tundra: 0.7, ice: 0.45, urban: 1.8, coastal: 1.25, marsh: 0.85
  };
  var CLIMATE_VP = {
    temperate: 1.05, continental: 1.0, mediterranean: 1.1,
    subtropical: 1.05, tropical: 1.0, arid: 0.8, polar: 0.55, ocean: 0.7
  };
  var RESOURCE_VP = {
    oil: 2.4, steel: 2.0, tungsten: 1.7, rubber: 1.6, chromium: 1.5,
    aluminum: 1.45, coal: 1.3, iron: 1.35, gold: 1.4, uranium: 2.2
  };
  // Büyük güç eyaletleri biraz daha "pahalı" (stratejik değer)
  var OWNER_VP = {
    USA: 1.35, RUS: 1.3, CHN: 1.28, DEU: 1.25, GBR: 1.22, FRA: 1.2,
    JPN: 1.18, IND: 1.15, TUR: 1.12, ITA: 1.1, BRA: 1.08, CAN: 1.08,
    KOR: 1.1, ESP: 1.05, POL: 1.05, IRN: 1.1, SAU: 1.15
  };

  function provinceArea(pName) {
    try {
      var el = document.querySelector('#game-map path.country-path[data-name="' + CSS.escape(pName) + '"]');
      if (!el) {
        // fallback without CSS.escape
        el = document.querySelector('#game-map path.country-path[data-name="' + pName.replace(/"/g, '') + '"]');
      }
      if (el && el.getBBox) {
        var b = el.getBBox();
        return Math.max(1, b.width * b.height);
      }
    } catch (e) {}
    return 40;
  }

  function provinceWeight(pName) {
    var pd = window.PROVINCE_DATA || {};
    var d = pd[pName] || {};
    var w = 1.0;

    // 1) Yüzölçümü
    var area = provinceArea(pName);
    var areaF = Math.min(5.5, 0.6 + Math.sqrt(area) / 10);
    w *= areaF;

    // 2) Arazi
    var terr = String(d.terrain || "plains").toLowerCase();
    w *= TERRAIN_VP[terr] || 1.0;

    // 3) İklim
    var cli = String(d.climate || "temperate").toLowerCase();
    w *= CLIMATE_VP[cli] || 1.0;

    // 4) Kaynak
    var res = d.primaryResource || d.resource || null;
    if (res) {
      var rk = String(res).toLowerCase();
      w *= RESOURCE_VP[rk] || 1.25;
    }

    // 5) Nüfus / altyapı
    if (d.population) w *= 1 + Math.min(0.5, d.population / 4e6);
    if (d.infrastructureLevel) w *= 1 + (d.infrastructureLevel || 0) * 0.06;

    // 6) Sahip ülke
    var po = owners();
    var owner = po[pName];
    if (owner && OWNER_VP[owner]) w *= OWNER_VP[owner];
    else if (owner) {
      // orta/küçük devlet: eyalet sayısı proxy
      try {
        var n = 0;
        Object.keys(po).forEach(function (p) { if (po[p] === owner) n++; });
        if (n >= 40) w *= 1.12;
        else if (n >= 15) w *= 1.05;
        else if (n <= 4) w *= 0.9;
      } catch (e) {}
    }

    // Başkent bonusu
    try {
      var g = GS();
      if (g && g.countries && owner && g.countries[owner] && g.countries[owner].capital === pName) {
        w *= 1.55;
      }
    } catch (e) {}

    return Math.max(0.35, Math.min(12, w));
  }

  /** Tek eyalet VP maliyeti (ağırlığa göre, işgalde %50) */
  function provinceVpCostDetailed(pName, attackerIso) {
    var g = GS();
    var budget = (g && g._peaceVP) || { costs: { province: 4, occupiedProvince: 2 } };
    var base = budget.costs.province || 4;
    var w = provinceWeight(pName);
    // ağırlık 1.0 → base; 2.0 → ~1.7x base
    var cost = base * (0.55 + w * 0.45);
    cost = Math.max(1, Math.round(cost));
    var occ = (g && g.occupations) || {};
    var po = owners();
    var atk = attackerIso || (g && g.player);
    if (occ[pName] === atk && po[pName] !== atk) {
      cost = Math.max(1, Math.ceil(cost * 0.5));
    }
    return cost;
  }

  function troopFactor(attackerIso) {
    var g = GS();
    if (!g) return 1;
    var troops = 0;
    try {
      // divisions array or armies
      if (g.divisions) {
        Object.keys(g.divisions).forEach(function (id) {
          var d = g.divisions[id];
          if (d && d.owner === attackerIso) troops += (d.strength || d.manpower || 1000);
        });
      }
      if (g.armies) {
        (g.armies[attackerIso] || []).forEach(function (a) {
          troops += (a.strength || a.size || 500);
        });
      }
      var c = g.countries[attackerIso];
      if (c && c.manpower) troops += Math.min(50000, c.manpower * 0.01);
    } catch (e) {}
    // normalize: 0.8 .. 1.6
    return Math.max(0.8, Math.min(1.6, 0.9 + Math.log10(Math.max(100, troops)) / 10));
  }

  // --- Skill VP budget ---
  window.computeVictoryPoints = function (war, attackerIso, defenderIso) {
    var g = GS();
    var po = owners();
    var occMap = (g && g.occupations) || {};
    var progress = Math.max(0, Math.min(100, (war && war.progress) || 0));
    if (!progress && war && war.ended) progress = 100;

    var occList = Object.keys(occMap).filter(function (p) {
      return po[p] === defenderIso && occMap[p] === attackerIso;
    });
    var totalDef = Object.keys(po).filter(function (p) { return po[p] === defenderIso; }).length || 1;
    var occRatio = occList.length / totalDef;

    // Weighted occupation score
    var occWeight = 0;
    occList.forEach(function (p) { occWeight += provinceWeight(p); });

    var casEnemy = (war && (war.enemyCasualties || war.casualtiesDealt)) || 0;
    var casOwn = (war && war.casualties) || 0;
    var troopF = troopFactor(attackerIso);

    // Skill formula (no random):
    // progress * 0.5 + occupation share * 40 + weighted provinces * 2 + troops + casualties
    var vp = 0;
    vp += progress * 0.55;
    vp += occRatio * 45;
    vp += Math.min(60, occWeight * 2.2);
    vp += Math.min(25, occList.length * 2.5);
    vp += Math.min(20, Math.floor(casEnemy / 4000));
    vp -= Math.min(15, Math.floor(casOwn / 9000));
    vp *= troopF;
    vp = Math.floor(Math.max(8, Math.min(220, vp)));

    return {
      vp: vp,
      costs: {
        province: 4,           // normal claim
        occupiedProvince: 2,   // already occupied = %50
        puppet: 28,
        reparations: 12,
        liberate: 8
      },
      progress: progress,
      occupied: occList.length,
      occRatio: Math.round(occRatio * 100),
      occWeight: Math.round(occWeight * 10) / 10,
      troopFactor: Math.round(troopF * 100) / 100
    };
  };

  // Province claim cost: occupied = half
  window.scProvinceVpCost = function (pName, attackerIso) {
    return provinceVpCostDetailed(pName, attackerIso);
  };
  window.scProvinceWeight = provinceWeight;

  // Hook peace selection to track VP spend
  function patchPeaceSelect() {
    // After modal opens, recompute max claims from VP
    var _open = window.openPeaceConference;
    if (typeof _open === "function" && !_open._occVp) {
      window.openPeaceConference = function (targetIso) {
        var r = _open.apply(this, arguments);
        try {
          var war = (GS().activeWars || []).find(function (w) {
            return w && (w.target === targetIso || w.attacker === targetIso);
          }) || GS()._lastWonWar;
          var budget = window.computeVictoryPoints(war, GS().player, targetIso);
          GS()._peaceVP = budget;
          // max claim by VP / occupied cost (prefer half cost)
          var unit = budget.costs.occupiedProvince || 2;
          var maxByVp = Math.floor(budget.vp / unit);
          if (typeof window.peaceMaxClaim === "number") {
            window.peaceMaxClaim = Math.max(1, Math.min(window.peaceMaxClaim || 99, maxByVp));
          } else {
            window.peaceMaxClaim = Math.max(1, maxByVp);
          }
          // banner refresh
          var el = document.getElementById("peace-vp-val");
          if (el) el.textContent = budget.vp + " VP";
          var sub = document.getElementById("peace-vp-sub");
          if (sub) {
            sub.textContent =
              "İşgal " + budget.occupied + " (" + budget.occRatio + "%) · Asker x" + budget.troopFactor +
              " · İşgal eyaleti " + budget.costs.occupiedProvince + " VP · Diğer " + budget.costs.province + " VP";
          }
        } catch (e) {}
        return r;
      };
      window.openPeaceConference._occVp = true;
    }

    // Wrap showTerritoryDemandModal path if used directly
    var _show = window.showTerritoryDemandModal;
    if (typeof _show === "function" && !_show._occVp) {
      window.showTerritoryDemandModal = function (targetIso) {
        try {
          var war = (GS().activeWars || []).find(function (w) {
            return w && (w.target === targetIso || w.attacker === targetIso);
          }) || GS()._lastWonWar;
          var budget = window.computeVictoryPoints(war, GS().player, targetIso);
          GS()._peaceVP = budget;
          var unit = budget.costs.occupiedProvince || 2;
          window.peaceMaxClaim = Math.max(1, Math.floor(budget.vp / unit));
        } catch (e) {}
        return _show.apply(this, arguments);
      };
      window.showTerritoryDemandModal._occVp = true;
    }
  }

  // Periodic re-paint occupation blend
  setInterval(function () {
    try {
      var g = GS();
      if (g && g.running) paintOccupationBlend();
    } catch (e) {}
  }, 4000);

  function boot() {
    patchPeaceSelect();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 2000);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 100); });
})();
