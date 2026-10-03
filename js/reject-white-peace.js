
/**
 * v1.9.9 — Beyaz barış reddi
 * Masada "Beyaz Barışı Reddet" → savaş sürer
 */
(function SCRejectWhitePeace() {
  "use strict";
  console.log("[v1.9.9] beyaz barış reddi tuşu");

  if (typeof window.rejectWhitePeace !== "function") {
    window.rejectWhitePeace = function (targetIso) {
      window.peaceMode = false;
      window.peaceTargetIso = null;
      try { window.peaceSelected = new Set(); } catch (e) {}
      var modal = document.getElementById("territory-demand-modal");
      if (modal) modal.remove();
      var g = window.GameState;
      if (g) {
        if (!g._peaceRejectUntil) g._peaceRejectUntil = {};
        g._peaceRejectUntil[targetIso] = Date.now() + 180000;
        (g.activeWars || []).forEach(function (w) {
          if (w && w.target === targetIso) {
            w.peaceRejected = true;
            if ((w.progress || 0) >= 100) w.progress = 90;
          }
        });
      }
      try {
        if (typeof log === "function") log("⛔ Beyaz barış reddedildi — savaş devam", "text-red-400 font-bold");
      } catch (e) {}
    };
  }

  // Ensure button exists if modal already open / reinjected
  function ensureBtn() {
    var modal = document.getElementById("territory-demand-modal");
    if (!modal || document.getElementById("sc-reject-white-peace")) return;
    var target = window.peaceTargetIso;
    if (!target) return;
    var btn = document.createElement("button");
    btn.id = "sc-reject-white-peace";
    btn.type = "button";
    btn.className = "w-full py-3 mt-2 bg-red-900 hover:bg-red-800 border-2 border-red-500 rounded font-black text-white text-xs";
    btn.textContent = "⛔ Beyaz Barışı Reddet — Savaş Devam Etsin";
    btn.onclick = function () { window.rejectWhitePeace(target); };
    var box = modal.querySelector(".space-y-2") || modal.querySelector("div");
    if (box) box.appendChild(btn);
    else modal.appendChild(btn);
  }

  setInterval(ensureBtn, 1500);

  // Block resolveWar(victory) if user just rejected and no real occupation
  var _rw = window.resolveWar;
  if (typeof _rw === "function" && !_rw._rejectWp) {
    window.resolveWar = function (index, victory) {
      try {
        var g = window.GameState;
        var war = g && g.activeWars && g.activeWars[index];
        if (victory && war && war.peaceRejected) {
          var occN = Object.keys(g.occupations || {}).filter(function (p) {
            return (window.provinceOwners || {})[p] === war.target && g.occupations[p] === g.player;
          }).length;
          if (occN < 1 && (war.progress || 0) < 99) {
            if (typeof log === "function") log("Barış reddedildi — zafer henüz yok, savaş sürüyor.", "text-amber-400");
            return;
          }
        }
      } catch (e) {}
      return _rw.apply(this, arguments);
    };
    window.resolveWar._rejectWp = true;
  }
})();
