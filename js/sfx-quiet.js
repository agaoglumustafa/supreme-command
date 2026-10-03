
(function SCSFXQuiet() {
  "use strict";
  function muteAll() {
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
      if (window.MusicPlayer && MusicPlayer.audio) {
        MusicPlayer.audio.pause();
        MusicPlayer.audio.volume = 0;
      }
    } catch (e) {}
  }
  muteAll();
  [50, 200, 500, 1000, 2000, 5000].forEach(function (t) { setTimeout(muteAll, t); });
  setInterval(muteAll, 3000);
  console.log("[sfx-quiet] ALL SFX MUTED v15");
})();
