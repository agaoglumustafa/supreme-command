  // Kolay API: log(`İttifak: {USA} + {DEU}`);
  console.log("Inline flags: {TUR} → flagcdn SVG · formatInlineFlags / convertTextToFlags");
})();



// ============================================================
// V47 — HOI4-inspired combat (Org / Strength / Soft-Hard / Width)
// Günlük tick içinde birden fazla "saatlik" tur simüle edilir.
// ============================================================
(function V47HoiCombat() {
  if (typeof GameState === "undefined") return;

  // Battalion-level stats (tümen tipi başına bir "ortalama")
  const BAT = {
    inf: { soft: 6, hard: 1, def: 22, brk: 3, org: 50, hp: 25, hardness: 0.0, width: 2, armor: 0, pierce: 1 },
    art: { soft: 25, hard: 4, def: 8, brk: 4, org: 28, hp: 18, hardness: 0.0, width: 3, armor: 0, pierce: 4 },
    arm: { soft: 12, hard: 18, def: 6, brk: 28, org: 32, hp: 22, hardness: 0.75, width: 2, armor: 50, pierce: 40 }
  };

  const WIDTH_BY_TERRAIN = {
    plains: 84, desert: 84, grassland: 80, forest: 70, jungle: 60,
    hills: 72, mountain: 55, marsh: 50, urban: 90, unknown: 75
  };

  function terrainKeyForWar(targetIso) {
    try {
      const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === targetIso);
      if (!provs.length || typeof PROVINCE_DATA === "undefined") return "plains";
      const t = (PROVINCE_DATA[provs[0]] && PROVINCE_DATA[provs[0]].terrain) || "plains";
      const s = String(t).toLowerCase();
      if (s.includes("mount")) return "mountain";
      if (s.includes("hill")) return "hills";
      if (s.includes("forest") || s.includes("wood")) return "forest";
      if (s.includes("jungle")) return "jungle";
      if (s.includes("marsh") || s.includes("swamp")) return "marsh";
      if (s.includes("desert")) return "desert";
      if (s.includes("urban") || s.includes("city")) return "urban";
      return "plains";
    } catch (e) { return "plains"; }
  }

  window.buildArmyCombatStats = function(country, sideMul) {
    sideMul = sideMul || 1;
    const d = (country && country.divisions) || { inf: 0, art: 0, arm: 0 };
    let soft = 0, hard = 0, def = 0, brk = 0, org = 0, hp = 0, width = 0, armor = 0, pierce = 0, hardnessW = 0, units = 0;
    ["inf", "art", "arm"].forEach(k => {
      const n = d[k] || 0;
      if (!n) return;
      const b = BAT[k];
      soft += b.soft * n;
      hard += b.hard * n;
      def += b.def * n;
      brk += b.brk * n;
      org += b.org * n;
      hp += b.hp * n;
      width += b.width * n;
      armor += b.armor * n;
      pierce += b.pierce * n;
      hardnessW += b.hardness * n;
      units += n;
    });
    const hardness = units ? hardnessW / units : 0;
    return {
      soft: soft * sideMul, hard: hard * sideMul, def: def * sideMul, brk: brk * sideMul,
      orgMax: Math.max(1, org), hpMax: Math.max(1, hp),
      width, armor: units ? armor / units : 0, pierce: units ? pierce / units : 0,
      hardness: Math.min(0.95, hardness), units
    };
  };

  function ensureWarCombat(war, player, target) {
    if (war.combat && war.combat.atk && war.combat.def) return war.combat;
    const diff = GameState.difficulty || "easy";
    const enemyMul = ({ easy: 0.55, normal: 0.75, hard: 0.95, veryhard: 1.1, impossible: 1.25 })[diff] || 0.75;
    const atkS = buildArmyCombatStats(player, 1);
    const defS = buildArmyCombatStats(target, enemyMul);
    war.combat = {
      atk: { org: atkS.orgMax, orgMax: atkS.orgMax, hp: atkS.hpMax, hpMax: atkS.hpMax, stats: atkS },
      def: { org: defS.orgMax, orgMax: defS.orgMax, hp: defS.hpMax, hpMax: defS.hpMax, stats: defS },
      terrain: terrainKeyForWar(war.target),
      widthCap: WIDTH_BY_TERRAIN[terrainKeyForWar(war.target)] || 75,
      rounds: 0
    };
    return war.combat;
  }

  /** Tek "saatlik" hasar turu */
  function oneRound(attacker, defender, isAttacker) {
    // Saldırı = (1-H)*soft + H*hard
    const H = defender.stats.hardness || 0;
    let attack = (1 - H) * (attacker.stats.soft || 0) + H * (attacker.stats.hard || 0);
    // Armor / piercing
    if ((attacker.stats.pierce || 0) < (defender.stats.armor || 0) * 0.9) {
      attack *= 0.55; // pierce yok
    } else if ((attacker.stats.pierce || 0) >= (defender.stats.armor || 0) && (defender.stats.armor || 0) > 10) {
      attack *= 1.1;
    }
    // Defense / Breakthrough absorbs
    const absorb = isAttacker ? (attacker.stats.brk || 0) : (defender.stats.def || 0);
    const hits = Math.max(1, Math.floor(attack / 8));
    let orgDmg = 0, hpDmg = 0;
    for (let i = 0; i < hits; i++) {
      const blocked = absorb > i * 3;
      const chance = blocked ? 0.12 : 0.42;
      if (Math.random() < chance) {
        orgDmg += 0.35 + Math.random() * 0.55;
        hpDmg += 0.12 + Math.random() * 0.25;
      }
    }
    return { orgDmg, hpDmg };
  }

  window.resolveHoiCombatDay = function(war, player, target, ctx) {
    ctx = ctx || {};
    const c = ensureWarCombat(war, player, target);
    // Stats'ı tümen değişimine göre hafif güncelle (max org/hp)
    const atkS = buildArmyCombatStats(player, 1);
    const diff = GameState.difficulty || "easy";
    const enemyMul = ({ easy: 0.55, normal: 0.75, hard: 0.95, veryhard: 1.1, impossible: 1.25 })[diff] || 0.75;
    const defS = buildArmyCombatStats(target, enemyMul);
    c.atk.stats = atkS; c.def.stats = defS;
    c.atk.orgMax = atkS.orgMax; c.atk.hpMax = atkS.hpMax;
    c.def.orgMax = defS.orgMax; c.def.hpMax = defS.hpMax;
    // Org recovery peacetime-like small when not shattered
    c.atk.org = Math.min(c.atk.orgMax, c.atk.org + 1.2);
    c.def.org = Math.min(c.def.orgMax, c.def.org + 0.8);

    // Combat width penalty
    let widthMul = 1;
    const used = atkS.width || 0;
    if (used > c.widthCap) {
      widthMul = Math.max(0.55, c.widthCap / used);
    }

    // Air / oil / doctrine / general
    let atkMul = widthMul * (ctx.airBonus || 1) * (ctx.oilPen || 1) * ((ctx.gen && ctx.gen.atk) || 1);
    if (ctx.doc) atkMul *= (ctx.doc.attack || 1) * (ctx.infMul || 1);
    const equip = typeof getEquipmentCoverage === "function" ? getEquipmentCoverage(GameState.player).ratio : 1;
    atkMul *= equip;
    const season = typeof getSeasonCombatMod === "function" ? getSeasonCombatMod() : { atk: 1 };
    atkMul *= (season.atk || 1);

    // 3-5 "hourly" rounds per day
    const rounds = 3 + Math.floor(Math.random() * 3);
    let ourCas = 0, enemyCas = 0;
    for (let r = 0; r < rounds; r++) {
      if (c.atk.org <= 0 || c.def.org <= 0) break;
      // Attacker fires
      const aHit = oneRound(
        { stats: { soft: atkS.soft * atkMul, hard: atkS.hard * atkMul, brk: atkS.brk, pierce: atkS.pierce } },
        { stats: { hardness: defS.hardness, armor: defS.armor, def: defS.def } },
        true
      );
      c.def.org = Math.max(0, c.def.org - aHit.orgDmg);
      c.def.hp = Math.max(0, c.def.hp - aHit.hpDmg);
      enemyCas += Math.floor(aHit.hpDmg * 18);

      // Defender returns fire
      const dHit = oneRound(
        { stats: { soft: defS.soft, hard: defS.hard, brk: defS.brk * 0.5, pierce: defS.pierce } },
        { stats: { hardness: atkS.hardness, armor: atkS.armor, def: atkS.def } },
        false
      );
      const defScale = ({ easy: 0.55, normal: 0.75, hard: 1, veryhard: 1.15, impossible: 1.3 })[diff] || 0.75;
      c.atk.org = Math.max(0, c.atk.org - dHit.orgDmg * defScale);
      c.atk.hp = Math.max(0, c.atk.hp - dHit.hpDmg * defScale);
      ourCas += Math.floor(dHit.hpDmg * defScale * 16);
      c.rounds++;
    }

    // Manpower
    player.manpower = Math.max(0, (player.manpower || 0) - ourCas);
    if (target) target.manpower = Math.max(0, (target.manpower || 0) - enemyCas);
    war.casualties = (war.casualties || 0) + ourCas;
    war.enemyCasualties = (war.enemyCasualties || 0) + enemyCas;

    // Org 0 → retreat / push
    let progressGain = 0;
    const atkOrgPct = c.atk.org / Math.max(1, c.atk.orgMax);
    const defOrgPct = c.def.org / Math.max(1, c.def.orgMax);
    const atkHpPct = c.atk.hp / Math.max(1, c.atk.hpMax);
    const defHpPct = c.def.hp / Math.max(1, c.def.hpMax);

    if (c.def.org <= 0.5) {
      // Savunan org kırıldı → geri çekilme / skor
      progressGain = 2.2 + Math.random() * 2.5;
      c.def.org = Math.min(c.def.orgMax * 0.35, c.def.orgMax * 0.25 + 5); // kısmi toparlanma
      if (Math.random() < 0.35) log("Düşman org çöktü — cephe yarılıyor.", "text-emerald-400");
    } else if (c.atk.org <= 0.5) {
      progressGain = -1.2 - Math.random() * 1.5;
      c.atk.org = Math.min(c.atk.orgMax * 0.4, 8 + c.atk.orgMax * 0.2);
      if (Math.random() < 0.4) log("Bizim org tükendi — taarruz durdu, toparlanılıyor.", "text-red-400");
    } else {
      // Oran farkına göre yavaş ilerleme
      const edge = (1 - defOrgPct) - (1 - atkOrgPct) * 0.6 + (defHpPct < 0.5 ? 0.3 : 0);
      progressGain = (0.4 + Math.random() * 1.1) * (1 + edge) * ({ easy: 1.9, normal: 1.45, hard: 1.15, veryhard: 1, impossible: 0.9 })[diff];
    }

    // Strength 0 → tümen yok
    if (c.def.hp <= 0 && target && target.divisions) {
      const kinds = ["inf", "art", "arm"].filter(k => (target.divisions[k] || 0) > 0);
      if (kinds.length) {
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        target.divisions[k] = Math.max(0, target.divisions[k] - 1);
        c.def.hp = c.def.hpMax * 0.4;
        log("Düşman birliği imha (HP 0): −1 " + k, "text-orange-400");
      }
    }
    if (c.atk.hp <= 0 && player.divisions) {
      const kinds = ["inf", "art", "arm"].filter(k => (player.divisions[k] || 0) > 0);
      if (kinds.length && Math.random() < 0.35) {
        const k = kinds[0];
        player.divisions[k] = Math.max(0, player.divisions[k] - 1);
        c.atk.hp = c.atk.hpMax * 0.45;
        log("Birliğimiz ağır zayiat (HP): −1 " + k, "text-red-400");
      }
    }

    if (typeof v27WarProgressDelta === "function") {
      war.progress += v27WarProgressDelta(progressGain);
    } else {
      war.progress += progressGain;
    }
    if (typeof processFrontOccupation === "function") processFrontOccupation(war);

    if (Math.random() < 0.35) {
      log(
        "MUHAREBE: Org " + Math.floor(atkOrgPct * 100) + "%/" + Math.floor(defOrgPct * 100) +
        "% · HP " + Math.floor(atkHpPct * 100) + "%/" + Math.floor(defHpPct * 100) +
        "% · width " + Math.floor(used) + "/" + c.widthCap +
        " · skor %" + Math.floor(war.progress),
        "text-slate-300"
      );
    }
    if (typeof renderHoiCombatPanel === "function") renderHoiCombatPanel();
  };

  window.renderHoiCombatPanel = function() {
    const body = document.getElementById("v47-combat-body");
    if (!body) return;
    const wars = GameState.activeWars || [];
    if (!wars.length) {
      body.innerHTML = "<span class='text-slate-500'>Aktif cephe yok. Savaşta org (yeşil) ve HP (turuncu) burada işler.</span>";
      return;
    }
    body.innerHTML = wars.map(w => {
      const c = w.combat;
      const name = (GameState.countries[w.target] && GameState.countries[w.target].name) || w.target;
      if (!c) return "<div>" + name + " — muharebe verisi yok (ilk gün sonra)</div>";
      const aO = Math.floor((c.atk.org / c.atk.orgMax) * 100);
      const aH = Math.floor((c.atk.hp / c.atk.hpMax) * 100);
      const dO = Math.floor((c.def.org / c.def.orgMax) * 100);
      const dH = Math.floor((c.def.hp / c.def.hpMax) * 100);
      const bar = (pct, color) =>
        "<div style='height:6px;background:#1e293b;border-radius:3px;overflow:hidden;margin:2px 0'>" +
        "<div style='height:100%;width:" + Math.max(0, Math.min(100, pct)) + "%;background:" + color + "'></div></div>";
      return "<div class='border border-slate-800 rounded p-2 space-y-1'>" +
        "<div class='text-slate-200 font-bold'>" + name + " · " + (c.terrain || "") + " · width " + (c.widthCap || "?") + "</div>" +
        "<div>Biz Org " + aO + "%" + bar(aO, "#22c55e") + "HP " + aH + "%" + bar(aH, "#f59e0b") + "</div>" +
        "<div>Düşman Org " + dO + "%" + bar(dO, "#22c55e") + "HP " + dH + "%" + bar(dH, "#f59e0b") + "</div>" +
        "</div>";
    }).join("");
  };

  // Refresh panel periodically
  if (!window._v47CombatUI) {
    window._v47CombatUI = setInterval(() => {
      if (!GameState.running) return;
      try { renderHoiCombatPanel(); } catch (e) {}
    }, 2000);
  }

  const _st = window.switchTab;
  if (typeof _st === "function" && !window._v47Tab) {
    window._v47Tab = true;
    window.switchTab = function(tab) {
      const r = _st.apply(this, arguments);
      if (tab === "military") try { renderHoiCombatPanel(); } catch (e) {}
      return r;
    };
  }

  console.log("V47 HOI combat: Org/HP, soft-hard, armor-pierce, combat width, daily multi-round");
})();



// ============================================================
// V48 — AOH-inspired menus · About · Settings · Front strip
// ============================================================
(function V48Shell() {
  if (typeof GameState === "undefined") return;

  window.mainMenuCredits = function() {
    const el = document.getElementById("credits-modal");
    if (el) el.classList.remove("hidden");
  };

  window.openSettingsModal = function() {
    if (typeof ensureSettingsDefaults === "function") ensureSettingsDefaults();
    const s = GameState.settings || {};
    document.getElementById("settings-overlay")?.remove();
    const speeds = [
      [1200, "1× Slow"], [800, "2×"], [500, "3×"], [320, "4×"], [180, "5× Fast"]
    ];
    const cur = s.tickMs || GameState.speed || 800;
    const speedOpts = speeds.map(([ms, lab]) =>
      `<option value="${ms}" ${Math.abs(ms - cur) < 30 ? "selected" : ""}>${lab}</option>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.id = "settings-overlay";
    overlay.className = "fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 p-4";
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="sc-settings-card w-full max-w-md overflow-hidden" onclick="event.stopPropagation()" style="background:linear-gradient(180deg,#1a2218,#121810);border:2px solid #2a3a28;border-radius:4px">
        <div class="px-5 py-3 border-b border-[#2a3a28] flex justify-between items-center">
          <h2 class="text-sm font-bold text-[#c4a35a] uppercase tracking-[0.2em]">Settings</h2>
          <button type="button" class="text-[#7a8470] hover:text-[#c4a35a] text-xs font-bold" onclick="document.getElementById('settings-overlay').remove()">✕</button>
        </div>
        <div class="p-5 space-y-4 text-[12px] text-[#c8d0b8] max-h-[75vh] overflow-y-auto">
          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold">Audio</div>
          <label class="flex items-center justify-between gap-3">
            <span>Sound effects</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.sfx !== false ? "checked" : ""}
              onchange="GameState.settings.sfx=this.checked">
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Music</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.music !== false ? "checked" : ""}
              onchange="GameState.settings.music=this.checked; if(window.MusicPlayer){ try{ this.checked?MusicPlayer.start():MusicPlayer.stop(); }catch(e){} }">
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Volume</span>
            <input type="range" min="0" max="1" step="0.05" value="${s.volume != null ? s.volume : 0.45}" class="w-32 accent-[#c4a35a]"
              oninput="GameState.settings.volume=parseFloat(this.value); if(window.MusicPlayer&&MusicPlayer.setVolume)MusicPlayer.setVolume(this.value)">
          </label>
          <button type="button" onclick="if(window.MusicPlayer&&MusicPlayer.next)MusicPlayer.next()" class="w-full py-2 text-[11px] font-bold uppercase tracking-wider border border-[#2a3a28] bg-[#151c14] hover:border-[#c4a35a] text-[#a8b098]">Next track</button>

          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold pt-2">Game</div>
          <label class="flex items-center justify-between gap-3">
            <span>Game speed</span>
            <select class="bg-[#151c14] border border-[#2a3a28] rounded px-2 py-1.5 text-[11px] font-bold text-[#d8dcc8]" onchange="setGameSpeed(parseInt(this.value,10))">${speedOpts}</select>
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Random events</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${(s.eventsEnabled !== false && GameState.eventsEnabled !== false) ? "checked" : ""}
              onchange="GameState.settings.eventsEnabled=this.checked; GameState.eventsEnabled=this.checked;">
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Rare diplomatic mail</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.msgRare !== false ? "checked" : ""}
              onchange="GameState.settings.msgRare=this.checked">
          </label>
          <label class="flex items-center justify-between gap-3">
            <span>Autosave</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.autoSave !== false ? "checked" : ""}
              onchange="GameState.settings.autoSave=this.checked">
          </label>

          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold pt-2">Display</div>
          <button type="button" onclick="toggleFullscreen()" class="w-full py-2.5 text-[11px] font-bold uppercase tracking-wider border border-[#2a3a28] bg-[#151c14] hover:border-[#4f8a58] text-[#d8dcc8]">Fullscreen</button>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onclick="saveGame()" class="py-2.5 text-[11px] font-bold uppercase tracking-wider border border-[#2a5c38] bg-[#1a2e1c] text-[#c8e0c8]">Save</button>
            <button type="button" onclick="loadGamePrompt()" class="py-2.5 text-[11px] font-bold uppercase tracking-wider border border-[#5c4a28] bg-[#2a2210] text-[#e0d4b0]">Load</button>
          </div>
          <p class="text-[10px] text-[#5a6450] text-center pt-1">ESC closes · F1 tutorial</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  // Alias
  if (typeof toggleSettings === "function") {
    window.toggleSettings = function() {
      const ex = document.getElementById("settings-overlay");
      if (ex) { ex.remove(); return; }
      openSettingsModal();
    };
  }

  window.renderFrontStrip = function() {
    const el = document.getElementById("v48-front-strip");
    if (!el) return;
    const wars = GameState.activeWars || [];
    if (!wars.length) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML = wars.slice(0, 2).map(w => {
      const name = (GameState.countries[w.target] && GameState.countries[w.target].name) || w.target;
      const c = w.combat;
      let org = "—", hp = "—";
      if (c && c.atk) {
        org = Math.floor((c.atk.org / Math.max(1, c.atk.orgMax)) * 100) + "%";
        hp = Math.floor((c.atk.hp / Math.max(1, c.atk.hpMax)) * 100) + "%";
      }
      const occ = Object.keys(GameState.occupations || {}).filter(p =>
        GameState.occupations[p] === GameState.player && provinceOwners[p] === w.target
      ).length;
      return `<div class="flex flex-wrap gap-x-3 gap-y-1">
        <span class="text-[#c4a35a] font-bold">${name}</span>
        <span>Score ${Math.floor(w.progress || 0)}%</span>
        <span>Org ${org}</span>
        <span>HP ${hp}</span>
        <span>Occ ${occ}</span>
      </div>`;
    }).join("");
  };

  if (!window._v48Front) {
    window._v48Front = setInterval(() => {
      if (!GameState.running) return;
      try { renderFrontStrip(); } catch (e) {}
    }, 1500);
  }

  console.log("V48: AOH-style menu/settings/about + front strip");
})();



// ============================================================
// V49 — i18n (TR / EN) + geo/locale auto · UI refresh
// ============================================================
(function V49I18n() {
  if (typeof GameState === "undefined") return;

  const TURKIC_COUNTRIES = new Set(["TR", "AZ", "KZ", "UZ", "TM", "KG"]);
  const TURKIC_LANG_PREFIX = ["tr", "az", "kk", "uz", "tk", "ky"];

  const STR = {
    en: {
      mm_continue: "Continue",
      mm_new: "New Game",
      mm_load: "Load Game",
      mm_settings: "Settings",
      mm_about: "About",
      mm_version: "v1.1 · Grand Master · Map 1083",
      mm_subtitle: "1083 provinces · occupation before annexation · scenario history",
      mm_tagline: "Browser Grand Strategy",
      settings_title: "Settings",
      settings_audio: "Audio",
      settings_sfx: "Sound effects",
      settings_music: "Music",
      settings_volume: "Volume",
      settings_next: "Next track",
      settings_game: "Game",
      settings_speed: "Game speed",
      settings_events: "Random events",
      settings_mail: "Rare diplomatic mail",
      settings_autosave: "Autosave",
      settings_display: "Display",
      settings_fs: "Fullscreen",
      settings_save: "Save",
      settings_load: "Load",
      settings_lang: "Language",
      settings_lang_auto: "Auto (by region)",
      settings_hint: "ESC closes · F1 tutorial",
      about_title: "About",
      about_p1: "Supreme Command is a browser grand strategy game: province-level map, daily turns, war, diplomacy and scenario history.",
      about_p2: "Inspired by the feel of classic map-painters and WWII strategy (fronts, occupation, factions) — built as its own systems, not a clone.",
      about_close: "Close",
      lobby_title: "New campaign",
      lobby_back: "← Main menu",
      lobby_hint: "Choose scenario, country and difficulty",
      lobby_country: "Select nation",
      lobby_start: "Start game",
      tab_dash: "Overview",
      tab_prod: "Production",
      tab_mil: "Army",
      tab_diplo: "Diplomacy",
      war_none: "No active front",
      log_saved: "GAME SAVED",
      log_loaded: "GAME LOADED",
      toast_lang: "Language: English"
    },
    tr: {
      mm_continue: "Devam et",
      mm_new: "Yeni oyun",
      mm_load: "Kayıt yükle",
      mm_settings: "Ayarlar",
      mm_about: "Hakkında",
      mm_version: "v1.1 · Grand Master · Harita 1083",
      mm_subtitle: "1083 eyalet · ilhaktan önce işgal · senaryo tarihi",
      mm_tagline: "Tarayıcıda Grand Strategy",
      settings_title: "Ayarlar",
      settings_audio: "Ses",
      settings_sfx: "Ses efektleri",
      settings_music: "Müzik",
      settings_volume: "Ses seviyesi",
      settings_next: "Sonraki parça",
      settings_game: "Oyun",
      settings_speed: "Oyun hızı",
      settings_events: "Rastgele olaylar",
      settings_mail: "Nadir diplomatik posta",
      settings_autosave: "Otomatik kayıt",
      settings_display: "Ekran",
      settings_fs: "Tam ekran",
      settings_save: "Kaydet",
      settings_load: "Yükle",
      settings_lang: "Dil",
      settings_lang_auto: "Otomatik (bölgeye göre)",
      settings_hint: "ESC kapatır · F1 öğretici",
      about_title: "Hakkında",
      about_p1: "Supreme Command, tarayıcıda çalışan bir grand strategy oyunudur: eyalet haritası, günlük turlar, savaş, diplomasi ve senaryo tarihi.",
      about_p2: "Klasik harita boyama ve II. Dünya Savaşı stratejisinin hissinden ilham alır (cephe, işgal, fraksiyon) — kopya değil, kendi sistemleri.",
      about_close: "Kapat",
      lobby_title: "Yeni sefer",
      lobby_back: "← Ana menü",
      lobby_hint: "Senaryo, ülke ve zorluk seçin",
      lobby_country: "Devlet seçin",
      lobby_start: "Oyunu başlat",
      tab_dash: "Özet",
      tab_prod: "Üretim",
      tab_mil: "Ordu",
      tab_diplo: "Diplomasi",
      war_none: "Aktif cephe yok",
      log_saved: "OYUN KAYDEDİLDİ",
      log_loaded: "KAYIT YÜKLENDİ",
      toast_lang: "Dil: Türkçe"
    }
  };

  function detectLangFromNavigator() {
    try {
      const list = navigator.languages || [navigator.language || "en"];
      for (const raw of list) {
        const l = String(raw || "").toLowerCase();
        const primary = l.split("-")[0];
        const region = (l.split("-")[1] || "").toUpperCase();
        if (TURKIC_LANG_PREFIX.includes(primary)) return "tr";
        if (TURKIC_COUNTRIES.has(region)) return "tr";
      }
    } catch (e) {}
    return "en";
  }

  /** IP/geo (opsiyonel) — başarısız olursa navigator */
  async function detectLangFromGeo() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      // Ücretsiz, CORS açık endpoint
      const r = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("geo");
      const j = await r.json();
      const cc = String(j.country_code || j.country || "").toUpperCase();
      if (TURKIC_COUNTRIES.has(cc)) return "tr";
      return "en";
    } catch (e) {
      return detectLangFromNavigator();
    }
  }

  window.t = function(key) {
    const lang = (GameState.lang === "tr" || GameState.lang === "en") ? GameState.lang : "en";
    const pack = STR[lang] || STR.en;
    return pack[key] != null ? pack[key] : (STR.en[key] || key);
  };

  window.applyI18n = function() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.getAttribute("data-i18n");
      if (!k) return;
      const val = t(k);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.placeholder = val;
      else el.textContent = val;
    });
    // Main menu static bits without data-i18n
    const tag = document.querySelector("#main-menu-screen .sc-menu-sub");
    if (tag) tag.textContent = t("mm_tagline");
    const sub = document.querySelector("#main-menu-screen .sc-menu-title + p, #main-menu-screen p.text-\\[11px\\]");
    // subtitle paragraph under title
    const menuCard = document.querySelector("#main-menu-screen .sc-menu-card");
    if (menuCard) {
      const ps = menuCard.querySelectorAll("p");
      if (ps[0] && ps[0].className.indexOf("text-[11px]") >= 0) ps[0].textContent = t("mm_subtitle");
    }
    // Lobby hints if present
    const lobbyH1 = document.querySelector("#lobby-screen h1");
    if (lobbyH1) lobbyH1.textContent = t("lobby_title");
    // Tab buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
      const oc = btn.getAttribute("onclick") || "";
      if (oc.includes("'dashboard'") || oc.includes('"dashboard"')) btn.textContent = t("tab_dash");
      if (oc.includes("'production'")) btn.textContent = t("tab_prod");
      if (oc.includes("'military'")) btn.textContent = t("tab_mil");
      if (oc.includes("'diplomacy'")) btn.textContent = t("tab_diplo");
    });
  };

  window.setGameLanguage = function(code) {
    const pref = code || "auto";
    try { localStorage.setItem("sc_lang_pref", pref); } catch (e) {}
    if (pref === "tr" || pref === "en") {
      GameState.lang = pref;
      GameState.langPref = pref;
      applyI18n();
      if (typeof showToast === "function") showToast(t("toast_lang"), "ok");
      return;
    }
    // auto
    GameState.langPref = "auto";
    detectLangFromGeo().then(lang => {
      GameState.lang = lang;
      applyI18n();
      if (typeof showToast === "function") showToast(t("toast_lang"), "ok");
      const sel = document.getElementById("mm-lang-select");
      if (sel) sel.value = "auto";
    });
  };

  window.initLanguage = async function() {
    let pref = "auto";
    try { pref = localStorage.getItem("sc_lang_pref") || "auto"; } catch (e) {}
    GameState.langPref = pref;
    if (pref === "tr" || pref === "en") {
      GameState.lang = pref;
    } else {
      GameState.lang = await detectLangFromGeo();
    }
    const sel = document.getElementById("mm-lang-select");
    if (sel) sel.value = (pref === "tr" || pref === "en") ? pref : "auto";
    applyI18n();
    console.log("V49 i18n · lang=", GameState.lang, "pref=", pref);
  };

  // Override settings modal to include language + i18n labels
  window.openSettingsModal = function() {
    if (typeof ensureSettingsDefaults === "function") ensureSettingsDefaults();
    const s = GameState.settings || {};
    document.getElementById("settings-overlay")?.remove();
    const speeds = [
      [1200, "1×"], [800, "2×"], [500, "3×"], [320, "4×"], [180, "5×"]
    ];
    const cur = s.tickMs || GameState.speed || 800;
    const speedOpts = speeds.map(([ms, lab]) =>
      `<option value="${ms}" ${Math.abs(ms - cur) < 30 ? "selected" : ""}>${lab}</option>`
    ).join("");
    const pref = GameState.langPref || localStorage.getItem("sc_lang_pref") || "auto";

    const overlay = document.createElement("div");
    overlay.id = "settings-overlay";
    overlay.className = "fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 p-4";
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="w-full max-w-md overflow-hidden" onclick="event.stopPropagation()" style="background:linear-gradient(180deg,#1a2218,#121810);border:2px solid #2a3a28;border-radius:4px">
        <div class="px-5 py-3 border-b border-[#2a3a28] flex justify-between items-center">
          <h2 class="text-sm font-bold text-[#c4a35a] uppercase tracking-[0.2em]">${t("settings_title")}</h2>
          <button type="button" class="text-[#7a8470] hover:text-[#c4a35a] text-xs font-bold" onclick="document.getElementById('settings-overlay').remove()">✕</button>
        </div>
        <div class="p-5 space-y-4 text-[12px] text-[#c8d0b8] max-h-[75vh] overflow-y-auto">
          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold">${t("settings_lang")}</div>
          <select class="w-full bg-[#151c14] border border-[#2a3a28] rounded px-3 py-2 text-[12px] font-bold text-[#c4a35a]" onchange="setGameLanguage(this.value)">
            <option value="auto" ${pref === "auto" ? "selected" : ""}>${t("settings_lang_auto")}</option>
            <option value="tr" ${pref === "tr" ? "selected" : ""}>Türkçe</option>
            <option value="en" ${pref === "en" ? "selected" : ""}>English</option>
          </select>
          <p class="text-[10px] text-[#6a7460]">TR · AZ · KZ · UZ · TM · KG → Türkçe · else English</p>

          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold">${t("settings_audio")}</div>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_sfx")}</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.sfx !== false ? "checked" : ""} onchange="GameState.settings.sfx=this.checked"></label>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_music")}</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.music !== false ? "checked" : ""} onchange="GameState.settings.music=this.checked"></label>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_volume")}</span>
            <input type="range" min="0" max="1" step="0.05" value="${s.volume != null ? s.volume : 0.45}" class="w-32 accent-[#c4a35a]"
              oninput="GameState.settings.volume=parseFloat(this.value)"></label>
          <button type="button" onclick="if(window.MusicPlayer&&MusicPlayer.next)MusicPlayer.next()" class="w-full py-2 text-[11px] font-bold uppercase tracking-wider border border-[#2a3a28] bg-[#151c14]">${t("settings_next")}</button>

          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold">${t("settings_game")}</div>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_speed")}</span>
            <select class="bg-[#151c14] border border-[#2a3a28] rounded px-2 py-1.5 text-[11px] font-bold" onchange="setGameSpeed(parseInt(this.value,10))">${speedOpts}</select></label>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_events")}</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${(s.eventsEnabled !== false && GameState.eventsEnabled !== false) ? "checked" : ""}
              onchange="GameState.settings.eventsEnabled=this.checked;GameState.eventsEnabled=this.checked"></label>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_mail")}</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.msgRare !== false ? "checked" : ""} onchange="GameState.settings.msgRare=this.checked"></label>
          <label class="flex items-center justify-between gap-3"><span>${t("settings_autosave")}</span>
            <input type="checkbox" class="accent-[#3d6b45] w-4 h-4" ${s.autoSave !== false ? "checked" : ""} onchange="GameState.settings.autoSave=this.checked"></label>

          <div class="text-[10px] uppercase tracking-[0.18em] text-[#6a7460] font-bold">${t("settings_display")}</div>
          <button type="button" onclick="toggleFullscreen()" class="w-full py-2.5 text-[11px] font-bold uppercase tracking-wider border border-[#2a3a28] bg-[#151c14]">${t("settings_fs")}</button>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" onclick="saveGame()" class="py-2.5 text-[11px] font-bold uppercase border border-[#2a5c38] bg-[#1a2e1c]">${t("settings_save")}</button>
            <button type="button" onclick="loadGamePrompt()" class="py-2.5 text-[11px] font-bold uppercase border border-[#5c4a28] bg-[#2a2210]">${t("settings_load")}</button>
          </div>
          <p class="text-[10px] text-[#5a6450] text-center">${t("settings_hint")}</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  window.mainMenuCredits = function() {
    const el = document.getElementById("credits-modal");
    if (!el) return;
    el.classList.remove("hidden");
    // Refresh about text
    const card = el.querySelector(".sc-about-card") || el;
    const h = card.querySelector("h3");
    if (h) h.textContent = t("about_title");
    const paras = card.querySelectorAll(".px-5.py-4 p, .space-y-3 > p");
    if (paras[0]) paras[0].innerHTML = "<b class=\"text-[#c4a35a]\">Supreme Command</b> — " + t("about_p1").replace(/^Supreme Command[^:]*:\s*/i, "");
    if (paras[1]) paras[1].textContent = t("about_p2");
    const closeBtn = card.querySelector(".mm-btn");
    if (closeBtn) closeBtn.textContent = t("about_close");
  };

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { initLanguage(); });
  } else {
    setTimeout(() => { initLanguage(); }, 100);
  }

  console.log("V49 i18n disabled — TR only");
  // V51: dil sistemi kapalı, her zaman Türkçe
  GameState.lang = "tr";
  GameState.langPref = "tr";
  window.setGameLanguage = function() { GameState.lang = "tr"; };
  window.initLanguage = function() { GameState.lang = "tr"; try { applyI18n(); } catch(e){} };
  window.t = function(key) {
    const pack = STR.tr || STR.en;
    return pack[key] != null ? pack[key] : (STR.en[key] || key);
  };

})();



// ============================================================
// V50 — Province demographics · capitals · AI economy · borders
// ============================================================
(function V50SocietyAI() {
  if (typeof GameState === "undefined") return;

  // --- Region heuristics for ethnicity / religion mixes ---
  const REGION_ETH = [
    { test: /Adana|Mersin|Hatay|Antep|Urfa|Mardin|Diyarbak|Van|Hakkari|Tunceli|Elaz|Malatya|Erzurum|Kars|Agri/i, eth: { Turk: 55, Kurd: 30, Arab: 10, Other: 5 }, rel: { Muslim: 88, Atheist: 8, Christian: 3, Other: 1 } },
    { test: /Istanbul|Ankara|Izmir|Bursa|Antalya|Konya|Afyon|Samsun|Trabzon|Edirne|Izmit|Kastamonu|Amasya|Kayseri|Sivas/i, eth: { Turk: 85, Kurd: 8, Other: 7 }, rel: { Muslim: 82, Atheist: 12, Christian: 4, Other: 2 } },
    { test: /Baku|Azerbaijan|Nakhchivan|Ganja/i, eth: { Azeri: 90, Other: 10 }, rel: { Muslim: 92, Atheist: 5, Other: 3 } },
    { test: /Yerevan|Armenia/i, eth: { Armenian: 95, Other: 5 }, rel: { Christian: 90, Atheist: 7, Other: 3 } },
    { test: /Tbilisi|Georgia|Abkhazia/i, eth: { Georgian: 80, Other: 20 }, rel: { Christian: 85, Muslim: 8, Atheist: 5, Other: 2 } },
    { test: /Moscow|Petersburg|Novgorod|Vologda|Siberia|Urals|Vladivostok|Crimea|Kherson|Zaporozhe|Stalino|Donetsk|Luhansk/i, eth: { Russian: 80, Ukrainian: 12, Other: 8 }, rel: { Christian: 55, Atheist: 30, Muslim: 10, Other: 5 } },
    { test: /Kyiv|Kiev|Lviv|Lwów|Odessa|Kharkiv|Dnipro|Ukrain/i, eth: { Ukrainian: 75, Russian: 18, Other: 7 }, rel: { Christian: 70, Atheist: 22, Other: 8 } },
    { test: /Berlin|Bayern|Sachsen|Rhineland|Hamburg|Hannover|Westfalen|Brandenburg/i, eth: { German: 88, Other: 12 }, rel: { Christian: 55, Atheist: 38, Muslim: 5, Other: 2 } },
    { test: /Paris|Lyon|Marseille|Bordeaux|Toulouse|Normandy|Brittany|Ile_de/i, eth: { French: 85, Other: 15 }, rel: { Christian: 45, Atheist: 45, Muslim: 8, Other: 2 } },
    { test: /London|England|Scotland|Wales|Manchester|Yorkshire/i, eth: { British: 80, Other: 20 }, rel: { Christian: 40, Atheist: 45, Other: 15 } },
    { test: /Roma|Lazio|Milan|Sicily|Napoli|Venice|Turin/i, eth: { Italian: 92, Other: 8 }, rel: { Christian: 75, Atheist: 20, Other: 5 } },
    { test: /Tokyo|Osaka|Kanto|Kyushu|Hokkaido/i, eth: { Japanese: 97, Other: 3 }, rel: { Other: 70, Atheist: 25, Christian: 4, Other2: 1 } },
    { test: /Beijing|Shanghai|Guangdong|Sichuan|Xinjiang|Tibet|Manchuria/i, eth: { Han: 90, Other: 10 }, rel: { Atheist: 50, Other: 35, Muslim: 8, Christian: 7 } },
    { test: /Tehran|Isfahan|Shiraz|Tabriz|Mashhad/i, eth: { Persian: 70, Azeri: 15, Kurd: 8, Other: 7 }, rel: { Muslim: 95, Other: 5 } },
    { test: /Baghdad|Mosul|Basra|Erbil/i, eth: { Arab: 70, Kurd: 20, Other: 10 }, rel: { Muslim: 95, Christian: 3, Other: 2 } },
    { test: /Warszawa|Kraków|Poznan|Lodz|Gdansk|Danzig/i, eth: { Polish: 95, Other: 5 }, rel: { Christian: 85, Atheist: 12, Other: 3 } },
    { test: /Madrid|Barcelona|Seville|Valencia/i, eth: { Spanish: 90, Other: 10 }, rel: { Christian: 60, Atheist: 35, Other: 5 } },
    { test: /California|Texas|New_York|Florida|Illinois|Ohio|District_of_Columbia/i, eth: { American: 70, Hispanic: 15, Other: 15 }, rel: { Christian: 65, Atheist: 25, Other: 10 } }
  ];

  const OWNER_DEFAULT_ETH = {
    TUR: { eth: { Turk: 75, Kurd: 15, Other: 10 }, rel: { Muslim: 85, Atheist: 10, Christian: 3, Other: 2 } },
    RUS: { eth: { Russian: 80, Other: 20 }, rel: { Christian: 50, Atheist: 35, Muslim: 10, Other: 5 } },
    UKR: { eth: { Ukrainian: 78, Russian: 15, Other: 7 }, rel: { Christian: 70, Atheist: 25, Other: 5 } },
    DEU: { eth: { German: 85, Other: 15 }, rel: { Christian: 55, Atheist: 38, Other: 7 } },
    USA: { eth: { American: 70, Other: 30 }, rel: { Christian: 65, Atheist: 25, Other: 10 } },
    GBR: { eth: { British: 80, Other: 20 }, rel: { Christian: 40, Atheist: 45, Other: 15 } },
    FRA: { eth: { French: 80, Other: 20 }, rel: { Christian: 45, Atheist: 45, Other: 10 } },
    CHN: { eth: { Han: 90, Other: 10 }, rel: { Atheist: 55, Other: 45 } },
    JPN: { eth: { Japanese: 97, Other: 3 }, rel: { Other: 70, Atheist: 25, Christian: 5 } },
    IRN: { eth: { Persian: 65, Other: 35 }, rel: { Muslim: 96, Other: 4 } },
    ISR: { eth: { Jewish: 75, Arab: 20, Other: 5 }, rel: { Jewish: 75, Muslim: 18, Other: 7 } },
    POL: { eth: { Polish: 95, Other: 5 }, rel: { Christian: 88, Other: 12 } },
    AZE: { eth: { Azeri: 90, Other: 10 }, rel: { Muslim: 93, Other: 7 } },
    KAZ: { eth: { Kazakh: 70, Russian: 20, Other: 10 }, rel: { Muslim: 70, Christian: 20, Atheist: 10 } },
    UZB: { eth: { Uzbek: 80, Other: 20 }, rel: { Muslim: 90, Other: 10 } },
    TKM: { eth: { Turkmen: 85, Other: 15 }, rel: { Muslim: 90, Other: 10 } },
    KGZ: { eth: { Kyrgyz: 75, Other: 25 }, rel: { Muslim: 85, Other: 15 } }
  };

  function normalizeMix(obj) {
    const o = Object.assign({}, obj);
    let s = 0;
    Object.keys(o).forEach(k => { s += o[k]; });
    if (s <= 0) return o;
    Object.keys(o).forEach(k => { o[k] = Math.round((o[k] / s) * 1000) / 10; });
    return o;
  }

  window.getProvinceDemographics = function(pName) {
    if (!GameState._demoCache) GameState._demoCache = {};
    if (GameState._demoCache[pName]) return GameState._demoCache[pName];
    let eth = null, rel = null;
    for (const rule of REGION_ETH) {
      if (rule.test.test(pName)) {
        eth = normalizeMix(rule.eth);
        rel = normalizeMix(rule.rel);
        break;
      }
    }
    const owner = (typeof provinceOwners !== "undefined" && provinceOwners[pName]) || "NEUTRAL";
    if (!eth) {
      const def = OWNER_DEFAULT_ETH[owner] || { eth: { Local: 70, Other: 30 }, rel: { Other: 60, Atheist: 25, Christian: 10, Muslim: 5 } };
      eth = normalizeMix(Object.assign({}, def.eth));
      rel = normalizeMix(Object.assign({}, def.rel));
      // slight noise so not every province identical
      const keys = Object.keys(eth);
      if (keys.length >= 2) {
        const j = Math.abs((pName.charCodeAt(0) || 1) * 17 + (pName.length * 3)) % 7;
        eth[keys[0]] = Math.min(95, eth[keys[0]] + j);
        eth[keys[1]] = Math.max(1, eth[keys[1]] - j);
        eth = normalizeMix(eth);
      }
    }
    const primaryEth = Object.entries(eth).sort((a,b)=>b[1]-a[1])[0][0];
    const primaryRel = Object.entries(rel).sort((a,b)=>b[1]-a[1])[0][0];
    const out = { ethnicity: eth, religion: rel, primaryEthnicity: primaryEth, primaryReligion: primaryRel };
    GameState._demoCache[pName] = out;
    return out;
  };

  // Harmony: share of population matching ruler ethnicity/religion
  window.getProvinceHarmonyScore = function(pName, ownerIso) {
    const demo = getProvinceDemographics(pName);
    const id = typeof getCountryIdentity === "function" ? getCountryIdentity(ownerIso) : {};
    const rulerEth = (id.ethnicity || "").replace(/\s/g, "");
    const rulerRel = id.religion || "";
    // map identity labels to demo keys (fuzzy)
    let ethMatch = 0;
    Object.entries(demo.ethnicity).forEach(([k, v]) => {
      if (!rulerEth) return;
      if (k.toLowerCase().includes(rulerEth.toLowerCase().slice(0, 4)) ||
          rulerEth.toLowerCase().includes(k.toLowerCase().slice(0, 4))) ethMatch += v;
    });
    // kin groups
    if (typeof areEthnicKin === "function" && areEthnicKin(ownerIso, ownerIso)) { /* noop */ }
    const TURKIC = ["Turk", "Azeri", "Kazakh", "Uzbek", "Turkmen", "Kyrgyz"];
    if (TURKIC.includes(demo.primaryEthnicity) && ["TUR","AZE","KAZ","UZB","TKM","KGZ"].includes(ownerIso)) {
      ethMatch = Math.max(ethMatch, 70);
    }
    let relMatch = 0;
    Object.entries(demo.religion).forEach(([k, v]) => {
      if (!rulerRel) return;
      if (k.toLowerCase().includes(String(rulerRel).toLowerCase().slice(0, 4)) ||
          String(rulerRel).toLowerCase().includes(k.toLowerCase().slice(0, 5))) relMatch += v;
    });
    const score = Math.round(Math.min(100, ethMatch * 0.65 + relMatch * 0.35));
    return { score: Math.max(15, score), ethMatch, relMatch, demo };
  };

  // Patch culture block display if htmlCultureBlock uses meta
  const _gpcm = window.getProvinceCultureMeta || (typeof getProvinceCultureMeta === "function" ? getProvinceCultureMeta : null);
  window.getProvinceCultureMeta = function(pName) {
    let base = {};
    try {
      if (typeof getProvinceCultureMeta !== "undefined" && _gpcm && _gpcm !== window.getProvinceCultureMeta) base = _gpcm(pName) || {};
    } catch (e) {}
    // if internal function exists in outer scope - call via original on GameState
    const demo = getProvinceDemographics(pName);
    return Object.assign({}, base, {
      ethnicity: demo.primaryEthnicity,
      religion: demo.primaryReligion,
      culture: base.culture || demo.primaryEthnicity,
      sect: base.sect || "—",
      ethnicityMix: demo.ethnicity,
      religionMix: demo.religion
    });
  };

  // Enhance panel text via format
  window.formatDemographicsLine = function(pName) {
    const d = getProvinceDemographics(pName);
    const eth = Object.entries(d.ethnicity).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => k + " " + v + "%").join(" · ");
    const rel = Object.entries(d.religion).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => k + " " + v + "%").join(" · ");
    return "Etnisite: " + eth + " | Din: " + rel;
  };

  // Hook province panel if renderProvincePanel exists - soft append
  const _rpp = window.renderProvincePanel;
  if (typeof _rpp === "function" && !window._v50Prov) {
    window._v50Prov = true;
    window.renderProvincePanel = function() {
      _rpp.apply(this, arguments);
      try {
        const p = GameState.selectedProvince;
        if (!p) return;
        const box = document.getElementById("content-province") || document.getElementById("province-panel-body");
        let host = document.getElementById("v50-demo-box");
        if (!host) {
          host = document.createElement("div");
          host.id = "v50-demo-box";
          host.className = "text-[10px] text-slate-400 border border-slate-800 rounded p-2 mt-2 space-y-1";
          const parent = document.querySelector("#content-province .space-y-3") || document.querySelector("#content-province") || document.getElementById("diplo-country-details");
          if (parent) parent.appendChild(host);
        }
        if (!host.parentElement) return;
        const owner = provinceOwners[p];
        const h = getProvinceHarmonyScore(p, owner || GameState.player);
        host.innerHTML = "<div class='text-slate-300 font-bold text-[11px]'>Nüfus yapısı</div>" +
          "<div>" + formatDemographicsLine(p) + "</div>" +
          "<div>Uyum (sahip): <b class='" + (h.score >= 70 ? "text-emerald-400" : h.score >= 45 ? "text-amber-400" : "text-red-400") + "'>%" + h.score + "</b></div>";
      } catch (e) {}
    };
  }

  // Unrest uses harmony
  const _pcu = window.processCultureUnrest;
  // processCultureUnrest is function declaration - patch via wrapping daily
  window.v50UnrestTick = function() {
    if (GameState.gameOver || Math.random() > 0.1) return;
    const iso = GameState.player;
    const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso);
    let low = 0;
    provs.forEach(p => {
      if (getProvinceHarmonyScore(p, iso).score < 45) low++;
    });
    if (low > 3 && GameState.countries[iso]) {
      GameState.countries[iso].stability = Math.max(10, (GameState.countries[iso].stability || 50) - 1);
    }
  };

  // --- Capitals for every map country ---
  const EXTRA_CAPS = {
    TUR: "Ankara", DEU: "Brandenburg", USA: "District_of_Columbia", RUS: "Moscow",
    GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", JPN: "Kanto",
    CHN: "Beijing", IND: "Delhi", BRA: "Goiás", POL: "Warszawa", ESP: "Madrid",
    UKR: "Kiev", // or Kyiv if exists
    KOR: "Seoul", PRK: "Pyongyang", IRN: "Tehran", IRQ: "Baghdad", SAU: "Riyadh",
    EGY: "Cairo", ISR: "Palestine", AZE: "Azerbaijan", GEO: "Georgia", ARM: "Armenia",
    KAZ: "Alma_Ata", UZB: "Tashkent", SWE: "Svealand", NOR: "Ostlandet", FIN: "Uusimaa",
    NLD: "Holland", BEL: "Flanders", ROU: "Muntenia", HUN: "Northern_Hungary",
    GRC: "Attica", PRT: "Lisbon", CAN: "Southern_Ontario", MEX: "Mexico_City",
    ARG: "Buenos_Aires", AUS: "New_South_Wales", IDN: "Java", PAK: "West_Punjab",
    BGD: "East_Bengal", VNM: "Tonkin", THA: "Siam", PHL: "Luzon", NGA: "Nigeria",
    ZAF: "Transvaal", ETH: "Ethiopia", CHE: "Eastern_Switzerland", AUT: "Lower_Austria",
    CZE: "Bohemia", SVK: "Western_Slovakia", HRV: "Croatia", SRB: "Serbia", BGR: "Sofia",
    DNK: "Denmark", IRL: "Leinster", NZL: "North_Island", CHL: "Santiago", COL: "Cundinamarca",
    PER: "Lima", VEN: "Miranda", CUB: "Cuba", DZA: "Algiers", MAR: "Casablanca",
    TUN: "Tunisia", LBY: "Tripoli", SDN: "Khartoum", KEN: "Kenya", AGO: "Luanda",
    SYR: "Damascus", JOR: "Jordan", LBN: "Lebanon", YEM: "North_Yemen", OMN: "Oman",
    KWT: "Kuwait", QAT: "Qatar", ARE: "Abu_Dhabi", TWN: "Taiwan", MYS: "Malaya",
    SGP: "Singapore", BLK: "Minsk", MDA: "Moldova", LTU: "Kaunas", LVA: "Riga", EST: "Tallinn"
  };

  window.assignMissingCapitals = function() {
    const owners = new Set(Object.values(provinceOwners || {}));
    owners.forEach(iso => {
      if (!iso || iso === "NEUTRAL") return;
      const c = GameState.countries[iso];
      if (!c) return;
      if (c.capital && provinceOwners[c.capital] === iso) return;
      // try EXTRA then any owned province
      let cap = EXTRA_CAPS[iso];
      if (cap && provinceOwners[cap] === iso) {
        c.capital = cap;
        return;
      }
      if (typeof getCountryCapital === "function") {
        const g = getCountryCapital(iso);
        if (g && provinceOwners[g] === iso) { c.capital = g; return; }
      }
      const owned = Object.keys(provinceOwners).filter(p => provinceOwners[p] === iso);
      if (owned.length) c.capital = owned[0];
    });
  };

  // --- AI economy: factories produce, then recruit if stocked ---
  window.ensureFullCiv = function(iso) {
    const c = GameState.countries[iso];
    if (!c) return null;
    if (!c.divisions) c.divisions = { inf: 2, art: 0, arm: 0 };
    if (!c.stockpile) c.stockpile = { guns: 2000, artillery: 20, tanks: 5 };
    if (!c.prodAllocation) c.prodAllocation = { guns: 2, artillery: 1, tanks: 0 };
    if (c.civFactories == null) c.civFactories = 3;
    if (c.milFactories == null) c.milFactories = 2;
    if (c.money == null) c.money = 400;
    if (c.manpower == null) c.manpower = 50000;
    if (!c.productionLines) c.productionLines = { guns: 1, artillery: 1, tanks: 1 };
    return c;
  };

  window.aiEconomicTick = function(iso, c) {
    c = c || ensureFullCiv(iso);
    if (!c) return;
    ensureFullCiv(iso);
    const diff = GameState.difficulty || "normal";
    const mul = ({ easy: 0.55, normal: 0.85, hard: 1.1, veryhard: 1.3, impossible: 1.5 })[diff] || 0.85;
    // Income from civ factories
    c.money = (c.money || 0) + Math.floor((c.civFactories || 1) * 4 * mul) + 3;
    // Military production into stockpile
    const mil = c.milFactories || 1;
    const alloc = c.prodAllocation || { guns: 2, artillery: 1, tanks: 0 };
    const totalA = Math.max(1, (alloc.guns || 0) + (alloc.artillery || 0) + (alloc.tanks || 0));
    const gunShare = (alloc.guns || 0) / totalA;
    const artShare = (alloc.artillery || 0) / totalA;
    const tankShare = (alloc.tanks || 0) / totalA;
    c.stockpile.guns = (c.stockpile.guns || 0) + Math.floor(mil * 18 * gunShare * mul);
    c.stockpile.artillery = (c.stockpile.artillery || 0) + Math.floor(mil * 2 * artShare * mul);
    c.stockpile.tanks = (c.stockpile.tanks || 0) + Math.floor(mil * 0.8 * tankShare * mul);
    // Manpower trickle
    c.manpower = (c.manpower || 0) + Math.floor((c.pop || 5000000) / 5000000 * 40 * mul);

    // Build factory if rich and not oversized
    const provN = Object.values(provinceOwners || {}).filter(o => o === iso).length;
    const maxMil = Math.max(4, provN * 2);
    const maxCiv = Math.max(4, provN * 2);
    if (c.money > 600 && Math.random() < 0.12 * mul) {
      if ((c.milFactories || 0) < maxMil && (c.milFactories || 0) <= (c.civFactories || 0) + 3) {
        c.money -= 320;
        c.milFactories = (c.milFactories || 0) + 1;
      } else if ((c.civFactories || 0) < maxCiv) {
        c.money -= 300;
        c.civFactories = (c.civFactories || 0) + 1;
      }
    }

    // Recruit only if equipment + manpower + money — not free every tick
    const divs = c.divisions;
    const totalDiv = (divs.inf || 0) + (divs.art || 0) + (divs.arm || 0);
    const softCap = Math.max(5, Math.floor(provN * 1.2 + (c.milFactories || 1) * 0.8));
    if (totalDiv < softCap && c.money > 180 && Math.random() < 0.15 * mul) {
      // prefer inf if low guns for tanks
      if ((c.stockpile.guns || 0) >= 1000 && (c.manpower || 0) >= 10000) {
        c.stockpile.guns -= 1000;
        c.manpower -= 10000;
        c.money -= 120;
        divs.inf = (divs.inf || 0) + 1;
      } else if ((c.stockpile.artillery || 0) >= 120 && (c.stockpile.guns || 0) >= 400 && (c.manpower || 0) >= 8000 && Math.random() < 0.4) {
        c.stockpile.artillery -= 120;
        c.stockpile.guns -= 400;
        c.manpower -= 8000;
        c.money -= 150;
        divs.art = (divs.art || 0) + 1;
      } else if ((c.stockpile.tanks || 0) >= 50 && (c.manpower || 0) >= 6000 && Math.random() < 0.25) {
        c.stockpile.tanks -= 50;
        c.manpower -= 6000;
        c.money -= 200;
        divs.arm = (divs.arm || 0) + 1;
      }
    }
  };

  // Init all map countries as full civs + capitals
  window.v50BootstrapCivs = function() {
    const set = new Set(Object.values(provinceOwners || {}));
    set.forEach(iso => {
      if (!iso || iso === "NEUTRAL") return;
      if (!GameState.countries[iso]) {
        GameState.countries[iso] = {
          name: iso, flag: iso.slice(0, 2).toLowerCase(), color: "#64748b",
          ideology: "—", pop: 3000000, civFactories: 4, milFactories: 2,
          money: 500, manpower: 80000, divisions: { inf: 3, art: 1, arm: 0 },
          stockpile: { guns: 3000, artillery: 40, tanks: 10 },
          prodAllocation: { guns: 2, artillery: 1, tanks: 0 },
          productionLines: { guns: 1, artillery: 1, tanks: 1 }
        };
      }
      ensureFullCiv(iso);
    });
    assignMissingCapitals();
  };

  // Run after scenario apply
  const _boot = window.bootV27;
  window.bootV27 = function() {
    if (_boot) _boot();
    setTimeout(() => { try { v50BootstrapCivs(); } catch (e) {} }, 200);
  };

  if (!window._v50Tick) {
    window._v50Tick = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      try { v50UnrestTick(); } catch (e) {}
    }, 5000);
  }

  setTimeout(() => {
    try {
      if (Object.keys(provinceOwners || {}).length) v50BootstrapCivs();
    } catch (e) {}
  }, 1200);

  console.log("V50: demographics, harmony, capitals, AI economy, thin borders");
})();



// ============================================================
// V51 — Dost/Rakip · nadir AI savaş · WW1 isimleri · TR only
// ============================================================
(function V51Relations() {
  if (typeof GameState === "undefined") return;

  GameState.lang = "tr";
  GameState.langPref = "tr";

  function ensureRelState() {
    if (!GameState.friends) GameState.friends = {}; // "A|B" -> true
    if (!GameState.rivals) GameState.rivals = {};
    if (!GameState.relations) GameState.relations = {};
    if (!GameState.aiWars) GameState.aiWars = []; // {a,b,since}
  }

  function pairKey(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  }

  window.isFriend = function(a, b) {
    ensureRelState();
    return !!GameState.friends[pairKey(a, b)];
  };
  window.isRival = function(a, b) {
    ensureRelState();
    return !!GameState.rivals[pairKey(a, b)];
  };

  window.setFriend = function(a, b, on) {
    ensureRelState();
    const k = pairKey(a, b);
    if (on) {
      GameState.friends[k] = true;
      delete GameState.rivals[k];
      GameState.relations[b] = Math.max(GameState.relations[b] || 0, 35);
      if (a === GameState.player) GameState.relations[b] = Math.max(GameState.relations[b] || 0, 35);
    } else delete GameState.friends[k];
    if (typeof log === "function") log((on ? "Dostluk: " : "Dostluk kalktı: ") + a + "–" + b, "text-cyan-300");
  };

  window.setRival = function(a, b, on) {
    ensureRelState();
    const k = pairKey(a, b);
    if (on) {
      GameState.rivals[k] = true;
      delete GameState.friends[k];
      if (a === GameState.player) GameState.relations[b] = Math.min(GameState.relations[b] || 0, -25);
    } else delete GameState.rivals[k];
    if (typeof log === "function") log((on ? "Rekabet: " : "Rekabet kalktı: ") + a + "–" + b, "text-orange-400");
  };

  window.applyScenarioRelations = function(sc) {
    ensureRelState();
    GameState.friends = {};
    GameState.rivals = {};
    (sc.friends || []).forEach(pair => {
      if (pair && pair.length >= 2) GameState.friends[pairKey(pair[0], pair[1])] = true;
    });
    (sc.rivals || []).forEach(pair => {
      if (pair && pair.length >= 2) GameState.rivals[pairKey(pair[0], pair[1])] = true;
    });
    // seed relations
    Object.keys(GameState.rivals).forEach(k => {
      const [x, y] = k.split("|");
      if (x === GameState.player) GameState.relations[y] = Math.min(GameState.relations[y] || 0, -30);
      if (y === GameState.player) GameState.relations[x] = Math.min(GameState.relations[x] || 0, -30);
    });
    Object.keys(GameState.friends).forEach(k => {
      const [x, y] = k.split("|");
      if (x === GameState.player) GameState.relations[y] = Math.max(GameState.relations[y] || 0, 40);
      if (y === GameState.player) GameState.relations[x] = Math.max(GameState.relations[x] || 0, 40);
    });
    console.log("V51 relations applied", Object.keys(GameState.friends).length, "friends", Object.keys(GameState.rivals).length, "rivals");
  };

  // Force country names from scenario
  window.applyScenarioCountryNames = function(sc) {
    if (!sc || !sc.countryNames || !GameState.countries) return;
    Object.keys(sc.countryNames).forEach(iso => {
      if (GameState.countries[iso]) {
        GameState.countries[iso].name = sc.countryNames[iso];
        GameState.countries[iso].displayName = sc.countryNames[iso];
      }
    });
  };

  // Hook applyScenarioVisuals
  const _asv = window.applyScenarioVisuals;
  window.applyScenarioVisuals = function(sc) {
    if (_asv) _asv(sc);
    try {
      applyScenarioCountryNames(sc);
      applyScenarioRelations(sc);
    } catch (e) { console.warn(e); }
  };

  // Also hook applyScenarioToGameState if exists
  const _ast = window.applyScenarioToGameState;
  if (typeof _ast === "function") {
    window.applyScenarioToGameState = function(id) {
      const r = _ast.apply(this, arguments);
      try {
        const sc = (typeof SCENARIOS !== "undefined" && SCENARIOS[id]) ? SCENARIOS[id] : null;
        if (sc) {
          applyScenarioCountryNames(sc);
          applyScenarioRelations(sc);
        }
      } catch (e) {}
      return r;
    };
  }

  // Diplomacy UI: rakip/dost
  window.toggleRivalWith = function(iso) {
    if (!iso || iso === GameState.player) return;
    setRival(GameState.player, iso, !isRival(GameState.player, iso));
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
  };
  window.toggleFriendWith = function(iso) {
    if (!iso || iso === GameState.player) return;
    setFriend(GameState.player, iso, !isFriend(GameState.player, iso));
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
  };

  const _rd = window.renderDiplomacyTab;
  if (typeof _rd === "function" && !window._v51DiploRel) {
    window._v51DiploRel = true;
    window.renderDiplomacyTab = function() {
      _rd.apply(this, arguments);
      try {
        const iso = GameState.selectedCountry;
        if (!iso || iso === GameState.player || iso === "NEUTRAL") return;
        const box = document.getElementById("diplo-country-details");
        if (!box || box.querySelector(".v51-rel-btns")) return;
        const div = document.createElement("div");
        div.className = "v51-rel-btns pt-2 border-t border-slate-800 grid grid-cols-2 gap-1.5";
        const riv = isRival(GameState.player, iso);
        const fri = isFriend(GameState.player, iso);
        div.innerHTML =
          `<button type="button" onclick="toggleFriendWith('${iso}')" class="py-1.5 text-[10px] font-bold rounded border ${fri ? "border-cyan-600 bg-cyan-950 text-cyan-200" : "border-slate-600 bg-slate-900"}">${fri ? "Dost ✓" : "Dost ekle"}</button>` +
          `<button type="button" onclick="toggleRivalWith('${iso}')" class="py-1.5 text-[10px] font-bold rounded border ${riv ? "border-orange-600 bg-orange-950 text-orange-200" : "border-slate-600 bg-slate-900"}">${riv ? "Rakip ✓" : "Rakip ekle"}</button>`;
        box.appendChild(div);
      } catch (e) {}
    };
  }

  // Visible AI wars log — very rare
  window.v51RareAiDiplomacy = function() {
    if (GameState.gameOver || !GameState.running) return;
    if (Math.random() > 0.012) return; // çok nadir
    ensureRelState();
    const tags = [...new Set(Object.values(provinceOwners || {}))].filter(t => t && t !== "NEUTRAL" && t !== GameState.player);
    if (tags.length < 2) return;
    // prefer rivals
    const rivKeys = Object.keys(GameState.rivals || {});
    let a, b;
    if (rivKeys.length && Math.random() < 0.7) {
      const k = rivKeys[Math.floor(Math.random() * rivKeys.length)];
      [a, b] = k.split("|");
    } else {
      a = tags[Math.floor(Math.random() * tags.length)];
      b = tags[Math.floor(Math.random() * tags.length)];
    }
    if (!a || !b || a === b) return;
    if (isFriend(a, b)) return;
    // Only if both alive
    if (typeof isCountryOperational === "function") {
      if (!isCountryOperational(a) || !isCountryOperational(b)) return;
    }
    const na = (GameState.countries[a] && GameState.countries[a].name) || a;
    const nb = (GameState.countries[b] && GameState.countries[b].name) || b;
    const roll = Math.random();
    if (roll < 0.55) {
      // relationship chill/heat
      const delta = isRival(a, b) ? -8 : (Math.random() < 0.5 ? -5 : 6);
      if (typeof log === "function") {
        log("Dünya: " + na + " ile " + nb + " ilişkileri " + (delta < 0 ? "gerildi" : "yumuşadı") + ".", "text-slate-500");
      }
    } else if (roll < 0.72 && isRival(a, b) && Math.random() < 0.25) {
      // extremely rare war between AI
      GameState.aiWars.push({ a, b, day: GameState.date ? GameState.date.getTime() : Date.now() });
      if (typeof log === "function") log("Savaş: " + na + " ⚔ " + nb + " (AI)", "text-red-400");
      if (typeof showNewspaper === "function") {
        try { showNewspaper({ headline: "Savaş ilanı", sub: na + " / " + nb, body: "İki devlet arasında silahlı çatışma rapor edildi." }); } catch (e) {}
      }
      // lightweight: tension up, no full occupation sim for pure AI-AI
      GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 4);
    }
  };

  if (!window._v51Rare) {
    window._v51Rare = setInterval(() => {
      try { v51RareAiDiplomacy(); } catch (e) {}
    }, 8000);
  }

  // World relations panel snippet on dashboard
  window.renderWorldRelationsHint = function() {
    const el = document.getElementById("v51-world-rel");
    if (!el) return;
    ensureRelState();
    const wars = (GameState.aiWars || []).slice(-3);
    const lines = wars.map(w => {
      const na = (GameState.countries[w.a] && GameState.countries[w.a].name) || w.a;
      const nb = (GameState.countries[w.b] && GameState.countries[w.b].name) || w.b;
      return "⚔ " + na + " – " + nb;
    });
    el.innerHTML = lines.length ? lines.join("<br>") : "<span class='text-slate-600'>Aktif AI savaşı yok (nadir)</span>";
  };

  // Soften processAITick aggression toward player - wrap
  const _pai = window.processAITick;
  if (typeof processAITick === "function") {
    // processAITick is declaration - override window after assign
  }
  window.processAITick = function() {
    // ultra rare player war threat only
    if (typeof _pai === "function") {
      // temporarily lower aggression
      const old = GameState.aiAggression;
      GameState.aiAggression = Math.min(old != null ? old : 1, 0.35);
      try { return _pai.apply(this, arguments); }
      finally { GameState.aiAggression = old; }
    }
  };

  console.log("V51: friends/rivals, rare AI wars, TR only, names hook");
})();



// ============================================================
// V52 — crash fix: puppets object + scenario friends load
// ============================================================
(function V52Fix() {
  if (typeof GameState === "undefined") return;
  if (!GameState.puppets || Array.isArray(GameState.puppets)) {
    // Convert array → object if needed
    if (Array.isArray(GameState.puppets)) {
      const o = {};
      GameState.puppets.forEach(p => {
        if (!p) return;
        if (typeof p === "string") return;
        const over = p.overlord;
        const sub = p.subject || p.iso;
        if (over && sub) {
          if (!o[over]) o[over] = [];
          if (!o[over].includes(sub)) o[over].push(sub);
        }
      });
      GameState.puppets = o;
    } else {
      GameState.puppets = GameState.puppets || {};
    }
  }

  // Safe wrapper always
  const _cvs = window.computeVictoryScore;
  window.computeVictoryScore = function(iso) {
    try {
      if (!GameState.puppets) GameState.puppets = {};
      return _cvs ? _cvs(iso) : 0;
    } catch (e) {
      console.warn("computeVictoryScore", e);
      try {
        iso = iso || GameState.player;
        const c = GameState.countries[iso];
        if (!c) return 0;
        const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso).length;
        const divs = Object.values(c.divisions || {}).reduce((a, b) => a + b, 0);
        return Math.floor(provs * 3 + divs * 2);
      } catch (e2) { return 0; }
    }
  };

  console.log("V52: puppets/victory fix + friends load");
})();







// ============================================================
// SUPREME COMMAND — HOI4-STYLE MULTIPLAYER ENGINE (clean rebuild)
// Host-centric authority · shared clock · diplo · chat · ping · spectator
// Replaces all prior V54/V55 layered patches.
// ============================================================
(function SCMultiplayerEngine() {
  "use strict";
  if (typeof GameState === "undefined") {
    console.warn("[MP] GameState missing — engine deferred");
    return;
  }

  const SPEED_MS = { 0: 0, 1: 1200, 2: 800, 3: 500, 5: 180 };
  const SYNC_INTERVAL_MS = 900;
  const MAX_CHAT = 80;
  const MAX_PAYLOAD = 450000;

  // ---------- Core state ----------
  const MP = {
    active: false,
    isHost: false,
    spectator: false,
    eliminated: false,
    roomCode: null,
    peer: null,
    peerId: null,
    hostId: null,
    conns: Object.create(null),
    players: Object.create(null), // peerId -> { id, name, country, ready, spectator, eliminated }
    name: "Komutan",
    country: "TUR",
    chatChannel: "global",
    chat: [],
    scenario: "modern",
    speedLevel: 1,
    syncIv: null,
    applyingRemote: false,
    gameStarted: false,
    pendingDiplo: null,
    stats: { maxProvinces: 0, casualties: 0, survivedDays: 0, startTime: 0 },
    _easterLocked: false
  };
  GameState.mp = MP;
  window.mpActive = function () { return !!MP.active; };
  window.isHost = function () { return !!MP.isHost; };
  window.mpGetState = function () { return MP; };


  // ---------- Public guards ----------
  window.mpIsActive = function () { return !!MP.active; };
  window.mpIsHost = function () { return !!MP.isHost; };
  // wireConn exported later
  window.mpIsSpectator = function () { return !!MP.spectator || !!MP.eliminated; };
  setTimeout(function(){ try { if (typeof wireConn === "function") window.__scWireConn = wireConn; } catch(e){} }, 0);

  function mpToast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(String(msg).slice(0, 140), kind || "info");
      else if (typeof log === "function") log(String(msg), "text-cyan-300");
    } catch (e) {}
  }

  // ---------- Room code / URL ----------
  function genRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function hostPeerIdFromCode(code) {
    return "sc" + String(code).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  }
  function setRoomHash(code) {
    if (!code) return;
    const h = "#" + code;
    try {
      if (location.hash !== h) history.replaceState(null, "", h);
    } catch (e) {
      try { location.hash = code; } catch (e2) {}
    }
  }
  function clearRoomHash() {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  function parseRoomFromUrl() {
    const raw = (location.hash || "").replace(/^#/, "").trim().toUpperCase();
    if (!raw) return null;
    const m = raw.match(/^(?:JOIN-)?([A-Z0-9]{4,10})$/);
    return m ? m[1] : null;
  }
  function roomLink() {
    const base = location.href.split("#")[0].split("?")[0];
    return base + "#" + (MP.roomCode || "");
  }
  window.mpCopyRoomLink = function () {
    const link = roomLink();
    try {
      navigator.clipboard.writeText(link);
      mpToast("Oda linki kopyalandı");
    } catch (e) {
      try { prompt("Oda linki:", link); } catch (e2) {}
    }
  };
  window.mpCopyCode = function () { window.mpCopyRoomLink(); };

  // ---------- Lobby UI (create/join hide root-cause) ----------
  window.mpSetLobbyInRoom = function (inRoom) {
    try {
      const on = !!inRoom;
      const pre = document.getElementById("mp-pre-room-btns");
      const leave = document.getElementById("mp-btn-leave");
      const roomInfo = document.getElementById("mp-room-info");
      const hostOpts = document.getElementById("mp-host-opts");
      const startBtn = document.getElementById("mp-start-btn");
      const roleEl = document.getElementById("mp-role");
      const isHost = !!(MP && MP.isHost);
      if (pre) {
        if (on) pre.classList.add("hidden");
        else pre.classList.remove("hidden");
      }
      if (leave) {
        if (on) leave.classList.remove("hidden");
        else leave.classList.add("hidden");
      }
      if (roomInfo) {
        if (on) roomInfo.classList.remove("hidden");
        else roomInfo.classList.add("hidden");
      }
      ["mp-btn-create", "mp-btn-join"].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.disabled = on;
        b.classList.toggle("opacity-40", on);
        b.classList.toggle("pointer-events-none", on);
      });
      // Host vs client UI
      if (on && isHost) {
        hostOpts?.classList.remove("hidden");
        startBtn?.classList.remove("hidden");
        if (roleEl) roleEl.textContent = "Host — dünyayı sen başlatırsın";
      } else if (on && !isHost) {
        hostOpts?.classList.add("hidden");
        startBtn?.classList.add("hidden");
        if (roleEl) roleEl.textContent = "Misafir — host başlatmasını bekle";
        // client status banner
        let ban = document.getElementById("mp-client-wait");
        if (!ban) {
          ban = document.createElement("div");
          ban.id = "mp-client-wait";
          ban.className = "text-[11px] text-cyan-300 border border-cyan-900 bg-cyan-950/40 rounded p-2";
          ban.textContent = "Odaya katıldın. Ülkeni seç; host «Dünyayı Başlat» deyince harita açılır.";
          roomInfo?.parentNode?.insertBefore(ban, roomInfo.nextSibling);
        }
        ban.classList.remove("hidden");
      } else {
        hostOpts?.classList.add("hidden");
        startBtn?.classList.add("hidden");
        document.getElementById("mp-client-wait")?.classList.add("hidden");
        if (roleEl) roleEl.textContent = "—";
      }
    } catch (e) {
      console.warn("[MP] lobby UI:", e);
    }
  };

  function mpRenderLobbyList() {
    try { window.mpRenderLobbyList = mpRenderLobbyList; } catch (e) {}
    const box = document.getElementById("mp-player-list");
    if (!box) return;
    const list = Object.values(MP.players);
    if (!list.length) {
      box.innerHTML = '<div class="text-[#5a6450] text-[11px]">Oyuncu yok</div>';
      return;
    }
    box.innerHTML = list.map(p => {
      const me = p.id === MP.peerId;
      const flags = [
        p.ready ? "✓ Hazır" : "…",
        p.spectator ? "İzleyici" : (p.country || "—"),
        p.eliminated ? "ELENDİ" : ""
      ].filter(Boolean).join(" · ");
      return `<div class="flex justify-between text-[11px] ${me ? "text-cyan-300" : "text-[#c8d0b8]"}">
        <span>${escapeHtml(p.name || p.id)}${me ? " (sen)" : ""}</span>
        <span class="text-[#6a7460]">${escapeHtml(flags)}</span>
      </div>`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- Easter egg / cheat lock ----------
  function lockEasterEggs() {
    MP._easterLocked = true;
    // Block map editor, admin, "hello" console hooks
    window.toggleEditor = function () {
      mpToast("MP modunda harita editörü kapalı", "bad");
    };
    window.promptAdmin = function () {
      mpToast("MP modunda admin paneli kapalı", "bad");
    };
    // Neutralize known cheat entry
    try {
      if (window.CHEATS) window.CHEATS = {};
      if (typeof window.hello === "function") window.hello = function () {};
    } catch (e) {}
    console.log("[MP] Easter eggs / editor / admin locked");
  }

  // ---------- Network helpers ----------
  function sendTo(conn, obj) {
    if (!conn || !conn.open) return;
    try {
      const raw = JSON.stringify(obj);
      if (raw.length > MAX_PAYLOAD) {
        console.warn("[MP] payload too large, skipped", obj.t);
        return;
      }
      conn.send(raw);
    } catch (e) {
      console.warn("[MP] send fail", e);
    }
  }

  function broadcast(obj, exceptId) {
    try { window.broadcast = broadcast; window.sendToHost = sendToHost; } catch (e) {}
    Object.keys(MP.conns).forEach(id => {
      if (exceptId && id === exceptId) return;
      sendTo(MP.conns[id], obj);
    });
  }

  function sendToHost(obj) {
    if (MP.isHost) {
      handleHostMessage(MP.peerId, obj);
      return;
    }
    const hostConn = MP.conns[MP.hostId] || Object.values(MP.conns)[0];
    sendTo(hostConn, obj);
  }

  // ---------- State snapshot (host → clients) ----------
  function buildSyncPayload() {
    const date = GameState.date;
    return {
      t: "sync",
      date: date ? date.toISOString() : null,
      speed: MP.speedLevel,
      running: !!GameState.running && MP.speedLevel > 0,
      player: GameState.player,
      provinceOwners: provinceOwners || {},
      occupations: GameState.occupations || {},
      activeWars: sanitizeWars(GameState.activeWars || []),
      alliances: GameState.alliances || [],
      nonAggression: GameState.nonAggression || [],
      relations: GameState.relations || {},
      globalTension: GameState.globalTension || 0,
      countries: slimCountries(GameState.countries),
      players: MP.players,
      scenario: MP.scenario || GameState.scenarioId,
      gameOver: !!GameState.gameOver
    };
  }

  function slimCountries(countries) {
    const out = {};
    if (!countries) return out;
    Object.keys(countries).forEach(iso => {
      const c = countries[iso];
      if (!c) return;
      out[iso] = {
        name: c.name,
        flag: c.flag,
        color: c.color,
        ideology: c.ideology,
        pop: c.pop,
        civFactories: c.civFactories,
        milFactories: c.milFactories,
        money: c.money,
        manpower: c.manpower,
        divisions: c.divisions ? { ...c.divisions } : { inf: 0, art: 0, arm: 0 },
        stockpile: c.stockpile ? { ...c.stockpile } : { guns: 0, artillery: 0, tanks: 0 },
        alive: c.alive !== false
      };
    });
    return out;
  }

  function sanitizeWars(wars) {
    return (wars || []).map(w => ({
      attacker: w.attacker,
      target: w.target,
      progress: Math.round((w.progress || 0) * 10) / 10,
      totalWeeks: w.totalWeeks || 0,
      casualties: w.casualties || 0,
      enemyCasualties: w.enemyCasualties || 0,
      frontAssigned: !!w.frontAssigned,
      dailyGunsReq: w.dailyGunsReq || 45,
      dailyArtilleryReq: w.dailyArtilleryReq || 8
    }));
  }

  function hostPushSync() {
    if (!MP.active || !MP.isHost) return;
    try {
      const payload = buildSyncPayload();
      broadcast(payload);
      mpUpdateSyncDate();
    } catch (e) {
      console.warn("[MP] hostPushSync:", e);
    }
  }
  window.hostPushSync = hostPushSync;

  function applySyncPayload(msg) {
    if (!msg || MP.isHost) return;
    MP.applyingRemote = true;
    try {
      if (msg.date) {
        try {
          GameState.date = new Date(msg.date);
          const d = GameState.date;
          if (d && !isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, "0");
            const months = ["OCA","ŞUB","MAR","NİS","MAY","HAZ","TEM","AĞU","EYL","EKİ","KAS","ARA"];
            const txt = day + " " + months[d.getMonth()] + " " + d.getFullYear();
            const el = document.getElementById("hud-date");
            if (el) el.textContent = txt;
          }
        } catch (e) {}
      }
      if (msg.players && MP.players) {
        // keep local country for client
        const me = MP.players[MP.peerId];
        if (me && me.country) {
          GameState.player = me.country;
        }
      }
      if (typeof msg.speed === "number") {
        MP.speedLevel = msg.speed;
        applyLocalSpeed(msg.speed, true);
      }
      if (msg.provinceOwners && typeof provinceOwners !== "undefined") {
        Object.keys(msg.provinceOwners).forEach(p => {
          provinceOwners[p] = msg.provinceOwners[p];
        });
        // remove missing?
        Object.keys(provinceOwners).forEach(p => {
          if (!(p in msg.provinceOwners)) delete provinceOwners[p];
        });
      }
      if (msg.occupations) GameState.occupations = msg.occupations;
      if (msg.activeWars) GameState.activeWars = msg.activeWars;
      if (msg.alliances) GameState.alliances = msg.alliances;
      if (msg.nonAggression) GameState.nonAggression = msg.nonAggression;
      if (msg.relations) GameState.relations = msg.relations;
      if (typeof msg.globalTension === "number") GameState.globalTension = msg.globalTension;
      if (msg.countries) {
        Object.keys(msg.countries).forEach(iso => {
          if (!GameState.countries[iso]) GameState.countries[iso] = msg.countries[iso];
          else Object.assign(GameState.countries[iso], msg.countries[iso]);
        });
      }
      if (msg.players) MP.players = msg.players;
      if (msg.gameOver) GameState.gameOver = true;

      try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
      try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
      try { if (typeof renderActiveWarsDisplay === "function") renderActiveWarsDisplay(); } catch (e) {}
      try { mpRenderLobbyList(); } catch (e) {}
      mpUpdateSyncDate();
    } catch (e) {
      console.warn("[MP] applySync:", e);
    }
    MP.applyingRemote = false;
  }

  function mpUpdateSyncDate() {
    const el = document.getElementById("mp-sync-date");
    if (!el || !GameState.date) return;
    try {
      const d = GameState.date;
      const day = String(d.getDate()).padStart(2, "0");
      const months = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
      el.textContent = day + " " + months[d.getMonth()] + " " + d.getFullYear() + " · " + MP.speedLevel + "×";
    } catch (e) {}
  }

  // ---------- Shared speed / pause ----------
  function applyLocalSpeed(level, fromRemote) {
    level = Number(level);
    if (!(level in SPEED_MS) && level !== 4) level = 1;
    MP.speedLevel = level;
    const ms = SPEED_MS[level] != null ? SPEED_MS[level] : SPEED_MS[1];
    if (ms === 0) {
      GameState.running = false;
      if (window.gameTickInterval) {
        try { clearInterval(window.gameTickInterval); } catch (e) {}
        window.gameTickInterval = null;
      }
    } else {
      GameState.speed = ms;
      // Only host runs the tick clock in MP
      if (!MP.active || MP.isHost) {
        GameState.running = true;
        if (window.gameTickInterval) {
          try { clearInterval(window.gameTickInterval); } catch (e) {}
        }
        window.gameTickInterval = setInterval(() => {
          try {
            if (typeof gameTick === "function") gameTick();
            if (MP.active && MP.isHost) hostPushSync();
          } catch (e) {
            console.warn("[MP] tick:", e);
          }
        }, ms);
      } else {
        // Client: no local tick — only render from sync
        GameState.running = true;
        if (window.gameTickInterval) {
          try { clearInterval(window.gameTickInterval); } catch (e) {}
          window.gameTickInterval = null;
        }
      }
    }
    mpUpdateSyncDate();
    const st = document.getElementById("mp-hud-status");
    if (st) st.textContent = level === 0 ? "DURAKLATILDI" : ("MP " + level + "×");
  }

  window.mpSetSpeed = function (level) {
    level = Number(level);
    if (!MP.active) {
      // SP fallback
      const ms = SPEED_MS[level] != null ? SPEED_MS[level] : 800;
      if (typeof setGameSpeed === "function") setGameSpeed(ms || 800);
      if (level === 0) GameState.running = false;
      else GameState.running = true;
      return;
    }
    if (MP.isHost) {
      applyLocalSpeed(level, false);
      broadcast({ t: "speed", level: MP.speedLevel });
      hostPushSync();
    } else {
      // Client requests pause/speed — host decides
      sendToHost({ t: "speedReq", level: level });
    }
  };
  window.mpRequestPause = function () { window.mpSetSpeed(0); };
  window.mpCastVote = function (yes) {
    // Simplified: treat as speed 0 request ack UI only
    if (yes) window.mpSetSpeed(0);
  };

  // ---------- Message handling ----------
  function handleHostMessage(fromId, msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case "join": {
        const maxP = MP.maxPlayers || 6;
        const curN = Object.keys(MP.players || {}).length;
        if (curN >= maxP) {
          try {
            sendTo(MP.conns[fromId], { t: "sys", text: "Oda dolu (" + maxP + ")" });
            if (MP.conns[fromId]) MP.conns[fromId].close();
          } catch (e) {}
          break;
        }
        MP.players[fromId] = {
          id: fromId,
          name: String(msg.name || "Oyuncu").slice(0, 16),
          country: String(msg.country || "TUR").toUpperCase().slice(0, 5),
          ready: false,
          spectator: !!msg.spectator,
          eliminated: false
        };
        console.log("[MP] join", fromId, MP.players[fromId].name, MP.players[fromId].country);
        try { mpRenderLobbyList(); } catch (e) {}
        try { if (typeof window.mpRenderLobbyList === "function") window.mpRenderLobbyList(); } catch (e) {}
        try {
          var st = document.getElementById("mp-conn-status");
          if (st) st.textContent = "Host · " + Object.keys(MP.players).length + " oyuncu";
        } catch (e) {}
        try { if (typeof showToast === "function") showToast((msg.name||"Oyuncu") + " katıldı · " + (msg.country||""), "good"); } catch (e) {}
        broadcast({ t: "players", players: MP.players });
        sendTo(MP.conns[fromId], { t: "welcome", hostId: MP.peerId, players: MP.players, roomCode: MP.roomCode, scenario: MP.scenario, speed: MP.speedLevel, maxPlayers: maxP });
        mpSysChat((msg.name || fromId) + " katıldı");
        try { if (typeof window.mpAnnounceRoom === "function") window.mpAnnounceRoom(); } catch (e) {}
        try { if (typeof window.mpRenderLobbyList === "function") window.mpRenderLobbyList(); } catch (e) {}
        try { if (typeof showToast === "function") showToast((msg.name||"Oyuncu")+" katıldı ("+(msg.country||"?")+")", "good"); } catch (e) {}
        break;
      }
      case "countryPick":
        if (MP.players[fromId] && msg.country) {
          MP.players[fromId].country = String(msg.country).toUpperCase().slice(0, 5);
          mpRenderLobbyList();
          broadcast({ t: "players", players: MP.players });
          try { if (typeof window.mpRefreshCountrySelect === "function") window.mpRefreshCountrySelect(); } catch (e) {}
        }
        break;
      case "eventChoice":
        // client resolved an event — log for all
        try {
          const pname = (MP.players[fromId] && MP.players[fromId].name) || fromId;
          const line = "📜 " + pname + ": " + (msg.title || "Olay") + " → " + (msg.choice || "?");
          if (typeof log === "function") log(line, "text-amber-400");
          broadcast({ t: "logline", text: line, cls: "text-amber-400", toast: true, kind: "info" }, fromId);
        } catch (e) {}
        break;
      case "ready":
        if (MP.players[fromId]) {
          MP.players[fromId].ready = !!msg.ready;
          mpRenderLobbyList();
          broadcast({ t: "players", players: MP.players });
        }
        break;
      case "speedReq":
        applyLocalSpeed(msg.level, false);
        broadcast({ t: "speed", level: MP.speedLevel });
        hostPushSync();
        break;
      case "speedVote":
        try {
          if (typeof window.mpTallySpeedVote === "function") window.mpTallySpeedVote(fromId, msg.level);
          else {
            applyLocalSpeed(msg.level, false);
            broadcast({ t: "speed", level: MP.speedLevel });
            hostPushSync();
          }
        } catch (e) {}
        break;
      case "chat":
        pushChat(msg);
        broadcast({ t: "chat", ...msg }, null);
        break;
      case "trade":
        resolveTrade(fromId, msg);
        break;
      case "action":
        applyPlayerAction(fromId, msg);
        hostPushSync();
        break;
      case "diplo":
        handleDiploHost(fromId, msg);
        break;
      case "ping":
        broadcast({ t: "ping", x: msg.x, y: msg.y, kind: msg.kind, name: msg.name || (MP.players[fromId] && MP.players[fromId].name) }, null);
        break;
      default:
        break;
    }
  }

  function handleClientMessage(msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case "sync":
        applySyncPayload(msg);
        break;
      case "speed":
        applyLocalSpeed(msg.level, true);
        break;
      case "players":
        MP.players = msg.players || MP.players;
        mpRenderLobbyList();
        break;
      case "welcome":
        MP.hostId = msg.hostId;
        MP.players = msg.players || MP.players;
        MP.scenario = msg.scenario || MP.scenario;
        MP.active = true;
        MP.isHost = false;
        if (msg.roomCode) MP.roomCode = msg.roomCode;
        try {
          const codeEl = document.getElementById("mp-room-code");
          if (codeEl) codeEl.textContent = MP.roomCode || codeEl.textContent;
          const stEl = document.getElementById("mp-conn-status");
          if (stEl) stEl.textContent = "Bağlandı · " + Object.keys(MP.players||{}).length + " oyuncu";
          const roleEl = document.getElementById("mp-role");
          if (roleEl) roleEl.textContent = "Misafir — host başlatacak";
        } catch (e) {}
        mpRenderLobbyList();
        try { if (typeof window.mpRenderLobbyList === "function") window.mpRenderLobbyList(); } catch (e) {}
        mpSetLobbyInRoom(true);
        try { if (typeof showToast === "function") showToast("Odaya girildi · " + Object.keys(MP.players||{}).length + " oyuncu", "good"); } catch (e) {}
        break;
      case "chat":
        pushChat(msg);
        break;
      case "start":
        mpBeginGame(msg);
        break;
      case "diploAsk":
        showDiploAsk(msg);
        break;
      case "diploResult":
        mpToast("Diplomasi: " + (msg.ok ? "Kabul" : "Ret") + " — " + (msg.detail || ""), msg.ok ? "good" : "bad");
        break;
      case "elim":
        if (msg.iso === MP.country || msg.peerId === MP.peerId) {
          enterSpectator("Devletin haritadan silindi");
        }
        mpSysChat((msg.name || msg.iso) + " elendi ve haritadan silindi!");
        break;
      case "ping":
        showMapPing(msg.x, msg.y, msg.kind, msg.name);
        break;
      case "gameOver":
        showLocalGameOver(msg);
        break;
      case "sys":
        mpSysChat(msg.text || "");
        break;
      case "news":
        try {
          GameState.mpNews = GameState.mpNews || [];
          if (msg.entry) {
            GameState.mpNews.unshift(msg.entry);
            if (GameState.mpNews.length > 40) GameState.mpNews.length = 40;
          }
          if (typeof renderSupremacyNews === "function") renderSupremacyNews();
          if (msg.entry && msg.entry.text && typeof showToast === "function")
            showToast(msg.entry.text, msg.entry.kind === "war" ? "war" : "info");
        } catch (e) {}
        break;
      case "event":
        try {
          if (msg.ev && typeof window.showEventModal === "function") {
            // mark as remote so resolve doesn't double-broadcast
            msg.ev._fromHost = true;
            window.showEventModal(msg.ev);
          } else if (msg.ev && typeof showToast === "function") {
            showToast("Olay: " + (msg.ev.title || ""), "info");
            if (typeof log === "function") log("📜 " + (msg.ev.title || "") + " — " + (msg.ev.text || ""), "text-amber-300");
          }
        } catch (e) { console.warn("[MP event]", e); }
        break;
      case "logline":
        try {
          if (typeof log === "function") log(msg.text || "", msg.cls || "text-slate-400");
          if (msg.toast && typeof showToast === "function") showToast(String(msg.text).slice(0, 120), msg.kind || "info");
        } catch (e) {}
        break;
      default:
        break;
    }
  }

  function onData(fromId, raw) {
    let msg;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!msg || !msg.t) return;
    if (MP.isHost) handleHostMessage(fromId, msg);
    else handleClientMessage(msg);
  }

  function wireConn(conn) {
    if (!conn) return;
    const id = conn.peer;
    MP.conns[id] = conn;
    conn.on("data", d => onData(id, d));
    conn.on("close", () => {
      delete MP.conns[id];
      if (MP.isHost) {
        const name = (MP.players[id] && MP.players[id].name) || id;
        delete MP.players[id];
        mpRenderLobbyList();
        broadcast({ t: "players", players: MP.players });
        mpSysChat(name + " ayrıldı");
      } else if (id === MP.hostId) {
        mpToast("Host bağlantısı koptu", "bad");
        MP.active = false;
      }
    });
    conn.on("error", () => {});
  }

  // ---------- Create / Join / Leave ----------
  window.mpCreateRoom = function () {
    if (MP.active && MP.peerId) {
      mpSetLobbyInRoom(true);
      mpToast("Zaten odadasın");
      return;
    }
    if (typeof Peer === "undefined") {
      mpToast("PeerJS yok — internet gerekli", "bad");
      return;
    }
    MP.name = (document.getElementById("mp-player-name")?.value || "Host").slice(0, 16);
    MP.country = (window.__mpPickedCountry || document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 5);
    window.__mpPickedCountry = MP.country;
    MP.spectator = !!document.getElementById("mp-spectator")?.checked;
    MP.scenario = document.getElementById("mp-scenario")?.value || "modern";
    MP.roomCode = genRoomCode();
    setRoomHash(MP.roomCode);
    lockEasterEggs();

    const hid = hostPeerIdFromCode(MP.roomCode);
    // Show code immediately (don't wait for broker)
    try {
      document.getElementById("mp-room-info")?.classList.remove("hidden");
      const codeEl = document.getElementById("mp-room-code");
      if (codeEl) codeEl.textContent = MP.roomCode;
      const stEl = document.getElementById("mp-conn-status");
      if (stEl) stEl.textContent = "Broker'a bağlanıyor…";
      mpSetLobbyInRoom(true);
    } catch (e) {}
    try { if (MP.peer) MP.peer.destroy(); } catch (e) {}
    const _peerOpts = {
      debug: 1,
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: { iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]}
    };
    try { MP.peer = new Peer(hid, _peerOpts); } catch (e) { MP.peer = new Peer(hid); }
    MP.peer.on("open", id => {
      MP.peerId = id;
      MP.isHost = true;
      MP.active = true;
      MP.hostId = id;
      MP.players[id] = {
        id, name: MP.name, country: MP.country,
        ready: false, spectator: MP.spectator, eliminated: false
      };
      try {
        document.getElementById("mp-room-info")?.classList.remove("hidden");
        document.getElementById("mp-host-opts")?.classList.remove("hidden");
        document.getElementById("mp-start-btn")?.classList.remove("hidden");
        const codeEl = document.getElementById("mp-room-code");
        if (codeEl) codeEl.textContent = MP.roomCode;
        const roleEl = document.getElementById("mp-role");
        if (roleEl) roleEl.textContent = "Host (zaman otoritesi)";
        const stEl = document.getElementById("mp-conn-status");
        if (stEl) stEl.textContent = "Açık";
        mpSetLobbyInRoom(true);
        mpRenderLobbyList();
        mpToast("Oda #" + MP.roomCode + " — linki paylaş");
        try { if (typeof window.mpAnnounceRoom === "function") window.mpAnnounceRoom(); } catch (e) {}
      } catch (e) {
        console.warn("[MP] create UI:", e);
      }
    });
    MP.peer.on("connection", conn => {
      conn.on("open", () => wireConn(conn));
      // also wire immediately
      wireConn(conn);
    });
    MP.peer.on("error", err => {
      console.warn("[MP] peer error", err);
      const stEl = document.getElementById("mp-conn-status");
      if (stEl) stEl.textContent = "Hata";
      mpToast("Peer hata: " + (err.type || "error"), "bad");
    });
  };

  window.mpJoinRoomPrompt = function () {
    if (MP.active && MP.peerId) {
      mpSetLobbyInRoom(true);
      mpToast("Zaten odadasın");
      return;
    }
    const code = prompt("Oda kodu (6 hane) veya linkteki #KOD:", parseRoomFromUrl() || "");
    if (!code) return;
    const clean = String(code).replace(/^.*#/, "").replace(/^JOIN-/i, "").trim().toUpperCase();
    if (clean.length < 4) return;
    window.mpJoinRoom(clean);
  };

  window.mpJoinRoom = function (code) {
    if (MP.active && MP.peerId) {
      mpSetLobbyInRoom(true);
      mpToast("Zaten odadasın");
      return;
    }
    if (typeof Peer === "undefined") {
      mpToast("PeerJS yok", "bad");
      return;
    }
    code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
    MP.name = (document.getElementById("mp-player-name")?.value || "Oyuncu").slice(0, 16);
    MP.country = (window.__mpPickedCountry || document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 5);
    window.__mpPickedCountry = MP.country;
    MP.spectator = !!document.getElementById("mp-spectator")?.checked;
    MP.roomCode = code;
    setRoomHash(code);
    MP.isHost = false;
    MP.active = true;
    lockEasterEggs();

    try { if (MP.peer) MP.peer.destroy(); } catch (e) {}
    const _peerOptsJ = {
      debug: 1,
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: { iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]}
    };
    try { MP.peer = new Peer(undefined, _peerOptsJ); } catch (e) { MP.peer = new Peer(); }
    MP.peer.on("open", id => {
      MP.peerId = id;
      const hostId = hostPeerIdFromCode(code);
      MP.hostId = hostId;
      const conn = MP.peer.connect(hostId, { reliable: true });
      conn.on("open", () => {
        wireConn(conn);
        sendTo(conn, {
          t: "join",
          name: MP.name,
          country: MP.country,
          spectator: MP.spectator
        });
        try {
          document.getElementById("mp-room-info")?.classList.remove("hidden");
          const codeEl = document.getElementById("mp-room-code");
          if (codeEl) codeEl.textContent = code;
          const roleEl = document.getElementById("mp-role");
          if (roleEl) roleEl.textContent = MP.spectator ? "İzleyici" : "İstemci (senkron)";
          const stEl = document.getElementById("mp-conn-status");
          if (stEl) stEl.textContent = "Bağlı";
          mpSetLobbyInRoom(true);
          mpToast("Host senkronuna bağlandı");
        } catch (e) {
          console.warn("[MP] join UI:", e);
        }
      });
      conn.on("error", () => mpToast("Bağlantı yok — host açık mı?", "bad"));
    });
    MP.peer.on("error", err => mpToast("Peer: " + (err.type || ""), "bad"));
  };

  window.mpLeaveRoom = function () {
    try {
      if (MP.peer) MP.peer.destroy();
    } catch (e) {}
    MP.active = false;
    MP.isHost = false;
    MP.gameStarted = false;
    MP.conns = Object.create(null);
    MP.players = Object.create(null);
    MP.peerId = null;
    MP.roomCode = null;
    MP.hostId = null;
    MP.peer = null;
    if (MP.syncIv) {
      try { clearInterval(MP.syncIv); } catch (e) {}
      MP.syncIv = null;
    }
    mpSetLobbyInRoom(false);
    clearRoomHash();
    document.getElementById("mp-hud")?.classList.add("hidden");
    mpToast("Odadan çıkıldı");
  };

  window.mpCloseLobby = function () {
    document.getElementById("mp-lobby-modal")?.classList.add("hidden");
    if (!GameState.running && !MP.gameStarted) {
      document.getElementById("main-menu-screen")?.classList.remove("hidden");
    }
  };

  window.mainMenuMultiplayer = function () {
    document.getElementById("main-menu-screen")?.classList.add("hidden");
    document.getElementById("mp-lobby-modal")?.classList.remove("hidden");
    // If URL has room code, auto-join prompt state
    const fromUrl = parseRoomFromUrl();
    if (fromUrl && !MP.active) {
      const codeEl = document.getElementById("mp-room-code");
      if (codeEl) codeEl.textContent = fromUrl;
    }
    if (MP.active) mpSetLobbyInRoom(true);
    else mpSetLobbyInRoom(false);
  };

  window.mpToggleReady = function () {
    if (!MP.active || !MP.peerId) return;
    const p = MP.players[MP.peerId];
    if (!p) return;
    p.ready = !p.ready;
    mpRenderLobbyList();
    if (MP.isHost) {
      broadcast({ t: "players", players: MP.players });
    } else {
      sendToHost({ t: "ready", ready: p.ready });
    }
  };

  window.mpHostStart = function () {
    if (!MP.isHost) {
      mpToast("Sadece host başlatabilir");
      return;
    }
    const humans = Object.values(MP.players).filter(p => !p.spectator);
    // Allow start even if not all ready (host authority)
    MP.gameStarted = true;
    MP.stats.startTime = Date.now();
    const payload = {
      t: "start",
      scenario: MP.scenario,
      players: MP.players,
      hostCountry: MP.country
    };
    broadcast(payload);
    mpBeginGame(payload);
  };

  function mpBeginGame(msg) {
    try {
      if (msg && msg.tempo && typeof mpSetSupremacyTempo === "function") mpSetSupremacyTempo(msg.tempo);
      if (typeof ensureSupremacyHUD === "function") {}
      setTimeout(function(){ try { if (document.getElementById("sup-hud")==null && typeof window.mpHostStartSupremacy==="function") { /* client HUD */ } var ev = new Event("sup-started"); window.dispatchEvent(ev);} catch(e){} }, 500);
    } catch(e) {}

    try {
      document.getElementById("mp-lobby-modal")?.classList.add("hidden");
      document.getElementById("main-menu-screen")?.classList.add("hidden");
      document.getElementById("lobby-screen")?.classList.add("hidden");
      document.getElementById("mp-hud")?.classList.remove("hidden");
    } catch (e) {}

    MP.gameStarted = true;
    // Assign local player country from lobby selection
    if (MP.players[MP.peerId] && MP.players[MP.peerId].country) {
      const _pc = MP.players[MP.peerId].country || window.__mpPickedCountry || MP.country;
      GameState.player = _pc;
      MP.country = _pc;
    }
    // Start single-player style game under host clock
    try {
      if (typeof applyScenario === "function") {
        applyScenario(msg.scenario || MP.scenario || "modern");
      }
    } catch (e) {
      console.warn("[MP] scenario:", e);
    }
    try {
      if (typeof startGame === "function" && !GameState.running) {
        // Host starts; clients wait for sync
        if (MP.isHost) {
          GameState.running = true;
          applyLocalSpeed(1, false);
        } else {
          GameState.running = true;
          // no local interval
        }
      } else if (MP.isHost) {
        applyLocalSpeed(MP.speedLevel || 1, false);
      }
    } catch (e) {
      console.warn("[MP] begin:", e);
    }

    if (MP.isHost) {
      if (MP.syncIv) clearInterval(MP.syncIv);
      MP.syncIv = setInterval(hostPushSync, SYNC_INTERVAL_MS);
      hostPushSync();
    }
    mpSysChat("Oyun başladı — host zaman otoritesi");
    lockEasterEggs();
  }

  // ---------- Chat ----------
  function pushChat(msg) {
    MP.chat.push({
      from: msg.from || msg.name || "?",
      text: String(msg.text || "").slice(0, 200),
      channel: msg.channel || "global",
      to: msg.to || null,
      ts: Date.now()
    });
    if (MP.chat.length > MAX_CHAT) MP.chat.shift();
    renderChatLog();
  }
  function mpSysChat(text) {
    pushChat({ from: "SİSTEM", text: text, channel: "global" });
    if (MP.isHost) broadcast({ t: "sys", text: text });
  }
  function renderChatLog() {
    const box = document.getElementById("mp-chat-log");
    if (!box) return;
    const ch = MP.chatChannel || "global";
    const rows = MP.chat.filter(m => {
      if (ch === "global") return m.channel === "global" || m.from === "SİSTEM";
      // DM: show messages involving me
      return m.channel === "dm" && (m.to === MP.peerId || m.fromId === MP.peerId || m.from === MP.name);
    });
    box.innerHTML = rows.map(m => {
      const cls = m.from === "SİSTEM" ? "sys" : (m.from === MP.name ? "mine" : (m.channel === "dm" ? "dm" : ""));
      return `<div class="${cls}"><b>${escapeHtml(m.from)}:</b> ${escapeHtml(m.text)}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }

  window.mpOpenChat = function () {
    document.getElementById("mp-chat-modal")?.classList.remove("hidden");
    renderChatLog();
  };
  window.mpChatChannel = function (ch) {
    MP.chatChannel = ch === "dm" ? "dm" : "global";
    document.getElementById("mp-ch-global")?.classList.toggle("border-cyan-800", MP.chatChannel === "global");
    document.getElementById("mp-ch-dm")?.classList.toggle("border-cyan-800", MP.chatChannel === "dm");
    // fill DM targets
    const sel = document.getElementById("mp-dm-target");
    if (sel) {
      sel.innerHTML = Object.values(MP.players)
        .filter(p => p.id !== MP.peerId)
        .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
        .join("");
    }
    renderChatLog();
  };
  window.mpSendChat = function () {
    const input = document.getElementById("mp-chat-input");
    if (!input) return;
    const text = String(input.value || "").trim().slice(0, 200);
    if (!text) return;
    input.value = "";
    const msg = {
      t: "chat",
      from: MP.name,
      fromId: MP.peerId,
      text,
      channel: MP.chatChannel || "global",
      to: MP.chatChannel === "dm" ? (document.getElementById("mp-dm-target")?.value || null) : null
    };
    if (MP.isHost) {
      pushChat(msg);
      broadcast(msg);
    } else {
      sendToHost(msg);
    }
  };

  // ---------- Trade ----------
  window.mpOpenTrade = function () {
    const modal = document.getElementById("mp-trade-modal");
    if (!modal) return;
    const sel = document.getElementById("mp-trade-target");
    if (sel) {
      sel.innerHTML = Object.values(MP.players)
        .filter(p => p.id !== MP.peerId && !p.spectator)
        .map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.country})</option>`)
        .join("");
    }
    modal.classList.remove("hidden");
  };
  window.mpSendTrade = function () {
    const target = document.getElementById("mp-trade-target")?.value;
    const money = Number(document.getElementById("mp-trade-money")?.value) || 0;
    const oil = Number(document.getElementById("mp-trade-oil")?.value) || 0;
    const food = Number(document.getElementById("mp-trade-food")?.value) || 0;
    const prov = document.getElementById("mp-trade-prov")?.value || "";
    if (!target) return;
    const msg = { t: "trade", fromId: MP.peerId, target, money, oil, food, prov };
    if (MP.isHost) resolveTrade(MP.peerId, msg);
    else sendToHost(msg);
    document.getElementById("mp-trade-modal")?.classList.add("hidden");
  };
  function resolveTrade(fromId, msg) {
    // Host validates basic resources of from player country
    const fromP = MP.players[fromId];
    if (!fromP) return;
    const c = GameState.countries[fromP.country];
    if (!c) {
      sendTo(MP.conns[fromId], { t: "sys", text: "Takas red: ülke yok" });
      return;
    }
    if ((msg.money || 0) > (c.money || 0)) {
      broadcast({ t: "sys", text: "Takas red: yetersiz para (" + fromP.name + ")" });
      return;
    }
    c.money -= (msg.money || 0);
    const toP = MP.players[msg.target];
    if (toP && GameState.countries[toP.country]) {
      GameState.countries[toP.country].money = (GameState.countries[toP.country].money || 0) + (msg.money || 0);
    }
    mpSysChat("Takas: " + fromP.name + " → " + ((toP && toP.name) || msg.target));
    hostPushSync();
  }

  // ---------- Diplomacy popups ----------
  function handleDiploHost(fromId, msg) {
    const fromP = MP.players[fromId];
    if (!fromP) return;
    const payload = {
      t: "diploAsk",
      kind: msg.kind,
      from: fromP.country,
      fromName: fromP.name,
      fromId: fromId,
      to: msg.to,
      detail: msg.detail || ""
    };
    // Find target player's peer
    const targetPeer = Object.values(MP.players).find(p => p.country === msg.to);
    if (targetPeer && MP.conns[targetPeer.id]) {
      sendTo(MP.conns[targetPeer.id], payload);
    } else {
      // AI or offline — auto resolve simply
      applyDiploResult(msg.kind, fromP.country, msg.to, true);
      hostPushSync();
    }
  }

  function showDiploAsk(msg) {
    const modal = document.getElementById("mp-diplo-popup");
    if (!modal) {
      mpToast("Diplo: " + (msg.kind || "") + " from " + (msg.fromName || msg.from));
      return;
    }
    const title = document.getElementById("mp-diplo-title");
    const body = document.getElementById("mp-diplo-body");
    const labels = {
      war: "Savaş ilanı",
      peace: "Barış teklifi",
      ally: "İttifak teklifi",
      trade: "Ticaret teklifi",
      nap: "Saldırmazlık paktı"
    };
    if (title) title.textContent = labels[msg.kind] || "Diplomatik teklif";
    if (body) body.textContent = (msg.fromName || msg.from) + " size " + (labels[msg.kind] || msg.kind) + " gönderdi. " + (msg.detail || "");
    MP.pendingDiplo = msg;
    modal.classList.remove("hidden");
    const acc = document.getElementById("mp-diplo-accept");
    const rej = document.getElementById("mp-diplo-reject");
    if (acc) acc.onclick = function () { respondDiplo(true); };
    if (rej) rej.onclick = function () { respondDiplo(false); };
  }

  function respondDiplo(accept) {
    const msg = MP.pendingDiplo;
    document.getElementById("mp-diplo-popup")?.classList.add("hidden");
    if (!msg) return;
    MP.pendingDiplo = null;
    const reply = {
      t: "action",
      action: "diploReply",
      kind: msg.kind,
      from: msg.from,
      to: msg.to || MP.country,
      accept: !!accept,
      fromId: msg.fromId
    };
    if (MP.isHost) {
      applyDiploResult(msg.kind, msg.from, msg.to || MP.country, accept);
      if (msg.fromId && MP.conns[msg.fromId]) {
        sendTo(MP.conns[msg.fromId], { t: "diploResult", ok: accept, detail: msg.kind });
      }
      hostPushSync();
    } else {
      sendToHost(reply);
    }
    mpToast(accept ? "Teklif kabul edildi" : "Teklif reddedildi", accept ? "good" : "bad");
  }

  function applyDiploResult(kind, fromIso, toIso, accept) {
    if (!accept) {
      mpSysChat(fromIso + " ↔ " + toIso + " " + kind + " reddedildi");
      return;
    }
    if (kind === "ally") {
      GameState.alliances = GameState.alliances || [];
      GameState.alliances.push({ a: fromIso, b: toIso });
      mpSysChat("İttifak: " + fromIso + " + " + toIso);
    } else if (kind === "nap") {
      GameState.nonAggression = GameState.nonAggression || [];
      GameState.nonAggression.push({ a: fromIso, b: toIso, weeks: 52 });
      mpSysChat("NAP: " + fromIso + " + " + toIso);
    } else if (kind === "peace") {
      GameState.activeWars = (GameState.activeWars || []).filter(w =>
        !((w.attacker === fromIso && w.target === toIso) || (w.attacker === toIso && w.target === fromIso))
      );
      mpSysChat("Barış: " + fromIso + " / " + toIso);
    } else if (kind === "war") {
      // Host creates bilateral war entry
      ensureWar(fromIso, toIso);
      mpSysChat("Savaş: " + fromIso + " → " + toIso);
    }
  }

  window.mpProposeAlliance = function (iso) {
    if (!iso) return;
    if (!MP.active) {
      if (typeof proposeAlliance === "function") proposeAlliance(iso);
      return;
    }
    sendDiplo("ally", iso);
  };
  window.mpProposePeace = function (iso) {
    if (!iso) return;
    if (!MP.active) {
      GameState.activeWars = (GameState.activeWars || []).filter(w =>
        !(w.target === iso || w.attacker === iso)
      );
      return;
    }
    sendDiplo("peace", iso);
  };
  function sendDiplo(kind, toIso) {
    const msg = { t: "diplo", kind: kind, from: MP.country, to: toIso };
    if (MP.isHost) handleDiploHost(MP.peerId, msg);
    else sendToHost(msg);
  }

  // ---------- Player actions (client → host) ----------
  function applyPlayerAction(fromId, msg) {
    const p = MP.players[fromId];
    if (!p || p.eliminated) return;
    const iso = p.country;
    if (msg.action === "declareWar" && msg.target) {
      ensureWar(iso, msg.target);
      mpSysChat(p.name + " savaş ilan etti: " + msg.target);
    } else if (msg.action === "diploReply") {
      applyDiploResult(msg.kind, msg.from, msg.to, msg.accept);
      if (msg.fromId && MP.conns[msg.fromId]) {
        sendTo(MP.conns[msg.fromId], { t: "diploResult", ok: msg.accept, detail: msg.kind });
      }
    }
  }

  // ---------- War: bilateral, symmetric score ----------
  function ensureWar(attacker, target) {
    if (!attacker || !target || attacker === target) return;
    GameState.activeWars = GameState.activeWars || [];
    const exists = GameState.activeWars.some(w =>
      (w.attacker === attacker && w.target === target) ||
      (w.attacker === target && w.target === attacker)
    );
    if (exists) return;
    GameState.activeWars.push({
      attacker: attacker,
      target: target,
      progress: 0, // always from attacker's perspective: + = attacker winning
      dailyGunsReq: 45,
      dailyArtilleryReq: 8,
      totalWeeks: 0,
      casualties: 0,
      enemyCasualties: 0,
      frontAssigned: false
    });
    GameState.relations = GameState.relations || {};
    GameState.relations[target] = Math.min(GameState.relations[target] || 0, -85);
  }

  // Hook declareWar for MP routing — host authority, no double entries
  (function hookDeclareWar() {
    const prev = window.declareWar || (typeof declareWar === "function" ? declareWar : null);
    if (!prev || window._scMpWarHook) return;
    window._scMpWarHook = true;
    window.declareWar = function (targetIso) {
      if (!targetIso) return;
      if (MP.active) {
        if (MP.spectator || MP.eliminated) {
          mpToast("İzleyici / elenmiş: savaş ilan edilemez", "bad");
          return;
        }
        if (MP.isHost) {
          // Run original side-effects (NAP checks, tension, log) then normalize war list
          try { prev.apply(this, arguments); } catch (e) { console.warn("[MP] declareWar SP path", e); }
          // Normalize: single bilateral war with explicit attacker
          GameState.activeWars = (GameState.activeWars || []).filter(w =>
            !((w.attacker === GameState.player && w.target === targetIso) ||
              (w.attacker === targetIso && w.target === GameState.player) ||
              (w.target === targetIso && !w.attacker))
          );
          ensureWar(GameState.player, targetIso);
          hostPushSync();
        } else {
          sendToHost({ t: "action", action: "declareWar", target: targetIso });
          mpToast("Savaş ilanı host'a iletildi");
        }
        return;
      }
      // Single-player path
      const r = prev.apply(this, arguments);
      try {
        const wars = GameState.activeWars || [];
        const last = wars[wars.length - 1];
        if (last && last.target === targetIso && !last.attacker) last.attacker = GameState.player;
      } catch (e) {}
      return r;
    };
    try { if (typeof declareWar === "function") declareWar = window.declareWar; } catch (e) {}
  })();

  // ---------- Elimination / Spectator ----------
  window.checkPlayerEliminated = function () {
    if (!MP.active && !GameState.running) return;
    const iso = GameState.player;
    if (!iso || GameState.gameOver) return;
    let n = 0;
    try {
      n = Object.values(provinceOwners || {}).filter(o => o === iso).length;
    } catch (e) { return; }
    if (n > 0) return;

    // Player has 0 provinces
    if (MP.active) {
      enterSpectator("Son eyaletin düştü — YENİLGİ");
      if (MP.isHost) {
        broadcast({
          t: "elim",
          iso: iso,
          peerId: MP.peerId,
          name: MP.name
        });
        mpSysChat(MP.name + " (" + iso + ") elendi ve haritadan silindi!");
      } else {
        sendToHost({ t: "action", action: "elimSelf", iso: iso });
      }
    } else {
      GameState.gameOver = true;
      GameState.running = false;
      if (window.gameTickInterval) {
        try { clearInterval(window.gameTickInterval); } catch (e) {}
      }
      showLocalGameOver({ reason: "Haritadaki tüm topraklarını kaybettin." });
    }
  };

  function enterSpectator(reason) {
    MP.spectator = true;
    MP.eliminated = true;
    if (MP.players[MP.peerId]) {
      MP.players[MP.peerId].eliminated = true;
      MP.players[MP.peerId].spectator = true;
    }
    GameState.running = false;
    showLocalGameOver({ reason: reason || "Yenildin", spectator: true });
  }

  function showLocalGameOver(msg) {
    let host = document.getElementById("sc-gameover-modal");
    if (!host) {
      host = document.createElement("div");
      host.id = "sc-gameover-modal";
      host.className = "fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4";
      host.innerHTML = `
        <div class="w-full max-w-md rounded border-2 border-red-800 bg-[#120a0a] p-6 text-center space-y-4">
          <div class="text-2xl font-black text-red-400 tracking-widest">GAME OVER</div>
          <div id="sc-go-reason" class="text-sm text-slate-300"></div>
          <div class="grid grid-cols-1 gap-2">
            <button type="button" id="sc-go-spec" class="py-2.5 font-bold border border-cyan-800 bg-[#0a1520] text-cyan-200 rounded">İzleyici olarak devam et</button>
            <button type="button" id="sc-go-menu" class="py-2.5 font-bold border border-slate-700 bg-slate-900 rounded">Ana menü</button>
          </div>
        </div>`;
      document.body.appendChild(host);
      document.getElementById("sc-go-spec").onclick = function () {
        host.classList.add("hidden");
        MP.spectator = true;
        document.getElementById("mp-hud")?.classList.remove("hidden");
        mpToast("İzleyici modu — haritayı izleyebilirsin");
      };
      document.getElementById("sc-go-menu").onclick = function () {
        host.classList.add("hidden");
        try { window.mpLeaveRoom(); } catch (e) {}
        location.reload();
      };
    }
    const r = document.getElementById("sc-go-reason");
    if (r) r.textContent = (msg && msg.reason) || "Devletin yıkıldı.";
    host.classList.remove("hidden");
  }

  // ---------- Map ping (Alt+click) ----------
  function showMapPing(x, y, kind, name) {
    try {
      const el = document.createElement("div");
      el.className = "mp-ping-marker fixed z-[110] pointer-events-none text-xl";
      el.style.left = (x || 0) + "px";
      el.style.top = (y || 0) + "px";
      el.textContent = kind === "defend" ? "🛡️" : "⚔️";
      el.title = name || "";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    } catch (e) {}
  }
  window.mpShowPing = showMapPing;

  function setupMapPing() {
    const map = document.getElementById("game-map") || document.getElementById("map-container");
    if (!map || map._mpPing) return;
    map._mpPing = true;
    map.addEventListener("click", function (ev) {
      if (!ev.altKey || !MP.active) return;
      ev.preventDefault();
      const kind = ev.shiftKey ? "defend" : "attack";
      const msg = { t: "ping", x: ev.clientX, y: ev.clientY, kind: kind, name: MP.name };
      if (MP.isHost) {
        showMapPing(msg.x, msg.y, msg.kind, msg.name);
        broadcast(msg);
      } else {
        sendToHost(msg);
        showMapPing(msg.x, msg.y, msg.kind, msg.name);
      }
    });
  }

  // ---------- Host-only tick enforcement ----------
  (function wrapGameTickForMP() {
    if (window._scMpTickWrap) return;
    window._scMpTickWrap = true;
    const prev = window.gameTick || (typeof gameTick === "function" ? gameTick : null);
    if (!prev) return;
    window.gameTick = function () {
      if (MP.active && !MP.isHost) {
        // Clients never advance simulation
        return;
      }
      if (MP.active && MP.spectator && !MP.isHost) return;
      try {
        prev.apply(this, arguments);
      } catch (e) {
        console.warn("[MP] gameTick:", e);
      }
      // After tick, host checks elimination for all human countries
      if (MP.active && MP.isHost) {
        try {
          Object.values(MP.players).forEach(p => {
            if (!p || p.spectator || p.eliminated) return;
            const n = Object.values(provinceOwners || {}).filter(o => o === p.country).length;
            if (n === 0) {
              p.eliminated = true;
              p.spectator = true;
              broadcast({ t: "elim", iso: p.country, peerId: p.id, name: p.name });
              mpSysChat(p.name + " (" + p.country + ") elendi ve haritadan silindi!");
              if (p.id === MP.peerId) enterSpectator("Son eyaletin düştü");
            }
          });
          // track stats
          try {
            const myN = Object.values(provinceOwners || {}).filter(o => o === GameState.player).length;
            if (myN > (MP.stats.maxProvinces || 0)) MP.stats.maxProvinces = myN;
            MP.stats.survivedDays = (MP.stats.survivedDays || 0) + 1;
          } catch (e) {}
        } catch (e) {
          console.warn("[MP] elim check:", e);
        }
      }
    };
    try { if (typeof gameTick === "function") gameTick = window.gameTick; } catch (e) {}
  })();

  // ---------- URL auto-join on load ----------
  function bootFromHash() {
    const code = parseRoomFromUrl();
    if (!code) return;
    // Open MP lobby and offer join
    setTimeout(() => {
      try {
        document.getElementById("main-menu-screen")?.classList.add("hidden");
        document.getElementById("mp-lobby-modal")?.classList.remove("hidden");
        const codeEl = document.getElementById("mp-room-code");
        if (codeEl) codeEl.textContent = code;
        mpToast("Oda linki algılandı: #" + code + " — Koda katıl");
      } catch (e) {}
    }, 600);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      setupMapPing();
      bootFromHash();
    });
    // late bind if DOM already ready
    if (document.readyState !== "loading") {
      setTimeout(() => { setupMapPing(); bootFromHash(); }, 200);
    }
  }

  // IP privacy: PeerJS already uses broker; we never log remote addresses
  // Mask any accidental exposure in toasts
  const _origWarn = console.warn;
  // (no console override needed — we simply never surface peer IPs)

  console.log("[MP] HOI4-style host-centric engine online");
})();

// ============================================================
// War score symmetry fix (SP + MP) — attacker progress, defender sees negative
// ============================================================
(function SCWarScoreFix() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // Ensure renderActiveWarsDisplay uses attacker-relative progress
  const _rawRender = window.renderActiveWarsDisplay;
  // Original function already side-aware in stage1; reinforce assignFront & progress clamp
  window.getWarScoreForViewer = function (war, viewerIso) {
    if (!war) return 0;
    const att = war.attacker;
    const def = war.target;
    const raw = Math.floor(war.progress || 0);
    if (viewerIso === def) return -raw;
    if (viewerIso === att) return raw;
    // third party: show attacker perspective
    return raw;
  };

  // When war progress is updated in combat, clamp -100..100 conceptually
  // (stored as 0..100 attacker advantage; display flips for defender)
  const prevResolve = window.resolveWar;
  if (typeof prevResolve === "function" && !window._scWarResolveHook) {
    window._scWarResolveHook = true;
    window.resolveWar = function (index, victory) {
      const war = (GameState.activeWars || [])[index];
      if (war && typeof war.progress === "number") {
        war.progress = Math.max(-20, Math.min(100, war.progress));
      }
      const r = prevResolve.apply(this, arguments);
      try {
        if (typeof mpIsActive === "function" && mpIsActive() && typeof hostPushSync === "function" && window.mpIsHost && mpIsHost()) {
          hostPushSync();
        }
      } catch (e) {}
      try { if (typeof checkPlayerEliminated === "function") checkPlayerEliminated(); } catch (e) {}
      return r;
    };
  }

  console.log("[War] score symmetry helpers ready");
})();

// ============================================================
// AŞAMA 3 — Fog of War · Ping/Desync · World Tension · Peace Conference
// Host-centric MP ile uyumlu; SP'de FoW opsiyonel, tension kuralları geçerli
// ============================================================
(function SCStage3Systems() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // ---------- Helpers ----------
  function mpOn() {
    return typeof mpIsActive === "function" && mpIsActive();
  }
  function myIso() {
    return GameState.player || null;
  }
  function alliesOf(iso) {
    const set = new Set([iso]);
    (GameState.alliances || []).forEach(a => {
      if (a.a === iso) set.add(a.b);
      if (a.b === iso) set.add(a.a);
    });
    // Faction mates if HOI factions exist
    try {
      if (GameState.hoi && GameState.hoi.factions && typeof getFactionOf === "function") {
        const f = getFactionOf(iso);
        if (f && GameState.hoi.factions[f] && Array.isArray(GameState.hoi.factions[f].members)) {
          GameState.hoi.factions[f].members.forEach(m => set.add(m));
        }
      }
    } catch (e) {}
    return set;
  }
  function neighborsOf(pName) {
    try {
      if (typeof getProvinceNeighbors === "function") return getProvinceNeighbors(pName) || [];
      const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
      return (PD[pName] && PD[pName].neighbors) || [];
    } catch (e) { return []; }
  }

  // ============================================================
  // 1) FOG OF WAR
  // Visible: own land, allied land, provinces adjacent to those.
  // Hidden: fog fill; division counts masked in tooltips/panels.
  // ============================================================
  window.FOG_FILL = "#0a0e14";
  window.FOG_ENABLED = true;

  window.canSeeProvince = function (pName, viewerIso) {
    if (!window.FOG_ENABLED) return true;
    // Single-player: optional fog only when MP active (user asked MP FoW)
    if (!mpOn()) return true;
    viewerIso = viewerIso || myIso();
    if (!viewerIso || !pName) return true;
    if (typeof mpIsSpectator === "function" && mpIsSpectator()) return true; // spectators see all
    const owner = (typeof getProvinceOwner === "function")
      ? getProvinceOwner(pName)
      : ((typeof provinceOwners !== "undefined" && provinceOwners[pName]) || "NEUTRAL");
    const friend = alliesOf(viewerIso);
    if (friend.has(owner)) return true;
    // Adjacent to friendly land
    const nbs = neighborsOf(pName);
    for (let i = 0; i < nbs.length; i++) {
      const o2 = (typeof getProvinceOwner === "function")
        ? getProvinceOwner(nbs[i])
        : ((provinceOwners && provinceOwners[nbs[i]]) || null);
      if (o2 && friend.has(o2)) return true;
    }
    // Occupied by us
    if (GameState.occupations && GameState.occupations[pName] === viewerIso) return true;
    return false;
  };

  window.canSeeCountryIntel = function (targetIso, viewerIso) {
    if (!mpOn() || !window.FOG_ENABLED) return true;
    viewerIso = viewerIso || myIso();
    if (!viewerIso || !targetIso) return true;
    if (viewerIso === targetIso) return true;
    if (alliesOf(viewerIso).has(targetIso)) return true;
    // At war → partial intel (border only handled by province FoW)
    const atWar = (GameState.activeWars || []).some(w =>
      (w.attacker === viewerIso && w.target === targetIso) ||
      (w.attacker === targetIso && w.target === viewerIso)
    );
    return atWar; // war shows border provinces via adjacency; deep intel still fogged at province level
  };

  // Hook refreshMapColors
  (function hookFogMap() {
    if (window._scFogHook) return;
    window._scFogHook = true;
    const prev = window.refreshMapColors || (typeof refreshMapColors === "function" ? refreshMapColors : null);
    if (!prev) return;
    window.refreshMapColors = function () {
      try { prev.apply(this, arguments); } catch (e) { console.warn("refreshMapColors:", e); }
      if (!mpOn() || !window.FOG_ENABLED) return;
      try {
        const viewer = myIso();
        d3.selectAll(".country-path").each(function () {
          const path = d3.select(this);
          const name = path.attr("data-name");
          if (!name) return;
          if (!canSeeProvince(name, viewer)) {
            path.style("fill", window.FOG_FILL)
              .style("stroke", "rgba(20,30,45,0.8)")
              .style("stroke-width", 0.04)
              .classed("prov-fog", true)
              .attr("data-fog", "1");
          } else {
            path.classed("prov-fog", false).attr("data-fog", "0");
          }
        });
      } catch (e) {
        console.warn("[FoW] paint:", e);
      }
    };
    try { if (typeof refreshMapColors === "function") refreshMapColors = window.refreshMapColors; } catch (e) {}
  })();

  // Mask province tooltip army info under fog
  (function hookFogTooltip() {
    if (window._scFogTip || typeof formatProvinceTooltip !== "function") return;
    window._scFogTip = true;
    const prev = formatProvinceTooltip;
    window.formatProvinceTooltip = function (name) {
      try {
        if (mpOn() && window.FOG_ENABLED && !canSeeProvince(name, myIso())) {
          return `<div class="text-[11px] text-slate-400"><b class="text-slate-300">???</b><br/>Savaş sisi — istihbarat yok</div>`;
        }
      } catch (e) {}
      return prev.apply(this, arguments);
    };
  })();

  // ============================================================
  // 2) PING + DESYNC SHIELD
  // ============================================================
  const DESYNC_TIMEOUT_MS = 15000;
  const PING_EVERY_MS = 3000;

  function ensureMpExtras() {
    if (!GameState.mp) return null;
    const MP = GameState.mp;
    if (!MP._lastSeen) MP._lastSeen = Object.create(null);
    if (!MP._rtt) MP._rtt = Object.create(null);
    if (!MP._aiControl) MP._aiControl = Object.create(null);
    return MP;
  }

  window.mpFormatPing = function (ms) {
    if (ms == null || ms < 0) return "—";
    if (ms < 60) return ms + "ms";
    if (ms < 120) return ms + "ms";
    return ms + "ms";
  };

  window.mpPingClass = function (ms) {
    if (ms == null) return "text-slate-500";
    if (ms < 80) return "text-emerald-400";
    if (ms < 150) return "text-yellow-400";
    return "text-red-400";
  };

  function updatePingHud() {
    const MP = ensureMpExtras();
    if (!MP || !MP.active) return;
    let host = document.getElementById("mp-ping-strip");
    if (!host) {
      const hud = document.getElementById("mp-hud");
      if (!hud) return;
      host = document.createElement("div");
      host.id = "mp-ping-strip";
      host.className = "flex flex-wrap gap-1 items-center text-[10px] font-mono";
      hud.appendChild(host);
    }
    const rows = Object.values(MP.players || {}).map(p => {
      const rtt = (MP._rtt && MP._rtt[p.id] != null) ? MP._rtt[p.id] : (p.ping != null ? p.ping : null);
      const ai = MP._aiControl && MP._aiControl[p.id];
      const cls = window.mpPingClass(rtt);
      return `<span class="${cls}" title="${p.name}">${escapeTxt(p.name||"?").slice(0,8)}:${ai ? "AI" : window.mpFormatPing(rtt)}</span>`;
    });
    host.innerHTML = rows.join('<span class="text-slate-600">|</span>');
  }

  function escapeTxt(s) {
    return String(s || "").replace(/[<>&]/g, "");
  }

  function showDesyncWait(name, remainSec) {
    let el = document.getElementById("mp-desync-modal");
    if (!el) {
      el = document.createElement("div");
      el.id = "mp-desync-modal";
      el.className = "fixed inset-0 z-[180] flex items-center justify-center bg-black/55 p-4";
      el.innerHTML = `<div class="w-full max-w-sm rounded border border-amber-700 bg-[#1a1408] p-5 text-center space-y-2">
        <div class="text-sm font-black text-amber-400 uppercase tracking-wider">Bağlantı bekleniyor</div>
        <div id="mp-desync-body" class="text-[12px] text-slate-300"></div>
        <div id="mp-desync-timer" class="text-2xl font-mono text-amber-300">15</div>
      </div>`;
      document.body.appendChild(el);
    }
    const body = document.getElementById("mp-desync-body");
    const tim = document.getElementById("mp-desync-timer");
    if (body) body.textContent = (name || "Oyuncu") + " bekleniyor… (paket gecikmesi / kopma)";
    if (tim) tim.textContent = String(Math.max(0, remainSec));
    el.classList.remove("hidden");
  }
  function hideDesyncWait() {
    document.getElementById("mp-desync-modal")?.classList.add("hidden");
  }

  function handToAI(peerId) {
    const MP = ensureMpExtras();
    if (!MP || !MP.isHost) return;
    MP._aiControl[peerId] = true;
    if (MP.players[peerId]) {
      MP.players[peerId].ai = true;
    }
    hideDesyncWait();
    try {
      if (typeof showToast === "function") showToast((MP.players[peerId]?.name || "Oyuncu") + " AI'ya devredildi", "info");
    } catch (e) {}
    // Sys chat via existing path if available
    try {
      if (typeof hostPushSync === "function") hostPushSync();
    } catch (e) {}
  }

  // Inject ping into host sync loop
  (function hookPingDesync() {
    if (window._scPingHook) return;
    window._scPingHook = true;

    // Periodic host probe
    setInterval(function () {
      try {
        const MP = ensureMpExtras();
        if (!MP || !MP.active || !MP.isHost) return;
        const now = Date.now();
        Object.keys(MP.conns || {}).forEach(id => {
          const c = MP.conns[id];
          if (!c || !c.open) return;
          try {
            c.send(JSON.stringify({ t: "pingProbe", ts: now }));
          } catch (e) {}
          // desync check
          const last = MP._lastSeen[id] || now;
          const lag = now - last;
          if (lag > DESYNC_TIMEOUT_MS && !MP._aiControl[id]) {
            const name = (MP.players[id] && MP.players[id].name) || id;
            showDesyncWait(name, 0);
            handToAI(id);
          } else if (lag > 5000 && !MP._aiControl[id]) {
            const remain = Math.ceil((DESYNC_TIMEOUT_MS - lag) / 1000);
            showDesyncWait((MP.players[id] && MP.players[id].name) || "Oyuncu", remain);
          }
        });
        // all good?
        const waiting = Object.keys(MP.conns || {}).some(id => {
          const lag = now - (MP._lastSeen[id] || now);
          return lag > 5000 && !MP._aiControl[id];
        });
        if (!waiting) hideDesyncWait();
        updatePingHud();
      } catch (e) {}
    }, PING_EVERY_MS);

    // Patch connection data handler via monkey on existing conns is hard;
    // Use document-level capture: wrap GameState.mp message by observing peer data through global hook
    // Clients answer pingProbe; hosts record pong
    const origSend = null;
    window.mpHandleStage3Net = function (fromId, msg) {
      const MP = ensureMpExtras();
      if (!MP || !msg) return false;
      if (msg.t === "pingProbe") {
        // Client responds
        try {
          const hostConn = MP.conns[MP.hostId] || Object.values(MP.conns || {})[0];
          if (hostConn && hostConn.open) {
            hostConn.send(JSON.stringify({ t: "pingPong", ts: msg.ts, peerId: MP.peerId }));
          }
        } catch (e) {}
        MP._lastSeen[MP.peerId] = Date.now();
        return true;
      }
      if (msg.t === "pingPong" && MP.isHost) {
        const rtt = Math.max(0, Date.now() - (msg.ts || Date.now()));
        MP._rtt[fromId] = rtt;
        MP._lastSeen[fromId] = Date.now();
        if (MP.players[fromId]) MP.players[fromId].ping = rtt;
        // reconnect from AI?
        if (MP._aiControl[fromId] && rtt < 2000) {
          delete MP._aiControl[fromId];
          if (MP.players[fromId]) MP.players[fromId].ai = false;
          try {
            if (typeof showToast === "function") showToast((MP.players[fromId]?.name || "Oyuncu") + " geri bağlandı", "good");
          } catch (e) {}
        }
        updatePingHud();
        return true;
      }
      // Any message counts as alive
      if (MP.isHost && fromId) {
        MP._lastSeen[fromId] = Date.now();
      }
      return false;
    };

    // Soft-patch: intercept via periodic conn wrapping (same pattern as prior engine diplo)
    setInterval(function () {
      try {
        const MP = GameState.mp;
        if (!MP || !MP.active) return;
        Object.keys(MP.conns || {}).forEach(id => {
          const c = MP.conns[id];
          if (!c || c._s3) return;
          c._s3 = true;
          c.on("data", function (raw) {
            let msg;
            try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return; }
            if (msg && window.mpHandleStage3Net) window.mpHandleStage3Net(id, msg);
          });
        });
      } catch (e) {}
    }, 1500);
  })();

  // ============================================================
  // 3) WORLD TENSION — MP early-war brakes
  // ============================================================
  if (typeof GameState.globalTension !== "number") GameState.globalTension = 5;

  window.getWorldTension = function () {
    return Math.max(0, Math.min(100, GameState.globalTension || 0));
  };

  window.addWorldTension = function (delta, reason) {
    const before = getWorldTension();
    GameState.globalTension = Math.max(0, Math.min(100, before + (Number(delta) || 0)));
    if (Math.abs(delta) >= 3) {
      try {
        if (typeof log === "function") {
          log("Dünya Tansiyonu: " + before + "% → " + getWorldTension() + "%" + (reason ? " (" + reason + ")" : ""), "text-orange-400");
        }
        if (typeof showToast === "function" && Math.abs(delta) >= 8) {
          showToast("Tansiyon " + getWorldTension() + "% — " + (reason || ""), "info");
        }
      } catch (e) {}
    }
    try { setText("hud-tension", getWorldTension() + "%"); } catch (e) {}
    return getWorldTension();
  };

  window.canDeclareWarByTension = function (attackerIso, targetIso) {
    // SP: soft rules; MP: hard gates for democratic/conservative
    const t = getWorldTension();
    const c = GameState.countries[attackerIso];
    if (!c) return { ok: true };
    const ideo = String(c.ideology || "").toLowerCase();
    const isDemo = /demok|parlament|cumhuriyet|federal|liberal/.test(ideo);
    if (!mpOn()) {
      // SP warning only for very low tension unjustified
      return { ok: true };
    }
    // MP rules
    if (isDemo && t < 25) {
      return {
        ok: false,
        msg: "Dünya Tansiyonu %" + t + " — demokratik/muhafazakâr rejim %25 altında saldırgan savaş açamaz."
      };
    }
    if (t < 10) {
      return {
        ok: false,
        msg: "Küresel tansiyon çok düşük (%" + t + "). Gerekçe üretin veya tansiyon yükselsin."
      };
    }
    return { ok: true };
  };

  // Hook declareWar for tension
  (function hookTensionWar() {
    if (window._scTensionHook) return;
    window._scTensionHook = true;
    const prev = window.declareWar;
    if (typeof prev !== "function") return;
    window.declareWar = function (targetIso) {
      const gate = canDeclareWarByTension(GameState.player, targetIso);
      if (!gate.ok) {
        try {
          if (typeof log === "function") log(gate.msg, "text-red-400");
          if (typeof showToast === "function") showToast(gate.msg, "bad");
        } catch (e) {}
        return;
      }
      const r = prev.apply(this, arguments);
      // Aggressive war raises tension further if already high path in original
      try {
        if (mpOn()) addWorldTension(5, "Savaş ilanı");
      } catch (e) {}
      return r;
    };
  })();

  // Annex / full conquer tension
  (function hookTensionAnnex() {
    if (window._scTenAnnex) return;
    window._scTenAnnex = true;
    const prev = window.annexCountryFully;
    if (typeof prev === "function") {
      window.annexCountryFully = function (targetIso) {
        const r = prev.apply(this, arguments);
        try { addWorldTension(12, "Tam ilhak: " + targetIso); } catch (e) {}
        return r;
      };
    }
    const prevConfirm = window.confirmTerritoryClaims;
    if (typeof prevConfirm === "function") {
      window.confirmTerritoryClaims = function (targetIso, maxClaim, claimLevel) {
        const selected = (window.peaceSelected && window.peaceSelected.size) || 0;
        const r = prevConfirm.apply(this, arguments);
        try {
          if (selected > 0) addWorldTension(Math.min(20, 4 + selected), "Toprak ilhakı");
        } catch (e) {}
        return r;
      };
    }
  })();

  // ============================================================
  // 4) PEACE CONFERENCE — victory points table
  // Enhances existing showTerritoryDemandModal with VP budget UI
  // ============================================================
  window.computeVictoryPoints = function (war, attackerIso, defenderIso) {
    const progress = Math.max(0, Math.min(100, (war && war.progress) || 100));
    const occ = Object.keys(GameState.occupations || {}).filter(p =>
      provinceOwners[p] === defenderIso && GameState.occupations[p] === attackerIso
    ).length;
    const casEnemy = (war && war.enemyCasualties) || 0;
    const casOwn = (war && war.casualties) || 0;
    // HOI-ish: score from progress + occupation + casualties dealt
    let vp = Math.floor(progress * 0.6) + occ * 3 + Math.floor(casEnemy / 5000) - Math.floor(casOwn / 8000);
    vp = Math.max(5, Math.min(200, vp));
    return {
      vp: vp,
      costs: {
        province: 3,
        puppet: 25,
        reparations: 10,
        liberate: 8
      },
      progress: progress,
      occupied: occ
    };
  };

  window.openPeaceConference = function (targetIso) {
    // Prefer enhanced conference; fallback to existing modal
    try {
      const war = (GameState.activeWars || []).find(w => w.target === targetIso || w.attacker === targetIso)
        || GameState._lastWonWar;
      const budget = computeVictoryPoints(war, GameState.player, targetIso);
      GameState._peaceVP = budget;
      // Show classic modal first (map pick) then inject VP banner
      if (typeof showTerritoryDemandModal === "function") {
        showTerritoryDemandModal(targetIso);
      }
      injectPeaceVPBanner(targetIso, budget);
    } catch (e) {
      console.warn("[Peace]", e);
      if (typeof showTerritoryDemandModal === "function") showTerritoryDemandModal(targetIso);
    }
  };

  function injectPeaceVPBanner(targetIso, budget) {
    const modal = document.getElementById("territory-demand-modal");
    if (!modal || !budget) return;
    if (document.getElementById("peace-vp-banner")) return;
    const banner = document.createElement("div");
    banner.id = "peace-vp-banner";
    banner.className = "mx-3 mt-2 p-2 rounded border border-amber-700/80 bg-amber-950/40 text-[10px] text-amber-100 space-y-1";
    banner.innerHTML = `
      <div class="font-black text-amber-300 uppercase tracking-wider text-[11px]">Zafer Puanı (VP)</div>
      <div class="font-mono text-lg text-amber-200">${budget.vp} VP</div>
      <div class="text-slate-400">Eyalet ${budget.costs.province} · Kukla ${budget.costs.puppet} · Tazminat ${budget.costs.reparations}</div>
      <div class="text-slate-500">İşgal ${budget.occupied} · Savaş skoru ${budget.progress}%</div>
      <div class="grid grid-cols-2 gap-1 pt-1">
        <button type="button" onclick="peaceSpendPuppet('${targetIso}')" class="py-1.5 bg-purple-900/80 border border-purple-600 rounded font-bold">🎭 Kukla (−${budget.costs.puppet})</button>
        <button type="button" onclick="peaceSpendReparations('${targetIso}')" class="py-1.5 bg-yellow-900/80 border border-yellow-600 rounded font-bold">💰 Tazminat (−${budget.costs.reparations})</button>
      </div>`;
    const box = modal.querySelector(".bg-slate-900\\/95, .bg-slate-900") || modal.firstElementChild;
    if (box) box.insertBefore(banner, box.children[1] || null);
    else modal.appendChild(banner);
  }

  window.peaceSpendPuppet = function (targetIso) {
    const b = GameState._peaceVP;
    if (!b || b.vp < b.costs.puppet) {
      try { if (typeof showToast === "function") showToast("Yetersiz VP", "bad"); } catch (e) {}
      return;
    }
    b.vp -= b.costs.puppet;
    try {
      if (typeof makePuppet === "function") makePuppet(targetIso);
    } catch (e) {}
    const el = document.querySelector("#peace-vp-banner .font-mono");
    if (el) el.textContent = b.vp + " VP";
    try { if (typeof log === "function") log("Barış: " + targetIso + " kukla yapıldı (−VP)", "text-purple-300"); } catch (e) {}
  };

  window.peaceSpendReparations = function (targetIso) {
    const b = GameState._peaceVP;
    if (!b || b.vp < b.costs.reparations) {
      try { if (typeof showToast === "function") showToast("Yetersiz VP", "bad"); } catch (e) {}
      return;
    }
    b.vp -= b.costs.reparations;
    try {
      if (typeof takeReparations === "function") takeReparations(targetIso);
    } catch (e) {}
    const el = document.querySelector("#peace-vp-banner .font-mono");
    if (el) el.textContent = b.vp + " VP";
  };

  // Route resolveWar victory → openPeaceConference
  (function hookPeaceOnVictory() {
    if (window._scPeaceHook) return;
    window._scPeaceHook = true;
    const prev = window.resolveWar;
    if (typeof prev !== "function") return;
    window.resolveWar = function (index, victory) {
      const war = (GameState.activeWars || [])[index];
      const targetIso = war && war.target;
      const r = prev.apply(this, arguments);
      if (victory && targetIso) {
        try {
          // showTerritoryDemandModal already called inside resolveWar on victory;
          // enrich with VP after a tick
          setTimeout(() => {
            try {
              const budget = computeVictoryPoints(GameState._lastWonWar || war, GameState.player, targetIso);
              GameState._peaceVP = budget;
              injectPeaceVPBanner(targetIso, budget);
            } catch (e) {}
          }, 50);
        } catch (e) {}
      }
      return r;
    };
  })();

  // FoW refresh on alliance / war changes
  setInterval(function () {
    try {
      if (mpOn() && window.FOG_ENABLED && typeof refreshMapColors === "function") {
        // lightweight: only if map exists
        if (document.getElementById("game-map")) {
          /* skip auto full refresh to save CPU — sync path already refreshes */
        }
      }
      updatePingHud();
    } catch (e) {}
  }, 4000);

  console.log("[Stage3] FoW · Ping/Desync · World Tension · Peace VP online");
})();

// ============================================================
// GRAND EXPANSION — Focus Trees · Divisions/Width · Cabinet · Tech/Prod
// HOI4-inspired systems layered on existing GameState without breaking SP/MP
// ============================================================
(function SCGrandExpansion() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // ---------- Country state bootstrap ----------
  function ensureGrandState(p) {
    if (!p) return;
    if (p.pp == null) p.pp = 80;
    if (!p.cabinet) p.cabinet = { political: null, economy: null, army: null };
    if (!p.researchSlots) p.researchSlots = 2;
    if (!p.researchQueue) p.researchQueue = []; // multi-slot: [{id, progress}]
    if (!p.divTemplates) {
      p.divTemplates = {
        infantry: { name: "Piyade Tümeni", brigades: { inf: 6, art: 1 }, width: 18, soft: 1, soft: 0.8 },
        armor: { name: "Zırhlı Tümen", brigades: { arm: 3, mot: 2, art: 1 }, width: 20, soft: 1.35, soft: 1.1 },
        motorized: { name: "Motorize", brigades: { mot: 5, art: 1 }, width: 16, soft: 1.15, soft: 0.9 }
      };
    }
    if (!p.equipment) {
      p.equipment = {
        inf_eq: Math.floor((p.stockpile && p.stockpile.guns) || 5000),
        art_eq: Math.floor((p.stockpile && p.stockpile.artillery) || 100),
        tank_eq: Math.floor((p.stockpile && p.stockpile.tanks) || 50),
        truck: 200
      };
    }
    if (!p.airforce) p.airforce = { fighter: 0, bomber: 0, assigned: null };
    if (!p.navy) p.navy = { ships: 0, destroyer: 0, cruiser: 0, battleship: 0 };
    if (!p.doctrine) p.doctrine = { inf: 1, arm: 1, air: 1, attack: 1, defense: 1, widthBonus: 0 };
    if (typeof ensureResearchState === "function") ensureResearchState(p);
    if (!p.generals) p.generals = { owned: ["g1", "g3"], assigned: null, xp: {} };
  }

  // Apply to all countries once
  function bootstrapAllCountries() {
    Object.keys(GameState.countries || {}).forEach(iso => ensureGrandState(GameState.countries[iso]));
  }
  bootstrapAllCountries();

  // Daily PP gain in gameTick companion
  function processPoliticalPower() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    let gain = 1.2; // base daily
    const cab = p.cabinet || {};
    if (cab.political === "demagogue") gain += 0.4;
    if (cab.political === "silent_workhorse") gain += 0.8;
    p.pp = Math.min(500, (p.pp || 0) + gain);
    try { setText("hud-pp", Math.floor(p.pp).toString()); } catch (e) {}
    try { setText("grand-pp", Math.floor(p.pp).toString()); } catch (e) {}
  }

  // ============================================================
  // 1) NATIONAL FOCUS TREES (HOI-style chains)
  // ============================================================
  function focusReward(iso, fn) {
    return function () {
      const c = GameState.countries[iso];
      if (!c) return;
      try { fn(c); } catch (e) { console.warn("focus reward", e); }
    };
  }

  const NATIONAL_FOCI = {
    TUR: [
      { id: "tur_misak", title: "Misak-ı Milli", desc: "+2 Askeri Fab · +30 PP", days: 70, prereq: [],
        reward: focusReward("TUR", c => { c.milFactories += 2; c.pp = (c.pp||0)+30; log("Odak: Misak-ı Milli", "text-emerald-400"); }) },
      { id: "tur_bogaz", title: "Boğazlar Sözleşmesi", desc: "+15 PP · Gerilim −3", days: 70, prereq: ["tur_misak"],
        reward: focusReward("TUR", c => { c.pp = (c.pp||0)+15; if (typeof addWorldTension === "function") addWorldTension(-3, "Boğazlar"); log("Odak: Boğazlar", "text-emerald-400"); }) },
      { id: "tur_sanayi", title: "Sanayileşme Atılımı", desc: "+4 Sivil · +2 Askeri Fab", days: 70, prereq: ["tur_misak"],
        reward: focusReward("TUR", c => { c.civFactories += 4; c.milFactories += 2; log("Odak: Sanayileşme", "text-emerald-400"); }) },
      { id: "tur_balkan", title: "Balkan Antantı", desc: "YUN/BUL ile ilişki +25 · +20 PP", days: 70, prereq: ["tur_bogaz"],
        reward: focusReward("TUR", c => {
          c.pp = (c.pp||0)+20;
          GameState.relations = GameState.relations || {};
          ["GRC","BGR","ROU"].forEach(x => { GameState.relations[x] = Math.min(100, (GameState.relations[x]||0)+25); });
          log("Odak: Balkan Antantı", "text-emerald-400");
        }) },
      { id: "tur_ordu", title: "Kara Kuvvetleri Reformu", desc: "Piyade doktrin +10% · +5K manpower", days: 70, prereq: ["tur_sanayi"],
        reward: focusReward("TUR", c => { c.doctrine = c.doctrine||{}; c.doctrine.inf = (c.doctrine.inf||1)+0.1; c.manpower += 5000; log("Odak: Ordu Reformu", "text-emerald-400"); }) }
    ],
    DEU: [
      { id: "ger_rhine", title: "Rhineland", desc: "Tansiyon +8 · +2 Askeri Fab · Savaş sebebi hazırlığı", days: 70, prereq: [],
        reward: focusReward("DEU", c => { c.milFactories += 2; if (typeof addWorldTension === "function") addWorldTension(8, "Rhineland"); log("Odak: Rhineland", "text-emerald-400"); }) },
      { id: "ger_anschluss", title: "Anschluss", desc: "AUT üzerinde gerekçe · +40 PP", days: 70, prereq: ["ger_rhine"],
        reward: focusReward("DEU", c => {
          c.pp = (c.pp||0)+40;
          GameState.justifications = GameState.justifications || [];
          if (!GameState.justifications.some(j => j.target === "AUT")) {
            GameState.justifications.push({ target: "AUT", progress: 100, from: "DEU" });
          }
          if (typeof addWorldTension === "function") addWorldTension(10, "Anschluss");
          log("Odak: Anschluss — AUT savaş sebebi", "text-emerald-400");
        }) },
      { id: "ger_sudeten", title: "Sudetenland", desc: "CZE gerekçe · Tansiyon +12", days: 70, prereq: ["ger_anschluss"],
        reward: focusReward("DEU", c => {
          GameState.justifications = GameState.justifications || [];
          if (!GameState.justifications.some(j => j.target === "CZE")) {
            GameState.justifications.push({ target: "CZE", progress: 100, from: "DEU" });
          }
          if (typeof addWorldTension === "function") addWorldTension(12, "Sudetenland");
          log("Odak: Sudetenland", "text-emerald-400");
        }) },
      { id: "ger_barbarossa", title: "Barbarossa Planı", desc: "RUS gerekçe · Saldırı +8% · Tansiyon +15", days: 70, prereq: ["ger_sudeten"],
        reward: focusReward("DEU", c => {
          c.doctrine = c.doctrine||{}; c.doctrine.attack = (c.doctrine.attack||1)+0.08;
          GameState.justifications = GameState.justifications || [];
          if (!GameState.justifications.some(j => j.target === "RUS")) {
            GameState.justifications.push({ target: "RUS", progress: 100, from: "DEU" });
          }
          if (typeof addWorldTension === "function") addWorldTension(15, "Barbarossa");
          log("Odak: Barbarossa", "text-emerald-400");
        }) },
      { id: "ger_industry", title: "Vierjahresplan", desc: "+6 Askeri · +3 Sivil Fab", days: 70, prereq: ["ger_rhine"],
        reward: focusReward("DEU", c => { c.milFactories += 6; c.civFactories += 3; log("Odak: Dört Yıllık Plan", "text-emerald-400"); }) }
    ],
    RUS: [
      { id: "sov_five", title: "Beş Yıllık Plan", desc: "+8 Sivil · +4 Askeri Fab", days: 70, prereq: [],
        reward: focusReward("RUS", c => { c.civFactories += 8; c.milFactories += 4; log("Odak: Beş Yıllık Plan", "text-emerald-400"); }) },
      { id: "sov_purge", title: "Büyük Temizlik", desc: "PP +50 · Manpower −20K · Savunma +5%", days: 70, prereq: ["sov_five"],
        reward: focusReward("RUS", c => { c.pp = (c.pp||0)+50; c.manpower = Math.max(0,(c.manpower||0)-20000); c.doctrine=c.doctrine||{}; c.doctrine.defense=(c.doctrine.defense||1)+0.05; log("Odak: Büyük Temizlik", "text-emerald-400"); }) },
      { id: "sov_ural", title: "Sanayi Ural'a", desc: "+5 Askeri Fab · Fabrika verimi +5%", days: 70, prereq: ["sov_five"],
        reward: focusReward("RUS", c => { c.milFactories += 5; c.factoryEfficiency = Math.min(1.8,(c.factoryEfficiency||1)+0.05); log("Odak: Ural Sanayii", "text-emerald-400"); }) },
      { id: "sov_doctrine", title: "Derin Operasyon", desc: "Saldırı +10% · Tank +8%", days: 70, prereq: ["sov_ural"],
        reward: focusReward("RUS", c => { c.doctrine=c.doctrine||{}; c.doctrine.attack=(c.doctrine.attack||1)+0.1; c.doctrine.arm=(c.doctrine.arm||1)+0.08; log("Odak: Derin Operasyon", "text-emerald-400"); }) }
    ],
    USA: [
      { id: "usa_newdeal", title: "New Deal", desc: "+6 Sivil Fab · +25 PP", days: 70, prereq: [],
        reward: focusReward("USA", c => { c.civFactories += 6; c.pp = (c.pp||0)+25; log("Odak: New Deal", "text-emerald-400"); }) },
      { id: "usa_arsenal", title: "Democracy's Arsenal", desc: "+10 Askeri Fab · Equip +5K", days: 70, prereq: ["usa_newdeal"],
        reward: focusReward("USA", c => { c.milFactories += 10; ensureGrandState(c); c.equipment.inf_eq += 5000; log("Odak: Arsenal of Democracy", "text-emerald-400"); }) },
      { id: "usa_pacific", title: "Pacific Fleet", desc: "+5 Destroyer · Hava +10%", days: 70, prereq: ["usa_arsenal"],
        reward: focusReward("USA", c => { c.navy=c.navy||{}; c.navy.destroyer=(c.navy.destroyer||0)+5; c.navy.ships=(c.navy.ships||0)+5; c.doctrine=c.doctrine||{}; c.doctrine.air=(c.doctrine.air||1)+0.1; log("Odak: Pacific Fleet", "text-emerald-400"); }) },
      { id: "usa_manhattan", title: "Manhattan Project", desc: "Nükleer yol açılır · +40 PP", days: 70, prereq: ["usa_arsenal"],
        reward: focusReward("USA", c => { c.pp = (c.pp||0)+40; c._nukeReady = true; log("Odak: Manhattan — nükleer program serbest", "text-emerald-400"); }) }
    ],
    GBR: [
      { id: "eng_home", title: "Home Guard", desc: "+3 Askeri Fab · Savunma +8%", days: 70, prereq: [],
        reward: focusReward("GBR", c => { c.milFactories += 3; c.doctrine=c.doctrine||{}; c.doctrine.defense=(c.doctrine.defense||1)+0.08; log("Odak: Home Guard", "text-emerald-400"); }) },
      { id: "eng_empire", title: "Imperial Conference", desc: "+30 PP · İlişki CAN/AUS/NZL +20", days: 70, prereq: ["eng_home"],
        reward: focusReward("GBR", c => {
          c.pp = (c.pp||0)+30;
          GameState.relations = GameState.relations || {};
          ["CAN","AUS"].forEach(x => { GameState.relations[x] = Math.min(100,(GameState.relations[x]||0)+20); });
          log("Odak: Imperial Conference", "text-emerald-400");
        }) },
      { id: "eng_radar", title: "Chain Home Radar", desc: "Hava +15% · +2 Araştırma yuvası cap", days: 70, prereq: ["eng_home"],
        reward: focusReward("GBR", c => { c.doctrine=c.doctrine||{}; c.doctrine.air=(c.doctrine.air||1)+0.15; c.researchSlots = Math.min(4,(c.researchSlots||2)+1); log("Odak: Radar", "text-emerald-400"); }) },
      { id: "eng_navy", title: "Two-Power Standard", desc: "+3 Battleship · +4 Destroyer", days: 70, prereq: ["eng_empire"],
        reward: focusReward("GBR", c => { c.navy=c.navy||{}; c.navy.battleship=(c.navy.battleship||0)+3; c.navy.destroyer=(c.navy.destroyer||0)+4; c.navy.ships=(c.navy.ships||0)+7; log("Odak: Donanma Standardı", "text-emerald-400"); }) }
    ]
  };

  const GENERIC_FOCI = [
    { id: "gen_army", title: "Ordu Yeniden Düzenleme", desc: "+2 Askeri Fab · +10 PP", days: 70, prereq: [],
      reward: function () { const c = GameState.countries[GameState.player]; if (!c) return; c.milFactories += 2; c.pp = (c.pp||0)+10; log("Odak: Ordu", "text-emerald-400"); } },
    { id: "gen_industry", title: "Sivil Sanayi", desc: "+3 Sivil Fab", days: 70, prereq: ["gen_army"],
      reward: function () { const c = GameState.countries[GameState.player]; if (!c) return; c.civFactories += 3; log("Odak: Sivil Sanayi", "text-emerald-400"); } },
    { id: "gen_pol", title: "Siyasi Seferberlik", desc: "+35 PP", days: 70, prereq: [],
      reward: function () { const c = GameState.countries[GameState.player]; if (!c) return; c.pp = (c.pp||0)+35; log("Odak: Siyasi Seferberlik", "text-emerald-400"); } },
    { id: "gen_doc", title: "Doktrin Çalışması", desc: "Saldırı veya Savunma +6%", days: 70, prereq: ["gen_army"],
      reward: function () { const c = GameState.countries[GameState.player]; if (!c) return; c.doctrine=c.doctrine||{}; c.doctrine.attack=(c.doctrine.attack||1)+0.06; log("Odak: Doktrin", "text-emerald-400"); } }
  ];

  function getFocusTreeFor(iso) {
    if (NATIONAL_FOCI[iso]) return NATIONAL_FOCI[iso];
    // Map GER tag alias
    if (iso === "GER" && NATIONAL_FOCI.DEU) return NATIONAL_FOCI.DEU;
    if (iso === "SOV" && NATIONAL_FOCI.RUS) return NATIONAL_FOCI.RUS;
    if (iso === "ENG" && NATIONAL_FOCI.GBR) return NATIONAL_FOCI.GBR;
    return GENERIC_FOCI;
  }

  // Overlay into GameState.activeFocusTree for compatibility
  function installFocusTrees() {
    if (!GameState.activeFocusTree) GameState.activeFocusTree = {};
    Object.keys(NATIONAL_FOCI).forEach(iso => {
      GameState.activeFocusTree[iso] = NATIONAL_FOCI[iso];
    });
    // Ensure player country has a tree
    const pl = GameState.player;
    if (pl && !GameState.activeFocusTree[pl]) {
      GameState.activeFocusTree[pl] = getFocusTreeFor(pl);
    }
  }
  installFocusTrees();

  // Enhanced renderFocusTree
  window.renderFocusTree = function () {
    const container = document.getElementById("focus-tree-nodes");
    if (!container) return;
    const iso = GameState.player;
    const tree = getFocusTreeFor(iso);
    GameState.activeFocusTree[iso] = tree;
    const pData = GameState.countries[iso];
    if (!pData) return;
    ensureGrandState(pData);
    pData.completedFocuses = pData.completedFocuses || [];

    container.innerHTML = tree.map(node => {
      const done = pData.completedFocuses.includes(node.id);
      const active = pData.activeFocus === node.id;
      const prereqOk = (node.prereq || []).every(id => pData.completedFocuses.includes(id));
      let statusClass = "available";
      let statusText = "Odak Başlat";
      if (done) { statusClass = "completed"; statusText = "Tamamlandı ✓"; }
      else if (active) { statusClass = "active"; statusText = "Devam ediyor…"; }
      else if (pData.activeFocus) { statusClass = "locked opacity-50"; statusText = "Başka odak aktif"; }
      else if (!prereqOk) { statusClass = "locked opacity-50"; statusText = "Önkoşul eksik"; }

      const days = node.days || 70;
      return `<div class="focus-node ${statusClass} p-3 rounded text-left space-y-2" onclick="selectFocus('${node.id}')">
        <div class="flex justify-between items-center gap-2">
          <span class="text-xs font-black uppercase text-slate-200">${node.title}</span>
          <span class="text-[9px] font-bold bg-slate-800 px-1.5 py-0.5 rounded text-yellow-500 font-mono">${days}g</span>
        </div>
        <p class="text-[10px] text-slate-400 leading-relaxed font-semibold">${node.desc}</p>
        <div class="text-[9px] font-black uppercase tracking-wider text-right border-t border-slate-800 pt-1.5 text-slate-500">${statusText}</div>
      </div>`;
    }).join("");
  };

  window.selectFocus = function (id) {
    const pData = GameState.countries[GameState.player];
    if (!pData) return;
    ensureGrandState(pData);
    pData.completedFocuses = pData.completedFocuses || [];
    if (pData.completedFocuses.includes(id) || pData.activeFocus) return;
    const tree = getFocusTreeFor(GameState.player);
    const node = tree.find(n => n.id === id);
    if (!node) return;
    if ((node.prereq || []).some(pid => !pData.completedFocuses.includes(pid))) {
      if (typeof log === "function") log("Önkoşul odaklar tamamlanmalı.", "text-yellow-400");
      return;
    }
    try { if (typeof sfx !== "undefined" && sfx.playBlip) sfx.playBlip(); } catch (e) {}
    pData.activeFocus = id;
    pData.focusProgress = 0;
    pData._focusDaysNeeded = node.days || 70;
    renderFocusTree();
    if (typeof log === "function") log('POLİTİKA: "' + node.title + '" odak başlatıldı.', "text-cyan-400");
    try {
      if (typeof mpIsActive === "function" && mpIsActive() && typeof hostPushSync === "function" && window.mpIsHost && mpIsHost()) hostPushSync();
    } catch (e) {}
  };

  // ============================================================
  // 2) DIVISION DESIGNER + COMBAT WIDTH
  // ============================================================
  const DEFAULT_FRONT_WIDTH = 80;

  window.getDivisionPower = function (c, templateKey) {
    ensureGrandState(c);
    const t = (c.divTemplates && c.divTemplates[templateKey]) || c.divTemplates.infantry;
    const b = t.brigades || {};
    const doc = c.doctrine || {};
    let soft = (b.inf || 0) * 10 * (doc.inf || 1) + (b.mot || 0) * 12 + (b.art || 0) * 18;
    let hard = (b.arm || 0) * 40 * (doc.arm || 1);
    soft *= (t.soft || 1);
    hard *= (t.hard || 1);
    return { soft, hard, width: t.width || 18, name: t.name };
  };

  window.trainDivisionTemplate = function (templateKey) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    const t = p.divTemplates[templateKey];
    if (!t) return;
    const b = t.brigades || {};
    const needEq = (b.inf || 0) * 800 + (b.mot || 0) * 600;
    const needArt = (b.art || 0) * 36;
    const needTank = (b.arm || 0) * 40;
    const needMp = ((b.inf || 0) + (b.mot || 0) + (b.arm || 0) * 2) * 1000;
    if ((p.equipment.inf_eq || 0) < needEq || (p.equipment.art_eq || 0) < needArt || (p.equipment.tank_eq || 0) < needTank) {
      if (typeof log === "function") log("Yetersiz teçhizat (Inf/Art/Tank eq).", "text-red-400");
      return;
    }
    if ((p.manpower || 0) < needMp) {
      if (typeof log === "function") log("Yetersiz insan gücü.", "text-red-400");
      return;
    }
    p.equipment.inf_eq -= needEq;
    p.equipment.art_eq -= needArt;
    p.equipment.tank_eq -= needTank;
    p.manpower -= needMp;
    // Map to legacy division counters
    if (b.arm) p.divisions.arm = (p.divisions.arm || 0) + 1;
    else if (b.mot) p.divisions.inf = (p.divisions.inf || 0) + 1; // mot counts as inf for legacy
    else p.divisions.inf = (p.divisions.inf || 0) + 1;
    if (b.art) p.divisions.art = (p.divisions.art || 0) + Math.max(1, Math.floor((b.art || 0) / 2));
    if (typeof log === "function") log("Tümen kuruldu: " + t.name + " (genişlik " + t.width + ")", "text-emerald-400");
    if (typeof updateHUD === "function") updateHUD();
    renderGrandMilitary();
  };

  // Combat width resolution helper used by war tick if available
  window.resolveCombatWidthBattle = function (attackerC, defenderC, war) {
    ensureGrandState(attackerC);
    ensureGrandState(defenderC);
    const frontW = DEFAULT_FRONT_WIDTH + ((attackerC.doctrine && attackerC.doctrine.widthBonus) || 0);
    // Approximate number of divisions engaged
    const aDivs = Object.values(attackerC.divisions || {}).reduce((s, n) => s + (n || 0), 0);
    const dDivs = Object.values(defenderC.divisions || {}).reduce((s, n) => s + (n || 0), 0);
    const aWidthUnit = 18;
    const dWidthUnit = 18;
    const aSlots = Math.max(1, Math.floor(frontW / aWidthUnit));
    const dSlots = Math.max(1, Math.floor(frontW / dWidthUnit));
    const aEngaged = Math.min(aDivs, aSlots);
    const dEngaged = Math.min(dDivs, dSlots);
    const aReserve = Math.max(0, aDivs - aEngaged);
    const dReserve = Math.max(0, dDivs - dEngaged);

    const gen = (typeof getGeneralBonus === "function") ? getGeneralBonus() : { atk: 1, def: 1 };
    const airA = (typeof getAirSupremacyBonus === "function") ? getAirSupremacyBonus(attackerC, defenderC) : 1;
    const docA = attackerC.doctrine || {};
    const docD = defenderC.doctrine || {};

    const aForce = aEngaged * 12 * (docA.inf || 1) * (docA.attack || 1) * gen.atk * airA
      + (attackerC.divisions.arm || 0) * 0.3 * 40 * (docA.arm || 1);
    const dForce = dEngaged * 12 * (docD.inf || 1) * (docD.defense || 1) * gen.def
      + (defenderC.divisions.arm || 0) * 0.25 * 40 * (docD.arm || 1);

    const ratio = aForce / Math.max(1, dForce);
    let delta = (Math.random() * 1.2 + 0.4) * Math.max(0.35, Math.min(2.2, ratio)) * 1.5;
    if (typeof v27WarProgressDelta === "function") delta = v27WarProgressDelta(delta);
    return { delta, aEngaged, dEngaged, aReserve, dReserve, frontW, ratio };
  };

  // ============================================================
  // 3) CABINET + GENERALS (PP spend)
  // ============================================================
  const ADVISORS = {
    political: [
      { id: "silent_workhorse", name: "Sessiz İşgücü", desc: "PP +0.8/gün", cost: 50 },
      { id: "demagogue", name: "Demagog", desc: "PP +0.4 · Tansiyon etkisi", cost: 50 },
      { id: "backroom", name: "Arka Oda Entrikacısı", desc: "Diplomasi soft bonus", cost: 50 }
    ],
    economy: [
      { id: "captain_industry", name: "Sanayi Kaptanı", desc: "Fabrika verimi +10%", cost: 75 },
      { id: "war_industrialist", name: "Savaş Sanayicisi", desc: "Askeri fab üretimi +12%", cost: 75 },
      { id: "armaments", name: "Teçhizat Organizatörü", desc: "Eq üretimi +10%", cost: 75 }
    ],
    army: [
      { id: "army_offense", name: "Taarruz Kurmay", desc: "Saldırı +8%", cost: 60 },
      { id: "army_defense", name: "Savunma Kurmay", desc: "Savunma +10%", cost: 60 },
      { id: "army_reform", name: "Ordu Reformcusu", desc: "Tümen XP / genişlik +", cost: 60 }
    ]
  };

  // Expand general pool
  const MORE_GENERALS = [
    { id: "g6", name: "Mareşal Kurt", atk: 0.1, def: 0.1, trait: "Manevra", skill: 3 },
    { id: "g7", name: "General Çöl", atk: 0.14, def: 0.03, trait: "Çöl", skill: 2 },
    { id: "g8", name: "Amiral Dalga", atk: 0.06, def: 0.06, trait: "Deniz", skill: 2, naval: true }
  ];
  if (typeof GENERAL_POOL !== "undefined" && Array.isArray(GENERAL_POOL)) {
    MORE_GENERALS.forEach(g => {
      if (!GENERAL_POOL.some(x => x.id === g.id)) GENERAL_POOL.push(g);
    });
  }

  window.hireAdvisor = function (slot, advisorId) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    const list = ADVISORS[slot];
    if (!list) return;
    const adv = list.find(a => a.id === advisorId);
    if (!adv) return;
    if ((p.pp || 0) < adv.cost) {
      if (typeof log === "function") log("Yetersiz Politik Güç (" + Math.floor(p.pp) + "/" + adv.cost + ")", "text-red-400");
      return;
    }
    p.pp -= adv.cost;
    p.cabinet[slot] = advisorId;
    // Apply static effects
    if (slot === "economy" && advisorId === "captain_industry") {
      p.factoryEfficiency = Math.min(1.9, (p.factoryEfficiency || 1) + 0.1);
    }
    if (slot === "army" && advisorId === "army_offense") {
      p.doctrine = p.doctrine || {};
      p.doctrine.attack = (p.doctrine.attack || 1) + 0.08;
    }
    if (slot === "army" && advisorId === "army_defense") {
      p.doctrine = p.doctrine || {};
      p.doctrine.defense = (p.doctrine.defense || 1) + 0.1;
    }
    if (typeof log === "function") log("Kabine: " + adv.name + " atandı (−" + adv.cost + " PP)", "text-yellow-300");
    renderGrandCabinet();
  };

  window.recruitGeneral = function (gid) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    const cost = 40;
    if ((p.pp || 0) < cost) {
      if (typeof log === "function") log("General için yetersiz PP", "text-red-400");
      return;
    }
    const pool = (typeof GENERAL_POOL !== "undefined") ? GENERAL_POOL : [];
    if (!pool.some(g => g.id === gid)) return;
    if (p.generals.owned.includes(gid)) return;
    p.pp -= cost;
    p.generals.owned.push(gid);
    if (typeof log === "function") log("General işe alındı (−" + cost + " PP)", "text-yellow-300");
    if (typeof renderResearchTab === "function") renderResearchTab();
    renderGrandCabinet();
  };

  // ============================================================
  // 4) TECH + MILITARY PRODUCTION (equipment)
  // ============================================================
  const GRAND_TECH = [
    { id: "inf_eq_1", cat: "Piyade", title: "Piyade Teçhizatı I", desc: "Inf eq üretim +15%", days: 60, cost: 150, minEra: 1,
      effect: (p) => { p._eqBonus = p._eqBonus || {}; p._eqBonus.inf = (p._eqBonus.inf || 1) + 0.15; } },
    { id: "inf_eq_2", cat: "Piyade", title: "Piyade Teçhizatı II", desc: "Inf eq +20% · Soft atk +5%", days: 80, cost: 280, minEra: 2, prereq: ["inf_eq_1"],
      effect: (p) => { p._eqBonus = p._eqBonus || {}; p._eqBonus.inf = (p._eqBonus.inf || 1) + 0.2; p.doctrine = p.doctrine || {}; p.doctrine.inf = (p.doctrine.inf || 1) + 0.05; } },
    { id: "tank_1", cat: "Zırhlı", title: "Hafif Tank", desc: "Tank eq üretim +15%", days: 70, cost: 220, minEra: 1,
      effect: (p) => { p._eqBonus = p._eqBonus || {}; p._eqBonus.tank = (p._eqBonus.tank || 1) + 0.15; } },
    { id: "tank_2", cat: "Zırhlı", title: "Orta Tank", desc: "Tank +20% · Hard +8%", days: 90, cost: 400, minEra: 2, prereq: ["tank_1"],
      effect: (p) => { p._eqBonus = p._eqBonus || {}; p._eqBonus.tank = (p._eqBonus.tank || 1) + 0.2; p.doctrine = p.doctrine || {}; p.doctrine.arm = (p.doctrine.arm || 1) + 0.08; } },
    { id: "ind_eff", cat: "Sanayi", title: "Esnek Hatlar", desc: "Fabrika verimi +12%", days: 65, cost: 200, minEra: 1,
      effect: (p) => { p.factoryEfficiency = Math.min(1.9, (p.factoryEfficiency || 1) + 0.12); } },
    { id: "doc_mw", cat: "Doktrin", title: "Hareketli Savaş", desc: "Saldırı +10% · Genişlik +4", days: 75, cost: 250, minEra: 2,
      effect: (p) => { p.doctrine = p.doctrine || {}; p.doctrine.attack = (p.doctrine.attack || 1) + 0.1; p.doctrine.widthBonus = (p.doctrine.widthBonus || 0) + 4; } },
    { id: "air_doc", cat: "Hava", title: "Hava Üstünlüğü Doktrini", desc: "Hava +18%", days: 70, cost: 260, minEra: 2,
      effect: (p) => { p.doctrine = p.doctrine || {}; p.doctrine.air = (p.doctrine.air || 1) + 0.18; } }
  ];

  // Merge into RESEARCH_TREE if exists
  if (typeof RESEARCH_TREE !== "undefined" && Array.isArray(RESEARCH_TREE)) {
    GRAND_TECH.forEach(t => {
      if (!RESEARCH_TREE.some(x => x.id === t.id)) {
        RESEARCH_TREE.push({
          id: t.id, cat: t.cat, title: t.title, desc: t.desc,
          weeks: Math.ceil((t.days || 70) / 7), cost: t.cost, minEra: t.minEra || 1,
          effect: t.effect
        });
      }
    });
  }

  function processEquipmentProduction() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    const mil = p.milFactories || 0;
    const alloc = p.prodAllocation || { guns: 1, artillery: 0, tanks: 0 };
    const totalAlloc = Math.max(1, (alloc.guns || 0) + (alloc.artillery || 0) + (alloc.tanks || 0));
    const eff = (p.factoryEfficiency || 1) * ((p.cabinet && p.cabinet.economy === "war_industrialist") ? 1.12 : 1);
    const eqB = p._eqBonus || {};
    const dayShare = 1 / 7;
    // Military factories produce equipment
    const gunsOut = Math.floor(mil * ((alloc.guns || 0) / totalAlloc) * 12 * eff * (eqB.inf || 1) * dayShare);
    const artOut = Math.floor(mil * ((alloc.artillery || 0) / totalAlloc) * 2 * eff * dayShare);
    const tankOut = Math.floor(mil * ((alloc.tanks || 0) / totalAlloc) * 1 * eff * (eqB.tank || 1) * dayShare);
    p.equipment.inf_eq = (p.equipment.inf_eq || 0) + gunsOut;
    p.equipment.art_eq = (p.equipment.art_eq || 0) + artOut;
    p.equipment.tank_eq = (p.equipment.tank_eq || 0) + tankOut;
    // Sync legacy stockpile display
    if (p.stockpile) {
      p.stockpile.guns = p.equipment.inf_eq;
      p.stockpile.artillery = p.equipment.art_eq;
      p.stockpile.tanks = p.equipment.tank_eq;
    }
  }

  // ============================================================
  // UI RENDERERS
  // ============================================================
  function renderGrandCabinet() {
    const box = document.getElementById("grand-cabinet");
    if (!box) return;
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    let html = `<div class="text-[11px] text-yellow-400 font-bold mb-2">Politik Güç: <span id="grand-pp">${Math.floor(p.pp)}</span></div>`;
    ["political", "economy", "army"].forEach(slot => {
      const title = slot === "political" ? "Siyasi Danışman" : slot === "economy" ? "Ekonomi Bakanı" : "Genelkurmay";
      html += `<div class="mb-2 border border-slate-800 rounded p-2"><div class="text-[10px] font-black text-slate-400 uppercase mb-1">${title}</div>`;
      html += (ADVISORS[slot] || []).map(a => {
        const on = p.cabinet[slot] === a.id;
        return `<button type="button" onclick="hireAdvisor('${slot}','${a.id}')" class="w-full text-left mb-1 px-2 py-1.5 rounded border text-[10px] ${on ? "border-cyan-600 bg-cyan-950/40" : "border-slate-700 bg-slate-900 hover:border-slate-500"}">
          <b>${a.name}</b> · ${a.desc} · <span class="text-yellow-500">${a.cost} PP</span>${on ? " ✓" : ""}
        </button>`;
      }).join("");
      html += `</div>`;
    });
    // Recruit generals
    html += `<div class="border border-slate-800 rounded p-2 mt-2"><div class="text-[10px] font-black text-slate-400 uppercase mb-1">General İşe Al (40 PP)</div>`;
    const pool = (typeof GENERAL_POOL !== "undefined") ? GENERAL_POOL : [];
    html += pool.map(g => {
      const owned = p.generals.owned.includes(g.id);
      return `<button type="button" ${owned ? "disabled" : `onclick="recruitGeneral('${g.id}')"`} class="w-full text-left mb-1 px-2 py-1 rounded border text-[10px] ${owned ? "opacity-40 border-slate-800" : "border-slate-700 bg-slate-900"}">${g.name} (${g.trait}) ATK+${Math.round(g.atk*100)}% DEF+${Math.round(g.def*100)}%</button>`;
    }).join("");
    html += `</div>`;
    box.innerHTML = html;
  }

  function renderGrandMilitary() {
    const box = document.getElementById("grand-div-designer");
    if (!box) return;
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureGrandState(p);
    box.innerHTML = `
      <div class="text-[10px] text-slate-400 mb-2">Teçhizat: Inf ${p.equipment.inf_eq||0} · Art ${p.equipment.art_eq||0} · Tank ${p.equipment.tank_eq||0}</div>
      <div class="text-[10px] text-cyan-400/90 mb-2">Cephe genişliği varsayılan: ${DEFAULT_FRONT_WIDTH} (ihtiyat arkada bekler)</div>
      ${Object.keys(p.divTemplates).map(k => {
        const t = p.divTemplates[k];
        const b = t.brigades || {};
        return `<div class="p-2 mb-2 rounded border border-slate-700 bg-slate-900/80 text-[11px]">
          <div class="font-bold text-slate-200">${t.name} <span class="text-slate-500 font-mono">W${t.width}</span></div>
          <div class="text-[10px] text-slate-400">INF ${b.inf||0} · MOT ${b.mot||0} · ART ${b.art||0} · ARM ${b.arm||0}</div>
          <button type="button" onclick="trainDivisionTemplate('${k}')" class="mt-1 px-2 py-1 bg-cyan-900/60 border border-cyan-700 rounded text-[10px] font-bold">Tümen Kur</button>
        </div>`;
      }).join("")}
    `;
  }

  window.renderGrandPanels = function () {
    try { renderGrandCabinet(); } catch (e) {}
    try { renderGrandMilitary(); } catch (e) {}
    try { if (typeof renderFocusTree === "function") renderFocusTree(); } catch (e) {}
    try { if (typeof renderResearchTab === "function") renderResearchTab(); } catch (e) {}
  };

  // Inject UI containers into existing tabs if missing
  function ensureGrandUI() {
    // Focus tab already has focus-tree-nodes
    // Military: add designer box
    const mil = document.getElementById("content-military");
    if (mil && !document.getElementById("grand-div-designer")) {
      const d = document.createElement("div");
      d.id = "grand-div-designer";
      d.className = "bg-slate-950/50 border border-slate-800 rounded p-3 space-y-2";
      d.innerHTML = '<div class="text-xs text-cyan-400 font-black uppercase tracking-wider">Tümen Tasarımcısı</div>';
      mil.insertBefore(d, mil.firstChild);
    }
    // Research tab: cabinet section
    const res = document.getElementById("content-research");
    if (res && !document.getElementById("grand-cabinet")) {
      const c = document.createElement("div");
      c.id = "grand-cabinet";
      c.className = "bg-slate-950/40 border border-slate-800 rounded p-4 space-y-2";
      res.appendChild(c);
    }
    // HUD PP if missing
    if (!document.getElementById("hud-pp")) {
      const hud = document.getElementById("hud-tension")?.parentElement;
      if (hud) {
        const span = document.createElement("div");
        span.className = "text-[10px] text-yellow-400 font-mono";
        span.innerHTML = 'PP <span id="hud-pp">0</span>';
        hud.appendChild(span);
      }
    }
  }

  // Tick hooks
  (function hookGrandTick() {
    if (window._scGrandTick) return;
    window._scGrandTick = true;
    const prev = window.gameTick;
    if (typeof prev !== "function") return;
    window.gameTick = function () {
      const r = prev.apply(this, arguments);
      try {
        processPoliticalPower();
        processEquipmentProduction();
        // Focus duration uses days field
        const p = GameState.countries[GameState.player];
        if (p && p.activeFocus && p._focusDaysNeeded) {
          // progress already incremented in core; scale completion at days*1.5 was old — leave core
        }
      } catch (e) {
        console.warn("[Grand] tick:", e);
      }
      return r;
    };
  })();

  // Tab switch refresh
  (function hookTab() {
    const prev = window.switchTab;
    if (typeof prev !== "function") return;
    window.switchTab = function (tab) {
      const r = prev.apply(this, arguments);
      try {
        if (tab === "focus" || tab === "research" || tab === "military") renderGrandPanels();
      } catch (e) {}
      return r;
    };
  })();

  // Hook combat to optionally use width (soft integration)
  (function hookWidthCombat() {
    if (window._scWidthHook) return;
    window._scWidthHook = true;
    // Soft: expose for resolveHoiCombatDay if present
    window.getFrontWidthInfo = function (war) {
      try {
        const att = GameState.countries[war.attacker || GameState.player];
        const def = GameState.countries[war.target];
        if (!att || !def) return null;
        return resolveCombatWidthBattle(att, def, war);
      } catch (e) { return null; }
    };
  })();

  if (typeof document !== "undefined") {
    const boot = () => { try { ensureGrandUI(); installFocusTrees(); renderGrandPanels(); } catch (e) {} };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else setTimeout(boot, 300);
  }

  console.log("[Grand Expansion] Focus · Divisions/Width · Cabinet · Tech/Equipment online");
})();

// ============================================================
// MASTERMIND PACK — Division Designer · Air/Naval Modes · Supply
// Espionage · Occupation Laws · Puppets/Exile · AI · Performance
// Game Director full-autonomy expansion (single delivery)
// ============================================================
(function SCMastermind() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // ---------- Shared state ----------
  if (!GameState.intel) GameState.intel = { agents: {}, networks: {}, decryption: {}, ops: [] };
  if (!GameState.occupationLaws) GameState.occupationLaws = {}; // controllerIso -> lawId
  if (!GameState.exiles) GameState.exiles = {}; // originalIso -> { host, manpowerPool }
  if (!GameState.supply) GameState.supply = { hub: {}, province: {} };
  if (!GameState.airMissions) GameState.airMissions = {}; // zoneId -> { iso, type, wings }
  if (!GameState.navalMissions) GameState.navalMissions = {}; // seaId -> { iso, type, ships }
  if (!GameState.mapMode) GameState.mapMode = "political";

  const BRIGADE_TYPES = {
    inf:  { name: "Piyade", width: 2, soft: 8, hard: 1, man: 1000, eq: { inf_eq: 100 }, icon: "🪖" },
    art:  { name: "Topçu", width: 3, soft: 14, hard: 2, man: 500, eq: { art_eq: 12 }, icon: "💥" },
    arm:  { name: "Tank", width: 4, soft: 6, hard: 28, man: 500, eq: { tank_eq: 20 }, icon: "🛡️" },
    mot:  { name: "Motorize", width: 2, soft: 10, hard: 2, man: 900, eq: { inf_eq: 80, truck: 20 }, icon: "🚚" },
    recon:{ name: "Keşif", width: 2, soft: 4, hard: 1, man: 400, eq: { inf_eq: 40 }, icon: "🔭" },
    eng:  { name: "İstihkâm", width: 2, soft: 3, hard: 2, man: 400, eq: { inf_eq: 30 }, icon: "🔧" },
    aa:   { name: "Uçaksavar", width: 2, soft: 2, hard: 4, man: 400, eq: { art_eq: 8 }, icon: "📡" },
    at:   { name: "Tanksavar", width: 2, soft: 2, hard: 12, man: 400, eq: { art_eq: 10 }, icon: "🎯" }
  };

  const OCC_LAWS = {
    civilian:   { name: "Sivil Yönetim", resistance: 0.6, compliance: 1.2, factories: 0.5, manpower: 0.1 },
    balanced:   { name: "Dengeli İşgal", resistance: 1.0, compliance: 1.0, factories: 0.7, manpower: 0.2 },
    martial:    { name: "Sıkıyönetim", resistance: 1.3, compliance: 0.7, factories: 0.85, manpower: 0.25 },
    harsh:      { name: "Sert El Koyma", resistance: 1.8, compliance: 0.4, factories: 1.0, manpower: 0.35 }
  };

  // ============================================================
  // PERFORMANCE: throttle heavy map paints
  // ============================================================
  let _mapPaintScheduled = false;
  let _lastMapPaint = 0;
  window.scheduleMapRefresh = function (force) {
    const now = Date.now();
    if (!force && now - _lastMapPaint < 400) {
      if (_mapPaintScheduled) return;
      _mapPaintScheduled = true;
      setTimeout(() => {
        _mapPaintScheduled = false;
        _lastMapPaint = Date.now();
        try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
      }, 450);
      return;
    }
    _lastMapPaint = now;
    try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
  };

  // ============================================================
  // 1) INTERACTIVE DIVISION DESIGNER
  // ============================================================
  function ensureDesigner(p) {
    if (!p) return;
    if (!p.designer) {
      p.designer = {
        name: "Özel Tümen",
        slots: ["inf", "inf", "inf", "inf", "art", null, null, null, null, null]
      };
    }
    if (!p.customTemplates) p.customTemplates = {};
  }

  window.designerAddBrigade = function (type) {
    const p = GameState.countries[GameState.player];
    if (!p || !BRIGADE_TYPES[type]) return;
    ensureDesigner(p);
    const idx = p.designer.slots.findIndex(s => !s);
    if (idx < 0) {
      if (typeof showToast === "function") showToast("Tüm tabur slotları dolu (10)", "bad");
      return;
    }
    p.designer.slots[idx] = type;
    renderDivisionDesigner();
  };

  window.designerRemoveSlot = function (index) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureDesigner(p);
    if (index < 0 || index >= p.designer.slots.length) return;
    p.designer.slots[index] = null;
    // compact
    const filled = p.designer.slots.filter(Boolean);
    p.designer.slots = filled.concat(Array(10 - filled.length).fill(null));
    renderDivisionDesigner();
  };

  window.designerClear = function () {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureDesigner(p);
    p.designer.slots = Array(10).fill(null);
    renderDivisionDesigner();
  };

  window.designerSaveTemplate = function () {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureDesigner(p);
    const slots = p.designer.slots.filter(Boolean);
    if (slots.length < 2) {
      if (typeof log === "function") log("En az 2 tabur gerekli.", "text-yellow-400");
      return;
    }
    let width = 0, soft = 0, hard = 0, man = 0;
    const eqNeed = { inf_eq: 0, art_eq: 0, tank_eq: 0, truck: 0 };
    const brigades = {};
    slots.forEach(t => {
      const b = BRIGADE_TYPES[t];
      width += b.width; soft += b.soft; hard += b.hard; man += b.man;
      brigades[t] = (brigades[t] || 0) + 1;
      Object.keys(b.eq || {}).forEach(k => { eqNeed[k] = (eqNeed[k] || 0) + b.eq[k]; });
    });
    const id = "custom_" + Date.now().toString(36);
    const name = (document.getElementById("designer-name")?.value || "Özel Tümen").slice(0, 24);
    p.customTemplates[id] = { name, brigades, width, soft, hard, man, eqNeed, slots: slots.slice() };
    if (!p.divTemplates) p.divTemplates = {};
    p.divTemplates[id] = { name, brigades, width, soft: soft / 50, hard: hard / 50 };
    if (typeof log === "function") log("Şablon kaydedildi: " + name + " (W" + width + ")", "text-emerald-400");
    if (typeof showToast === "function") showToast("Şablon kaydedildi: " + name, "good");
    renderDivisionDesigner();
    if (typeof renderGrandMilitary === "function") try { renderGrandMilitary(); } catch (e) {}
  };

  window.designerTrain = function () {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureDesigner(p);
    const slots = p.designer.slots.filter(Boolean);
    if (slots.length < 2) return;
    let man = 0;
    const eqNeed = { inf_eq: 0, art_eq: 0, tank_eq: 0, truck: 0 };
    slots.forEach(t => {
      const b = BRIGADE_TYPES[t];
      man += b.man;
      Object.keys(b.eq || {}).forEach(k => { eqNeed[k] = (eqNeed[k] || 0) + b.eq[k]; });
    });
    p.equipment = p.equipment || { inf_eq: 0, art_eq: 0, tank_eq: 0, truck: 0 };
    if ((p.manpower || 0) < man) {
      if (typeof log === "function") log("Yetersiz manpower.", "text-red-400");
      return;
    }
    for (const k of Object.keys(eqNeed)) {
      if ((p.equipment[k] || 0) < eqNeed[k]) {
        if (typeof log === "function") log("Yetersiz teçhizat: " + k, "text-red-400");
        return;
      }
    }
    p.manpower -= man;
    Object.keys(eqNeed).forEach(k => { p.equipment[k] -= eqNeed[k]; });
    // legacy counters
    p.divisions = p.divisions || { inf: 0, art: 0, arm: 0 };
    if (slots.includes("arm")) p.divisions.arm = (p.divisions.arm || 0) + 1;
    else p.divisions.inf = (p.divisions.inf || 0) + 1;
    if (slots.includes("art") || slots.includes("at") || slots.includes("aa")) {
      p.divisions.art = (p.divisions.art || 0) + 1;
    }
    if (typeof log === "function") log("Tümen sahaya sürüldü (" + slots.length + " tabur).", "text-emerald-400");
    if (typeof updateHUD === "function") updateHUD();
    renderDivisionDesigner();
  };

  function designerStats(slots) {
    let width = 0, soft = 0, hard = 0, man = 0;
    slots.filter(Boolean).forEach(t => {
      const b = BRIGADE_TYPES[t];
      width += b.width; soft += b.soft; hard += b.hard; man += b.man;
    });
    return { width, soft, hard, man };
  }

  window.renderDivisionDesigner = function () {
    const host = document.getElementById("master-div-designer");
    if (!host) return;
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureDesigner(p);
    const st = designerStats(p.designer.slots);
    const palette = Object.keys(BRIGADE_TYPES).map(k => {
      const b = BRIGADE_TYPES[k];
      return `<button type="button" onclick="designerAddBrigade('${k}')" class="px-2 py-1.5 text-[10px] rounded border border-slate-600 bg-slate-900 hover:border-cyan-600" title="${b.name}">${b.icon} ${b.name}</button>`;
    }).join("");
    const slotsHtml = p.designer.slots.map((s, i) => {
      if (!s) return `<div class="h-12 rounded border border-dashed border-slate-700 bg-slate-950/50 flex items-center justify-center text-slate-600 text-[10px]">Boş</div>`;
      const b = BRIGADE_TYPES[s];
      return `<button type="button" onclick="designerRemoveSlot(${i})" class="h-12 rounded border border-cyan-800 bg-cyan-950/30 text-[10px] font-bold text-cyan-100">${b.icon} ${b.name}<br/><span class="text-slate-500">W${b.width}</span></button>`;
    }).join("");
    host.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-xs font-black text-cyan-400 uppercase tracking-wider">Tümen Tasarımcısı</h3>
        <input id="designer-name" type="text" maxlength="24" value="${(p.designer.name || "Özel Tümen").replace(/"/g, "")}" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] w-36" />
      </div>
      <div class="flex flex-wrap gap-1 mb-2">${palette}</div>
      <div class="grid grid-cols-5 gap-1 mb-2">${slotsHtml}</div>
      <div class="text-[10px] font-mono text-slate-400 mb-2">Genişlik <b class="text-cyan-300">${st.width}</b> · Soft ${st.soft} · Hard ${st.hard} · MP ${st.man.toLocaleString()}</div>
      <div class="grid grid-cols-3 gap-1">
        <button type="button" onclick="designerSaveTemplate()" class="py-1.5 text-[10px] font-bold border border-emerald-700 bg-emerald-950/40 rounded">Şablon Kaydet</button>
        <button type="button" onclick="designerTrain()" class="py-1.5 text-[10px] font-bold border border-cyan-700 bg-cyan-950/40 rounded">Eğit & Sahaya Sür</button>
        <button type="button" onclick="designerClear()" class="py-1.5 text-[10px] font-bold border border-slate-600 bg-slate-900 rounded">Temizle</button>
      </div>`;
  };

  // ============================================================
  // 2) AIR & NAVAL MAP MODES + MISSIONS
  // ============================================================
  window.setMapMode = function (mode) {
    GameState.mapMode = mode || "political";
    document.querySelectorAll(".map-mode-btn").forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("border-cyan-400", on);
      b.classList.toggle("text-cyan-300", on);
      b.classList.toggle("bg-cyan-950/40", on);
    });
    scheduleMapRefresh(true);
    try {
      if (typeof log === "function") log("Harita modu: " + mode, "text-slate-400");
    } catch (e) {}
    renderMissionPanel();
  };

  // Extend color logic via post-hook
  (function hookMapModes() {
    if (window._scMapModeHook) return;
    window._scMapModeHook = true;
    const prev = window.refreshMapColors;
    if (typeof prev !== "function") return;
    window.refreshMapColors = function () {
      try { prev.apply(this, arguments); } catch (e) {}
      const mode = GameState.mapMode || "political";
      try {
        if (mode === "supply") paintSupplyMode();
        else if (mode === "air") paintAirMode();
        else if (mode === "naval") paintNavalMode();
        else if (mode === "resistance") paintResistanceMode();
      } catch (e) {
        console.warn("[MapMode]", e);
      }
    };
  })();

  function paintSupplyMode() {
    d3.selectAll(".country-path").each(function () {
      const path = d3.select(this);
      const name = path.attr("data-name");
      if (!name) return;
      const s = getProvinceSupply(name);
      let fill = "#1e293b";
      if (s >= 0.85) fill = "#22c55e";
      else if (s >= 0.6) fill = "#84cc16";
      else if (s >= 0.35) fill = "#eab308";
      else if (s >= 0.15) fill = "#f97316";
      else fill = "#b91c1c";
      path.style("fill", fill);
    });
  }
  function paintAirMode() {
    d3.selectAll(".country-path").each(function () {
      const path = d3.select(this);
      const name = path.attr("data-name");
      if (!name) return;
      const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : null;
      const mission = findAirMissionForProvince(name);
      let fill = "#0f172a";
      if (mission) {
        if (mission.type === "superiority") fill = "#38bdf8";
        else if (mission.type === "ground") fill = "#f97316";
        else fill = "#a78bfa";
      } else if (owner && GameState.countries[owner]) {
        fill = GameState.countries[owner].color || "#1e293b";
        path.style("opacity", 0.45);
      }
      path.style("fill", fill);
    });
  }
  function paintNavalMode() {
    // Coastal provinces highlighted by naval mission influence
    d3.selectAll(".country-path").each(function () {
      const path = d3.select(this);
      const name = path.attr("data-name");
      if (!name) return;
      const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
      const coastal = PD[name] && (PD[name].coastal || PD[name].port || (PD[name].terrain === "coast"));
      const mission = Object.values(GameState.navalMissions || {})[0];
      let fill = coastal ? "#0e7490" : "#0f172a";
      if (mission && coastal) {
        if (mission.type === "patrol") fill = "#06b6d4";
        else if (mission.type === "convoy") fill = "#34d399";
        else if (mission.type === "invasion") fill = "#f43f5e";
      }
      path.style("fill", fill).style("opacity", coastal ? 1 : 0.35);
    });
  }
  function paintResistanceMode() {
    d3.selectAll(".country-path").each(function () {
      const path = d3.select(this);
      const name = path.attr("data-name");
      if (!name) return;
      const occ = GameState.occupations || {};
      const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : null;
      if (occ[name] && occ[name] !== owner) {
        const res = getProvinceResistance(name);
        path.style("fill", res > 0.6 ? "#ef4444" : res > 0.3 ? "#f59e0b" : "#64748b");
      }
    });
  }

  function findAirMissionForProvince(pName) {
    // Simplified: any mission by player applies loosely
    const iso = GameState.player;
    const m = GameState.airMissions[iso];
    return m || null;
  }

  window.assignAirMission = function (type) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.airforce = p.airforce || { fighter: 0, bomber: 0 };
    const wings = (p.airforce.fighter || 0) + (p.airforce.bomber || 0);
    if (wings < 1) {
      if (typeof log === "function") log("Hava görevi için uçak yok. Önce uçak üret/inşa et.", "text-yellow-400");
      return;
    }
    GameState.airMissions[GameState.player] = { iso: GameState.player, type: type || "superiority", wings: wings };
    if (typeof log === "function") log("Hava görevi: " + type + " (" + wings + " kanat)", "text-cyan-300");
    if (GameState.mapMode === "air") scheduleMapRefresh(true);
    renderMissionPanel();
  };

  window.assignNavalMission = function (type) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.navy = p.navy || { ships: 0 };
    if ((p.navy.ships || 0) < 1) {
      if (typeof log === "function") log("Donanma görevi için gemi yok.", "text-yellow-400");
      return;
    }
    GameState.navalMissions[GameState.player] = { iso: GameState.player, type: type || "patrol", ships: p.navy.ships };
    if (typeof log === "function") log("Deniz görevi: " + type, "text-blue-300");
    if (GameState.mapMode === "naval") scheduleMapRefresh(true);
    renderMissionPanel();
  };

  window.buildAirWing = function (kind) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.airforce = p.airforce || { fighter: 0, bomber: 0 };
    const cost = kind === "bomber" ? 400 : 250;
    if ((p.money || 0) < cost) {
      if (typeof log === "function") log("Uçak için yetersiz hazine.", "text-red-400");
      return;
    }
    p.money -= cost;
    p.airforce[kind] = (p.airforce[kind] || 0) + 1;
    if (typeof log === "function") log((kind === "bomber" ? "Bombardıman" : "Avcı") + " kanadı eklendi.", "text-cyan-300");
    if (typeof updateHUD === "function") updateHUD();
    renderMissionPanel();
  };

  // Air superiority bonus already exists; enhance with missions
  (function hookAirBonus() {
    const prev = window.getAirSupremacyBonus;
    window.getAirSupremacyBonus = function (attacker, defender) {
      let base = 1;
      try { if (typeof prev === "function") base = prev(attacker, defender) || 1; } catch (e) {}
      try {
        const attIso = attacker && (attacker.flag ? GameState.player : null);
        // attacker may be country object
        const aIso = Object.keys(GameState.countries || {}).find(k => GameState.countries[k] === attacker) || GameState.player;
        const m = GameState.airMissions[aIso];
        if (m && m.type === "superiority") base *= 1.15;
        if (m && m.type === "ground") base *= 1.08;
      } catch (e) {}
      return base;
    };
  })();

  // ============================================================
  // 3) SUPPLY & LOGISTICS
  // ============================================================
  function getProvinceInfra(pName) {
    try {
      if (typeof window.getProvinceInfra === "function") return window.getProvinceInfra(pName) || 1;
      const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
      return (PD[pName] && (PD[pName].infra || PD[pName].infrastructure)) || 2;
    } catch (e) { return 2; }
  }

  window.getProvinceSupply = function (pName) {
    if (GameState.supply.province[pName] != null) return GameState.supply.province[pName];
    const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(pName) : null;
    const infra = getProvinceInfra(pName);
    let s = Math.min(1, 0.25 + infra * 0.12);
    // Capital / core bonus
    try {
      if (GameState.capitals && GameState.capitals[owner] === pName) s = Math.min(1, s + 0.25);
    } catch (e) {}
    // Occupation penalty
    if (GameState.occupations && GameState.occupations[pName] && GameState.occupations[pName] !== owner) {
      s *= 0.65;
    }
    return Math.max(0.05, Math.min(1, s));
  };

  function processSupplyTick() {
    // Recompute a sample of provinces for performance
    try {
      const keys = Object.keys(provinceOwners || {});
      if (!keys.length) return;
      const step = Math.max(1, Math.floor(keys.length / 40));
      const start = (GameState._supplyCursor || 0) % keys.length;
      for (let i = 0; i < 40 && i * step < keys.length; i++) {
        const pName = keys[(start + i * step) % keys.length];
        GameState.supply.province[pName] = getProvinceSupply(pName);
      }
      GameState._supplyCursor = (start + 40) % keys.length;

      // Attrition on player divisions if average supply low on front
      const wars = GameState.activeWars || [];
      const player = GameState.countries[GameState.player];
      if (!player || !wars.length) return;
      wars.forEach(w => {
        if (w.attacker !== GameState.player && w.target !== GameState.player) return;
        // low supply → org bleed via progress penalty
        const avg = 0.5; // simplified global front supply
        if (avg < 0.4) {
          w.progress = (w.progress || 0) - 0.15;
          if (Math.random() < 0.08 && typeof log === "function") {
            log("Lojistik: cephe ikmali zayıf — org düşüyor.", "text-orange-400");
          }
        }
      });
    } catch (e) {}
  }

  // ============================================================
  // 4) ESPIONAGE
  // ============================================================
  window.deployAgent = function (targetIso) {
    const p = GameState.countries[GameState.player];
    if (!p || !targetIso || targetIso === GameState.player) return;
    const cost = 35;
    if ((p.pp || 0) < cost && (p.money || 0) < 200) {
      if (typeof log === "function") log("Ajan için PP veya para yetersiz.", "text-red-400");
      return;
    }
    if (p.pp >= cost) p.pp -= cost;
    else p.money -= 200;
    const id = GameState.player + "_" + targetIso;
    GameState.intel.agents[id] = {
      from: GameState.player, to: targetIso, progress: 0, network: 0, mission: "build_network"
    };
    if (typeof log === "function") log("Ajan görevlendirildi: " + targetIso, "text-violet-300");
    renderIntelPanel();
  };

  window.setSpyMission = function (targetIso, mission) {
    const id = GameState.player + "_" + targetIso;
    const a = GameState.intel.agents[id];
    if (!a) {
      if (typeof log === "function") log("Önce ajan gönderin.", "text-yellow-400");
      return;
    }
    a.mission = mission || "build_network";
    a.progress = 0;
    if (typeof log === "function") log("Casus görevi: " + mission + " → " + targetIso, "text-violet-300");
    renderIntelPanel();
  };

  function processIntelTick() {
    const agents = GameState.intel.agents || {};
    Object.keys(agents).forEach(id => {
      const a = agents[id];
      if (!a) return;
      a.progress = (a.progress || 0) + 1.2 + (a.network || 0) * 0.3;
      if (a.mission === "build_network") {
        if (a.progress >= 100) {
          a.network = Math.min(5, (a.network || 0) + 1);
          a.progress = 0;
          if (a.from === GameState.player && typeof log === "function") {
            log("İstihbarat ağı güçlendi: " + a.to + " (lvl " + a.network + ")", "text-violet-300");
          }
        }
      } else if (a.mission === "decrypt") {
        if (a.progress >= 100) {
          GameState.intel.decryption[a.to] = Math.min(3, (GameState.intel.decryption[a.to] || 0) + 1);
          a.progress = 0;
          if (a.from === GameState.player && typeof log === "function") {
            log("Şifre kırma ilerledi: " + a.to, "text-violet-300");
          }
        }
      } else if (a.mission === "resistance") {
        if (a.progress >= 100) {
          a.progress = 0;
          // Boost resistance in occupied provinces of target
          Object.keys(GameState.occupations || {}).forEach(pName => {
            if (provinceOwners[pName] === a.to || GameState.occupations[pName] === a.to) {
              GameState.intel.ops.push({ type: "res_boost", province: pName, until: (GameState.date && GameState.date.getTime()) + 86400000 * 30 });
            }
          });
          if (a.from === GameState.player && typeof log === "function") {
            log("Direniş operasyonu: " + a.to, "text-orange-300");
          }
        }
      } else if (a.mission === "steal_tech") {
        if (a.progress >= 120) {
          a.progress = 0;
          const fromC = GameState.countries[a.from];
          if (fromC) {
            fromC.factoryEfficiency = Math.min(1.85, (fromC.factoryEfficiency || 1) + 0.02);
            if (a.from === GameState.player && typeof log === "function") {
              log("Teknoloji çalındı — verim +2%", "text-emerald-300");
            }
          }
        }
      }
    });
  }

  window.getProvinceResistance = function (pName) {
    let r = 0.2;
    const occ = GameState.occupations && GameState.occupations[pName];
    const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(pName) : null;
    if (occ && occ !== owner) {
      const lawId = GameState.occupationLaws[occ] || "balanced";
      const law = OCC_LAWS[lawId] || OCC_LAWS.balanced;
      r = 0.35 * law.resistance;
      (GameState.intel.ops || []).forEach(op => {
        if (op.type === "res_boost" && op.province === pName) r += 0.2;
      });
    }
    return Math.max(0, Math.min(1, r));
  };

  // ============================================================
  // 5) OCCUPATION LAWS · PUPPETS · GOVERNMENTS IN EXILE
  // ============================================================
  window.setOccupationLaw = function (lawId) {
    if (!OCC_LAWS[lawId]) return;
    GameState.occupationLaws[GameState.player] = lawId;
    if (typeof log === "function") log("İşgal yasası: " + OCC_LAWS[lawId].name, "text-amber-300");
    renderOccupationPanel();
    if (GameState.mapMode === "resistance") scheduleMapRefresh(true);
  };

  window.createGovernmentInExile = function (iso) {
    // When fully annexed, optionally create exile hosted by player ally
    if (!iso || !GameState.countries[iso]) return;
    GameState.exiles[iso] = {
      host: GameState.player,
      manpowerPool: Math.floor((GameState.countries[iso].manpower || 0) * 0.15),
      active: true
    };
    if (typeof log === "function") log("Sürgündeki hükümet: " + iso + " (ev sahibi " + GameState.player + ")", "text-slate-300");
  };

  // Enhance makePuppet to grant manpower levy
  (function hookPuppet() {
    if (window._scPuppetHook) return;
    window._scPuppetHook = true;
    const prev = window.makePuppet;
    if (typeof prev !== "function") return;
    window.makePuppet = function (targetIso) {
      const r = prev.apply(this, arguments);
      try {
        const target = GameState.countries[targetIso];
        const player = GameState.countries[GameState.player];
        if (target && player) {
          const levy = Math.floor((target.manpower || 0) * 0.2);
          target.manpower = Math.max(0, (target.manpower || 0) - levy);
          player.manpower = (player.manpower || 0) + levy;
          target.isPuppet = true;
          target.overlord = GameState.player;
          if (typeof log === "function") log("Kukla manpower payı: +" + levy.toLocaleString(), "text-purple-300");
        }
      } catch (e) {}
      return r;
    };
  })();

  function processOccupationTick() {
    // Resistance damage / compliance factories
    try {
      const occ = GameState.occupations || {};
      const byController = {};
      Object.keys(occ).forEach(p => {
        const ctrl = occ[p];
        if (!ctrl) return;
        if (!byController[ctrl]) byController[ctrl] = [];
        byController[ctrl].push(p);
      });
      Object.keys(byController).forEach(ctrl => {
        const law = OCC_LAWS[GameState.occupationLaws[ctrl] || "balanced"];
        const c = GameState.countries[ctrl];
        if (!c) return;
        // Small resistance event
        if (Math.random() < 0.02 * law.resistance) {
          if (ctrl === GameState.player && typeof log === "function") {
            log("İşgal: direniş eylemi — hafif org kaybı riski.", "text-orange-400");
          }
        }
      });
    } catch (e) {}
  }

  // ============================================================
  // 6) AI IMPROVEMENTS
  // ============================================================
  (function hookAI() {
    if (window._scAIHook) return;
    window._scAIHook = true;
    const prev = window.processAITick;
    window.processAITick = function () {
      try { if (typeof prev === "function") prev.apply(this, arguments); } catch (e) {}
      try { aiFocusAndBuild(); } catch (e) { console.warn("[AI]", e); }
    };
  })();

  function aiFocusAndBuild() {
    if (Math.random() > 0.35) return;
    const mapC = typeof getMapCountries === "function" ? getMapCountries() : null;
    const ais = Object.keys(GameState.countries || {}).filter(iso => {
      if (iso === GameState.player) return false;
      const c = GameState.countries[iso];
      if (!c || c.isPuppet || c.isCapitulated) return false;
      if (mapC && mapC.size && !mapC.has(iso)) return false;
      // MP AI-controlled humans
      try {
        if (GameState.mp && GameState.mp._aiControl) {
          const peer = Object.values(GameState.mp.players || {}).find(p => p.country === iso);
          if (peer && !GameState.mp._aiControl[peer.id] && peer.id) {
            // human still connected — skip heavy AI
            if (!peer.ai) return false;
          }
        }
      } catch (e) {}
      return true;
    });
    if (!ais.length) return;
    const iso = ais[Math.floor(Math.random() * ais.length)];
    const c = GameState.countries[iso];
    // Start focus if idle
    if (!c.activeFocus) {
      const tree = (GameState.activeFocusTree && GameState.activeFocusTree[iso]) || [];
      const avail = tree.filter(n => {
        if ((c.completedFocuses || []).includes(n.id)) return false;
        return (n.prereq || []).every(p => (c.completedFocuses || []).includes(p));
      });
      if (avail.length) {
        const pick = avail[Math.floor(Math.random() * avail.length)];
        c.activeFocus = pick.id;
        c.focusProgress = 0;
        c.completedFocuses = c.completedFocuses || [];
      }
    }
    // Build mil if money ok
    if ((c.money || 0) > 800 && Math.random() < 0.2) {
      c.milFactories = (c.milFactories || 0) + 1;
      c.money -= 400;
    }
    // Don't suicide war on player if weak
    if (Math.random() < 0.05 && typeof declareWar === "function") {
      const myDiv = Object.values(c.divisions || {}).reduce((a, b) => a + b, 0);
      const pDiv = Object.values((GameState.countries[GameState.player] || {}).divisions || {}).reduce((a, b) => a + b, 0);
      if (myDiv > pDiv * 1.4 && (GameState.globalTension || 0) > 30) {
        // rare aggressive AI
      }
    }
  }

  // ============================================================
  // UI PANELS
  // ============================================================
  function ensureMasterUI() {
    // Map mode buttons near map
    if (!document.getElementById("master-map-modes")) {
      const mapWrap = document.getElementById("map-container") || document.getElementById("game-map")?.parentElement;
      if (mapWrap) {
        const bar = document.createElement("div");
        bar.id = "master-map-modes";
        bar.className = "absolute top-2 left-2 z-[40] flex flex-wrap gap-1 max-w-[70vw]";
        bar.innerHTML = [
          ["political", "Siyasi"],
          ["supply", "İkmal"],
          ["air", "Hava"],
          ["naval", "Deniz"],
          ["resistance", "Direniş"],
          ["industry", "Sanayi"]
        ].map(([m, l]) => `<button type="button" data-mode="${m}" class="map-mode-btn px-2 py-1 text-[9px] font-bold rounded border border-slate-600 bg-slate-950/80 text-slate-300" onclick="setMapMode('${m}')">${l}</button>`).join("");
        if (getComputedStyle(mapWrap).position === "static") mapWrap.style.position = "relative";
        mapWrap.appendChild(bar);
      }
    }
    // Division designer in military tab
    const mil = document.getElementById("content-military");
    if (mil && !document.getElementById("master-div-designer")) {
      const d = document.createElement("div");
      d.id = "master-div-designer";
      d.className = "bg-slate-950/60 border border-slate-700 rounded p-3 mb-2";
      mil.insertBefore(d, mil.firstChild);
    }
    // Intel + occupation + missions strip in diplomacy or military
    if (!document.getElementById("master-intel-panel")) {
      const dip = document.getElementById("content-diplomacy") || mil;
      if (dip) {
        const panel = document.createElement("div");
        panel.id = "master-intel-panel";
        panel.className = "bg-slate-950/50 border border-violet-900/50 rounded p-3 space-y-2 mt-2";
        dip.appendChild(panel);
      }
    }
    if (!document.getElementById("master-occ-panel")) {
      const prov = document.getElementById("content-province") || mil;
      if (prov) {
        const panel = document.createElement("div");
        panel.id = "master-occ-panel";
        panel.className = "bg-slate-950/50 border border-amber-900/40 rounded p-3 space-y-2 mt-2";
        prov.appendChild(panel);
      }
    }
    if (!document.getElementById("master-mission-panel")) {
      if (mil) {
        const panel = document.createElement("div");
        panel.id = "master-mission-panel";
        panel.className = "bg-slate-950/50 border border-sky-900/40 rounded p-3 space-y-2 mt-2";
        mil.appendChild(panel);
      }
    }
  }

  window.renderIntelPanel = function () {
    const box = document.getElementById("master-intel-panel");
    if (!box) return;
    const agents = Object.values(GameState.intel.agents || {}).filter(a => a.from === GameState.player);
    box.innerHTML = `
      <div class="text-xs font-black text-violet-300 uppercase tracking-wider">İstihbarat & Casusluk</div>
      <div class="flex flex-wrap gap-1">
        <button type="button" onclick="(function(){const t=prompt('Hedef ISO');if(t)deployAgent(t.toUpperCase());})()" class="px-2 py-1 text-[10px] border border-violet-700 rounded bg-violet-950/40 font-bold">Ajan Gönder</button>
      </div>
      <div class="space-y-1 text-[10px]">
        ${agents.length ? agents.map(a => `
          <div class="p-2 rounded border border-slate-800 bg-slate-900/80">
            <b>${a.to}</b> · ${a.mission} · ağ ${a.network||0} · %${Math.floor(a.progress||0)}
            <div class="flex flex-wrap gap-1 mt-1">
              <button onclick="setSpyMission('${a.to}','build_network')" class="px-1.5 py-0.5 border border-slate-600 rounded">Ağ</button>
              <button onclick="setSpyMission('${a.to}','decrypt')" class="px-1.5 py-0.5 border border-slate-600 rounded">Şifre</button>
              <button onclick="setSpyMission('${a.to}','resistance')" class="px-1.5 py-0.5 border border-slate-600 rounded">Direniş</button>
              <button onclick="setSpyMission('${a.to}','steal_tech')" class="px-1.5 py-0.5 border border-slate-600 rounded">Tech Çal</button>
            </div>
          </div>`).join("") : '<div class="text-slate-500">Aktif ajan yok</div>'}
      </div>`;
  };

  window.renderOccupationPanel = function () {
    const box = document.getElementById("master-occ-panel");
    if (!box) return;
    const cur = GameState.occupationLaws[GameState.player] || "balanced";
    box.innerHTML = `
      <div class="text-xs font-black text-amber-300 uppercase tracking-wider">İşgal Yasaları</div>
      <div class="grid grid-cols-2 gap-1">
        ${Object.keys(OCC_LAWS).map(id => {
          const L = OCC_LAWS[id];
          const on = cur === id;
          return `<button type="button" onclick="setOccupationLaw('${id}')" class="text-left p-2 rounded border text-[10px] ${on ? "border-amber-500 bg-amber-950/40" : "border-slate-700 bg-slate-900"}">
            <b>${L.name}</b><br/>Direniş ×${L.resistance} · Uyum ×${L.compliance}
          </button>`;
        }).join("")}
      </div>
      <p class="text-[9px] text-slate-500">Kukla devletler manpower ve fabrika payı verir. Sürgün hükümetleri ilhak sonrası oluşabilir.</p>`;
  };

  window.renderMissionPanel = function () {
    const box = document.getElementById("master-mission-panel");
    if (!box) return;
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.airforce = p.airforce || { fighter: 0, bomber: 0 };
    p.navy = p.navy || { ships: 0 };
    const airM = GameState.airMissions[GameState.player];
    const navM = GameState.navalMissions[GameState.player];
    box.innerHTML = `
      <div class="text-xs font-black text-sky-300 uppercase tracking-wider">Hava / Deniz Görevleri</div>
      <div class="text-[10px] text-slate-400">Uçak: Avcı ${p.airforce.fighter||0} · Bombardıman ${p.airforce.bomber||0} · Gemi ${p.navy.ships||0}</div>
      <div class="flex flex-wrap gap-1 my-1">
        <button type="button" onclick="buildAirWing('fighter')" class="px-2 py-1 text-[10px] border border-slate-600 rounded">+Avcı (250💰)</button>
        <button type="button" onclick="buildAirWing('bomber')" class="px-2 py-1 text-[10px] border border-slate-600 rounded">+Bombardıman (400💰)</button>
      </div>
      <div class="flex flex-wrap gap-1">
        <button type="button" onclick="assignAirMission('superiority')" class="px-2 py-1 text-[10px] border border-sky-700 rounded bg-sky-950/30">Hava Üstünlüğü</button>
        <button type="button" onclick="assignAirMission('ground')" class="px-2 py-1 text-[10px] border border-orange-700 rounded">Kara Desteği</button>
        <button type="button" onclick="assignNavalMission('patrol')" class="px-2 py-1 text-[10px] border border-cyan-700 rounded">Devriye</button>
        <button type="button" onclick="assignNavalMission('convoy')" class="px-2 py-1 text-[10px] border border-emerald-700 rounded">Konvoy</button>
        <button type="button" onclick="assignNavalMission('invasion')" class="px-2 py-1 text-[10px] border border-red-700 rounded">Çıkarma Desteği</button>
      </div>
      <div class="text-[10px] text-slate-500 mt-1">Aktif hava: ${airM ? airM.type : "—"} · deniz: ${navM ? navM.type : "—"}</div>`;
  };

  window.renderMasterPanels = function () {
    try { renderDivisionDesigner(); } catch (e) {}
    try { renderIntelPanel(); } catch (e) {}
    try { renderOccupationPanel(); } catch (e) {}
    try { renderMissionPanel(); } catch (e) {}
  };

  // Tick integration (throttled extras)
  (function hookMasterTick() {
    if (window._scMasterTick) return;
    window._scMasterTick = true;
    const prev = window.gameTick;
    if (typeof prev !== "function") return;
    window.gameTick = function () {
      const r = prev.apply(this, arguments);
      try {
        // Run extras every tick but cheap
        processSupplyTick();
        if ((GameState._intelDay || 0) % 2 === 0) processIntelTick();
        GameState._intelDay = (GameState._intelDay || 0) + 1;
        if ((GameState._intelDay % 5) === 0) processOccupationTick();
      } catch (e) {
        console.warn("[Mastermind] tick", e);
      }
      return r;
    };
  })();

  // Tab refresh
  (function hookTabs() {
    const prev = window.switchTab;
    if (typeof prev !== "function") return;
    window.switchTab = function (tab) {
      const r = prev.apply(this, arguments);
      try {
        if (tab === "military" || tab === "diplomacy" || tab === "province") renderMasterPanels();
      } catch (e) {}
      return r;
    };
  })();

  // Boot
  function bootMaster() {
    ensureMasterUI();
    renderMasterPanels();
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(bootMaster, 400));
    else setTimeout(bootMaster, 400);
  }

  console.log("[Mastermind] Designer · Air/Naval · Supply · Intel · Occupation · AI · Perf online");
})();

// ============================================================
// SUPREME COMMAND — GRAND MASTER EDITION v1.0  ·  FINAL SEAL
// Supreme Command release
// ============================================================
(function SCGrandMasterSeal() {
  "use strict";
  const VERSION = "1.0.0";
  const CODENAME = "Grand Master Edition";
  window.SC_VERSION = VERSION;
  window.SC_EDITION = CODENAME;

  function banner() {
    try {
      console.log(
        "%c SUPREME COMMAND %c " + CODENAME + " v" + VERSION + " ",
        "background:#0c1220;color:#c4a35a;font-weight:900;padding:4px 8px;border:1px solid #c4a35a44;",
        "background:#121810;color:#8a9480;padding:4px 8px;border:1px solid #2a3a28;"
      );
      console.log(
        "%c Supreme Command %c HTML5 / JavaScript ",
        "background:#1a1810;color:#e8eef7;font-weight:700;padding:3px 8px;",
        "background:#0a1018;color:#5a6450;padding:3px 8px;"
      );
      console.log("[SC] Release freeze · map pack 1083 · host-centric MP · focus · supply · intel · designer");
    } catch (e) {}
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", banner);
    } else {
      banner();
    }
  } else {
    banner();
  }
})();

// ============================================================
// v1.1 HOTFIX — MP slow clock · host vote · client date/flags
// · FoW off · map modes off · thin borders · country picker
// · log BR · open rooms · maxPlayers · host-only sim
// ============================================================
(function SC_v11_Hotfix() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // ---------- 1) MUCH slower MP clock + host speed vote ----------
  const MP_SPEED_MS = { 0: 0, 1: 3500, 2: 2000, 3: 1100, 4: 700, 5: 400 };
  const speedVotes = Object.create(null); // peerId -> level

  function mpActive() {
    try { return typeof mpIsActive === "function" && mpIsActive(); } catch (e) { return !!(GameState.mp && GameState.mp.active); }
  }
  function isHost() {
    try { return typeof mpIsHost === "function" && mpIsHost(); } catch (e) { return !!(GameState.mp && GameState.mp.isHost); }
  }

  // Override SPEED if MP engine left SPEED_MS on window scope — patch applyLocalSpeed path
  const _prevMpSetSpeed = window.mpSetSpeed;
  window.mpSetSpeed = function (level) {
    level = Number(level);
    if (!mpActive()) {
      const ms = MP_SPEED_MS[level] != null ? MP_SPEED_MS[level] : 2000;
      if (typeof setGameSpeed === "function") setGameSpeed(ms || 2000);
      GameState.running = level !== 0;
      return;
    }
    if (isHost()) {
      applyHostSpeed(level);
    } else {
      // Client casts a speed vote → host tallies
      try {
        if (typeof sendToHost === "function") sendToHost({ t: "speedVote", level: level });
        else if (GameState.mp && GameState.mp.conns) {
          Object.values(GameState.mp.conns).forEach(c => {
            try { c.send(JSON.stringify({ t: "speedVote", level: level, from: GameState.mp.peerId })); } catch (e) {}
          });
        }
      } catch (e) {}
      try { if (typeof showToast === "function") showToast("Hız oylaması hosta iletildi: " + level + "×", "info"); } catch (e) {}
    }
  };

  function applyHostSpeed(level) {
    level = Number(level);
    if (!(level in MP_SPEED_MS)) level = 1;
    if (GameState.mp) GameState.mp.speedLevel = level;
    const ms = MP_SPEED_MS[level];
    if (ms === 0) {
      GameState.running = false;
      if (window.gameTickInterval) {
        try { clearInterval(window.gameTickInterval); } catch (e) {}
        window.gameTickInterval = null;
      }
    } else {
      GameState.speed = ms;
      GameState.running = true;
      if (isHost() || !mpActive()) {
        if (window.gameTickInterval) {
          try { clearInterval(window.gameTickInterval); } catch (e) {}
        }
        window.gameTickInterval = setInterval(() => {
          try {
            if (typeof gameTick === "function") gameTick();
            if (mpActive() && isHost() && typeof hostPushSync === "function") hostPushSync();
          } catch (e) {
            console.warn("[v11] tick", e);
          }
        }, ms);
      }
    }
    // Broadcast
    try {
      if (typeof broadcast === "function") broadcast({ t: "speed", level: level });
      if (typeof hostPushSync === "function") hostPushSync();
    } catch (e) {}
    const st = document.getElementById("mp-hud-status");
    if (st) st.textContent = level === 0 ? "DURAKLATILDI" : ("MP " + level + "×");
    try { if (typeof showToast === "function") showToast(level === 0 ? "Oyun duraklatıldı" : ("Hız: " + level + "×"), "info"); } catch (e) {}
  }

  // Host opens vote UI for pause/speed
  window.mpOpenSpeedVote = function (level) {
    level = Number(level);
    if (!mpActive()) return;
    if (isHost()) {
      // Host proposes — auto-apply after short confirm or immediate
      applyHostSpeed(level);
      try {
        if (typeof broadcast === "function") broadcast({ t: "sys", text: "Host hızı " + level + "× yaptı" });
      } catch (e) {}
      return;
    }
    window.mpSetSpeed(level);
  };

  // Intercept host messages for speedVote (patch handle path via message bus)
  (function patchSpeedVote() {
    if (window._v11SpeedVote) return;
    window._v11SpeedVote = true;
    // Wrap Peer data is hard; poll MP and also monkey-patch if handleHostMessage exists later
    const iv = setInterval(() => {
      // expose tally helper for host
      window.mpTallySpeedVote = function (fromId, level) {
        if (!isHost()) return;
        speedVotes[fromId] = Number(level);
        const counts = {};
        Object.values(speedVotes).forEach(l => { counts[l] = (counts[l] || 0) + 1; });
        let best = null, bestN = 0;
        Object.keys(counts).forEach(l => {
          if (counts[l] > bestN) { bestN = counts[l]; best = Number(l); }
        });
        const need = Math.max(1, Math.ceil(Object.keys((GameState.mp && GameState.mp.players) || {}).length * 0.5));
        if (best != null && bestN >= need) {
          applyHostSpeed(best);
          Object.keys(speedVotes).forEach(k => delete speedVotes[k]);
          try {
            if (typeof broadcast === "function") broadcast({ t: "sys", text: "Oylama: hız " + best + "×" });
          } catch (e) {}
        }
      };
    }, 2000);
    // clear interval after binding once conceptually - keep for host session
    void iv;
  })();

  // Hook: when host receives data, look for speedVote
  (function hookPeerSpeedVote() {
    if (window._v11PeerVote) return;
    window._v11PeerVote = true;
    const orig = window.mpTallySpeedVote;
    document.addEventListener("sc-mp-data", function (ev) {
      try {
        const d = ev.detail || {};
        if (d.msg && d.msg.t === "speedVote" && isHost()) {
          if (typeof window.mpTallySpeedVote === "function") window.mpTallySpeedVote(d.fromId, d.msg.level);
        }
      } catch (e) {}
    });
  })();

  // ---------- 2) HOST-ONLY simulation gate (clients never advance time) ----------
  (function gateClientTick() {
    if (window._v11TickGate) return;
    window._v11TickGate = true;
    const prev = window.gameTick;
    if (typeof prev !== "function") return;
    window.gameTick = function () {
      try {
        if (mpActive() && !isHost()) {
          // Client: never simulate — only wait for host sync
          return;
        }
      } catch (e) {}
      return prev.apply(this, arguments);
    };
  })();

  // ---------- 3) Client date + flag sync hardening ----------
  function forceHudDate() {
    try {
      if (!GameState.date) return;
      const d = GameState.date instanceof Date ? GameState.date : new Date(GameState.date);
      if (isNaN(d.getTime())) return;
      const day = String(d.getDate()).padStart(2, "0");
      const months = ["OCA","ŞUB","MAR","NİS","MAY","HAZ","TEM","AĞU","EYL","EKİ","KAS","ARA"];
      const txt = day + " " + months[d.getMonth()] + " " + d.getFullYear();
      const el = document.getElementById("hud-date");
      if (el) el.textContent = txt;
      const mpDate = document.getElementById("mp-sync-date");
      if (mpDate) {
        const lvl = (GameState.mp && GameState.mp.speedLevel) || 1;
        mpDate.textContent = txt + " · " + lvl + "×";
      }
    } catch (e) {}
  }

  function forcePlayerFlag() {
    try {
      const iso = GameState.player;
      if (!iso) return;
      const c = GameState.countries[iso];
      const flagEl = document.getElementById("hud-flag") || document.getElementById("player-flag");
      const nameEl = document.getElementById("hud-country") || document.getElementById("player-country-name");
      if (nameEl && c) nameEl.textContent = c.name || iso;
      // flagcdn
      const code2 = (typeof ISO3_TO_2 !== "undefined" && ISO3_TO_2[iso]) || (iso.length === 3 ? null : iso);
      const img = document.querySelector("#hud-flag img, #player-flag img, img[data-hud-flag]");
      if (img && code2) {
        img.src = "https://flagcdn.com/w40/" + String(code2).toLowerCase() + ".png";
        img.alt = iso;
      }
    } catch (e) {}
  }

  // Patch applySyncPayload if present by wrapping hostPushSync consumers via interval for clients
  setInterval(function () {
    try {
      if (mpActive() && !isHost()) {
        forceHudDate();
        forcePlayerFlag();
      }
    } catch (e) {}
  }, 500);

  // Also after any sync - wrap refreshMapColors lightly
  (function hookSyncHud() {
    if (window._v11SyncHud) return;
    window._v11SyncHud = true;
    const prev = window.refreshMapColors;
    if (typeof prev !== "function") return;
    window.refreshMapColors = function () {
      const r = prev.apply(this, arguments);
      try { forceHudDate(); forcePlayerFlag(); } catch (e) {}
      return r;
    };
  })();

  // ---------- 4) DISABLE Fog of War ----------
  window.FOG_ENABLED = false;
  try {
    if (typeof canSeeProvince === "function") {
      window.canSeeProvince = function () { return true; };
    }
  } catch (e) {}
  // Strip fog class on next paint
  setTimeout(function () {
    try {
      document.querySelectorAll(".prov-fog").forEach(el => {
        el.classList.remove("prov-fog");
        el.removeAttribute("data-fog");
      });
      if (typeof refreshMapColors === "function") refreshMapColors();
    } catch (e) {}
  }, 800);

  // ---------- 5) DISABLE map mode extras (keep political only) ----------
  window.setMapMode = function (mode) {
    GameState.mapMode = "political";
    try {
      document.querySelectorAll(".map-mode-btn, #master-map-modes").forEach(el => {
        if (el.id === "master-map-modes") el.style.display = "none";
        else el.classList.add("hidden");
      });
    } catch (e) {}
    try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
  };
  setTimeout(function () {
    try {
      const bar = document.getElementById("master-map-modes");
      if (bar) bar.style.display = "none";
      document.querySelectorAll(".map-mode-btn").forEach(b => b.style.display = "none");
    } catch (e) {}
  }, 600);

  // ---------- 6) Thinner province borders ----------
  (function thinBorders() {
    if (window._v11Thin) return;
    window._v11Thin = true;
    const prev = window.refreshMapColors;
    if (typeof prev !== "function") return;
    window.refreshMapColors = function () {
      const r = prev.apply(this, arguments);
      try {
        d3.selectAll(".country-path").each(function () {
          const path = d3.select(this);
          const name = path.attr("data-name");
          if (!name) return;
          const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : null;
          let isBorder = false;
          try {
            const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
            const nbs = (PD[name] && PD[name].neighbors) || [];
            for (let i = 0; i < nbs.length; i++) {
              const o2 = (typeof provinceOwners !== "undefined") ? provinceOwners[nbs[i]] : null;
              if (o2 && o2 !== owner) { isBorder = true; break; }
            }
          } catch (e) {}
          if (isBorder) {
            path.style("stroke", "rgba(0,0,0,0.45)").style("stroke-width", 0.12);
          } else {
            path.style("stroke", "rgba(0,0,0,0.12)").style("stroke-width", 0.012);
          }
        });
      } catch (e) {}
      return r;
    };
  })();

  // ---------- 7) Country picker (list + name search, no raw ISO prompts) ----------
  function countryOptionsHtml(selected) {
    const list = Object.keys(GameState.countries || {}).map(iso => {
      const c = GameState.countries[iso];
      return { iso, name: (c && c.name) || iso };
    }).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return list.map(x => `<option value="${x.iso}" ${x.iso === selected ? "selected" : ""}>${x.name}</option>`).join("");
  }

  window.scPickCountry = function (onPicked) {
    let modal = document.getElementById("sc-country-picker");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "sc-country-picker";
      modal.className = "fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4";
      modal.innerHTML = `
        <div class="bg-[#121810] border border-[#2a3a28] rounded-lg w-full max-w-sm p-4 space-y-3 shadow-xl">
          <div class="text-sm font-bold text-[#c4a35a] uppercase tracking-wider">Ülke Seç</div>
          <input id="sc-country-search" type="search" placeholder="İsim ara..." class="w-full bg-[#0c100c] border border-[#2a3a28] rounded px-2 py-2 text-sm text-[#d8dcc8]" />
          <select id="sc-country-list" size="12" class="w-full bg-[#0c100c] border border-[#2a3a28] rounded px-2 py-1 text-sm text-[#d8dcc8] h-56"></select>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="sc-country-cancel" class="py-2 border border-slate-600 rounded text-xs font-bold">İptal</button>
            <button type="button" id="sc-country-ok" class="py-2 border border-cyan-700 bg-cyan-950/40 rounded text-xs font-bold">Seç</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    const sel = modal.querySelector("#sc-country-list");
    const search = modal.querySelector("#sc-country-search");
    const fill = () => {
      const q = (search.value || "").toLowerCase();
      const all = Object.keys(GameState.countries || {}).map(iso => ({ iso, name: GameState.countries[iso].name || iso }))
        .filter(x => !q || x.name.toLowerCase().includes(q) || x.iso.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
      sel.innerHTML = all.map(x => `<option value="${x.iso}">${x.name}</option>`).join("");
    };
    fill();
    search.oninput = fill;
    modal.classList.remove("hidden");
    modal.querySelector("#sc-country-cancel").onclick = () => modal.classList.add("hidden");
    modal.querySelector("#sc-country-ok").onclick = () => {
      const iso = sel.value;
      modal.classList.add("hidden");
      if (iso && typeof onPicked === "function") onPicked(iso);
    };
  };

  // Replace ISO prompts for agents
  window.deployAgent = function (targetIso) {
    const run = (iso) => {
      if (!iso || iso === GameState.player) return;
      const p = GameState.countries[GameState.player];
      if (!p) return;
      const cost = 35;
      if ((p.pp || 0) < cost && (p.money || 0) < 200) {
        if (typeof log === "function") log("Ajan için PP veya para yetersiz.", "text-red-400");
        return;
      }
      if ((p.pp || 0) >= cost) p.pp -= cost; else p.money -= 200;
      GameState.intel = GameState.intel || { agents: {}, networks: {}, decryption: {}, ops: [] };
      const id = GameState.player + "_" + iso;
      GameState.intel.agents[id] = { from: GameState.player, to: iso, progress: 0, network: 0, mission: "build_network" };
      if (typeof log === "function") log("Ajan görevlendirildi: " + (GameState.countries[iso]?.name || iso), "text-violet-300");
      try { if (typeof renderIntelPanel === "function") renderIntelPanel(); } catch (e) {}
    };
    if (targetIso) run(targetIso);
    else window.scPickCountry(run);
  };

  // ---------- 8) Log panel → bottom-right, thinner ----------
  function relocateLogPanel() {
    const panel = document.getElementById("log-panel");
    if (!panel) return;
    panel.className = "fixed bottom-2 right-2 z-[90] w-[min(280px,42vw)] h-[88px] bg-[#030712]/92 backdrop-blur-sm p-1.5 rounded-md border border-slate-800 flex flex-col justify-end overflow-hidden pointer-events-none shadow-lg";
    panel.style.left = "auto";
    panel.style.transform = "none";
    const title = panel.querySelector("div");
    if (title && title.textContent && /günlük/i.test(title.textContent)) {
      title.className = "text-[8px] text-slate-500 font-bold tracking-widest uppercase mb-0.5 pointer-events-none text-right";
    }
    const content = document.getElementById("log-content");
    if (content) content.className = "overflow-y-auto font-mono text-[10px] leading-tight flex flex-col justify-end gap-0.5 scrollbar-none pointer-events-auto";
  }
  setTimeout(relocateLogPanel, 300);
  setTimeout(relocateLogPanel, 1500);

  // ---------- 9) Open rooms + maxPlayers (host PC as dedicated) ----------
  const ROOM_LS_KEY = "sc_open_rooms_v1";
  if (GameState.mp) {
    GameState.mp.maxPlayers = GameState.mp.maxPlayers || 6;
  }

  function loadRoomList() {
    try { return JSON.parse(localStorage.getItem(ROOM_LS_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveRoomList(list) {
    try { localStorage.setItem(ROOM_LS_KEY, JSON.stringify((list || []).slice(0, 24))); } catch (e) {}
  }
  window.mpAnnounceRoom = function () {
    const _ok = (typeof mpActive === "function" ? mpActive() : (GameState.mp && GameState.mp.active))
      && (typeof isHost === "function" ? isHost() : (GameState.mp && GameState.mp.isHost));
    if (!_ok || !GameState.mp || !GameState.mp.roomCode) {
      try { if (typeof showToast === "function") showToast("Önce oda kur", "bad"); } catch (e) {}
      return;
    }
    const list = loadRoomList().filter(r => r.code !== GameState.mp.roomCode);
    list.unshift({
      code: GameState.mp.roomCode,
      name: GameState.mp.name || "Host",
      scenario: GameState.mp.scenario || "modern",
      players: Object.keys(GameState.mp.players || {}).length,
      maxPlayers: GameState.mp.maxPlayers || 6,
      ts: Date.now()
    });
    saveRoomList(list);
    try { if (typeof showToast === "function") showToast("Oda açık listeye yazıldı", "good"); } catch (e) {}
    renderOpenRooms();
  };

  window.mpSetMaxPlayers = function (n) {
    n = Math.max(2, Math.min(12, parseInt(n, 10) || 6));
    if (GameState.mp) GameState.mp.maxPlayers = n;
    const el = document.getElementById("mp-max-players");
    if (el) el.value = String(n);
    if (isHost()) {
      try { if (typeof broadcast === "function") broadcast({ t: "sys", text: "Maks oyuncu: " + n }); } catch (e) {}
      window.mpAnnounceRoom();
    }
  };

  // Enforce max players on host join path via periodic check
  setInterval(function () {
    try {
      if (!mpActive() || !isHost() || !GameState.mp) return;
      const max = GameState.mp.maxPlayers || 6;
      const ids = Object.keys(GameState.mp.players || {});
      if (ids.length > max) {
        // kick latest non-host
        const hostId = GameState.mp.peerId;
        const extra = ids.filter(id => id !== hostId).slice(max - 1);
        extra.forEach(id => {
          try {
            const conn = GameState.mp.conns[id];
            if (conn) conn.close();
            delete GameState.mp.players[id];
          } catch (e) {}
        });
      }
    } catch (e) {}
  }, 3000);

  window.renderOpenRooms = function () {
    const box = document.getElementById("mp-open-rooms");
    if (!box) return;
    const list = loadRoomList().filter(r => Date.now() - (r.ts || 0) < 1000 * 60 * 60 * 6);
    if (!list.length) {
      box.innerHTML = '<div class="text-[10px] text-slate-500 p-2">Açık oda yok. Host “Odayı Listele” desin veya kod ile katıl.</div>';
      return;
    }
    box.innerHTML = list.map(r => `
      <button type="button" onclick="mpJoinFromList('${r.code}')" class="w-full text-left px-2 py-2 mb-1 rounded border border-slate-700 bg-slate-900/80 hover:border-cyan-600 text-[11px]">
        <span class="font-bold text-cyan-300 font-mono">${r.code}</span>
        <span class="text-slate-400 ml-2">${r.name || "Host"}</span>
        <span class="float-right text-slate-500">${r.players || 1}/${r.maxPlayers || 6}</span>
      </button>`).join("");
  };

  window.mpJoinFromList = function (code) {
    const input = document.getElementById("mp-join-code") || document.getElementById("mp-room-code-input");
    if (input) input.value = code;
    try {
      if (typeof mpJoinRoom === "function") mpJoinRoom(code);
      else if (typeof window.mpJoinRoom === "function") window.mpJoinRoom(code);
    } catch (e) {
      try { if (typeof showToast === "function") showToast("Katılım: " + code, "info"); } catch (e2) {}
    }
  };

  // ---------- 10) UI: speed controls + open rooms + max players + country select ----------
  function ensureMpUiFixes() {
    // Speed bar on mp-hud
    let hud = document.getElementById("mp-hud");
    if (hud && !document.getElementById("mp-speed-bar")) {
      const bar = document.createElement("div");
      bar.id = "mp-speed-bar";
      bar.className = "flex flex-wrap gap-1 items-center mt-1";
      bar.innerHTML = `
        <span class="text-[9px] text-slate-500 uppercase font-bold">Hız</span>
        <button type="button" onclick="mpOpenSpeedVote(0)" class="px-1.5 py-0.5 text-[10px] border border-slate-600 rounded">❚❚</button>
        <button type="button" onclick="mpOpenSpeedVote(1)" class="px-1.5 py-0.5 text-[10px] border border-slate-600 rounded">1×</button>
        <button type="button" onclick="mpOpenSpeedVote(2)" class="px-1.5 py-0.5 text-[10px] border border-slate-600 rounded">2×</button>
        <button type="button" onclick="mpOpenSpeedVote(3)" class="px-1.5 py-0.5 text-[10px] border border-slate-600 rounded">3×</button>
        <span class="text-[9px] text-slate-600">Host onaylar</span>`;
      hud.appendChild(bar);
    }

    // Lobby extras
    const lobby = document.getElementById("lobby-screen") || document.getElementById("mp-lobby-panel");
    const hostPanel = document.getElementById("mp-room-info") || lobby;
    if (hostPanel && !document.getElementById("mp-max-players")) {
      const wrap = document.createElement("div");
      wrap.className = "mt-2 p-2 rounded border border-slate-700 bg-slate-950/50 space-y-2";
      wrap.innerHTML = `
        <div class="text-[10px] font-bold text-slate-400 uppercase">Oda ayarları (Host)</div>
        <label class="text-[10px] flex items-center gap-2">Maks oyuncu
          <input id="mp-max-players" type="number" min="2" max="12" value="6" class="w-14 bg-slate-900 border border-slate-600 rounded px-1 py-0.5" onchange="mpSetMaxPlayers(this.value)" />
        </label>
        <button type="button" onclick="mpAnnounceRoom()" class="w-full py-1.5 text-[10px] font-bold border border-cyan-800 bg-cyan-950/30 rounded">Odayı Açık Listeye Yaz</button>
        <div class="text-[10px] font-bold text-slate-400 uppercase pt-1">Açık odalar</div>
        <div id="mp-open-rooms" class="max-h-28 overflow-y-auto"></div>
        <button type="button" onclick="renderOpenRooms()" class="text-[10px] text-cyan-500 underline">Yenile</button>`;
      hostPanel.appendChild(wrap);
      renderOpenRooms();
    }

    // Ensure country selects use names
    ["mp-player-country", "lobby-country-select"].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.tagName !== "SELECT") return;
      if (el.getAttribute("data-v11-named")) return;
      const cur = el.value;
      el.innerHTML = countryOptionsHtml(cur);
      el.setAttribute("data-v11-named", "1");
    });

    // Intel button text fix
    try {
      document.querySelectorAll("#master-intel-panel button").forEach(b => {
        if (/Hedef ISO|prompt/i.test(b.getAttribute("onclick") || "")) {
          b.setAttribute("onclick", "deployAgent()");
          b.textContent = "Ajan Gönder (listeden)";
        }
      });
    } catch (e) {}
  }

  setTimeout(ensureMpUiFixes, 500);
  setTimeout(ensureMpUiFixes, 2000);

  // Default slower SP start if still 800
  if (!mpActive() && GameState.speed && GameState.speed < 1200) {
    // leave SP alone somewhat; only MP forced slow
  }

  // When host starts MP game, force 1× slow clock
  (function hookMpStart() {
    const names = ["mpStartGame", "startMultiplayerGame", "mpLaunch"];
    names.forEach(n => {
      if (typeof window[n] !== "function") return;
      const prev = window[n];
      window[n] = function () {
        const r = prev.apply(this, arguments);
        try {
          if (isHost()) applyHostSpeed(1);
          if (isHost()) window.mpAnnounceRoom();
        } catch (e) {}
        return r;
      };
    });
  })();

  // Patch: client must update date from last sync string on mp-hud
  setInterval(forceHudDate, 1000);

  console.log("[v1.1] MP slow clock · host vote · client date · FoW off · thin borders · open rooms");
})();

(function SC_v11_WireVotes() {
  "use strict";
  // Monkey-patch Peer connect data for hosts that already wired conns
  function tryPatch() {
    if (!GameState.mp || !GameState.mp.isHost) return;
    const conns = GameState.mp.conns || {};
    Object.keys(conns).forEach(id => {
      const c = conns[id];
      if (!c || c._v11patched) return;
      c._v11patched = true;
      const prev = c.on;
      // PeerJS EventEmitter - listen additional data
      try {
        c.on("data", function (raw) {
          let msg = raw;
          try { if (typeof raw === "string") msg = JSON.parse(raw); } catch (e) {}
          if (msg && msg.t === "speedVote" && typeof window.mpTallySpeedVote === "function") {
            window.mpTallySpeedVote(id, msg.level);
          }
          if (msg && msg.t === "join" && GameState.mp) {
            const max = GameState.mp.maxPlayers || 6;
            const n = Object.keys(GameState.mp.players || {}).length;
            if (n > max) {
              try { c.send(JSON.stringify({ t: "sys", text: "Oda dolu" })); c.close(); } catch (e) {}
            }
          }
        });
      } catch (e) {}
    });
  }
  setInterval(tryPatch, 1500);
})();

// ============================================================
// v1.1.1 STABILITY — played & patched after live browser smoke test
// ============================================================
(function SCStability111() {
  try {
    if (localStorage.getItem("sc_tutorial_v111") !== "1") {
      localStorage.setItem("sc_tutorial_done", "1");
      localStorage.setItem("sc_tutorial_v111", "1");
    }
  } catch (e) {}

  "use strict";

  // Tutorial: never soft-lock the menu
  try {
    const prev = window.maybeShowTutorial;
    window.maybeShowTutorial = function () {
      try {
        if (localStorage.getItem("sc_tutorial_done") === "1") return;
      } catch (e) {}
      try {
        if (typeof prev === "function") prev();
      } catch (e) {
        console.warn("[tutorial]", e);
      }
      // Auto-bind buttons if present but handlers failed
      setTimeout(() => {
        const ok = document.getElementById("sc-tut-ok");
        const never = document.getElementById("sc-tut-never");
        const m = document.getElementById("sc-tutorial");
        const kill = () => {
          try { localStorage.setItem("sc_tutorial_done", "1"); } catch (e) {}
          if (m) m.remove();
        };
        if (ok) ok.onclick = kill;
        if (never) never.onclick = kill;
        // click outside to close
        if (m && !m._scBound) {
          m._scBound = true;
          m.addEventListener("click", function (ev) {
            if (ev.target === m) kill();
          });
        }
      }, 50);
    };
  } catch (e) {}

  // gameTick: never throw to top — swallow after log
  (function hardenTick() {
    const prev = window.gameTick;
    if (typeof prev !== "function") return;
    window.gameTick = function () {
      try {
        return prev.apply(this, arguments);
      } catch (e) {
        console.warn("[gameTick]", e && e.message ? e.message : e);
      }
    };
  })();

  // updateHUD harden
  (function hardenHUD() {
    const prev = window.updateHUD;
    if (typeof prev !== "function") return;
    window.updateHUD = function () {
      try { return prev.apply(this, arguments); }
      catch (e) { console.warn("[updateHUD]", e && e.message ? e.message : e); }
    };
  })();

  // refreshMapColors harden
  (function hardenMap() {
    const prev = window.refreshMapColors;
    if (typeof prev !== "function") return;
    window.refreshMapColors = function () {
      try { return prev.apply(this, arguments); }
      catch (e) { console.warn("[map]", e && e.message ? e.message : e); }
    };
  })();

  // setText null-safe global
  if (typeof window.setText !== "function") {
    window.setText = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.textContent = val == null ? "" : String(val);
    };
  } else {
    const _st = window.setText;
    window.setText = function (id, val) {
      try {
        const el = document.getElementById(id);
        if (!el) return;
        return _st.call(this, id, val);
      } catch (e) {}
    };
  }

  // startGame: ensure interval only on host / SP
  (function hardenStart() {
    const prev = window.startGame;
    if (typeof prev !== "function") return;
    window.startGame = async function () {
      try {
        const r = await prev.apply(this, arguments);
        try {
          document.getElementById("sc-tutorial")?.remove();
          localStorage.setItem("sc_tutorial_done", "1");
        } catch (e) {}
        return r;
      } catch (e) {
        console.error("[startGame]", e);
        try { if (typeof showToast === "function") showToast("Başlatma hatası — konsolu kontrol et", "bad"); } catch (e2) {}
        throw e;
      }
    };
  })();

  // Country select: ensure lobby select has named options once countries exist
  setInterval(function () {
    try {
      const sel = document.getElementById("lobby-country-select");
      if (!sel || !GameState || !GameState.countries) return;
      if (sel.options.length > 5 && sel.getAttribute("data-named") === "1") return;
      const cur = sel.value;
      const list = Object.keys(GameState.countries).map(iso => ({
        iso, name: GameState.countries[iso].name || iso
      })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
      if (!list.length) return;
      sel.innerHTML = list.map(x => `<option value="${x.iso}">${x.name}</option>`).join("");
      if (cur && GameState.countries[cur]) sel.value = cur;
      sel.setAttribute("data-named", "1");
    } catch (e) {}
  }, 2000);

  // Fix version label after i18n
  setTimeout(function () {
    try {
      document.querySelectorAll("[data-i18n='mm_version']").forEach(el => {
        el.textContent = "v1.1 · Grand Master · Harita 1083";
      });
    } catch (e) {}
  }, 800);

  // FOG stay off
  window.FOG_ENABLED = false;

  console.log("[v1.1.1] stability · tutorial unlock · tick/HUD/map guards");
})();

// ============================================================
// v1.1.2 — bulletproof startGame (fixes "n is not defined" / nested scope)
// ============================================================
(function SCSafeStart() {
  "use strict";

  window.startGame = async function startGameSafe() {
    try {
      try { if (window._mapPackReady) await window._mapPackReady; } catch (e) {}
      try { await loadScenarioPack(); } catch (e) { console.error("scenario pack", e); }

      try { if (window.MusicPlayer && MusicPlayer.start) MusicPlayer.start(); } catch (e) {}
      try { if (typeof sfx !== "undefined" && sfx.playVictory) sfx.playVictory(); } catch (e) {}

      const lobbySelect = document.getElementById("lobby-country-select");
      let iso = (lobbySelect && lobbySelect.value) || GameState.player || "TUR";
      if (!GameState.countries[iso]) {
        const keys = Object.keys(GameState.countries || {});
        iso = keys[0] || "TUR";
      }
      GameState.player = iso;

      const scenSel = document.getElementById("lobby-scenario-select");
      const scenId = (scenSel && scenSel.value) || "modern";
      console.log("[start] scenario", scenId, "player", iso);

      try {
        if (typeof applyScenario === "function") applyScenario(scenId);
      } catch (e) {
        console.error("applyScenario", e);
      }

      const evToggle = document.getElementById("lobby-events-toggle");
      GameState.eventsEnabled = evToggle ? !!evToggle.checked : true;

      try { if (typeof balanceDivisions === "function") balanceDivisions(); } catch (e) {}
      try { if (typeof applyDifficultyModifiers === "function") applyDifficultyModifiers(); } catch (e) {}

      const player = GameState.countries[GameState.player];
      if (!player) {
        console.error("Player country missing", GameState.player);
        try { if (typeof showToast === "function") showToast("Ülke seçilemedi", "bad"); } catch (e) {}
        return;
      }

      const flagEl = document.getElementById("hud-flag");
      if (flagEl && player.flag) {
        flagEl.src = "https://flagcdn.com/w40/" + player.flag + ".png";
      }
      try {
        if (typeof setText === "function") {
          setText("hud-country-name", (typeof getCountryDisplayName === "function") ? getCountryDisplayName(GameState.player) : player.name);
          setText("hud-country-ideology", player.ideology || "");
        }
      } catch (e) {}

      document.getElementById("log-panel")?.classList.remove("hidden");
      document.getElementById("lobby-screen")?.classList.add("hidden");
      document.getElementById("main-menu-screen")?.classList.add("hidden");

      try {
        if (typeof applyCapitalsAndIdentity === "function") applyCapitalsAndIdentity(GameState.scenarioId);
      } catch (e) {}

      GameState.running = true;

      Object.keys(GameState.countries || {}).forEach(id => {
        try {
          if (typeof ensureCivAllocation === "function") ensureCivAllocation(GameState.countries[id]);
          if (!GameState.relations) GameState.relations = {};
          if (GameState.relations[id] == null) GameState.relations[id] = 0;
        } catch (e) {}
      });

      // Single interval only
      if (window.gameTickInterval) {
        try { clearInterval(window.gameTickInterval); } catch (e) {}
      }
      const spd = GameState.speed || 800;
      window.gameTickInterval = setInterval(function () {
        try {
          if (typeof gameTick === "function") gameTick();
        } catch (e) {
          console.warn("[tick]", e);
        }
      }, spd);

      try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
      try {
        if (typeof log === "function") {
          log("SİSTEM: Kabine göreve başladı.", "text-cyan-400");
          log("Senaryo: " + (GameState.scenarioName || scenId) + " · " + (GameState.date ? GameState.date.getFullYear() : ""), "text-cyan-400");
        }
      } catch (e) {}

      setTimeout(function () {
        try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch (e) {}
        try { if (typeof bootV27 === "function") bootV27(); } catch (e) {}
      }, 400);

      try { if (typeof startAutoSave === "function") startAutoSave(); } catch (e) {}

      try {
        localStorage.setItem("sc_tutorial_done", "1");
        document.getElementById("sc-tutorial")?.remove();
      } catch (e) {}

      console.log("[startGameSafe] OK", GameState.player, Object.keys(provinceOwners || {}).length, "provinces");
    } catch (e) {
      console.error("[startGameSafe] FAIL", e);
      try { if (typeof showToast === "function") showToast("Başlatma hatası: " + (e.message || e), "bad"); } catch (e2) {}
    }
  };

  // also bind common start buttons
  document.addEventListener("click", function (ev) {
    const t = ev.target;
    if (!t) return;
    if (t.id === "lobby-start-btn" || (t.getAttribute && t.getAttribute("onclick") && /startGame\(/.test(t.getAttribute("onclick")))) {
      // let native handler run; our window.startGame is already safe
    }
  }, true);

  console.log("[v1.1.2] safe startGame online");
})();


(function(){
  window.scForceHideMenus = function() {
    ["main-menu-screen","lobby-screen","sc-tutorial","credits-modal","mp-lobby-modal"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.setProperty("display", "none", "important");
    });
  };
  // Patch safe start to always force hide
  const prev = window.startGame;
  if (typeof prev === "function") {
    window.startGame = async function() {
      const r = await prev.apply(this, arguments);
      try { scForceHideMenus(); } catch(e) {}
      return r;
    };
  }
  // CSS kill switch
  if (!document.getElementById("sc-force-hide-css")) {
    const s = document.createElement("style");
    s.id = "sc-force-hide-css";
    s.textContent = "#main-menu-screen.hidden,#lobby-screen.hidden{display:none!important;pointer-events:none!important;visibility:hidden!important;}";
    (document.head||document.documentElement).appendChild(s);
  }
  console.log("[v1.1.2] menu hide force");
})();

// ============================================================
// SUPREMACY 1914-STYLE MULTIPLAYER LAYER
// Continuous shared world · free nations · AI fill · newspaper
// ranking · AI takeover · no ready-wall · slow tempo
// ============================================================
(function SCSupremacyMP() {
  "use strict";
  if (typeof GameState === "undefined") return;

  // Supremacy tempos: ms per game-day
  const SUP_TEMPO_MS = { 1: 4500, 2: 2200, 3: 1000 };
  const NEWS_MAX = 40;

  function mp() { return GameState.mp || null; }
  function isHost() {
    try { return typeof mpIsHost === "function" && mpIsHost(); } catch (e) { return !!(mp() && mp().isHost); }
  }
  function active() {
    try { return typeof mpIsActive === "function" && mpIsActive(); } catch (e) { return !!(mp() && mp().active); }
  }

  // ---------- State extensions ----------
  function ensureSupState() {
    const M = mp();
    if (!M) return;
    if (!M.supremacy) {
      M.supremacy = {
        tempo: 1,
        aiFill: true,
        news: [],
        ranking: [],
        claimed: {}, // iso -> peerId or "AI"
        startedAt: 0
      };
    }
    if (!GameState.mpNews) GameState.mpNews = [];
  }

  // ---------- Claimed countries ----------
  function claimedIsos() {
    const M = mp();
    if (!M) return new Set();
    const s = new Set();
    Object.values(M.players || {}).forEach(p => {
      if (p && p.country && !p.spectator) s.add(p.country);
    });
    return s;
  }

  window.mpRefreshCountrySelect = function () {
    const sel = document.getElementById("mp-player-country");
    if (!sel || !GameState.countries) return;
    const taken = claimedIsos();
    // CRITICAL: preserve user's dropdown choice — do NOT force mp().country (default TUR)
    let myIso = sel.value || window.__mpPickedCountry || null;
    if (!myIso || !GameState.countries[myIso]) {
      myIso = (mp() && mp().country && GameState.countries[mp().country]) ? mp().country : "TUR";
    }
    // keep pick memory
    window.__mpPickedCountry = myIso;
    if (mp()) mp().country = myIso;

    const list = Object.keys(GameState.countries)
      .map(iso => ({ iso, name: GameState.countries[iso].name || iso }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const prevFocus = document.activeElement === sel;
    sel.innerHTML = list.map(x => {
      const locked = taken.has(x.iso) && x.iso !== myIso;
      return `<option value="${x.iso}" ${x.iso === myIso ? "selected" : ""} ${locked ? "disabled" : ""}>${x.name}${locked ? " (alınmış)" : ""}</option>`;
    }).join("");
    sel.value = myIso;
    if (!sel._mpBound) {
      sel._mpBound = true;
      sel.addEventListener("change", function () {
        const v = sel.value;
        window.__mpPickedCountry = v;
        if (mp()) {
          mp().country = v;
          if (mp().players && mp().peerId && mp().players[mp().peerId]) {
            mp().players[mp().peerId].country = v;
          }
        }
        // tell host if connected as client
        try {
          if (mp() && mp().active && !mp().isHost && typeof window.mpSendCountryPick === "function") {
            window.mpSendCountryPick(v);
          }
        } catch (e) {}
      });
    }
    // claimed panel
    const box = document.getElementById("mp-claimed-nations");
    if (box) {
      const rows = Object.values((mp() && mp().players) || {})
        .filter(p => p && p.country && !p.spectator)
        .map(p => {
          const nm = (GameState.countries[p.country] && GameState.countries[p.country].name) || p.country;
          return `<div class="flex justify-between gap-1"><span>${nm}</span><span class="text-cyan-600">${p.name || "?"}</span></div>`;
        });
      box.innerHTML = rows.length ? rows.join("") : '<span class="text-slate-600">Henüz ulus seçilmedi</span>';
    }
  };

  // Refresh claimed list only (don't rebuild select while user is picking)
  setInterval(function () {
    try {
      const modal = document.getElementById("mp-lobby-modal");
      if (!modal || modal.classList.contains("hidden")) return;
      const sel = document.getElementById("mp-player-country");
      if (sel && document.activeElement === sel) return; // user open/picking
      mpRefreshCountrySelect();
    } catch (e) {}
  }, 2500);

  // ---------- Tempo ----------
  window.mpSetSupremacyTempo = function (v) {
    ensureSupState();
    const M = mp();
    if (!M) return;
    M.supremacy.tempo = Number(v) || 1;
    if (isHost() && M.gameStarted) {
      applySupremacySpeed(M.supremacy.tempo);
    }
  };

  function applySupremacySpeed(tempo) {
    const ms = SUP_TEMPO_MS[tempo] || SUP_TEMPO_MS[1];
    GameState.speed = ms;
    if (!isHost() && active()) return; // clients don't tick
    if (window.gameTickInterval) {
      try { clearInterval(window.gameTickInterval); } catch (e) {}
    }
    GameState.running = true;
    window.gameTickInterval = setInterval(function () {
      try {
        if (typeof gameTick === "function") gameTick();
        if (active() && isHost() && typeof hostPushSync === "function") hostPushSync();
      } catch (e) {
        console.warn("[SUP tick]", e);
      }
    }, ms);
    try {
      if (typeof broadcast === "function") broadcast({ t: "speed", level: tempo });
    } catch (e) {}
    // map level for HUD
    if (mp()) mp().speedLevel = tempo;
  }

  // ---------- Newspaper / news ----------
  window.mpPushNews = function (text, kind) {
    ensureSupState();
    const entry = {
      text: String(text).slice(0, 160),
      kind: kind || "info",
      day: GameState.date ? GameState.date.toISOString().slice(0, 10) : "",
      ts: Date.now()
    };
    GameState.mpNews = GameState.mpNews || [];
    GameState.mpNews.unshift(entry);
    if (GameState.mpNews.length > NEWS_MAX) GameState.mpNews.length = NEWS_MAX;
    if (mp() && mp().supremacy) {
      mp().supremacy.news = GameState.mpNews.slice(0, 20);
    }
    renderSupremacyNews();
    if (isHost()) {
      try {
        if (typeof broadcast === "function") broadcast({ t: "news", entry: entry });
      } catch (e) {}
    }
  };

  function renderSupremacyNews() {
    const box = document.getElementById("sup-news-ticker");
    if (!box) return;
    const news = GameState.mpNews || [];
    if (!news.length) {
      box.innerHTML = '<span class="text-slate-600">Dünya sessiz…</span>';
      return;
    }
    box.innerHTML = news.slice(0, 8).map(n =>
      `<div class="text-[10px] border-b border-slate-800/80 py-0.5"><span class="text-slate-500 font-mono">${n.day || ""}</span> ${escapeHtmlSup(n.text)}</div>`
    ).join("");
  }

  function escapeHtmlSup(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Ranking HUD ----------
  function computeRanking() {
    const humans = Object.values((mp() && mp().players) || {}).filter(p => p && p.country && !p.spectator);
    const rows = humans.map(p => {
      const iso = p.country;
      const c = GameState.countries[iso] || {};
      const provs = Object.values(provinceOwners || {}).filter(o => o === iso).length;
      const divs = Object.values(c.divisions || {}).reduce((a, b) => a + (b || 0), 0);
      const score = provs * 3 + divs * 2 + Math.floor((c.money || 0) / 500);
      return { name: p.name, iso, provs, divs, score, ai: !!p.ai };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  function renderRanking() {
    const box = document.getElementById("sup-ranking");
    if (!box) return;
    const rows = computeRanking();
    box.innerHTML = rows.map((r, i) =>
      `<div class="flex justify-between gap-1 text-[10px] ${r.ai ? "text-slate-500" : "text-slate-300"}">
        <span>${i + 1}. ${r.name} <span class="text-slate-600">(${r.iso})</span></span>
        <span class="font-mono text-amber-500/90">${r.score}</span>
      </div>`
    ).join("") || '<span class="text-slate-600 text-[10px]">—</span>';
  }

  // ---------- AI takeover ----------
  function markPlayerAI(peerId, reason) {
    const M = mp();
    if (!M || !M.players[peerId]) return;
    const p = M.players[peerId];
    p.ai = true;
    p.ready = true;
    mpPushNews((p.name || "Oyuncu") + " bağlantısı koptu — " + (GameState.countries[p.country]?.name || p.country) + " AI kontrolünde.", "warn");
    try {
      if (typeof broadcast === "function") broadcast({ t: "players", players: M.players });
      if (typeof mpSysChat === "function") {
        // sys via host chat
      }
    } catch (e) {}
  }

  // Hook host conn close — already deletes player; instead convert to AI
  (function hookDisconnectAI() {
    if (window._supDiscHook) return;
    window._supDiscHook = true;
    // periodic: if game started and a human slot missing country owner still on map, ensure AI flag
    setInterval(function () {
      try {
        if (!active() || !isHost()) return;
        const M = mp();
        if (!M || !M.gameStarted) return;
        Object.values(M.players || {}).forEach(p => {
          if (!p || p.spectator) return;
          // stale connections already removed; AI flags handled on close patch below
        });
        renderRanking();
      } catch (e) {}
    }, 4000);
  })();

  // Patch: on host, when conn closes during game → AI not delete
  (function patchConnClose() {
    const iv = setInterval(function () {
      const M = mp();
      if (!M || !M.isHost) return;
      Object.keys(M.conns || {}).forEach(id => {
        const c = M.conns[id];
        if (!c || c._supAIHook) return;
        c._supAIHook = true;
        c.on("close", function () {
          try {
            if (M.gameStarted && M.players[id] && !M.players[id].spectator) {
              markPlayerAI(id, "disconnect");
              // keep player entry
            } else {
              delete M.players[id];
            }
            delete M.conns[id];
            try { if (typeof mpRenderLobbyList === "function") mpRenderLobbyList(); } catch (e) {}
            try { if (typeof broadcast === "function") broadcast({ t: "players", players: M.players }); } catch (e) {}
          } catch (e) {}
        });
      });
    }, 1200);
    void iv;
  })();

  // ---------- Host start (Supremacy — no ready wall) ----------
  window.mpHostStartSupremacy = function () {
    if (!active() || !isHost()) {
      try { if (typeof showToast === "function") showToast("Sadece host başlatır", "bad"); } catch (e) {}
      return;
    }
    ensureSupState();
    const M = mp();
    const tempoEl = document.getElementById("mp-sup-tempo");
    const aiFillEl = document.getElementById("mp-ai-fill");
    const scenEl = document.getElementById("mp-scenario");
    M.supremacy.tempo = Number(tempoEl && tempoEl.value) || 1;
    M.supremacy.aiFill = !aiFillEl || aiFillEl.checked;
    M.scenario = (scenEl && scenEl.value) || M.scenario || "modern";
    M.gameStarted = true;
    M.supremacy.startedAt = Date.now();

    // Sync country from select for host
    const sel = document.getElementById("mp-player-country");
    if (sel && sel.value) {
      M.country = sel.value;
      if (M.players[M.peerId]) M.players[M.peerId].country = sel.value;
      GameState.player = sel.value;
    }

    // Apply scenario & boot game for host
    const boot = async function () {
      try {
        if (typeof loadScenarioPack === "function") await loadScenarioPack();
      } catch (e) {}
      try {
        if (typeof applyScenario === "function") applyScenario(M.scenario);
      } catch (e) { console.warn(e); }

      // Start SP-like systems under host authority
      try {
        if (typeof window.startGame === "function") {
          // ensure selects
          const ls = document.getElementById("lobby-country-select");
          if (ls) ls.value = M.country || "TUR";
          const ss = document.getElementById("lobby-scenario-select");
          if (ss) ss.value = M.scenario || "modern";
          await window.startGame();
        }
      } catch (e) {
        console.warn("[SUP] startGame", e);
      }

      GameState.player = M.country || GameState.player;
      applySupremacySpeed(M.supremacy.tempo);

      // Broadcast start
      try {
        if (typeof broadcast === "function") {
          broadcast({
            t: "start",
            scenario: M.scenario,
            tempo: M.supremacy.tempo,
            players: M.players,
            date: GameState.date ? GameState.date.toISOString() : null
          });
        }
      } catch (e) {}

      mpPushNews("Dünya savaşı/barış çağı başladı. Tempo: " + M.supremacy.tempo + "×", "sys");
      ensureSupremacyHUD();
      try { if (typeof scForceHideMenus === "function") scForceHideMenus(); } catch (e) {}
      document.getElementById("mp-lobby-modal")?.classList.add("hidden");
      document.getElementById("mp-lobby-modal")?.style.setProperty("display", "none", "important");

      if (typeof hostPushSync === "function") {
        if (M.syncIv) clearInterval(M.syncIv);
        M.syncIv = setInterval(hostPushSync, 1000);
        hostPushSync();
      }
      console.log("[SUP] world started", M.scenario, M.country);
    };
    boot();
  };

  // Client receives start — already handled by mpBeginGame; enhance tempo
  (function hookClientStart() {
    if (window._supStartHook) return;
    window._supStartHook = true;
    // When applySync runs, refresh news/ranking
    const prev = window.refreshMapColors;
    if (typeof prev === "function") {
      window.refreshMapColors = function () {
        const r = prev.apply(this, arguments);
        try {
          if (active()) {
            renderRanking();
            renderSupremacyNews();
            paintHumanBorders();
          }
        } catch (e) {}
        return r;
      };
    }
  })();

  // ---------- Visual: human nations thicker border glow ----------
  function paintHumanBorders() {
    try {
      if (!active() || typeof d3 === "undefined") return;
      const humans = new Set(
        Object.values((mp() && mp().players) || {})
          .filter(p => p && p.country && !p.spectator && !p.ai)
          .map(p => p.country)
      );
      d3.selectAll(".country-path").each(function () {
        const path = d3.select(this);
        const name = path.attr("data-name");
        if (!name) return;
        const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : null;
        if (owner && humans.has(owner)) {
          path.attr("data-human", "1");
        } else {
          path.attr("data-human", "0");
        }
      });
    } catch (e) {}
  }

  // ---------- HUD injection ----------
  function ensureSupremacyHUD() {
    if (document.getElementById("sup-hud")) return;
    const hud = document.createElement("div");
    hud.id = "sup-hud";
    hud.className = "fixed top-12 right-2 z-[85] w-[min(220px,46vw)] space-y-2 pointer-events-auto";
    hud.innerHTML = `
      <div class="rounded border border-[#2a3a28] bg-[#0c100c]/92 backdrop-blur-sm p-2 shadow-lg">
        <div class="text-[9px] font-black uppercase tracking-wider text-[#c4a35a] mb-1">Sıralama</div>
        <div id="sup-ranking" class="space-y-0.5"></div>
        <div class="mt-2 flex flex-wrap gap-1">
          <button type="button" onclick="mpOpenSpeedVote(0)" class="px-1.5 py-0.5 text-[9px] border border-slate-600 rounded">❚❚</button>
          <button type="button" onclick="mpSetSupremacyTempo(1);mpOpenSpeedVote(1)" class="px-1.5 py-0.5 text-[9px] border border-slate-600 rounded">Yavaş</button>
          <button type="button" onclick="mpSetSupremacyTempo(2);mpOpenSpeedVote(2)" class="px-1.5 py-0.5 text-[9px] border border-slate-600 rounded">Normal</button>
          <button type="button" onclick="mpSetSupremacyTempo(3);mpOpenSpeedVote(3)" class="px-1.5 py-0.5 text-[9px] border border-slate-600 rounded">Hızlı</button>
        </div>
      </div>
      <div class="rounded border border-[#2a3a28] bg-[#0c100c]/92 backdrop-blur-sm p-2 shadow-lg max-h-36 overflow-y-auto">
        <div class="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Dünya Gazetesi</div>
        <div id="sup-news-ticker" class="space-y-0.5 text-slate-400"></div>
      </div>
      <button type="button" onclick="mpOpenChat()" class="w-full py-1.5 text-[10px] font-bold border border-[#2a3a28] bg-[#151c14] rounded">Sohbet</button>
    `;
    document.body.appendChild(hud);
    renderRanking();
    renderSupremacyNews();
  }

  // Show host opts when room created
  (function hookCreateUI() {
    const prev = window.mpCreateRoom;
    if (typeof prev !== "function") return;
    window.mpCreateRoom = function () {
      const r = prev.apply(this, arguments);
      setTimeout(function () {
        document.getElementById("mp-host-opts")?.classList.remove("hidden");
        document.getElementById("mp-start-btn")?.classList.remove("hidden");
        ensureSupState();
        mpRefreshCountrySelect();
        try { if (typeof mpAnnounceRoom === "function") mpAnnounceRoom(); } catch (e) {}
      }, 800);
      return r;
    };
  })();

  // On join, refresh countries
  (function hookJoinUI() {
    const prev = window.mpJoinRoom;
    if (typeof prev !== "function") return;
    window.mpJoinRoom = function (code) {
      // read country from select
      const sel = document.getElementById("mp-player-country");
      if (sel && sel.value && mp()) {
        mp().country = sel.value;
      }
      const r = prev.apply(this, arguments);
      setTimeout(mpRefreshCountrySelect, 1000);
      return r;
    };
  })();

  // Diplomacy news hooks
  (function hookWarNews() {
    const prev = window.declareWar;
    if (typeof prev !== "function") return;
    window.declareWar = function (targetIso) {
      const r = prev.apply(this, arguments);
      try {
        if (active()) {
          const a = GameState.countries[GameState.player]?.name || GameState.player;
          const b = GameState.countries[targetIso]?.name || targetIso;
          mpPushNews(a + " → " + b + " savaş ilan etti!", "war");
        }
      } catch (e) {}
      return r;
    };
  })();

  // Client: handle news message
  (function hookNewsMsg() {
    setInterval(function () {
      // ranking refresh
      if (active() && document.getElementById("sup-hud")) {
        renderRanking();
      }
    }, 5000);
  })();

  // When game already running and MP becomes active mid-session
  setInterval(function () {
    try {
      if (active() && (mp() && mp().gameStarted) && !document.getElementById("sup-hud")) {
        ensureSupremacyHUD();
      }
    } catch (e) {}
  }, 2000);

  // Lobby open → fill country list
  (function hookMainMP() {
    const prev = window.mainMenuMultiplayer;
    window.mainMenuMultiplayer = function () {
      if (typeof prev === "function") prev.apply(this, arguments);
      else {
        document.getElementById("main-menu-screen")?.classList.add("hidden");
        document.getElementById("mp-lobby-modal")?.classList.remove("hidden");
      }
      const modal = document.getElementById("mp-lobby-modal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.style.removeProperty("display");
      }
      setTimeout(function () {
        mpRefreshCountrySelect();
        try { if (typeof renderOpenRooms === "function") renderOpenRooms(); } catch (e) {}
      }, 200);
    };
  })();

  // Enhance mpRenderLobbyList labels with AI badge
  (function hookList() {
    const prev = window.mpRenderLobbyList;
    // if engine defines internal only, build our renderer
    window.mpRenderLobbyList = function () {
      try { if (typeof prev === "function") prev(); } catch (e) {}
      const box = document.getElementById("mp-player-list");
      if (!box) return;
      const M = mp();
      if (!M) return;
      const rows = Object.values(M.players || {});
      if (!rows.length) {
        box.innerHTML = '<div class="text-slate-600 text-[10px]">Oyuncu yok</div>';
        return;
      }
      box.innerHTML = rows.map(p => {
        const nation = (GameState.countries[p.country] && GameState.countries[p.country].name) || p.country || "—";
        const badge = p.spectator ? "👁️" : (p.ai ? "🤖 AI" : "👤");
        const host = p.id === M.peerId && M.isHost ? " ★" : "";
        return `<div class="flex justify-between items-center gap-1 text-[11px] border-b border-slate-800/50 py-1">
          <span>${badge} <b>${escapeHtmlSup(p.name || "?")}</b>${host}</span>
          <span class="text-slate-500">${escapeHtmlSup(nation)}</span>
        </div>`;
      }).join("");
      mpRefreshCountrySelect();
    };
  })();

  // CSS for human provinces
  if (typeof document !== "undefined") {
    const s = document.createElement("style");
    s.textContent = `
      .country-path[data-human="1"] { stroke: rgba(251,191,36,0.55) !important; stroke-width: 0.22px !important; }
      #sup-hud button:active { transform: scale(0.97); }
      #mp-lobby-modal { backdrop-filter: blur(4px); }
    `;
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
    if (document.readyState !== "loading") document.head.appendChild(s);
  }

  console.log("[MP] continuous world · AI fill · newspaper · ranking");
})();

// ============================================================
// PLAYABLE FIX — map redraw + menu nuclear hide + SP smoke path


// ===== SC CORE WINDOW BRIDGE (for split modules) =====
(function SCCoreBridge() {
  try {
    if (typeof GameState !== "undefined") window.GameState = GameState;
    if (typeof provinceOwners !== "undefined") window.provinceOwners = provinceOwners;
  } catch (e) {}
  var names = [
    "gameTick","switchTab","toggleSidebar","startGame","declareWar","startJustification",
    "buildFactory","trainDivision","updateHUD","log","handleProvinceClick","applyScenario",
    "loadScenarioPack","processAITick","processRandomEvents","refreshMapColors","renderProvincePanel",
    "renderDiplomacyTab","mpSetLobbyInRoom","mpHostStart","showToast","pushInboxMessage"
  ];
  names.forEach(function (n) {
    try {
      if (typeof window[n] === "undefined" && typeof eval(n) !== "undefined") {
        // eval name in scope
      }
    } catch (e) {}
    try {
      var fn = null;
      try { fn = eval(n); } catch (e2) { fn = null; }
      if (typeof fn === "function" && typeof window[n] !== "function") window[n] = fn;
    } catch (e) {}
  });
  // Prefer already-assigned window.startGame wrappers
  try { if (typeof switchTab === "function") window.switchTab = switchTab; } catch (e) {}
  try { if (typeof toggleSidebar === "function") window.toggleSidebar = toggleSidebar; } catch (e) {}
  try { if (typeof gameTick === "function") window.gameTick = gameTick; } catch (e) {}
  try { if (typeof updateHUD === "function") window.updateHUD = updateHUD; } catch (e) {}
  try { if (typeof log === "function") window.log = log; } catch (e) {}
  console.log("[core-bridge] window exports ready");
})();
