
(function EuropeBorders() {
  "use strict";
  function isEurope() {
    var id = window.MAP_PACK_ID || "";
    return id.indexOf("Europe") === 0;
  }

  function stylePath(sel) {
    // Screen-pixel borders: visible at any zoom
    sel
      .style("stroke", "#0b1220")
      .style("stroke-opacity", "1")
      .style("stroke-width", "1.15px")
      .style("stroke-linejoin", "round")
      .style("stroke-linecap", "round")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke", "#0b1220")
      .attr("stroke-width", "1.15");
  }

  function applyBorders() {
    if (typeof d3 === "undefined") return;
    if (!isEurope()) return;
    var paths = d3.selectAll("path.country-path");
    if (paths.empty()) return;
    stylePath(paths);
  }

  // Hook refreshMapColors
  function wrapRefresh() {
    var prev = window.refreshMapColors;
    if (prev && prev._euBorderWrapped) return;
    window.refreshMapColors = function () {
      var r;
      if (typeof prev === "function") {
        try { r = prev.apply(this, arguments); } catch (e) {}
      }
      try { applyBorders(); } catch (e) {}
      return r;
    };
    window.refreshMapColors._euBorderWrapped = true;
  }

  // Hook scLoadMapPack
  function wrapLoad() {
    var prev = window.scLoadMapPack;
    if (!prev || prev._euBorderWrapped) return;
    window.scLoadMapPack = function () {
      return prev.apply(this, arguments).then(function (r) {
        setTimeout(applyBorders, 30);
        setTimeout(applyBorders, 200);
        setTimeout(applyBorders, 800);
        return r;
      });
    };
    window.scLoadMapPack._euBorderWrapped = true;
  }

  // Observe DOM for new country-path nodes (viewport cull re-adds them)
  function observe() {
    var svg = document.getElementById("game-map");
    if (!svg || window._euBorderObs) return;
    try {
      var obs = new MutationObserver(function () {
        if (!isEurope()) return;
        // debounce
        if (window._euBorderT) cancelAnimationFrame(window._euBorderT);
        window._euBorderT = requestAnimationFrame(applyBorders);
      });
      obs.observe(svg, { childList: true, subtree: true });
      window._euBorderObs = obs;
    } catch (e) {}
  }

  wrapRefresh();
  wrapLoad();
  observe();
  setTimeout(wrapRefresh, 500);
  setTimeout(wrapLoad, 500);
  setTimeout(observe, 800);
  setTimeout(applyBorders, 1000);
  setTimeout(applyBorders, 2500);
  console.log("[europe-borders] strong non-scaling stroke");
})();
