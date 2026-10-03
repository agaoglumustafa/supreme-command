
(function SCSfxStartMute() {
  "use strict";
  // DUT DUT DUT = playBlip/playTone spam on enter → mute window + hard rate limit
  var muteUntil = Date.now() + 10000; // 10s after this script (extend on start)
  var lastBlip = 0;
  var BLIP_MS = 450;

  function wrapSfx() {
    var s = window.sfx;
    if (!s || s._startMute) return;
    s._startMute = true;
    ["playBlip","playClick","playTone","playMessage","playBuild","playVictory","playAlert","playSiren"].forEach(function (fn) {
      if (typeof s[fn] !== "function") return;
      var prev = s[fn].bind(s);
      s[fn] = function () {
        var now = Date.now();
        if (now < muteUntil) return; // silent during boot / start
        if (fn === "playBlip" || fn === "playClick" || fn === "playTone") {
          if (now - lastBlip < BLIP_MS) return;
          lastBlip = now;
        }
        try { return prev.apply(this, arguments); } catch (e) {}
      };
    });
  }

  window.scMuteSfxFor = function (ms) {
    muteUntil = Math.max(muteUntil, Date.now() + (ms || 8000));
  };

  wrapSfx();
  [50, 200, 500, 1000, 2000, 4000].forEach(function (t) {
    setTimeout(wrapSfx, t);
  });

  // On startGame: mute again
  function hookStart() {
    var names = ["startGame", "startGameSafe"];
    names.forEach(function (n) {
      var fn = window[n];
      if (typeof fn !== "function" || fn._sfxMute) return;
      window[n] = function () {
        muteUntil = Date.now() + 12000;
        wrapSfx();
        return fn.apply(this, arguments);
      };
      window[n]._sfxMute = true;
    });
  }
  hookStart();
  setInterval(hookStart, 1000);
  console.log("[sfx-start-mute] giriş sesi kapalı · blip rate-limit");
})();
