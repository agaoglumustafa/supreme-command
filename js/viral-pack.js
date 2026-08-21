// ===== SC Viral Pack v1.3.0 =====
// 1) Harita akışı / yeniden oynatma (timelapse & replay)
// 2) Tarihi seferler (campaigns)
// 3) Topluluk atölyesi (workshop import/export)
(function SCViralPack() {
  "use strict";

  var MAX_FRAMES = 420;
  var SAMPLE_EVERY = 1; // record on ownership change or every N ticks
  var tickCounter = 0;

  function GS() {
    try { return window.GameState || null; } catch (e) { return null; }
  }
  function owners() {
    try {
      return window.provinceOwners || (typeof provinceOwners !== "undefined" ? provinceOwners : {});
    } catch (e) { return {}; }
  }
  function slog(msg, cls) {
    try {
      if (typeof window.log === "function") window.log(msg, cls || "text-sky-300");
      else console.log(msg);
    } catch (e) { console.log(msg); }
  }
  function toast(msg, kind) {
    try { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); } catch (e) {}
  }

  // =====================================================================
  // 1) HISTORY RECORDER + TIMELAPSE
  // =====================================================================
  function ensureHistory() {
    if (!window.__SC_HISTORY) {
      window.__SC_HISTORY = {
        base: null,
        frames: [], // { day, delta: {name: iso} }  OR full snap sparsely
        lastSnap: null,
        dayLabel: ""
      };
    }
    return window.__SC_HISTORY;
  }

  function cloneOwnersLite(po) {
    var out = {};
    var keys = Object.keys(po || {});
    for (var i = 0; i < keys.length; i++) out[keys[i]] = po[keys[i]];
    return out;
  }

  function diffOwners(prev, next) {
    var delta = {};
    var changed = 0;
    var keys = Object.keys(next || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (prev[k] !== next[k]) {
        delta[k] = next[k];
        changed++;
      }
    }
    // removed keys rare — ignore
    return changed ? delta : null;
  }

  function recordHistoryFrame(force) {
    var g = GS();
    if (!g || !g.running) return;
    var po = owners();
    if (!po || !Object.keys(po).length) return;
    var H = ensureHistory();
    tickCounter++;

    var day =
      g.date && g.date.toISOString
        ? g.date.toISOString().slice(0, 10)
        : "t" + tickCounter;

    if (!H.base) {
      H.base = cloneOwnersLite(po);
      H.lastSnap = cloneOwnersLite(po);
      H.frames.push({ day: day, full: true, delta: null });
      H.dayLabel = day;
      return;
    }

    var delta = diffOwners(H.lastSnap, po);
    if (!delta && !force) {
      // still sample every 14 ticks for timeline density
      if (tickCounter % 14 !== 0) return;
      H.frames.push({ day: day, full: false, delta: {} });
    } else {
      H.frames.push({ day: day, full: false, delta: delta || {} });
      if (delta) {
        var ks = Object.keys(delta);
        for (var i = 0; i < ks.length; i++) H.lastSnap[ks[i]] = delta[ks[i]];
      }
    }

    // ring buffer — drop oldest frames (keep base)
    while (H.frames.length > MAX_FRAMES) {
      H.frames.shift();
      // after shift, base may be stale — rebuild base from remaining is hard;
      // instead compact: every prune, set base = lastSnap clone and clear frame deltas to empty markers
      if (H.frames.length > MAX_FRAMES - 10) {
        H.base = cloneOwnersLite(H.lastSnap);
        H.frames = [{ day: day, full: true, delta: null }];
      }
    }
    H.dayLabel = day;
  }

  function rebuildOwnersAt(index) {
    var H = ensureHistory();
    if (!H.base) return {};
    var map = cloneOwnersLite(H.base);
    var upto = Math.max(0, Math.min(index, H.frames.length - 1));
    for (var i = 0; i <= upto; i++) {
      var f = H.frames[i];
      if (!f) continue;
      if (f.full && i === 0) continue;
      var d = f.delta || {};
      var ks = Object.keys(d);
      for (var j = 0; j < ks.length; j++) map[ks[j]] = d[ks[j]];
    }
    return map;
  }

  function paintOwnersMap(ownerMap) {
    var g = GS();
    if (!g) return;
    try {
      document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
        var n = el.getAttribute("data-name");
        var o = ownerMap[n];
        var col = (g.countries[o] && g.countries[o].color) || "#1e293b";
        el.style.fill = col;
      });
    } catch (e) {}
  }

  var replay = {
    playing: false,
    idx: 0,
    speed: 5,
    timer: null
  };

  function stopReplay() {
    replay.playing = false;
    if (replay.timer) {
      clearInterval(replay.timer);
      replay.timer = null;
    }
  }

  function showFrame(idx) {
    var H = ensureHistory();
    if (!H.frames.length) return;
    replay.idx = Math.max(0, Math.min(idx, H.frames.length - 1));
    var map = rebuildOwnersAt(replay.idx);
    paintOwnersMap(map);
    var dayEl = document.getElementById("sc-tl-day");
    var slider = document.getElementById("sc-tl-slider");
    var f = H.frames[replay.idx];
    if (dayEl) dayEl.textContent = (f && f.day) || String(replay.idx);
    if (slider) {
      slider.max = String(Math.max(0, H.frames.length - 1));
      slider.value = String(replay.idx);
    }
  }

  function playReplay() {
    var H = ensureHistory();
    if (!H.frames.length) {
      toast("Kayıtlı harita geçmişi yok", "info");
      return;
    }
    stopReplay();
    replay.playing = true;
    var ms = Math.max(30, 400 / (replay.speed || 1));
    replay.timer = setInterval(function () {
      if (replay.idx >= H.frames.length - 1) {
        stopReplay();
        var btn = document.getElementById("sc-tl-play");
        if (btn) btn.textContent = "▶ Oynat";
        return;
      }
      showFrame(replay.idx + 1);
    }, ms);
  }

  function openTimelapse() {
    var H = ensureHistory();
    recordHistoryFrame(true);
    var old = document.getElementById("sc-tl-modal");
    if (old) old.remove();

    var modal = document.createElement("div");
    modal.id = "sc-tl-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:25000;background:rgba(2,6,23,.82);display:flex;align-items:flex-end;justify-content:center;padding:12px;";
    modal.innerHTML =
      '<div style="width:min(720px,96vw);background:#0f172a;border:2px solid #38bdf8;border-radius:14px 14px 0 0;padding:14px;color:#e2e8f0;box-shadow:0 -12px 40px rgba(0,0,0,.5);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<b style="color:#7dd3fc;letter-spacing:.06em;">HARİTA AKIŞI · YENİDEN OYNATMA</b>' +
      '<button type="button" id="sc-tl-close" style="background:0;border:0;color:#f87171;font-size:18px;cursor:pointer;">✕</button></div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">Gün: <span id="sc-tl-day" style="color:#e0f2fe;font-weight:700;">—</span> · Kare: ' +
      H.frames.length +
      " / " +
      MAX_FRAMES +
      "</div>" +
      '<input id="sc-tl-slider" type="range" min="0" max="' +
      Math.max(0, H.frames.length - 1) +
      '" value="0" style="width:100%;margin-bottom:10px;"/>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
      '<button type="button" id="sc-tl-play" style="padding:8px 14px;border-radius:8px;border:0;background:#0284c7;color:#fff;font-weight:800;cursor:pointer;">▶ Oynat</button>' +
      '<button type="button" id="sc-tl-pause" style="padding:8px 14px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-weight:700;cursor:pointer;">⏸ Duraklat</button>' +
      '<span style="font-size:11px;color:#94a3b8;margin-left:4px;">Hız:</span>' +
      '<button type="button" data-spd="1" class="sc-tl-spd" style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer;">1x</button>' +
      '<button type="button" data-spd="5" class="sc-tl-spd" style="padding:6px 10px;border-radius:6px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;cursor:pointer;">5x</button>' +
      '<button type="button" data-spd="20" class="sc-tl-spd" style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer;">20x</button>' +
      '<button type="button" id="sc-tl-live" style="margin-left:auto;padding:8px 12px;border-radius:8px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-weight:700;cursor:pointer;">Canlı haritaya dön</button>' +
      "</div>" +
      '<p style="margin:10px 0 0;font-size:10px;color:#64748b;">Sahiplik değişimleri delta olarak kaydedilir · bellek sınırı ' +
      MAX_FRAMES +
      " kare</p></div>";
    document.body.appendChild(modal);

    modal.querySelector("#sc-tl-close").onclick = function () {
      stopReplay();
      modal.remove();
      // restore live
      try {
        if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
        else paintOwnersMap(owners());
      } catch (e) {}
    };
    modal.querySelector("#sc-tl-live").onclick = modal.querySelector("#sc-tl-close").onclick;
    modal.querySelector("#sc-tl-play").onclick = function () {
      playReplay();
      modal.querySelector("#sc-tl-play").textContent = "▶ Oynat…";
    };
    modal.querySelector("#sc-tl-pause").onclick = function () {
      stopReplay();
      modal.querySelector("#sc-tl-play").textContent = "▶ Oynat";
    };
    modal.querySelector("#sc-tl-slider").oninput = function (ev) {
      stopReplay();
      showFrame(parseInt(ev.target.value, 10) || 0);
    };
    modal.querySelectorAll(".sc-tl-spd").forEach(function (btn) {
      btn.onclick = function () {
        replay.speed = parseInt(btn.getAttribute("data-spd"), 10) || 5;
        modal.querySelectorAll(".sc-tl-spd").forEach(function (b) {
          b.style.borderColor = "#475569";
          b.style.background = "#1e293b";
        });
        btn.style.borderColor = "#38bdf8";
        btn.style.background = "#0c4a6e";
        if (replay.playing) playReplay();
      };
    });
    showFrame(0);
  }
  window.scOpenTimelapse = openTimelapse;

  // =====================================================================
  // 2) HISTORICAL CAMPAIGNS
  // =====================================================================
  var CAMPAIGNS = [
    {
      id: "kurtulus",
      title: "Kurtuluş Savaşı (1919)",
      player: "TUR",
      year: 1919,
      scenarioHint: "ww1",
      blurb: "İşgale karşı ulusal mücadele. İzmir ve Eskişehir'i kurtar, boğazlara uzan, cumhuriyeti ilan et.",
      missions: [
        {
          id: "izmir",
          text: "İzmir'i kontrol et",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /izmir/i.test(k);
            });
          }
        },
        {
          id: "eskisehir",
          text: "Eskişehir veya Ankara hattını tut",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Eskisehir|Eskişehir|Ankara)/i.test(k);
            });
          }
        },
        {
          id: "bogaz",
          text: "İstanbul veya Trakya kontrolü",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Istanbul|Thrace|Trakya|Canakkale|Çanakkale)/i.test(k);
            });
          }
        },
        {
          id: "cumhuriyet",
          text: "En az 30 eyalet tut (Cumhuriyet)",
          check: function (po, p) {
            return Object.keys(po).filter(function (k) { return po[k] === p; }).length >= 30;
          }
        }
      ]
    },
    {
      id: "canakkale",
      title: "Çanakkale Geçilmez",
      player: "TUR",
      year: 1915,
      scenarioHint: "ww1",
      blurb: "Boğazları savunun. İstanbul ve Çanakkale hattını düşmana kaptırmayın; en az 18 eyalet tutun.",
      missions: [
        {
          id: "hold_ist",
          text: "İstanbul'u elinde tut",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /Istanbul/i.test(k);
            });
          }
        },
        {
          id: "hold_line",
          text: "Trakya veya Çanakkale hattı",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Thrace|Canakkale|Çanakkale|Gallipoli)/i.test(k);
            });
          }
        },
        {
          id: "survive",
          text: "En az 18 eyalet koru",
          check: function (po, p) {
            return Object.keys(po).filter(function (k) { return po[k] === p; }).length >= 18;
          }
        }
      ]
    },
    {
      id: "barbarossa_ger",
      title: "Barbarossa — Almanya (1941)",
      player: "DEU",
      year: 1941,
      scenarioHint: "ww2",
      blurb: "Doğuya yürüyüş. Moskova yönünde ilerleyin; geniş cephe tutun.",
      missions: [
        {
          id: "east",
          text: "Polonya veya Ukrayna topraklarından en az 1 eyalet",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Warsaw|Krakow|Lviv|Kiev|Minsk|Odessa)/i.test(k);
            });
          }
        },
        {
          id: "depth",
          text: "En az 35 eyalet kontrol",
          check: function (po, p) {
            return Object.keys(po).filter(function (k) { return po[k] === p; }).length >= 35;
          }
        },
        {
          id: "moscow_push",
          text: "Moskova veya Smolensk hattına dokun",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Moscow|Smolensk|Kursk)/i.test(k);
            });
          }
        }
      ]
    },
    {
      id: "barbarossa_sov",
      title: "Barbarossa — SSCB Savunması (1941)",
      player: "RUS",
      year: 1941,
      scenarioHint: "ww2",
      blurb: "Anavatan savunması. Moskova'yı tutun, karşı saldırıya geçin.",
      missions: [
        {
          id: "moscow",
          text: "Moskova'yı koru",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /Moscow/i.test(k);
            });
          }
        },
        {
          id: "hold_big",
          text: "En az 90 eyalet tut",
          check: function (po, p) {
            return Object.keys(po).filter(function (k) { return po[k] === p; }).length >= 90;
          }
        },
        {
          id: "counter",
          text: "Batıda düşman toprağı al (Berlin/Warsaw/Budapest)",
          check: function (po, p) {
            return Object.keys(po).some(function (k) {
              return po[k] === p && /(Berlin|Warsaw|Budapest|Bucharest|Konigsberg)/i.test(k);
            });
          }
        }
      ]
    }
  ];

  function ensureCampaign() {
    var g = GS();
    if (!g) return null;
    if (!g.campaign) g.campaign = null;
    return g;
  }

  function startCampaign(id) {
    var camp = CAMPAIGNS.find(function (c) { return c.id === id; });
    if (!camp) return;
    var g = ensureCampaign();
    if (!g) {
      toast("Oyun durumu yok — önce hızlı başla", "bad");
      return;
    }
    g.campaign = {
      id: camp.id,
      title: camp.title,
      missions: camp.missions.map(function (m) {
        return { id: m.id, text: m.text, done: false };
      }),
      completed: false
    };
    try {
      if (camp.player) g.player = camp.player;
      if (g.countries && g.countries[camp.player]) {
        // ok
      }
    } catch (e) {}
    // try scenario year flavor
    try {
      if (g.date && camp.year) {
        g.date = new Date(camp.year, 5, 22);
      }
    } catch (e) {}
    slog("📜 Sefer: " + camp.title, "text-amber-300 font-bold");
    toast(camp.title + " başladı", "good");
    renderCampaignHud();
    closeCampaignModal();
    // if still on menu, try quick start
    try {
      if (!g.running && typeof window.scForcePlay === "function") window.scForcePlay();
      else if (!g.running && typeof window.startGame === "function") window.startGame();
    } catch (e) {}
  }
  window.scStartCampaign = startCampaign;

  function checkCampaignMissions() {
    var g = GS();
    if (!g || !g.campaign || g.campaign.completed) return;
    var po = owners();
    var campDef = CAMPAIGNS.find(function (c) { return c.id === g.campaign.id; });
    if (!campDef) return;
    var allDone = true;
    for (var i = 0; i < campDef.missions.length; i++) {
      var m = campDef.missions[i];
      var st = g.campaign.missions[i];
      if (!st) continue;
      if (!st.done && m.check(po, g.player)) {
        st.done = true;
        slog("✓ Görev: " + m.text, "text-emerald-400");
        toast("Görev tamam: " + m.text, "good");
      }
      if (!st.done) allDone = false;
    }
    renderCampaignHud();
    if (allDone) {
      g.campaign.completed = true;
      showCampaignVictory(g.campaign.title);
    }
  }

  function showCampaignVictory(title) {
    var old = document.getElementById("sc-camp-win");
    if (old) old.remove();
    var el = document.createElement("div");
    el.id = "sc-camp-win";
    el.style.cssText =
      "position:fixed;inset:0;z-index:26000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px;";
    el.innerHTML =
      '<div style="width:min(440px,96vw);text-align:center;background:linear-gradient(180deg,#422006,#0f172a);border:2px solid #fbbf24;border-radius:16px;padding:24px;color:#fef3c7;">' +
      '<div style="font-size:40px;margin-bottom:8px;">🏳️</div>' +
      '<div style="font-size:22px;font-weight:900;letter-spacing:.08em;color:#fde68a;">SEFER BAŞARILI</div>' +
      '<div style="margin-top:10px;font-size:14px;color:#fef9c3;">' +
      (title || "") +
      "</div>" +
      '<p style="margin:14px 0;font-size:12px;color:#d6d3d1;line-height:1.5;">Tarihe geçtin. Harita akışından zaferini yeniden izleyebilirsin.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
      '<button type="button" id="sc-camp-tl" style="padding:10px 14px;border-radius:8px;border:0;background:#0284c7;color:#fff;font-weight:800;cursor:pointer;">Harita akışı</button>' +
      '<button type="button" id="sc-camp-x" style="padding:10px 14px;border-radius:8px;border:1px solid #a3a3a3;background:#1c1917;color:#e7e5e4;font-weight:700;cursor:pointer;">Kapat</button>' +
      "</div></div>";
    document.body.appendChild(el);
    el.querySelector("#sc-camp-x").onclick = function () { el.remove(); };
    el.querySelector("#sc-camp-tl").onclick = function () {
      el.remove();
      openTimelapse();
    };
    try {
      if (typeof window.scSpeakOrder === "function") window.scSpeakOrder((GS() || {}).player, "select");
    } catch (e) {}
  }

  function renderCampaignHud() {
    var g = GS();
    var box = document.getElementById("sc-camp-hud");
    if (!g || !g.campaign) {
      if (box) box.style.display = "none";
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "sc-camp-hud";
      box.style.cssText =
        "position:fixed;top:3.2rem;left:0.5rem;z-index:11000;width:min(260px,92vw);" +
        "background:rgba(28,25,23,.94);border:1px solid #a8a29e;border-radius:10px;padding:10px;color:#fafaf9;font-size:11px;";
      document.body.appendChild(box);
    }
    box.style.display = "block";
    var html =
      '<div style="font-weight:800;color:#fde68a;margin-bottom:6px;">📜 ' +
      g.campaign.title +
      "</div>";
    (g.campaign.missions || []).forEach(function (m) {
      html +=
        '<div style="margin:3px 0;color:' +
        (m.done ? "#86efac" : "#d6d3d1") +
        ';">' +
        (m.done ? "✓ " : "○ ") +
        m.text +
        "</div>";
    });
    box.innerHTML = html;
  }

  function openCampaignModal() {
    var old = document.getElementById("sc-camp-modal");
    if (old) old.remove();
    var modal = document.createElement("div");
    modal.id = "sc-camp-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:24000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:12px;";
    var cards = CAMPAIGNS.map(function (c) {
      return (
        '<button type="button" data-camp="' +
        c.id +
        '" style="text-align:left;width:100%;padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid #57534e;background:#1c1917;color:#fafaf9;cursor:pointer;">' +
        '<div style="font-weight:800;color:#fbbf24;">' +
        c.title +
        "</div>" +
        '<div style="font-size:11px;color:#a8a29e;margin-top:4px;line-height:1.4;">' +
        c.blurb +
        "</div></button>"
      );
    }).join("");
    modal.innerHTML =
      '<div style="width:min(480px,96vw);max-height:85vh;overflow:auto;background:#0c0a09;border:2px solid #fbbf24;border-radius:14px;padding:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<b style="color:#fde68a;letter-spacing:.06em;">TARİHİ SEFERLER</b>' +
      '<button type="button" id="sc-camp-close" style="background:0;border:0;color:#f87171;font-size:18px;cursor:pointer;">✕</button></div>' +
      cards +
      "</div>";
    document.body.appendChild(modal);
    modal.querySelector("#sc-camp-close").onclick = closeCampaignModal;
    modal.querySelectorAll("[data-camp]").forEach(function (btn) {
      btn.onclick = function () {
        startCampaign(btn.getAttribute("data-camp"));
      };
    });
  }
  function closeCampaignModal() {
    var m = document.getElementById("sc-camp-modal");
    if (m) m.remove();
  }
  window.scOpenCampaigns = openCampaignModal;

  // =====================================================================
  // 3) WORKSHOP
  // =====================================================================
  var BUILTIN_TEMPLATES = [
    {
      id: "anadolu_odak",
      name: "Anadolu Odak (şablon)",
      desc: "Türkiye çevresi — mevcut haritada TUR güçlendirilmiş başlangıç fikri",
      apply: function () {
        var po = owners();
        var g = GS();
        if (!g) return;
        // boost: mark a few named if neutral
        Object.keys(po).forEach(function (k) {
          if (/(Ankara|Istanbul|Izmir|Konya|Antalya|Sivas|Erzurum|Trabzon)/i.test(k)) {
            // leave ownership; just toast flavor
          }
        });
        toast("Anadolu odak şablonu — sefere TUR ile devam", "info");
        try {
          g.player = "TUR";
        } catch (e) {}
      }
    },
    {
      id: "avrupa_savas",
      name: "Avrupa Savaşları (şablon)",
      desc: "DEU / FRA / GBR gerilimi — Avrupa eyaletlerinde savaş havası",
      apply: function () {
        var g = GS();
        if (!g) return;
        g.globalTension = Math.max(g.globalTension || 0, 70);
        toast("Avrupa gerilimi yükseltildi", "info");
      }
    },
    {
      id: "pasifik",
      name: "Pasifik (şablon)",
      desc: "JPN / USA odak — gerilim",
      apply: function () {
        var g = GS();
        if (!g) return;
        g.globalTension = Math.max(g.globalTension || 0, 65);
        try {
          g.player = "JPN";
        } catch (e) {}
        toast("Pasifik şablonu — JPN önerilir", "info");
      }
    }
  ];

  function exportWorkshopMap() {
    try {
      if (typeof window.scSplitExport === "function") {
        window.scSplitExport();
        return;
      }
    } catch (e) {}
    var g = GS();
    var po = owners();
    var features = [];
    document.querySelectorAll("#game-map path.country-path").forEach(function (el) {
      features.push({ name: el.getAttribute("data-name"), path: el.getAttribute("d") });
    });
    var payload = {
      meta: { tool: "SCWorkshop", version: "1.3.0", exportedAt: new Date().toISOString() },
      map: features,
      provinceOwners: po,
      PROVINCE_DATA: window.PROVINCE_DATA || {},
      scenario: {
        id: "workshop_custom",
        name: "Atölye Haritası",
        provinceOwners: po
      }
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sc_workshop_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
    toast("Harita JSON indirildi", "good");
  }

  function importWorkshopFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (typeof window.scImportSplitMap === "function" && data.map) {
          window.scImportSplitMap(data);
        } else if (data.provinceOwners) {
          var po = owners();
          Object.keys(po).forEach(function (k) { delete po[k]; });
          Object.assign(po, data.provinceOwners);
          if (window.provinceOwners) window.provinceOwners = po;
          if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
          toast("Sahiplik yüklendi", "good");
        } else {
          toast("Geçersiz atölye dosyası", "bad");
          return;
        }
        slog("🛠 Atölye haritası yüklendi", "text-violet-300");
        toast("Atölye haritası uygulandı", "good");
      } catch (e) {
        console.error(e);
        toast("JSON okunamadı", "bad");
      }
    };
    reader.readAsText(file);
  }

  function openWorkshop() {
    var old = document.getElementById("sc-ws-modal");
    if (old) old.remove();
    var modal = document.createElement("div");
    modal.id = "sc-ws-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:24000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:12px;";
    var tpls = BUILTIN_TEMPLATES.map(function (t) {
      return (
        '<button type="button" data-tpl="' +
        t.id +
        '" style="width:100%;text-align:left;padding:10px;margin-bottom:6px;border-radius:8px;border:1px solid #5b21b6;background:#1e1b4b;color:#e9d5ff;cursor:pointer;">' +
        "<b>" +
        t.name +
        '</b><div style="font-size:11px;color:#c4b5fd;margin-top:3px;">' +
        t.desc +
        "</div></button>"
      );
    }).join("");
    modal.innerHTML =
      '<div style="width:min(460px,96vw);background:#0f0a1a;border:2px solid #8b5cf6;border-radius:14px;padding:16px;color:#ede9fe;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:10px;">' +
      '<b style="color:#c4b5fd;">TOPLULUK ATÖLYESİ</b>' +
      '<button type="button" id="sc-ws-x" style="background:0;border:0;color:#f87171;font-size:18px;cursor:pointer;">✕</button></div>' +
      '<p style="font-size:11px;color:#a78bfa;margin:0 0 10px;line-height:1.4;">goodbye editöründen indirdiğin JSON dosyasını yükle veya şablon seç. Arkadaşına gönder, o da buradan açsın.</p>' +
      '<div id="sc-ws-drop" style="border:2px dashed #7c3aed;border-radius:10px;padding:20px;text-align:center;margin-bottom:12px;background:#1e1b4b;cursor:pointer;">' +
      '<div style="font-weight:700;">JSON sürükle-bırak veya tıkla</div>' +
      '<div style="font-size:10px;color:#c4b5fd;margin-top:4px;">sc_split_map_*.json / atölye dosyası</div>' +
      '<input id="sc-ws-file" type="file" accept="application/json,.json" style="display:none"/>' +
      "</div>" +
      '<button type="button" id="sc-ws-export" style="width:100%;padding:10px;margin-bottom:12px;border-radius:8px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-weight:800;cursor:pointer;">⬇ Mevcut haritayı dışa aktar</button>' +
      '<div style="font-size:10px;color:#a78bfa;margin-bottom:6px;font-weight:700;">HAZIR ŞABLONLAR</div>' +
      tpls +
      "</div>";
    document.body.appendChild(modal);
    modal.querySelector("#sc-ws-x").onclick = function () { modal.remove(); };
    var drop = modal.querySelector("#sc-ws-drop");
    var fileInput = modal.querySelector("#sc-ws-file");
    drop.onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      if (fileInput.files && fileInput.files[0]) importWorkshopFile(fileInput.files[0]);
    };
    drop.ondragover = function (e) {
      e.preventDefault();
      drop.style.borderColor = "#c4b5fd";
    };
    drop.ondragleave = function () {
      drop.style.borderColor = "#7c3aed";
    };
    drop.ondrop = function (e) {
      e.preventDefault();
      drop.style.borderColor = "#7c3aed";
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importWorkshopFile(f);
    };
    modal.querySelector("#sc-ws-export").onclick = exportWorkshopMap;
    modal.querySelectorAll("[data-tpl]").forEach(function (btn) {
      btn.onclick = function () {
        var t = BUILTIN_TEMPLATES.find(function (x) {
          return x.id === btn.getAttribute("data-tpl");
        });
        if (t) t.apply();
        modal.remove();
      };
    });
  }
  window.scOpenWorkshop = openWorkshop;

  // =====================================================================
  // MENU + HUD BUTTONS
  // =====================================================================
  function injectMainMenuButtons() {
    return; // VIRAL_UI_OFF
    var menu = document.querySelector("#main-menu-screen .sc-menu-card") ||
      document.querySelector("#main-menu-screen");
    if (!menu) return;
    if (document.getElementById("mm-campaigns")) return;
    var anchor = document.getElementById("mm-quick-play") || menu.querySelector("button");
    function mk(id, label, onclick, style) {
      var b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = "mm-btn";
      b.textContent = label;
      b.onclick = onclick;
      if (style) b.setAttribute("style", style);
      return b;
    }
    var camp = mk(
      "mm-campaigns",
      "📜 Tarihi Seferler",
      openCampaignModal,
      "background:linear-gradient(180deg,#3d2a12,#1a1208);border-color:#a8782d;"
    );
    var ws = mk(
      "mm-workshop",
      "🛠 Topluluk Atölyesi",
      openWorkshop,
      "background:linear-gradient(180deg,#2a1a4a,#12081f);border-color:#6d28d9;"
    );
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(camp, anchor.nextSibling);
      anchor.parentNode.insertBefore(ws, camp.nextSibling);
    } else {
      menu.appendChild(camp);
      menu.appendChild(ws);
    }
  }

  function ensureGameHudButtons() {
    return; // VIRAL_UI_OFF
    if (document.getElementById("sc-viral-hud")) return;
    var hud = document.createElement("div");
    hud.id = "sc-viral-hud";
    hud.style.cssText =
      "position:fixed;top:0.45rem;right:0.5rem;z-index:11500;display:none;gap:6px;";
    hud.innerHTML =
      '<button type="button" id="sc-btn-tl" title="Harita akışı" style="padding:5px 8px;border-radius:6px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:11px;font-weight:700;cursor:pointer;">🎬 Akış</button>' +
      '<button type="button" id="sc-btn-ws" style="padding:5px 8px;border-radius:6px;border:1px solid #8b5cf6;background:#2e1065;color:#ede9fe;font-size:11px;font-weight:700;cursor:pointer;">🛠 Atölye</button>';
    document.body.appendChild(hud);
    hud.style.display = "flex";
    document.getElementById("sc-btn-tl").onclick = openTimelapse;
    document.getElementById("sc-btn-ws").onclick = openWorkshop;
  }

  function syncHudVisibility() {
    var hud = document.getElementById("sc-viral-hud");
    var g = GS();
    if (hud) hud.style.display = g && g.running ? "flex" : "none";
    renderCampaignHud();
  }

  // ---------- hooks ----------
  function hookGameTick() {
    try {
      var gt = window.gameTick;
      if (!gt || gt._scViral) return;
      window.gameTick = function () {
        var r = gt.apply(this, arguments);
        try {
          recordHistoryFrame(false);
          if (tickCounter % 2 === 0) checkCampaignMissions();
        } catch (e) {}
        return r;
      };
      window.gameTick._scViral = true;
    } catch (e) {}
  }

  function boot() {
    /* REMOVED: timelapse, workshop, campaign HUD — user request */
    try {
      ["sc-viral-hud","sc-camp-hud","sc-tl-modal","sc-ws-modal","sc-camp-modal"].forEach(function(id){
        var el=document.getElementById(id); if(el) el.remove();
      });
      ["mm-campaigns","mm-workshop"].forEach(function(id){
        var el=document.getElementById(id); if(el) el.remove();
      });
    } catch(e) {}
    console.log("[viral-pack] disabled (stripped)");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
