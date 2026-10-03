
/**
 * v1.9.3 — hafif gerçekçilik
 * Genişleme yavaş, savaş yıpratıcı, barışta toparlanma
 */
(function SCRealismLite() {
  "use strict";
  console.log("[v1.9.3] gerçekçilik ayarları");

  function GS() { return window.GameState || null; }

  // Reduce AI reckless expansion if hook exists
  try {
    if (window.AI_EXPAND_CHANCE == null) window.AI_EXPAND_CHANCE = 0.12;
    else window.AI_EXPAND_CHANCE = Math.min(window.AI_EXPAND_CHANCE, 0.15);
  } catch (e) {}

  // Soft attrition reminder via combat factor when low supply
  var _cf = window.scHoiCombatFactor || window.scCombatFactor;
  window.scHoiCombatFactor = function (iso) {
    var f = 1;
    try { if (typeof _cf === "function") f = _cf(iso) || 1; } catch (e) {}
    var g = GS();
    if (!g || !g.hoi || iso !== g.player) return f;
    var h = g.hoi;
    // low stability hurts
    if (h.stability < 35) f *= 0.92;
    if (h.warSupport < 25) f *= 0.94;
    // war economy helps slightly
    if (h.laws && h.laws.economy === "war") f *= 1.04;
    if (h.laws && h.laws.economy === "total") f *= 1.08;
    return Math.max(0.65, Math.min(1.4, f));
  };

  // Occupation costs stability soft
  var lastDay = null;
  function tick() {
    var g = GS();
    if (!g || !g.running || !g.hoi || !g.date) return;
    var k = g.date.getFullYear() + "-" + g.date.getMonth() + "-" + g.date.getDate();
    if (k === lastDay) return;
    lastDay = k;
    try {
      var occ = 0;
      if (g.occupation) {
        Object.keys(g.occupation).forEach(function (p) {
          if (g.occupation[p] && g.occupation[p].by === g.player) occ++;
        });
      }
      if (occ > 8) {
        g.hoi.stability = Math.max(15, (g.hoi.stability || 50) - Math.min(0.15, occ * 0.008));
      }
    } catch (e) {}
  }

  var _gt = window.gameTick;
  if (typeof _gt === "function") {
    window.gameTick = function () {
      var r = _gt.apply(this, arguments);
      try { tick(); } catch (e) {}
      return r;
    };
  }
})();
