
(function SCNamesTopLayer() {
  "use strict";
  console.log("[names-top] ülke isimleri eyalet katmanının üstünde");

  function mapZoomGroup() {
    var svg = document.querySelector("#game-map");
    if (!svg) return null;
    if (window.__SC_MAP_G && window.__SC_MAP_G.isConnected) return window.__SC_MAP_G;
    var g = svg.querySelector(":scope > g");
    return g || svg;
  }

  function promote() {
    try {
      var parent = mapZoomGroup();
      if (!parent) return;
      var layer = document.getElementById("sc-country-names");
      if (!layer) return;
      // SVG paint order = DOM order; last = top
      if (parent.lastElementChild !== layer) {
        parent.appendChild(layer);
      }
      layer.setAttribute("pointer-events", "none");
      layer.style.pointerEvents = "none";
      // slight lift so text isn't buried under strokes
      layer.querySelectorAll("text").forEach(function (t) {
        t.style.pointerEvents = "none";
        // ensure readable stroke/fill if missing
        if (!t.getAttribute("stroke")) {
          t.setAttribute("stroke", "rgba(8,12,20,0.85)");
          t.setAttribute("stroke-width", "2.2");
          t.setAttribute("paint-order", "stroke fill");
        }
        if (!t.style.fontWeight) t.style.fontWeight = "800";
      });
      // capitals / markers under names if present
      var caps = document.getElementById("sc-capitals") || document.querySelector("g.sc-capitals");
      if (caps && caps.parentNode === parent) {
        // order: provinces … capitals … names
        try {
          parent.insertBefore(caps, layer);
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Hook paint / cull / zoom
  function hook(name) {
    var fn = window[name];
    if (typeof fn !== "function" || fn._namesTop) return;
    window[name] = function () {
      var r;
      try { r = fn.apply(this, arguments); } catch (e) { throw e; }
      try { promote(); } catch (e) {}
      return r;
    };
    window[name]._namesTop = true;
  }

  function boot() {
    promote();
    ["refreshMapColors", "scPaintPolitical", "refreshCountryNames"].forEach(hook);
    // if polish exposes refresh via window
    if (typeof window.refreshCountryNames === "function") hook("refreshCountryNames");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setInterval(promote, 2000);
  window.addEventListener("sc-ready", function () { setTimeout(promote, 100); setTimeout(promote, 800); });
  // after zoom
  document.addEventListener("wheel", function () { setTimeout(promote, 50); }, { passive: true });
})();
