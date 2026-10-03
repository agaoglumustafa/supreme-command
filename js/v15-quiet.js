
(function SCV15Quiet() {
  "use strict";
  console.log("%c[v1.7.15] QUIET BUILD — sfx/hour-one/progression killed", "color:#0f0;font-size:16px;font-weight:bold");

  function muteSfx() {
    try {
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        window.speechSynthesis.speak = function () {};
      }
    } catch (e) {}
    try {
      var s = window.sfx;
      if (s) {
        ["playVictory","playAlert","playSiren","playBlip","playMessage","playBuild","playClick","playTone"].forEach(function (fn) {
          s[fn] = function () {};
        });
      }
    } catch (e) {}
    try {
      if (window.MusicPlayer) {
        if (MusicPlayer.audio) { try { MusicPlayer.audio.pause(); MusicPlayer.audio.volume = 0; } catch (e) {} }
        if (typeof MusicPlayer.play === "function") MusicPlayer.play = function () {};
      }
    } catch (e) {}
  }

  function killHourOne() {
    try {
      if (window.GameState) {
        window.GameState.hourOne = null;
        if (window.GameState.settings) window.GameState.settings.sfx = false;
      }
    } catch (e) {}
    // neuter any leftover interval callbacks by blanking common hooks
    try { window.hourPulse = function () {}; } catch (e) {}
    try { window.progressionPulse = function () {}; } catch (e) {}
  }

  muteSfx();
  killHourOne();
  var n = 0;
  var iv = setInterval(function () {
    muteSfx();
    killHourOne();
    if (++n > 40) clearInterval(iv); // 20s
  }, 500);

  // Wrap pushInboxMessage permanently
  function wrapInbox() {
    if (typeof window.pushInboxMessage !== "function") return;
    if (window.pushInboxMessage._v15) return;
    var prev = window.pushInboxMessage;
    window.pushInboxMessage = function (msg) {
      try {
        if (window.GameState && GameState.settings) GameState.settings.sfx = false;
      } catch (e) {}
      return prev.apply(this, arguments);
    };
    window.pushInboxMessage._v15 = true;
  }
  wrapInbox();
  setInterval(wrapInbox, 2000);

  // Stop capitals re-assign spam: only allow once per 10s
  try {
    if (window.scAssignCapitals && !window.scAssignCapitals._v15) {
      var ac = window.scAssignCapitals;
      var last = 0;
      window.scAssignCapitals = function () {
        var now = Date.now();
        if (now - last < 10000) return;
        last = now;
        return ac.apply(this, arguments);
      };
      window.scAssignCapitals._v15 = true;
    }
  } catch (e) {}
})();
