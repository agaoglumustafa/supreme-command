// ===== Occupation vs Annex + Peace triggers =====
(function SCOccupationWar() {
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
      if (typeof window.log === "function") window.log(msg, cls || "text-amber-300");
    } catch (e) {}
  }

  var lastPeaceCheck = {};

  function capitalOf(iso) {
    var g = GS();
    if (!g) return null;
    var c = g.countries[iso];
    if (c && c.capital) return c.capital;
    try {
      if (typeof getCountryCapital === "function") return getCountryCapital(iso, g.scenarioId || "modern");
    } catch (e) {}
    return null;
  }

  function occupiedByPlayer(legalOwner) {
    var g = GS();
    var po = owners();
    var occ = (g && g.occupations) || {};
    var list = [];
    Object.keys(po).forEach(function (p) {
      if (po[p] === legalOwner && occ[p] === g.player) list.push(p);
    });
    return list;
  }

  function totalLegal(iso) {
    var po = owners();
    return Object.keys(po).filter(function (p) { return po[p] === iso; }).length;
  }

  function checkPeaceTriggers() {
    var g = GS();
    if (!g || !g.running || window.peaceMode) return;
    var wars = g.activeWars || [];
    wars.forEach(function (w) {
      if (!w || !w.target) return;
      var atk = w.attacker || g.player;
      if (atk !== g.player) return; // only when player is attacker for now
      var target = w.target;
      var key = target;
      var now = Date.now();
      if (lastPeaceCheck[key] && now - lastPeaceCheck[key] < 8000) return;

      var occList = occupiedByPlayer(target);
      var total = totalLegal(target);
      if (total <= 0) return;

      var cap = capitalOf(target);
      var capTaken = false;
      if (cap) {
        var po = owners();
        var occ = g.occupations || {};
        // capital still legally theirs but occupied by player
        if (po[cap] === target && occ[cap] === g.player) capTaken = true;
        // or capital already annexed somehow
        if (po[cap] === g.player) capTaken = true;
      }

      var fullOcc = occList.length >= total && total > 0;
      var progressForce = (w.progress || 0) >= 100;

      if (capTaken || fullOcc || progressForce) {
        lastPeaceCheck[key] = now;
        slog(
          fullOcc
            ? "🏳️ Ülke fiilen işgal altında — barış masası"
            : capTaken
            ? "🏛️ Başkent düştü — barış masası"
            : "🏳️ Cephe çöktü — barış masası",
          "text-emerald-300 font-bold"
        );
        try {
          if (typeof openVictoryDemandModal === "function") {
            openVictoryDemandModal(target);
          } else if (typeof window.openVictoryDemandModal === "function") {
            window.openVictoryDemandModal(target);
          } else {
            // fallback resolve
            var idx = wars.indexOf(w);
            if (idx >= 0 && typeof resolveWar === "function") resolveWar(idx, true);
          }
        } catch (e) {
          console.warn("[peace trigger]", e);
        }
      }
    });
  }

  // ensure confirmTerritoryClaims annexes + clears occupation (if core does)
  function ensureAnnexOnClaim() {
    try {
      if (typeof window.confirmTerritoryClaims === "function" && !window.confirmTerritoryClaims._occFix) {
        var prev = window.confirmTerritoryClaims;
        window.confirmTerritoryClaims = function (targetIso, maxClaim, claimLevel) {
          var r = prev.apply(this, arguments);
          try {
            var g = GS();
            var po = owners();
            if (g && g.occupations) {
              Object.keys(g.occupations).forEach(function (p) {
                if (po[p] === g.player) delete g.occupations[p];
              });
            }
            if (typeof refreshMapColors === "function") refreshMapColors();
            if (typeof window.scRefreshCountryNames === "function") window.scRefreshCountryNames();
          } catch (e) {}
          return r;
        };
        window.confirmTerritoryClaims._occFix = true;
      }
    } catch (e) {}
  }

  // Hook gameTick
  function hook() {
    try {
      if (window.gameTick && !window.gameTick._occWar) {
        var gt = window.gameTick;
        window.gameTick = function () {
          var r = gt.apply(this, arguments);
          try {
            checkPeaceTriggers();
            ensureAnnexOnClaim();
          } catch (e) {}
          return r;
        };
        window.gameTick._occWar = true;
      }
    } catch (e) {}
  }

  function boot() {
    hook();
    setInterval(hook, 10000);
    setInterval(function () {
      try { checkPeaceTriggers(); } catch (e) {}
    }, 12000);
    console.log("[occupation-war] blend · border-only · peace on capital/full occ");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
