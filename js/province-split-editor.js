// ===== SC Province Split Editor v1.3.1 =====
// goodbye → select → drag cut line (zoom/pan locked) → Tamam applies → Kaydet
(function SCProvinceSplitEditor() {
  "use strict";

  var TARGET = "goodbye";
  var buf = "";
  var active = false;

  var state = {
    focusName: null,
    focusPathEl: null,
    ring: null,
    cutPts: [],
    history: [],
    splits: [],
    dirty: false,
    drawing: false
  };

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function owners() {
    try {
      return window.provinceOwners || (typeof provinceOwners !== "undefined" ? provinceOwners : null);
    } catch (e) { return null; }
  }
  function PD() {
    try {
      if (window.PROVINCE_DATA) return window.PROVINCE_DATA;
      if (typeof PROVINCE_DATA !== "undefined") {
        window.PROVINCE_DATA = PROVINCE_DATA;
        return PROVINCE_DATA;
      }
    } catch (e) {}
    return (window.PROVINCE_DATA = window.PROVINCE_DATA || {});
  }
  function slog(msg, cls) {
    try {
      if (typeof window.log === "function") window.log(msg, cls || "text-fuchsia-300");
      else console.log(msg);
    } catch (e) { console.log(msg); }
  }
  function toast(msg, kind) {
    try { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); } catch (e) {}
  }

  function mapZoomGroup() {
    var svg = document.querySelector("#game-map");
    if (!svg) return null;
    if (window.__SC_MAP_G && window.__SC_MAP_G.isConnected) return window.__SC_MAP_G;
    var g = svg.querySelector(":scope > g");
    if (g) window.__SC_MAP_G = g;
    return g || svg;
  }

  // ---------- geometry ----------
  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function samplePathRing(pathEl, samples) {
    samples = samples || 128;
    try {
      var len = pathEl.getTotalLength();
      if (!len || !isFinite(len)) return null;
      var pts = [];
      for (var i = 0; i < samples; i++) {
        var p = pathEl.getPointAtLength((i / samples) * len);
        pts.push({ x: p.x, y: p.y });
      }
      if (pts.length && dist(pts[0], pts[pts.length - 1]) > 0.01) {
        pts.push({ x: pts[0].x, y: pts[0].y });
      }
      return pts;
    } catch (e) {
      return null;
    }
  }

  function ringArea(ring) {
    var a = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      a += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y;
    }
    return Math.abs(a) / 2;
  }

  function pointInRing(ring, pt) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i].x, yi = ring[i].y;
      var xj = ring[j].x, yj = ring[j].y;
      var inter = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
      if (inter) inside = !inside;
    }
    return inside;
  }

  function projectToRing(ring, pt) {
    var best = { x: ring[0].x, y: ring[0].y, idx: 0, t: 0, d: Infinity };
    for (var i = 0; i < ring.length - 1; i++) {
      var a = ring[i], b = ring[i + 1];
      var abx = b.x - a.x, aby = b.y - a.y;
      var apx = pt.x - a.x, apy = pt.y - a.y;
      var ab2 = abx * abx + aby * aby || 1e-9;
      var t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
      var qx = a.x + abx * t, qy = a.y + aby * t;
      var d = dist(pt, { x: qx, y: qy });
      if (d < best.d) best = { x: qx, y: qy, idx: i, t: t, d: d };
    }
    return best;
  }

  /** Outside → snap to border. Inside → keep. forceBorder always snaps. */
  function clampToProvince(pt, ring, forceBorder) {
    if (!ring || !ring.length) return pt;
    var onBorder = projectToRing(ring, pt);
    if (forceBorder) return { x: onBorder.x, y: onBorder.y, border: true, idx: onBorder.idx };
    if (!pointInRing(ring, pt)) {
      return { x: onBorder.x, y: onBorder.y, border: true, idx: onBorder.idx };
    }
    return { x: pt.x, y: pt.y, border: onBorder.d < 2.5, idx: onBorder.idx };
  }

  function ringToPath(ring) {
    if (!ring || ring.length < 3) return "";
    var s = "M" + ring[0].x.toFixed(3) + " " + ring[0].y.toFixed(3);
    for (var i = 1; i < ring.length; i++) {
      s += "L" + ring[i].x.toFixed(3) + " " + ring[i].y.toFixed(3);
    }
    return s + "Z";
  }

  function walkRing(ring, fromIdx, toIdx) {
    var out = [];
    var n = ring.length - 1;
    var i = fromIdx;
    var guard = 0;
    out.push({ x: ring[i].x, y: ring[i].y });
    while (i !== toIdx && guard++ < n + 3) {
      i = (i + 1) % n;
      out.push({ x: ring[i].x, y: ring[i].y });
    }
    return out;
  }

  function walkRingRev(ring, fromIdx, toIdx) {
    var out = [];
    var n = ring.length - 1;
    var i = fromIdx;
    var guard = 0;
    out.push({ x: ring[i].x, y: ring[i].y });
    while (i !== toIdx && guard++ < n + 3) {
      i = (i - 1 + n) % n;
      out.push({ x: ring[i].x, y: ring[i].y });
    }
    return out;
  }

  /** Cut province with open polyline border→border (NOT a hole inside). */
  function splitRingByCut(ring, cutPts) {
    if (!ring || ring.length < 4 || !cutPts || cutPts.length < 2) return null;
    var start = projectToRing(ring, cutPts[0]);
    var end = projectToRing(ring, cutPts[cutPts.length - 1]);
    if (dist(start, end) < 0.8) return null;

    var i0 = start.idx;
    var i1 = end.idx;
    var mid = cutPts.slice(1, -1).map(function (p) {
      return clampToProvince(p, ring, false);
    });

    var partA = walkRing(ring, i0, i1);
    partA[0] = { x: start.x, y: start.y };
    partA[partA.length - 1] = { x: end.x, y: end.y };
    for (var c = mid.length - 1; c >= 0; c--) partA.push({ x: mid[c].x, y: mid[c].y });
    partA.push({ x: start.x, y: start.y });

    var partB = walkRingRev(ring, i0, i1);
    partB[0] = { x: start.x, y: start.y };
    partB[partB.length - 1] = { x: end.x, y: end.y };
    for (var c2 = mid.length - 1; c2 >= 0; c2--) partB.push({ x: mid[c2].x, y: mid[c2].y });
    partB.push({ x: start.x, y: start.y });

    var areaA = ringArea(partA);
    var areaB = ringArea(partB);
    var total = ringArea(ring) || 1;
    if (areaA < total * 0.008 || areaB < total * 0.008) {
      partB = walkRing(ring, i1, i0);
      partB[0] = { x: end.x, y: end.y };
      partB[partB.length - 1] = { x: start.x, y: start.y };
      for (var c3 = 0; c3 < mid.length; c3++) partB.push({ x: mid[c3].x, y: mid[c3].y });
      partB.push({ x: end.x, y: end.y });
      areaA = ringArea(partA);
      areaB = ringArea(partB);
    }
    if (areaA < 1e-4 || areaB < 1e-4) return null;
    var sum = areaA + areaB;
    return { a: partA, b: partB, ratioA: areaA / sum, ratioB: areaB / sum };
  }

  function clientToSvg(svg, clientX, clientY) {
    try {
      var pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svg.getScreenCTM();
      if (!ctm) return { x: clientX, y: clientY };
      var p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    } catch (e) {
      return { x: clientX, y: clientY };
    }
  }

  // ---------- history ----------
  function pushHistory() {
    try {
      var snap = {
        paths: [],
        owners: JSON.parse(JSON.stringify(owners() || {})),
        pd: JSON.parse(JSON.stringify(PD() || {})),
        splits: JSON.parse(JSON.stringify(state.splits))
      };
      document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
        snap.paths.push({
          name: el.getAttribute("data-name"),
          d: el.getAttribute("d"),
          id: el.getAttribute("id")
        });
      });
      state.history.push(snap);
      if (state.history.length > 40) state.history.shift();
      saveMemory();
    } catch (e) {}
  }

  function saveMemory() {
    try {
      var mem = {
        splits: state.splits,
        owners: owners() || {},
        pd: PD() || {},
        map: collectMapFeatures(),
        savedAt: Date.now()
      };
      window.__SC_SPLIT_MEMORY = mem;
      try {
        localStorage.setItem(
          "sc_split_memory",
          JSON.stringify({ splits: mem.splits, savedAt: mem.savedAt, provinceCount: mem.map.length })
        );
      } catch (e) {}
      state.dirty = true;
      setStatus("Hafızada · " + mem.map.length + " eyalet · Kaydet ile indir");
    } catch (e) {}
  }

  function undo() {
    if (!state.history.length) {
      toast("Geri alınacak yok", "info");
      return;
    }
    var snap = state.history.pop();
    restoreSnap(snap);
    saveMemory();
    toast("Geri alındı", "info");
  }

  function restoreSnap(snap) {
    try {
      var po = owners() || (window.provinceOwners = {});
      Object.keys(po).forEach(function (k) { delete po[k]; });
      Object.assign(po, snap.owners || {});
      var pd = PD();
      Object.keys(pd).forEach(function (k) { delete pd[k]; });
      Object.assign(pd, snap.pd || {});
      state.splits = snap.splits || [];
      var byName = {};
      (snap.paths || []).forEach(function (p) { byName[p.name] = p; });
      var gEl = mapZoomGroup();
      var live = document.querySelectorAll("#game-map path.country-path");
      var have = {};
      live.forEach(function (el) {
        var n = el.getAttribute("data-name");
        have[n] = el;
        if (byName[n]) el.setAttribute("d", byName[n].d);
        else el.remove();
      });
      (snap.paths || []).forEach(function (p) {
        if (have[p.name]) return;
        if (!gEl) return;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", p.d);
        path.setAttribute("class", "country-path");
        path.setAttribute("data-name", p.name);
        path.setAttribute("id", p.id || String(p.name).replace(/[^a-zA-Z0-9_]/g, "_"));
        path.style.cursor = "crosshair";
        gEl.appendChild(path);
        bindPathClick(path);
      });
      repaintAll();
    } catch (e) {}
  }

  function repaintAll() {
    try {
      if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
      else if (typeof window.refreshMapColors === "function") window.refreshMapColors();
      else {
        var g = GS();
        var po = owners();
        if (!g || !po) return;
        document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
          var n = el.getAttribute("data-name");
          var o = po[n];
          el.style.fill = (g.countries[o] && g.countries[o].color) || "#1e293b";
        });
      }
    } catch (e) {}
  }

  function inheritProvinceData(parentName, childName, ratio) {
    var pd = PD();
    var src = pd[parentName] || {};
    var copy = JSON.parse(JSON.stringify(src));
    var r = Math.max(0.05, Math.min(0.95, ratio || 0.5));
    copy.terrain = src.terrain || "plains";
    copy.climate = src.climate || "temperate";
    copy.primaryResource = src.primaryResource || "grain";
    if (src.culture) copy.culture = src.culture;
    if (src.religion) copy.religion = src.religion;
    if (src.ethnicity) copy.ethnicity = src.ethnicity;
    if (typeof src.infrastructureLevel === "number") {
      copy.infrastructureLevel = Math.max(1, Math.round(src.infrastructureLevel));
    }
    if (typeof src.population === "number") copy.population = Math.max(1, Math.round(src.population * r));
    if (typeof src.factories === "number") copy.factories = Math.max(0, Math.round(src.factories * r));
    copy.neighbors = (src.neighbors || []).slice();
    copy._splitFrom = parentName;
    copy._splitRatio = r;
    pd[childName] = copy;
    return copy;
  }

  function rebuildNeighborsApprox() {
    var pd = PD();
    var paths = document.querySelectorAll("#game-map path.country-path");
    var samples = [];
    paths.forEach(function (el) {
      var name = el.getAttribute("data-name");
      if (!name) return;
      var ring = samplePathRing(el, 20);
      if (!ring) return;
      var cx = 0, cy = 0;
      ring.forEach(function (p) { cx += p.x; cy += p.y; });
      cx /= ring.length;
      cy /= ring.length;
      samples.push({ name: name, ring: ring, cx: cx, cy: cy });
    });
    samples.forEach(function (a) {
      var neigh = [];
      samples.forEach(function (b) {
        if (a.name === b.name) return;
        if (dist({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }) > 90) return;
        var close = false;
        for (var i = 0; i < a.ring.length && !close; i += 2) {
          for (var j = 0; j < b.ring.length; j += 2) {
            if (dist(a.ring[i], b.ring[j]) < 4) {
              close = true;
              break;
            }
          }
        }
        if (close) neigh.push(b.name);
      });
      if (!pd[a.name]) {
        pd[a.name] = {
          neighbors: neigh,
          terrain: "plains",
          climate: "temperate",
          primaryResource: "grain",
          infrastructureLevel: 1
        };
      } else pd[a.name].neighbors = neigh;
    });
  }

  // ---------- UI ----------
  function ensureBadge() {
    var el = document.getElementById("sc-split-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "sc-split-badge";
      el.style.cssText =
        "position:fixed;top:0.5rem;left:50%;transform:translateX(-50%);z-index:20000;display:none;" +
        "background:linear-gradient(90deg,#4c1d95,#7c3aed);color:#f5f3ff;font:12px system-ui;font-weight:800;" +
        "padding:6px 14px;border-radius:999px;border:1px solid #c4b5fd;letter-spacing:.06em;";
      el.textContent = "✂ BÖLME MODU · sürükleme kapalı · çizgi çiz";
      document.body.appendChild(el);
    }
    return el;
  }

  function ensurePanel() {
    var panel = document.getElementById("sc-split-panel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "sc-split-panel";
    panel.style.cssText =
      "position:fixed;top:3.4rem;right:0.55rem;z-index:20001;width:min(300px,94vw);" +
      "background:rgba(12,8,22,.97);border:2px solid #7c3aed;border-radius:12px;padding:12px;" +
      "color:#e2e8f0;font:12px system-ui;box-shadow:0 12px 40px rgba(0,0,0,.55);display:none;";
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<b style="color:#c4b5fd;letter-spacing:.08em;font-size:11px;">EYALET KESME</b>' +
      '<button type="button" id="sc-split-close" style="background:0;border:0;color:#f87171;font-size:16px;cursor:pointer;">✕</button></div>' +
      '<p style="margin:0 0 8px;color:#94a3b8;font-size:11px;line-height:1.45;">' +
      "Eyaleti <b style='color:#e9d5ff'>kes</b>: sınırdan karşı sınıra çizgi çek. " +
      "İçine yeni eyalet çizilmez. Harita yalnız <b style='color:#e9d5ff'>Tamam</b> ile değişir.</p>" +
      '<div id="sc-split-focus" style="font-size:11px;color:#a5b4fc;margin-bottom:8px;">Odak: —</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
      '<button type="button" id="sc-split-clear" style="padding:7px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer;font-weight:700;">Çizimi Sil</button>' +
      '<button type="button" id="sc-split-undo" style="padding:7px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer;font-weight:700;">↩ Undo</button>' +
      '<button type="button" id="sc-split-ok" style="grid-column:1/-1;padding:9px;border-radius:8px;border:0;background:#7c3aed;color:#fff;cursor:pointer;font-weight:800;">✓ Tamam — Kes</button>' +
      '<button type="button" id="sc-split-save" style="grid-column:1/-1;padding:9px;border-radius:8px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;cursor:pointer;font-weight:800;">💾 Kaydet — İndir</button>' +
      "</div>" +
      '<div id="sc-split-status" style="font-size:10px;color:#64748b;min-height:2.4em;"></div>';
    document.body.appendChild(panel);
    panel.querySelector("#sc-split-close").onclick = function () { deactivate(); };
    panel.querySelector("#sc-split-clear").onclick = function () { clearCut(); };
    panel.querySelector("#sc-split-undo").onclick = function () { undo(); };
    panel.querySelector("#sc-split-ok").onclick = function () { completeSplit(); };
    panel.querySelector("#sc-split-save").onclick = function () { exportScenario(); };
    return panel;
  }

  function setStatus(t) {
    var el = document.getElementById("sc-split-status");
    if (el) el.textContent = t || "";
  }

  function clearCut() {
    state.cutPts = [];
    state.drawing = false;
    var layer = document.getElementById("sc-split-draw-layer");
    if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild);
    setStatus(state.focusName ? "Odak hazır — basılı tutup çiz" : "Eyalet seç");
  }

  function ensureDrawLayer() {
    var parent = mapZoomGroup();
    if (!parent) return null;
    var layer = document.getElementById("sc-split-draw-layer");
    if (layer && layer.parentNode !== parent) {
      try { parent.appendChild(layer); } catch (e) {}
    }
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.setAttribute("id", "sc-split-draw-layer");
      layer.setAttribute("pointer-events", "none");
      parent.appendChild(layer);
    }
    return layer;
  }

  function redrawCut() {
    var layer = ensureDrawLayer();
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!state.cutPts.length) return;

    // glow line so it's visible
    var glow = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    glow.setAttribute("points", state.cutPts.map(function (p) { return p.x + "," + p.y; }).join(" "));
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", "#f5d0fe");
    glow.setAttribute("stroke-width", "4");
    glow.setAttribute("stroke-opacity", "0.35");
    glow.setAttribute("stroke-linecap", "round");
    glow.setAttribute("stroke-linejoin", "round");
    layer.appendChild(glow);

    var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", state.cutPts.map(function (p) { return p.x + "," + p.y; }).join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "#e879f9");
    poly.setAttribute("stroke-width", "1.8");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("stroke-linejoin", "round");
    layer.appendChild(poly);

    state.cutPts.forEach(function (p, i) {
      var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", i === 0 || i === state.cutPts.length - 1 ? "3" : "2");
      c.setAttribute("fill", p.border ? "#f0abfc" : "#c084fc");
      c.setAttribute("stroke", "#4a044e");
      c.setAttribute("stroke-width", "0.4");
      layer.appendChild(c);
    });
  }

  function focusProvince(pathEl, name) {
    state.focusName = name;
    state.focusPathEl = pathEl;
    state.ring = samplePathRing(pathEl, 128);
    state.cutPts = [];
    state.drawing = false;
    redrawCut();
    var focusEl = document.getElementById("sc-split-focus");
    if (focusEl) focusEl.textContent = "Odak: " + String(name).replace(/_/g, " ");
    try {
      document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
        el.style.opacity = el === pathEl ? "1" : "0.28";
        el.style.stroke = el === pathEl ? "#e879f9" : "";
        el.style.strokeWidth = el === pathEl ? "0.16px" : "";
      });
    } catch (e) {}
    setStatus("Sınırdan bas, karşı sınıra sürükle. Bırak → önizleme. Tamam = kes.");
    slog("✂ Odak → " + name, "text-fuchsia-300");
  }

  function uniqueChildName(base) {
    var n = 1, name;
    do {
      name = base + "_Part" + n;
      n++;
    } while (document.querySelector('#game-map path[data-name="' + name + '"]') && n < 800);
    return name;
  }

  function openNameModal(parentName, defA, defB, ratioA, ratioB, onDone) {
    var old = document.getElementById("sc-split-modal");
    if (old) old.remove();
    var g = GS();
    var countries = g && g.countries ? Object.keys(g.countries) : ["TUR"];
    var po = owners() || {};
    var defaultOwner = po[parentName] || (g && g.player) || "TUR";

    var modal = document.createElement("div");
    modal.id = "sc-split-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:21000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:12px;";
    modal.innerHTML =
      '<div style="width:min(420px,96vw);background:#0f172a;border:2px solid #7c3aed;border-radius:12px;padding:16px;color:#e2e8f0;">' +
      '<h3 style="margin:0 0 6px;color:#c4b5fd;font-size:14px;">Kesilen parçalar</h3>' +
      '<p style="margin:0 0 10px;font-size:11px;color:#94a3b8;">Oran A %' +
      Math.round(ratioA * 100) +
      " · B %" +
      Math.round(ratioB * 100) +
      " · kültür/arazi miras</p>" +
      '<label style="font-size:10px;color:#a5b4fc;">Parça A adı</label>' +
      '<input id="sc-na" value="' +
      defA.replace(/_/g, " ") +
      '" style="width:100%;margin:4px 0 8px;padding:8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;"/>' +
      '<label style="font-size:10px;color:#a5b4fc;">Parça B adı</label>' +
      '<input id="sc-nb" value="' +
      defB.replace(/_/g, " ") +
      '" style="width:100%;margin:4px 0 8px;padding:8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;"/>' +
      '<label style="font-size:10px;color:#a5b4fc;">Sahip ülke</label>' +
      '<select id="sc-ow" style="width:100%;margin:4px 0 12px;padding:8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#f8fafc;">' +
      countries
        .map(function (iso) {
          return (
            '<option value="' +
            iso +
            '"' +
            (iso === defaultOwner ? " selected" : "") +
            ">" +
            ((g && g.countries[iso] && g.countries[iso].name) || iso) +
            "</option>"
          );
        })
        .join("") +
      "</select>" +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" id="sc-mod-ok" style="flex:1;padding:10px;border:0;border-radius:8px;background:#7c3aed;color:#fff;font-weight:800;cursor:pointer;">Tamam</button>' +
      '<button type="button" id="sc-mod-cancel" style="flex:1;padding:10px;border:1px solid #475569;border-radius:8px;background:#1e293b;color:#cbd5e1;font-weight:700;cursor:pointer;">İptal</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    modal.querySelector("#sc-mod-cancel").onclick = function () {
      modal.remove();
      setStatus("İptal — eyalet değişmedi");
    };
    modal.querySelector("#sc-mod-ok").onclick = function () {
      var na = (modal.querySelector("#sc-na").value || defA).trim().replace(/\s+/g, "_").replace(/[^\w\u00C0-\u024F-]/g, "");
      var nb = (modal.querySelector("#sc-nb").value || defB).trim().replace(/\s+/g, "_").replace(/[^\w\u00C0-\u024F-]/g, "");
      var ow = modal.querySelector("#sc-ow").value || defaultOwner;
      modal.remove();
      onDone(na || defA, nb || defB, ow);
    };
  }

  function completeSplit() {
    if (!state.focusPathEl || !state.focusName) {
      toast("Önce eyalet seç", "info");
      return;
    }
    if (state.cutPts.length < 2) {
      toast("Kesik çizgi çiz (sınırdan sınıra)", "info");
      return;
    }
    var ring = state.ring || samplePathRing(state.focusPathEl, 128);
    if (!ring) {
      toast("Path okunamadı", "bad");
      return;
    }
    var pts = state.cutPts.slice();
    pts[0] = clampToProvince(pts[0], ring, true);
    pts[pts.length - 1] = clampToProvince(pts[pts.length - 1], ring, true);
    for (var i = 1; i < pts.length - 1; i++) pts[i] = clampToProvince(pts[i], ring, false);

    var result = splitRingByCut(ring, pts);
    if (!result) {
      toast("Kesilemedi — sınırdan karşı sınıra düzgün çiz", "bad");
      return;
    }

    var parentName = state.focusName;
    openNameModal(parentName, uniqueChildName(parentName), uniqueChildName(parentName), result.ratioA, result.ratioB, function (nameA, nameB, owner) {
      // ONLY NOW mutate map
      pushHistory();
      try {
        var pathA = ringToPath(result.a);
        var pathB = ringToPath(result.b);
        var pathEl = state.focusPathEl;

        pathEl.setAttribute("d", pathA);
        pathEl.setAttribute("data-name", nameA);
        pathEl.setAttribute("id", nameA.replace(/[^a-zA-Z0-9_]/g, "_"));

        var gEl = pathEl.parentNode || mapZoomGroup();
        var path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path2.setAttribute("d", pathB);
        path2.setAttribute("class", "country-path");
        path2.setAttribute("data-name", nameB);
        path2.setAttribute("id", nameB.replace(/[^a-zA-Z0-9_]/g, "_"));
        path2.style.cursor = "crosshair";
        gEl.appendChild(path2);
        bindPathClick(path2);

        var po = owners() || (window.provinceOwners = {});
        var oldOwner = po[parentName] || owner;
        try { delete po[parentName]; } catch (e) {}
        po[nameA] = owner || oldOwner;
        po[nameB] = owner || oldOwner;

        inheritProvinceData(parentName, nameA, result.ratioA);
        inheritProvinceData(parentName, nameB, result.ratioB);

        state.splits.push({ parent: parentName, a: nameA, b: nameB, ratioA: result.ratioA, ratioB: result.ratioB, owner: owner });
        clearCut();
        focusProvince(pathEl, nameA);
        repaintAll();
        saveMemory();
        slog("✂ " + parentName + " → " + nameA + " + " + nameB, "text-fuchsia-300");
        toast("Kesildi", "good");
      } catch (err) {
        console.error(err);
        toast("Hata: " + (err.message || err), "bad");
      }
    });
  }

  function bindPathClick(pathEl) {
    if (pathEl._scSplitBound) return;
    pathEl._scSplitBound = true;
    pathEl.addEventListener(
      "pointerdown",
      function (ev) {
        if (!active) return;
        if (state.drawing) return;
        var name = pathEl.getAttribute("data-name");
        if (!name) return;
        // select province on press if different / no focus
        if (state.focusName !== name || !state.cutPts.length) {
          focusProvince(pathEl, name);
        }
      },
      true
    );
  }

  function onPointerDown(ev) {
    if (!active) return;
    if (ev.target && ev.target.closest && ev.target.closest("#sc-split-panel, #sc-split-modal, #sc-split-badge")) return;
    var svg = document.querySelector("#game-map");
    if (!svg || !state.focusPathEl || !state.ring) return;
    // if clicking another province path, focus handled by bindPathClick
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute("data-name") && t.getAttribute("data-name") !== state.focusName) {
      return;
    }
    state.drawing = true;
    try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
    var raw = clientToSvg(svg, ev.clientX, ev.clientY);
    var pt = clampToProvince(raw, state.ring, true); // start on border
    state.cutPts = [pt];
    redrawCut();
    setStatus("Çiziliyor… karşı sınıra sürükle");
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onPointerMove(ev) {
    if (!active || !state.drawing || !state.ring) return;
    var svg = document.querySelector("#game-map");
    if (!svg) return;
    var raw = clientToSvg(svg, ev.clientX, ev.clientY);
    // mid points: keep inside or clamp outside to border
    var pt = clampToProvince(raw, state.ring, false);
    var last = state.cutPts[state.cutPts.length - 1];
    if (!last || dist(last, pt) >= 1.2) {
      state.cutPts.push(pt);
      // limit points for performance
      if (state.cutPts.length > 200) {
        state.cutPts = state.cutPts.filter(function (_, i) {
          return i === 0 || i === state.cutPts.length - 1 || i % 2 === 0;
        });
      }
      redrawCut();
    }
    ev.preventDefault();
  }

  function onPointerUp(ev) {
    if (!active || !state.drawing) return;
    state.drawing = false;
    var svg = document.querySelector("#game-map");
    if (svg && state.ring) {
      var raw = clientToSvg(svg, ev.clientX, ev.clientY);
      var end = clampToProvince(raw, state.ring, true); // end on border
      if (state.cutPts.length) state.cutPts[state.cutPts.length - 1] = end;
      else state.cutPts.push(end);
      redrawCut();
    }
    setStatus(
      state.cutPts.length >= 2
        ? "Önizleme hazır · eyalet henüz değişmedi · ✓ Tamam ile kes"
        : "Çizgi çok kısa"
    );
    try {
      if (svg) svg.releasePointerCapture(ev.pointerId);
    } catch (e) {}
  }

  function collectMapFeatures() {
    var list = [];
    document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
      list.push({ name: el.getAttribute("data-name"), path: el.getAttribute("d") });
    });
    return list;
  }

  function exportScenario() {
    rebuildNeighborsApprox();
    saveMemory();
    var g = GS();
    var po = owners() || {};
    var pd = PD() || {};
    var features = collectMapFeatures();
    var payload = {
      meta: {
        tool: "SCProvinceSplitEditor",
        version: "1.3.1",
        exportedAt: new Date().toISOString(),
        splits: state.splits.slice(),
        provinceCount: features.length
      },
      map: features,
      PROVINCE_DATA: pd,
      provinceOwners: po,
      scenario: {
        id: ((g && g.scenarioId) || "modern") + "_split",
        name: ((g && g.scenarioName) || "Özel") + " (Kesilmiş)",
        year: 2026,
        techEra: 3,
        provinceOwners: po,
        countryNames: {},
        countryColors: {},
        countryFlags: {}
      }
    };
    if (g && g.countries) {
      Object.keys(g.countries).forEach(function (iso) {
        var c = g.countries[iso];
        if (!c) return;
        payload.scenario.countryNames[iso] = c.name;
        payload.scenario.countryColors[iso] = c.color;
        payload.scenario.countryFlags[iso] = c.flag;
      });
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sc_split_map_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
    toast("JSON indirildi", "good");
  }

  function setZoomLocked(lock) {
    window.__SC_SPLIT_EDITOR = !!lock;
    var svg = document.querySelector("#game-map");
    var mc = document.getElementById("map-container");
    if (svg) {
      svg.style.cursor = lock ? "crosshair" : "";
      svg.style.touchAction = lock ? "none" : "";
    }
    if (mc) mc.style.touchAction = lock ? "none" : "";
    // hard-disable d3 zoom handlers while locked
    try {
      if (lock) {
        d3.select("#game-map").on(".zoom", null);
      } else {
        var z = window.scMapZoom || window.zoom;
        if (z) d3.select("#game-map").call(z);
      }
    } catch (e) {}
  }

  function activate() {
    if (active) return;
    active = true;
    setZoomLocked(true);
    document.body.classList.add("sc-split-on");
    ensureBadge().style.display = "block";
    ensurePanel().style.display = "block";
    document.querySelectorAll("#game-map path.country-path").forEach(bindPathClick);
    var svg = document.querySelector("#game-map");
    if (svg && !svg._scSplitPtr) {
      svg.addEventListener("pointerdown", onPointerDown, true);
      svg.addEventListener("pointermove", onPointerMove, true);
      svg.addEventListener("pointerup", onPointerUp, true);
      svg.addEventListener("pointercancel", onPointerUp, true);
      svg._scSplitPtr = true;
    }
    setStatus("Bölme açık · sürükleme kapalı · eyalet seç · çiz");
    slog("✂ Bölme modu — pan/zoom kilitli", "text-fuchsia-300 font-bold");
    toast("Bölme modu: çizgi çiz, Tamam ile kes", "info");
  }

  function deactivate() {
    active = false;
    setZoomLocked(false);
    document.body.classList.remove("sc-split-on");
    state.focusName = null;
    state.focusPathEl = null;
    state.ring = null;
    clearCut();
    var badge = document.getElementById("sc-split-badge");
    if (badge) badge.style.display = "none";
    var panel = document.getElementById("sc-split-panel");
    if (panel) panel.style.display = "none";
    document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
      el.style.opacity = "";
      el.style.stroke = "";
      el.style.strokeWidth = "";
    });
    if (state.dirty) saveMemory();
    slog("Bölme kapandı · harita sürükleme açık", "text-slate-400");
  }

  window.scToggleSplitEditor = function () {
    if (active) deactivate();
    else activate();
  };
  window.scSplitComplete = completeSplit;
  window.scSplitExport = exportScenario;

  window.scImportSplitMap = window.scImportSplitMap || function (payload) {
    if (!payload || !payload.map) return false;
    pushHistory();
    try {
      var gEl = mapZoomGroup();
      if (!gEl) return false;
      gEl.querySelectorAll("path.country-path").forEach(function (el) { el.remove(); });
      payload.map.forEach(function (f) {
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", f.path);
        path.setAttribute("class", "country-path");
        path.setAttribute("data-name", f.name);
        path.setAttribute("id", String(f.name).replace(/[^a-zA-Z0-9_]/g, "_"));
        path.style.cursor = "pointer";
        gEl.appendChild(path);
        bindPathClick(path);
      });
      if (payload.provinceOwners) {
        var po = owners() || (window.provinceOwners = {});
        Object.keys(po).forEach(function (k) { delete po[k]; });
        Object.assign(po, payload.provinceOwners);
      }
      if (payload.PROVINCE_DATA) {
        var pd = PD();
        Object.keys(pd).forEach(function (k) { delete pd[k]; });
        Object.assign(pd, payload.PROVINCE_DATA);
      }
      repaintAll();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  window.addEventListener(
    "keydown",
    function (ev) {
      var tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (ev.target && ev.target.isContentEditable)) return;

      if (active && (ev.ctrlKey || ev.metaKey) && (ev.key === "z" || ev.key === "Z")) {
        ev.preventDefault();
        undo();
        return;
      }
      if (active && ev.key === "Enter") {
        ev.preventDefault();
        completeSplit();
        return;
      }
      if (active && ev.key === "Escape") {
        if (state.cutPts.length) clearCut();
        else deactivate();
        return;
      }
      if (ev.key.length !== 1) return;
      var ch = ev.key.toLowerCase();
      if (!/^[a-z]$/.test(ch)) {
        buf = "";
        return;
      }
      buf = (buf + ch).slice(-TARGET.length);
      if (buf === TARGET) {
        buf = "";
        activate();
      }
    },
    true
  );

  console.log("[split-editor] goodbye · drag cut · pan locked · Tamam applies");
})();
