
(function SCCapitalStartZoom() {
  "use strict";
  console.log("[capital-zoom] oyun başkentte açılsın");

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }

  function capitalPoint(iso) {
    var g = GS();
    if (!g) return null;
    var capName = null;
    try {
      if (g.capitals && g.capitals[iso]) capName = g.capitals[iso];
      else if (g.countries && g.countries[iso] && g.countries[iso].capital) capName = g.countries[iso].capital;
    } catch (e) {}
    var pd = window.PROVINCE_DATA || {};
    if (capName && pd[capName] && pd[capName].cx != null) {
      return { x: pd[capName].cx, y: pd[capName].cy, name: capName };
    }
    // fallback: average of owned provinces
    var po = g.provinceOwners || window.provinceOwners || {};
    var sx = 0, sy = 0, n = 0;
    Object.keys(po).forEach(function (pn) {
      if (po[pn] !== iso) return;
      var m = pd[pn];
      if (!m || m.cx == null) return;
      sx += m.cx; sy += m.cy; n++;
    });
    if (n > 0) return { x: sx / n, y: sy / n, name: "avg" };
    return null;
  }

  function zoomTo(x, y, k) {
    k = k || 2.2;
    var svg = document.querySelector("#game-map");
    if (!svg || typeof d3 === "undefined") return;
    try {
      var w = svg.clientWidth || window.innerWidth || 1200;
      var h = svg.clientHeight || window.innerHeight || 800;
      var tx = w / 2 - x * k;
      var ty = h / 2 - y * k;
      var t = d3.zoomIdentity.translate(tx, ty).scale(k);
      var zoom = window.__SC_ZOOM_BEHAVIOR || window.mapZoom;
      if (zoom) {
        d3.select(svg).transition().duration(650).call(zoom.transform, t);
      } else {
        var g = svg.querySelector("g");
        if (g) g.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + k + ")");
        window.__SC_ZOOM_K = k;
      }
    } catch (e) {
      console.warn("[capital-zoom]", e);
    }
  }

  window.scZoomToPlayerCapital = function () {
    var g = GS();
    if (!g || !g.player) return;
    var pt = capitalPoint(g.player);
    if (!pt) return;
    zoomTo(pt.x, pt.y, 2.4);
    try {
      if (typeof window.scHoiAlert === "function") window.scHoiAlert("Başkent: " + (pt.name || g.player));
    } catch (e) {}
  };

  function hook() {
    var fn = window.startGame;
    if (typeof fn !== "function" || fn._capZoom) return;
    window.startGame = async function () {
      if (typeof window.scMuteSfxFor === "function") window.scMuteSfxFor(12000);
      var r = await fn.apply(this, arguments);
      setTimeout(function () { window.scZoomToPlayerCapital(); }, 700);
      setTimeout(function () { window.scZoomToPlayerCapital(); }, 1600);
      return r;
    };
    window.startGame._capZoom = true;
  }
  hook();
  setInterval(hook, 1500);
})();
