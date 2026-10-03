
/**
 * v1.9.2 — Coğrafi harita grafikleri
 * Arazi, iklim, yükseklik hissi, efsane
 */
(function SCGfxMap() {
  "use strict";
  console.log("%c[v1.9.2] coğrafi harita grafikleri", "color:#5b9fd4;font-weight:bold");

  var TERRAIN_COLORS = {
    plains: "#6b9e5e",
    grassland: "#6b9e5e",
    forest: "#2f6b45",
    jungle: "#1a5c3a",
    hills: "#8a9a5c",
    mountain: "#7a7a7a",
    mountains: "#7a7a7a",
    desert: "#d4b56a",
    savanna: "#b8a45a",
    tundra: "#9aafb8",
    ice: "#d8e8f0",
    urban: "#6a6a72",
    coastal: "#5a9e8a",
    marsh: "#4a7a6a",
    lake: "#3a7aaa"
  };

  var CLIMATE_COLORS = {
    tropical: "#2d8f5a",
    arid: "#c9a24a",
    temperate: "#6b9e5e",
    continental: "#7a9a6a",
    polar: "#a8c0d0",
    mediterranean: "#9aaa4a",
    subtropical: "#4a9a6a",
    ocean: "#2a5a8a"
  };

  var mapMode = "political"; // political | terrain | climate | height | supply | resistance

  function GS() { return window.GameState || null; }

  function pdOf(name) {
    var pd = window.PROVINCE_DATA || {};
    return pd[name] || {};
  }

  function ensureLegend() {
    var mc = document.getElementById("map-container");
    if (!mc) return null;
    var leg = document.getElementById("sc-map-legend");
    if (!leg) {
      leg = document.createElement("div");
      leg.id = "sc-map-legend";
      mc.appendChild(leg);
    }
    return leg;
  }

  function showLegend(mode) {
    var leg = ensureLegend();
    if (!leg) return;
    if (mode === "political" || mode === "supply" || mode === "resistance") {
      leg.style.display = "none";
      return;
    }
    leg.style.display = "block";
    var rows = [];
    if (mode === "terrain") {
      leg.innerHTML = '<div class="title">Arazi</div>';
      var order = ["plains","forest","jungle","hills","mountain","desert","savanna","tundra","ice","urban","coastal"];
      order.forEach(function (k) {
        if (!TERRAIN_COLORS[k]) return;
        rows.push('<div class="row"><span class="sw" style="background:' + TERRAIN_COLORS[k] + '"></span>' + labelTR(k) + "</div>");
      });
    } else if (mode === "climate") {
      leg.innerHTML = '<div class="title">İklim</div>';
      Object.keys(CLIMATE_COLORS).forEach(function (k) {
        rows.push('<div class="row"><span class="sw" style="background:' + CLIMATE_COLORS[k] + '"></span>' + labelTR(k) + "</div>");
      });
    } else if (mode === "height") {
      leg.innerHTML = '<div class="title">Yükseklik</div>';
      rows = [
        '<div class="row"><span class="sw" style="background:#3d8f5a"></span>Ova</div>',
        '<div class="row"><span class="sw" style="background:#8a9a5c"></span>Tepe</div>',
        '<div class="row"><span class="sw" style="background:#9a9a9a"></span>Dağ</div>',
        '<div class="row"><span class="sw" style="background:#d4b56a"></span>Çöl platosu</div>',
        '<div class="row"><span class="sw" style="background:#c8d8e4"></span>Buzul</div>'
      ];
    }
    leg.innerHTML += rows.join("");
  }

  function labelTR(k) {
    var m = {
      plains: "Ova", grassland: "Çayır", forest: "Orman", jungle: "Orman (tropik)",
      hills: "Tepe", mountain: "Dağ", mountains: "Dağ", desert: "Çöl", savanna: "Savana",
      tundra: "Tundra", ice: "Buz", urban: "Kent", coastal: "Kıyı", marsh: "Bataklık",
      tropical: "Tropikal", arid: "Kurak", temperate: "Ilıman", continental: "Karasal",
      polar: "Kutup", mediterranean: "Akdeniz", subtropical: "Alt tropikal", ocean: "Okyanus"
    };
    return m[k] || k;
  }

  function heightColor(name) {
    var p = pdOf(name);
    var t = (p.terrain || "plains").toLowerCase();
    if (t === "ice" || t === "tundra") return "#c8d8e4";
    if (t === "mountain" || t === "mountains") return "#9a9a9a";
    if (t === "hills") return "#8a9a5c";
    if (t === "desert") return "#d4b56a";
    if (t === "jungle" || t === "forest") return "#3d7a55";
    if (t === "urban") return "#6a6a72";
    return "#4a9a5e";
  }

  function paintTerrain() {
    if (typeof d3 === "undefined") return;
    d3.selectAll(".country-path").each(function () {
      var el = d3.select(this);
      var name = el.attr("data-name");
      var p = pdOf(name);
      var t = (p.terrain || "plains").toLowerCase();
      var col = TERRAIN_COLORS[t] || TERRAIN_COLORS.plains;
      // subtle north/south shading by bbox y if available
      try {
        var node = this;
        if (node.getBBox) {
          var b = node.getBBox();
          var cy = b.y + b.height / 2;
          // darker toward poles-ish (higher y in SVG often south — soft only)
          var shade = 1 + Math.sin(cy / 80) * 0.04;
          el.style("fill", shadeColor(col, shade));
        } else {
          el.style("fill", col);
        }
      } catch (e) {
        el.style("fill", col);
      }
    });
  }

  function paintClimate() {
    if (typeof d3 === "undefined") return;
    d3.selectAll(".country-path").each(function () {
      var el = d3.select(this);
      var name = el.attr("data-name");
      var p = pdOf(name);
      var c = (p.climate || "temperate").toLowerCase();
      el.style("fill", CLIMATE_COLORS[c] || CLIMATE_COLORS.temperate);
    });
  }

  function paintHeight() {
    if (typeof d3 === "undefined") return;
    d3.selectAll(".country-path").each(function () {
      var el = d3.select(this);
      var name = el.attr("data-name");
      el.style("fill", heightColor(name));
    });
  }

  function shadeColor(hex, factor) {
    try {
      var h = hex.replace("#", "");
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var r = Math.min(255, Math.max(0, Math.round(parseInt(h.slice(0,2),16) * factor)));
      var g = Math.min(255, Math.max(0, Math.round(parseInt(h.slice(2,4),16) * factor)));
      var b = Math.min(255, Math.max(0, Math.round(parseInt(h.slice(4,6),16) * factor)));
      return "rgb(" + r + "," + g + "," + b + ")";
    } catch (e) { return hex; }
  }

  function applyMode(mode) {
    mapMode = mode || mapMode;
    showLegend(mapMode);
    if (mapMode === "political") {
      try { if (typeof window.refreshMapColors === "function") window.refreshMapColors(); } catch (e) {}
      return;
    }
    if (mapMode === "terrain") { paintTerrain(); return; }
    if (mapMode === "climate") { paintClimate(); return; }
    if (mapMode === "height") { paintHeight(); return; }
    // supply / resistance: leave to komuta-ui if present
    try {
      if (typeof window.scApplyHoiMapMode === "function") window.scApplyHoiMapMode(mapMode);
    } catch (e) {}
  }

  // Enhance map mode buttons
  function ensureModes() {
    var mc = document.getElementById("map-container");
    if (!mc) return;
    var strip = document.getElementById("hoi-mapmodes");
    if (!strip) {
      strip = document.createElement("div");
      strip.id = "hoi-mapmodes";
      mc.appendChild(strip);
    }
    // rebuild with geographic modes
    if (strip.getAttribute("data-gfx") === "1") return;
    strip.setAttribute("data-gfx", "1");
    strip.innerHTML = "";
    var modes = [
      ["political", "SİY", "Siyasi harita"],
      ["terrain", "ARZ", "Arazi / coğrafya"],
      ["climate", "İKL", "İklim"],
      ["height", "YÜK", "Yükseklik"],
      ["supply", "İKM", "İkmal"],
      ["resistance", "DİR", "Direniş"]
    ];
    modes.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-mode", m[0]);
      b.title = m[2];
      b.textContent = m[1];
      if (m[0] === "political") b.className = "active";
      b.addEventListener("click", function () {
        strip.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        applyMode(m[0]);
      });
      strip.appendChild(b);
    });
  }

  // After political refresh, re-apply if non-political mode active
  var _rmc = window.refreshMapColors;
  if (typeof _rmc === "function" && !_rmc._gfx) {
    window.refreshMapColors = function () {
      var r = _rmc.apply(this, arguments);
      if (mapMode !== "political") {
        setTimeout(function () { applyMode(mapMode); }, 30);
      }
      return r;
    };
    window.refreshMapColors._gfx = true;
  }

  window.scSetMapMode = applyMode;
  window.scGfxMapMode = function () { return mapMode; };

  function boot() {
    ensureModes();
    ensureLegend();
    // soft ocean class
    try {
      var mc = document.getElementById("map-container");
      if (mc) mc.classList.add("sc-map-host");
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1500);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 100); });
})();
