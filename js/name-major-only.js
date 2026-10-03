
/**
 * v1.9.4 — Sadece büyük ülke isimleri
 * Kural: 5+ eyalet VEYA ≥2 Ankara-boyu eyalet
 * Zoom k >= 2.6 → tüm isimler kapalı
 */
(function SCNameMajorOnly() {
  "use strict";
  console.log("[v1.9.4] isim: büyük ülkeler + zoom gizleme");

  var ZOOM_HIDE = 2.6;
  var ankCache = null;

  function ankaraArea() {
    if (ankCache) return ankCache;
    var ref = 0;
    try {
      document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
        var n = (el.getAttribute("data-name") || "").toLowerCase();
        if (n === "ankara" || n.indexOf("ankara") === 0) {
          try {
            var b = el.getBBox();
            ref = Math.max(ref, b.width * b.height);
          } catch (e) {}
        }
      });
    } catch (e) {}
    if (ref < 1) ref = 45;
    ankCache = ref;
    return ref;
  }

  function filterLayer() {
    try {
      var layer = document.getElementById("sc-country-names");
      if (!layer) return;
      var k = window.__SC_ZOOM_K || 1;
      try {
        if (typeof window.scRefreshCountryNames === "function") {
          /* polish already filters; ensure hide on close zoom */
        }
      } catch (e) {}
      if (k >= ZOOM_HIDE) {
        layer.style.display = "none";
        layer.style.opacity = "0";
      } else {
        layer.style.display = "";
        layer.style.opacity = "1";
      }
    } catch (e) {}
  }

  // After polish draws, strip non-major if any slipped through
  function stripSmall() {
    try {
      var layer = document.getElementById("sc-country-names");
      if (!layer) return;
      var k = window.__SC_ZOOM_K || 1;
      if (k >= ZOOM_HIDE) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        return;
      }
      var po = window.provinceOwners || {};
      var ank = ankaraArea();
      var byIso = {};
      document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
        var name = el.getAttribute("data-name");
        var iso = po[name];
        if (!iso || iso === "NEUTRAL") return;
        if (!byIso[iso]) byIso[iso] = { n: 0, bigN: 0 };
        byIso[iso].n++;
        try {
          var b = el.getBBox();
          if (b.width * b.height >= ank * 0.92) byIso[iso].bigN++;
        } catch (e) {}
      });
      layer.querySelectorAll("text[data-iso]").forEach(function (t) {
        var iso = t.getAttribute("data-iso");
        var a = byIso[iso];
        if (!a || (a.n < 5 && a.bigN < 2)) t.remove();
      });
    } catch (e) {}
  }

  function onZoom() {
    filterLayer();
    stripSmall();
  }

  var _on = window.scOnZoomNames;
  window.scOnZoomNames = function (k) {
    window.__SC_ZOOM_K = k;
    if (typeof _on === "function") {
      try { _on(k); } catch (e) {}
    } else if (typeof window.scRefreshCountryNames === "function") {
      try { window.scRefreshCountryNames(false); } catch (e) {}
    }
    setTimeout(onZoom, 20);
  };

  // Hook zoom if d3 zoom events
  document.addEventListener("wheel", function () { setTimeout(onZoom, 80); }, { passive: true });
  setInterval(onZoom, 1500);

  var _r = window.scRefreshCountryNames;
  if (typeof _r === "function") {
    window.scRefreshCountryNames = function (force) {
      var res = _r.apply(this, arguments);
      setTimeout(onZoom, 30);
      return res;
    };
  }

  window.addEventListener("sc-ready", function () { setTimeout(onZoom, 500); });
})();
