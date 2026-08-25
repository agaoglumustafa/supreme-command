// ===== howareu · ülke ismi konum/ad editörü =====
(function SCNameEditor() {
  "use strict";

  var DEFAULT_NAME_OFFSETS = {"USA": {"dx": 67.77777099609375, "dy": 28.888885498046875}, "CAN": {"dx": -42.22222900390625, "dy": 0}, "MEX": {"dx": 5.5555419921875, "dy": 3.33331298828125}, "KIR": {"dx": -455.5556335449219, "dy": -3.333343505859375}, "GBR": {"dx": 25.5555419921875, "dy": -24.4444580078125}, "NLD": {"dx": 36.6666259765625, "dy": -16.666656494140625}, "COG": {"dx": 4.4444580078125, "dy": -1.111114501953125}, "MDA": {"dx": 2.22216796875, "dy": 0}, "HRV": {"dx": 0, "dy": -2.22222900390625}, "FRA": {"dx": -3.33331298828125, "dy": -41.11114501953125}, "ESP": {"dx": 6.6666259765625, "dy": -7.777801513671875}, "PRT": {"dx": 22.22222900390625, "dy": -4.4444580078125}, "NOR": {"dx": -23.33331298828125, "dy": 24.444442749023438}, "SWE": {"dx": -8.88885498046875, "dy": 24.444442749023438}, "FIN": {"dx": 3.33331298828125, "dy": 1.111114501953125}, "RUS": {"dx": -222.22216796875, "dy": 26.666656494140625}, "CHN": {"dx": -14.4444580078125, "dy": 7.77777099609375}, "PRK": {"dx": -2.22216796875, "dy": 2.222198486328125}, "KOR": {"dx": 1.111083984375, "dy": -1.111114501953125}, "VNM": {"dx": -1.111083984375, "dy": -17.77777099609375}, "NPL": {"dx": -1.111083984375, "dy": 2.22222900390625}, "DNK": {"dx": 190, "dy": 72.22222137451172}, "ECU": {"dx": 6.66668701171875, "dy": -3.333343505859375}, "MYS": {"dx": -20, "dy": 1.111114501953125}, "PHL": {"dx": 2.2222900390625, "dy": -3.333343505859375}, "PNG": {"dx": 0, "dy": 6.666656494140625}};
  var DEFAULT_NAME_OVERRIDES = {"USA": "Amerika Birleşik Devletleri", "KIR": "Kiribati", "RUS": "Rusya Federasyonu", "CHN": "Çin Halk Cumhuriyeti", "DNK": "Danimarka"};
  window.__SC_NAME_OFFSETS = Object.assign({}, DEFAULT_NAME_OFFSETS, window.__SC_NAME_OFFSETS || {});
  window.__SC_NAME_OVERRIDES = Object.assign({}, DEFAULT_NAME_OVERRIDES, window.__SC_NAME_OVERRIDES || {});

  var active = false;
  var dragging = null; // { iso, startX, startY, origDx, origDy }
  var buf = "";

  function ensureState() {
    if (!window.GameState) return;
    // Senaryo ofsetleri öncelikli; default sadece boşsa
    var baseOff = DEFAULT_NAME_OFFSETS;
    var baseOv = DEFAULT_NAME_OVERRIDES;
    try {
      var sid = GameState.scenarioId || "modern";
      var sc = (window.SCENARIOS && SCENARIOS[sid]) || null;
      if (sc && sc.nameOffsets) baseOff = sc.nameOffsets;
      if (sc && (sc.nameOverrides || sc.countryNames)) baseOv = sc.nameOverrides || sc.countryNames;
    } catch (e) {}
    GameState.nameOffsets = Object.assign({}, baseOff, window.__SC_NAME_OFFSETS || {}, GameState.nameOffsets || {});
    GameState.nameOverrides = Object.assign({}, baseOv, window.__SC_NAME_OVERRIDES || {}, GameState.nameOverrides || {});
    window.__SC_NAME_OFFSETS = GameState.nameOffsets;
    window.__SC_NAME_OVERRIDES = GameState.nameOverrides;
    try {
      Object.keys(GameState.nameOverrides).forEach(function (iso) {
        if (GameState.countries && GameState.countries[iso]) {
          GameState.countries[iso].name = GameState.nameOverrides[iso];
        }
      });
    } catch (e) {}
  }

  function toast(m, k) {
    try {
      if (typeof showToast === "function") showToast(m, k || "info");
      else console.log("[name-ed]", m);
    } catch (e) {}
  }

  function banner(on) {
    var el = document.getElementById("sc-name-editor-banner");
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.id = "sc-name-editor-banner";
        el.style.cssText =
          "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;background:#1c1917;border:1px solid #f59e0b;color:#fde68a;padding:8px 14px;border-radius:8px;font-size:11px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:92vw;text-align:center";
        document.body.appendChild(el);
      }
      el.innerHTML =
        "İsim Editörü · sürükle: konum · çift tık: ad · <b>Ctrl+S</b> dışa aktar · <b>Esc</b> kapat";
      el.classList.remove("hidden");
    } else if (el) {
      el.remove();
    }
  }

  function refresh() {
    try {
      if (typeof window.scRefreshCountryNames === "function") window.scRefreshCountryNames(true);
    } catch (e) {}
  }

  function layer() {
    return (
      document.getElementById("sc-country-names") ||
      document.querySelector("g#sc-country-names, g.country-names")
    );
  }

  function enableDrag() {
    var L = layer();
    if (!L) return;
    L.querySelectorAll("text[data-iso]").forEach(function (t) {
      t.style.cursor = "move";
      t.style.pointerEvents = "all";
      if (t._neBound) return;
      t._neBound = true;
      t.addEventListener("pointerdown", onDown);
      t.addEventListener("dblclick", onDbl);
    });
  }

  function svgPoint(evt) {
    var svg = document.querySelector("#game-map svg") || document.querySelector("svg");
    if (!svg) return { x: 0, y: 0 };
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onDown(evt) {
    if (!active) return;
    evt.preventDefault();
    evt.stopPropagation();
    var t = evt.currentTarget;
    var iso = t.getAttribute("data-iso");
    if (!iso) return;
    ensureState();
    var off = GameState.nameOffsets[iso] || { dx: 0, dy: 0 };
    var p = svgPoint(evt);
    dragging = {
      iso: iso,
      el: t,
      startX: p.x,
      startY: p.y,
      baseX: parseFloat(t.getAttribute("x")) || 0,
      baseY: parseFloat(t.getAttribute("y")) || 0,
      origDx: +off.dx || 0,
      origDy: +off.dy || 0
    };
    t.setPointerCapture && t.setPointerCapture(evt.pointerId);
  }

  function onMove(evt) {
    if (!dragging || !active) return;
    var p = svgPoint(evt);
    var ddx = p.x - dragging.startX;
    var ddy = p.y - dragging.startY;
    var nx = dragging.baseX + ddx;
    var ny = dragging.baseY + ddy;
    dragging.el.setAttribute("x", nx);
    dragging.el.setAttribute("y", ny);
    ensureState();
    GameState.nameOffsets[dragging.iso] = {
      dx: dragging.origDx + ddx,
      dy: dragging.origDy + ddy
    };
    window.__SC_NAME_OFFSETS = GameState.nameOffsets;
  }

  function onUp() {
    if (dragging) {
      toast(dragging.iso + " konum kaydedildi", "good");
      dragging = null;
    }
  }

  function onDbl(evt) {
    if (!active) return;
    evt.preventDefault();
    evt.stopPropagation();
    var iso = evt.currentTarget.getAttribute("data-iso");
    if (!iso) return;
    ensureState();
    var cur =
      GameState.nameOverrides[iso] ||
      (GameState.countries[iso] && GameState.countries[iso].name) ||
      iso;
    var neu = prompt("Ülke adı (" + iso + "):", cur);
    if (neu == null) return;
    neu = String(neu).trim();
    if (!neu) return;
    GameState.nameOverrides[iso] = neu;
    window.__SC_NAME_OVERRIDES = GameState.nameOverrides;
    if (GameState.countries[iso]) {
      GameState.countries[iso].name = neu;
      GameState.countries[iso].shortName = neu.length > 12 ? neu.slice(0, 11) + "…" : neu;
    }
    evt.currentTarget.textContent = neu;
    toast(iso + " → " + neu, "good");
    refresh();
  }

  function exportData() {
    ensureState();
    var data = {
      nameOffsets: GameState.nameOffsets || {},
      nameOverrides: GameState.nameOverrides || {},
      exportedAt: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sc-name-layout.json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 2000);
    toast("sc-name-layout.json indirildi", "good");
    try {
      navigator.clipboard.writeText(JSON.stringify(data));
    } catch (e) {}
  }

  function openEditor() {
    active = true;
    ensureState();
    banner(true);
    refresh();
    setTimeout(enableDrag, 200);
    setTimeout(enableDrag, 800);
    toast("howareu · isim editörü açık", "good");
  }

  function closeEditor() {
    active = false;
    dragging = null;
    banner(false);
    toast("İsim editörü kapandı", "info");
  }

  // keyboard easter egg
  window.addEventListener(
    "keydown",
    function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (active && (e.key === "Escape" || e.key === "Esc")) {
        closeEditor();
        return;
      }
      if (active && (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        exportData();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buf += e.key.toLowerCase();
        if (buf.length > 12) buf = buf.slice(-12);
        if (buf.indexOf("howareu") >= 0) {
          buf = "";
          if (active) closeEditor();
          else openEditor();
        }
      }
    },
    true
  );

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);

  window.scOpenNameEditor = openEditor;
  window.scExportNameLayout = exportData;

  // keep drag after name refresh while active
  setInterval(function () {
    if (active) enableDrag();
  }, 2000);

  function bootDefaults() {
    ensureState();
    try {
      if (typeof window.scRefreshCountryNames === "function") window.scRefreshCountryNames(true);
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(bootDefaults, 800); });
  else setTimeout(bootDefaults, 800);
  window.addEventListener("sc-ready", function(){ setTimeout(bootDefaults, 500); });
  // isimler her yenilemede sabit ofsetleri korusun
  (function lockOffsetsOnRefresh() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof window.scRefreshCountryNames === "function" && !window.scRefreshCountryNames._offsetLock) {
        var prev = window.scRefreshCountryNames;
        window.scRefreshCountryNames = function (force) {
          ensureState();
          return prev.apply(this, arguments);
        };
        window.scRefreshCountryNames._offsetLock = true;
        clearInterval(iv);
      }
      if (tries > 40) clearInterval(iv);
    }, 250);
  })();
  console.log("[name-editor] type howareu on map · defaults baked · locked");
})();
