
(function SCUIClickFix() {
  "use strict";
  console.log("[ui-click] menü / lobby tıklama onarımı");

  function bind() {
    try {
      // Main menu buttons (by known handlers)
      var map = [
        { sel: "#mm-continue", fn: "mainMenuContinue" },
        { sel: 'button[onclick*="mainMenuNewGame"]', fn: "mainMenuNewGame" },
        { sel: 'button[onclick*="mainMenuMultiplayer"]', fn: "mainMenuMultiplayer" },
        { sel: 'button[onclick*="mainMenuLoad"]', fn: "mainMenuLoad" },
        { sel: 'button[onclick*="mainMenuCredits"]', fn: "mainMenuCredits" },
        { sel: "#mm-quick-play", fn: null }
      ];
      map.forEach(function (item) {
        document.querySelectorAll(item.sel).forEach(function (btn) {
          if (btn._scClickFix) return;
          btn._scClickFix = true;
          btn.style.pointerEvents = "auto";
          btn.style.cursor = "pointer";
          if (item.fn && typeof window[item.fn] === "function") {
            btn.addEventListener("click", function (ev) {
              try { window[item.fn](); } catch (e) { console.warn(e); }
            });
          }
        });
      });

      // Quick play
      var qp = document.getElementById("mm-quick-play");
      if (qp && !qp._scQp) {
        qp._scQp = true;
        qp.addEventListener("click", function () {
          var fn = window.scForcePlay || window.scQuickPlay || window.mainMenuNewGame;
          if (typeof fn === "function") fn();
        });
      }

      // Lobby start
      var startBtn = document.querySelector("#lobby-screen button[onclick*='startGame'], #lobby-start, button[onclick*='startGameSafe']");
      document.querySelectorAll("#lobby-screen button").forEach(function (b) {
        b.style.pointerEvents = "auto";
        b.style.cursor = "pointer";
      });
      document.querySelectorAll("#lobby-screen select").forEach(function (s) {
        s.style.pointerEvents = "auto";
        s.disabled = false;
      });

      // Settings / about
      document.querySelectorAll("button").forEach(function (b) {
        if (b.closest("#main-menu-screen") || b.closest("#lobby-screen")) {
          b.style.pointerEvents = "auto";
        }
      });
    } catch (e) {
      console.warn("[ui-click]", e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
  setTimeout(bind, 300);
  setTimeout(bind, 1200);
  setTimeout(bind, 3000);
  window.addEventListener("sc-ready", function () { setTimeout(bind, 100); });
})();
