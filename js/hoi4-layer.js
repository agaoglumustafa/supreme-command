
(function SCHoi4Layer() {
  "use strict";
  console.log("%c[v1.8.1] SC layer · politics · mapmodes · production look", "color:#e8c547;font-size:14px;font-weight:bold");

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function player() {
    var g = GS();
    return g && g.countries && g.countries[g.player] ? g.countries[g.player] : null;
  }

  // --- Map modes ---
  var mapMode = "political";
  function ensureMapModes() {
    var mc = document.getElementById("map-container");
    if (!mc || document.getElementById("hoi-mapmodes")) return;
    var strip = document.createElement("div");
    strip.id = "hoi-mapmodes";
    strip.innerHTML = [
      '<button type="button" data-mode="political" title="Siyasi harita">SİY</button>',
      '<button type="button" data-mode="terrain" title="Arazi">ARZ</button>',
      '<button type="button" data-mode="supply" title="İkmal">İKM</button>',
      '<button type="button" data-mode="resistance" title="Direniş">DİR</button>'
    ].join("");
    mc.appendChild(strip);
    strip.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mapMode = btn.getAttribute("data-mode") || "political";
        strip.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        applyMapMode();
      });
    });
    strip.querySelector('button[data-mode="political"]').classList.add("active");
  }

  function applyMapMode() {
    var g = GS();
    if (!g || typeof d3 === "undefined") return;
    var pd = window.PROVINCE_DATA || {};
    try {
      d3.selectAll(".country-path").each(function (d) {
        var name = d && d.name ? d.name : d3.select(this).attr("data-name");
        var el = d3.select(this);
        if (mapMode === "political") {
          // let normal refresh handle
          return;
        }
        if (mapMode === "terrain") {
          var t = (pd[name] && pd[name].terrain) || "plains";
          var col = {
            plains: "#4a7c59", forest: "#2d5a3d", mountains: "#6b6b6b",
            hills: "#7a8f5a", desert: "#c2a15a", tundra: "#9bb0c0"
          }[t] || "#4a7c59";
          el.style("fill", col);
        } else if (mapMode === "supply") {
          var iso = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : (g.provinceOwners || {})[name];
          var fac = 1;
          try { if (typeof window.scSupplyFactor === "function" && iso) fac = window.scSupplyFactor(iso, name); } catch (e) {}
          var c = fac > 0.9 ? "#3d8f5a" : fac > 0.75 ? "#c9a227" : "#c43c3c";
          el.style("fill", c);
        } else if (mapMode === "resistance") {
          var occ = g.occupation && g.occupation[name];
          el.style("fill", occ ? "#8b2942" : "#2a3a4e");
        }
      });
      if (mapMode === "political" && typeof refreshMapColors === "function") refreshMapColors();
    } catch (e) {}
  }

  // --- Politics strip on dashboard ---
  function ensurePoliticsStrip() {
    var dash = document.getElementById("content-dashboard");
    if (!dash || document.getElementById("hoi-politics-strip")) return;
    var strip = document.createElement("div");
    strip.id = "hoi-politics-strip";
    strip.innerHTML =
      '<div class="hoi-pol"><div class="k">İstikrar</div><div class="v" id="hoi-stab">50%</div></div>' +
      '<div class="hoi-pol"><div class="k">Savaş Desteği</div><div class="v" id="hoi-ws">40%</div></div>' +
      '<div class="hoi-pol"><div class="k">Siyasi Güç</div><div class="v" id="hoi-pp">0</div></div>';
    dash.insertBefore(strip, dash.firstChild);
  }

  function refreshPolitics() {
    var c = player();
    if (!c) return;
    var stab = Math.round(c.stability != null ? c.stability : 50);
    var ws = Math.round(c.warSupport != null ? c.warSupport : (c.warWeariness != null ? Math.max(0, 100 - c.warWeariness) : 40));
    var pp = Math.round(c.pp != null ? c.pp : (c.politicalPower || 0));
    var el;
    if ((el = document.getElementById("hoi-stab"))) el.textContent = stab + "%";
    if ((el = document.getElementById("hoi-ws"))) el.textContent = ws + "%";
    if ((el = document.getElementById("hoi-pp"))) el.textContent = String(pp);
  }

  // --- Alert ticker ---
  function ensureTicker() {
    var mc = document.getElementById("map-container");
    if (!mc || document.getElementById("hoi-alert-ticker")) return;
    var t = document.createElement("div");
    t.id = "hoi-alert-ticker";
    mc.appendChild(t);
  }
  window.scHoiAlert = function (msg) {
    var t = document.getElementById("hoi-alert-ticker");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(window.__hoiAlertT);
    window.__hoiAlertT = setTimeout(function () { t.style.display = "none"; }, 4500);
  };

  // --- Style production/military empty states ---
  function polishPanels() {
    try {
      document.querySelectorAll("#content-production h3, #content-military h3, #content-research h3, #content-focus h3").forEach(function (h) {
        h.classList.add("panel-title");
      });
    } catch (e) {}
  }

  // --- Soft SC national focuses list if focus panel empty ---
  function seedFocusHints() {
    var focus = document.getElementById("content-focus");
    if (!focus) return;
    if (focus.querySelector(".hoi-focus-card")) return;
    // only add helper banner
    if (focus.querySelector("#hoi-focus-hint")) return;
    var hint = document.createElement("div");
    hint.id = "hoi-focus-hint";
    hint.className = "hoi-focus-card";
    hint.innerHTML = '<div class="panel-title">Ulusal Odak</div><div style="font-size:12px;color:#7a8799;margin-top:6px">Odak ağacından bir odak seç. Tamamlanınca siyasi güç ve bonuslar gelir.</div>';
    focus.insertBefore(hint, focus.firstChild);
  }

  // --- Research slots visual ---
  function seedResearch() {
    var res = document.getElementById("content-research");
    if (!res || res.querySelector("#hoi-research-slots")) return;
    var box = document.createElement("div");
    box.id = "hoi-research-slots";
    box.innerHTML =
      '<div class="panel-title" style="margin-bottom:8px">Araştırma Yuvaları</div>' +
      '<div class="hoi-research-slot" id="hoi-rs0">Yuva 1 — boş</div>' +
      '<div class="hoi-research-slot" id="hoi-rs1">Yuva 2 — boş</div>' +
      '<div class="hoi-research-slot" id="hoi-rs2">Yuva 3 — boş</div>';
    res.insertBefore(box, res.firstChild);
  }

  function refreshResearchSlots() {
    var c = player();
    if (!c || !c.research) return;
    var active = c.research.active || c.research.current || null;
    var slot = document.getElementById("hoi-rs0");
    if (slot) {
      if (active) {
        slot.className = "hoi-research-slot busy";
        slot.textContent = "Yuva 1 — " + (active.name || active.id || active);
      } else {
        slot.className = "hoi-research-slot";
        slot.textContent = "Yuva 1 — boş";
      }
    }
  }

  // --- Tick hook ---
  function wrapTick() {
    var prev = window.gameTick;
    if (typeof prev !== "function") return false;
    if (prev._hoiLayer) return true;
    window.gameTick = function () {
      try { prev.apply(this, arguments); } catch (e) {}
      try {
        refreshPolitics();
        refreshResearchSlots();
        if (mapMode !== "political") applyMapMode();
      } catch (e) {}
    };
    window.gameTick._hoiLayer = true;
    return true;
  }

  function boot() {
    ensureMapModes();
    ensurePoliticsStrip();
    ensureTicker();
    polishPanels();
    seedFocusHints();
    seedResearch();
    refreshPolitics();
    wrapTick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 600);
  setTimeout(boot, 2000);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 200); });

  // After start game
  var _s = window.startGame;
  if (typeof _s === "function" && !_s._hoi) {
    window.startGame = async function () {
      var r = await _s.apply(this, arguments);
      setTimeout(boot, 300);
      setTimeout(function () {
        try { window.scHoiAlert("Komuta merkezi hazır — " + ((GS() && GS().player) || "")); } catch (e) {}
      }, 800);
      return r;
    };
    window.startGame._hoi = true;
  }
})();
