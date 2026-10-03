
/**
 * v1.9.10 — Başlangıç yükleme + TAM sessizlik (sayaç yetmez)
 */
(function SCStartLoadingScreen() {
  "use strict";
  console.log("[v1.9.10] yükleme ekranı · tam ses kesici");

  var CROSS_URL = "https://i.imgur.com/Rp1ewYX.png";
  var MIN_SHOW_MS = 5000;
  var FADE_MS = 700;
  var POST_MUTE_MS = 2500; // overlay kapandıktan sonra da sessiz

  var overlayOn = false;
  var startedAt = 0;

  function ensureStyle() {
    if (document.getElementById("sc-start-load-style")) return;
    var st = document.createElement("style");
    st.id = "sc-start-load-style";
    st.textContent =
      "#sc-start-load{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
      "background:radial-gradient(ellipse at 50% 40%,#0e1a2a 0%,#070d16 55%,#04080f 100%);" +
      "opacity:1;transition:opacity " + FADE_MS + "ms ease;pointer-events:all;}" +
      "#sc-start-load.sc-hide{opacity:0;pointer-events:none;}" +
      "#sc-start-load .box{text-align:center;}" +
      "#sc-start-load .cross-wrap{width:96px;height:96px;margin:0 auto 18px;}" +
      "#sc-start-load .cross{width:96px;height:96px;object-fit:contain;animation:sc-cross-spin 3.2s linear infinite;" +
      "filter:drop-shadow(0 0 12px rgba(201,162,39,0.35));}" +
      "@keyframes sc-cross-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}" +
      "#sc-start-load .label{font-family:Georgia,serif;letter-spacing:0.22em;text-transform:uppercase;font-size:12px;color:#c9a227;font-weight:700;}" +
      "#sc-start-load .sub{margin-top:8px;font-size:11px;color:#7a8799;}";
    document.head.appendChild(st);
  }

  function muteOn() {
    window.__SC_SFX_MUTED = true;
    window.__SC_BLIP_MUTE = true;
    window.__SC_START_MUTE_UNTIL = Date.now() + 60000;
    try { if (typeof window.scHardMute === "function") window.scHardMute(true); } catch (e) {}
    try { if (typeof window.scMuteSfxFor === "function") window.scMuteSfxFor(20000); } catch (e) {}
    try {
      if (window.sfx && sfx.ctx && sfx.ctx.state === "running") sfx.ctx.suspend();
    } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  function muteOffSoon() {
    window.__SC_START_MUTE_UNTIL = Date.now() + POST_MUTE_MS;
    setTimeout(function () {
      window.__SC_SFX_MUTED = false;
      window.__SC_BLIP_MUTE = false;
      try { if (typeof window.scHardMute === "function") window.scHardMute(false); } catch (e) {}
      try {
        if (window.sfx && sfx.ctx && sfx.ctx.state === "suspended") sfx.ctx.resume();
      } catch (e) {}
    }, POST_MUTE_MS);
  }

  function showOverlay() {
    ensureStyle();
    muteOn();
    var el = document.getElementById("sc-start-load");
    if (!el) {
      el = document.createElement("div");
      el.id = "sc-start-load";
      el.innerHTML =
        '<div class="box">' +
        '  <div class="cross-wrap"><img class="cross" src="' + CROSS_URL + '" alt="" draggable="false"/></div>' +
        '  <div class="label">Yükleniyor</div>' +
        '  <div class="sub">Komuta merkezi hazırlanıyor…</div>' +
        "</div>";
      document.body.appendChild(el);
    }
    el.classList.remove("sc-hide");
    el.style.display = "flex";
    overlayOn = true;
    startedAt = Date.now();
    // pulse mute while visible
    var iv = setInterval(function () {
      if (!overlayOn) { clearInterval(iv); return; }
      muteOn();
    }, 300);
  }

  function hideOverlay(done) {
    var el = document.getElementById("sc-start-load");
    if (!el) {
      overlayOn = false;
      muteOffSoon();
      if (done) done();
      return;
    }
    el.classList.add("sc-hide");
    setTimeout(function () {
      try { el.style.display = "none"; } catch (e) {}
      overlayOn = false;
      muteOffSoon();
      if (done) done();
    }, FADE_MS + 30);
  }

  function wrapStart(name) {
    var prev = window[name];
    if (typeof prev !== "function" || prev._scLoadWrap) return;
    window[name] = async function () {
      showOverlay();
      var args = arguments;
      var self = this;
      var result, err;
      try {
        result = await prev.apply(self, args);
      } catch (e) {
        err = e;
      }
      var left = MIN_SHOW_MS - (Date.now() - startedAt);
      if (left < 0) left = 0;
      await new Promise(function (r) { setTimeout(r, left); });
      await new Promise(function (r) { hideOverlay(function () { r(); }); });
      if (err) throw err;
      return result;
    };
    window[name]._scLoadWrap = true;
  }

  function boot() {
    muteOn(); // page load quiet
    ["startGame", "startGameSafe"].forEach(wrapStart);
    document.querySelectorAll("#lobby-screen button").forEach(function (btn) {
      var oc = btn.getAttribute("onclick") || "";
      if (/startGame/i.test(oc) && !btn._scLoad) {
        btn._scLoad = true;
        btn.addEventListener("click", function () { showOverlay(); }, true);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 300);
  setTimeout(boot, 1200);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 50); });
})();
