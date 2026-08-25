// HUD flag follows selected MP country
(function SCMPHudFlag() {
  "use strict";
  function applyFlag() {
    try {
      var iso = GameState && GameState.player;
      if (!iso) return;
      var fl = document.getElementById("hud-flag");
      if (!fl) return;
      var url = (typeof getFlagUrl === "function")
        ? getFlagUrl(iso)
        : ("https://flagcdn.com/w40/" + ((GameState.countries[iso] && GameState.countries[iso].flag) || iso.toLowerCase()) + ".png");
      if (url) fl.src = url;
      var hn = document.getElementById("hud-country-name");
      if (hn && GameState.countries[iso]) hn.textContent = GameState.countries[iso].name || iso;
      var hi = document.getElementById("hud-country-ideology");
      if (hi && GameState.countries[iso]) hi.textContent = GameState.countries[iso].ideology || "";
    } catch (e) {}
  }
  function syncPlayerFromMP() {
    try {
      var mp = GameState.mp;
      if (!mp || !mp.active) return;
      var iso = mp.country;
      if (mp.players && mp.peerId && mp.players[mp.peerId] && mp.players[mp.peerId].country)
        iso = mp.players[mp.peerId].country;
      if (iso) {
        GameState.player = iso;
        mp.country = iso;
      }
      applyFlag();
      if (typeof updateHUD === "function") updateHUD();
    } catch (e) {}
  }
  var prev = window.updateHUD;
  if (typeof prev === "function" && !prev._mpFlag) {
    window.updateHUD = function () {
      var r = prev.apply(this, arguments);
      applyFlag();
      return r;
    };
    window.updateHUD._mpFlag = true;
  }
  setInterval(function () {
    try {
      if (GameState && GameState.mp && GameState.mp.active) syncPlayerFromMP();
    } catch (e) {}
  }, 2500);
  window.addEventListener("sc-ready", function () {
    setTimeout(syncPlayerFromMP, 500);
  });
  console.log("[mp-hud-flag] player flag sync");
})();
