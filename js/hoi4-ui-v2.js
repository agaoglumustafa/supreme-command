
(function SCHoi4UIv2() {
  "use strict";
  console.log("%c[v1.9.0] SC UI v2 · komuta arayüzü", "color:#e8c547;font-size:14px;font-weight:bold");

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function player() {
    var g = GS();
    return (g && g.countries && g.countries[g.player]) ? g.countries[g.player] : null;
  }

  // --- Top bar resource chips ---
  function ensureTopRes() {
    var tb = document.getElementById("top-bar");
    if (!tb || document.getElementById("hoi-res-row")) return;
    var row = document.createElement("div");
    row.id = "hoi-res-row";
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-left:8px;";
    row.innerHTML =
      '<span class="hoi-res"><span class="k">PP</span><span id="hoi-top-pp">0</span></span>' +
      '<span class="hoi-res"><span class="k">İst</span><span id="hoi-top-stab">50%</span></span>' +
      '<span class="hoi-res"><span class="k">SD</span><span id="hoi-top-ws">40%</span></span>' +
      '<span class="hoi-res"><span class="k">Yakıt</span><span id="hoi-top-fuel">—</span></span>';
    // insert after country block if possible
    var mid = tb.children[1] || tb;
    try { tb.insertBefore(row, mid.nextSibling); } catch (e) { tb.appendChild(row); }
  }

  function refreshTop() {
    var c = player();
    if (!c) return;
    function set(id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    }
    var stab = Math.round(c.stability != null ? c.stability : 50);
    var ws = Math.round(c.warSupport != null ? c.warSupport : (c.warWeariness != null ? Math.max(0, 100 - c.warWeariness) : 40));
    var pp = Math.round(c.pp != null ? c.pp : (c.politicalPower || 0));
    var fuel = c.fuel != null ? Math.round(c.fuel) : "—";
    set("hoi-top-pp", String(pp));
    set("hoi-top-stab", stab + "%");
    set("hoi-top-ws", ws + "%");
    set("hoi-top-fuel", String(fuel));
    // politics strip on dashboard
    set("hoi-stab", stab + "%");
    set("hoi-ws", ws + "%");
    set("hoi-pp", String(pp));
  }

  // --- Politics strip ---
  function ensurePolitics() {
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

  // --- Map modes ---
  var mapMode = "political";
  function ensureMapModes() {
    var mc = document.getElementById("map-container");
    if (!mc || document.getElementById("hoi-mapmodes")) return;
    var strip = document.createElement("div");
    strip.id = "hoi-mapmodes";
    var modes = [
      ["political", "SİY", "Siyasi"],
      ["terrain", "ARZ", "Arazi"],
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
        mapMode = m[0];
        strip.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        applyMapMode();
      });
      strip.appendChild(b);
    });
    mc.appendChild(strip);
  }

  function applyMapMode() {
    var g = GS();
    if (!g || typeof d3 === "undefined") return;
    var pd = window.PROVINCE_DATA || {};
    if (mapMode === "political") {
      try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
      return;
    }
    try {
      d3.selectAll(".country-path").each(function () {
        var el = d3.select(this);
        var name = el.attr("data-name");
        if (mapMode === "terrain") {
          var t = (pd[name] && pd[name].terrain) || "plains";
          var col = { plains: "#4a7c59", forest: "#2d5a3d", mountains: "#6b6b6b", hills: "#7a8f5a", desert: "#c2a15a", tundra: "#9bb0c0" }[t] || "#4a7c59";
          el.style("fill", col);
        } else if (mapMode === "supply") {
          var iso = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : ((g.provinceOwners || {})[name]);
          var fac = 1;
          try { if (typeof window.scSupplyFactor === "function" && iso) fac = window.scSupplyFactor(iso, name); } catch (e) {}
          el.style("fill", fac > 0.9 ? "#3d8f5a" : fac > 0.75 ? "#c9a227" : "#c43c3c");
        } else if (mapMode === "resistance") {
          var occ = g.occupation && g.occupation[name];
          el.style("fill", occ ? "#8b2942" : "#2a3a4e");
        }
      });
    } catch (e) {}
  }

  // --- Event card ---
  function ensureEventCard() {
    if (document.getElementById("hoi-event-card")) return;
    var card = document.createElement("div");
    card.id = "hoi-event-card";
    card.innerHTML =
      '<div class="title" id="hoi-ev-title">Olay</div>' +
      '<div class="body" id="hoi-ev-body"></div>' +
      '<div class="actions" id="hoi-ev-actions"></div>';
    document.body.appendChild(card);
  }

  window.scHoiEvent = function (title, body, actions) {
    ensureEventCard();
    var card = document.getElementById("hoi-event-card");
    document.getElementById("hoi-ev-title").textContent = title || "Olay";
    document.getElementById("hoi-ev-body").textContent = body || "";
    var act = document.getElementById("hoi-ev-actions");
    act.innerHTML = "";
    (actions || [{ label: "Tamam", fn: null }]).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = a.label || "Tamam";
      b.addEventListener("click", function () {
        try { if (typeof a.fn === "function") a.fn(); } catch (e) {}
        card.style.display = "none";
      });
      act.appendChild(b);
    });
    card.style.display = "block";
  };

  // --- Soft national focus PP tick ---
  function politicsTick() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var c = player();
    if (!c) return;
    if (c.pp == null && c.politicalPower == null) c.pp = 0;
    if (c.pp == null) c.pp = c.politicalPower || 0;
    c.pp = Math.min(500, (c.pp || 0) + 0.35);
    if (c.stability == null) c.stability = 50;
    if (c.warSupport == null) c.warSupport = 40;
    // tiny drift toward equilibrium when at peace
    var atWar = false;
    try {
      if (g.wars) {
        Object.keys(g.wars).forEach(function (id) {
          var w = g.wars[id];
          if (!w || w.ended) return;
          if ((w.attackers && w.attackers.indexOf(g.player) >= 0) || (w.defenders && w.defenders.indexOf(g.player) >= 0)) atWar = true;
        });
      }
    } catch (e) {}
    if (atWar) {
      c.warSupport = Math.max(0, c.warSupport - 0.02);
      c.stability = Math.max(0, c.stability - 0.01);
    } else {
      c.stability = Math.min(100, c.stability + 0.02);
      c.warSupport = Math.min(100, c.warSupport + 0.01);
    }
  }

  // --- Interval (reliable, no nested updateHUD issues) ---
  var lastDay = null;
  setInterval(function () {
    try {
      ensureTopRes();
      ensurePolitics();
      ensureMapModes();
      ensureEventCard();
      refreshTop();
      var g = GS();
      if (g && g.date) {
        var dk = g.date.getFullYear() + "-" + g.date.getMonth() + "-" + g.date.getDate();
        if (dk !== lastDay) {
          lastDay = dk;
          politicsTick();
        }
      }
      if (mapMode !== "political") applyMapMode();
    } catch (e) {}
  }, 1000);

  function boot() {
    ensureTopRes();
    ensurePolitics();
    ensureMapModes();
    ensureEventCard();
    refreshTop();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 2000);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 150); });

  // Welcome event once per session when game starts
  var _sg = window.startGame;
  if (typeof _sg === "function" && !_sg._hoi19) {
    window.startGame = async function () {
      if (typeof window.scMuteSfxFor === "function") window.scMuteSfxFor(10000);
      var r = await _sg.apply(this, arguments);
      setTimeout(function () {
        try {
          var g = GS();
          var name = (g && g.player) || "";
          window.scHoiEvent(
            "Komuta",
            "Komuta merkezi hazır. Üst şeritte siyasi güç, istikrar ve savaş desteği; sol altta harita modları.",
            [{ label: "Anlaşıldı", fn: null }]
          );
        } catch (e) {}
      }, 1200);
      return r;
    };
    window.startGame._hoi19 = true;
  }
})();
