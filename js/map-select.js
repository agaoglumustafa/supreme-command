
(function SCMapSelect() {
  "use strict";
  var PACKS = [
    { id: "1095", label: "1095 · Dünya" },
    { id: "Europe3728", label: "Europe3728 · Avrupa" }
  ];

  function normalizePack(id) {
    id = String(id || "").trim();
    if (!id) return "1095";
    if (id === "Europe4449" || id === "Europe" || id === "europe") return "Europe3728";
    if (id.indexOf("Europe") === 0) return "Europe3728";
    if (id === "1095" || id === "Europe3728") return id;
    return "1095";
  }

  function setPackPersistent(id) {
    id = normalizePack(id);
    window.MAP_PACK_ID = id;
    try { localStorage.setItem("sc_map_pack", id); } catch (e) {}
    try { sessionStorage.setItem("sc_map_pack", id); } catch (e) {}
    return id;
  }

  function readPack() {
    try {
      var q = new URLSearchParams(location.search).get("pack");
      if (q) return normalizePack(q);
    } catch (e) {}
    // varsayılan her zaman dünya; Europe sadece menüden seçilince URL ile gelir
    return "1095";
  }

  function fillScenarioSelect(list) {
    var sel = document.getElementById("lobby-scenario-select");
    if (!sel) return;
    sel.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "__sandbox__";
    opt0.textContent = "Senaryosuz (boş harita)";
    sel.appendChild(opt0);
    (list || []).forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name || s.id;
      sel.appendChild(o);
    });
    if (list && list.some(function (s) { return s.id === "europe_modern"; })) {
      sel.value = "europe_modern";
    } else if (list && list.length) {
      sel.value = list[0].id;
    } else {
      sel.value = "__sandbox__";
    }
  }

  function loadPackIndex(id) {
    return fetch("./assets/maps/" + id + "/scenarios/index.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("index " + r.status);
        return r.json();
      })
      .then(function (idx) {
        fillScenarioSelect((idx && idx.scenarios) || []);
        return idx;
      })
      .catch(function () {
        fillScenarioSelect([]);
        return null;
      });
  }

  window.scBuildSandboxScenario = function () {
    var names = window._scMapProvinceList || [];
    if (!names.length) {
      try {
        d3.selectAll(".country-path").each(function () {
          var n = d3.select(this).attr("data-name");
          if (n) names.push(n);
        });
      } catch (e) {}
    }
    var owners = {};
    names.forEach(function (n) { owners[n] = "NEUTRAL"; });
    return {
      id: "__sandbox__",
      name: "Senaryosuz",
      year: 2026,
      techEra: 3,
      provinceOwners: owners,
      countryNames: { NEUTRAL: "Tarafsız", TUR: "Türkiye", DEU: "Almanya", FRA: "Fransa" },
      countryColors: { NEUTRAL: "#94a3b8", TUR: "#dc2626", DEU: "#0f766e", FRA: "#1d4ed8" },
      countryFlags: {}
    };
  };

  /** ALWAYS hard-navigate so Europe/1095 cannot desync */
  window.onMapPackChange = function (id) {
    id = setPackPersistent(id);
    var status = document.getElementById("sc-map-pack-status");
    if (status) status.textContent = "Sayfa yenileniyor → " + id;
    var url = new URL(window.location.href);
    url.searchParams.set("pack", id);
    // bust cache
    url.searchParams.set("_t", String(Date.now()));
    console.log("[map-select] HARD reload pack=", id);
    window.location.replace(url.toString());
  };

  function wire() {
    var sel = document.getElementById("sc-map-pack-select");
    if (!sel) return;
    sel.innerHTML = "";
    PACKS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.label;
      sel.appendChild(o);
    });
    var pack = readPack();
    setPackPersistent(pack);
    sel.value = pack;
    loadPackIndex(pack);
    sel.onchange = function () {
      window.onMapPackChange(sel.value);
    };
    var status = document.getElementById("sc-map-pack-status");
    if (status) {
      status.textContent = "Seçili harita: " + pack + (pack === "Europe3728" ? " (Avrupa)" : " (Dünya)");
    }
    // Verify geometry matches pack after load
    setTimeout(function () {
      var n = (window._scMapProvinceList && window._scMapProvinceList.length) || 0;
      console.log("[map-select] verify pack=", pack, "provinces=", n);
      if (pack === "Europe3728" && n > 0 && n < 2500) {
        console.error("[map-select] WRONG MAP loaded (still world?). Forcing Europe reload.");
        if (status) status.textContent = "Yanlış harita — Avrupa yeniden yükleniyor…";
        // try soft load first
        if (typeof window.scLoadMapPack === "function") {
          window.scLoadMapPack("Europe3728").then(function (provs) {
            var m = provs && provs.length;
            console.log("[map-select] soft Europe load", m);
            if (status) status.textContent = m ? ("Seçili harita: Europe3728 · " + m + " eyalet") : "Avrupa haritası yükleniyor…";
          }).catch(function (e) {
            console.error(e);
            if (status) status.textContent = "Harita yüklenemedi — sayfayı elle yenile";
          });
        }
      } else if (pack === "Europe3728" && n >= 2500 && status) {
        status.textContent = "Seçili harita: Europe3728 · " + n + " eyalet ✓";
      }
    }, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
  /* setTimeout(wire, 400) disabled — menu flicker */
  console.log("[map-select] HARD pack switch ready");
})();
