// SC Loader v1.8.6 — resilient, no hang on missing scripts
(function SCLoader() {
  "use strict";
  var CACHE_BUST = "?v=" + Date.now();
  var parts = ["./js/part1.js"+CACHE_BUST, "./js/part2.js"+CACHE_BUST, "./js/part3.js"+CACHE_BUST];
  var MODULES = ["sfx-hard-gate.js", "mods.js", "ui-boot.js", "evolve.js", "province-split-editor.js", "atmosphere.js", "viral-pack.js", "polish-cleanup.js", "occupation-war.js", "stability-fix.js", "mp-fix.js", "colors-names.js", "aoh3-colors-fix.js", "mp-lobby-fix.js", "mp-join-fix.js", "mp-peer-id.js", "capitals-vip.js", "mp-events-sync.js", "name-editor.js", "mp-hud-flag.js", "sfx-quiet.js", "defeat-zero.js", "mp-unified.js", "war-panel.js", "tutorial-60.js", "perf-trim.js", "tick-safety.js", "flags-fix.js", "map-select.js", "europe-borders.js", "viewport-cull.js", "scenario-names.js", "v15-quiet.js", "realism-50.js", "ui-hoi4.js", "hoi4-layer.js", "i18n-tr.js", "names-top-layer.js", "menu-text-lock.js", "sfx-start-mute.js", "capital-start-zoom.js", "boot-watchdog.js", "ui-click-fix.js", "hoi4-ui-v2.js", "hoi4-systems.js", "gfx-map.js", "realism-lite.js", "name-major-only.js", "start-loading-screen.js", "occupation-vp.js", "reject-white-peace.js"];

  function loadText(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("load fail " + url + " " + r.status);
      return r.text();
    });
  }

  function inject(code, id) {
    var s = document.createElement("script");
    if (id) s.id = id;
    s.textContent = code;
    (document.body || document.documentElement).appendChild(s);
  }

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      if (src.indexOf("?") < 0) src = src + CACHE_BUST;
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () {
        console.warn("[loader] skip missing", src);
        resolve(false);
      };
      (document.body || document.documentElement).appendChild(s);
    });
  }

  function loadSeq(list, i) {
    i = i || 0;
    if (i >= list.length) return Promise.resolve();
    return loadScript("./js/" + list[i]).then(function () {
      return loadSeq(list, i + 1);
    });
  }

  function finish() {
    window.__SC_LOADING = false;
    window.__SC_READY = true;
    console.log("[loader] all ready ms", Math.round(performance.now() - t0));
    try { window.dispatchEvent(new Event("sc-ready")); } catch (e) {}
    try {
      document.body.classList.remove("sc-loading");
      var mm = document.getElementById("main-menu-screen");
      var lb = document.getElementById("lobby-screen");
      var lobbyUp = lb && !lb.classList.contains("hidden");
      var ingame = document.body.classList.contains("sc-ingame");
      if (mm && !lobbyUp && !ingame) {
        mm.classList.remove("hidden");
        // clear any leftover inline hide — but do not fight lobby
        if (mm.style.display === "none") mm.style.display = "";
      }
    } catch (e) {}
  }

  window.__SC_LOADING = true;
  var t0 = performance.now();
  setTimeout(function () {
    if (window.__SC_LOADING) {
      console.warn("[loader] watchdog unlock");
      finish();
    }
  }, 8000);

  Promise.all(parts.map(function (p) { return loadText(p); }))
    .then(function (codes) {
      inject(codes.join("\n"), "sc-core-bundle");
      console.log("[loader] core bundle ms", Math.round(performance.now() - t0));
      return loadSeq(MODULES);
    })
    .then(finish)
    .catch(function (e) {
      console.error("[loader] core fail", e);
      loadSeq(MODULES).then(finish).catch(finish);
    });
})();
