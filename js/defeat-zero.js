// Hakimiyet %0 → anında game over
(function SCDefeatZero() {
  "use strict";
  function playerProvCount() {
    try {
      var iso = GameState.player;
      var po = window.provinceOwners || {};
      var n = 0;
      for (var p in po) if (po[p] === iso) n++;
      return n;
    } catch (e) {
      return -1;
    }
  }
  function check() {
    try {
      if (!GameState || GameState.gameOver || !GameState.running) return;
      if (!GameState.player) return;
      // oyun yeni başladıysa 3 sn tolerans
      if (GameState._bootGrace && Date.now() < GameState._bootGrace) return;
      var n = playerProvCount();
      if (n === 0) {
        if (typeof triggerGameOver === "function") triggerGameOver("no_land");
        else if (typeof checkVictoryConditions === "function") checkVictoryConditions();
      }
    } catch (e) {}
  }
  var prev = window.gameTick;
  if (typeof prev === "function" && !prev._defeatZero) {
    window.gameTick = function () {
      var r = prev.apply(this, arguments);
      check();
      return r;
    };
    window.gameTick._defeatZero = true;
  }
  // after startGame set grace
  var sg = window.startGame;
  if (typeof sg === "function" && !sg._defeatZero) {
    window.startGame = async function () {
      var r = await sg.apply(this, arguments);
      GameState._bootGrace = Date.now() + 4000;
      return r;
    };
    window.startGame._defeatZero = true;
  }
  setInterval(check, 5000);
  console.log("[defeat-zero] hakimiyet 0 → game over");
})();
