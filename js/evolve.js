// ===== SC EVOLVE v1.1.7 — map armies, war front, advisor, push front =====
(function SCEvolve() {
  "use strict";

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function owners() {
    try { return window.provinceOwners || null; } catch (e) { return null; }
  }
  function slog(msg, cls) {
    try { if (typeof window.log === "function") window.log(msg, cls || "text-slate-300"); } catch (e) {}
  }
  function toast(msg, kind) {
    try { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); } catch (e) {}
  }
  function cname(g, iso) {
    var c = g.countries && g.countries[iso];
    return (c && c.name) || iso;
  }
  function totalDivs(c) {
    if (!c || !c.divisions) return 0;
    return (c.divisions.inf || 0) + (c.divisions.art || 0) * 1.2 + (c.divisions.arm || 0) * 1.8;
  }
  function countProvs(po, iso) {
    if (!po) return 0;
    var n = 0;
    for (var k in po) if (po[k] === iso) n++;
    return n;
  }

  // ---------- centroids cache from path bbox ----------
  var centroidCache = Object.create(null);
  var lastMarkerKey = "";

  function pathCentroid(pathEl) {
    try {
      var b = pathEl.getBBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    } catch (e) {
      return null;
    }
  }

  function mapZoomGroup() {
    // paths live under the first <g> that d3 zoom transforms — labels must too
    var svg = document.querySelector("#game-map");
    if (!svg) return null;
    if (window.__SC_MAP_G) return window.__SC_MAP_G;
    var g = svg.querySelector(":scope > g");
    if (g) window.__SC_MAP_G = g;
    return g || svg;
  }

  function ensureArmyLayer() {
    var parent = mapZoomGroup();
    if (!parent) return null;
    var layer = document.getElementById("sc-army-layer");
    // reparent if it was stuck on svg root (old bug)
    if (layer && layer.parentNode !== parent) {
      try { parent.appendChild(layer); } catch (e) {}
    }
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.setAttribute("id", "sc-army-layer");
      layer.setAttribute("pointer-events", "none");
      parent.appendChild(layer);
    }
    return layer;
  }

  function ensureFrontLayer() {
    var parent = mapZoomGroup();
    if (!parent) return null;
    var layer = document.getElementById("sc-front-layer");
    if (layer && layer.parentNode !== parent) {
      try { parent.appendChild(layer); } catch (e) {}
    }
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      layer.setAttribute("id", "sc-front-layer");
      layer.setAttribute("pointer-events", "none");
      parent.appendChild(layer);
    }
    return layer;
  }

  // Pick one representative province center per country (prefer capital-ish / largest bbox)
  function countryAnchors(po) {
    var byIso = Object.create(null);
    var paths = document.querySelectorAll("#game-map path.country-path, #game-map path");
    for (var i = 0; i < paths.length; i++) {
      var el = paths[i];
      var name = el.getAttribute("data-name");
      if (!name) continue;
      var iso = po[name];
      if (!iso || iso === "NEUTRAL") continue;
      var c = pathCentroid(el);
      if (!c) continue;
      var area = 0;
      try {
        var b = el.getBBox();
        area = b.width * b.height;
      } catch (e) {}
      var prev = byIso[iso];
      if (!prev || area > prev.area) {
        byIso[iso] = { x: c.x, y: c.y, area: area, name: name };
      }
    }
    return byIso;
  }

  function warPairs(g) {
    var pairs = [];
    (g.activeWars || []).forEach(function (w) {
      if (!w || !w.target) return;
      var atk = w.attacker || g.player;
      pairs.push({ a: atk, b: w.target, progress: w.progress || 0 });
    });
    return pairs;
  }

  function isAtWarWith(g, iso) {
    return (g.activeWars || []).some(function (w) {
      var atk = w.attacker || g.player;
      return (atk === g.player && w.target === iso) || (w.target === g.player && atk === iso);
    });
  }

  function refreshMapOverlays() {
    var g = GS();
    var po = owners();
    if (!g || !g.running || !po) return;
    if (typeof d3 === "undefined") return;

    // Army ISO/number labels removed — map clutter
    var layer = ensureArmyLayer();
    if (layer) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }
    lastMarkerKey = "";

    // Front highlight: stroke war-border provinces thicker
    var front = ensureFrontLayer();
    if (front) {
      while (front.firstChild) front.removeChild(front.firstChild);
    }
    var pairs = warPairs(g);
    if (pairs.length) {
      var paths = document.querySelectorAll("#game-map path.country-path");
      for (var i = 0; i < paths.length; i++) {
        var el = paths[i];
        var name = el.getAttribute("data-name");
        var iso = po[name];
        if (!iso) continue;
        var hot = pairs.some(function (p) { return p.a === iso || p.b === iso; });
        if (!hot) continue;
        // subtle pulse via opacity on existing path stroke
        try {
          el.style.strokeWidth = "0.08px";
          el.style.stroke = pairs.some(function (p) {
            return (p.a === g.player && p.b === iso) || (p.b === g.player && p.a === iso);
          }) ? "#f97316" : "#94a3b8";
        } catch (e) {}
      }
    }
  }

  // ---------- Push front (player orders attack) ----------
  window.scPushFront = function () {
    var g = GS();
    if (!g || !g.running) return false;
    var iso = g.selectedCountry;
    if (!iso || iso === g.player) {
      slog("Saldırmak için düşman eyaleti seç.", "text-yellow-400");
      toast("Düşman seç", "info");
      return false;
    }
    var p = g.countries[g.player];
    if (!p) return false;
    var war = (g.activeWars || []).find(function (w) {
      var atk = w.attacker || g.player;
      return atk === g.player && w.target === iso;
    });
    if (!war) {
      slog("Önce savaş ilan et: " + cname(g, iso), "text-orange-400");
      toast("Savaş yok — gerekçe/ilan", "bad");
      return false;
    }
    var myDiv = totalDivs(p);
    var theirDiv = totalDivs(g.countries[iso]);
    var ratio = myDiv / Math.max(1, theirDiv);
    var gain = 4 + Math.random() * 6 * Math.min(2.2, Math.max(0.4, ratio));
    // ammo cost
    p.stockpile = p.stockpile || {};
    var gunCost = 80;
    if ((p.stockpile.guns || 0) < gunCost) {
      slog("Cephe taarruzu için mühimmat yetersiz (tüfek).", "text-red-400");
      toast("Mühimmat yok", "bad");
      return false;
    }
    p.stockpile.guns -= gunCost;
    p.money = Math.max(0, (p.money || 0) - 25);
    war.progress = Math.min(100, (war.progress || 0) + gain);
    war.attacker = g.player;

    // chance to take province immediately on strong push
    if (war.progress >= 20 && Math.random() < 0.35 * Math.min(1.5, ratio)) {
      try {
        if (typeof window.scQuickTrainInf === "function") {
          // reuse transfer from progression if exposed — local transfer
        }
      } catch (e) {}
      var taken = transferOneBorder(iso, g.player);
      if (taken) {
        slog("⚔️ Taarruz başarılı: " + taken.replace(/_/g, " ") + " düştü! Cephe %" + Math.floor(war.progress), "text-emerald-400");
        toast("Eyalet alındı", "good");
        try {
          if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
          else if (typeof window.refreshMapColors === "function") window.refreshMapColors();
        } catch (e) {}
      } else {
        slog("⚔️ Taarruz: cephe %" + Math.floor(war.progress) + " (" + cname(g, iso) + ")", "text-orange-300");
      }
    } else {
      slog("⚔️ Taarruz emri: cephe %" + Math.floor(war.progress) + " · oran " + ratio.toFixed(2), "text-orange-300");
      toast("Cephe +" + gain.toFixed(0) + "%", "info");
    }

    if (war.progress >= 100) {
      slog("🏳️ Düşman çözülüyor — zafer yakın / barış masası", "text-emerald-300 font-bold");
      try {
        if (typeof window.resolveWar === "function") {
          var idx = g.activeWars.indexOf(war);
          if (idx >= 0) window.resolveWar(idx, true);
        }
      } catch (e) {}
    }
    lastMarkerKey = "";
    refreshMapOverlays();
    try { if (typeof window.updateHUD === "function") window.updateHUD(); } catch (e) {}
    return true;
  };

  function transferOneBorder(fromIso, toIso) {
    var po = owners();
    var g = GS();
    if (!po || !g) return null;
    g.occupations = g.occupations || {};
    var gn = window.getProvinceNeighbors || (typeof getProvinceNeighbors === "function" ? getProvinceNeighbors : null);
    // Only unoccupied legal provinces of fromIso that border toIso-controlled land (owned OR occupied by toIso)
    var border = [];
    for (var name in po) {
      if (po[name] !== fromIso) continue;
      if (g.occupations[name] && g.occupations[name] !== fromIso) continue; // already occupied
      if (!gn) continue;
      try {
        var neigh = gn(name) || [];
        var touches = neigh.some(function (nb) {
          if (po[nb] === toIso) return true;
          if (g.occupations[nb] === toIso) return true;
          return false;
        });
        if (touches) border.push(name);
      } catch (e) {}
    }
    if (!border.length) return null; // no random interior grabs
    var pick = border[Math.floor(Math.random() * border.length)];
    // OCCUPATION only — legal owner stays until peace conference
    g.occupations[pick] = toIso;
    return pick;
  }

  // ---------- Advisor brief ----------
  function advisorBrief(g) {
    var po = owners();
    var p = g.countries[g.player];
    if (!p) return;
    var prov = countProvs(po, g.player);
    var divs = Math.round(totalDivs(p));
    var wars = (g.activeWars || []).length;
    var tens = Math.floor(g.globalTension || 0);
    var rank = (g.progression && g.progression.rankId) || "—";
    var threats = [];
    Object.keys(g.countries || {}).forEach(function (iso) {
      if (iso === g.player) return;
      var rel = (g.relations && g.relations[iso]) || 0;
      if (rel <= -40) threats.push(cname(g, iso));
    });
    var line =
      "📋 DANIŞMAN BRİFİNGİ · Eyalet " +
      prov +
      " · Tümen ≈" +
      divs +
      " · Savaş " +
      wars +
      " · Gerilim %" +
      tens +
      " · Rütbe " +
      rank +
      (threats.length ? " · Tehdit: " + threats.slice(0, 3).join(", ") : " · Ciddi tehdit yok");
    slog(line, "text-cyan-300");
    // soft goals
    if (divs < 8) slog("💡 Öneri: +Piyade ile orduyu 8+ tümen yap.", "text-slate-400");
    else if ((p.civFactories || 0) < 30) slog("💡 Öneri: Sivil fabrika bas — ekonomi kar topu.", "text-slate-400");
    else if (wars === 0 && threats.length) slog("💡 Öneri: Zayıf komşuya gerekçe aç veya ittifak ara.", "text-slate-400");
    else if (wars > 0) slog("💡 Öneri: Cephede 'Taarruz' bas — mühimmat karşılığı ilerleme.", "text-slate-400");
  }

  // ---------- Victory bar chip ----------
  function refreshVictoryChip(g) {
    var po = owners();
    var my = countProvs(po, g.player);
    var total = po ? Object.keys(po).length : 1083;
    var share = total ? my / total : 0;
    var el = document.getElementById("sc-victory-chip");
    if (!el) {
      el = document.createElement("div");
      el.id = "sc-victory-chip";
      el.style.cssText =
        "position:fixed;top:3.2rem;right:0.6rem;z-index:92;background:rgba(8,12,18,.92);border:1px solid #334155;border-radius:8px;padding:6px 10px;font:11px system-ui;color:#e2e8f0;min-width:140px;pointer-events:none;";
      document.body.appendChild(el);
    }
    var pct = Math.min(100, Math.round(share * 1000) / 10);
    var goal = 35;
    el.innerHTML =
      '<div style="color:#94a3b8;font-size:9px;letter-spacing:.12em;text-transform:uppercase;">Hakimiyet</div>' +
      '<div style="font-weight:700;color:#fbbf24;">%' +
      pct +
      " <span style=\"color:#64748b;font-weight:500\">/ %" +
      goal +
      " hedef</span></div>" +
      '<div style="margin-top:4px;height:4px;background:#1e293b;border-radius:2px;overflow:hidden;">' +
      '<div style="height:100%;width:' +
      Math.min(100, (pct / goal) * 100) +
      '%;background:linear-gradient(90deg,#b45309,#fbbf24);"></div></div>';
  }

  // ---------- Dock: add Taarruz button ----------
  function enhanceDock() {
    var dock = document.getElementById("sc-cmd-dock");
    if (!dock || dock.querySelector("#sc-push-front-btn")) return;
    var wrap = dock.firstElementChild;
    if (!wrap) return;
    var btn = document.createElement("button");
    btn.id = "sc-push-front-btn";
    btn.type = "button";
    btn.textContent = "⚔ Taarruz";
    btn.style.cssText =
      "font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #b91c1c;background:#450a0a;color:#fecaca;cursor:pointer;";
    btn.onclick = function () {
      scPushFront();
    };
    wrap.appendChild(btn);
  }

  // ---------- Pulse ----------
  var lastDay = -1;
  function evolvePulse() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    enhanceDock();
    refreshMapOverlays();
    refreshVictoryChip(g);

    var day = 0;
    try {
      if (g.date) day = Math.floor(g.date.getTime() / 86400000);
    } catch (e) {}
    if (day !== lastDay) {
      lastDay = day;
      // weekly brief every 7 days
      if (day % 7 === 0) {
        try { advisorBrief(g); } catch (e) {}
      }
      // light AI army growth so markers change
      if (day % 5 === 0 && Math.random() < 0.5) {
        Object.keys(g.countries || {}).forEach(function (iso) {
          if (iso === g.player) return;
          var c = g.countries[iso];
          if (!c || c.isCapitulated) return;
          if ((c.money || 0) > 400 && Math.random() < 0.15) {
            c.money -= 120;
            c.divisions = c.divisions || { inf: 0, art: 0, arm: 0 };
            c.divisions.inf = (c.divisions.inf || 0) + 1;
          }
        });
        lastMarkerKey = "";
      }
    }
  }

  // Hook gameTick
  function wrap() {
    var prev = window.gameTick;
    if (typeof prev !== "function" || prev._evolveWrapped) return typeof prev === "function" && prev._evolveWrapped;
    window.gameTick = function () {
      try { prev.apply(this, arguments); } catch (e) {}
      try { evolvePulse(); } catch (e) { console.warn("[evolve]", e); }
    };
    window.gameTick._evolveWrapped = true;
    return true;
  }

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (wrap() || tries > 80) clearInterval(iv);
  }, 250);

  /* overlay interval removed — anti-blink */

  // purge labels if any residual nodes exist
  try {
    var dead = document.getElementById("sc-army-layer");
    if (dead) while (dead.firstChild) dead.removeChild(dead.firstChild);
  } catch (e) {}
  console.log("[evolve] army labels OFF · taarruz · advisor · victory chip");
})();
