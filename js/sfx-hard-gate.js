
/**
 * v1.9.10 — Sert ses kapısı
 * Yükleme / start sırasında TÜM sfx + AudioContext susturulur.
 * Sayım yetmez; bayrak + ctx.suspend.
 */
(function SCSfxHardGate() {
  "use strict";
  console.log("[v1.9.10] sert ses kapısı");

  window.__SC_SFX_MUTED = true; // boot: sessiz
  window.__SC_BLIP_MUTE = true;

  function suspendCtx() {
    try {
      if (window.sfx && sfx.ctx && sfx.ctx.state === "running") {
        sfx.ctx.suspend();
      }
    } catch (e) {}
    try {
      if (window.AudioContext || window.webkitAudioContext) {
        /* cannot suspend unknown ctxs easily */
      }
    } catch (e) {}
  }

  function resumeCtx() {
    try {
      if (window.sfx && sfx.ctx && sfx.ctx.state === "suspended") {
        sfx.ctx.resume();
      }
    } catch (e) {}
  }

  window.scHardMute = function (on) {
    window.__SC_SFX_MUTED = !!on;
    window.__SC_BLIP_MUTE = !!on;
    if (on) suspendCtx();
    else resumeCtx();
  };

  window.scHardMuteFor = function (ms) {
    window.scHardMute(true);
    setTimeout(function () {
      // only unmute if loading overlay gone
      if (!document.getElementById("sc-start-load") ||
          document.getElementById("sc-start-load").classList.contains("sc-hide") ||
          document.getElementById("sc-start-load").style.display === "none") {
        window.scHardMute(false);
      }
    }, ms || 8000);
  };

  function wrapObject(obj) {
    if (!obj || obj.__hardGate) return;
    obj.__hardGate = true;
    ["playBlip","playClick","playTone","playMessage","playBuild","playVictory","playAlert","playSiren","playUi","playSoft"].forEach(function (fn) {
      if (typeof obj[fn] !== "function") return;
      var prev = obj[fn].bind(obj);
      obj[fn] = function () {
        if (window.__SC_SFX_MUTED || window.__SC_BLIP_MUTE) return;
        // global rate limit for blip family — no stack
        if (fn === "playBlip" || fn === "playClick" || fn === "playTone") {
          var now = Date.now();
          if (window.__SC_LAST_BLIP && now - window.__SC_LAST_BLIP < 500) return;
          window.__SC_LAST_BLIP = now;
        }
        try { return prev.apply(this, arguments); } catch (e) {}
      };
    });
  }

  function wrapAll() {
    try { wrapObject(window.sfx); } catch (e) {}
    ["playBlip","playClick","playTone","playMessage","playBuild","playVictory","playAlert","playSiren"].forEach(function (fn) {
      if (typeof window[fn] !== "function") return;
      if (window[fn].__hardGate) return;
      var prev = window[fn];
      window[fn] = function () {
        if (window.__SC_SFX_MUTED || window.__SC_BLIP_MUTE) return;
        return prev.apply(this, arguments);
      };
      window[fn].__hardGate = true;
    });
    // Oscillator factory intercept — last resort for stacked AVR
    try {
      if (window.sfx && sfx.ctx && !sfx.ctx.__hardGateOsc) {
        var ctx = sfx.ctx;
        ctx.__hardGateOsc = true;
        var co = ctx.createOscillator.bind(ctx);
        ctx.createOscillator = function () {
          if (window.__SC_SFX_MUTED || window.__SC_BLIP_MUTE) {
            // dummy that no-ops
            var fake = co();
            try {
              fake.start = function () {};
              fake.stop = function () {};
              fake.connect = function () { return fake; };
            } catch (e) {}
            return fake;
          }
          return co();
        };
      }
    } catch (e) {}
  }

  wrapAll();
  [0, 50, 100, 200, 500, 1000, 2000, 4000, 8000].forEach(function (t) {
    setTimeout(wrapAll, t);
  });
  setInterval(wrapAll, 2000);

  // stay muted until game has been running 6s after start flag
  window.__SC_START_MUTE_UNTIL = Date.now() + 15000;
  setInterval(function () {
    if (Date.now() < (window.__SC_START_MUTE_UNTIL || 0)) {
      window.__SC_SFX_MUTED = true;
      window.__SC_BLIP_MUTE = true;
      suspendCtx();
    }
  }, 200);
})();
