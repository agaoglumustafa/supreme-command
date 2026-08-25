// ===== SC Atmosphere Pack v1.2.0 =====
// 1) National order voices (Web Speech API)
// 2) Railways + supply hubs + attrition
// 3) Ultimatums + formable_disabled nations
(function SCAtmosphere() {
  "use strict";

  // ---------- helpers ----------
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
      if (typeof window.log === "function") window.log(msg, cls || "text-cyan-300");
      else console.log(msg);
    } catch (e) { console.log(msg); }
  }
  function toast(msg, kind) {
    try { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); } catch (e) {}
  }
  function ensureState() {
    var g = GS();
    if (!g) return null;
    if (!g.rails) g.rails = {}; // key "A||B" sorted → level 1-5
    if (!g.supplyHubs) g.supplyHubs = {}; // provinceName → true
    if (!g.ultimatums) g.ultimatums = [];
    if (!g.formedNations) g.formedNations = {};
    g.voiceMuted = true; // ses emirleri kaldırıldı
  g.ultimatums = [];
  g.formable_disabledsDisabled = true;
    return g;
  }

  // =====================================================================
  // 1) NATIONAL VOICE ENGINE
  // =====================================================================
  var LANG_BY_ISO = {
    TUR: "tr-TR", AZE: "tr-TR", AZR: "tr-TR",
    USA: "en-US", GBR: "en-GB", ENG: "en-GB", CAN: "en-CA", AUS: "en-AU",
    FRA: "fr-FR", BEL: "fr-FR",
    DEU: "de-DE", GER: "de-DE", AUT: "de-DE",
    RUS: "ru-RU", SOV: "ru-RU", UKR: "uk-UA",
    ITA: "it-IT",
    ESP: "es-ES", MEX: "es-MX", ARG: "es-ES", BRA: "pt-BR", PRT: "pt-PT",
    JPN: "ja-JP",
    CHN: "zh-CN",
    KOR: "ko-KR", PRK: "ko-KR",
    POL: "pl-PL",
    NLD: "nl-NL",
    SWE: "sv-SE", NOR: "nb-NO", FIN: "fi-FI",
    GRE: "el-GR", GRC: "el-GR",
    ROU: "ro-RO", HUN: "hu-HU",
    IRN: "fa-IR",
    IND: "hi-IN",
    PAK: "ur-PK",
    SAU: "ar-SA", EGY: "ar-EG", IRQ: "ar-IQ", SYR: "ar-SY", ISR: "he-IL",
    IDN: "id-ID", THA: "th-TH", VNM: "vi-VN"
  };

  var PHRASES = {
    "tr-TR": {
      select: ["Hazır!", "Emrinizde!", "Toparlanın!", "Dikkat!", "Komutanım!"],
      move: ["Yürüyün!", "İlerleyin!", "Hareket!", "Yola çıkın!"],
      attack: ["Nişan alın!", "Ateş!", "Hücum!", "Saldırın!"],
      defend: ["Savunma!", "Mevzilenin!", "Tutun!"]
    },
    "en-US": {
      select: ["Ready!", "Yes sir!", "Attention!", "Standing by!", "Awaiting orders!"],
      move: ["Move out!", "On the march!", "Advance!", "Let's go!"],
      attack: ["Take aim!", "Fire!", "Engage!", "Attack!"],
      defend: ["Hold the line!", "Defend!", "Stand firm!"]
    },
    "en-GB": {
      select: ["Ready!", "Aye sir!", "Attention!", "Standing by!"],
      move: ["Move out!", "Advance!", "Onwards!"],
      attack: ["Take aim!", "Fire!", "Engage the enemy!"],
      defend: ["Hold fast!", "Defend!", "Stand firm!"]
    },
    "en-CA": null,
    "en-AU": null,
    "fr-FR": {
      select: ["Prêt!", "À vos ordres!", "Attention!", "En garde!"],
      move: ["En avant!", "Marchez!", "Avancez!"],
      attack: ["Feu!", "Attaquez!", "Chargez!"],
      defend: ["Tenez bon!", "Défendez!", "Résistez!"]
    },
    "de-DE": {
      select: ["Bereit!", "Zu Befehl!", "Achtung!", "Melde mich!"],
      move: ["Vorwärts!", "Marsch!", "Vorrücken!"],
      attack: ["Feuer frei!", "Angriff!", "Feuer!"],
      defend: ["Halten!", "Verteidigen!", "Standhaft!"]
    },
    "ru-RU": {
      select: ["Gotov!", "Tak tochno!", "Vnimanie!", "Slushayus!"],
      move: ["Vpered!", "Marsh!", "Dvigaemsya!"],
      attack: ["Ogon!", "Ataka!", "K boyu!"],
      defend: ["Derzhites!", "Oborona!", "Stoyat!"]
    },
    "uk-UA": {
      select: ["Hotovyi!", "Tak!", "Uvaha!"],
      move: ["Vpered!", "Rushaty!"],
      attack: ["Vohon!", "Ataka!"],
      defend: ["Trymaites!", "Oborona!"]
    },
    "it-IT": {
      select: ["Pronto!", "Ai suoi ordini!", "Attenzione!"],
      move: ["Avanti!", "Marciate!", "In movimento!"],
      attack: ["Fuoco!", "Attaccate!", "Caricate!"],
      defend: ["Difendete!", "Resistere!", "Tenete!"]
    },
    "es-ES": {
      select: ["¡Listo!", "¡A la orden!", "¡Atención!"],
      move: ["¡Adelante!", "¡Marchen!", "¡En movimiento!"],
      attack: ["¡Fuego!", "¡Ataquen!", "¡Carguen!"],
      defend: ["¡Defiendan!", "¡Resistan!", "¡Mantengan!"]
    },
    "es-MX": null,
    "pt-BR": {
      select: ["Pronto!", "Às ordens!", "Atenção!"],
      move: ["Avançar!", "Marchar!", "Em movimento!"],
      attack: ["Fogo!", "Atacar!", "Carregar!"],
      defend: ["Defender!", "Resistir!", "Aguentar!"]
    },
    "pt-PT": null,
    "ja-JP": {
      select: ["準備完了!", "はい!", "注目!"],
      move: ["前進!", "移動!", "進め!"],
      attack: ["撃て!", "攻撃!", "突撃!"],
      defend: ["守れ!", "防衛!", "耐えよ!"]
    },
    "zh-CN": {
      select: ["准备完毕!", "是!", "注意!"],
      move: ["前进!", "移动!", "出发!"],
      attack: ["开火!", "攻击!", "冲锋!"],
      defend: ["防守!", "坚持!", "守住!"]
    },
    "ko-KR": {
      select: ["준비 완료!", "예!", "주의!"],
      move: ["전진!", "이동!", "출발!"],
      attack: ["발사!", "공격!", "돌격!"],
      defend: ["방어!", "버텨라!", "사수!"]
    },
    "pl-PL": {
      select: ["Gotowy!", "Tak jest!", "Uwaga!"],
      move: ["Naprzód!", "Marsz!", "Ruszamy!"],
      attack: ["Ogień!", "Atak!", "Szturm!"],
      defend: ["Brońcie!", "Wytrzymajcie!", "Trzymajcie!"]
    },
    "nl-NL": {
      select: ["Klaar!", "Tot uw dienst!", "Attentie!"],
      move: ["Voorwaarts!", "Mars!", "In beweging!"],
      attack: ["Vuur!", "Aanvallen!", "Bestormen!"],
      defend: ["Verdedig!", "Houd stand!", "Weerstaan!"]
    },
    "sv-SE": {
      select: ["Redo!", "Ja!", "Uppmärksamhet!"],
      move: ["Framåt!", "Marsch!", "Rör er!"],
      attack: ["Eld!", "Anfall!", "Attack!"],
      defend: ["Försvara!", "Håll stånd!", "Stå fast!"]
    },
    "nb-NO": {
      select: ["Klar!", "Ja!", "Oppmerksomhet!"],
      move: ["Fremover!", "Marsj!", "Beveg dere!"],
      attack: ["Ild!", "Angrip!", "Storm!"],
      defend: ["Forsvar!", "Hold stand!", "Stå fast!"]
    },
    "fi-FI": {
      select: ["Valmis!", "Kyllä!", "Huomio!"],
      move: ["Eteenpäin!", "Marssi!", "Liikkeelle!"],
      attack: ["Tulta!", "Hyökkäys!", "Rynnäkkö!"],
      defend: ["Puolusta!", "Pitäkää!", "Kestäkää!"]
    },
    "el-GR": {
      select: ["Έτοιμοι!", "Ναι!", "Προσοχή!"],
      move: ["Εμπρός!", "Βημα!", "Κίνηση!"],
      attack: ["Πυρ!", "Επίθεση!", "Έφοδος!"],
      defend: ["Άμυνα!", "Αντέξτε!", "Κρατήστε!"]
    },
    "ro-RO": {
      select: ["Gata!", "Da!", "Atenție!"],
      move: ["Înainte!", "Marș!", "Mișcare!"],
      attack: ["Foc!", "Atac!", "Asalt!"],
      defend: ["Apărați!", "Rezistați!", "Țineți!"]
    },
    "hu-HU": {
      select: ["Kész!", "Igen!", "Figyelem!"],
      move: ["Előre!", "Menet!", "Indulás!"],
      attack: ["Tűz!", "Támadás!", "Roham!"],
      defend: ["Védjetek!", "Tartsatok!", "Álljatok!"]
    },
    "fa-IR": {
      select: ["آماده!", "بله!", "توجه!"],
      move: ["پیش!", "حرکت!", "راه بیفتید!"],
      attack: ["آتش!", "حمله!", "یورش!"],
      defend: ["دفاع!", "مقاومت!", "نگه دارید!"]
    },
    "hi-IN": {
      select: ["तैयार!", "जी हाँ!", "ध्यान!"],
      move: ["आगे!", "चलो!", "प्रस्थान!"],
      attack: ["आग!", "हमला!", "आक्रमण!"],
      defend: ["रक्षा!", "टिके रहो!", "थामे रहो!"]
    },
    "ur-PK": {
      select: ["تیار!", "جی!", "توجہ!"],
      move: ["آگے!", "چلو!", "حرکت!"],
      attack: ["آگ!", "حملہ!", "یورش!"],
      defend: ["دفاع!", "ثابت قدم!", "روکو!"]
    },
    "ar-SA": {
      select: ["جاهز!", "نعم!", "انتباه!"],
      move: ["تقدموا!", "تحركوا!", "انطلقوا!"],
      attack: ["أطلقوا النار!", "هاجموا!", "اقتحموا!"],
      defend: ["دافعوا!", "اصمدوا!", "اثبتوا!"]
    },
    "ar-EG": null,
    "ar-IQ": null,
    "ar-SY": null,
    "he-IL": {
      select: ["מוכן!", "כן!", "תשומת לב!"],
      move: ["קדימה!", "זוזו!", "צעידה!"],
      attack: ["אש!", "התקפה!", "הסתערות!"],
      defend: ["הגנה!", "עמידה!", "החזיקו!"]
    },
    "id-ID": {
      select: ["Siap!", "Ya!", "Perhatian!"],
      move: ["Maju!", "Bergerak!", "Berangkat!"],
      attack: ["Tembak!", "Serang!", "Serbu!"],
      defend: ["Bertahan!", "Lindungi!", "Tahan!"]
    },
    "th-TH": {
      select: ["พร้อม!", "ครับ!", "ระวัง!"],
      move: ["เดินหน้า!", "เคลื่อนที่!", "ออกเดิน!"],
      attack: ["ยิง!", "โจมตี!", "บุก!"],
      defend: ["ป้องกัน!", "ต้านทาน!", "ยืนหยัด!"]
    },
    "vi-VN": {
      select: ["Sẵn sàng!", "Vâng!", "Chú ý!"],
      move: ["Tiến lên!", "Di chuyển!", "Xuất phát!"],
      attack: ["Bắn!", "Tấn công!", "Xông lên!"],
      defend: ["Phòng thủ!", "Giữ vững!", "Chống đỡ!"]
    }
  };
  // fill aliases
  PHRASES["en-CA"] = PHRASES["en-US"];
  PHRASES["en-AU"] = PHRASES["en-GB"];
  PHRASES["es-MX"] = PHRASES["es-ES"];
  PHRASES["pt-PT"] = PHRASES["pt-BR"];
  PHRASES["ar-EG"] = PHRASES["ar-SA"];
  PHRASES["ar-IQ"] = PHRASES["ar-SA"];
  PHRASES["ar-SY"] = PHRASES["ar-SA"];

  var lastVoiceAt = 0;
  var voiceQueueBusy = false;

  function pickPhrase(iso, kind) {
    var lang = LANG_BY_ISO[iso] || "en-US";
    var pack = PHRASES[lang] || PHRASES["en-US"];
    var list = pack[kind] || pack.select || ["Ready!"];
    return { text: list[Math.floor(Math.random() * list.length)], lang: lang };
  }

  function scSpeakOrder(iso, kind) {
    try {
      var g = ensureState();
      if (!g || g.voiceMuted) return;
      if (!window.speechSynthesis) return;
      var now = Date.now();
      if (now - lastVoiceAt < 650) return; // throttle
      lastVoiceAt = now;
      var p = pickPhrase(iso || (g && g.player) || "USA", kind || "select");
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(p.text);
      u.lang = p.lang;
      u.rate = 1.05;
      u.pitch = 1.0;
      u.volume = 0.85;
      // try match voice
      try {
        var voices = window.speechSynthesis.getVoices() || [];
        var match = voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf(p.lang.slice(0, 2)) === 0; });
        if (match) u.voice = match;
      } catch (e) {}
      try { window.speechSynthesis.cancel(); } catch(e){}
      /* voice off */
    } catch (e) {
      console.warn("[voice]", e);
    }
  }
  window.scSpeakOrder = function () {}; // disabled

  // Hook province click → select voice for owner if player's unit-like selection
  function wrapProvinceClick() {
    var names = ["handleProvinceClick"];
    names.forEach(function (fn) {
      try {
        var orig = window[fn] || (typeof handleProvinceClick !== "undefined" ? handleProvinceClick : null);
        if (!orig || orig._scVoice) return;
        var wrapped = function (event, d) {
          try {
            var g = GS();
            var name = d && (d.name || d);
            var po = owners();
            var owner = name && po ? po[name] : null;
            if (g && owner && owner === g.player) scSpeakOrder(owner, "select");
            else if (g && owner) {
              // enemy province glance: soft attention in player tongue occasionally skip
            }
          } catch (e) {}
          return orig.apply(this, arguments);
        };
        wrapped._scVoice = true;
        try { window[fn] = wrapped; } catch (e) {}
        try { if (typeof handleProvinceClick !== "undefined") handleProvinceClick = wrapped; } catch (e) {}
      } catch (e) {}
    });
  }

  // Hook push front / attack
  function wrapCombatHooks() {
    try {
      if (window.scPushFront && !window.scPushFront._scVoice) {
        var pf = window.scPushFront;
        window.scPushFront = function () {
          try {
            var g = GS();
            if (g) scSpeakOrder(g.player, "attack");
          } catch (e) {}
          return pf.apply(this, arguments);
        };
        window.scPushFront._scVoice = true;
      }
    } catch (e) {}
    try {
      if (typeof declareWar === "function" && !declareWar._scVoice) {
        var dw = declareWar;
        window.declareWar = function (targetIso) {
          try {
            var g = GS();
            if (g) scSpeakOrder(g.player, "attack");
          } catch (e) {}
          return dw.apply(this, arguments);
        };
        window.declareWar._scVoice = true;
        try { declareWar = window.declareWar; } catch (e) {}
      }
    } catch (e) {}
  }

  // =====================================================================
  // 2) RAILWAYS + SUPPLY HUBS
  // =====================================================================
  function railKey(a, b) {
    return a < b ? a + "||" + b : b + "||" + a;
  }

  function getNeighbors(name) {
    try {
      if (typeof getProvinceNeighbors === "function") return getProvinceNeighbors(name) || [];
      var pd = window.PROVINCE_DATA || {};
      return (pd[name] && pd[name].neighbors) || [];
    } catch (e) { return []; }
  }

  function buildRail(a, b) {
    var g = ensureState();
    if (!g || !a || !b || a === b) return false;
    var po = owners();
    if (po[a] !== g.player || po[b] !== g.player) {
      toast("Demiryolu yalnız kendi eyaletlerin arasında", "bad");
      return false;
    }
    var nbs = getNeighbors(a);
    if (nbs.indexOf(b) < 0) {
      toast("Eyaletler komşu olmalı", "bad");
      return false;
    }
    var key = railKey(a, b);
    var lvl = g.rails[key] || 0;
    if (lvl >= 5) {
      toast("Azami demiryolu seviyesi (5)", "info");
      return false;
    }
    var cost = 40 + lvl * 25;
    var c = g.countries[g.player];
    if (!c || (c.money != null && c.money < cost)) {
      // soft cost if money missing
      if (c && c.money != null) {
        toast("Yetersiz hazine (" + cost + ")", "bad");
        return false;
      }
    }
    if (c && c.money != null) c.money -= cost;
    g.rails[key] = lvl + 1;
    slog("🚂 Demiryolu " + a.replace(/_/g, " ") + " ↔ " + b.replace(/_/g, " ") + " · Sv " + g.rails[key], "text-amber-300");
    toast("Demiryolu seviye " + g.rails[key], "good");
    scSpeakOrder(g.player, "move");
    drawRails();
    return true;
  }

  function placeHub(name) {
    var g = ensureState();
    if (!g || !name) return false;
    var po = owners();
    if (po[name] !== g.player) {
      toast("İkmal merkezi yalnız kendi eyaletinde", "bad");
      return false;
    }
    if (g.supplyHubs[name]) {
      toast("Zaten ikmal merkezi var", "info");
      return false;
    }
    var c = g.countries[g.player];
    var cost = 120;
    if (c && c.money != null && c.money < cost) {
      toast("Yetersiz hazine (" + cost + ")", "bad");
      return false;
    }
    if (c && c.money != null) c.money -= cost;
    g.supplyHubs[name] = true;
    slog("📦 İkmal merkezi: " + name.replace(/_/g, " "), "text-amber-300");
    toast("İkmal merkezi kuruldu", "good");
    drawRails();
    return true;
  }

  function provinceHasSupply(name, iso) {
    var g = ensureState();
    if (!g) return true;
    var po = owners();
    // BFS along owned provinces + rails, limited depth
    var hubs = Object.keys(g.supplyHubs || {}).filter(function (h) { return po[h] === iso; });
    if (!hubs.length) return false;
    if (hubs.indexOf(name) >= 0) return true;
    var queue = hubs.map(function (h) { return { n: h, d: 0 }; });
    var seen = {};
    hubs.forEach(function (h) { seen[h] = true; });
    while (queue.length) {
      var cur = queue.shift();
      if (cur.d > 8) continue;
      var nbs = getNeighbors(cur.n);
      for (var i = 0; i < nbs.length; i++) {
        var nb = nbs[i];
        if (seen[nb]) continue;
        if (po[nb] !== iso) continue;
        var key = railKey(cur.n, nb);
        var railLvl = g.rails[key] || 0;
        // without rail only 1 step from hub; with rail deeper
        var nextD = cur.d + (railLvl > 0 ? 1 : 3);
        if (railLvl === 0 && cur.d >= 1) continue;
        seen[nb] = true;
        if (nb === name) return true;
        queue.push({ n: nb, d: nextD });
      }
    }
    return false;
  }

  function processSupplyTick() {
    var g = ensureState();
    if (!g || !g.running) return;
    var wars = g.activeWars || [];
    if (!wars.length) return;
    var po = owners();
    var involved = {};
    wars.forEach(function (w) {
      if (w.attacker) involved[w.attacker] = true;
      if (w.target) involved[w.target] = true;
    });
    Object.keys(involved).forEach(function (iso) {
      var c = g.countries[iso];
      if (!c) return;
      var owned = Object.keys(po).filter(function (p) { return po[p] === iso; });
      var unsupplied = 0;
      owned.forEach(function (p) {
        if (!provinceHasSupply(p, iso)) unsupplied++;
      });
      if (unsupplied <= 0) return;
      var ratio = unsupplied / Math.max(1, owned.length);
      // attrition: manpower + organization-like soft hit
      var loss = Math.floor(80 + ratio * 400);
      if (c.manpower != null) c.manpower = Math.max(0, c.manpower - loss);
      if (iso === g.player && Math.random() < 0.25) {
        slog("⚠️ İkmal zayıf · " + unsupplied + " eyalet hat dışı (−" + loss + " insan gücü)", "text-orange-400");
      }
    });
  }

  function drawRails() {
    try {
      var svg = document.querySelector("#game-map");
      if (!svg) return;
      var parent = window.__SC_MAP_G || svg.querySelector(":scope > g") || svg;
      if (parent && parent !== svg) window.__SC_MAP_G = parent;
      var layer = document.getElementById("sc-rail-layer");
      if (layer && layer.parentNode !== parent) {
        try { parent.appendChild(layer); } catch (e) {}
      }
      if (!layer) {
        layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.setAttribute("id", "sc-rail-layer");
        layer.setAttribute("pointer-events", "none");
        parent.appendChild(layer);
      }
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      var g = ensureState();
      if (!g) return;

      function centroid(name) {
        var el = document.querySelector('#game-map path.country-path[data-name="' + name + '"]');
        if (!el) return null;
        try {
          var b = el.getBBox();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        } catch (e) { return null; }
      }

      Object.keys(g.rails || {}).forEach(function (key) {
        var parts = key.split("||");
        if (parts.length !== 2) return;
        var ca = centroid(parts[0]), cb = centroid(parts[1]);
        if (!ca || !cb) return;
        var lvl = g.rails[key] || 1;
        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", ca.x);
        line.setAttribute("y1", ca.y);
        line.setAttribute("x2", cb.x);
        line.setAttribute("y2", cb.y);
        line.setAttribute("stroke", "#fbbf24");
        line.setAttribute("stroke-width", String(0.35 + lvl * 0.25));
        line.setAttribute("stroke-opacity", "0.85");
        line.setAttribute("stroke-dasharray", lvl >= 3 ? "none" : "2 1.5");
        layer.appendChild(line);
      });

      Object.keys(g.supplyHubs || {}).forEach(function (name) {
        var c = centroid(name);
        if (!c) return;
        var circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circ.setAttribute("cx", c.x);
        circ.setAttribute("cy", c.y);
        circ.setAttribute("r", "2.4");
        circ.setAttribute("fill", "#f59e0b");
        circ.setAttribute("stroke", "#78350f");
        circ.setAttribute("stroke-width", "0.4");
        layer.appendChild(circ);
      });
    } catch (e) {
      console.warn("[rail draw]", e);
    }
  }
  window.scDrawRails = drawRails;
  window.scBuildRail = buildRail;
  window.scPlaceHub = placeHub;

  // =====================================================================
  // 3) ULTIMATUMS + FORMABLE NATIONS
  // =====================================================================
  var FORMABLES = [
    {
      id: "misak_milli",
      tag: "TUR",
      name: "Misak-ı Milli",
      flag: "🇹🇷",
      color: "#e11d48",
      needAny: ["Istanbul", "Ankara", "Izmir", "Thrace"],
      needMinOwned: 28,
      bonus: { manpower: 15000, money: 80 },
      desc: "Misak-ı Milli sınırları ve ulusal birlik"
    },
    {
      id: "turan",
      tag: "TUR",
      name: "Turan Birliği",
      flag: "🐺",
      color: "#0ea5e9",
      needAny: ["Istanbul", "Ankara", "Baku", "Ashgabat", "Almaty", "Kazan"],
      needMinOwned: 40,
      bonus: { manpower: 25000, money: 120 },
      desc: "Geniş Turan coğrafyası birliği"
    },
    {
      id: "grossdeutschland",
      tag: "DEU",
      name: "Büyük Cermen İmparatorluğu",
      flag: "🦅",
      color: "#1e293b",
      needAny: ["Munich", "Hamburg", "Cologne", "Vienna", "Prague", "Breslau"],
      needMinOwned: 30,
      bonus: { manpower: 20000, money: 100 },
      desc: "Cermen birliği"
    },
    {
      id: "great_britain",
      tag: "GBR",
      name: "Büyük Britanya İmparatorluğu",
      flag: "🇬🇧",
      color: "#1d4ed8",
      needAny: ["Greater_London_Area", "Edinburgh", "Dublin", "Cardiff"],
      needMinOwned: 30,
      bonus: { manpower: 12000, money: 150 },
      desc: "İmparatorluk birliği"
    },
    {
      id: "greater_russia",
      tag: "RUS",
      name: "Büyük Rusya",
      flag: "🇷🇺",
      color: "#1e3a8a",
      needAny: ["Moscow", "St_Petersburg", "Kiev", "Minsk"],
      needMinOwned: 100,
      bonus: { manpower: 30000, money: 100 },
      desc: "Slav-Rus birliği"
    },
    {
      id: "roman_empire",
      tag: "ITA",
      name: "Yeni Roma",
      flag: "🏛️",
      color: "#7f1d1d",
      needAny: ["Rome", "Naples", "Milan", "Tunis", "Athens"],
      needMinOwned: 25,
      bonus: { manpower: 15000, money: 90 },
      desc: "Akdeniz hâkimiyeti"
    },
    {
      id: "napoleonic",
      tag: "FRA",
      name: "Büyük Fransa",
      flag: "🇫🇷",
      color: "#1e40af",
      needAny: ["Paris", "Lyon", "Marseille", "Brussels", "Cologne"],
      needMinOwned: 35,
      bonus: { manpower: 18000, money: 110 },
      desc: "Kıta sistemi"
    },
    {
      id: "al_andalus",
      tag: "ESP",
      name: "İber Birliği",
      flag: "🇪🇸",
      color: "#b45309",
      needAny: ["Madrid", "Barcelona", "Lisbon", "Seville"],
      needMinOwned: 25,
      bonus: { manpower: 12000, money: 80 },
      desc: "İber yarımadası birliği"
    },
    {
      id: "usa_continental",
      tag: "USA",
      name: "Kıta Amerikası",
      flag: "🇺🇸",
      color: "#1e3a8a",
      needAny: ["New_York", "California", "Texas", "Washington"],
      needMinOwned: 55,
      bonus: { manpower: 20000, money: 200 },
      desc: "Kıta ölçeği birlik"
    },
    {
      id: "dai_nippon",
      tag: "JPN",
      name: "Dai Nippon",
      flag: "🇯🇵",
      color: "#9f1239",
      needAny: ["Tokyo", "Osaka", "Seoul", "Taipei"],
      needMinOwned: 20,
      bonus: { manpower: 15000, money: 100 },
      desc: "Doğu Asya ortak refahı"
    }
  ];

  function playerOwnsName(po, player, needle) {
    var low = needle.toLowerCase();
    return Object.keys(po).some(function (p) {
      return po[p] === player && p.toLowerCase().indexOf(low) >= 0;
    });
  }

  function canForm(form) {
    var g = ensureState();
    if (!g) return false;
    if (g.formedNations[form.id]) return false;
    if (g.player !== form.tag && !(form.altTags || []).includes(g.player)) return false;
    var po = owners();
    var owned = Object.keys(po).filter(function (p) { return po[p] === g.player; }).length;
    if (owned < (form.needMinOwned || 0)) return false;
    var hits = 0;
    (form.needAny || []).forEach(function (n) {
      if (playerOwnsName(po, g.player, n)) hits++;
    });
    // need at least half of listed keys or 2
    var need = Math.max(2, Math.ceil((form.needAny || []).length * 0.4));
    return hits >= need;
  }

  function formNation(formId) {
    var form = FORMABLES.find(function (f) { return f.id === formId; });
    if (!form) return;
    if (!canForm(form)) {
      toast("Şartlar henüz tutmuyor", "bad");
      return;
    }
    var g = ensureState();
    var c = g.countries[g.player];
    if (!c) return;
    g.formedNations[form.id] = true;
    c.name = form.name;
    if (form.color) c.color = form.color;
    if (form.flag) c.flag = form.flag;
    if (form.bonus) {
      if (c.manpower != null && form.bonus.manpower) c.manpower += form.bonus.manpower;
      if (c.money != null && form.bonus.money) c.money += form.bonus.money;
    }
    try {
      if (typeof updateCountryFlag === "function") updateCountryFlag();
    } catch (e) {}
    try {
      if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
    } catch (e) {}
    slog("👑 Birlik kuruldu: " + form.name, "text-yellow-300 font-bold");
    toast(form.name + " kuruldu!", "good");
    scSpeakOrder(g.player, "select");
    refreshFormableUI();
  }
  window.scFormNation = formNation;

  function sendUltimatum(targetIso, provinceNames) {
    return; // ultimatum removed
    var g = ensureState();
    if (!g || !targetIso || targetIso === g.player) return;
    var wars = g.activeWars || [];
    if (wars.some(function (w) { return w.target === targetIso || w.attacker === targetIso; })) {
      toast("Zaten savaştasınız", "info");
      return;
    }
    provinceNames = provinceNames || [];
    var ult = {
      id: "u_" + Date.now(),
      from: g.player,
      to: targetIso,
      provinces: provinceNames.slice(0, 8),
      day: g.date ? g.date.getTime() : Date.now(),
      status: "pending"
    };
    g.ultimatums.push(ult);
    // AI response delayed via tick
    slog("📜 Ültimatom → " + ((g.countries[targetIso] && g.countries[targetIso].name) || targetIso), "text-red-300");
    toast("Ültimatom gönderildi", "info");
    scSpeakOrder(g.player, "attack");

    // Simple AI resolve soon
    setTimeout(function () {
      resolveUltimatum(ult.id);
    }, 4000);
  }
  window.__deadUltimatum = sendUltimatum;

  function resolveUltimatum(id) {
    var g = ensureState();
    if (!g) return;
    var ult = (g.ultimatums || []).find(function (u) { return u.id === id && u.status === "pending"; });
    if (!ult) return;
    var po = owners();
    var powerFrom = typeof getCountryPower === "function" ? getCountryPower(ult.from) : 50;
    var powerTo = typeof getCountryPower === "function" ? getCountryPower(ult.to) : 50;
    var acceptChance = 0.15 + Math.max(0, (powerFrom - powerTo) / 200);
    if (Math.random() < acceptChance) {
      ult.status = "accepted";
      // cede requested or a few border provinces
      var ceded = 0;
      var list = ult.provinces.length
        ? ult.provinces
        : Object.keys(po).filter(function (p) { return po[p] === ult.to; }).slice(0, 2);
      list.forEach(function (p) {
        if (po[p] === ult.to) {
          po[p] = ult.from;
          ceded++;
        }
      });
      slog("✅ Ültimatom kabul · " + ceded + " eyalet teslim", "text-emerald-400");
      toast("Ültimatom kabul edildi", "good");
      try {
        if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
      } catch (e) {}
    } else {
      ult.status = "rejected";
      slog("❌ Ültimatom reddedildi · savaş kapıda", "text-red-400");
      toast("Ültimatom reddedildi!", "bad");
      try {
        if (typeof declareWar === "function") declareWar(ult.to);
        else if (typeof window.declareWar === "function") window.declareWar(ult.to);
        else {
          g.activeWars = g.activeWars || [];
          g.activeWars.push({ attacker: ult.from, target: ult.to, progress: 0 });
        }
      } catch (e) {
        g.activeWars = g.activeWars || [];
        g.activeWars.push({ attacker: ult.from, target: ult.to, progress: 0 });
      }
    }
  }

  // =====================================================================
  // UI DOCK
  // =====================================================================
  var railMode = null; // null | 'rail' | 'hub' | 'ult'
  var railPick = null;

  function ensureDock() {
    return; // ATMO_DOCK_OFF
    if (document.getElementById("sc-atmo-dock")) return;
    var dock = document.createElement("div");
    dock.id = "sc-atmo-dock";
    dock.style.cssText =
      "position:fixed;bottom:4.5rem;left:50%;transform:translateX(-50%);z-index:12000;" +
      "display:none;gap:6px;flex-wrap:wrap;justify-content:center;max-width:96vw;" +
      "background:rgba(10,12,20,.92);border:1px solid #475569;border-radius:12px;padding:8px 10px;";
    dock.innerHTML =
      '<button type="button" data-act="rail" style="padding:6px 10px;border-radius:8px;border:1px solid #fbbf24;background:#451a03;color:#fde68a;font-weight:700;cursor:pointer;font-size:11px;">🚂 Demiryolu</button>' +
      '<button type="button" data-act="hub" style="padding:6px 10px;border-radius:8px;border:1px solid #f59e0b;background:#451a03;color:#fde68a;font-weight:700;cursor:pointer;font-size:11px;">📦 İkmal</button>' +
      '<button type="button" data-act="ult" style="padding:6px 10px;border-radius:8px;border:1px solid #f87171;background:#450a0a;color:#fecaca;font-weight:700;cursor:pointer;font-size:11px;">📜 Ültimatom</button>' +
      '<button type="button" data-act="form" style="padding:6px 10px;border-radius:8px;border:1px solid #fde047;background:#422006;color:#fef9c3;font-weight:700;cursor:pointer;font-size:11px;">👑 Birlik</button>' +
      '<button type="button" data-act="voice" style="padding:6px 10px;border-radius:8px;border:1px solid #64748b;background:#1e293b;color:#e2e8f0;font-weight:700;cursor:pointer;font-size:11px;">🔊 Ses</button>';
    document.body.appendChild(dock);
    dock.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var g = ensureState();
      if (act === "voice") {
        if (!g) return;
        g.voiceMuted = !g.voiceMuted;
        btn.textContent = g.voiceMuted ? "🔇 Ses" : "🔊 Ses";
        toast(g.voiceMuted ? "Emir sesleri kapalı" : "Emir sesleri açık", "info");
        if (!g.voiceMuted) scSpeakOrder(g.player, "select");
        return;
      }
      if (act === "form") {
        showFormableModal();
        return;
      }
      railMode = act;
      railPick = null;
      toast(
        act === "rail"
          ? "İki komşu eyalet seç (demiryolu)"
          : act === "hub"
          ? "İkmal merkezi için eyalet seç"
          : "Ültimatom: önce düşman eyaleti seç",
        "info"
      );
    });
  }

  function showFormableModal() {
    var old = document.getElementById("sc-form-modal");
    if (old) old.remove();
    var g = ensureState();
    if (!g) return;
    var list = FORMABLES.filter(function (f) {
      return f.tag === g.player || (f.altTags || []).indexOf(g.player) >= 0;
    });
    var modal = document.createElement("div");
    modal.id = "sc-form-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:22000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:12px;";
    var rows = list
      .map(function (f) {
        var ok = canForm(f);
        var done = g.formedNations[f.id];
        return (
          '<div style="border:1px solid #334155;border-radius:8px;padding:10px;margin-bottom:8px;background:#0f172a;">' +
          "<div style='font-weight:800;color:#fde68a'>" +
          f.flag +
          " " +
          f.name +
          "</div>" +
          "<div style='font-size:11px;color:#94a3b8;margin:4px 0'>" +
          f.desc +
          "</div>" +
          (done
            ? "<span style='color:#86efac;font-size:11px'>Kuruldu</span>"
            : '<button type="button" data-form="' +
              f.id +
              '" ' +
              (ok ? "" : "disabled") +
              ' style="margin-top:6px;padding:6px 10px;border-radius:6px;border:0;background:' +
              (ok ? "#ca8a04" : "#334155") +
              ";color:#fff;font-weight:700;cursor:" +
              (ok ? "pointer" : "not-allowed") +
              ';">' +
              (ok ? "Birliği Kur" : "Şartlar eksik") +
              "</button>") +
          "</div>"
        );
      })
      .join("");
    if (!rows) rows = "<p style='color:#94a3b8;font-size:12px'>Bu ülke için tanımlı birlik yok.</p>";
    modal.innerHTML =
      '<div style="width:min(420px,96vw);background:#020617;border:2px solid #ca8a04;border-radius:12px;padding:14px;color:#e2e8f0;max-height:80vh;overflow:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      "<b style='color:#fde68a'>Kurulabilir Birlikler</b>" +
      '<button type="button" id="sc-form-x" style="background:0;border:0;color:#f87171;font-size:18px;cursor:pointer;">✕</button></div>' +
      rows +
      "</div>";
    document.body.appendChild(modal);
    modal.querySelector("#sc-form-x").onclick = function () { modal.remove(); };
    modal.querySelectorAll("[data-form]").forEach(function (btn) {
      btn.onclick = function () {
        formNation(btn.getAttribute("data-form"));
        modal.remove();
      };
    });
  }

  function refreshFormableUI() {
    /* dock already dynamic on open */
  }

  function onProvinceForModes(name) {
    var g = ensureState();
    if (!g || !railMode) return false;
    if (railMode === "hub") {
      placeHub(name);
      railMode = null;
      return true;
    }
    if (railMode === "rail") {
      if (!railPick) {
        railPick = name;
        toast("İkinci komşu eyaleti seç", "info");
        return true;
      }
      buildRail(railPick, name);
      railPick = null;
      railMode = null;
      return true;
    }
    if (railMode === "ult") {
      var po = owners();
      var target = po[name];
      if (!target || target === g.player) {
        toast("Düşman eyaleti seç", "bad");
        return true;
      }
      sendUltimatum(target, [name]);
      railMode = null;
      return true;
    }
    return false;
  }

  // Intercept clicks in capture after editor
  function bindMapModes() {
    var svg = document.querySelector("#game-map");
    if (!svg || svg._scAtmoBound) return;
    svg._scAtmoBound = true;
    svg.addEventListener(
      "click",
      function (ev) {
        if (!railMode) return;
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var name = t.getAttribute("data-name");
        if (!name) return;
        if (onProvinceForModes(name)) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      },
      true
    );
  }

  // ---------- tick hook ----------
  var supplyAcc = 0;
  function hookTick() {
    try {
      if (window.gameTick && !window.gameTick._scAtmo) {
        var gt = window.gameTick;
        window.gameTick = function () {
          var r = gt.apply(this, arguments);
          try {
            supplyAcc++;
            if (supplyAcc % 3 === 0) processSupplyTick();
            if (supplyAcc % 8 === 0) drawRails();
          } catch (e) {}
          return r;
        };
        window.gameTick._scAtmo = true;
      }
    } catch (e) {}
  }

  function showDockIfInGame() {
    var dock = document.getElementById("sc-atmo-dock");
    if (!dock) return;
    var g = GS();
    var show = g && g.running;
    dock.style.display = show ? "flex" : "none";
    if (show) {
      bindMapModes();
      drawRails();
    }
  }

  // boot
  function boot() {
    /* dock/ultimatum removed — keep voice + rails only */
    try {
      var d=document.getElementById("sc-atmo-dock");
      if(d) d.remove();
    } catch(e) {}
    wrapProvinceClick();
    wrapCombatHooks();
    hookTick();
    // no setInterval clutter
    if (false) {
      showDockIfInGame();
      wrapProvinceClick();
      wrapCombatHooks();
      hookTick();
    }
    // warm voices
    try {
      if (window.speechSynthesis) window.speechSynthesis.getVoices();
    } catch (e) {}
    console.log("[atmosphere] voice + rails + ultimatum + formable_disableds ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
