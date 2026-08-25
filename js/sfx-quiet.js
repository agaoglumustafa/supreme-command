// Quiet SFX — hard cooldowns (global + per-type)
(function SCSFXQuiet() {
  "use strict";
  var GLOBAL_GAP = 350;
  var lastGlobal = 0;
  var GAPS = {
    playVictory: 5000,
    playAlert: 6000,
    playSiren: 8000,
    playBlip: 900,
    playMessage: 2500,
    playBuild: 1200,
    playClick: 200,
    playTone: 80
  };

  function wrap() {
    var s = window.sfx;
    if (!s) return;
    if (s._quietHard) return;
    s._quietHard = true;
    Object.keys(GAPS).forEach(function (fn) {
      if (typeof s[fn] !== "function") return;
      var prev = s[fn].bind(s);
      var last = 0;
      var gap = GAPS[fn];
      s[fn] = function () {
        var n = Date.now();
        if (n - lastGlobal < GLOBAL_GAP) return;
        if (n - last < gap) return;
        last = n;
        lastGlobal = n;
        try {
          return prev.apply(this, arguments);
        } catch (e) {}
      };
    });
    try {
      if (window.speechSynthesis) {
        var sp = window.speechSynthesis.speak.bind(window.speechSynthesis);
        var lastSpeak = 0;
        window.speechSynthesis.speak = function (u) {
          var n = Date.now();
          if (n - lastSpeak < 4000) return;
          lastSpeak = n;
          try {
            window.speechSynthesis.cancel();
          } catch (e) {}
          return sp(u);
        };
      }
    } catch (e) {}
    console.log("[sfx-quiet] hard cooldowns");
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(wrap, 80);
    });
  else setTimeout(wrap, 80);
  window.addEventListener("sc-ready", function () {
    setTimeout(wrap, 40);
    setTimeout(wrap, 1500);
  });
})();
