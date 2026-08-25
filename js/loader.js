// Loads part1+part2+part3 as one script (shared scope), then mods + ui-boot
(function SCLoader() {
  "use strict";
  var parts = ["./js/part1.js", "./js/part2.js", "./js/part3.js"];
  var base = document.currentScript && document.currentScript.src
    ? document.currentScript.src.replace(/\/js\/loader\.js.*$/, "/")
    : "./";

  function loadText(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) {
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
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("script " + src)); };
      (document.body || document.documentElement).appendChild(s);
    });
  }

  window.__SC_LOADING = true;
  var t0 = performance.now();
  Promise.all(parts.map(function (p) { return loadText(p); }))
    .then(function (codes) {
      inject(codes.join("\n"), "sc-core-bundle");
      console.log("[loader] core bundle ms", Math.round(performance.now() - t0));
      return loadScript("./js/mods.js");
    })
    .then(function () { return loadScript("./js/ui-boot.js").then(function(){ return loadScript("./js/evolve.js").then(function(){ return loadScript("./js/province-split-editor.js").then(function(){ return loadScript("./js/atmosphere.js").then(function(){ return loadScript("./js/viral-pack.js").then(function(){ return loadScript("./js/polish-cleanup.js").then(function(){ return loadScript("./js/occupation-war.js").then(function(){ return loadScript("./js/stability-fix.js").then(function(){ return loadScript("./js/mp-fix.js").then(function(){ return loadScript("./js/colors-names.js").then(function(){ return loadScript("./js/mp-lobby-fix.js").then(function(){ return loadScript("./js/mp-join-fix.js").then(function(){ return loadScript("./js/mp-peer-id.js").then(function(){ return loadScript("./js/capitals-vip.js").then(function(){ return loadScript("./js/mp-events-sync.js").then(function(){ return loadScript("./js/name-editor.js").then(function(){ return loadScript("./js/mp-hud-flag.js").then(function(){ return loadScript("./js/sfx-quiet.js").then(function(){ return loadScript("./js/defeat-zero.js").then(function(){ return loadScript("./js/mp-unified.js").then(function(){ return loadScript("./js/war-panel.js").then(function(){ return loadScript("./js/tutorial-60.js").then(function(){ return loadScript("./js/perf-trim.js").then(function(){ return loadScript("./js/tick-safety.js").then(function(){ return loadScript("./js/flags-fix.js"); }).then(function(){ return loadScript("./js/scenario-names.js"); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); })
    .then(function () {
      window.__SC_LOADING = false;
      window.__SC_READY = true;
      console.log("[loader] all ready ms", Math.round(performance.now() - t0));
      try { window.dispatchEvent(new Event("sc-ready")); } catch (e) {}
    })
    .catch(function (e) {
      console.error("[loader]", e);
      // fallback: monolithic script.js if present
      loadScript("./script.js").then(function () { return loadScript("./js/ui-boot.js").then(function(){ return loadScript("./js/evolve.js").then(function(){ return loadScript("./js/province-split-editor.js").then(function(){ return loadScript("./js/atmosphere.js").then(function(){ return loadScript("./js/viral-pack.js").then(function(){ return loadScript("./js/polish-cleanup.js").then(function(){ return loadScript("./js/occupation-war.js").then(function(){ return loadScript("./js/stability-fix.js").then(function(){ return loadScript("./js/mp-fix.js").then(function(){ return loadScript("./js/colors-names.js").then(function(){ return loadScript("./js/mp-lobby-fix.js").then(function(){ return loadScript("./js/mp-join-fix.js").then(function(){ return loadScript("./js/mp-peer-id.js").then(function(){ return loadScript("./js/capitals-vip.js").then(function(){ return loadScript("./js/mp-events-sync.js").then(function(){ return loadScript("./js/name-editor.js").then(function(){ return loadScript("./js/mp-hud-flag.js").then(function(){ return loadScript("./js/sfx-quiet.js").then(function(){ return loadScript("./js/defeat-zero.js").then(function(){ return loadScript("./js/mp-unified.js").then(function(){ return loadScript("./js/war-panel.js").then(function(){ return loadScript("./js/tutorial-60.js").then(function(){ return loadScript("./js/perf-trim.js").then(function(){ return loadScript("./js/tick-safety.js").then(function(){ return loadScript("./js/flags-fix.js"); }).then(function(){ return loadScript("./js/scenario-names.js"); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); }); });
    });
})();
