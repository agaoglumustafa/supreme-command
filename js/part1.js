
// ========== DİNAMİK MÜZİK ÇALAR (assets/audio/*.ogg) — 404 güvenli ==========
const MusicPlayer = {
    audio: null,
    tracks: [],
    index: 0,
    started: false,
    silentMode: false,
    _errCount: 0,
    _silentNotified: false,
    volume: 0.45,
    basePath: "./assets/audio/",
    defaultTracks: [
        "theme_01.ogg",
        "theme_02.ogg",
        "march_01.ogg",
        "ambient_01.ogg",
        "war_theme.ogg",
        "diplomacy.ogg"
    ],
    async init() {
        try {
            const r = await fetch(this.basePath + "playlist.json", { cache: "no-store" });
            if (r.ok) {
                const data = await r.json();
                if (Array.isArray(data.tracks) && data.tracks.length) {
                    this.tracks = data.tracks.map(f => (typeof f === "string" && f.endsWith(".ogg")) ? f : String(f) + ".ogg");
                }
            }
        } catch (e) {
            /* playlist yok — defaultTracks kullanılacak */
        }
        if (!this.tracks.length) this.tracks = this.defaultTracks.slice();
        try {
            this.audio = new Audio();
            this.audio.preload = "none";
            this.audio.volume = this.volume;
            this.audio.addEventListener("ended", () => {
                try { if (!this.silentMode) this.next(false); } catch (e) {}
            });
            this.audio.addEventListener("error", () => {
                try { this._onTrackError(); } catch (e) {}
            });
        } catch (e) {
            this.silentMode = true;
            console.warn("[MusicPlayer] Audio API kullanılamıyor — Sessiz Mod");
        }
        console.log("MusicPlayer hazır ·", this.tracks.length, "parça adayı");
    },
    _enterSilentMode() {
        if (this.silentMode) return;
        this.silentMode = true;
        this.started = false;
        try {
            if (this.audio) {
                this.audio.removeAttribute("src");
                this.audio.load();
            }
        } catch (e) {}
        if (!this._silentNotified) {
            this._silentNotified = true;
            console.warn("[MusicPlayer] Sessiz Mod: assets/audio/*.ogg bulunamadı. Oyun müziği kapalı.");
            try {
                if (typeof showToast === "function") {
                    showToast("Sessiz Mod — müzik dosyaları yok", "info");
                } else if (typeof log === "function") {
                    log("🔇 Sessiz Mod: müzik dosyaları yüklenemedi.", "text-slate-500");
                }
            } catch (e) {}
        }
    },
    _onTrackError() {
        if (this.silentMode) return;
        this._errCount = (this._errCount || 0) + 1;
        const limit = Math.max(1, this.tracks.length || 1);
        if (this._errCount >= limit) {
            this._enterSilentMode();
            return;
        }
        // Kısa gecikmeyle sıradakine geç — spam engeli
        setTimeout(() => {
            try { if (!this.silentMode) this.next(true); } catch (e) {}
        }, 150);
    },
    currentUrl() {
        if (this.silentMode) return null;
        const f = this.tracks[this.index];
        if (!f) return null;
        return this.basePath + String(f).replace(/^\//, "");
    },
    async start() {
        try {
            if (this.silentMode || this.started) return;
            if (!this.audio) await this.init();
            if (this.silentMode || !this.audio) return;
            this.started = true;
            this._errCount = 0;
            this.shuffleStart();
        } catch (e) {
            this._enterSilentMode();
        }
    },
    playCurrent() {
        try {
            if (this.silentMode) return;
            const url = this.currentUrl();
            if (!url || !this.audio) return;
            this.audio.src = url;
            const p = this.audio.play();
            if (p && typeof p.catch === "function") {
                p.catch(() => {
                    try { this._onTrackError(); } catch (e) {}
                });
            }
        } catch (e) {
            try { this._onTrackError(); } catch (e2) {}
        }
    },
    next(fromError) {
        try {
            if (this.silentMode || !this.tracks.length) return;
            if (this.tracks.length === 1) {
                this.index = 0;
            } else {
                let ni = this.index;
                let guard = 0;
                while (ni === this.index && guard++ < 20) {
                    ni = Math.floor(Math.random() * this.tracks.length);
                }
                this.index = ni;
            }
            if (!fromError) this._errCount = 0;
            this.playCurrent();
        } catch (e) {
            this._enterSilentMode();
        }
    },
    shuffleStart() {
        try {
            if (this.silentMode || !this.tracks.length) return;
            this.index = Math.floor(Math.random() * this.tracks.length);
            this.playCurrent();
        } catch (e) {
            this._enterSilentMode();
        }
    },
    toggleMute() {
        try {
            if (!this.audio || this.silentMode) return true;
            this.audio.muted = !this.audio.muted;
            return this.audio.muted;
        } catch (e) { return true; }
    },
    setVolume(v) {
        try {
            this.volume = Math.max(0, Math.min(1, Number(v) || 0));
            if (this.audio) this.audio.volume = this.volume;
        } catch (e) {}
    }
};
// Sayfa yüklenince sadece hazırla — autoplay YOK
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        try { MusicPlayer.init(); } catch (e) {
            console.warn("[MusicPlayer] init hatası — Sessiz Mod", e);
            try { MusicPlayer.silentMode = true; } catch (e2) {}
        }
    });
}

// ========== HARİTA PAKETİ (dinamik, GLOBAL) ==========
// Aktif harita: assets/maps/1083/
const MAP_PACK_ID = "1083";
// SC_MAP_PACK_FALLBACK: if 1083 missing, use 1081
(function(){ try {
  var id = (typeof MAP_PACK_ID !== "undefined") ? MAP_PACK_ID : "1083";
  if (id !== "1083" && id !== "1081") id = "1083";
} catch(e) {} })();

const MAP_PACK_BASE = "./assets/maps/" + MAP_PACK_ID + "/";
const MAP_JSON_URL = MAP_PACK_BASE + "map.json";
const PROVINCE_DATA_URL = MAP_PACK_BASE + "PROVINCE_DATA.json";
const SCENARIOS_DIR = MAP_PACK_BASE + "scenarios/";

// Senaryolar SADECE diskten — gömülü veri YOK
var SCENARIOS = {};
window.SCENARIOS = SCENARIOS;

/**
 * assets/maps/1083/scenarios/index.json + modern.json / ww1.json / ww2.json
 * Her çağrıda diskten yeniden okur (cache: no-store).
 */
async function loadScenarioPack() {
    const loaded = {};
    try {
        const idxUrl = SCENARIOS_DIR + "index.json";
        const idxRes = await fetch(idxUrl, { cache: "no-store" });
        if (!idxRes.ok) {
            throw new Error("index.json HTTP " + idxRes.status + " @ " + idxUrl);
        }
        const idx = await idxRes.json();
        const list = idx.scenarios || [];
        for (const entry of list) {
            const file = entry.file || (entry.id + ".json");
            const url = SCENARIOS_DIR + file;
            try {
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) {
                    console.warn("Senaryo HTTP hata:", url, res.status);
                    continue;
                }
                const sc = await res.json();
                const id = sc.id || entry.id;
                if (!id) continue;
                loaded[id] = {
                    id: id,
                    name: sc.name || id,
                    year: sc.year != null ? sc.year : 2026,
                    techEra: sc.techEra != null ? sc.techEra : 3,
                    provinceOwners: sc.provinceOwners || {},
                    countryNames: sc.countryNames || {},
                    countryColors: sc.countryColors || {},
                    countryFlags: sc.countryFlags || {},
                    friends: sc.friends || [],
                    rivals: sc.rivals || []
                };
                console.log("✓ Senaryo diskten:", id, "·", Object.keys(loaded[id].provinceOwners).length, "eyalet");
            } catch (e) {
                console.warn("Senaryo parse/yükleme hatası:", file, e);
            }
        }
        // Global'i tamamen disk verisiyle değiştir (eski gömülü kalıntı yok)
        SCENARIOS = loaded;
        window.SCENARIOS = SCENARIOS;
        const keys = Object.keys(SCENARIOS);
        try { if (typeof refreshLobbyCountrySelect === "function") refreshLobbyCountrySelect(); } catch(e){}
        console.log("Senaryo paketi hazır:", keys.join(", ") || "(boş!)");
        if (!keys.length) {
            console.error("Hiç senaryo yüklenmedi. Yol:", SCENARIOS_DIR);
        }
        return SCENARIOS;
    } catch (e) {
        console.error("loadScenarioPack BAŞARISIZ:", e);
        SCENARIOS = SCENARIOS || {};
        window.SCENARIOS = SCENARIOS;
        return SCENARIOS;
    }
}

window.toggleSidebar = function() {
    const edge = document.getElementById('sidebar-edge-btn');
    const closed = document.body.classList.toggle('sidebar-kapali');
    if (edge) edge.textContent = closed ? '▶' : '◀';
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
};
    


        // Web Audio API Taktik Ses Efekt Motoru
        class SoundEngine {
            constructor() {
                this.ctx = null;
            }
            init() {
                if (!this.ctx) {
                    try {
                        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                    } catch (e) {
                        console.warn("Web Audio API not supported in this environment.");
                    }
                }
            }
            playBlip() {
                this.init();
                if (!this.ctx) return;
                try {
                    let osc = this.ctx.createOscillator();
                    let gain = this.ctx.createGain();
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
                    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 0.1);
                } catch(e){}
            }
            playSiren() {
                this.init();
                if (!this.ctx) return;
                try {
                    let osc = this.ctx.createOscillator();
                    let gain = this.ctx.createGain();
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
                    osc.frequency.setValueAtTime(250, this.ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(500, this.ctx.currentTime + 0.4);
                    osc.frequency.linearRampToValueAtTime(250, this.ctx.currentTime + 0.8);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.0);
                    osc.start();
                    osc.stop(this.ctx.currentTime + 1.0);
                } catch(e){}
            }
            playVictory() {
                // start spam fix: en fazla 2.5 sn'de bir
                if (this._lastVic && Date.now() - this._lastVic < 2500) return;
                this._lastVic = Date.now();
                this.init();
                if (!this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    this.playTone(440, now, 0.08);
                    this.playTone(554, now + 0.08, 0.08);
                    this.playTone(659, now + 0.16, 0.1);
                } catch(e){}
            }
            playClick() {
                this.init(); if (!this.ctx) return;
                try {
                    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                    o.connect(g); g.connect(this.ctx.destination);
                    o.frequency.value = 1200; g.gain.setValueAtTime(0.03, this.ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
                    o.start(); o.stop(this.ctx.currentTime + 0.06);
                } catch(e){}
            }
            playBuild() {
                this.init(); if (!this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    this.playTone(220, now, 0.08); this.playTone(330, now + 0.08, 0.1); this.playTone(440, now + 0.18, 0.12);
                } catch(e){}
            }
            playAlert() {
                // bildirim spam sustur
                if (this._lastAlert && Date.now() - this._lastAlert < 3000) return;
                this._lastAlert = Date.now();
                this.init(); if (!this.ctx) return;
                try {
                    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                    o.type = "sine"; o.connect(g); g.connect(this.ctx.destination);
                    o.frequency.setValueAtTime(520, this.ctx.currentTime);
                    g.gain.setValueAtTime(0.02, this.ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
                    o.start(); o.stop(this.ctx.currentTime + 0.12);
                } catch(e){}
            }
            playMessage() {
                this.init(); if (!this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    this.playTone(660, now, 0.08); this.playTone(880, now + 0.1, 0.12);
                } catch(e){}
            }
            playTone(freq, start, duration) {
                if (!this.ctx) return;
                try {
                    let osc = this.ctx.createOscillator();
                    let gain = this.ctx.createGain();
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.frequency.setValueAtTime(freq, start);
                    gain.gain.setValueAtTime(0.05, start);
                    gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
                    osc.start(start);
                    osc.stop(start + duration);
                } catch(e){}
            }
        }
        const sfx = new SoundEngine();

        // GLOBAL OYUN STATE YAPISI
        const GameState = {
            player: "TUR",
            selectedCountry: null,
            selectedProvince: null,
            date: new Date(2026, 0, 1),
            running: false,
            speed: 800, // tick başına ms (1 tick = 1 GÜN)
            focusPrerequisites: {},   // Yeni: Odak önkoşulları
            countries: {
"TUR": {name: "Türkiye", flag: "tr", color: "#dc2626", ideology: "Cumhuriyet", pop: 85000000, civFactories: 25, milFactories: 20, money: 1200, manpower: 450000, divisions: { inf: 12, art: 4, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 150, tanks: 120 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"DEU": {name: "Almanya", flag: "de", color: "#333333", ideology: "Demokrasi", pop: 84000000, civFactories: 60, milFactories: 12, money: 3000, manpower: 1500000, divisions: { inf: 8, art: 3, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 200, tanks: 80 }, prodAllocation: { guns: 12, artillery: 8, tanks: 5 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"USA": {name: "Amerika Birleşik Devletleri", flag: "us", color: "#1b32b6", ideology: "Demokrasi", pop: 340000000, civFactories: 150, milFactories: 130, money: 45000, manpower: 300000, divisions: { inf: 45, art: 15, arm: 12 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 120000, artillery: 2500, tanks: 1200 }, prodAllocation: { guns: 8, artillery: 4, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"RUS": {name: "Rusya Federasyonu", flag: "ru", color: "#1e3a8a", ideology: "Federal", pop: 145000000, civFactories: 25, milFactories: 35, money: 1000, manpower: 2700000, divisions: { inf: 45, art: 18, arm: 6 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 80000, artillery: 2000, tanks: 600 }, prodAllocation: { guns: 20, artillery: 15, tanks: 10 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"GBR": {name: "Birleşik Krallık", flag: "gb", color: "#dc2939", ideology: "Parlamenter", pop: 67000000, civFactories: 50, milFactories: 20, money: 6000, manpower: 750000, divisions: { inf: 16, art: 6, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 30000, artillery: 600, tanks: 150 }, prodAllocation: { guns: 10, artillery: 5, tanks: 5 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"FRA": {name: "Fransa", flag: "fr", color: "#1382f6", ideology: "Cumhuriyet", pop: 68000000, civFactories: 40, milFactories: 15, money: 4000, manpower: 600000, divisions: { inf: 20, art: 8, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 28000, artillery: 800, tanks: 100 }, prodAllocation: { guns: 8, artillery: 5, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ITA": {name: "İtalya", flag: "it", color: "#16a34a", ideology: "Cumhuriyet", pop: 59000000, civFactories: 30, milFactories: 15, money: 1800, manpower: 540000, divisions: { inf: 15, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 400, tanks: 120 }, prodAllocation: { guns: 7, artillery: 5, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"JPN": {name: "Japonya", flag: "jp", color: "#881337", ideology: "Parlamenter", pop: 125000000, civFactories: 50, milFactories: 25, money: 4000, manpower: 900000, divisions: { inf: 22, art: 6, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 35000, artillery: 700, tanks: 180 }, prodAllocation: { guns: 10, artillery: 6, tanks: 4 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"POL": {name: "Polonya", flag: "pl", color: "#db2555", ideology: "Cumhuriyet", pop: 37000000, civFactories: 15, milFactories: 18, money: 1000, manpower: 460000, divisions: { inf: 16, art: 6, arm: 4 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 30000, artillery: 450, tanks: 180 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"AUT": {name: "Avusturya", flag: "at", color: "#f8fafc", ideology: "Federal", pop: 9000000, civFactories: 5, milFactories: 2, money: 500, manpower: 120000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 6000, artillery: 50, tanks: 10 }, prodAllocation: { guns: 1, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"AUS": {name: "Avustralya", flag: "au", color: "#fbbf24", ideology: "Demokrasi", pop: 26000000, civFactories: 20, milFactories: 8, money: 3000, manpower: 150000, divisions: { inf: 6, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 100, tanks: 40 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CAN": {name: "Kanada", flag: "ca", color: "#dc2626", ideology: "Demokrasi", pop: 40000000, civFactories: 30, milFactories: 12, money: 4000, manpower: 200000, divisions: { inf: 8, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 200, tanks: 50 }, prodAllocation: { guns: 4, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CHN": {name: "Çin Halk Cumhuriyeti", flag: "cn", color: "#b91c1c", ideology: "Komünizm", pop: 1400000000, civFactories: 120, milFactories: 80, money: 15000, manpower: 2500000, divisions: { inf: 60, art: 20, arm: 10 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 140000, artillery: 3000, tanks: 900 }, prodAllocation: { guns: 40, artillery: 25, tanks: 15 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"IND": {name: "Hindistan", flag: "in", color: "#f97316", ideology: "Demokrasi", pop: 1400000000, civFactories: 80, milFactories: 40, money: 5000, manpower: 2000000, divisions: { inf: 70, art: 20, arm: 10 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 100000, artillery: 2000, tanks: 600 }, prodAllocation: { guns: 25, artillery: 15, tanks: 8 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BRA": {name: "Brezilya", flag: "br", color: "#16a34a", ideology: "Demokrasi", pop: 215000000, civFactories: 30, milFactories: 15, money: 2500, manpower: 600000, divisions: { inf: 20, art: 6, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 30000, artillery: 500, tanks: 150 }, prodAllocation: { guns: 8, artillery: 4, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KOR": {name: "Güney Kore", flag: "kr", color: "#3b82f6", ideology: "Demokrasi", pop: 51000000, civFactories: 40, milFactories: 20, money: 5000, manpower: 600000, divisions: { inf: 25, art: 10, arm: 5 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 40000, artillery: 800, tanks: 250 }, prodAllocation: { guns: 12, artillery: 6, tanks: 4 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ESP": {name: "İspanya", flag: "es", color: "#eab308", ideology: "Demokrasi", pop: 48000000, civFactories: 20, milFactories: 10, money: 2000, manpower: 300000, divisions: { inf: 12, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 300, tanks: 80 }, prodAllocation: { guns: 5, artillery: 3, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SAU": {name: "Suudi Arabistan", flag: "sa", color: "#065f46", ideology: "Monarşi", pop: 36000000, civFactories: 25, milFactories: 12, money: 8000, manpower: 250000, divisions: { inf: 10, art: 4, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 25000, artillery: 400, tanks: 150 }, prodAllocation: { guns: 6, artillery: 3, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MEX": {name: "Meksika", flag: "mx", color: "#15803d", ideology: "Demokrasi", pop: 130000000, civFactories: 25, milFactories: 10, money: 2000, manpower: 400000, divisions: { inf: 15, art: 4, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 22000, artillery: 300, tanks: 10 }, prodAllocation: { guns: 6, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ZAF": {name: "Güney Afrika", flag: "za", color: "#d97706", ideology: "Demokrasi", pop: 60000000, civFactories: 15, milFactories: 8, money: 1500, manpower: 200000, divisions: { inf: 8, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 150, tanks: 40 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"UKR": {name: "Ukrayna", flag: "ua", color: "#eab308", ideology: "Cumhuriyet", pop: 38000000, civFactories: 10, milFactories: 45, money: 500, manpower: 1200000, divisions: { inf: 50, art: 20, arm: 5 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 90000, artillery: 1500, tanks: 400 }, prodAllocation: { guns: 25, artillery: 15, tanks: 5 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"GRC": {name: "Yunanistan", flag: "gr", color: "#2563eb", ideology: "Demokrasi", pop: 10400000, civFactories: 15, milFactories: 12, money: 1100, manpower: 140000, divisions: { inf: 10, art: 3, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 350, tanks: 350 }, prodAllocation: { guns: 4, artillery: 2, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"NLD": {name: "Hollanda", flag: "nl", color: "#f97316", ideology: "Demokrasi", pop: 18000000, civFactories: 35, milFactories: 8, money: 5000, manpower: 45000, divisions: { inf: 4, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 100, tanks: 40 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SWE": {name: "İsveç", flag: "se", color: "#0ea5e9", ideology: "Demokrasi", pop: 10500000, civFactories: 25, milFactories: 15, money: 3500, manpower: 60000, divisions: { inf: 6, art: 2, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 150, tanks: 110 }, prodAllocation: { guns: 5, artillery: 4, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"FIN": {name: "Finlandiya", flag: "fi", color: "#ffffff", ideology: "Demokrasi", pop: 5600000, civFactories: 15, milFactories: 10, money: 1500, manpower: 280000, divisions: { inf: 12, art: 6, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 35000, artillery: 700, tanks: 100 }, prodAllocation: { guns: 4, artillery: 3, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"NOR": {name: "Norveç", flag: "no", color: "#ef4444", ideology: "Demokrasi", pop: 5500000, civFactories: 25, milFactories: 8, money: 12000, manpower: 40000, divisions: { inf: 4, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 80, tanks: 50 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"DNK": {name: "Danimarka", flag: "dk", color: "#be123c", ideology: "Demokrasi", pop: 6000000, civFactories: 20, milFactories: 5, money: 4000, manpower: 35000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 8000, artillery: 50, tanks: 15 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CHE": {name: "İsviçre", flag: "ch", color: "#991b1b", ideology: "Federal", pop: 8900000, civFactories: 30, milFactories: 10, money: 9000, manpower: 150000, divisions: { inf: 8, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 25000, artillery: 200, tanks: 120 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BEL": {name: "Belçika", flag: "be", color: "#fbbf24", ideology: "Demokrasi", pop: 11800000, civFactories: 25, milFactories: 6, money: 2500, manpower: 40000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 60, tanks: 0 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ROU": {name: "Romanya", flag: "ro", color: "#facc15", ideology: "Cumhuriyet", pop: 19000000, civFactories: 18, milFactories: 10, money: 1200, manpower: 180000, divisions: { inf: 12, art: 4, arm: 2  },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 22000, artillery: 300, tanks: 140 }, prodAllocation: { guns: 4, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CZE": {name: "Çekya", flag: "cz", color: "#3b82f6", ideology: "Demokrasi", pop: 10800000, civFactories: 18, milFactories: 12, money: 1800, manpower: 70000, divisions: { inf: 6, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 18000, artillery: 150, tanks: 60 }, prodAllocation: { guns: 4, artillery: 3, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"HUN": {name: "Macaristan", flag: "hu", color: "#15803d", ideology: "Cumhuriyet", pop: 9600000, civFactories: 12, milFactories: 6, money: 800, manpower: 65000, divisions: { inf: 5, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 100, tanks: 40 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ISR": {name: "İsrail", flag: "il", color: "#1d4ed8", ideology: "Demokrasi", pop: 980000, civFactories: 25, milFactories: 30, money: 4000, manpower: 450000, divisions: { inf: 15, art: 6, arm: 8 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 40000, artillery: 600, tanks: 500 }, prodAllocation: { guns: 10, artillery: 5, tanks: 6 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"IRN": {name: "İran", flag: "ir", color: "#047857", ideology: "Teokrasi", pop: 89000000, civFactories: 25, milFactories: 25, money: 1500, manpower: 1100000, divisions: { inf: 45, art: 12, arm: 5 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 70000, artillery: 1200, tanks: 450 }, prodAllocation: { guns: 15, artillery: 8, tanks: 4 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"EGY": {name: "Mısır", flag: "eg", color: "#f59e0b", ideology: "Cumhuriyet", pop: 112000000, civFactories: 22, milFactories: 15, money: 1000, manpower: 800000, divisions: { inf: 30, art: 10, arm: 6 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 50000, artillery: 800, tanks: 600 }, prodAllocation: { guns: 8, artillery: 4, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PAK": {name: "Pakistan", flag: "pk", color: "#14532d", ideology: "Cumhuriyet", pop: 240000000, civFactories: 20, milFactories: 25, money: 1200, manpower: 1500000, divisions: { inf: 55, art: 15, arm: 8 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 80000, artillery: 1400, tanks: 500 }, prodAllocation: { guns: 12, artillery: 6, tanks: 4 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"IDN": {name: "Endonezya", flag: "id", color: "#b91c1c", ideology: "Demokrasi", pop: 278000000, civFactories: 35, milFactories: 12, money: 3500, manpower: 800000, divisions: { inf: 22, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 30000, artillery: 300, tanks: 100 }, prodAllocation: { guns: 6, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"TWN": {name: "Tayvan", flag: "tw", color: "#0284c7", ideology: "Demokrasi", pop: 23500000, civFactories: 40, milFactories: 18, money: 5000, manpower: 300000, divisions: { inf: 14, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 25000, artillery: 400, tanks: 200 }, prodAllocation: { guns: 8, artillery: 4, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PRK": {name: "Kuzey Kore", flag: "kp", color: "#991b1b", ideology: "Komünizm", pop: 26000000, civFactories: 8, milFactories: 35, money: 300, manpower: 1300000, divisions: { inf: 60, art: 25, arm: 6 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 100000, artillery: 3000, tanks: 700 }, prodAllocation: { guns: 20, artillery: 15, tanks: 5 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ARG": {name: "Arjantin", flag: "ar", color: "#38bdf8", ideology: "Cumhuriyet", pop: 46000000, civFactories: 18, milFactories: 6, money: 900, manpower: 120000, divisions: { inf: 8, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 120, tanks: 50 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"COL": {name: "Kolombiya", flag: "co", color: "#1e3a8a", ideology: "Demokrasi", pop: 52000000, civFactories: 14, milFactories: 5, money: 3500, manpower: 180000, divisions: { inf: 8, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 150, tanks: 0 }, prodAllocation: { guns: 3, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"VEN": {name: "Venezuela", flag: "ve", color: "#b91c1c", ideology: "Sosyalizm", pop: 29000000, civFactories: 10, milFactories: 7, money: 1500, manpower: 220000, divisions: { inf: 10, art: 3, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 200, tanks: 60 }, prodAllocation: { guns: 4, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CHL": {name: "Şili", flag: "cl", color: "#0369a1", ideology: "Demokrasi", pop: 20000000, civFactories: 16, milFactories: 6, money: 5000, manpower: 90000, divisions: { inf: 6, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 180, tanks: 30 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PER": {name: "Peru", flag: "pe", color: "#991b1b", ideology: "Demokrasi", pop: 34000000, civFactories: 11, milFactories: 4, money: 3000, manpower: 110000, divisions: { inf: 7, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 14000, artillery: 120, tanks: 0 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"NGA": {name: "Nijerya", flag: "ng", color: "#15803d", ideology: "Demokrasi", pop: 224000000, civFactories: 15, milFactories: 6, money: 4000, manpower: 600000, divisions: { inf: 14, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 25000, artillery: 100, tanks: 10 }, prodAllocation: { guns: 4, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"DZA": {name: "Cezayir", flag: "dz", color: "#065f46", ideology: "Milliyetçilik", pop: 46000000, civFactories: 18, milFactories: 11, money: 7000, manpower: 300000, divisions: { inf: 12, art: 5, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 24000, artillery: 350, tanks: 180 }, prodAllocation: { guns: 5, artillery: 3, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MAR": {name: "Fas", flag: "ma", color: "#9a3412", ideology: "Monarşi", pop: 38000000, civFactories: 15, milFactories: 8, money: 4500, manpower: 250000, divisions: { inf: 11, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 250, tanks: 110 }, prodAllocation: { guns: 4, artillery: 3, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"TUN": {name: "Tunus", flag: "tn", color: "#dc2626", ideology: "Demokrasi", pop: 12000000, civFactories: 8, milFactories: 3, money: 2000, manpower: 60000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 8000, artillery: 50, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LBY": {name: "Libya", flag: "ly", color: "#166534", ideology: "Geçici Hükümet", pop: 7000000, civFactories: 7, milFactories: 5, money: 5000, manpower: 80000, divisions: { inf: 6, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 15000, artillery: 120, tanks: 40 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SDN": {name: "Sudan", flag: "sd", color: "#374151", ideology: "Cunta", pop: 48000000, civFactories: 5, milFactories: 6, money: 1000, manpower: 280000, divisions: { inf: 10, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 18000, artillery: 90, tanks: 30 }, prodAllocation: { guns: 4, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ETH": {name: "Etiyopya", flag: "et", color: "#16a34a", ideology: "Demokrasi", pop: 126000000, civFactories: 9, milFactories: 5, money: 1800, manpower: 450000, divisions: { inf: 12, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 22000, artillery: 80, tanks: 10 }, prodAllocation: { guns: 3, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KEN": {name: "Kenya", flag: "ke", color: "#854d0e", ideology: "Demokrasi", pop: 55000000, civFactories: 12, milFactories: 3, money: 3000, manpower: 130000, divisions: { inf: 5, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 40, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"AGO": {name: "Angola", flag: "ao", color: "#7f1d1d", ideology: "Milliyetçilik", pop: 36000000, civFactories: 8, milFactories: 4, money: 2500, manpower: 140000, divisions: { inf: 7, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 60, tanks: 20 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"IRQ": {name: "Irak", flag: "iq", color: "#065f46", ideology: "Demokrasi", pop: 45000000, civFactories: 11, milFactories: 6, money: 4000, manpower: 250000, divisions: { inf: 9, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 18000, artillery: 150, tanks: 40 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SYR": {name: "Suriye", flag: "sy", color: "#15803d", ideology: "Otokrasi", pop: 23000000, civFactories: 4, milFactories: 7, money: 800, manpower: 190000, divisions: { inf: 11, art: 4, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 20000, artillery: 220, tanks: 90 }, prodAllocation: { guns: 4, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"JOR": {name: "Ürdün", flag: "jo", color: "#0f766e", ideology: "Monarşi", pop: 11000000, civFactories: 9, milFactories: 4, money: 2200, manpower: 80000, divisions: { inf: 5, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
             productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 10000, artillery: 80, tanks: 25 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LBN": {name: "Lübnan", flag: "lb", color: "#b91c1c", ideology: "Demokrasi", pop: 55000000, civFactories: 5, milFactories: 2, money: 1000, manpower: 40000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 6000, artillery: 30, tanks: 0 }, prodAllocation: { guns: 1, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"OMN": {name: "Umman", flag: "om", color: "#047857", ideology: "Monarşi", pop: 5000000, civFactories: 11, milFactories: 4, money: 4500, manpower: 60000, divisions: { inf: 4, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 9000, artillery: 70, tanks: 20 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"YEM": {name: "Yemen", flag: "ye", color: "#4b5563", ideology: "Askeri Rejim", pop: 34000000, civFactories: 2, milFactories: 4, money: 400, manpower: 200000, divisions: { inf: 8, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 14000, artillery: 40, tanks: 10 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KWT": {name: "Kuveyt", flag: "kw", color: "#0d9488", ideology: "Monarşi", pop: 43000000, civFactories: 14, milFactories: 3, money: 9000, manpower: 40000, divisions: { inf: 3, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 60, tanks: 35 }, prodAllocation: { guns: 1, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"QAT": {name: "Katar", flag: "qa", color: "#701a75", ideology: "Monarşi", pop: 2700000, civFactories: 15, milFactories: 4, money: 15000, manpower: 30000, divisions: { inf: 2, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 6000, artillery: 50, tanks: 40 }, prodAllocation: { guns: 1, artillery: 1, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ARE": {name: "Birleşik Arap Emirlikleri", flag: "ae", color: "#0f766e", ideology: "Monarşi", pop: 9500000, civFactories: 24, milFactories: 8, money: 14000, manpower: 80000, divisions: { inf: 5, art: 2, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 12000, artillery: 140, tanks: 90 }, prodAllocation: { guns: 3, artillery: 2, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"AZE": {name: "Azerbaycan", flag: "https://flagcdn.com/w80/az.png", color: "#0369a1", ideology: "Milliyetçilik", pop: 10000000, civFactories: 16, milFactories: 12, money: 6500, manpower: 180000, divisions: { inf: 10, art: 4, arm: 3 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 22000, artillery: 300, tanks: 140 }, prodAllocation: { guns: 4, artillery: 4, tanks: 4 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"GEO": {name: "Gürcistan", flag: "ge", color: "#991b1b", ideology: "Demokrasi", pop: 3700000, civFactories: 7, milFactories: 3, money: 1500, manpower: 50000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 40, tanks: 10 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ARM": {name: "Ermenistan", flag: "am", color: "#b45309", ideology: "Demokrasi", pop: 2800000, civFactories: 5, milFactories: 3, money: 1000, manpower: 45000, divisions: { inf: 4, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 7000, artillery: 60, tanks: 8 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KAZ": {name: "Kazakistan", flag: "kz", color: "#0284c7", ideology: "Otokrasi", pop: 20000000, civFactories: 20, milFactories: 8, money: 8000, manpower: 200000, divisions: { inf: 8, art: 3, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 18000, artillery: 200, tanks: 120 }, prodAllocation: { guns: 3, artillery: 2, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"UZB": {name: "Özbekistan", flag: "uz", color: "#0d9488", ideology: "Otokrasi", pop: 36000000, civFactories: 15, milFactories: 6, money: 3500, manpower: 250000, divisions: { inf: 9, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 16000, artillery: 110, tanks: 30 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"TKM": {name: "Türkmenistan", flag: "tm", color: "#166534", ideology: "Mutlakıyet", pop: 6500000, civFactories: 11, milFactories: 5, money: 4000, manpower: 70000, divisions: { inf: 5, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 10000, artillery: 90, tanks: 40 }, prodAllocation: { guns: 2, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KGZ": {name: "Kırgızistan", flag: "kg", color: "#dc2626", ideology: "Demokrasi", pop: 7000000, civFactories: 6, milFactories: 3, money: 1200, manpower: 65000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 40, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"TJK": {name: "Tacikistan", flag: "tj", color: "#991b1b", ideology: "Otokrasi", pop: 10000000, civFactories: 5, milFactories: 3, money: 9000, manpower: 80000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 30, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"AFG": {name: "Afganistan", flag: "af", color: "#31333d", ideology: "Teokrasi", pop: 42000000, civFactories: 2, milFactories: 5, money: 500, manpower: 350000, divisions: { inf: 12, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 25000, artillery: 50, tanks: 15 }, prodAllocation: { guns: 4, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BGD": {name: "Bangladeş", flag: "bd", color: "#065f46", ideology: "Demokrasi", pop: 173000000, civFactories: 16, milFactories: 5, money: 3800, manpower: 500000, divisions: { inf: 11, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 20000, artillery: 80, tanks: 20 }, prodAllocation: { guns: 3, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LKA": {name: "Sri Lanka", flag: "lk", color: "#854d0e", ideology: "Demokrasi", pop: 22000000, civFactories: 9, milFactories: 3, money: 1800, manpower: 75000, divisions: { inf: 5, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 9000, artillery: 30, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MMR": {name: "Myanmar", flag: "mm", color: "#eab308", ideology: "Cunta", pop: 54000000, civFactories: 6, milFactories: 7, money: 1200, manpower: 240000, divisions: { inf: 10, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 18000, artillery: 100, tanks: 30 }, prodAllocation: { guns: 4, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"THA": {name: "Tayland", flag: "th", color: "#1e3a8a", ideology: "Monarşi", pop: 71000000, civFactories: 25, milFactories: 9, money: 7500, manpower: 280000, divisions: { inf: 10, art: 3, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 22000, artillery: 180, tanks: 60 }, prodAllocation: { guns: 4, artillery: 3, tanks: 2 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"VNM": {name: "Vietnam", flag: "vn", color: "#cc2525", ideology: "Sosyalizm", pop: 98000000, civFactories: 24, milFactories: 11, money: 6000, manpower: 450000, divisions: { inf: 13, art: 5, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 26000, artillery: 280, tanks: 90 }, prodAllocation: { guns: 5, artillery: 3, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MYS": {name: "Malezya", flag: "my", color: "#1e40af", ideology: "Demokrasi", pop: 34000000, civFactories: 20, milFactories: 6, money: 5500, manpower: 120000, divisions: { inf: 7, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 14000, artillery: 90, tanks: 25 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SGP": {name: "Singapur", flag: "sg", color: "#ef4444", ideology: "Demokrasi", pop: 6000000, civFactories: 26, milFactories: 8, money: 18000, manpower: 50000, divisions: { inf: 4, art: 3, arm: 2 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 10000, artillery: 150, tanks: 80 }, prodAllocation: { guns: 2, artillery: 3, tanks: 3 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PHL": {name: "Filipinler", flag: "ph", color: "#1d4ed8", ideology: "Demokrasi", pop: 115000000, civFactories: 18, milFactories: 6, money: 4500, manpower: 350000, divisions: { inf: 9, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 16000, artillery: 80, tanks: 10 }, prodAllocation: { guns: 4, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"NZL": {name: "Yeni Zelanda", flag: "nz", color: "#0f172a", ideology: "Demokrasi", pop: 5200000, civFactories: 14, milFactories: 4, money: 4000, manpower: 45000, divisions: { inf: 4, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 9000, artillery: 80, tanks: 10 }, prodAllocation: { guns: 2, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PRT": {name: "Portekiz", flag: "pt", color: "#15803d", ideology: "Demokrasi", pop: 10000000, civFactories: 16, milFactories: 5, money: 3800, manpower: 80000, divisions: { inf: 6, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 12000, artillery: 100, tanks: 20 }, prodAllocation: { guns: 3, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"IRL": {name: "İrlanda", flag: "ie", color: "#166534", ideology: "Demokrasi", pop: 5200000, civFactories: 15, milFactories: 2, money: 5000, manpower: 30000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 6000, artillery: 30, tanks: 0 }, prodAllocation: { guns: 1, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SVK": {name: "Slovakya", flag: "sk", color: "#1e40af", ideology: "Demokrasi", pop: 5400000, civFactories: 12, milFactories: 4, money: 2500, manpower: 45000, divisions: { inf: 4, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 9000, artillery: 70, tanks: 20 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"HRV": {name: "Hırvatistan", flag: "hr", color: "#991b1b", ideology: "Demokrasi", pop: 3800000, civFactories: 11, milFactories: 4, money: 2800, manpower: 40000, divisions: { inf: 4, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 60, tanks: 15 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SRB": {name: "Sırbistan", flag: "rs", color: "#1e3a8a", ideology: "Milliyetçilik", pop: 6600000, civFactories: 10, milFactories: 6, money: 2000, manpower: 90000, divisions: { inf: 6, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 14000, artillery: 140, tanks: 45 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BGR": {name: "Bulgaristan", flag: "bg", color: "#047857", ideology: "Demokrasi", pop: 6400000, civFactories: 12, milFactories: 5, money: 2400, manpower: 70000, divisions: { inf: 5, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 11000, artillery: 100, tanks: 30 }, prodAllocation: { guns: 2, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CUB": {name: "Küba", flag: "cu", color: "#1d4ed8", ideology: "Sosyalizm", pop: 11000000, civFactories: 6, milFactories: 4, money: 800, manpower: 120000, divisions: { inf: 7, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 14000, artillery: 90, tanks: 40 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PAN": {name: "Panama", flag: "pa", color: "#dc2626", ideology: "Demokrasi", pop: 4500000, civFactories: 13, milFactories: 1, money: 4500, manpower: 20000, divisions: { inf: 2, art: 0, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 4000, artillery: 10, tanks: 0 }, prodAllocation: { guns: 1, artillery: 0, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MNG": {name: "Moğolistan", flag: "mn", color: "#b91c1c", ideology: "Komünizm", pop: 3500000, civFactories: 6, milFactories: 3, money: 500, manpower: 60000, divisions: { inf: 4, art: 1, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 50, tanks: 20 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LUX": {name: "Lüksemburg", flag: "lu", color: "#06b6d4", ideology: "Demokrasi", pop: 650000, civFactories: 14, milFactories: 2, money: 6000, manpower: 15000, divisions: { inf: 2, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 4000, artillery: 30, tanks: 0 }, prodAllocation: { guns: 1, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ISL": {name: "İzlanda", flag: "is", color: "#1e3a8a", ideology: "Demokrasi", pop: 390000, civFactories: 8, milFactories: 1, money: 4000, manpower: 10000, divisions: { inf: 1, art: 0, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 2000, artillery: 0, tanks: 0 }, prodAllocation: { guns: 1, artillery: 0, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BOL": {name: "Bolivya", flag: "bo", color: "#16a34a", ideology: "Demokrasi", pop: 12000000, civFactories: 9, milFactories: 4, money: 800, manpower: 90000, divisions: { inf: 6, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 11000, artillery: 80, tanks: 0 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ECU": {name: "Ekvador", flag: "ec", color: "#ea580c", ideology: "Demokrasi", pop: 18000000, civFactories: 10, milFactories: 4, money: 900, manpower: 100000, divisions: { inf: 7, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 12000, artillery: 90, tanks: 5 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"GHA": {name: "Gana", flag: "gh", color: "#eab308", ideology: "Demokrasi", pop: 33000000, civFactories: 12, milFactories: 4, money: 1200, manpower: 140000, divisions: { inf: 8, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 14000, artillery: 100, tanks: 10 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ALB": {name: "Arnavutluk", flag: "al", color: "#991b1b", ideology: "Otokrasi", pop: 2800000, civFactories: 6, milFactories: 3, money: 600, manpower: 40000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 6000, artillery: 40, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"EST": {name: "Estonya", flag: "ee", color: "#2563eb", ideology: "Demokrasi", pop: 1300000, civFactories: 8, milFactories: 3, money: 1500, manpower: 30000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 7000, artillery: 40, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LVA": {name: "Letonya", flag: "lv", color: "#991b1b", ideology: "Demokrasi", pop: 1900000, civFactories: 9, milFactories: 3, money: 1400, manpower: 35000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 8000, artillery: 50, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LTU": {name: "Litvanya", flag: "lt", color: "#854d0e", ideology: "Demokrasi", pop: 2800000, civFactories: 10, milFactories: 4, money: 1600, manpower: 45000, divisions: { inf: 5, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 10000, artillery: 60, tanks: 10 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"URY": {name: "Uruguay", flag: "uy", color: "#0284c7", ideology: "Demokrasi", pop: 3500000, civFactories: 10, milFactories: 3, money: 2500, manpower: 40000, divisions: { inf: 4, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 6000, artillery: 40, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"PRY": {name: "Paraguay", flag: "py", color: "#b91c1c", ideology: "Otokrasi", pop: 7000000, civFactories: 8, milFactories: 4, money: 1000, manpower: 75000, divisions: { inf: 6, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },  stockpile: { guns: 9000, artillery: 60, tanks: 0 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"GTM": {name: "Guatemala", flag: "gt", color: "#06b6d4", ideology: "Demokrasi", pop: 18000000, civFactories: 9, milFactories: 3, money: 1200, manpower: 90000, divisions: { inf: 6, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 50, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CRI": {name: "Kosta Rika", flag: "cr", color: "#1e3a8a", ideology: "Demokrasi", pop: 5000000, civFactories: 11, milFactories: 1, money: 3000, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 3000, artillery: 0, tanks: 0 }, prodAllocation: { guns: 1, artillery: 0, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"DOM": {name: "Dominik Cumhuriyeti", flag: "do", color: "#3b82f6", ideology: "Demokrasi", pop: 11000000, civFactories: 9, milFactories: 3, money: 1400, manpower: 60000, divisions: { inf: 5, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 8000, artillery: 40, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SEN": {name: "Senegal", flag: "sn", color: "#15803d", ideology: "Demokrasi", pop: 17000000, civFactories: 10, milFactories: 4, money: 1100, manpower: 80000, divisions: { inf: 6, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 10000, artillery: 60, tanks: 0 }, prodAllocation: { guns: 2, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"CIV": {name: "Fildişi Sahili", flag: "ci", color: "#ea580c", ideology: "Demokrasi", pop: 28000000, civFactories: 12, milFactories: 4, money: 1800, manpower: 110000, divisions: { inf: 7, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 12000, artillery: 70, tanks: 10 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SSD": {name: "Güney Sudan", flag: "ss", color: "#7c2d12", ideology: "Otokrasi", pop: 11000000, civFactories: 5, milFactories: 5, money: 400, manpower: 130000, divisions: { inf: 9, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 14000, artillery: 50, tanks: 5 }, prodAllocation: { guns: 4, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"UGA": {name: "Uganda", flag: "ug", color: "#eab308", ideology: "Otokrasi", pop: 48000000, civFactories: 11, milFactories: 6, money: 900, manpower: 190000, divisions: { inf: 10, art: 3, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 16000, artillery: 80, tanks: 15 }, prodAllocation: { guns: 3, artillery: 2, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"TZA": {name: "Tanzanya", flag: "tz", color: "#0d9488", ideology: "Demokrasi", pop: 65000000, civFactories: 14, milFactories: 5, money: 1500, manpower: 220000, divisions: { inf: 12, art: 3, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 18000, artillery: 90, tanks: 10 }, prodAllocation: { guns: 3, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"ZMB": {name: "Zambiya", flag: "zm", color: "#16a34a", ideology: "Demokrasi", pop: 20000000, civFactories: 10, milFactories: 3, money: 1300, manpower: 85000, divisions: { inf: 6, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 9000, artillery: 40, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MOZ": {name: "Mozambik", flag: "mz", color: "#047857", ideology: "Demokrasi", pop: 32000000, civFactories: 9, milFactories: 4, money: 800, manpower: 120000, divisions: { inf: 8, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 11000, artillery: 60, tanks: 5 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MDG": {name: "Madagaskar", flag: "mg", color: "#dc2626", ideology: "Demokrasi", pop: 29000000, civFactories: 8, milFactories: 3, money: 700, manpower: 95000, divisions: { inf: 6, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 9000, artillery: 40, tanks: 0 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LBR": {name: "Liberya", flag: "lr", color: "#1e40af", ideology: "Demokrasi", pop: 5000000, civFactories: 6, milFactories: 2, money: 600, manpower: 30000, divisions: { inf: 3, art: 0, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 4000, artillery: 10, tanks: 0 }, prodAllocation: { guns: 2, artillery: 0, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"SVN": {name: "Slovenya", flag: "si", color: "#2563eb", ideology: "Demokrasi", pop: 2100000, civFactories: 12, milFactories: 4, money: 2000, manpower: 30000, divisions: { inf: 4, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 7000, artillery: 50, tanks: 15 }, prodAllocation: { guns: 2, artillery: 1, tanks: 1 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MKD": {name: "Kuzey Makedonya", flag: "mk", color: "#b45309", ideology: "Demokrasi", pop: 2000000, civFactories: 8, milFactories: 3, money: 900, manpower: 25000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 5000, artillery: 30, tanks: 5 }, prodAllocation: { guns: 2, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"BIH": {name: "Bosna Hersek", flag: "ba", color: "#1d4ed8", ideology: "Demokrasi", pop: 3200000, civFactories: 9, milFactories: 5, money: 1100, manpower: 50000, divisions: { inf: 5, art: 2, arm: 1 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 8000, artillery: 60, tanks: 10 }, prodAllocation: { guns: 2, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"MDA": {name: "Moldova", flag: "md", color: "#7f1d1d", ideology: "Demokrasi", pop: 2600000, civFactories: 7, milFactories: 2, money: 600, manpower: 25000, divisions: { inf: 3, art: 1, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 4500, artillery: 25, tanks: 0 }, prodAllocation: { guns: 2, artillery: 0, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"KHM": {name: "Kamboçya", flag: "kh", color: "#991b1b", ideology: "Otokrasi", pop: 16000000, civFactories: 9, milFactories: 4, money: 800, manpower: 100000, divisions: { inf: 7, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 11000, artillery: 60, tanks: 5 }, prodAllocation: { guns: 3, artillery: 1, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 },
"LAO": {name: "Laos", flag: "la", color: "#065f46", ideology: "Komünizm", pop: 7500000, civFactories: 7, milFactories: 4, money: 500, manpower: 65000, divisions: { inf: 5, art: 2, arm: 0 },
            factoryEfficiency: 1.0,
            productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 }, stockpile: { guns: 8500, artillery: 50, tanks: 8 }, prodAllocation: { guns: 2, artillery: 2, tanks: 0 }, completedFocuses: [], activeFocus: null, focusProgress: 0 }
},
                        activeFocusTree: {
                "TUR": [
                    { id: "mavi_vatan", title: "Mavi Vatan Doktrini", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.TUR.milFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.TUR.name} - Mavi Vatan tamamlandı.`, "text-emerald-400"); } },
                    { id: "brics_uyeligi", title: "BRICS+ Tam Üyelik", desc: "+2000 Hazine", reward: () => { GameState.countries.TUR.money += 2000; log(`MİLLİ ODAK: ${GameState.countries.TUR.name} - BRICS+ entegrasyonu sağlandı.`, "text-emerald-400"); } }
                ],
                "DEU": [
                    { id: "avrupa_ordusu", title: "Avrupa Savunma Birliği", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.DEU.milFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.DEU.name} - Avrupa savunması güçlendi.`, "text-emerald-400"); } },
                    { id: "yesil_enerji", title: "Yenilenebilir Enerji Hamlesi", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.DEU.civFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.DEU.name} - Yeşil enerjiye geçiş yapıldı.`, "text-emerald-400"); } }
                ],
                "USA": [
                    { id: "pasifik_kalkanı", title: "Pasifik Kalkanı", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.USA.milFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.USA.name} - Pasifik'te savunma hattı kuruldu.`, "text-emerald-400"); } },
                    { id: "silikon_vadisi", title: "Silikon Vadisi Destek Paketi", desc: "+1000 Hazine", reward: () => { GameState.countries.USA.money += 1000; log(`MİLLİ ODAK: ${GameState.countries.USA.name} - Teknoloji devleri yatırıma başladı.`, "text-emerald-400"); } }
                ],
                "RUS": [
                    { id: "kuzey_guney", title: "Kuzey-Güney Koridoru", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.RUS.civFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.RUS.name} - Lojistik hattı açıldı.`, "text-emerald-400"); } },
                    { id: "arktik", title: "Arktik Hakimiyeti", desc: "+50K İnsan Gücü", reward: () => { GameState.countries.RUS.manpower += 50000; log(`MİLLİ ODAK: ${GameState.countries.RUS.name} - Arktik bölgesi kontrol altına alındı.`, "text-emerald-400"); } }
                ],
                "GBR": [
                    { id: "aukus", title: "AUKUS İttifakı", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.GBR.milFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.GBR.name} - AUKUS ortaklığı onaylandı.`, "text-emerald-400"); } },
                    { id: "kuresel_ingiltere", title: "Küresel İngiltere Vizyonu", desc: "+500 Hazine", reward: () => { GameState.countries.GBR.money += 500; log(`MİLLİ ODAK: ${GameState.countries.GBR.name} - Ticari ağ genişletildi.`, "text-emerald-400"); } }
                ],
                "FRA": [
                    { id: "stratejik_ozerklik", title: "Stratejik Özerklik", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.FRA.milFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.FRA.name} - Savunma sanayii özerkleşti.`, "text-emerald-400"); } },
                    { id: "afrika_etki", title: "Afrika Etki Alanı", desc: "+500 Hazine", reward: () => { GameState.countries.FRA.money += 500; log(`MİLLİ ODAK: ${GameState.countries.FRA.name} - Bölgesel nüfuz artırıldı.`, "text-emerald-400"); } }
                ],
                "ITA": [
                    { id: "akdeniz_enerji", title: "Akdeniz Enerji Merkezi", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.ITA.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.ITA.name} - Akdeniz'de enerji üssü kuruldu.`, "text-emerald-400"); } },
                    { id: "goc_reformu", title: "Göç Yönetimi Reformu", desc: "+10K İnsan Gücü", reward: () => { GameState.countries.ITA.manpower += 10000; log(`MİLLİ ODAK: ${GameState.countries.ITA.name} - Göç politikası güncellendi.`, "text-emerald-400"); } }
                ],
                "JPN": [
                    { id: "pasifik_paktı", title: "Pasifik Savunma Paktı", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.JPN.milFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.JPN.name} - Pasifik güvenliği sağlandı.`, "text-emerald-400"); } },
                    { id: "yüksek_teknoloji", title: "Yüksek Teknoloji Yatırımı", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.JPN.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.JPN.name} - Teknoloji atılımı gerçekleşti.`, "text-emerald-400"); } }
                ],
                "POL": [
                    { id: "dogu_kalkanı", title: "Doğu Kalkanı (Tahkimat)", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.POL.milFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.POL.name} - Doğu sınırı tahkim edildi.`, "text-emerald-400"); } },
                    { id: "nükleer_enerji", title: "Nükleer Enerji Geçişi", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.POL.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.POL.name} - Nükleer enerji yatırımı başladı.`, "text-emerald-400"); } }
                ],
                "AUT": [
                    { id: "tarafsızlık", title: "Avrupa Tarafsızlık Yasası", desc: "+200 Hazine", reward: () => { GameState.countries.AUT.money += 200; log(`MİLLİ ODAK: ${GameState.countries.AUT.name} - Tarafsızlık politikası güçlendi.`, "text-emerald-400"); } },
                    { id: "ticaret_blogu", title: "Orta Avrupa Ticaret Bloğu", desc: "+1 Sivil Fabrika", reward: () => { GameState.countries.AUT.civFactories += 1; log(`MİLLİ ODAK: ${GameState.countries.AUT.name} - Ticari birlik kuruldu.`, "text-emerald-400"); } }
                ],
                "AUS": [
                    { id: "aukus_modernizasyon", title: "AUKUS Donanma Modernizasyonu", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.AUS.milFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.AUS.name} - Donanma modernize edildi.`, "text-emerald-400"); } },
                    { id: "indopasifik_guvenlik", title: "Indo-Pasifik Güvenlik", desc: "+10K İnsan Gücü", reward: () => { GameState.countries.AUS.manpower += 10000; log(`MİLLİ ODAK: ${GameState.countries.AUS.name} - Pasifik güvenliği sağlandı.`, "text-emerald-400"); } }
                ],
                "CAN": [
                    { id: "arktik_devriyesi", title: "Kuzey Arktik Devriyesi", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.CAN.milFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.CAN.name} - Kuzey hattı koruma altına alındı.`, "text-emerald-400"); } },
                    { id: "yesil_hidrojen", title: "Yeşil Hidrojen Üretimi", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.CAN.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.CAN.name} - Hidrojen yatırımı başladı.`, "text-emerald-400"); } }
                ],
                "CHN": [
                    { id: "kusak_yol", title: "Kuşak ve Yol İnisiyatifi", desc: "+10 Sivil Fabrika", reward: () => { GameState.countries.CHN.civFactories += 10; log(`MİLLİ ODAK: ${GameState.countries.CHN.name} - Global lojistik ağı genişledi.`, "text-emerald-400"); } },
                    { id: "yari_iletken", title: "Yarı İletken Yerlileştirme", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.CHN.milFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.CHN.name} - Yerli çip üretimi başladı.`, "text-emerald-400"); } }
                ],
                "IND": [
                    { id: "make_in_india", title: "Make in India Atılımı", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.IND.milFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.IND.name} - Yerli üretim devrimi başladı.`, "text-emerald-400"); } },
                    { id: "guney_asya_liderlik", title: "Güney Asya Liderliği", desc: "+1000 Hazine", reward: () => { GameState.countries.IND.money += 1000; log(`MİLLİ ODAK: ${GameState.countries.IND.name} - Bölgesel güç pozisyonu güçlendi.`, "text-emerald-400"); } }
                ],
                "BRA": [
                    { id: "amazon_koruma", title: "Amazon Koruma ve Kalkınma", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.BRA.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.BRA.name} - Amazon koruma alanı genişledi.`, "text-emerald-400"); } },
                    { id: "brics_kopru", title: "BRICS+ Ticaret Köprüsü", desc: "+500 Hazine", reward: () => { GameState.countries.BRA.money += 500; log(`MİLLİ ODAK: ${GameState.countries.BRA.name} - BRICS ile ticaret köprüsü kuruldu.`, "text-emerald-400"); } }
                ],
                "KOR": [
                    { id: "kalkan_kalkan", title: "Kalkan Kalkan (Füze Savunma)", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.KOR.milFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.KOR.name} - Hava savunma kalkanı tamamlandı.`, "text-emerald-400"); } },
                    { id: "yari_iletken_devrim", title: "Yarı İletken Devrim", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.KOR.civFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.KOR.name} - Çip teknolojisinde atılım yapıldı.`, "text-emerald-400"); } }
                ],
                "ESP": [
                    { id: "akdeniz_lojistik", title: "Akdeniz Lojistik Merkezi", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.ESP.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.ESP.name} - Akdeniz lojistiği güçlendi.`, "text-emerald-400"); } },
                    { id: "ab_yesil_mutabakat", title: "AB Yeşil Mutabakatı", desc: "+300 Hazine", reward: () => { GameState.countries.ESP.money += 300; log(`MİLLİ ODAK: ${GameState.countries.ESP.name} - Yeşil mutabakata katılım sağlandı.`, "text-emerald-400"); } }
                ],
                "SAU": [
                    { id: "vizyon_2030", title: "Vizyon 2030 Hamlesi", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.SAU.civFactories += 5; log(`MİLLİ ODAK: ${GameState.countries.SAU.name} - Vizyon 2030 hedeflerine ulaşıldı.`, "text-emerald-400"); } },
                    { id: "bolgesel_baris", title: "Bölgesel Barış Diplomasisi", desc: "+1000 Hazine", reward: () => { GameState.countries.SAU.money += 1000; log(`MİLLİ ODAK: ${GameState.countries.SAU.name} - Diplomatik başarı elde edildi.`, "text-emerald-400"); } }
                ],
                "MEX": [
                    { id: "nearshoring", title: "Nearshoring (Üretim Üssü)", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.MEX.civFactories += 3; log(`MİLLİ ODAK: ${GameState.countries.MEX.name} - Üretim üssü olma süreci başladı.`, "text-emerald-400"); } },
                    { id: "kuzey_amerika_entegrasyonu", title: "Kuzey Amerika Entegrasyonu", desc: "+500 Hazine", reward: () => { GameState.countries.MEX.money += 500; log(`MİLLİ ODAK: ${GameState.countries.MEX.name} - Ticari entegrasyon tamamlandı.`, "text-emerald-400"); } }
                ],
                "ZAF": [
                    { id: "afrika_serbest_ticaret", title: "Afrika Serbest Ticaret Bölgesi", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.ZAF.civFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.ZAF.name} - Afrika pazarına erişim arttı.`, "text-emerald-400"); } },
                    { id: "maden_isleme", title: "Maden İşleme Kapasitesi", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.ZAF.milFactories += 2; log(`MİLLİ ODAK: ${GameState.countries.ZAF.name} - Maden işleme teknolojisi modernize edildi.`, "text-emerald-400"); } }
                ],
                "UKR": [
                    { id: "batı_entegrasyonu", title: "Avrupa Entegrasyonu", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.UKR.civFactories += 4; log(`MİLLİ ODAK: Ukrayna - Avrupa fonları sivil sanayiyi büyüttü.`, "text-emerald-400"); } },
                    { id: "savunma_hattı", title: "Dinyeper Savunma Doktrini", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.UKR.milFactories += 3; log(`MİLLİ ODAK: Ukrayna - Savunma sanayii üretime hız verdi.`, "text-emerald-400"); } }
                ],
                "GRC": [
                    { id: "ege_kalkınma", title: "Ege Deniz Ticareti", desc: "+1500 Hazine", reward: () => { GameState.countries.GRC.money += 1500; log(`MİLLİ ODAK: Yunanistan - Deniz ticaret filoları modernize edildi.`, "text-emerald-400"); } },
                    { id: "ordu_modernizasyon", title: "Sparta Doktrini", desc: "+50,000 İnsan Gücü", reward: () => { GameState.countries.GRC.manpower += 50000; log(`MİLLİ ODAK: Yunanistan - Seferberlik yasaları genişletildi.`, "text-emerald-400"); } }
                ],
                "NLD": [
                    { id: "liman_genisletme", title: "Rotterdam Genişletmesi", desc: "+6 Sivil Fabrika", reward: () => { GameState.countries.NLD.civFactories += 6; log(`MİLLİ ODAK: Hollanda - Rotterdam limanı Avrupa'nın kalbi oldu.`, "text-emerald-400"); } }
                ],
                "SWE": [
                    { id: "skandinav_endustri", title: "Scania Ağır Sanayii", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.SWE.milFactories += 4; log(`MİLLİ ODAK: İsveç - Yerli çelik ve silah sanayii zirvede.`, "text-emerald-400"); } }
                ],
                "FIN": [
                    { id: "mannerheim_hattı", title: "Sisu Savunma İstihkamı", desc: "+40,000 İnsan Gücü", reward: () => { GameState.countries.FIN.manpower += 40000; log(`MİLLİ ODAK: Finlandiya - Zorlu kış doktrini orduyu güçlendirdi.`, "text-emerald-400"); } }
                ],
                "NOR": [
                    { id: "petrol_fonu", title: "Kuzey Denizi Petrol Fonu", desc: "+3000 Hazine", reward: () => { GameState.countries.NOR.money += 3000; log(`MİLLİ ODAK: Norveç - Devlet fonları rekor seviyeye ulaştı.`, "text-emerald-400"); } }
                ],
                "DNK": [
                    { id: "bogaz_kontrolu", title: "Baltık Geçiş Rejimi", desc: "+1000 Hazine", reward: () => { GameState.countries.DNK.money += 1000; log(`MİLLİ ODAK: Danimarka - Deniz ticaret vergileri artırıldı.`, "text-emerald-400"); } }
                ],
                "CHE": [
                    { id: "alp_kalesi", title: "Alp Reduıt Tahkimatı", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.CHE.civFactories += 2; log(`MİLLİ ODAK: İsviçre - Alp sığınakları ve bankacılık altyapısı güçlendirildi.`, "text-emerald-400"); } }
                ],
                "BEL": [
                    { id: "avrupa_kalbi", title: "Brüksel Bürokrasisi", desc: "+1200 Hazine", reward: () => { GameState.countries.BEL.money += 1200; log(`MİLLİ ODAK: Belçika - Uluslararası ticaret anlaşmaları yapıldı.`, "text-emerald-400"); } }
                ],
                "ROU": [
                    { id: "karpat_savunması", title: "Karpat Sanayileşmesi", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.ROU.milFactories += 3; log(`MİLLİ ODAK: Romanya - Karpat lojistik hatları kuruldu.`, "text-emerald-400"); } }
                ],
                "CZE": [
                    { id: "skoda_uretim", title: "Skoda Silah Fabrikaları", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.CZE.milFactories += 4; log(`MİLLİ ODAK: Çekya - Ağır mühimmat üretimi tavan yaptı.`, "text-emerald-400"); } }
                ],
                "HUN": [
                    { id: "budapeste_savunma", title: "Tuna Savunma Planı", desc: "+30,000 İnsan Gücü", reward: () => { GameState.countries.HUN.manpower += 30000; log(`MİLLİ ODAK: Macaristan - Ulusal muhafız birlikleri kuruldu.`, "text-emerald-400"); } }
                ],
                "ISR": [
                    { id: "demir_kubbe", title: "Teknolojik Üstünlük", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.ISR.milFactories += 4; log(`MİLLİ ODAK: İsrail - Askeri teknoloji ve siber savunma yatırımları.`, "text-emerald-400"); } },
                    { id: "hazineler", title: "Yüksek Teknoloji İhracatı", desc: "+2000 Hazine", reward: () => { GameState.countries.ISR.money += 2000; log(`MİLLİ ODAK: İsrail - Silikon Vadisi yatırımları meyvesini verdi.`, "text-emerald-400"); } }
                ],
                "IRN": [
                    { id: "pers_koridoru", title: "Körfez Lojistik Üstünlüğü", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.IRN.milFactories += 3; log(`MİLLİ ODAK: İran - Hürmüz Boğazı istihkamları artırıldı.`, "text-emerald-400"); } },
                    { id: "seferberlik", title: "Besic Seferberliği", desc: "+120,000 İnsan Gücü", reward: () => { GameState.countries.IRN.manpower += 120000; log(`MİLLİ ODAK: İran - Devrim muhafızları yeni tugaylar kurdu.`, "text-emerald-400"); } }
                ],
                "EGY": [
                    { id: "suveys_kanalı", title: "Süveyş Kanalı Genişletmesi", desc: "+2500 Hazine", reward: () => { GameState.countries.EGY.money += 2500; log(`MİLLİ ODAK: Mısır - Kanal geçiş ücretleri hazineyi doldurdu.`, "text-emerald-400"); } },
                    { id: "sinai_hattı", title: "Kahire Ağır Sanayii", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.EGY.civFactories += 4; log(`MİLLİ ODAK: Mısır - Nil deltası endüstri merkezleri kuruldu.`, "text-emerald-400"); } }
                ],
                "PAK": [
                    { id: "oruz_savunma", title: "Keşmir Doktrini", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.PAK.milFactories += 4; log(`MİLLİ ODAK: Pakistan - Stratejik savunma ve mühimmat fabrikaları açıldı.`, "text-emerald-400"); } },
                    { id: "nufus_gucu", title: "İndus Seferberliği", desc: "+150,000 İnsan Gücü", reward: () => { GameState.countries.PAK.manpower += 150000; log(`MİLLİ ODAK: Pakistan - Ordu kadroları genişletildi.`, "text-emerald-400"); } }
                ],
                "IDN": [
                    { id: "takımada_ticareti", title: "Cakarta Endüstri Bölgesi", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.IDN.civFactories += 5; log(`MİLLİ ODAK: Endonezya - Adalar arası ticaret ve lojistik ağı.`, "text-emerald-400"); } }
                ],
                "TWN": [
                    { id: "tsmc_fabrikaları", title: "Yarı İletken Tekeli", desc: "+6 Sivil Fabrika", reward: () => { GameState.countries.TWN.civFactories += 6; log(`MİLLİ ODAK: Tayvan - Çip üretimi küresel pazarı domine etti.`, "text-emerald-400"); } }
                ],
                "PRK": [
                    { id: "juche_doktrini", title: "Juche Ağır Sanayii", desc: "+5 Askeri Fabrika", reward: () => { GameState.countries.PRK.milFactories += 5; log(`MİLLİ ODAK: Kuzey Kore - Fabrikalar tamamen ordu üretimine ayrıldı.`, "text-emerald-400"); } },
                    { id: "toplu_askerlik", title: "Yüce Lider Seferberliği", desc: "+200,000 İnsan Gücü", reward: () => { GameState.countries.PRK.manpower += 200000; log(`MİLLİ ODAK: Kuzey Kore - Devrim ordusu safları sıklaştırdı.`, "text-emerald-400"); } }
                ],
                "ARG": [
                    { id: "pampa_tarım", title: "Pampa Tarım Reformu", desc: "+1800 Hazine", reward: () => { GameState.countries.ARG.money += 1800; log(`MİLLİ ODAK: Arjantin - Tarım ihracatı ekonomiyi kurtarıyor.`, "text-emerald-400"); } }
                ],
                "AZE": [
                    { id: "baku_petrol", title: "Hazar Enerji Koridoru", desc: "+4 Sivil Fabrika, +1500 Hazine", reward: () => { GameState.countries.AZE.civFactories += 4; GameState.countries.AZE.money += 1500; log(`MİLLİ ODAK: Azerbaycan - Şahdeniz ve Bakü hatları tam kapasite çalışıyor.`, "text-emerald-400"); } },
                    { id: "modern_ordu", title: "Karabağ Doktrini", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.AZE.milFactories += 3; log(`MİLLİ ODAK: Azerbaycan - İHA ve mühimmat üretim hatları kuruldu.`, "text-emerald-400"); } }
                ],
                "COL": [
                    { id: "col_1", title: "Bogota Sanayii", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.COL.civFactories += 3; log(`MİLLİ ODAK: Kolombiya - Yerli sanayi büyüyor.`, "text-emerald-400"); } }
                ],
                "VEN": [
                    { id: "ven_1", title: "Orinoco Petrolü", desc: "+2000 Hazine", reward: () => { GameState.countries.VEN.money += 2000; log(`MİLLİ ODAK: Venezuela - Petrol gelirleri arttı.`, "text-emerald-400"); } }
                ],
                "CHL": [
                    { id: "chl_1", title: "And Çeliği", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.CHL.milFactories += 3; log(`MİLLİ ODAK: Şili - Maden ve çelik üretimi güçlendi.`, "text-emerald-400"); } }
                ],
                "PER": [
                    { id: "per_1", title: "Lima Ticareti", desc: "+1000 Hazine", reward: () => { GameState.countries.PER.money += 1000; log(`MİLLİ ODAK: Peru - Liman ve ticaret gelirleri arttı.`, "text-emerald-400"); } }
                ],
                "ZAF": [
                    { id: "zaf_1", title: "Pretoria Madenleri", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.ZAF.civFactories += 4; log(`MİLLİ ODAK: Güney Afrika - Madencilik sektörü büyüyor.`, "text-emerald-400"); } }
                ],
                "NGA": [
                    { id: "nga_1", title: "Lagos Endüstrisi", desc: "+80K İnsan Gücü", reward: () => { GameState.countries.NGA.manpower += 80000; log(`MİLLİ ODAK: Nijerya - Ordu ve nüfus artışı.`, "text-emerald-400"); } }
                ],
                "DZA": [
                    { id: "dza_1", title: "Sahra Gazı", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.DZA.milFactories += 3; log(`MİLLİ ODAK: Cezayir - Gaz ihracatı ve savunma sanayii.`, "text-emerald-400"); } }
                ],
                "MAR": [
                    { id: "mar_1", title: "Kazablanka Limanı", desc: "+1200 Hazine", reward: () => { GameState.countries.MAR.money += 1200; log(`MİLLİ ODAK: Fas - Ticaret ve liman gelirleri arttı.`, "text-emerald-400"); } }
                ],
                "TUN": [
                    { id: "tun_1", title: "Kartaca Turizmi", desc: "+800 Hazine", reward: () => { GameState.countries.TUN.money += 800; log(`MİLLİ ODAK: Tunus - Turizm ve ticaret büyüyor.`, "text-emerald-400"); } }
                ],
                "LBY": [
                    { id: "lby_1", title: "Trablus Tahkimatı", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.LBY.milFactories += 2; log(`MİLLİ ODAK: Libya - Savunma sanayii güçlendi.`, "text-emerald-400"); } }
                ],
                "SDN": [
                    { id: "sdn_1", title: "Hartum Seferberliği", desc: "+40K İnsan Gücü", reward: () => { GameState.countries.SDN.manpower += 40000; log(`MİLLİ ODAK: Sudan - Seferberlik çalışmaları.`, "text-emerald-400"); } }
                ],
                "ETH": [
                    { id: "eth_1", title: "Rönesans Barajı", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.ETH.civFactories += 3; log(`MİLLİ ODAK: Etiyopya - Büyük altyapı projeleri.`, "text-emerald-400"); } }
                ],
                "KEN": [
                    { id: "ken_1", title: "Nairobi Altyapısı", desc: "+1000 Hazine", reward: () => { GameState.countries.KEN.money += 1000; log(`MİLLİ ODAK: Kenya - Bölgesel ticaret merkezi.`, "text-emerald-400"); } }
                ],
                "AGO": [
                    { id: "ago_1", title: "Luanda Madenleri", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.AGO.milFactories += 2; log(`MİLLİ ODAK: Angola - Maden gelirleri savunma için kullanılıyor.`, "text-emerald-400"); } }
                ],
                "IRQ": [
                    { id: "irq_1", title: "Bağdat Yeniden İnşa", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.IRQ.civFactories += 3; log(`MİLLİ ODAK: Irak - Yeniden yapılandırma devam ediyor.`, "text-emerald-400"); } }
                ],
                "SYR": [
                    { id: "syr_1", title: "Şam İstihkamları", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.SYR.milFactories += 3; log(`MİLLİ ODAK: Suriye - Savunma hatları tahkim edildi.`, "text-emerald-400"); } }
                ],
                "JOR": [
                    { id: "jor_1", title: "Akabe Koridoru", desc: "+1000 Hazine", reward: () => { GameState.countries.JOR.money += 1000; log(`MİLLİ ODAK: Ürdün - Ticaret koridoru aktif.`, "text-emerald-400"); } }
                ],
                "LBN": [
                    { id: "lbn_1", title: "Beyrut Limanı", desc: "+500 Hazine", reward: () => { GameState.countries.LBN.money += 500; log(`MİLLİ ODAK: Lübnan - Liman ticareti canlanıyor.`, "text-emerald-400"); } }
                ],
                "OMN": [
                    { id: "omn_1", title: "Maskat Dokları", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.OMN.civFactories += 2; log(`MİLLİ ODAK: Umman - Liman altyapısı genişletildi.`, "text-emerald-400"); } }
                ],
                "YEM": [
                    { id: "yem_1", title: "Aden Direnişi", desc: "+30K İnsan Gücü", reward: () => { GameState.countries.YEM.manpower += 30000; log(`MİLLİ ODAK: Yemen - Savunma seferberliği.`, "text-emerald-400"); } }
                ],
                "KWT": [
                    { id: "kwt_1", title: "Kuveyt Yatırım Fonu", desc: "+3000 Hazine", reward: () => { GameState.countries.KWT.money += 3000; log(`MİLLİ ODAK: Kuveyt - Fonlar ekonomiyi destekliyor.`, "text-emerald-400"); } }
                ],
                "QAT": [
                    { id: "qat_1", title: "Doha Sıvı Gaz (LNG)", desc: "+4000 Hazine", reward: () => { GameState.countries.QAT.money += 4000; log(`MİLLİ ODAK: Katar - LNG ihracatı rekor kırıyor.`, "text-emerald-400"); } }
                ],
                "ARE": [
                    { id: "are_1", title: "Burç Halife Finans", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.ARE.civFactories += 4; log(`MİLLİ ODAK: BAE - Finans ve inşaat sektörü büyüyor.`, "text-emerald-400"); } }
                ],
                "GEO": [
                    { id: "geo_1", title: "Tiflis Altyapısı", desc: "+1 Sivil Fabrika", reward: () => { GameState.countries.GEO.civFactories += 1; log(`MİLLİ ODAK: Gürcistan - Altyapı yatırımları.`, "text-emerald-400"); } }
                ],
                "ARM": [
                    { id: "arm_1", title: "Erivan Savunması", desc: "+1 Askeri Fabrika", reward: () => { GameState.countries.ARM.milFactories += 1; log(`MİLLİ ODAK: Ermenistan - Savunma güçlendiriliyor.`, "text-emerald-400"); } }
                ],
                "KAZ": [
                    { id: "kaz_1", title: "Astana Ağır Sanayii", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.KAZ.civFactories += 4; log(`MİLLİ ODAK: Kazakistan - Sanayi büyüyor.`, "text-emerald-400"); } }
                ],
                "UZB": [
                    { id: "uzb_1", title: "Taşkent Pamuk ve Tekstil", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.UZB.civFactories += 3; log(`MİLLİ ODAK: Özbekistan - Tekstil sektörü canlandı.`, "text-emerald-400"); } }
                ],
                "TKM": [
                    { id: "tkm_1", title: "Cehennem Kapısı Gazı", desc: "+1500 Hazine", reward: () => { GameState.countries.TKM.money += 1500; log(`MİLLİ ODAK: Türkmenistan - Gaz ihracatı devam ediyor.`, "text-emerald-400"); } }
                ],
                "KGZ": [
                    { id: "kgz_1", title: "Tanrı Dağları İstihkamı", desc: "+1 Askeri Fabrika", reward: () => { GameState.countries.KGZ.milFactories += 1; log(`MİLLİ ODAK: Kırgızistan - Dağlık savunma güçlendirildi.`, "text-emerald-400"); } }
                ],
                "TJK": [
                    { id: "tjk_1", title: "Pamir Savunması", desc: "+15K İnsan Gücü", reward: () => { GameState.countries.TJK.manpower += 15000; log(`MİLLİ ODAK: Tacikistan - Dağlık birlikler aktif.`, "text-emerald-400"); } }
                ],
                "AFG": [
                    { id: "afg_1", title: "Kabil Direnişi", desc: "+50K İnsan Gücü", reward: () => { GameState.countries.AFG.manpower += 50000; log(`MİLLİ ODAK: Afganistan - Yerel savunma güçleri toplandı.`, "text-emerald-400"); } }
                ],
                "BGD": [
                    { id: "bgd_1", title: "Dakka Tekstil Sanayii", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.BGD.civFactories += 3; log(`MİLLİ ODAK: Bangladeş - Tekstil ihracatı rekor kırıyor.`, "text-emerald-400"); } }
                ],
                "LKA": [
                    { id: "lka_1", title: "Kolombo Limanı", desc: "+800 Hazine", reward: () => { GameState.countries.LKA.money += 800; log(`MİLLİ ODAK: Sri Lanka - Liman ticareti canlandı.`, "text-emerald-400"); } }
                ],
                "MMR": [
                    { id: "mmr_1", title: "Cunta Tahkimatı", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.MMR.milFactories += 2; log(`MİLLİ ODAK: Myanmar - Savunma sanayii güçlendi.`, "text-emerald-400"); } }
                ],
                "THA": [
                    { id: "tha_1", title: "Bangkok Serbest Ticaret", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.THA.civFactories += 3; log(`MİLLİ ODAK: Tayland - Serbest ticaret bölgesi genişledi.`, "text-emerald-400"); } }
                ],
                "VNM": [
                    { id: "vnm_1", title: "Hanoi Silah Sanayii", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.VNM.milFactories += 4; log(`MİLLİ ODAK: Vietnam - Savunma üretimi arttı.`, "text-emerald-400"); } }
                ],
                "MYS": [
                    { id: "mys_1", title: "Kuala Lumpur Çip Üretimi", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.MYS.civFactories += 3; log(`MİLLİ ODAK: Malezya - Çip sanayii büyüyor.`, "text-emerald-400"); } }
                ],
                "SGP": [
                    { id: "sgp_1", title: "Malakka Boğazı Tekeli", desc: "+3000 Hazine", reward: () => { GameState.countries.SGP.money += 3000; log(`MİLLİ ODAK: Singapur - Boğaz ticareti rekor kırıyor.`, "text-emerald-400"); } }
                ],
                "PHL": [
                    { id: "phl_1", title: "Manila Tersaneleri", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.PHL.civFactories += 2; log(`MİLLİ ODAK: Filipinler - Denizcilik sanayii güçlendi.`, "text-emerald-400"); } }
                ],
                "NZL": [
                    { id: "nzl_1", title: "Auckland Lojistiği", desc: "+1000 Hazine", reward: () => { GameState.countries.NZL.money += 1000; log(`MİLLİ ODAK: Yeni Zelanda - Ticaret ve lojistik büyüyor.`, "text-emerald-400"); } }
                ],
                "PRT": [
                    { id: "prt_1", title: "Lizbon Liman Gelişimi", desc: "+1200 Hazine", reward: () => { GameState.countries.PRT.money += 1200; log(`MİLLİ ODAK: Portekiz - Liman altyapısı modernize edildi.`, "text-emerald-400"); } }
                ],
                "IRL": [
                    { id: "irl_1", title: "Dublin Teknoloji Üssü", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.IRL.civFactories += 2; log(`MİLLİ ODAK: İrlanda - Teknoloji sektörü büyüyor.`, "text-emerald-400"); } }
                ],
                "SVK": [
                    { id: "svk_1", title: "Bratislava Otomotiv", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.SVK.milFactories += 2; log(`MİLLİ ODAK: Slovakya - Otomotiv ve savunma sanayii.`, "text-emerald-400"); } }
                ],
                "HRV": [
                    { id: "hrv_1", title: "Adriyatik Donanma Üssü", desc: "+1000 Hazine", reward: () => { GameState.countries.HRV.money += 1000; log(`MİLLİ ODAK: Hırvatistan - Deniz ticaret gelirleri arttı.`, "text-emerald-400"); } }
                ],
                "SRB": [
                    { id: "srb_1", title: "Belgrad Fabrikaları", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.SRB.milFactories += 2; log(`MİLLİ ODAK: Sırbistan - Savunma sanayii güçleniyor.`, "text-emerald-400"); } }
                ],
                "BGR": [
                    { id: "bgr_1", title: "Sofya Savunma Hattı", desc: "+20K İnsan Gücü", reward: () => { GameState.countries.BGR.manpower += 20000; log(`MİLLİ ODAK: Bulgaristan - Seferberlik çalışmaları.`, "text-emerald-400"); } }
                ],
                "CUB": [
                    { id: "cub_1", title: "Havana Devrim Hattı", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.CUB.milFactories += 2; log(`MİLLİ ODAK: Küba - Savunma üretimi devam ediyor.`, "text-emerald-400"); } }
                ],
                "PAN": [
                    { id: "pan_1", title: "Panama Kanalı Geliri", desc: "+2000 Hazine", reward: () => { GameState.countries.PAN.money += 2000; log(`MİLLİ ODAK: Panama - Kanal gelirleri rekor kırıyor.`, "text-emerald-400"); } }
                ],
                "MNG": [
                    { id: "bozkir_suvarileri", title: "Bozkır Süvarileri", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.MNG.milFactories += 2; log(`MİLLİ ODAK: Moğolistan - Mobil birlikler güçlendirildi.`, "text-emerald-400"); } }
                ],
                "LUX": [
                    { id: "celik_devleri", title: "ARBED Çelik Sanayii", desc: "+6 Sivil Fabrika", reward: () => { GameState.countries.LUX.civFactories += 6; log(`MİLLİ ODAK: Lüksemburg - Küçük dev üretim atağına kalktı.`, "text-emerald-400"); } }
                ],
                "ISL": [
                    { id: "jeotermal_enerji", title: "Jeotermal Altyapı", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.ISL.civFactories += 3; log(`MİLLİ ODAK: İzlanda - Enerji üretimi optimize edildi.`, "text-emerald-400"); } }
                ],
                "BOL": [
                    { id: "andin_maden", title: "Kalay Madenleri", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.BOL.civFactories += 4; log(`MİLLİ ODAK: Bolivya - Madencilik sektörü büyüyor.`, "text-emerald-400"); } }
                ],
                "ECU": [
                    { id: "galapagos_ussu", title: "Galapagos İkmal Üssü", desc: "+1500 Hazine", reward: () => { GameState.countries.ECU.money += 1500; log(`MİLLİ ODAK: Ekvador - Liman gelirleri kasada.`, "text-emerald-400"); } }
                ],
                "GHA": [
                    { id: "altin_sahili", title: "Altın Sahili Ticareti", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.GHA.civFactories += 5; log(`MİLLİ ODAK: Gana - Maden ihracatı artırıldı.`, "text-emerald-400"); } }
                ],
                "ALB": [
                    { id: "adriyatik_tahkimat", title: "Adriyatik Savunma Hattı", desc: "+2 Askeri Fabrika", reward: () => { GameState.countries.ALB.milFactories += 2; log(`MİLLİ ODAK: Arnavutluk - Kıyı savunması güçlendirildi.`, "text-emerald-400"); } }
                ],
                "EST": [
                    { id: "baltik_dijital", title: "Baltık Ticaret Ağı", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.EST.civFactories += 3; log(`MİLLİ ODAK: Estonya - Ticaret ağları modernize edildi.`, "text-emerald-400"); } }
                ],
                "LVA": [
                    { id: "riga_tersaneleri", title: "Riga Endüstri Bölgesi", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.LVA.civFactories += 3; log(`MİLLİ ODAK: Letonya - Üretim hatları genişletildi.`, "text-emerald-400"); } }
                ],
                "LTU": [
                    { id: "vilnius_savunma", title: "Demir Kurt Seferberliği", desc: "+20K İnsan Gücü", reward: () => { GameState.countries.LTU.manpower += 20000; log(`MİLLİ ODAK: Litvanya - Savunma tugayları kuruldu!`, "text-emerald-400"); } }
                ],
                "URY": [
                    { id: "latin_finans", title: "Montevideo Serbest Bölgesi", desc: "+3 Sivil Fabrika, +2000 Hazine", reward: () => { GameState.countries.URY.civFactories += 3; GameState.countries.URY.money += 2000; log(`MİLLİ ODAK: Uruguay finans merkezi haline geldi.`, "text-emerald-400"); } }
                ],
                "PRY": [
                    { id: "chaco_tahkimat", title: "Chaco Sınır Hattı", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.PRY.milFactories += 3; log(`MİLLİ ODAK: Paraguay savunma sanayisini kurdu.`, "text-emerald-400"); } }
                ],
                "GTM": [
                    { id: "maya_tarim", title: "Tarım Reformu", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.GTM.civFactories += 4; log(`MİLLİ ODAK: Guatemala tarımsal üretimi artırdı.`, "text-emerald-400"); } }
                ],
                "CRI": [
                    { id: "ordu_silahsizlanma", title: "Barışçıl Bütçe", desc: "+6 Sivil Fabrika, +4000 Hazine", reward: () => { GameState.countries.CRI.civFactories += 6; GameState.countries.CRI.money += 4000; log(`MİLLİ ODAK: Kosta Rika bütçesini kalkınmaya harcıyor.`, "text-emerald-400"); } }
                ],
                "DOM": [
                    { id: "karayip_ticareti", title: "Karayip Liman Ağı", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.DOM.civFactories += 3; log(`MİLLİ ODAK: Dominik lojistik merkez oldu.`, "text-emerald-400"); } }
                ],
                "SEN": [
                    { id: "dakar_limani", title: "Dakar Stratejik Üssü", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.SEN.civFactories += 4; log(`MİLLİ ODAK: Senegal ticaret hacmini büyüttü.`, "text-emerald-400"); } }
                ],
                "CIV": [
                    { id: "kakao_monopol", title: "Küresel Kakao İhracatı", desc: "+5 Sivil Fabrika, +2000 Hazine", reward: () => { GameState.countries.CIV.civFactories += 5; GameState.countries.CIV.money += 2000; log(`MİLLİ ODAK: Fildişi Sahili kasayı dolduruyor.`, "text-emerald-400"); } }
                ],
                "SSD": [
                    { id: "petrol_korumasi", title: "Nile Petrol Sahaları", desc: "+3000 Hazine", reward: () => { GameState.countries.SSD.money += 3000; log(`MİLLİ ODAK: Güney Sudan petrol gelirlerini güvenceye aldı.`, "text-emerald-400"); } }
                ],
                "UGA": [
                    { id: "viktorya_sanayi", title: "Viktorya Gölü Projeleri", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.UGA.milFactories += 4; log(`MİLLİ ODAK: Uganda askeri üretime yüklendi.`, "text-emerald-400"); } }
                ],
                "TZA": [
                    { id: "darüsselam_lojistik", title: "Doğu Afrika Kapısı", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.TZA.civFactories += 5; log(`MİLLİ ODAK: Tanzanya altyapısını güçlendirdi.`, "text-emerald-400"); } }
                ],
                "ZMB": [
                    { id: "bakir_madenleri", title: "Bakır Kuşağı Yatırımları", desc: "+5 Sivil Fabrika", reward: () => { GameState.countries.ZMB.civFactories += 5; log(`MİLLİ ODAK: Zambiya madencilik atağı başlattı.`, "text-emerald-400"); } }
                ],
                "MOZ": [
                    { id: "hint_denizi_ticaret", title: "Kıyı Lojistiği", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.MOZ.civFactories += 3; log(`MİLLİ ODAK: Mozambik limanları genişletildi.`, "text-emerald-400"); } }
                ],
                "MDG": [
                    { id: "ada_izolasyonu", title: "Kendi Kendine Yeten Ada", desc: "+4 Sivil Fabrika", reward: () => { GameState.countries.MDG.civFactories += 4; log(`MİLLİ ODAK: Madagaskar sanayi altyapısı kurdu.`, "text-emerald-400"); } }
                ],
                "LBR": [
                    { id: "kauçuk_anlasmasi", title: "Firestone Kauçuk Anlaşması", desc: "+2 Sivil, +2 Askeri Fabrika", reward: () => { GameState.countries.LBR.civFactories += 2; GameState.countries.LBR.milFactories += 2; log(`MİLLİ ODAK: Liberya hammadde ticaretini açtı.`, "text-emerald-400"); } }
                ],
                "SVN": [
                    { id: "alp_endüstrisi", title: "Hassas Sanayi Atölyeleri", desc: "+3 Askeri Fabrika", reward: () => { GameState.countries.SVN.milFactories += 3; log(`MİLLİ ODAK: Slovenya askeri teknoloji üretiyor.`, "text-emerald-400"); } }
                ],
                "MKD": [
                    { id: "vardar_koridoru", title: "Vardar Lojistik Hattı", desc: "+2 Sivil Fabrika", reward: () => { GameState.countries.MKD.civFactories += 2; log(`MİLLİ ODAK: Kuzey Makedonya transit geçişleri güçlendirdi.`, "text-emerald-400"); } }
                ],
                "BIH": [
                    { id: "bosna_cephanelik", title: "Dağlık Bölge Fabrikaları", desc: "+4 Askeri Fabrika", reward: () => { GameState.countries.BIH.milFactories += 4; log(`MİLLİ ODAK: Bosna Hersek mühimmat üretimini artırdı.`, "text-emerald-400"); } }
                ],
                "MDA": [
                    { id: "tarim_sanayi", title: "Dinyester Havzası Tarımı", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.MDA.civFactories += 3; log(`MİLLİ ODAK: Moldova iç sanayiyi canlandırdı.`, "text-emerald-400"); } }
                ],
                "KHM": [
                    { id: "mekong_altyapi", title: "Mekong Havzası Gelişimi", desc: "+3 Sivil Fabrika", reward: () => { GameState.countries.KHM.civFactories += 3; log(`MİLLİ ODAK: Kamboçya lojistik hatları kurdu.`, "text-emerald-400"); } }
                ],
                "LAO": [
                    { id: "dag_tahkimat", title: "Dağlık Bölge Direnişi", desc: "+30K İnsan Gücü", reward: () => { GameState.countries.LAO.manpower += 30000; log(`MİLLİ ODAK: Laos zorlu dağ birliklerini topladı.`, "text-emerald-400"); } }
                ]
            },
            activeWars: [],
            trainingQueue: [],
            globalTension: 5,
            currentTab: "dashboard",
            alliances: [],          // {a, b, quality: 0-100}
            nonAggression: [],      // {a, b, weeksLeft}
            justifications: [],     // {target, progress, notified}
            relations: {},          // iso -> number
            tradeDeals: [],         // {partner, resource, amount, direction: 'buy'|'sell', weeksLeft}
            eventsLog: [],
            inbox: [],              // diplomatik mesajlar
            rebelActive: false,
            rebelProgress: 0,
            rebelWeeks: 0,
            lastAllyAidWeek: {},
            nuclear: { progress: 0, unlocked: false, warheads: 0 },
            settings: { sfx: true, autoSave: true, msgRare: true, tickMs: 1000 },
            gameOver: false,
            blocs: [],              // {id, name, members: [iso], leader}
            insults: [],
            mapMode: "political",   // political | ideology | tension | industry
            speedLevel: 3,          // 1-5
            puppets: {},            // overlordIso -> [puppetIso]
            militaryAccess: [],     // {from, to}
            factions: []            // {id, name, members, leader}
        };

        const nameToIso = {
            "Turkey": "TUR", "Germany": "DEU", "United States": "USA", "United States of America": "USA",
            "Russia": "RUS", "United Kingdom": "GBR", "France": "FRA", "Italy": "ITA",
            "Japan": "JPN", "Poland": "POL", "Austria": "AUT", "Canada": "CAN", "Australia": "AUS",
            "South Korea": "KOR", "Mexico": "MEX", "Saudi Arabia": "SAU", "Spain": "ESP", "China": "CHN",
            "South Africa": "ZAF", "Brazil": "BRA", "India": "IND",
"Ukraine": "UKR", "Greece": "GRC", "Netherlands": "NLD", "Sweden": "SWE", 
"Finland": "FIN", "Norway": "NOR", "Denmark": "DNK", "Switzerland": "CHE", 
"Belgium": "BEL", "Romania": "ROU", "Czechia": "CZE", "Czech Republic": "CZE", 
"Hungary": "HUN", "Israel": "ISR", "Iran": "IRN", "Egypt": "EGY", 
"Pakistan": "PAK", "Indonesia": "IDN", "Taiwan": "TWN", "North Korea": "PRK", 
"Argentina": "ARG", "Colombia": "COL", "Venezuela": "VEN", "Chile": "CHL", "Peru": "PER", "South Africa": "ZAF",
"Nigeria": "NGA", "Algeria": "DZA", "Morocco": "MAR", "Tunisia": "TUN", "Libya": "LBY",
"Sudan": "SDN", "Ethiopia": "ETH", "Kenya": "KEN", "Angola": "AGO", "Iraq": "IRQ",
"Syria": "SYR", "Jordan": "JOR", "Lebanon": "LBN", "Oman": "OMN", "Yemen": "YEM",
"Kuwait": "KWT", "Qatar": "QAT", "United Arab Emirates": "ARE", "Azerbaijan": "AZE", "Georgia": "GEO",
"Armenia": "ARM", "Kazakhstan": "KAZ", "Uzbekistan": "UZB", "Turkmenistan": "TKM", "Kyrgyzstan": "KGZ",
"Tajikistan": "TJK", "Afghanistan": "AFG", "Bangladesh": "BGD", "Sri Lanka": "LKA", "Myanmar": "MMR",
"Thailand": "THA", "Vietnam": "VNM", "Malaysia": "MYS", "Singapore": "SGP", "Philippines": "PHL",
"New Zealand": "NZL", "Austria": "AUT", "Portugal": "PRT", "Ireland": "IRL", "Slovakia": "SVK",
"Croatia": "HRV", "Serbia": "SRB", "Bulgaria": "BGR", "Cuba": "CUB", "Panama": "PAN",
"Mongolia": "MNG", "Luxembourg": "LUX", "Iceland": "ISL", "Bolivia": "BOL", "Ecuador": "ECU", "Ghana": "GHA", "Albania": "ALB", "Estonia": "EST", "Latvia": "LVA", "Lithuania": "LTU",
"Uruguay": "URY", "Paraguay": "PRY", "Guatemala": "GTM", "Costa Rica": "CRI", "Dominican Republic": "DOM", "Senegal": "SEN", "Ivory Coast": "CIV", "South Sudan": "SSD", "Uganda": "UGA", "Tanzania": "TZA", "Zambia": "ZMB", "Mozambique": "MOZ", "Madagascar": "MDG", "Liberia": "LBR", "Slovenia": "SVN", "Macedonia": "MKD", "Bosnia and Herz.": "BIH", "Moldova": "MDA", "Cambodia": "KHM", "Laos": "LAO"

        };

// === KAYIT SİSTEMİ ===
GameState.saveSlot = "save1"; // varsayılan slot

        // Lobi Ekranı Ülke Değişim Tetikleyicisi
        
/** Senaryoda en az 1 eyaleti olan ülkeler + tarihsel isimler */
function getScenarioPlayableCountries(scenarioId) {
    const pack = (typeof SCENARIOS !== "undefined" && SCENARIOS) ? SCENARIOS : {};
    const sc = pack[scenarioId] || pack.modern || null;
    const owners = (sc && sc.provinceOwners) ? sc.provinceOwners : (typeof provinceOwners !== "undefined" ? provinceOwners : {});
    const counts = {};
    Object.values(owners || {}).forEach(iso => {
        if (!iso || iso === "NEUTRAL") return;
        counts[iso] = (counts[iso] || 0) + 1;
    });
    const names = (sc && sc.countryNames) ? sc.countryNames : {};
    return Object.keys(counts)
        .filter(iso => counts[iso] >= 1 && GameState.countries[iso])
        .sort((a, b) => {
            const na = names[a] || GameState.countries[a].name || a;
            const nb = names[b] || GameState.countries[b].name || b;
            return na.localeCompare(nb, "tr");
        })
        .map(iso => ({
            iso,
            name: names[iso] || GameState.countries[iso].name || iso,
            provinces: counts[iso]
        }));
}

function refreshLobbyCountrySelect() {
    const sel = document.getElementById("lobby-country-select");
    const scenSel = document.getElementById("lobby-scenario-select");
    if (!sel) return;
    const scenId = scenSel ? scenSel.value : "modern";
    // Senaryo paketi henüz yoksa modern defaults
    let list = getScenarioPlayableCountries(scenId);
    if (!list.length) {
        // fallback: tüm GameState ülkeleri (paket yüklenmeden)
        list = Object.keys(GameState.countries || {}).map(iso => ({
            iso,
            name: GameState.countries[iso].name,
            provinces: 1
        }));
    }
    const prev = sel.value;
    sel.innerHTML = list.map(c =>
        `<option value="${c.iso}">${c.name}</option>`
    ).join("");
    if (list.some(c => c.iso === prev)) sel.value = prev;
    else if (list.length) sel.value = list[0].iso;
    if (typeof selectLobbyCountry === "function") selectLobbyCountry(sel.value);
}

function selectLobbyCountry(iso) {
            try { if (typeof sfx !== "undefined" && sfx && typeof sfx.playBlip === "function") sfx.playBlip(); } catch (e) {}
            const country = GameState.countries && GameState.countries[iso];
            if (!country) return;

// Sayfa yüklenirken log panelini dinamik olarak en dışa (BODY'ye) enjekte ediyoruz
(function injectLogPanel() {
    if (document.getElementById("log-panel")) return;

    const panel = document.createElement("div");
    panel.id = "log-panel";
    // z-[9999] ile ekrandaki her şeyi ezip geçiyoruz
    panel.className = "fixed bottom-2 left-1/2 -translate-x-1/2 z-[9999] w-[min(520px,90vw)] h-[100px] bg-[#030712]/92 backdrop-blur-sm p-2 rounded-lg border border-slate-800 flex flex-col justify-end overflow-hidden pointer-events-none shadow-lg";
    
    panel.innerHTML = `
        <div class="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-1 pointer-events-none text-center" style="letter-spacing:0.14em">Komuta günlüğü</div>
        <div id="log-content" class="overflow-y-auto font-mono text-[11px] leading-tight flex flex-col justify-end gap-0.5 scrollbar-none pointer-events-auto">
            <!-- Taktik Loglar -->
        </div>
    `;
    
    document.body.appendChild(panel);
})();

// Nüfusa göre Milyar veya Milyon yazdırma kısmı (null-safe)
            try {
                const pop = country.pop || 0;
                const popEl = document.getElementById("lobby-stat-pop");
                if (popEl) {
                    popEl.innerText = pop >= 1000000000
                        ? (pop / 1000000000).toFixed(1) + " Milyar"
                        : (pop / 1000000).toFixed(1) + " Milyon";
                }
                const divEl = document.getElementById("lobby-stat-div");
                if (divEl) {
                    const totalDiv = Object.values(country.divisions || {}).reduce((a, b) => a + (b || 0), 0);
                    divEl.innerText = totalDiv + " Tümen";
                }
                const civEl = document.getElementById("lobby-stat-civ");
                if (civEl) civEl.innerText = (country.civFactories || 0) + " Fabrika";
                const milEl = document.getElementById("lobby-stat-mil");
                if (milEl) milEl.innerText = (country.milFactories || 0) + " Fabrika";
                const goldEl = document.getElementById("lobby-stat-gold");
                if (goldEl) goldEl.innerText = (country.money || 0) + " 🪙";
                const ideoEl = document.getElementById("lobby-stat-ideo");
                if (ideoEl) ideoEl.innerText = country.ideology || "—";
                const flagEl = document.getElementById("lobby-country-flag");
                if (flagEl) {
                    const flagUrl = (typeof getFlagUrl === "function") ? getFlagUrl(iso) : `https://flagcdn.com/w320/${country.flag || "un"}.png`;
                    flagEl.src = (flagUrl && flagUrl.startsWith("http")) ? flagUrl.replace("/w40/", "/w320/") : flagUrl;
                }
                const scenSel = document.getElementById("lobby-scenario-select");
                const scenId = scenSel ? scenSel.value : (GameState.scenarioId || "modern");
                const sc = (typeof SCENARIOS !== "undefined" && SCENARIOS[scenId]) ? SCENARIOS[scenId] : null;
                const histName = (sc && sc.countryNames && sc.countryNames[iso]) ? sc.countryNames[iso] : country.name;
                const nameEl = document.getElementById("lobby-country-name");
                if (nameEl) nameEl.innerText = histName || iso;
            } catch (e) {
                console.warn("selectLobbyCountry UI:", e);
            }
        }

        // Initialize Lobby Stats on first script execute
        window.addEventListener("DOMContentLoaded", async () => {
            try { if (window._mapPackReady) await window._mapPackReady; } catch(e){}
            try { refreshLobbyCountrySelect(); } catch(e){}
            const sel = document.getElementById("lobby-country-select");
            selectLobbyCountry(sel ? sel.value : "TUR");
        });

// ========== YENİ HARİTA MOTORU (Eyalet bazlı) ==========
const svg = d3.select("#game-map");
try {
  svg.style("background", "#031a5c");
  const mc = document.getElementById("map-container");
  if (mc) mc.style.background = "#031a5c";
  const mainEl = mc && mc.parentElement;
  if (mainEl) mainEl.style.background = "#031a5c";
} catch (e) {}
const g = svg.append("g");

let _lastLodScale = 1;
const zoom = d3.zoom()
    .scaleExtent([0.25, 14])
    .filter((event) => {
        // Province split editor: block pan/drag (allow wheel zoom only if needed — fully block when drawing)
        if (window.__SC_SPLIT_EDITOR) {
            return false;
        }
        if (typeof mapEditorOpen !== "undefined" && mapEditorOpen &&
            typeof editorBrushMode !== "undefined" && editorBrushMode) {
            return event.type === "wheel";
        }
        return !event.ctrlKey && !event.button;
    })
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
        try { window.__SC_ZOOM_K = event.transform.k; if (typeof window.scOnZoomNames === "function") window.scOnZoomNames(event.transform.k); } catch (e) {}
        // LOD: uzaktan sınır çizgilerini kapat (FPS)
        const k = event.transform.k;
        if (Math.abs(k - _lastLodScale) > 0.12) {
            _lastLodScale = k;
            // LOD: uzak = sınır yok; orta = ince; yakın = net
            // İnce/zarif sınırlar — yakın zoomda bile kalın çizgi yok
            let sw = "0px", sc = "none";
            if (k >= 3.2) { sw = "0.28px"; sc = "rgba(7,10,19,0.85)"; }
            else if (k >= 1.6) { sw = "0.16px"; sc = "rgba(10,14,24,0.7)"; }
            else if (k >= 0.9) { sw = "0.08px"; sc = "rgba(10,14,24,0.45)"; }
            g.selectAll(".country-path")
                .style("stroke-width", sw)
                .style("stroke", sc);
        }
    });
svg.call(zoom);
try { window.scMapZoom = zoom; window.__SC_MAP_G = g.node(); } catch (e) {}

// ========== SENARYOLAR ==========
// (SCENARIOS üstte tanımlandı; diskten loadScenarioPack doldurur)


// Aktif senaryo sahiplikleri (runtime — senaryo yüklenince güncellenir)
let provinceOwners = {}; // senaryo yüklenince applyScenario doldurur
try { window.provinceOwners = provinceOwners; } catch (e) {}

// ========== EYALET VERİSİ (harici PROVINCE_DATA.json) ==========
// map.json gibi dış dosyadan yüklenir. Komşuluklar SADECE bu dosyadan gelir.
let PROVINCE_DATA = {};
let provinceDataReady = false;

function loadProvinceData() {
    return fetch(PROVINCE_DATA_URL)
        .then(r => {
            if (!r.ok) throw new Error("PROVINCE_DATA.json yüklenemedi: " + r.status);
            return r.json();
        })
        .then(data => {
            PROVINCE_DATA = data || {};
            provinceDataReady = true;
            console.log("PROVINCE_DATA yüklendi →", Object.keys(PROVINCE_DATA).length, "eyalet");
            return PROVINCE_DATA;
        })
        .catch(err => {
            console.warn("PROVINCE_DATA yükleme hatası:", err);
            provinceDataReady = false;
            PROVINCE_DATA = {};
            return {};
        });
}

function getProvinceInfo(name) {
    if (!name) return null;
    const d = PROVINCE_DATA[name];
    if (!d) return { neighbors: [], terrain: "unknown", climate: "unknown", primaryResource: "none", infrastructureLevel: 1 };
    return d;
}

/** Kara harekâtı / lojistik: yalnızca JSON neighbors */
function getProvinceNeighbors(name) {
    const d = getProvinceInfo(name);
    return (d && Array.isArray(d.neighbors)) ? d.neighbors.slice() : [];
}

function areProvincesAdjacent(a, b) {
    if (!a || !b) return false;
    const n = getProvinceNeighbors(a);
    return n.includes(b);
}

/** İklim + arazi → hareket çarpanı (1 = normal, <1 yavaş) */
function getMovementModifier(provinceName) {
    const d = getProvinceInfo(provinceName);
    if (!d) return 1;
    let m = 1;
    const t = d.terrain || "";
    const c = d.climate || "";
    if (t === "mountain") m *= 0.55;
    else if (t === "jungle") m *= 0.6;
    else if (t === "desert") m *= 0.7;
    else if (t === "tundra") m *= 0.65;
    else if (t === "forest") m *= 0.85;
    else if (t === "urban") m *= 0.9;
    else if (t === "coastal") m *= 0.95;
    if (c === "arctic") m *= 0.75;
    else if (c === "tropical" && t === "jungle") m *= 0.9;
    else if (c === "arid" && t === "desert") m *= 0.85;
    if ((d.infrastructureLevel || 0) === 0) m = 0; // impassable
    return Math.max(0, Math.min(1.2, m));
}

/** Savaşta savunmacı için arazi bonusu */
function getTerrainDefenseBonus(provinceName) {
    const d = getProvinceInfo(provinceName);
    if (!d) return 1;
    const t = d.terrain || "";
    if (t === "mountain") return 1.35;
    if (t === "jungle") return 1.25;
    if (t === "urban") return 1.2;
    if (t === "forest") return 1.15;
    if (t === "hills") return 1.12;
    if (t === "desert" || t === "tundra") return 0.95;
    return 1;
}

/** Ülkenin sahip olduğu eyaletlerden kaynak özeti */
function getCountryResourceSummary(iso) {
    const counts = {};
    Object.keys(provinceOwners).forEach(pName => {
        if (provinceOwners[pName] !== iso) return;
        const d = getProvinceInfo(pName);
        const r = (d && d.primaryResource) || "none";
        if (r === "none") return;
        counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
}

function formatProvinceTooltip(name) {
    const d = getProvinceInfo(name);
    const owner = getProvinceOwner(name);
    const ownerName = (typeof getCountryDisplayName === "function") ? getCountryDisplayName(owner) : owner;
    if (!d || d.terrain === "unknown") {
        return `${name.replace(/_/g, " ")} · sahip: ${ownerName}`;
    }
    const neigh = (d.neighbors || []).length;
    return `${name.replace(/_/g, " ")} · ${ownerName}
Arazi: ${d.terrain} · İklim: ${d.climate}
Kaynak: ${d.primaryResource} · Altyapı: ${d.infrastructureLevel}/5
Komşu: ${neigh}`;
}

// Harita ile birlikte eyalet verisini yükle
window._mapPackReady = Promise.all([
    loadProvinceData(),
    loadScenarioPack()
]).catch(err => console.warn(err));


// ========== TEKNOLOJİ ÇAĞI & ÜLKE İSİMLERİ ==========
function getTechEra() {
    return GameState.techEra || 3;
}
function getCountryDisplayName(iso) {
    if (!iso) return "—";
    const sc = (typeof SCENARIOS !== "undefined" && SCENARIOS[GameState.scenarioId]) ? SCENARIOS[GameState.scenarioId] : null;
    if (sc && sc.countryNames && sc.countryNames[iso]) return sc.countryNames[iso];
    const c = GameState.countries && GameState.countries[iso];
    return (c && c.name) ? c.name : iso;
}
function applyCountryNamesForScenario(sc) {
    if (!sc || !sc.countryNames || !GameState.countries) return;
    // Orijinal isimleri bir kez sakla
    Object.keys(GameState.countries).forEach(iso => {
        const c = GameState.countries[iso];
        if (!c._baseName) c._baseName = c.name;
        if (sc.countryNames[iso]) c.name = sc.countryNames[iso];
        else if (c._baseName) c.name = c._baseName;
    });
}
function eraBlocksNuclear() { return getTechEra() < 2; } // sadece modern + ww2 (ww2 pahalı)
function eraNuclearVeryHard() { return getTechEra() === 2; }
function eraBlocksAdvancedAir() { return getTechEra() === 1; }
function eraPrimitiveTanks() { return getTechEra() === 1; }



function getProvinceOwner(provinceName) {
    return provinceOwners[provinceName] || "NEUTRAL";
}

d3.json(MAP_JSON_URL).then(provinces => {
    // Her eyaleti path olarak çiz
    g.selectAll("path")
        .data(provinces)
        .enter()
        .append("path")
        .attr("d", d => d.path)
        .attr("class", "country-path")
        .attr("id", d => d.name.replace(/[^a-zA-Z0-9_]/g, "_"))  // id güvenli olsun
        .attr("data-name", d => d.name)
        .style("fill", d => {
            const owner = getProvinceOwner(d.name);
            return (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
        })
.style("stroke", "rgba(7,10,19,0.55)")
.style("stroke-width", 0.03)
.on("click", function(event, d) {
    handleProvinceClick(event, d);
})
.on("contextmenu", function(event, d) {
    event.preventDefault();
    handleProvinceClick(event, d);
})
.on("mouseover", function(event, d) {
    if (mapEditorOpen && typeof editorBrushMode !== "undefined" && editorBrushMode && typeof editorPainting !== "undefined" && editorPainting) {
        paintProvince(d.name, this);
    }
})
.on("mousemove", function(event, d) {
    if (mapEditorOpen && editorBrushMode && editorPainting) {
        paintProvince(d.name, this);
    }
});

    // Haritayı biraz ortala (bu map'in koordinat aralığına göre)
    const bounds = g.node().getBBox();
    const scale = Math.min(
        (window.innerWidth - 100) / bounds.width,
        (window.innerHeight - 100) / bounds.height
    ) * 0.9;
    
    svg.call(zoom.transform, d3.zoomIdentity
        .translate(window.innerWidth / 2, window.innerHeight / 2)
        .scale(scale)
        .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2)
    );

    console.log("Harita yüklendi →", provinces.length, "eyalet");
});

// Tıklama

// Renkleri yenile (fetih sonrası çağır)

function blendHexColors(a, b, t) {
    t = Math.max(0, Math.min(1, t == null ? 0.5 : t));
    function parse(h) {
        h = String(h || "#334155").replace("#", "");
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
    }
    var A = parse(a), B = parse(b);
    var r = Math.round(A[0] + (B[0]-A[0])*t);
    var g = Math.round(A[1] + (B[1]-A[1])*t);
    var bl = Math.round(A[2] + (B[2]-A[2])*t);
    return "#" + [r,g,bl].map(function(x){ var s=x.toString(16); return s.length<2?"0"+s:s; }).join("");
}
try { window.blendHexColors = blendHexColors; } catch (e) {}

function refreshMapColors() {
    ensureMapPatterns();
    const occ = GameState.occupations || {};
    const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
    d3.selectAll(".country-path").each(function() {
        const path = d3.select(this);
        const name = path.attr("data-name");
        if (!name) return;
        const owner = getProvinceOwner(name);
        const color = (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
        const occupier = occ[name];
        if (occupier && occupier !== owner) {
            // İşgal = renk karışımı (yasal sahip + işgalci); ele geçirme barışta
            const oColor = (GameState.countries[occupier] && GameState.countries[occupier].color) || "#fbbf24";
            const blended = (typeof blendHexColors === "function")
              ? blendHexColors(color, oColor, 0.48)
              : oColor;
            path.style("fill", blended);
            path.classed("prov-occupied", true);
            path.style("stroke", oColor);
            path.style("stroke-width", "0.22");
        } else {
            path.style("fill", color);
            path.classed("prov-occupied", false);
        }
        // İnce eyalet / kalın ülke sınırı
        let isCountryBorder = false;
        const nbs = (PD[name] && PD[name].neighbors) || [];
        for (let i = 0; i < nbs.length; i++) {
            const o2 = provinceOwners[nbs[i]];
            if (o2 && o2 !== owner) { isCountryBorder = true; break; }
        }
        if (isCountryBorder) {
            path.style("stroke", "rgba(0,0,0,0.55)").style("stroke-width", 0.28);
        } else {
            path.style("stroke", "rgba(0,0,0,0.15)").style("stroke-width", 0.025);
        }
    });
    if (typeof updateCapitalMarkers === "function") updateCapitalMarkers();
}

function ensureMapPatterns() {
    const svg = d3.select("#game-map");
    if (svg.empty()) return;
    let defs = svg.select("defs");
    if (defs.empty()) defs = svg.append("defs");
}

function ensureOccupierHatch(controllerIso, occupierIso) {
    const id = ("hatch_" + controllerIso + "_" + occupierIso).replace(/[^a-zA-Z0-9_]/g, "_");
    const svg = d3.select("#game-map");
    if (svg.empty()) return id;
    let defs = svg.select("defs");
    if (defs.empty()) defs = svg.append("defs");
    if (!defs.select("#" + id).empty()) return id;
    const cColor = (GameState.countries[controllerIso] && GameState.countries[controllerIso].color) || "#334155";
    const oColor = (GameState.countries[occupierIso] && GameState.countries[occupierIso].color) || "#fbbf24";
    const p = defs.append("pattern")
        .attr("id", id)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 8)
        .attr("height", 8)
        .attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 8).attr("height", 8).attr("fill", cColor);
    p.append("rect").attr("width", 4).attr("height", 8).attr("fill", oColor).attr("fill-opacity", 0.85);
    return id;
}

        // Sekme Değişimi
        function switchTab(tabId) {
            sfx.playBlip();
            GameState.currentTab = tabId;
            document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
            const targetBtn = document.getElementById(`tab-${tabId}`);
            if (targetBtn) targetBtn.classList.add("active");

            // Tüm panelleri gizle
            ["dashboard","production","military","economy","focus","research","diplomacy","province"].forEach(t => {
                const el = document.getElementById(`content-${t}`);
                if (el) el.classList.add("hidden");
            });

            // Hedef paneli göster
            const target = document.getElementById(`content-${tabId}`);
            if (target) target.classList.remove("hidden");

            // İçerikleri tazele
            refreshOpenTab();
        }

        // Açık sekmeyi her tick'te güncelle (canlı veri)
        function refreshOpenTab() {
            try { if (typeof renderV27Panel === 'function' && document.getElementById('v27-objectives')) renderV27Panel(); } catch(e){}

            const tab = GameState.currentTab || "dashboard";
            try {
                if (tab === "production" && typeof renderProductionTab === "function") renderProductionTab();
                if (tab === "focus" && typeof renderFocusTree === "function") renderFocusTree();
                if (tab === "research" && typeof renderResearchTab === "function") renderResearchTab();
                if (tab === "diplomacy" && typeof renderDiplomacyTab === "function") renderDiplomacyTab(true);
                if (tab === "economy" && typeof renderEconomyTab === "function") renderEconomyTab();
                if (tab === "military" && typeof renderMilitaryTab === "function") renderMilitaryTab();
                if (tab === "province" && typeof renderProvincePanel === "function") renderProvincePanel();
                if (tab === "diplomacy" && typeof renderDiplomacyTab === "function") renderDiplomacyTab();
                if (tab === "dashboard") {
                    if (typeof renderActiveWarsDisplay === "function") renderActiveWarsDisplay();
                    // Aktif odak göstergesi zaten gameTick içinde güncelleniyor
                }
            } catch (e) { console.warn("refreshOpenTab", e); }
        }

        // DİPLOMASİ RENDER

/** UI: kültür/din kartı + uyum yüzdesi */
function htmlCultureBlock(forIso, provinceName) {
    try {
        const id = (typeof getCountryIdentity === "function") ? getCountryIdentity(forIso) : { culture: "—", religion: "—", sect: "—", ethnicity: "—" };
        let pMeta = null;
        if (provinceName && typeof getProvinceCultureMeta === "function") {
            pMeta = getProvinceCultureMeta(provinceName);
        }
        const playerId = (typeof getCountryIdentity === "function") ? getCountryIdentity(GameState.player) : id;
        let harmony = 100;
        let risk = 0;
        let label = "Uyumlu";
        if (pMeta) {
            const mismatch = (typeof isProvinceMismatch === "function") && isProvinceMismatch(provinceName, forIso || GameState.player);
            const kin = (typeof areEthnicKin === "function") && pMeta.ethnicity && playerId.ethnicity && (pMeta.ethnicity === playerId.ethnicity || areEthnicKin(forIso, GameState.player));
            if (kin || !mismatch) { harmony = 100; label = `Etnik Uyum: %100 — ${pMeta.ethnicity || id.ethnicity} topluluğu`; risk = 0; }
            else {
                harmony = 35;
                if (pMeta.religion !== playerId.religion) harmony -= 15;
                if (pMeta.culture !== playerId.culture) harmony -= 15;
                harmony = Math.max(5, harmony);
                risk = 100 - harmony;
                label = `Uyum %${harmony} · Huzursuzluk riski %${risk}`;
            }
        } else if (forIso && forIso !== GameState.player) {
            const kin = (typeof areEthnicKin === "function") && areEthnicKin(forIso, GameState.player);
            harmony = kin ? 90 : (id.religion === playerId.religion ? 60 : 40);
            risk = 100 - harmony;
            label = kin ? `Akraba etnisite (${id.ethnicity})` : `Kültürel mesafe · uyum %${harmony}`;
        }
        const barColor = harmony >= 70 ? "bg-emerald-500" : harmony >= 40 ? "bg-yellow-500" : "bg-red-500";
        const show = pMeta || id;
        return `
        <div class="bg-slate-950/70 border border-slate-700 rounded-lg p-2.5 space-y-1.5">
          <div class="text-[9px] uppercase tracking-widest text-amber-400/90 font-black">🏛️ Kimlik</div>
          <div class="grid grid-cols-2 gap-1 text-[10px]">
            <div>Kültür: <span class="text-cyan-300 font-bold">${(pMeta||id).culture}</span></div>
            <div>Etnisite: <span class="text-cyan-300 font-bold">${(pMeta||id).ethnicity}</span></div>
            <div>Din: <span class="text-violet-300 font-bold">${(pMeta||id).religion}</span></div>
            <div>Mezhep: <span class="text-violet-300 font-bold">${(pMeta||id).sect}</span></div>
          </div>
          <div class="text-[9px] text-slate-400 pt-0.5">${label}</div>
          <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full ${barColor} transition-all" style="width:${harmony}%"></div>
          </div>
        </div>`;
    } catch (e) {
        return "";
    }
}

function htmlAllianceStatus() {
    const allies = (GameState.alliances || []).filter(a => a.a === GameState.player || a.b === GameState.player);
    const names = allies.map(a => {
        const other = a.a === GameState.player ? a.b : a.a;
        return (GameState.countries[other] && GameState.countries[other].name) || other;
    });
    return `
    <div class="bg-slate-950/70 border border-indigo-900/50 rounded-lg p-2.5 text-[10px] space-y-1">
      <div class="flex justify-between font-black text-indigo-300 uppercase tracking-wider text-[9px]">
        <span>🛡️ İttifaklar</span><span>${allies.length} / 2</span>
      </div>
      <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-500" style="width:${(allies.length/2)*100}%"></div>
      </div>
      <div class="text-slate-400">${names.length ? names.join(" · ") : "İttifak yok"}</div>
    </div>`;
}

function htmlRelationGate(relation) {
    const protected_ = relation >= 10;
    return `
    <div class="text-[9px] ${protected_ ? "text-emerald-400" : "text-slate-500"} bg-slate-950/50 rounded px-2 py-1 border border-slate-800">
      ${protected_ ? "🛡️ İlişki ≥ +10: hakaret ve ambargo koruması aktif" : "Hakaret için ilişki +10 altına düşmeli"}
    </div>`;
}

function htmlSpyStatus(targetIso) {
    const missions = (GameState.spyMissions || []).filter(m => !m.done && (!targetIso || m.target === targetIso));
    if (!missions.length) {
        return `<div class="text-[9px] text-slate-500">🕵️ Aktif casus görevi yok (süre 20 hafta · tespit ~10. hafta)</div>`;
    }
    return missions.map(m => {
        const tName = (GameState.countries[m.target] && GameState.countries[m.target].name) || m.target;
        const days = m.days || 0;
        const dur = m.duration || 140;
        const week = Math.floor(days / 7) + 1;
        const pct = Math.min(100, Math.floor((days / dur) * 100));
        const risk = days >= 70 ? "⚠️ Tespit penceresi" : `Hafta ${week}/20`;
        return `
        <div class="bg-slate-950 border border-cyan-900/40 rounded p-2 text-[10px] space-y-1">
          <div class="flex justify-between text-cyan-300 font-bold"><span>🕵️ ${tName}</span><span>${risk}</span></div>
          <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-cyan-500" style="width:${pct}%"></div></div>
          <div class="text-slate-500">${days}/140 gün · ${pct}%</div>
        </div>`;
    }).join("");
}

function renderProvincePanel() {
    const body = document.getElementById("province-panel-body");
    if (!body) return;
    const pName = GameState.selectedProvince;
    if (!pName) {
        body.innerHTML = `<div class="text-slate-500 italic text-center py-6">Haritadan bir eyalet seçin.</div>`;
        return;
    }
    const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(pName) : (provinceOwners[pName] || "NEUTRAL");
    const ownerName = (typeof getCountryDisplayName === "function") ? getCountryDisplayName(owner) : owner;
    const info = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
    const infra = (typeof getProvinceInfra === "function") ? getProvinceInfra(pName) : ((info && info.infrastructureLevel) || 0);
    const cap = (typeof maxInfraForProvince === "function") ? maxInfraForProvince(pName) : 10;
    const used = (typeof getBuildingSlotsUsed === "function") ? getBuildingSlotsUsed(pName) : 0;
    const maxSlots = (typeof getBuildingSlotsMax === "function") ? getBuildingSlotsMax(pName) : infra;
    const builds = (GameState.provinceBuildings && GameState.provinceBuildings[pName]) || [];
    const isOwn = owner === GameState.player;
    const terrain = (info && info.terrain) || "—";
    const climate = (info && info.climate) || "—";
    const resource = (info && info.primaryResource) || "—";

    const buildList = builds.map((id, i) => {
        const def = (typeof BUILDING_DEFS !== "undefined" && BUILDING_DEFS[id]) ? BUILDING_DEFS[id] : { name: id, slots: 1 };
        return `<div class="flex items-center justify-between bg-slate-900 border border-slate-700 rounded px-2 py-1.5">
          <span>${def.name} <span class="text-slate-500">(${def.slots} slot)</span></span>
          ${isOwn ? `<button onclick="demolishBuilding('${pName}',${i});renderProvincePanel()" class="text-red-400 text-[10px] font-bold px-2">Yık</button>` : ""}
        </div>`;
    }).join("") || `<div class="text-slate-500 italic">Bina yok</div>`;

    const emptySlots = Math.max(0, maxSlots - used);
    const slotDots = Array.from({length: maxSlots}, (_, i) =>
        `<span class="inline-block w-3 h-3 rounded-sm border ${i < used ? "bg-amber-500 border-amber-400" : "bg-slate-800 border-slate-600"}"></span>`
    ).join(" ");

    let buildMenu = "";
    if (isOwn && typeof BUILDING_DEFS !== "undefined") {
        buildMenu = Object.entries(BUILDING_DEFS).map(([id, def]) =>
            `<button onclick="buildInProvince('${pName}','${id}');renderProvincePanel();if(typeof updateHUD==='function')updateHUD()"
              class="text-left px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[10px] flex justify-between gap-2">
              <span>${def.name}</span>
              <span class="text-slate-500">${def.slots} slot · 💰${def.cost}</span>
            </button>`
        ).join("");
    }

    body.innerHTML = `
      <div class="font-black text-sm text-cyan-300 uppercase tracking-wide">${pName.replace(/_/g, " ")}</div>
      <div class="text-[10px] text-slate-400">Sahip: <span class="text-yellow-400 font-bold">${ownerName}</span> (${owner})</div>
      <div class="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
        <div>Arazi: <span class="text-slate-200">${terrain}</span></div>
        <div>İklim: <span class="text-slate-200">${climate}</span></div>
        <div>Kaynak: <span class="text-emerald-400">${resource}</span></div>
      </div>
      ${htmlCultureBlock(owner, pName)}

      <div class="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-black uppercase text-amber-400 tracking-wider">Altyapı</span>
          <span class="font-mono text-sm text-slate-100">${infra} / ${cap}</span>
        </div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-amber-500" style="width:${Math.min(100, (infra/Math.max(1,cap))*100)}%"></div>
        </div>
        <div class="text-[9px] text-slate-500">İklim tavanı: ${cap}/10 · Slot kapasitesi = altyapı</div>
        ${isOwn ? `<button onclick="upgradeProvinceInfra('${pName}');renderProvincePanel();if(typeof updateHUD==='function')updateHUD()"
          class="w-full py-2 bg-amber-900/80 hover:bg-amber-800 border border-amber-600 rounded text-[11px] font-bold">⬆ Altyapı Geliştir</button>
        <button type="button" onclick="(function(){ if(typeof scSetCapital==='function'){ scSetCapital(GameState.player,'${pName}'); } else if(typeof scMoveCapitalToSelected==='function'){ GameState.selectedProvince='${pName}'; scMoveCapitalToSelected(); } if(typeof renderProvincePanel==='function')renderProvincePanel(); if(typeof updateHUD==='function')updateHUD(); })()"
          class="w-full py-2 bg-amber-950/80 hover:bg-amber-900 border border-amber-500 rounded text-[11px] font-bold text-amber-200">★ Başkenti Buraya Taşı (−150💰 −20PP)</button>` : `<div class="text-[10px] text-slate-500 italic">Yalnızca kendi eyaletlerinizde yatırım yapılabilir.</div>`}
      </div>

      <div class="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
        <div class="flex justify-between text-[10px] font-black uppercase text-amber-400">
          <span>Bina Slotları</span><span class="font-mono text-slate-200 normal-case">${used} / ${maxSlots}</span>
        </div>
        <div class="flex flex-wrap gap-1">${slotDots}</div>
        <div class="text-[9px] text-slate-500">${emptySlots} boş slot · 2 slotluk: Üniversite, Akademi, Kale, Cephanelik, Liman, Enerji</div>
        <div class="space-y-1 max-h-28 overflow-y-auto">${buildList}</div>
      </div>

      ${isOwn ? `
      <div class="bg-slate-900 border border-cyan-900/40 rounded-lg p-3 space-y-2">
        <div class="text-[10px] font-black uppercase text-cyan-400 tracking-wider">Bina İnşa Et</div>
        <div class="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto">${buildMenu}</div>
      </div>` : ""}
    `;
}


function renderDiplomacyTab(showTrade = true) {
    const container = document.getElementById("diplo-country-details");
    if (!container) return;
    const provName = (GameState.selectedProvince || "").replace(/_/g, " ") || null;

    // NEUTRAL veya tanımsız ülke
    if (!GameState.selectedCountry || GameState.selectedCountry === "NEUTRAL" || !GameState.countries[GameState.selectedCountry]) {
        container.innerHTML = `
            <div class="text-xs text-slate-300 space-y-3">
                ${provName ? `<div class="font-black uppercase text-cyan-400 text-sm">📍 ${provName}</div>` : ""}
                <div class="text-slate-400">Sahibi: <span class="text-yellow-400 font-bold">Tarafsız / Atanmamış</span></div>
                <div class="text-[10px] text-slate-500 italic">Bu eyalete henüz bir devlet atanmadı. Harita Editörü ile atayabilirsiniz.</div>
            </div>
        `;
        return;
    }

    const targetIso = GameState.selectedCountry;
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    const ownerProvCount = Object.values(provinceOwners).filter(o => o === targetIso).length;

    if (targetIso === GameState.player) {
        const rawProv = GameState.selectedProvince;
        container.innerHTML = `
            <div class="flex items-center gap-3 border-b border-slate-800 pb-3">
                <img src="${(typeof getFlagUrl==='function')?getFlagUrl(targetIso):('https://flagcdn.com/w40/'+target.flag+'.png')}" class="w-8 h-5 object-cover rounded border border-slate-700" alt="flag">
                <h4 class="text-xs font-black uppercase text-slate-200">${target.name} (Kendi Ülkeniz)</h4>
            </div>
            ${provName ? `<div class="text-[11px] text-cyan-400 font-bold">📍 Seçili Eyalet: ${provName}</div>` : ""}
            ${typeof htmlCultureBlock === "function" ? htmlCultureBlock(targetIso, rawProv) : ""}
            ${typeof htmlAllianceStatus === "function" ? htmlAllianceStatus() : ""}
            ${typeof htmlFactionBlock === "function" ? htmlFactionBlock() : ""}
            ${typeof htmlSpyStatus === "function" ? htmlSpyStatus() : ""}
            <div class="text-xs space-y-2 text-slate-300">
                <p>İDEOLOJİ: <span class="text-cyan-400 font-bold">${target.ideology}</span></p>
                <p>NÜFUS: <span class="font-mono">${(target.pop / 1000000).toFixed(1)}M</span></p>
                <p>ORDU GÜCÜ: <span class="font-mono">${Object.values(target.divisions).reduce((a, b) => a + b, 0)} Tümen</span></p>
                <p>EYALET SAYISI: <span class="font-mono text-yellow-400">${ownerProvCount}</span></p>
            </div>
            ${rawProv ? `<button onclick="switchTab('province')" class="w-full py-2 mt-1 bg-amber-900/70 hover:bg-amber-800 border border-amber-600 rounded text-[10px] font-bold">🏗️ Altyapı & Binalar panelini aç</button>` : ""}
        `;
        return;
    }

    const isWar = GameState.activeWars.some(w => w.target === targetIso);
    const pDivs = Object.values(player.divisions).reduce((a,b)=>a+b,0);
    const tDivs = Object.values(target.divisions).reduce((a,b)=>a+b,0);
    const isAlly = (GameState.alliances || []).some(a =>
        (a.a === GameState.player && a.b === targetIso) || (a.b === GameState.player && a.a === targetIso)
    );
    const hasNAP = (GameState.nonAggression || []).some(n =>
        (n.a === GameState.player && n.b === targetIso) || (n.b === GameState.player && n.a === targetIso)
    );
    const justifying = (GameState.justifications || []).find(j => j.target === targetIso);
    const relation = (GameState.relations && GameState.relations[targetIso] != null) ? GameState.relations[targetIso] : 0;
    const isHostile = relation <= -80 || isWar;

    // Düşmanlıkta ticaret YOK
    let tradeSection = "";
    if (!isWar && !isHostile) {
        tradeSection = `
            <div class="pt-3 border-t border-slate-800 space-y-2">
                <h4 class="text-[10px] text-emerald-400 uppercase font-black tracking-wider">💱 Ticaret & Takas</h4>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="openTradeModal('${targetIso}')" class="py-2.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-500 rounded text-[10px] font-black uppercase tracking-wide">
                        💰 Ticaret Yap
                    </button>
                    <button onclick="proposeResourceTrade('${targetIso}')" class="py-2.5 bg-cyan-800 hover:bg-cyan-700 border border-cyan-500 rounded text-[10px] font-black uppercase tracking-wide">
                        🔄 Kaynak Takası
                    </button>
                </div>
                <button onclick="openOngoingTrade('${targetIso}')" class="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-[10px] font-bold uppercase">
                    📦 Sürekli Ticaret Anlaşması
                </button>
            </div>
        `;
    } else if (isHostile) {
        tradeSection = `
            <div class="pt-3 border-t border-slate-800 space-y-2">
                <div class="text-[10px] text-red-400 font-bold bg-red-950/40 border border-red-800 rounded p-2">
                    🚫 Düşmanlık (≤ −80): Ticaret, takas ve diplomatik görüşme kapalı.
                </div>
            </div>
        `;
    }

    let diploActions = "";
    if (isHostile) {
        diploActions = `
            <div class="pt-3 border-t border-slate-800 space-y-2">
                <h4 class="text-[10px] text-red-400 uppercase font-black tracking-wider">💢 Düşmanlık</h4>
                <div class="text-[10px] text-slate-400 mb-1">İlişki: <span class="text-red-500 font-bold">${relation}</span></div>
                <div class="grid grid-cols-2 gap-2">
                    ${relation >= 10
                        ? `<div class="py-2 text-center text-[9px] text-slate-500 border border-slate-700 rounded">Hakaret kilitli (≥+10)</div>`
                        : `<button onclick="sendInsult('${targetIso}')" class="py-2 bg-red-950 hover:bg-red-900 border border-red-600 rounded text-[10px] font-bold">🤬 Hakaret</button>`}
                    <button onclick="damageRelations('${targetIso}')" class="py-2 bg-orange-950 hover:bg-orange-900 border border-orange-700 rounded text-[10px] font-bold">💥 İlişkiye Zarar</button>
                </div>
                <button onclick="severRelations('${targetIso}')" class="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-600 rounded text-[10px] font-bold text-slate-300">
                    ✂️ İlişkileri Kes (elçi çek)
                </button>
                ${(GameState.nuclear && GameState.nuclear.unlocked && GameState.nuclear.warheads > 0) ? `
                <button onclick="launchNuclearStrike('${targetIso}')" class="w-full py-2.5 bg-yellow-950 hover:bg-yellow-900 border border-yellow-600 rounded text-[10px] font-black text-yellow-300">
                    ☢️ Nükleer Saldırı (${GameState.nuclear.warheads} başlık)
                </button>` : ""}
                <p class="text-[9px] text-slate-500">Arabulucu ülkeler ara sıra devreye girebilir.</p>
            </div>
        `;
    } else if (!isWar) {
        diploActions = `
            <div class="pt-3 border-t border-slate-800 space-y-2">
                <h4 class="text-[10px] text-yellow-400 uppercase font-black tracking-wider">🕊️ Diplomatik Eylemler</h4>
                <div class="text-[10px] text-slate-400 mb-1">İlişki: <span class="${relation >= 0 ? 'text-emerald-400' : 'text-red-400'} font-bold">${relation > 0 ? '+' : ''}${relation}</span>
                    ${relation >= 50 ? '· Dost' : relation >= 20 ? '· Ilık' : relation >= 0 ? '· Nötr' : relation > -40 ? '· Soğuk' : relation > -80 ? '· Gergin' : '· Düşman'}
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="improveRelations('${targetIso}')" class="py-2 bg-blue-900/70 hover:bg-blue-800 border border-blue-600 rounded text-[10px] font-bold">🤝 İlişki Geliştir</button>
                    <button onclick="damageRelations('${targetIso}')" class="py-2 bg-orange-900/70 hover:bg-orange-800 border border-orange-600 rounded text-[10px] font-bold">💥 İlişkiye Zarar Ver</button>
                    ${isAlly
                        ? `<button onclick="breakAlliance('${targetIso}')" class="py-2 bg-red-900/70 hover:bg-red-800 border border-red-600 rounded text-[10px] font-bold">❌ İttifakı Boz</button>
                           <button onclick="strengthenAlliance('${targetIso}')" class="py-2 bg-indigo-900/70 hover:bg-indigo-800 border border-indigo-500 rounded text-[10px] font-bold">💪 İttifakı Güçlendir</button>`
                        : `<button onclick="proposeAlliance('${targetIso}')" class="py-2 bg-indigo-900/70 hover:bg-indigo-800 border border-indigo-500 rounded text-[10px] font-bold">🛡️ İttifak Teklif Et</button>`}
                    ${hasNAP
                        ? `<div class="py-2 text-center text-[10px] text-emerald-400 font-bold border border-emerald-800 rounded">✓ Saldırmazlık Paktı</div>`
                        : `<button onclick="signNAP('${targetIso}')" class="py-2 bg-slate-800 hover:bg-slate-700 border border-slate-500 rounded text-[10px] font-bold">📜 Saldırmazlık</button>`}
                    ${justifying
                        ? `<div class="py-2 text-center text-[10px] text-orange-400 font-bold border border-orange-700 rounded animate-pulse">⏳ Gerekçe: ${justifying.progress}%</div>`
                        : `<button onclick="startJustification('${targetIso}')" class="py-2 bg-orange-900/70 hover:bg-orange-800 border border-orange-600 rounded text-[10px] font-bold">📋 Savaş Gerekçesi</button>`}
                    <button onclick="severRelations('${targetIso}')" class="py-2 bg-slate-800 hover:bg-slate-700 border border-slate-500 rounded text-[10px] font-bold">✂️ İlişkileri Kes</button>
                    <button onclick="sendUltimatum('${targetIso}')" class="py-2 bg-red-950 hover:bg-red-900 border border-red-700 rounded text-[10px] font-bold">📜 Ultimatom</button>
                    <button onclick="requestMilitaryAccess('${targetIso}')" class="py-2 bg-slate-800 hover:bg-slate-700 border border-slate-500 rounded text-[10px] font-bold">🛂 Askeri Geçiş</button>
                    <button onclick="sellLandTo('${targetIso}')" class="py-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 rounded text-[10px] font-bold">🗺️ Arazi Sat</button>
                    <button onclick="runSpyMission('${targetIso}')" class="py-2 bg-slate-900 hover:bg-slate-800 border border-cyan-700 rounded text-[10px] font-bold">🕵️ Casus Gönder</button>
                    <button onclick="emergencyMobilization()" class="py-2 bg-amber-900/80 hover:bg-amber-800 border border-amber-600 rounded text-[10px] font-bold col-span-2">🆘 Acil Seferberlik / Yardım</button>
                </div>
            </div>
        `;
    }

    const canDeclare = !isWar && !hasNAP && (justifying ? justifying.progress >= 100 : false);
    // Gerekçe yoksa da savaş ilan edilebilir ama gerilim artar; NAP varken yasak

    container.innerHTML = `
        <div class="flex items-center gap-3 border-b border-slate-800 pb-3">
            <img src="https://flagcdn.com/w40/${target.flag}.png" class="w-8 h-5 object-cover rounded border border-slate-700" alt="Diplomacy target flag">
            <div>
                <h4 class="text-xs font-black uppercase text-slate-200">${target.name}</h4>
                ${isAlly ? (() => {
                    const al = typeof getAllianceWith === "function" ? getAllianceWith(targetIso) : null;
                    const q = al ? Math.floor(al.quality || 0) : 0;
                    return `<span class="text-[9px] text-indigo-400 font-bold">🛡️ MÜTTEFİK · Kalite ${q}${al && al.offensive ? " · ⚔️ Saldırı desteği" : ""}</span>`;
                })() : ''}
            </div>
        </div>
        ${provName ? `<div class="text-[11px] text-cyan-400 font-bold">Seçili eyalet: ${provName}</div>` : ""}
        ${typeof formatCountryIdentityBlock === "function" ? formatCountryIdentityBlock(targetIso) : ""}
        ${typeof htmlCultureBlock === "function" ? htmlCultureBlock(targetIso, GameState.selectedProvince) : ""}
        ${typeof htmlAllianceStatus === "function" ? htmlAllianceStatus() : ""}
        ${typeof htmlRelationGate === "function" ? htmlRelationGate(relation) : ""}
        ${typeof htmlSpyStatus === "function" ? htmlSpyStatus(targetIso) : ""}
        <div class="text-xs space-y-1.5 text-slate-300">
            <p>İDEOLOJİ: <span class="text-cyan-400 font-bold">${target.ideology}</span></p>
            <p>ASKERİ GÜÇ: <span class="font-mono text-yellow-500">${tDivs} Tümen</span> <span class="text-slate-500">(Biz: ${pDivs} — oran ${(tDivs ? (pDivs/tDivs*100) : 0).toFixed(0)}%)</span></p>
            <p>FABRİKA: <span class="font-mono">${target.civFactories} sivil / ${target.milFactories} askeri</span></p>
            <p>EYALET: <span class="font-mono text-yellow-400">${ownerProvCount}</span> · HAZİNE: <span class="text-yellow-400 font-mono">${(target.money||0).toLocaleString()}</span></p>
            <div class="mt-2">
                <div class="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>İlişki</span><span>${relation > 0 ? '+' : ''}${relation}</span></div>
                <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full transition-all ${relation >= 0 ? 'bg-emerald-500' : 'bg-red-500'}" style="width:${Math.min(100, Math.abs(relation))}%"></div>
                </div>
            </div>
        </div>
        ${tradeSection}
        ${diploActions}
        <div class="pt-3 border-t border-slate-800 space-y-2">
            ${isWar ? `
                <div class="text-center text-red-500 font-black text-xs uppercase tracking-wider animate-pulse py-2">
                    ⚔️ SAVAŞTAYIZ
                </div>
            ` : hasNAP ? `
                <div class="text-center text-slate-400 text-[10px] py-2">Saldırmazlık paktı varken savaş ilan edilemez.</div>
            ` : `
                <button onclick="declareWar('${targetIso}')" class="w-full py-3 bg-red-800 hover:bg-red-700 border border-red-500 rounded text-xs font-black tracking-widest text-slate-100 uppercase transition-all active:scale-95">
                    ⚔️ SAVAŞ İLAN ET ${justifying && justifying.progress < 100 ? '(Gerekçesiz — yüksek gerilim!)' : ''}
                </button>
            `}
        </div>
    `;
}

        // ÜRETİM MOTORU VE SANAYİ
        function adjustProduction(type, value) {
            const player = GameState.countries[GameState.player];
            value = parseInt(value);
            
            const totalAvailable = player.milFactories;
            let currentSum = 0;
            
            for (let t in player.prodAllocation) {
                if (t !== type) currentSum += player.prodAllocation[t];
            }

            if (currentSum + value > totalAvailable) {
                value = totalAvailable - currentSum;
                document.getElementById(`slider-prod-${type}`).value = value;
            }

            player.prodAllocation[type] = value;
            renderProductionTab();
        }

        function renderProductionTab() {
            const player = GameState.countries[GameState.player];
            const total = player.milFactories;
            const currentSum = Object.values(player.prodAllocation).reduce((a, b) => a + b, 0);
            const unallocated = total - currentSum;

            setText("prod-unallocated", `${unallocated} Boşta Fabrika`);

            // Atamalar
            setText("prod-guns-factories", `${player.prodAllocation.guns} Fabrika`);
            setText("prod-artillery-factories", `${player.prodAllocation.artillery} Fabrika`);
            setText("prod-tanks-factories", `${player.prodAllocation.tanks} Fabrika`);

            // Haftalık üretim miktarları
            setText("rate-prod-guns", `+${player.prodAllocation.guns * 15} / Hafta`);
            setText("rate-prod-artillery", `+${player.prodAllocation.artillery * 2} / Hafta`);
            setText("rate-prod-tanks", `+${player.prodAllocation.tanks * 1} / Hafta`);
        }

        function buildFactory(type) {
            const player = GameState.countries[GameState.player];
            const cost = type === 'civ' ? 800 : 1000;

            if (player.money >= cost) {
                sfx.playVictory();
                player.money -= cost;
                if (type === 'civ') {
                    player.civFactories++;
                    log("YATIRIM: Yeni bir Sivil Sanayi tesisi kuruldu ve faaliyete başladı.", "text-yellow-400");
                } else {
                    player.milFactories++;
                    log("YATIRIM: Yeni bir Askeri Sanayi tesisi kuruldu ve faaliyete başladı.", "text-yellow-400");
                }
                updateHUD();
                renderProductionTab();
            } else {
                log("SİSTEM: Altyapı yatırımı gerçekleştirilemedi. Yetersiz kaynak.", "text-red-500");
            }
        }

        // ORDU SEFERBERLİK VE EĞİTİM
        function trainDivision(type) {
            const player = GameState.countries[GameState.player];
            const era1 = typeof eraPrimitiveTanks === "function" && eraPrimitiveTanks();
            
            let req = {
                inf: { mp: 10000, guns: 500, art: 0, tanks: 0, title: "Piyade Tümeni", duration: 42 },
                art: { mp: 8000, guns: 300, art: 150, tanks: 0, title: "Topçu Tümeni", duration: 42 },
                arm: { mp: 6000, guns: 200, art: 0, tanks: 200, title: "Zırhlı Tümen", duration: 42 }
            }[type];
            if (!req) return;

            // 1914: ilkel tanklar — çok pahalı ve yavaş
            if (type === "arm" && era1) {
                req = { mp: 9000, guns: 400, art: 50, tanks: 80, title: "İlkel Tank Müfrezesi", duration: 90 };
            }

            const consMul = (typeof V27 !== "undefined" && V27.getConscription) ? (V27.getConscription().mpMul || 1) : 1;
            // conscription increases effective pool feel via lower effective cost slightly when extensive
            const mpCost = Math.floor(req.mp / Math.max(1, Math.min(1.5, 0.85 + consMul * 0.15)));
            if (player.manpower >= mpCost && 
                player.stockpile.guns >= req.guns && 
                player.stockpile.artillery >= req.art && 
                player.stockpile.tanks >= req.tanks) {
                req = Object.assign({}, req, { mp: mpCost });
                
                sfx.playBlip();
                player.manpower -= req.mp;
                player.stockpile.guns -= req.guns;
                player.stockpile.artillery -= req.art;
                player.stockpile.tanks -= req.tanks;

                GameState.trainingQueue.push({
                    type: type,
                    title: req.title,
                    progress: 0,
                    duration: req.duration || 42
                });

                log(`KIŞLA: ${req.title} eğitimi başladı${era1 && type === "arm" ? " (1914 — yavaş üretim)" : ""}.`, "text-slate-300");
                updateHUD();
                renderMilitaryTab();
            } else {
                log(`HATA: ${req.title} eğitemezsiniz. Yetersiz kaynak.`, "text-red-500");
            }
        }

        function renderMilitaryTab() {
            const p = GameState.countries[GameState.player];
            if (!p) return;
            const divs = p.divisions || {};
            const total = (divs.inf||0)+(divs.art||0)+(divs.arm||0);
            const ov = document.getElementById("mil-overview");
            if (ov) {
                ov.innerHTML = `
                    <div class="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-2 text-center">
                        <div class="text-[9px] text-emerald-500 font-bold uppercase">Piyade</div>
                        <div class="text-lg font-black text-emerald-300 font-mono">${divs.inf||0}</div>
                    </div>
                    <div class="rounded-lg border border-orange-800/50 bg-orange-950/30 p-2 text-center">
                        <div class="text-[9px] text-orange-500 font-bold uppercase">Topçu</div>
                        <div class="text-lg font-black text-orange-300 font-mono">${divs.art||0}</div>
                    </div>
                    <div class="rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-2 text-center">
                        <div class="text-[9px] text-cyan-500 font-bold uppercase">Zırhlı</div>
                        <div class="text-lg font-black text-cyan-300 font-mono">${divs.arm||0}</div>
                    </div>
                    <div class="col-span-3 text-center text-[10px] text-slate-500 font-mono">Toplam ${total} tümen · 👤 ${(p.manpower||0).toLocaleString()}</div>`;
            }
            const container = document.getElementById("training-queue");
            if (container) {
                if (!GameState.trainingQueue.length) {
                    container.innerHTML = `<div class="text-[10px] text-slate-500 italic text-center py-3 rounded-lg border border-dashed border-slate-700">Eğitim kuyruğu boş</div>`;
                } else {
                    container.innerHTML = GameState.trainingQueue.map(item => `
                        <div class="bg-slate-900 p-2.5 rounded-lg border border-slate-700 relative overflow-hidden">
                            <div class="absolute bottom-0 left-0 h-1 bg-cyan-500" style="width:${(item.progress/item.duration)*100}%"></div>
                            <div class="flex justify-between text-[11px] font-semibold">
                                <span class="text-slate-200">${item.title}</span>
                                <span class="font-mono text-cyan-400">${Math.floor((item.progress/item.duration)*100)}%</span>
                            </div>
                        </div>`).join("");
                }
            }
            if (typeof ensureStratResources === "function") ensureStratResources(p);
            
            const afs = document.getElementById("air-force-stats");
            if (afs) {
                const af = p.airforce || {};
                afs.innerHTML = `Envanter: <b class="text-sky-300">${af.fighters||0}</b> avcı · <b class="text-indigo-300">${af.bombers||0}</b> bombardıman`;
            }
            const nfs = document.getElementById("navy-force-stats");
            if (nfs) {
                const nv = p.navy || {};
                nfs.innerHTML = `Filo: <b class="text-blue-300">${nv.ships||0}</b> · Muhrip ${nv.destroyer||0} · Kruvazör ${nv.cruiser||0} · Zırhlı ${nv.battleship||0}`;
            }
            const ans = document.getElementById("air-navy-stats");
            if (ans) {
                ans.innerHTML = `Hava: <b class="text-sky-300">${p.airforce?.fighters||0}</b> avcı / <b class="text-indigo-300">${p.airforce?.bombers||0}</b> bomb · Deniz: ${p.navy?.ships||0}<br>
                ⛽${p.strat?.oil||0} 🔩${p.strat?.steel||0} 🛠${p.strat?.aluminum||0} 🛞${p.strat?.rubber||0}
                <div class="grid grid-cols-4 gap-1 mt-1">
                    <button onclick="importStrategicResource('oil')" class="py-1 bg-slate-800 border border-slate-600 rounded text-[8px]">⛽</button>
                    <button onclick="importStrategicResource('steel')" class="py-1 bg-slate-800 border border-slate-600 rounded text-[8px]">🔩</button>
                    <button onclick="importStrategicResource('aluminum')" class="py-1 bg-slate-800 border border-slate-600 rounded text-[8px]">🛠</button>
                    <button onclick="importStrategicResource('rubber')" class="py-1 bg-slate-800 border border-slate-600 rounded text-[8px]">🛞</button>
                </div>`;
            }
            // nükleer bar + çağ kilidi
            const n = GameState.nuclear || { progress: 0 };
            const bar = document.getElementById("nuclear-bar");
            const pct = document.getElementById("nuclear-pct");
            const st = document.getElementById("nuclear-state");
            const nucBox = document.getElementById("nuclear-status");
            const eraBlock = typeof eraBlocksNuclear === "function" && eraBlocksNuclear();
            if (bar) bar.style.width = eraBlock ? "0%" : (Math.min(100, n.progress || 0) + "%");
            if (pct) pct.innerText = eraBlock ? "KİLİTLİ" : (Math.floor(n.progress || 0) + "%");
            if (st) st.innerText = eraBlock ? "Bu çağda yok (1914)" : (n.unlocked ? `Hazır · ${n.warheads||0} başlık` : (n.active ? "Araştırılıyor..." : "Kapalı"));
            if (nucBox) {
                const btn = nucBox.querySelector("button");
                if (btn) {
                    const check = (typeof canStartNuclearProgram === "function") ? canStartNuclearProgram() : { ok: !eraBlock, reasons: [] };
                    const locked = eraBlock || (GameState.nuclear && !GameState.nuclear.active && !GameState.nuclear.unlocked && !check.ok);
                    btn.disabled = !!eraBlock || (!!locked && !(GameState.nuclear && GameState.nuclear.active));
                    btn.classList.toggle("opacity-40", btn.disabled);
                    if (eraBlock) btn.innerText = "⛔ Çağda mevcut değil";
                    else if (GameState.nuclear && GameState.nuclear.unlocked) btn.innerText = "Nükleer Hazır";
                    else if (GameState.nuclear && GameState.nuclear.active) btn.innerText = "Araştırılıyor...";
                    else if (!check.ok) btn.innerText = "⛔ Şartlar yetersiz";
                    else btn.innerText = "Programı Başlat / Sürdür";
                    const reqEl = document.getElementById("nuclear-reqs-text");
                    if (reqEl && check.reasons && check.reasons.length) {
                        reqEl.innerText = "Eksik: " + check.reasons.slice(0, 3).join(" · ");
                        reqEl.className = "text-[9px] text-red-400";
                    } else if (reqEl && check.ok) {
                        reqEl.innerText = "Şartlar sağlandı — program başlatılabilir";
                        reqEl.className = "text-[9px] text-emerald-400";
                    }
                }
            }
            // Hava buton etiketleri
            const era = typeof getTechEra === "function" ? getTechEra() : 3;
            const airBtns = document.querySelectorAll("#content-military button");
            airBtns.forEach(b => {
                if (b.getAttribute("onclick") === "buildAirUnit('fighters')") {
                    b.innerText = era === 1 ? "✈️ +2 Keşif" : "✈️ +5 Avcı";
                }
                if (b.getAttribute("onclick") === "buildAirUnit('bombers')") {
                    b.style.display = era === 1 ? "none" : "";
                    b.innerText = "💣 +5 Bombardıman";
                }
            });
        }

        // emergencyMobilization aşağıda (zorluk-duyarlı) tanımlı

        function runSpyMission(forcedIso) {
            const targetIso = forcedIso || GameState.selectedCountry;
            if (!targetIso || targetIso === GameState.player || targetIso === "NEUTRAL") {
                log("Casusluk için haritadan bir ülke/eyalet seçin.", "text-yellow-400");
                return;
            }
            const p = GameState.countries[GameState.player];
            const t = GameState.countries[targetIso];
            if (!t) return;
            GameState.spyMissions = GameState.spyMissions || [];
            if (GameState.spyMissions.some(m => m.target === targetIso && !m.done)) {
                log("Bu ülkeye zaten aktif casus görevi var.", "text-yellow-400");
                return;
            }
            const cost = 120;
            if (p.money < cost) { log("Casus operasyonu: 120 hazine gerekli.", "text-red-500"); return; }
            p.money -= cost;
            // 20 hafta = 140 gün; yakalanma kontrolü 10. hafta = gün 70
            GameState.spyMissions.push({
                target: targetIso, startDay: 0, days: 0, duration: 140,
                catchDay: 70, caught: false, done: false
            });
            log(`🕵️ Casus ${t.name} topraklarına sızdı. Görev ~20 hafta sürecek (10. haftada risk).`, "text-cyan-300");
            try { sfx.playMessage(); } catch(e){}
            updateHUD();
        }

        function showSpyReport(iso) {
            const t = GameState.countries[iso];
            if (!t) return;
            const divs = t.divisions || {};
            const totalDiv = Object.values(divs).reduce((a,b)=>a+b,0);
            const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso);
            const power = typeof getCountryPower === "function" ? getCountryPower(iso) : totalDiv;
            document.getElementById("spy-report-modal")?.remove();
            const modal = document.createElement("div");
            modal.id = "spy-report-modal";
            modal.className = "fixed inset-0 z-[10050] flex items-center justify-center bg-black/80 p-4";
            modal.innerHTML = `
                <div class="bg-slate-900 border-2 border-cyan-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
                    <div class="p-3 bg-slate-950 border-b border-slate-700 flex justify-between items-center">
                        <h2 class="text-sm font-black text-cyan-400 uppercase tracking-wider">🕵️ İstihbarat Raporu — ${t.name}</h2>
                        <button onclick="document.getElementById('spy-report-modal').remove()" class="text-slate-400 hover:text-white text-lg font-bold">✕</button>
                    </div>
                    <div class="p-4 text-xs space-y-3 text-slate-300">
                        <div class="grid grid-cols-2 gap-2">
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">İdeoloji: <span class="text-cyan-400 font-bold">${t.ideology||"-"}</span></div>
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">Güç Endeksi: <span class="text-yellow-400 font-bold">${power}</span></div>
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">Hazine: <span class="text-yellow-400 font-mono">${(t.money||0).toLocaleString()}</span></div>
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">İnsan Gücü: <span class="font-mono">${(t.manpower||0).toLocaleString()}</span></div>
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">Sivil Fabrika: <span class="font-bold">${t.civFactories||0}</span></div>
                            <div class="bg-slate-800/80 p-2 rounded border border-slate-700">Askeri Fabrika: <span class="font-bold">${t.milFactories||0}</span></div>
                        </div>
                        <div class="bg-slate-800/80 p-3 rounded border border-slate-700">
                            <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Tümenler</p>
                            <p>Toplam: <span class="text-red-400 font-black">${totalDiv}</span></p>
                            <p class="font-mono text-[11px]">Piyade ${divs.inf||0} · Topçu ${divs.art||0} · Zırhlı ${divs.arm||0}</p>
                        </div>
                        <div class="bg-slate-800/80 p-3 rounded border border-slate-700 max-h-32 overflow-y-auto">
                            <p class="text-[10px] text-slate-500 uppercase font-bold mb-1">Eyaletler (${provs.length})</p>
                            <p class="text-[11px] leading-relaxed">${provs.length ? provs.map(p=>p.replace(/_/g," ")).join(", ") : "Haritada atanmış eyalet yok / veri sınırlı"}</p>
                        </div>
                        <p class="text-[10px] text-slate-500">Rapor gizli sınıflandırılmıştır. İlişki ve gerilim etkilenmedi (başarılı operasyon).</p>
                    </div>
                    <div class="p-3 border-t border-slate-800">
                        <button onclick="document.getElementById('spy-report-modal').remove()" class="w-full py-2.5 bg-cyan-800 hover:bg-cyan-700 rounded font-bold">Raporu Kapat</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            log(`🕵️ İstihbarat raporu alındı: ${t.name}`, "text-cyan-400");
        }

        // ODAK TREE MOTORU
        function renderFocusTree() {
            const container = document.getElementById("focus-tree-nodes");
            const playerFocuses = GameState.activeFocusTree[GameState.player];
            const pData = GameState.countries[GameState.player];

            if (!playerFocuses) {
                container.innerHTML = `<div class="text-xs text-slate-500 italic text-center py-4">Bu devlet için özel bir Odak Ağacı tanımlanmamış.</div>`;
                return;
            }

            container.innerHTML = playerFocuses.map(node => {
                let statusClass = "available";
                let statusText = "Odak Çalışmasını Başlat";

                if (pData.completedFocuses.includes(node.id)) {
                    statusClass = "completed";
                    statusText = "Tamamlandı ✓";
                } else if (pData.activeFocus === node.id) {
    statusClass = "active";
    statusText = `Devam Ediyor`;
                } else if (pData.activeFocus !== null) {
                    statusClass = "locked opacity-50";
                    statusText = "Kilitli: Şu anda bir odak çalışması aktif";
                }

                return `
                    <div class="focus-node ${statusClass} p-3 rounded text-left space-y-2" onclick="selectFocus('${node.id}')">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-black uppercase text-slate-200">${node.title}</span>
                            <span class="text-[9px] font-bold bg-slate-800 px-1.5 py-0.5 rounded text-yellow-500 font-mono">10 Hafta</span>
                        </div>
                        <p class="text-[10px] text-slate-400 leading-relaxed font-semibold">${node.desc}</p>
                        <div class="text-[9px] font-black uppercase tracking-wider text-right border-t border-slate-800 pt-1.5 text-slate-500">${statusText}</div>
                    </div>
                `;
            }).join('');
        }

        function selectFocus(id) {
            const pData = GameState.countries[GameState.player];
            if (pData.completedFocuses.includes(id) || pData.activeFocus !== null) return;

            sfx.playBlip();
            pData.activeFocus = id;
            pData.focusProgress = 0;
            renderFocusTree();
            log(`POLİTİKA: "${GameState.activeFocusTree[GameState.player].find(n => n.id === id).title}" milli odak çalışması yürürlüğe kondu.`, "text-cyan-400");
        }

        // SAVAŞ & İLHAK MOTORU
        function declareWar(targetIso) {
            const target = GameState.countries[targetIso];
            if (!target) return;

            // NAP kontrolü
            const hasNAP = (GameState.nonAggression || []).some(n =>
                (n.a === GameState.player && n.b === targetIso) || (n.b === GameState.player && n.a === targetIso)
            );
            if (hasNAP) {
                log("Saldırmazlık paktı varken savaş ilan edilemez!", "text-red-500");
                return;
            }

            // Müttefik kontrolü
            const isAlly = (GameState.alliances || []).some(a =>
                (a.a === GameState.player && a.b === targetIso) || (a.b === GameState.player && a.a === targetIso)
            );
            if (isAlly) {
                log("Müttefikinize savaş ilan edemezsiniz! Önce ittifakı bozun.", "text-red-500");
                return;
            }

            sfx.playSiren();

            const justifying = (GameState.justifications || []).find(j => j.target === targetIso && j.progress >= 100);
            if (!justifying) {
                // Gerekçesiz savaş → yüksek gerilim
                GameState.globalTension = Math.min(100, GameState.globalTension + 25);
                log("⚠️ Gerekçesiz savaş ilanı! Küresel gerilim sert yükseldi (+25).", "text-orange-400 font-bold");
            } else {
                GameState.globalTension = Math.min(100, GameState.globalTension + 8);
                // Gerekçeyi temizle
                GameState.justifications = GameState.justifications.filter(j => j.target !== targetIso);
            }

            // İlişki: savaş = en az -85 (düşmanlık eşiği)
            if (!GameState.relations) GameState.relations = {};
            GameState.relations[targetIso] = Math.min(GameState.relations[targetIso] || 0, -85);

            // Mevcut ittifak/NAP/ticaret temizle
            GameState.alliances = (GameState.alliances || []).filter(a =>
                !((a.a === GameState.player && a.b === targetIso) || (a.b === GameState.player && a.a === targetIso))
            );
            GameState.nonAggression = (GameState.nonAggression || []).filter(n =>
                !((n.a === GameState.player && n.b === targetIso) || (n.b === GameState.player && n.a === targetIso))
            );
            GameState.tradeDeals = (GameState.tradeDeals || []).filter(d => d.partner !== targetIso);

            GameState.activeWars.push({
                target: targetIso,
                progress: 0,
                dailyGunsReq: 45,
                dailyArtilleryReq: 8,
                totalWeeks: 0,
                attacker: GameState.player
            });

            try {
              if (typeof callFactionToArms === "function") callFactionToArms(GameState.player, targetIso);
              const _ef = typeof getFactionOf === "function" ? getFactionOf(targetIso) : null;
              if (_ef && GameState.hoi && GameState.hoi.factions[_ef]) {
                const L = GameState.hoi.factions[_ef].leader;
                if (L) callFactionToArms(L, GameState.player);
              }
            } catch (e) {}

            // Müttefikleri savaşa çağır (kalite + saldırı desteği)
            if (typeof callAlliesToWar === "function") callAlliesToWar(targetIso, true);
            if (typeof formWarBlocs === "function") formWarBlocs(targetIso);

            log(`🚨 SEFERBERLİK: ${target.name} — ilişki −85. Diplomasi ve ticaret kapandı.`, "text-red-500 font-black");
            
            if (d3.select(`#${targetIso}`).node()) {
                d3.select(`#${targetIso}`).classed("active-war", true).style("fill", "#ef4444");
            }

            renderDiplomacyTab();
            switchTab("dashboard");
        }

        function resolveWar(index, victory) {
    const war = GameState.activeWars[index];
    const targetIso = war.target;
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];

    if (victory) {
        sfx.playVictory();
        const occN = Object.keys(GameState.occupations || {}).filter(p =>
          provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player
        ).length;
        log("ZAFER: " + (target && target.name) + " teslim — işgal " + occN + " eyalet. Barış masası açılıyor.", "text-emerald-400 font-black");
        GameState._lastWonWar = {
          target: targetIso,
          progress: war.progress || 100,
          casualties: war.casualties || 0,
          enemyCasualties: war.enemyCasualties || 0,
          occupied: occN
        };
        GameState.activeWars.splice(index, 1);
        showTerritoryDemandModal(targetIso);
    } else {
        sfx.playSiren();
        log("BOZGUN: " + (target && target.name) + " cephesinde geri çekildik. İşgaller kaldırıldı.", "text-red-500 font-black");
        // Bozgunda oyuncu işgallerini bırak
        if (GameState.occupations) {
          Object.keys(GameState.occupations).forEach(p => {
            if (provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player) {
              delete GameState.occupations[p];
            }
          });
        }
        if (typeof refreshMapColors === "function") try { refreshMapColors(); } catch (e) {}
        GameState.activeWars.splice(index, 1);
        updateHUD();
        renderDiplomacyTab();
        switchTab("dashboard");
    }
}

// ========== TOPRAK TALEP SİSTEMİ ==========

// --- Barış harita seçim durumu ---
window.peaceMode = false;
window.peaceTargetIso = null;
window.peaceSelected = new Set();
window.peaceMaxClaim = 0;
window.peaceSavedFills = null;

function enterPeaceMapMode(targetIso) {
    window.peaceSavedFills = {};
    d3.selectAll(".country-path").each(function() {
        const path = d3.select(this);
        const name = path.attr("data-name");
        if (!name) return;
        window.peaceSavedFills[name] = path.style("fill");
        const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : provinceOwners[name];
        if (owner === targetIso) {
            path.style("fill", (GameState.countries[targetIso] && GameState.countries[targetIso].color) || "#b91c1c")
                .style("opacity", 1).style("cursor", "pointer")
                .style("stroke", "#fbbf24").style("stroke-width", "0.4px");
        } else {
            path.style("fill", "#3f3f46").style("opacity", 0.42).style("cursor", "not-allowed")
                .style("stroke", "#27272a").style("stroke-width", "0.06px");
        }
    });
}

function exitPeaceMapMode(doRefresh) {
    window.peaceMode = false;
    window.peaceTargetIso = null;
    window.peaceSelected = new Set();
    d3.selectAll(".country-path").style("opacity", null).style("cursor", null);
    if (window.peaceSavedFills) {
        d3.selectAll(".country-path").each(function() {
            const path = d3.select(this);
            const name = path.attr("data-name");
            if (name && window.peaceSavedFills[name] != null) path.style("fill", window.peaceSavedFills[name]);
        });
        window.peaceSavedFills = null;
    }
    if (doRefresh !== false && typeof refreshMapColors === "function") {
        try { refreshMapColors(); } catch (e) {}
    }
}

function togglePeaceProvince(pName) {
    if (!window.peaceMode || !window.peaceTargetIso) return;
    if (provinceOwners[pName] !== window.peaceTargetIso) {
        log("Savaş dışı eyalet — seçilemez.", "text-slate-500");
        return;
    }
    if (window.peaceSelected.has(pName)) window.peaceSelected.delete(pName);
    else {
        if (window.peaceSelected.size >= window.peaceMaxClaim) {
            log("Maksimum " + window.peaceMaxClaim + " eyalet.", "text-yellow-400");
            return;
        }
        window.peaceSelected.add(pName);
    }
    d3.selectAll(".country-path").filter(function() {
        return d3.select(this).attr("data-name") === pName;
    }).each(function() {
        const path = d3.select(this);
        if (window.peaceSelected.has(pName)) {
            path.style("stroke", "#fde047").style("stroke-width", "1.1px").style("fill", "#ca8a04");
        } else {
            path.style("stroke", "#fbbf24").style("stroke-width", "0.4px")
                .style("fill", (GameState.countries[window.peaceTargetIso] && GameState.countries[window.peaceTargetIso].color) || "#b91c1c");
        }
    });
    const cnt = document.getElementById("claim-selected-count");
    if (cnt) cnt.innerText = String(window.peaceSelected.size);
    const list = document.getElementById("peace-selected-list");
    if (list) {
        list.innerHTML = [...window.peaceSelected].map(function(p) {
            return '<div class="flex justify-between"><span>' + p.replace(/_/g," ") + '</span>' +
                '<button type="button" class="text-red-400 text-[9px]" onclick="togglePeaceProvince(\'' + p + '\')">✕</button></div>';
        }).join("") || '<span class="italic text-slate-600">Henüz seçim yok</span>';
    }
}

function finalizePeaceNoClaim(targetIso) {
    if (typeof exitPeaceMapMode === "function") exitPeaceMapMode(true);
    document.getElementById("territory-demand-modal")?.remove();
    // Toprak alınmadan barış: işgaller kalkar
    if (GameState.occupations && targetIso) {
      Object.keys(GameState.occupations).forEach(p => {
        if (provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player) {
          delete GameState.occupations[p];
        }
      });
      if (typeof refreshMapColors === "function") try { refreshMapColors(); } catch (e) {}
    }
    GameState._lastWonWar = null;
    log("Savaş sona erdi / barış onaylandı.", "text-slate-400");
    if (typeof updateHUD === "function") updateHUD();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
    if (typeof switchTab === "function") switchTab("dashboard");
}

function showTerritoryDemandModal(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    if (!target || !player) return;
    const pDivs = Object.values(player.divisions || {}).reduce((a,b)=>a+b,0);
    const tDivs = Math.max(1, Object.values(target.divisions || {}).reduce((a,b)=>a+b,0));
    const ratio = pDivs / Math.max(1, tDivs);
    const enemyProvinces = Object.keys(provinceOwners).filter(p => provinceOwners[p] === targetIso);
    const provCount = enemyProvinces.length;
    const occList = Object.keys(GameState.occupations || {}).filter(p =>
      provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player
    );
    const war = (GameState.activeWars || []).find(w => w.target === targetIso) ||
      (GameState._lastWonWar && GameState._lastWonWar.target === targetIso ? GameState._lastWonWar : null);
    const warScore = war ? Math.floor(war.progress || 100) : 100;
    let maxClaim = 0, claimLevel = "none";
    // HOI-benzeri: savaş skoru + güç oranı + işgal edilenler
    if (warScore >= 100 && ratio >= 1.35) { maxClaim = provCount; claimLevel = "full"; }
    else if (warScore >= 100 || ratio >= 1.5) { maxClaim = Math.max(occList.length, Math.floor(provCount * 0.75)); claimLevel = "major"; }
    else if (warScore >= 75 || ratio >= 1.25) { maxClaim = Math.max(occList.length, Math.floor(provCount / 2)); claimLevel = "half"; }
    else if (occList.length > 0) { maxClaim = Math.min(occList.length + 1, Math.max(1, Math.floor(provCount / 3))); claimLevel = "occupied"; }
    else if (ratio >= 1.1) { maxClaim = Math.max(1, Math.floor(provCount / 4)); claimLevel = "minor"; }
    maxClaim = Math.min(provCount, Math.max(0, maxClaim));
    // En az işgal edilen kadar talep hakkı
    if (occList.length > maxClaim) maxClaim = Math.min(provCount, occList.length);

    document.getElementById("territory-demand-modal")?.remove();
    if (typeof exitPeaceMapMode === "function") exitPeaceMapMode(false);

    window.peaceMode = true;
    window.peaceTargetIso = targetIso;
    window.peaceSelected = new Set();
    window.peaceMaxClaim = maxClaim;
    // İşgal altındakileri varsayılan seç (limit kadar)
    try {
      const occList = Object.keys(GameState.occupations || {}).filter(p =>
        provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player
      );
      occList.slice(0, maxClaim).forEach(p => window.peaceSelected.add(p));
    } catch (e) {}
    window.peaceClaimLevel = claimLevel;
    enterPeaceMapMode(targetIso);

    const levelMsg = claimLevel === "full"
        ? `<span class="text-emerald-400 font-black">Tam zafer — tüm eyaletler (${maxClaim})</span>`
        : claimLevel === "major"
        ? `<span class="text-emerald-400/90 font-black">Büyük zafer — en fazla ${maxClaim} eyalet</span>`
        : claimLevel === "half"
        ? `<span class="text-yellow-400 font-black">Kısmi — en fazla ${maxClaim} eyalet</span>`
        : claimLevel === "occupied"
        ? `<span class="text-amber-400 font-black">İşgal hattı — ${maxClaim} eyalet (öncelik taralılar)</span>`
        : claimLevel === "minor"
        ? `<span class="text-yellow-500 font-black">Sınırlı talep — ${maxClaim} eyalet</span>`
        : `<span class="text-red-400 font-black">Toprak talep yok — beyaz barış</span>`;

    const modal = document.createElement("div");
    modal.id = "territory-demand-modal";
    modal.className = "fixed top-16 right-3 z-[10000] w-[min(100%,340px)] max-h-[calc(100vh-5rem)] overflow-y-auto";
    modal.innerHTML = `
      <div class="bg-slate-900/95 border-2 border-yellow-600 rounded-xl shadow-2xl backdrop-blur">
        <div class="p-3 border-b border-slate-700 bg-slate-950 rounded-t-xl">
          <h2 class="text-xs font-black text-yellow-400 uppercase tracking-wider">🏳️ Barış Masası — ${target.name}</h2>
          <p class="text-[10px] text-slate-400 font-mono mt-1">Güç ${(ratio*100).toFixed(0)}% · ${provCount} eyalet</p>
        </div>
        <div class="p-3 space-y-2 text-[11px] text-slate-300">
          <div class="bg-slate-800/80 p-2 rounded border border-slate-700 text-[10px]">
            <p>Tümen: <span class="text-cyan-400">${pDivs}</span> vs <span class="text-red-400">${tDivs}</span></p>
            <p class="mt-1">${levelMsg}</p>
          </div>
          ${claimLevel === "none" ? `
            <button onclick="finalizePeaceNoClaim('${targetIso}')" class="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded font-bold text-xs">Barışı Kabul Et</button>
          ` : `
            <p class="text-cyan-300 font-bold text-[10px]">Haritadan eyalet seçin (maks. ${maxClaim})</p>
            <p class="text-[9px] text-slate-500">Gri = savaş dışı. Altın = seçili.</p>
            <div class="text-[10px] text-cyan-400 font-mono">Seçilen: <span id="claim-selected-count">0</span> / ${maxClaim}</div>
            <div id="peace-selected-list" class="max-h-28 overflow-y-auto text-[10px] text-slate-400"></div>
            <button onclick="confirmTerritoryClaims('${targetIso}', ${maxClaim}, '${claimLevel}')" class="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded font-black text-white text-xs">✅ Barış Anlaşmasını Onayla</button>
          `}
          <button onclick="makePuppet('${targetIso}'); finalizePeaceNoClaim('${targetIso}');" class="w-full py-2 bg-purple-800 hover:bg-purple-700 border border-purple-500 rounded font-bold text-white text-[10px]">🎭 Kukla Devlet Yap</button>
          <button onclick="takeReparations('${targetIso}'); finalizePeaceNoClaim('${targetIso}');" class="w-full py-2 bg-yellow-900/80 hover:bg-yellow-800 border border-yellow-600 rounded font-bold text-white text-[10px]">💰 Savaş Tazminatı Al</button>
          <button onclick="finalizePeaceNoClaim('${targetIso}')" class="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded font-bold text-[10px]">🕊️ Hiçbir Şey Alma / Bırak</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
}


function updateClaimCount(maxClaim) {
    const checks = document.querySelectorAll(".claim-check:checked");
    const countEl = document.getElementById("claim-selected-count");
    if (countEl) countEl.innerText = checks.length;
    // Fazla seçimi engelle
    if (checks.length > maxClaim) {
        checks[checks.length - 1].checked = false;
        if (countEl) countEl.innerText = maxClaim;
        log("Maksimum eyalet limitine ulaştınız.", "text-yellow-400");
    }
}

function confirmTerritoryClaims(targetIso, maxClaim, claimLevel) {
    const checks = (window.peaceSelected && window.peaceSelected.size)
        ? [...window.peaceSelected]
        : Array.from(document.querySelectorAll(".claim-check:checked")).map(c => c.value);
    if (!checks.length) {
        log("Hiç eyalet seçilmedi. Barış imzalandı.", "text-slate-400");
        finalizePeaceNoClaim(targetIso);
        return;
    }
    if (checks.length > maxClaim) {
        log("En fazla " + maxClaim + " eyalet alınabilir.", "text-red-400");
        return;
    }
    if (!GameState.occupations) GameState.occupations = {};
    checks.forEach(pName => {
        const legal = provinceOwners[pName];
        const occ = GameState.occupations[pName];
        if (legal === targetIso || occ === GameState.player) {
            provinceOwners[pName] = GameState.player;
            delete GameState.occupations[pName];
        }
    });
    // Bu savaşta işgal edilip seçilmeyenler serbest bırakılır (barış)
    Object.keys(GameState.occupations).forEach(p => {
        if (provinceOwners[p] === targetIso && GameState.occupations[p] === GameState.player) {
            if (!checks.includes(p)) delete GameState.occupations[p];
        }
    });
    const remaining = Object.keys(provinceOwners).filter(p => provinceOwners[p] === targetIso).length;
    log(checks.length + " eyalet barışla devredildi. Kalan: " + remaining, "text-emerald-400 font-bold");
    if (GameState._lastWonWar) {
      log("Savaş özeti — bizim zayiat: " + (GameState._lastWonWar.casualties||0).toLocaleString() +
          " · düşman: " + (GameState._lastWonWar.enemyCasualties||0).toLocaleString(), "text-slate-400");
      GameState._lastWonWar = null;
    }
    if (typeof updateCapitalMarkers === "function") updateCapitalMarkers();
    if (remaining === 0 && typeof annexCountryFully === "function") {
        annexCountryFully(targetIso);
    }
    finalizePeaceNoClaim(targetIso);
}


/** Ülkeyi tamamen sil / ilhak — savaş, ilişki, mesaj, arabulucu temizliği */
function annexCountryFully(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    if (!target) return;

    // Kalan eyalet varsa (güvenlik) oyuncuya
    Object.keys(provinceOwners).forEach(p => {
        if (provinceOwners[p] === targetIso) provinceOwners[p] = GameState.player;
    });

    target.isCapitulated = true;
    target.occupier = GameState.player;
    target.savedColor = player?.color;
    // Kukla isim sistemi kaldırıldı — ülke adı değişmez


    clearCountryDiplomacy(targetIso);

    // İlhak → asi riski hafif artsın
    GameState.annexCount = (GameState.annexCount || 0) + 1;
    GameState.rebelRiskBonus = Math.min(0.12, (GameState.rebelRiskBonus || 0) + 0.015);
    log(`⚠️ İşgal baskısı: Asi riski +${(0.015*100).toFixed(1)}% (toplam bonus %${((GameState.rebelRiskBonus||0)*100).toFixed(1)})`, "text-orange-400");
}

function clearCountryDiplomacy(targetIso) {
    // Savaşlar
    GameState.activeWars = (GameState.activeWars || []).filter(w =>
        w.target !== targetIso && w.attacker !== targetIso && w.a !== targetIso && w.b !== targetIso
    );
    // İlişki
    if (GameState.relations) delete GameState.relations[targetIso];
    // İttifak / NAP / ticaret
    GameState.alliances = (GameState.alliances || []).filter(a => a.a !== targetIso && a.b !== targetIso);
    GameState.nonAggression = (GameState.nonAggression || []).filter(n => n.a !== targetIso && n.b !== targetIso);
    GameState.tradeDeals = (GameState.tradeDeals || []).filter(d => d.partner !== targetIso);
    GameState.justifications = (GameState.justifications || []).filter(j => j.target !== targetIso);
    // Inbox: o ülkeyle ilgili mesajları sil
    GameState.inbox = (GameState.inbox || []).filter(m => {
        if (m.from === targetIso) return false;
        if (m.data && (m.data.other === targetIso || m.data.target === targetIso)) return false;
        // Metinde geçen arabuluculuk
        if (m.type === "mediation" && m.data?.other === targetIso) return false;
        return true;
    });
    if (typeof updateInboxBadge === "function") updateInboxBadge();
}

function isCountryAlive(iso) {
    if (!iso || !GameState.countries[iso]) return false;
    const c = GameState.countries[iso];
    if (c.isCapitulated) return false;
    const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso);
    // Haritada eyaleti yoksa "ölü" say (ilhak edilmiş)
    if (provs.length === 0 && typeof provinceOwners === "object" && Object.keys(provinceOwners).length > 5) {
        return false;
    }
    return true;
}

function closeTerritoryModal(targetIso, noClaim) {
    finalizePeaceNoClaim(targetIso);
}


function getFlagHtml(iso, sizeClass = "w-8 h-5") {
    const country = GameState.countries[iso];
    if (!country) return `<span class="text-xs text-slate-500">🚫</span>`;
    
    const flagUrl = `https://flagcdn.com/w40/${country.flag}.png`;
    let html = `<div class="relative inline-block ${sizeClass}">`;
    html += `<img src="${flagUrl}" class="w-full h-full object-cover rounded border border-slate-700" alt="${country.name}">`;
    
    // İşgalci varsa, sol üste küçük bayrak ekle
    if (country.occupier) {
        const occ = GameState.countries[country.occupier];
        if (occ) {
            const occFlagUrl = `https://flagcdn.com/w20/${occ.flag}.png`;
            html += `<img src="${occFlagUrl}" class="absolute -top-1 -left-1 w-1/2 h-1/2 object-cover rounded-full border-2 border-white shadow-md" alt="${occ.name}">`;
        }
    }
    
    html += `</div>`;
    return html;
}

        // ===== ZORLUK & GÜÇ DENGESİ =====
        GameState.difficulty = GameState.difficulty || "easy";
        function setDifficulty(level) {
            GameState.difficulty = level || "normal";
            const styles = {
                easy: "diff-btn py-2 rounded border border-emerald-500 bg-emerald-950/40 text-[9px] font-bold text-emerald-300",
                normal: "diff-btn py-2 rounded border border-cyan-500 bg-cyan-950/40 text-[9px] font-bold text-cyan-300",
                hard: "diff-btn py-2 rounded border border-amber-500 bg-amber-950/40 text-[9px] font-bold text-amber-300",
                veryhard: "diff-btn py-2 rounded border border-orange-600 bg-orange-950/40 text-[9px] font-bold text-orange-300",
                impossible: "diff-btn py-2 rounded border border-red-600 bg-red-950/50 text-[9px] font-bold text-red-300"
            };
            const descs = {
                easy: "ÇOK KOLAY: AI pasif · üretim ×2.5 · savunma güçlü · AI orduları zayıf",
                normal: "ORTA: Dengeli, keyifli ve oynanabilir",
                hard: "ZOR: AI daha aktif · kaynaklar biraz sıkı",
                veryhard: "ÇOK ZOR: AI agresif · üretim baskısı",
                impossible: "İMKÂNSIZ: AI ezici · hayatta kalmak zaferdir"
            };
            document.querySelectorAll(".diff-btn").forEach(b => {
                b.className = "diff-btn py-2 rounded border border-slate-600 bg-slate-800 text-[9px] font-bold";
            });
            const btn = document.getElementById("diff-" + level);
            if (btn && styles[level]) btn.className = styles[level];
            const desc = document.getElementById("diff-desc");
            if (desc) desc.innerText = descs[level] || descs.normal;
        }

        function getCountryPower(iso) {
            const c = GameState.countries[iso];
            if (!c) return 0;
            const divs = Object.values(c.divisions || {}).reduce((a,b)=>a+b,0);
            const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso).length;
            const industry = (c.civFactories || 0) + (c.milFactories || 0) * 1.5;
            // Eyalet ağırlıklı güç
            return Math.round(divs * 8 + provs * 12 + industry * 2 + (c.manpower || 0) / 50000);
        }

        function balanceDivisions() {
            // Aşırı orantısız tümenleri törpüle (soft-cap)
            Object.keys(GameState.countries).forEach(iso => {
                const c = GameState.countries[iso];
                if (!c || !c.divisions) return;
                const total = Object.values(c.divisions).reduce((a,b)=>a+b,0);
                const provs = Math.max(1, Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso).length);
                const softCap = Math.min(55, 8 + provs * 3 + Math.floor((c.pop || 1e7) / 2e7));
                if (total > softCap) {
                    const scale = softCap / total;
                    Object.keys(c.divisions).forEach(k => {
                        c.divisions[k] = Math.max(0, Math.round(c.divisions[k] * scale));
                    });
                }
            });
        }

        function applyDifficultyModifiers() {
            const d = GameState.difficulty || "normal";
            // 5 seviye profil
            const profiles = {
                easy:       { agg: 0.15, def: 1.7, pProd: 2.5, aProd: 0.35, pMoney: 2.0, pMp: 1.8, aMoney: 0.4, aDiv: 0.4, aFac: 0.4 },
                normal:     { agg: 0.55, def: 1.35, pProd: 1.25, aProd: 0.75, pMoney: 1.2, pMp: 1.15, aMoney: 0.85, aDiv: 0.8, aFac: 0.85 },
                hard:       { agg: 1.0,  def: 1.15, pProd: 1.0,  aProd: 1.0,  pMoney: 1.0, pMp: 1.0,  aMoney: 1.0,  aDiv: 1.0, aFac: 1.0 },
                veryhard:   { agg: 1.35, def: 1.0,  pProd: 0.85, aProd: 1.25, pMoney: 0.8, pMp: 0.85, aMoney: 1.2,  aDiv: 1.2, aFac: 1.15 },
                impossible: { agg: 1.7,  def: 0.9,  pProd: 0.7,  aProd: 1.5,  pMoney: 0.6, pMp: 0.7,  aMoney: 1.4,  aDiv: 1.4, aFac: 1.3 }
            };
            const pr = profiles[d] || profiles.normal;
            GameState.aiAggression = pr.agg;
            GameState.playerDefBonus = pr.def;
            GameState.playerProdMul = pr.pProd;
            GameState.aiProdMul = pr.aProd;
            Object.keys(GameState.countries).forEach(iso => {
                const c = GameState.countries[iso];
                if (!c) return;
                if (iso === GameState.player) {
                    c.money = Math.floor(c.money * pr.pMoney);
                    c.manpower = Math.floor(c.manpower * pr.pMp);
                    if (d === "easy") {
                        c.factoryEfficiency = Math.min(1.8, (c.factoryEfficiency || 1) + 0.25);
                        c.civFactories = Math.floor((c.civFactories || 0) * 1.25);
                        c.milFactories = Math.floor((c.milFactories || 0) * 1.25);
                        if (c.divisions) {
                            c.divisions.inf = (c.divisions.inf || 0) + 6;
                            c.divisions.art = (c.divisions.art || 0) + 2;
                            c.divisions.arm = (c.divisions.arm || 0) + 1;
                        }
                        c.stockpile = c.stockpile || { guns: 0, artillery: 0, tanks: 0 };
                        c.stockpile.guns = (c.stockpile.guns || 0) + 15000;
                        c.stockpile.artillery = (c.stockpile.artillery || 0) + 400;
                        c.stockpile.tanks = (c.stockpile.tanks || 0) + 80;
                    } else if (d === "normal") {
                        c.factoryEfficiency = Math.min(1.3, (c.factoryEfficiency || 1) + 0.08);
                        if (c.divisions) c.divisions.inf = (c.divisions.inf || 0) + 2;
                        c.stockpile = c.stockpile || {};
                        c.stockpile.guns = (c.stockpile.guns || 0) + 3000;
                    } else if (d === "veryhard" || d === "impossible") {
                        c.factoryEfficiency = Math.max(0.65, (c.factoryEfficiency || 1) - (d === "impossible" ? 0.15 : 0.08));
                    }
                } else {
                    c.money = Math.floor(c.money * pr.aMoney);
                    c.manpower = Math.floor((c.manpower || 0) * pr.aMoney);
                    c.civFactories = Math.max(1, Math.floor((c.civFactories || 1) * pr.aFac));
                    c.milFactories = Math.max(0, Math.floor((c.milFactories || 0) * pr.aFac));
                    if (c.divisions) {
                        Object.keys(c.divisions).forEach(k => {
                            c.divisions[k] = Math.max(0, Math.round(c.divisions[k] * pr.aDiv));
                        });
                    }
                }
            });
        }


/**
 * Senaryo verisini GameState.countries + provinceOwners ile birleştirir.
 * Diskten gelen countryNames / colors / flags / owners uygulanır.
 */
function applyScenarioToGameState(scenarioId) {
    const pack = (typeof SCENARIOS !== "undefined" && SCENARIOS) ? SCENARIOS : {};
    const sc = pack[scenarioId];
    if (!sc) {
        console.error("Senaryo bulunamadı (diskte yok veya yüklenmedi):", scenarioId, "mevcut:", Object.keys(pack));
        return null;
    }

    // 1) provinceOwners
    if (typeof provinceOwners !== "undefined") {
        Object.keys(provinceOwners).forEach(k => delete provinceOwners[k]);
        Object.assign(provinceOwners, sc.provinceOwners || {});
    }

    // 2) Haritada görünen tüm ISO etiketleri (owners + names)
    const tags = new Set();
    Object.values(sc.provinceOwners || {}).forEach(iso => { if (iso) tags.add(iso); });
    Object.keys(sc.countryNames || {}).forEach(iso => tags.add(iso));
    Object.keys(sc.countryColors || {}).forEach(iso => tags.add(iso));
    Object.keys(sc.countryFlags || {}).forEach(iso => tags.add(iso));

    const defaultCountry = (tag, name) => ({
        name: name || tag,
        flag: (sc.countryFlags && sc.countryFlags[tag]) || String(tag).toLowerCase().slice(0, 2),
        color: (sc.countryColors && sc.countryColors[tag]) || "#64748b",
        ideology: "Bilinmiyor",
        pop: 1000000,
        civFactories: 5,
        milFactories: 3,
        money: 1000,
        manpower: 100000,
        divisions: { inf: 5, art: 1, arm: 0 },
        factoryEfficiency: 1.0,
        productionLines: { guns: 1.0, artillery: 1.0, tanks: 1.0 },
        stockpile: { guns: 5000, artillery: 100, tanks: 20 },
        prodAllocation: { guns: 1, artillery: 1, tanks: 1 },
        completedFocuses: [],
        activeFocus: null,
        focusProgress: 0
    });

    tags.forEach(tag => {
        if (!GameState.countries) return;
        const nm = (sc.countryNames && sc.countryNames[tag]) || null;
        if (!GameState.countries[tag]) {
            GameState.countries[tag] = defaultCountry(tag, nm);
            console.log("Yeni ülke (senaryo):", tag, GameState.countries[tag].name);
        } else {
            const c = GameState.countries[tag];
            if (!c._baseName) c._baseName = c.name;
            if (!c._baseColor) c._baseColor = c.color;
            if (!c._baseFlag) c._baseFlag = c.flag;
            if (nm) c.name = nm;
            if (sc.countryColors && sc.countryColors[tag]) c.color = sc.countryColors[tag];
            if (sc.countryFlags && sc.countryFlags[tag]) c.flag = sc.countryFlags[tag];
        }
    });

    // 3) Tarih + tech era
    if (sc.year) GameState.date = new Date(sc.year, 0, 1);
    if (sc.techEra != null) GameState.techEra = sc.techEra;
    GameState.scenarioId = scenarioId;
    GameState.scenarioName = sc.name || scenarioId;

    console.log("✓ Senaryo GameState'e uygulandı:", sc.name || scenarioId,
        "· eyalet:", Object.keys(sc.provinceOwners || {}).length,
        "· ülke etiketi:", tags.size);

    if (typeof refreshMapColors === "function") {
        try { refreshMapColors(); } catch (e) {}
    }
    if (typeof updateHUD === "function") {
        try { updateHUD(); } catch (e) {}
    }
    return sc;
}

        function previewScenario(id) {
            const sc = (typeof SCENARIOS !== "undefined" && SCENARIOS[id]) ? SCENARIOS[id] : null;
            const el = document.getElementById("scenario-desc");
            if (!el) return;
            if (!sc) { el.innerText = "Bilinmeyen senaryo."; return; }
            const n = Object.keys(sc.provinceOwners || {}).length;
            if (id === "ww2" && n === 0) {
                el.innerText = `${sc.name} — eyalet verisi henüz eklenmedi (placeholder). Modern harita kullanılır.`;
            } else {
                el.innerText = `${sc.name} · başlangıç yılı ${sc.year} · ${n} eyalet ataması`;
            }
        }

        function applyScenario(id) {
            const key = id || "modern";
            const pack = (typeof SCENARIOS !== "undefined" && SCENARIOS) ? SCENARIOS : {};
            let sc = pack[key] || null;
            const wantedKey = key;
            if (!sc || !sc.provinceOwners || Object.keys(sc.provinceOwners).length === 0) {
                // Boş senaryo: modern fallback (diskten yüklenmiş olmalı)
                const modern = pack.modern || null;
                if (key === "ww2" && pack.ww2 && modern && modern.provinceOwners) {
                    sc = Object.assign({}, pack.ww2, {
                        provinceOwners: Object.assign({}, modern.provinceOwners)
                    });
                    log("WW2 eyalet verisi boş — modern harita + 1939 çağ kuralları.", "text-yellow-400");
                } else if (modern) {
                    sc = modern;
                    if (key !== "modern") log("Senaryo verisi eksik — Modern Dünya yüklendi.", "text-yellow-400");
                } else {
                    sc = { name: key, year: 2026, techEra: 3, provinceOwners: {}, countryNames: {}, countryColors: {}, countryFlags: {} };
                    log("Senaryo dosyaları yüklenemedi (assets/maps/1083/scenarios/).", "text-red-400");
                }
            }
            // Disk senaryosunu GameState ile birleştir (isim/renk/bayrak/owners)
            // sc id gerçek seçilen key olabilir (fallback modern olduysa wantedKey farklı)
            const applyId = (sc && sc.id) ? sc.id : wantedKey;
            // SCENARIOS[wantedKey] boşsa sc modern olabilir — pack'e yaz
            if (sc && !pack[wantedKey]) {
                // fallback kullanıldı
            }
            // Önce pack'teki gerçek kaydı tercih et
            if (pack[wantedKey] && pack[wantedKey].provinceOwners && Object.keys(pack[wantedKey].provinceOwners).length) {
                sc = pack[wantedKey];
            }
            if (typeof applyScenarioToGameState === "function") {
                applyScenarioToGameState(sc.id || wantedKey);
                // applyScenarioToGameState SCENARIOS[id] kullanır; sc fallback ise id yok
                if (!pack[sc.id || wantedKey] && sc) {
                    // Manuel uygula (fallback sc pack'te yok)
                    Object.keys(provinceOwners).forEach(k => delete provinceOwners[k]);
                    Object.assign(provinceOwners, sc.provinceOwners || {});
                    GameState.scenarioId = wantedKey;
                    GameState.scenarioName = sc.name || wantedKey;
                    GameState.techEra = sc.techEra || 3;
                    if (sc.year) GameState.date = new Date(sc.year, 0, 1);
                }
            } else {
                GameState.scenarioId = wantedKey;
                GameState.scenarioName = sc.name || key;
                GameState.techEra = sc.techEra || 3;
                Object.keys(provinceOwners).forEach(k => delete provinceOwners[k]);
                Object.assign(provinceOwners, sc.provinceOwners || {});
                if (sc.year) GameState.date = new Date(sc.year, 0, 1);
            }
            // İsim/renk senkron (mevcut yardımcılar)
            if (typeof applyCountryNamesForScenario === "function") applyCountryNamesForScenario(sc);
            if (typeof applyScenarioVisuals === "function") applyScenarioVisuals(sc);
            if (GameState.techEra === 1) {
                GameState.nuclear = { progress: 0, unlocked: false, warheads: 0, active: false };
            }
            // Harita yenile
            if (typeof refreshMapColors === "function") setTimeout(refreshMapColors, 50);
            return sc;
        }

        // OYUN BAŞLANGICI VE ENGINE TETİKLEYİCİSİ
        async function startGame() {
            try { if (window._mapPackReady) await window._mapPackReady; } catch(e){}
            // Senaryoları her seferinde diskten zorunlu yükle
            try {
                await loadScenarioPack();
            } catch (e) {
                console.error("Senaryo yükleme hatası (startGame):", e);
            }
            try { MusicPlayer.start(); } catch (e) { console.warn(e); }
            sfx.playVictory();
            const lobbySelect = document.getElementById("lobby-country-select");
            GameState.player = lobbySelect.value;

            // Senaryo uygula (SCENARIOS artık diskten dolu olmalı)
            const scenSel = document.getElementById("lobby-scenario-select");
            const scenId = scenSel ? scenSel.value : "modern";
            console.log("Uygulanacak senaryo:", scenId, "disk anahtarları:", Object.keys(SCENARIOS || {}));
            const sc = applyScenario(scenId);
            console.log("Uygulanan eyalet sayısı:", Object.keys(provinceOwners || {}).length);

            // Event açık/kapalı
            const evToggle = document.getElementById("lobby-events-toggle");
            GameState.eventsEnabled = evToggle ? !!evToggle.checked : true;

            balanceDivisions();
            applyDifficultyModifiers();

            const player = GameState.countries[GameState.player];
            (function(){
              const fl = document.getElementById("hud-flag");
              if (!fl) return;
              const iso = GameState.player;
              const url = (typeof getFlagUrl === "function")
                ? getFlagUrl(iso)
                : (`https://flagcdn.com/w40/${(player.flag || (iso||"un").toLowerCase())}.png`);
              if (url) fl.src = url;
              fl.alt = (player.name || iso || "flag");
            })();
            setText("hud-country-name", (typeof getCountryDisplayName === "function") ? getCountryDisplayName(GameState.player) : player.name);
            setText("hud-country-ideology", player.ideology);
            document.getElementById("log-panel")?.classList.remove("hidden");

            document.getElementById("lobby-screen").classList.add("hidden");
            const _mm = document.getElementById("main-menu-screen");
            if (_mm) _mm.classList.add("hidden");
            try { if (typeof applyCapitalsAndIdentity === "function") applyCapitalsAndIdentity(GameState.scenarioId); } catch(e){}
            
        GameState.running = true;

        // Tüm ülkelere kaynak/ekonomi alanları ekle
        Object.keys(GameState.countries).forEach(iso => {
            if (typeof ensureCivAllocation === "function") ensureCivAllocation(GameState.countries[iso]);
            if (!GameState.relations) GameState.relations = {};
            if (GameState.relations[iso] == null) GameState.relations[iso] = 0;
        });
        
        if (window.gameTickInterval) clearInterval(window.gameTickInterval);
        window.gameTickInterval = setInterval(gameTick, GameState.speed);
            updateHUD();
            log("SİSTEM: Savaş ve seferberlik kabinesi göreve başladı, talimatlarınız bekleniyor.", "text-cyan-400");
            log(`Senaryo: ${GameState.scenarioName || "Modern"} (${GameState.date.getFullYear()}) · Zorluk: ${(GameState.difficulty||"normal").toUpperCase()}`, "text-cyan-400");
            setTimeout(() => { if (typeof refreshMapColors === "function") refreshMapColors(); if (typeof bootV27 === "function") bootV27(); }, 400);

    // Otomatik kaydetme başlat
    startAutoSave();
    
    // Klavye kısayolu (Ctrl + Y)
    document.addEventListener("keydown", handleSaveShortcut);

            // Başlangıç Siyasi Boyaması
            for (let code in GameState.countries) {
                if (d3.select(`#${code}`).node()) {
                    d3.select(`#${code}`).style("fill", GameState.countries[code].color);
                }
            }

if (!document.getElementById("log-panel")) {
    const panel = document.createElement("div");
    panel.id = "log-panel";
    panel.className = "fixed bottom-2 left-1/2 -translate-x-1/2 z-[9999] w-[min(520px,90vw)] h-[100px] bg-[#030712]/92 backdrop-blur-sm p-2 rounded-lg border border-slate-800 flex flex-col justify-end overflow-hidden pointer-events-none shadow-lg";
    
    panel.innerHTML = `
        <div class="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-1 pointer-events-none text-center" style="letter-spacing:0.14em">Komuta günlüğü</div>
        <div id="log-content" class="overflow-y-auto font-mono text-[11px] leading-tight flex flex-col justify-end gap-0.5 scrollbar-none pointer-events-auto">
            <!-- Taktik Loglar -->
        </div>
    `;
    
    document.body.appendChild(panel);
}

// Hemen ardından ilk açılış logunu basabilirsin
log("Sn. Ağaoğlu keyifli oyunlar diler...", "text-green-400");
            // Ana Döngü
            setInterval(gameTick, GameState.speed);
        // Oyun başladığında da haritayı yenile
        setTimeout(refreshMapColors, 500);
        }

        function toggleGameSpeed() {
            GameState.running = !GameState.running;
            setText("btn-speed", GameState.running ? "⏸ DURAKLAT" : "▶️ SÜRDÜR");
            sfx.playBlip();
        }

        // HUD GÜNCELLEME
        
/** Güvenli DOM metin ataması — null element çökmesini önler */
function setText(id, value) {
    const el = (typeof id === "string") ? document.getElementById(id) : id;
    if (!el) return false;
    try { el.innerText = value; } catch (e) { try { el.textContent = value; } catch (e2) {} }
    return true;
}
function setHtml(id, value) {
    const el = (typeof id === "string") ? document.getElementById(id) : id;
    if (!el) return false;
    try { el.innerHTML = value; } catch (e) {}
    return true;
}

function updateHUD() {
            const player = GameState.countries[GameState.player];
            if (!player) return;
            setText("hud-gold", (player.money || 0).toLocaleString());
            setText("hud-manpower", formatNumber(player.manpower || 0));
            setText("hud-factories", `${player.civFactories || 0} / ${player.milFactories || 0}`);
            setText("hud-tension", (GameState.globalTension || 0) + "%");
            const st = player.stockpile || { guns: 0, artillery: 0, tanks: 0 };
            setText("dash-guns", (st.guns || 0).toLocaleString());
            setText("dash-artillery", (st.artillery || 0).toLocaleString());
            setText("dash-tanks", (st.tanks || 0).toLocaleString());
            const totalDivs = Object.values(player.divisions || {}).reduce((a, b) => a + b, 0);
            setText("dash-divs", String(totalDivs));
            if (player.name) setText("hud-country-name", (typeof getCountryDisplayName === "function") ? getCountryDisplayName(GameState.player) : player.name);
            if (player.ideology) setText("hud-country-ideology", player.ideology);
        }

        function formatNumber(num) {
            if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
            if (num >= 1000) return (num / 1000).toFixed(0) + "K";
            return num;
        }

function log(msg, typeClass = "text-slate-400") {
    const logContent = document.getElementById("log-content");
    if (!logContent) return; 

    // Tarih formatı (iki haneli)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const months = ['OCA','ŞUB','MAR','NİS','MAY','HAZ','TEM','AĞU','EYL','EKİ','KAS','ARA'];
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const dateStr = `${day} ${month} ${year}`;
    
    const p = document.createElement("p");
    p.className = `${typeClass} tracking-wide font-semibold drop-shadow-[1px_1px_0px_rgba(0,0,0,1)]`;
    const safeMsg = (typeof formatInlineFlags === "function") ? formatInlineFlags(String(msg)) : String(msg);
    p.innerHTML = `<span class="text-slate-600">[${dateStr}]</span> ${safeMsg}`;
    logContent.appendChild(p);

    while (logContent.children.length > 25) {
        logContent.removeChild(logContent.firstChild);
    }

    logContent.scrollTop = logContent.scrollHeight;
}

// HAFTALIK GAME TICK SIMÜLASYONU
function gameTick() {
    if (!GameState.running || GameState.gameOver) return;
    try {
    // 1. Tarihi İlerlet (1 GÜN)
    GameState.date.setDate(GameState.date.getDate() + 1);
    
    // === İKİ HANELİ TARİH FORMATI ===
    const day = String(GameState.date.getDate()).padStart(2, '0');
    const months = ['OCA','ŞUB','MAR','NİS','MAY','HAZ','TEM','AĞU','EYL','EKİ','KAS','ARA'];
    const month = months[GameState.date.getMonth()];
    const year = GameState.date.getFullYear();
   
    setText("hud-date", `${day} ${month} ${year}`);

            const player = GameState.countries[GameState.player];
            if (!player) { try { if (typeof updateHUD === "function") updateHUD(); } catch(e){} return; }

            // 2. Ekonomik & Endüstriyel Çıktı (GÜNLÜK — eski haftalık / 7) + zorluk çarpanı
            const DAY = 1/7;
            const prodMul = GameState.playerProdMul || 1;
            const eff = player.factoryEfficiency || 1.0;
            const lineEff = player.productionLines || { guns: 1.0, artillery: 1.0, tanks: 1.0 };

            player.money += Math.max(0, Math.floor(player.civFactories * 15 * eff * DAY * prodMul * (1 - (player._culturePenalty || 0))));

            // PROVINCE_DATA kaynak geliri (eyalet başına)
            if (typeof getCountryResourceSummary === "function" && typeof ensureStratResources === "function") {
                ensureStratResources(player);
                const rs = getCountryResourceSummary(GameState.player);
                const oilN = rs.oil || 0, steelN = rs.steel || 0, rubberN = rs.rubber || 0;
                const coalN = rs.coal || 0, grainN = rs.grain || 0, alumN = rs.aluminum || 0;
                player.strat.oil = (player.strat.oil || 0) + Math.floor(oilN * 0.35 * DAY * prodMul);
                player.strat.steel = (player.strat.steel || 0) + Math.floor((steelN + coalN * 0.5) * 0.3 * DAY * prodMul);
                player.strat.rubber = (player.strat.rubber || 0) + Math.floor(rubberN * 0.25 * DAY * prodMul);
                player.strat.aluminum = (player.strat.aluminum || 0) + Math.floor(alumN * 0.2 * DAY * prodMul);
                player.money += Math.floor(grainN * 0.4 * DAY * prodMul);
            }
            
            player.stockpile.guns += Math.max(0, Math.floor(player.prodAllocation.guns * 15 * lineEff.guns * eff * DAY * prodMul));
            player.stockpile.artillery += Math.max(0, Math.floor(player.prodAllocation.artillery * 2 * lineEff.artillery * eff * DAY * prodMul));
            player.stockpile.tanks += Math.max(0, Math.floor(player.prodAllocation.tanks * 1 * lineEff.tanks * eff * DAY * prodMul));
           
            player.manpower += Math.max(0, Math.floor(player.pop * 0.0005 * DAY * (prodMul > 1 ? 1.3 : 1)));

            // Sivil sektör yatırımları (ekstra gelir + kaynak)
            if (typeof processCivilianEconomy === "function") processCivilianEconomy();
            if (typeof processTradeDeals === "function") processTradeDeals();
            if (typeof processJustifications === "function") processJustifications();
            if (typeof processNAPs === "function") processNAPs();
            if (GameState.eventsEnabled !== false) {
                if (typeof processRandomEvents === "function") processRandomEvents();
                if (typeof processChoiceEvents === "function") processChoiceEvents();
            if (typeof processHistoricalEvents === "function") processHistoricalEvents();
            }
            if (typeof processAIDiplomacy === "function") processAIDiplomacy();
            if (typeof processInboxExpiry === "function") processInboxExpiry();
            if (typeof processNuclear === "function") processNuclear();
            if (typeof processAllianceTick === "function") processAllianceTick();
            if (typeof processMediator === "function") processMediator();
            if (typeof processHostileInsults === "function") processHostileInsults();
            if (typeof processStrategicResources === "function") processStrategicResources();
            if (typeof processResearch === "function") processResearch();
            if (typeof processAITick === "function") processAITick();
            if (typeof processRebels === "function") processRebels();
            if (typeof processIdeologyTick === "function") processIdeologyTick();
            if (typeof processSubjectTributes === "function") processSubjectTributes();
            if (typeof processSpyMissions === "function") processSpyMissions();
            if (typeof processCultureUnrest === "function") processCultureUnrest();
            if (typeof processProvinceEconomy === "function") processProvinceEconomy();
            if (typeof processAIDiplomacyRare === "function") processAIDiplomacyRare();
            if (typeof processIncidents === "function") processIncidents();
            if (typeof updateInboxBadge === "function") updateInboxBadge();
            if (GameState.gameOver) return;

            // 3. Kışla Eğitim Sırası Yönetimi
            for (let i = GameState.trainingQueue.length - 1; i >= 0; i--) {
                const item = GameState.trainingQueue[i];
                item.progress++;
                if (item.progress >= item.duration) {
                    player.divisions[item.type]++;
                    log(`MİLLİ SAVUNMA: Yeni bir ${item.title} eğitimini tamamlayarak cephe hattına sevk edildi.`, "text-emerald-400 font-bold");
                    GameState.trainingQueue.splice(i, 1);
                }
            }

            // 4. Odak Ağacı İlerleyişi
            if (player.activeFocus) {
                player.focusProgress += 1.5; // günlük (~70 gün / odak)

                const tree = (GameState.activeFocusTree && GameState.activeFocusTree[GameState.player]) || [];
                const activeFocusData = Array.isArray(tree) ? tree.find(n => n && n.id === player.activeFocus) : null;
                const focusDisplay = document.getElementById("active-focus-display");

                if (activeFocusData && focusDisplay) {
                    try {
                        focusDisplay.innerHTML = `
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-slate-200">${activeFocusData.title || player.activeFocus}</span>
                        <span class="text-xs font-mono text-cyan-400">${Math.min(100, Math.floor(player.focusProgress))}%</span>
                    </div>
                    <div class="w-full bg-slate-950 rounded-full h-1">
                        <div class="bg-cyan-500 h-1 rounded-full transition-all duration-1000" style="width: ${Math.min(100, player.focusProgress)}%"></div>
                    </div>
                `;
                    } catch (e) {
                        console.warn("gameTick focusDisplay:", e);
                    }
                }

                const focusPanel = document.getElementById("focus-tree-panel");
                if (focusPanel && !focusPanel.classList.contains("hidden") && typeof renderFocusTree === "function") {
                    try { renderFocusTree(); } catch (e) { console.warn("renderFocusTree:", e); }
                }

                if (player.focusProgress >= 100) {
                    try {
                        if (activeFocusData && typeof activeFocusData.reward === "function") activeFocusData.reward();
                    } catch (e) { console.warn("focus reward:", e); }
                    player.completedFocuses = player.completedFocuses || [];
                    player.completedFocuses.push(player.activeFocus);
                    player.activeFocus = null;
                    player.focusProgress = 0;
                    if (focusDisplay) {
                        try {
                            focusDisplay.innerHTML = `<div class="text-xs text-slate-500 italic">Milli odak tamamlandı. Yeni bir odak seçebilirsiniz.</div>`;
                        } catch (e) {}
                    }
                    if (typeof renderFocusTree === "function") {
                        try { renderFocusTree(); } catch (e) {}
                    }
                }
            }

            // 5. Cephe Muharebe Çatışmaları
            for (let i = GameState.activeWars.length - 1; i >= 0; i--) {
                const war = GameState.activeWars[i];
                if (!war.attacker) war.attacker = GameState.player;
                war.totalWeeks = (war.totalWeeks || 0) + 1;
                if (war.lastProgress == null) war.lastProgress = war.progress;

                const target = GameState.countries[war.target];
                const attackerC = GameState.countries[war.attacker] || player;
                const prevProgress = war.progress;
                // Sadece saldıranın mühimmatı (savunan oyuncu kendi stokunu yemesin)
                const supplyActor = attackerC;
                if (!supplyActor.stockpile) supplyActor.stockpile = { guns: 0, artillery: 0, tanks: 0 };

                // Lojistik Mühimmat Kontrolü (saldıran)
                if ((supplyActor.stockpile.guns || 0) >= (war.dailyGunsReq || 0) && (supplyActor.stockpile.artillery || 0) >= (war.dailyArtilleryReq || 0)) {
                    supplyActor.stockpile.guns -= (war.dailyGunsReq || 0);
                    supplyActor.stockpile.artillery -= (war.dailyArtilleryReq || 0);

                    // Çatışma Güç Hesabı + hava üstünlüğü + petrol cezası
                    const globalThreatBonus = GameState.globalTension > 50 ? (GameState.globalTension / 50) : 1;
                    const oilPen = typeof getOilPenalty === "function" ? getOilPenalty(player) : 1;
                    const airBonus = typeof getAirSupremacyBonus === "function" ? getAirSupremacyBonus(player, target) : 1;
                    const gen = typeof getGeneralBonus === "function" ? getGeneralBonus() : { atk: 1, def: 1 };
                    const doc = player.doctrine || {};
                    const armMul = oilPen * (doc.arm || 1);
                    const infMul = (doc.inf || 1);
                    const defB = GameState.playerDefBonus || 1.2;
                    // Düşman eyaletlerinde ortalama arazi savunma bonusu (PROVINCE_DATA)
                    let terrainDef = 1;
                    if (typeof getTerrainDefenseBonus === "function") {
                        const enemyProvs = Object.keys(provinceOwners).filter(p => provinceOwners[p] === war.target);
                        if (enemyProvs.length) {
                            const sample = enemyProvs.slice(0, 12);
                            terrainDef = sample.reduce((s, p) => s + getTerrainDefenseBonus(p), 0) / sample.length;
                        }
                    }
                    // V47 HOI-tarzı muharebe turu (org/HP/soft-hard/width)
                    if (typeof resolveHoiCombatDay === "function") {
                      resolveHoiCombatDay(war, attackerC, target, {
                        airBonus, oilPen, terrainDef, gen, doc, infMul, armMul, globalThreatBonus
                      });
                    } else {
                      const pForce = (((attackerC.divisions||{}).inf * 10 * infMul) + ((attackerC.divisions||{}).art * 20) + ((attackerC.divisions||{}).arm * 40 * armMul)) * airBonus;
                      const tForce = (((target.divisions||{}).inf * 10) + ((target.divisions||{}).art * 20) + ((target.divisions||{}).arm * 40)) * 0.55;
                      const ratio = (pForce * 1.2) / Math.max(1, tForce);
                      war.progress += v27WarProgressDelta((Math.random() * 1.4 + 0.55) * Math.max(0.45, ratio) * 1.8);
                      if (typeof processFrontOccupation === "function") processFrontOccupation(war);
                    }
                } else {
                    war.progress -= ({ easy: 0.8, normal: 1.5, hard: 2.5, veryhard: 3, impossible: 3.5 })[GameState.difficulty] || 1.5;
                    if (war.combat) {
                      war.combat.atk.org = Math.max(0, (war.combat.atk.org || 0) - 4);
                    }
                    if (Math.random() < 0.5) log("SAVAŞ: Mühimmat düşük — org düşüyor, cephe yavaşlıyor.", "text-yellow-500");
                }

                // Müttefik desteği: ilerleme düştüyse
                if (war.progress < prevProgress) {
                    if (typeof processAllySupport === "function") processAllySupport(war, prevProgress);
                }
                war.lastProgress = war.progress;

                if (war.progress >= 100) {
                    resolveWar(i, true);
                    GameState.globalTension = Math.min(100, GameState.globalTension + 15);
                    log('ULUSLARARASI KRİZ: Agresif genişlememiz yüzünden küresel gerilim arttı!', 'text-red-500 font-bold');
                } else if (war.progress < -20) {
                    resolveWar(i, false);
                }
            }

            // 6. Küresel Tansiyon Artışı
            if (GameState.date.getMonth() === 5 && GameState.date.getDate() <= 7) {
                GameState.globalTension = Math.min(100, GameState.globalTension + Math.floor(Math.random() * 10 + 3));
                log("DANIŞMAN: Küresel gerilim seviyesi tırmanıyor! Milletlerarası ilişkiler yeniden şekilleniyor. Bu durumda kendimize diplomatik dostluklar kurmamız yapabileceğimiz en iyi şeydir.", "text-yellow-500 font-bold");
            }

            // ANA AI TÜMEN BASMA MOTORU
            Object.keys(GameState.countries).forEach(cId => {
                if (cId !== GameState.player) {
                    const aiCountry = GameState.countries[cId];
                    if (Math.random() < 0.15) {
                        const types = ['inf', 'art', 'arm'];
                        const randomType = types[Math.floor(Math.random() * types.length)];
                        aiCountry.divisions[randomType] = (aiCountry.divisions[randomType] || 0) + 1;
                    }
                }
            });

            try { updateHUD(); } catch (e) { console.warn("updateHUD:", e); }
            try { if (typeof renderActiveWarsDisplay === "function") renderActiveWarsDisplay(); } catch (e) { console.warn("renderActiveWarsDisplay:", e); }
            // Açık sekme canlı güncelle (ekonomi stokları, diplomasi gerekçe %, vs.)
            try { if (typeof refreshOpenTab === "function") refreshOpenTab(); } catch (e) { console.warn("refreshOpenTab:", e); }
    } catch (e) {
        console.warn("gameTick fault:", e && (e.message || e), e && e.stack ? String(e.stack).split("\n").slice(0, 3).join(" | ") : "");
    }
        }

        function renderActiveWarsDisplay() {
            const container = document.getElementById("dash-active-wars");
            if (!container) return;
            let html = "";

            // Asi cephesi
            if (GameState.rebelActive) {
                const rp = Math.min(100, Math.max(0, Math.floor(GameState.rebelProgress || 0)));
                html += `
                <div class="bg-slate-900 p-3 rounded border border-orange-700/80 relative overflow-hidden mb-2">
                    <div class="absolute top-0 left-0 h-1 bg-orange-500 transition-all duration-1000" style="width: ${rp}%"></div>
                    <div class="flex justify-between items-center text-xs font-semibold mb-1">
                        <span class="text-orange-400">⚠️ Asi Hareketi</span>
                        <span class="font-mono text-orange-300">${rp}% Tehdit</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mb-2">${GameState.rebelWeeks || 0}. hafta · Gerilim ${GameState.globalTension}%</p>
                    <div class="flex gap-2">
                        <button onclick="suppressRebels(false)" class="flex-1 py-1.5 bg-yellow-900/80 hover:bg-yellow-800 border border-yellow-600 rounded text-[10px] font-bold">🛡️ Bastır (200💰)</button>
                        <button onclick="suppressRebels(true)" class="flex-1 py-1.5 bg-red-900/80 hover:bg-red-800 border border-red-600 rounded text-[10px] font-bold">⚔️ Ağır Darbe (500💰 +5K👤)</button>
                    </div>
                </div>`;
            }

            if (GameState.activeWars.length === 0 && !GameState.rebelActive) {
                container.innerHTML = `<div class="text-xs text-slate-500 italic text-center py-4 bg-slate-900/50 rounded border border-slate-800">Barıştayız · İç istikrar yerinde.</div>`;
                return;
            }

            html += GameState.activeWars.map((war, index) => {
                const att = war.attacker || GameState.player;
                const def = war.target;
                const iAmAttacker = att === GameState.player;
                const iAmDefender = def === GameState.player;
                // Skor: saldıran +progress, savunan -progress (simetrik)
                const raw = Math.floor(war.progress || 0);
                const shown = (typeof getWarScoreForViewer === "function")
                    ? getWarScoreForViewer(war, GameState.player)
                    : (iAmDefender ? -raw : raw);
                const enemyIso = iAmAttacker ? def : att;
                const name = GameState.countries[enemyIso]?.name || enemyIso;
                const weeks = war.totalWeeks || 0;
                const ally = war.allyBoost ? ` · Müttefik +${war.allyBoost.toFixed(0)}` : "";
                const role = iAmAttacker ? "Taarruz" : (iAmDefender ? "Savunma" : "Cephe");
                const barPct = Math.min(100, Math.max(0, iAmDefender ? (100 - raw) : raw));
                const myCas = iAmAttacker ? (war.casualties||0) : (war.enemyCasualties||0);
                const enCas = iAmAttacker ? (war.enemyCasualties||0) : (war.casualties||0);
                return `
                <div class="bg-slate-900 p-3 rounded border border-red-900/60 relative overflow-hidden">
                    <div class="absolute top-0 left-0 h-1 ${shown>=0?"bg-cyan-600":"bg-red-600"} transition-all duration-1000" style="width: ${barPct}%"></div>
                    <div class="flex justify-between items-center text-xs font-semibold">
                        <span class="text-red-500">⚔️ ${name} · ${role}</span>
                        <span class="font-mono ${shown>=0?"text-cyan-300":"text-red-400"}">${shown>=0?"+":""}${shown}% skor</span>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1">${weeks}. hafta · ${att}→${def}${ally}${war.frontAssigned ? " · 📍 Cephe" : ""}</div>
                    <div class="mt-1 grid grid-cols-2 gap-1 text-[9px] font-mono">
                        <div class="bg-slate-950/80 p-1 rounded border border-slate-800">Bizim zayiat: <span class="text-red-400">${Number(myCas).toLocaleString()}</span></div>
                        <div class="bg-slate-950/80 p-1 rounded border border-slate-800">Düşman zayiat: <span class="text-orange-400">${Number(enCas).toLocaleString()}</span></div>
                    </div>
                    <div class="w-full bg-slate-950 h-1.5 rounded mt-1 overflow-hidden flex">
                        <div class="bg-cyan-500 h-full" style="width:${Math.max(2, barPct)}%"></div>
                        <div class="bg-red-700 h-full flex-1"></div>
                    </div>
                    ${iAmAttacker && !war.frontAssigned ? `<button onclick="assignFront(${index})" class="mt-1 w-full py-1 bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-700 rounded text-[9px] font-bold">📍 Birlikleri Cepheye Ata (+%15)</button>` : ""}
                </div>`;
            }).join("");

            container.innerHTML = html;
}

function assignFront(warIndex) {
    const war = GameState.activeWars[warIndex];
    if (!war) return;
    war.frontAssigned = true;
    log(`📍 Cephe hattı kuruldu: ${GameState.countries[war.target]?.name} — birlikler ilerliyor.`, "text-cyan-400");
    renderActiveWarsDisplay();
}

function suppressRebels(heavy) {
    if (!GameState.rebelActive) return;
    const player = GameState.countries[GameState.player];
    const cost = heavy ? 500 : 200;
    const mp = heavy ? 5000 : 0;
    if (player.money < cost) { log("Bastırma için yetersiz hazine.", "text-red-500"); return; }
    if (mp && player.manpower < mp) { log("Ağır darbe için 5.000 insan gücü gerekli.", "text-red-500"); return; }
    player.money -= cost;
    if (mp) player.manpower -= mp;
    const dmg = heavy ? (20 + Math.floor(Math.random() * 15)) : (10 + Math.floor(Math.random() * 10));
    GameState.rebelProgress = Math.max(0, GameState.rebelProgress - dmg);
    log(`🛡️ Asi bastırma: −${dmg}% tehdit (${cost}💰${heavy ? " +5K👤" : ""})`, "text-yellow-400");
    if (GameState.rebelProgress <= 0) {
        GameState.rebelActive = false;
        GameState.rebelProgress = 0;
        GameState.globalTension = Math.max(25, GameState.globalTension - 18);
        log("✅ Asiler bastırıldı!", "text-emerald-400 font-bold");
        sfx.playVictory();
    }
    updateHUD();
    renderActiveWarsDisplay();
}

// --- KUŞLARIN GİZLİ ORDUSU EASTER EGG (TEK KULLANIMLIK) ---
let inputBuffer = "";
const targetCodes = {
    "limon": { 
        msg: "🍋 Limon Tümeni Göreve Hazır! (+50K İnsan Gücü)", 
        used: false, 
        action: () => { GameState.countries[GameState.player].manpower += 50000; } 
    },
    "hello": {
        msg: "✏️ Harita Editörü açıldı (gizli komut)",
        used: false,
        reusable: true,
        action: () => { if (typeof toggleMapEditor === "function") toggleMapEditor(); }
    },
    "fairy": { 
        msg: "🧚 Fairy Hava Desteği Sağlandı! (+20 Askeri Fabrika)", 
        used: false, 
        action: () => { GameState.countries[GameState.player].milFactories += 20; } 
    },
    "fosfor": { 
        msg: "🧪 Fosforlu Mühimmat Aktif! (+10K Piyade Tüfeği)", 
        used: false, 
        action: () => { GameState.countries[GameState.player].stockpile.guns += 10000; } 
    },
    "kral": { 
        msg: "👑 Kral Geldi Hükmediyor! (+5000 Hazine)", 
        used: false, 
        action: () => { GameState.countries[GameState.player].money += 5000; } 
    },
    "grok": {
        msg: "Gizli teşvik: +3 teknoloji, +8000 hazine",
        used: false,
        action: () => {
            const c = GameState.countries[GameState.player];
            if (c) { c.money = (c.money||0) + 8000; c.civFactories = (c.civFactories||0) + 2; }
        }
    },
    "ataturk": {
        msg: "⭐ Muhtaç olduğun kudret damarlarındaki asil kanda mevcuttur! (+5 tümen, istikrar)",
        used: false,
        action: () => {
            const c = GameState.countries[GameState.player];
            if (!c) return;
            c.divisions = c.divisions || {};
            c.divisions.inf = (c.divisions.inf||0) + 5;
            c.stability = Math.min(100, (c.stability||50) + 15);
            c.manpower = (c.manpower||0) + 50000;
        }
    }
};

window.addEventListener("keydown", (e) => {
    if (window.mpIsActive && window.mpIsActive()) return; // V53: MP easter egg kilidi
    if (e.key.length === 1) {
        inputBuffer += e.key.toLowerCase();
        inputBuffer = inputBuffer.slice(-10); // Son 10 karakteri hafızada tut
        
        for (let code in targetCodes) {
            // Eğer yazılan kelime eşleşiyorsa VE daha önce KULLANILMAMIŞSA
            if (inputBuffer.endsWith(code) && (!targetCodes[code].used || targetCodes[code].reusable)) {
                if (!targetCodes[code].reusable) targetCodes[code].used = true;
                targetCodes[code].action();
                
                if (typeof updateHUD === "function") updateHUD();
                showEasterEggNotification(targetCodes[code].msg);
                
                inputBuffer = ""; // Tamponu temizle
                break;
            }
        }
    }
});

function showEasterEggNotification(message) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "fixed bottom-5 right-5 bg-slate-900 border-2 border-yellow-500 text-yellow-400 px-4 py-3 rounded shadow-2xl z-50 military-font text-xs tracking-wider animate-bounce";
    alertDiv.innerHTML = `⚠️ GİZLİ EMİR ALINDI: ${message}`;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 4000);
}

// ====================== EKONOMİ & TİCARET SİSTEMİ ======================
const CIV_SECTORS = {
    agriculture: { name: "🌾 Tarım", incomePerFactory: 12, cost: 0, resource: "food" },
    mining:      { name: "⛏️ Madencilik", incomePerFactory: 18, cost: 0, resource: "ore" },
    energy:      { name: "⚡ Enerji", incomePerFactory: 22, cost: 0, resource: "energy" },
    trade:       { name: "🚢 Ticaret", incomePerFactory: 28, cost: 0, resource: "goods" }
};

// Her ülkeye civAllocation ekle (yoksa)
function ensureCivAllocation(country) {
    if (!country.civAllocation) {
        country.civAllocation = { agriculture: 0, mining: 0, energy: 0, trade: 0 };
    }
    if (!country.resources) {
        country.resources = { food: 50, ore: 30, energy: 40, goods: 20 };
    }
}

function renderEconomyTab() {
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);

    const totalCiv = player.civFactories;
    const used = Object.values(player.civAllocation).reduce((a,b)=>a+b,0);
    const free = totalCiv - used;

    setText("econ-civ-count", `${totalCiv} Sivil Fabrika (${free} boşta)`);

    const list = document.getElementById("civ-investment-list");
    list.innerHTML = Object.keys(CIV_SECTORS).map(key => {
        const sec = CIV_SECTORS[key];
        const alloc = player.civAllocation[key] || 0;
        const weekly = alloc * sec.incomePerFactory;
        return `
            <div class="bg-slate-900 p-3 rounded border border-slate-800 space-y-1">
                <div class="flex justify-between items-center text-xs font-bold">
                    <span>${sec.name}</span>
                    <span class="text-cyan-400">${alloc} Fabrika → +${weekly} 💰/hafta</span>
                </div>
                <div class="flex items-center gap-3">
                    <input type="range" min="0" max="${totalCiv}" value="${alloc}" 
                        oninput="adjustCivAllocation('${key}', this.value)" 
                        class="flex-1 accent-yellow-500">
                    <span class="text-[10px] text-slate-400 w-16 text-right font-mono">${alloc} fab</span>
                </div>
            </div>
        `;
    }).join("");

    // Kaynak stokları
    const stocks = document.getElementById("resource-stocks");
    const resNames = { food: "🌾 Gıda", ore: "⛏️ Maden", energy: "⚡ Enerji", goods: "📦 Mallar" };
    stocks.innerHTML = Object.keys(resNames).map(r => `
        <div class="bg-slate-900 p-2 rounded border border-slate-800 flex justify-between">
            <span class="text-slate-400">${resNames[r]}</span>
            <span class="font-mono text-slate-200">${player.resources[r] || 0}</span>
        </div>
    `).join("");

    // Gelir özeti
    let totalIncome = 0;
    Object.keys(CIV_SECTORS).forEach(k => {
        totalIncome += (player.civAllocation[k] || 0) * CIV_SECTORS[k].incomePerFactory;
    });
    // Temel sivil gelir de ekle (eski sistem uyumu)
    const baseIncome = Math.floor(player.civFactories * 15 * (player.factoryEfficiency || 1));
    document.getElementById("econ-income-summary").innerHTML = `
        Sektör yatırımları: <span class="text-emerald-400">+${totalIncome}</span> / hafta<br>
        Temel sivil üretim: <span class="text-yellow-400">+${baseIncome}</span> / hafta<br>
        <span class="text-slate-400 text-[10px]">(Temel üretim her zaman çalışır; sektörler ekstra gelir + kaynak üretir)</span>
    `;

    // Nükleer
    if (!GameState.nuclear) GameState.nuclear = { progress: 0, unlocked: false, warheads: 0 };
    const n = GameState.nuclear;
    const bar = document.getElementById("nuclear-bar");
    const pct = document.getElementById("nuclear-pct");
    const st = document.getElementById("nuclear-state");
    if (bar) bar.style.width = Math.min(100, n.progress || 0) + "%";
    if (pct) pct.innerText = Math.floor(n.progress || 0) + "%";
    if (st) {
        if (n.unlocked) st.innerText = `☢️ ${n.warheads || 1} savaş başlığı`;
        else if (n.active) st.innerText = "Araştırma aktif";
        else st.innerText = "Kapalı";
    }
}

function adjustCivAllocation(sector, value) {
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);
    value = parseInt(value);
    const total = player.civFactories;
    let others = 0;
    for (let k in player.civAllocation) {
        if (k !== sector) others += player.civAllocation[k];
    }
    if (others + value > total) {
        value = total - others;
    }
    player.civAllocation[sector] = value;
    renderEconomyTab();
}

// Haftalık ekonomi tick (gameTick içine eklenecek)
function processCivilianEconomy() {
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);
    Object.keys(CIV_SECTORS).forEach(key => {
        const alloc = player.civAllocation[key] || 0;
        if (alloc <= 0) return;
        const sec = CIV_SECTORS[key];
        // Extra para
        player.money += alloc * sec.incomePerFactory;
        // Kaynak üret
        player.resources[sec.resource] = (player.resources[sec.resource] || 0) + alloc * 3;
    });
}

// Ticaret modalı
function openTradeModal(targetIso) {
    if (typeof isHostileToward === "function" && isHostileToward(targetIso)) {
        log("Düşmanlıkta ticaret yapılamaz.", "text-red-500");
        return;
    }
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);
    ensureCivAllocation(target);

    document.getElementById("trade-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "trade-modal";
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border-2 border-emerald-600 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div class="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 class="text-sm font-black text-emerald-400 uppercase">💰 Ticaret — ${target.name}</h3>
                <button onclick="document.getElementById('trade-modal').remove()" class="text-red-400 text-lg">✕</button>
            </div>
            <p class="text-[11px] text-slate-400">Karşı tarafa para teklif ederek kaynak satın alın veya kaynak satarak para kazanın.</p>
            <div class="space-y-2 text-xs">
                <label class="block text-slate-300">Kaynak:</label>
                <select id="trade-resource" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                    <option value="food">🌾 Gıda</option>
                    <option value="ore">⛏️ Maden</option>
                    <option value="energy">⚡ Enerji</option>
                    <option value="goods">📦 Mallar</option>
                </select>
                <label class="block text-slate-300 mt-2">Miktar:</label>
                <input type="number" id="trade-amount" min="1" value="10" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                <label class="block text-slate-300 mt-2">İşlem:</label>
                <select id="trade-action" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                    <option value="buy">Satın Al (para ver → kaynak al)</option>
                    <option value="sell">Sat (kaynak ver → para al)</option>
                </select>
            </div>
            <div class="flex gap-2 pt-2">
                <button onclick="executeTrade('${targetIso}')" class="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 rounded font-black text-white">Onayla</button>
                <button onclick="document.getElementById('trade-modal').remove()" class="px-4 py-3 bg-slate-700 rounded font-bold">İptal</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function executeTrade(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);
    ensureCivAllocation(target);

    const res = document.getElementById("trade-resource").value;
    const amount = parseInt(document.getElementById("trade-amount").value) || 0;
    const action = document.getElementById("trade-action").value;
    const pricePerUnit = { food: 8, ore: 12, energy: 15, goods: 20 }[res] || 10;
    const totalPrice = amount * pricePerUnit;

    if (amount <= 0) { log("Geçersiz miktar.", "text-red-500"); return; }

    if (action === "buy") {
        if (player.money < totalPrice) {
            log("Yetersiz hazine.", "text-red-500"); return;
        }
        // AI'nin kaynağı var mı diye basit kontrol
        if ((target.resources[res] || 0) < amount) {
            log(`${target.name} yeterli ${res} stokuna sahip değil.`, "text-red-500"); return;
        }
        player.money -= totalPrice;
        player.resources[res] = (player.resources[res] || 0) + amount;
        target.resources[res] -= amount;
        target.money += totalPrice;
        log(`TİCARET: ${target.name}'den ${amount} ${res} satın alındı (−${totalPrice} 💰)`, "text-emerald-400");
    } else {
        if ((player.resources[res] || 0) < amount) {
            log("Yetersiz kaynak stoku.", "text-red-500"); return;
        }
        player.resources[res] -= amount;
        player.money += totalPrice;
        target.resources[res] = (target.resources[res] || 0) + amount;
        target.money = Math.max(0, (target.money || 0) - totalPrice);
        log(`TİCARET: ${target.name}'e ${amount} ${res} satıldı (+${totalPrice} 💰)`, "text-emerald-400");
    }
    updateHUD();
    document.getElementById("trade-modal")?.remove();
    if (document.getElementById("content-economy") && !document.getElementById("content-economy").classList.contains("hidden")) {
        renderEconomyTab();
    }
}

function proposeResourceTrade(targetIso) {
    if (typeof isHostileToward === "function" && isHostileToward(targetIso)) {
        log("Düşmanlıkta takas yapılamaz.", "text-red-500");
        return;
    }
    const player = GameState.countries[GameState.player];
    const target = GameState.countries[targetIso];
    ensureCivAllocation(player);
    ensureCivAllocation(target);

    const resLabel = { food: "🌾 Gıda", ore: "⛏️ Maden", energy: "⚡ Enerji", goods: "📦 Mallar" };
    const resKeys = ["food", "ore", "energy", "goods"];

    document.getElementById("trade-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "trade-modal";
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border-2 border-cyan-600 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div class="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 class="text-sm font-black text-cyan-400 uppercase">🔄 Kaynak Takası — ${target.name}</h3>
                <button onclick="document.getElementById('trade-modal').remove()" class="text-red-400 text-lg">✕</button>
            </div>
            <p class="text-[11px] text-slate-400">Ne vereceğini ve ne isteyeceğini seç. AI ilişki, stok ve oranına göre kabul/red eder.</p>
            <div class="grid grid-cols-2 gap-3 text-xs">
                <div class="space-y-2">
                    <label class="text-slate-300 font-bold block">Sen veriyorsun</label>
                    <select id="barter-give-res" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                        ${resKeys.map(k => `<option value="${k}">${resLabel[k]} (stok: ${player.resources[k]||0})</option>`).join("")}
                    </select>
                    <input type="number" id="barter-give-amt" min="1" value="20" class="w-full bg-slate-800 border border-slate-600 rounded p-2" placeholder="Miktar">
                </div>
                <div class="space-y-2">
                    <label class="text-slate-300 font-bold block">Karşıdan istiyorsun</label>
                    <select id="barter-want-res" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                        ${resKeys.map(k => `<option value="${k}">${resLabel[k]} (stok: ${target.resources[k]||0})</option>`).join("")}
                    </select>
                    <input type="number" id="barter-want-amt" min="1" value="15" class="w-full bg-slate-800 border border-slate-600 rounded p-2" placeholder="Miktar">
                </div>
            </div>
            <div class="text-[10px] text-slate-500 bg-slate-950 p-2 rounded border border-slate-800">
                İlişki: <span class="text-cyan-400">${(GameState.relations&&GameState.relations[targetIso])||0}</span> · 
                Karşı stoklar: Gıda ${target.resources.food||0}, Maden ${target.resources.ore||0}, Enerji ${target.resources.energy||0}, Mallar ${target.resources.goods||0}
            </div>
            <div class="flex gap-2">
                <button onclick="executeBarterOffer('${targetIso}')" class="flex-1 py-3 bg-cyan-700 hover:bg-cyan-600 rounded font-black text-white">Teklif Gönder</button>
                <button onclick="document.getElementById('trade-modal').remove()" class="px-4 py-3 bg-slate-700 rounded font-bold">İptal</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function executeBarterOffer(targetIso) {
    const player = GameState.countries[GameState.player];
    const target = GameState.countries[targetIso];
    ensureCivAllocation(player);
    ensureCivAllocation(target);

    const giveRes = document.getElementById("barter-give-res").value;
    const wantRes = document.getElementById("barter-want-res").value;
    const giveAmt = parseInt(document.getElementById("barter-give-amt").value) || 0;
    const wantAmt = parseInt(document.getElementById("barter-want-amt").value) || 0;
    const resLabel = { food: "Gıda", ore: "Maden", energy: "Enerji", goods: "Mallar" };

    if (giveAmt <= 0 || wantAmt <= 0) { log("Miktarlar geçersiz.", "text-red-500"); return; }
    if (giveRes === wantRes) { log("Aynı kaynağı takas edemezsin.", "text-yellow-400"); return; }
    if ((player.resources[giveRes] || 0) < giveAmt) {
        log(`Yetersiz ${resLabel[giveRes]} stoku.`, "text-red-500"); return;
    }
    if ((target.resources[wantRes] || 0) < wantAmt) {
        log(`${target.name} yeterli ${resLabel[wantRes]} stokuna sahip değil — teklif reddedildi.`, "text-red-500");
        document.getElementById("trade-modal")?.remove();
        return;
    }

    // AI karar: ilişki + teklif adilliği
    const rel = (GameState.relations && GameState.relations[targetIso]) || 0;
    const valueTable = { food: 8, ore: 12, energy: 15, goods: 20 };
    const giveVal = giveAmt * (valueTable[giveRes] || 10);
    const wantVal = wantAmt * (valueTable[wantRes] || 10);
    const fairness = giveVal / (wantVal || 1); // 1+ = bizim lehlerine değil, onlara iyi teklif
    // Kabul şansı: ilişki yüksek + onlara değerli teklif
    let acceptChance = 0.35 + (rel / 200) + Math.min(0.4, Math.max(-0.3, (fairness - 0.8) * 0.5));
    if (fairness < 0.5) acceptChance -= 0.3; // çok kötü teklif
    if (fairness > 1.2) acceptChance += 0.25;

    if (Math.random() > acceptChance) {
        log(`❌ ${target.name} takas teklifini reddetti (${giveAmt} ${resLabel[giveRes]} ↔ ${wantAmt} ${resLabel[wantRes]}).`, "text-red-400");
        if (!GameState.relations) GameState.relations = {};
        GameState.relations[targetIso] = Math.max(-100, rel - 2);
        document.getElementById("trade-modal")?.remove();
        renderDiplomacyTab();
        return;
    }

    // Kabul
    player.resources[giveRes] -= giveAmt;
    player.resources[wantRes] = (player.resources[wantRes] || 0) + wantAmt;
    target.resources[giveRes] = (target.resources[giveRes] || 0) + giveAmt;
    target.resources[wantRes] -= wantAmt;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[targetIso] = Math.min(100, rel + 6);

    log(`✅ TAKAS KABUL: ${target.name} — ${giveAmt} ${resLabel[giveRes]} ↔ ${wantAmt} ${resLabel[wantRes]}`, "text-emerald-400 font-bold");
    sfx.playBlip();
    updateHUD();
    document.getElementById("trade-modal")?.remove();
    renderDiplomacyTab();
    if (typeof refreshOpenTab === "function") refreshOpenTab();
}

// Müttefik savaş desteği — seyrek, kaliteye bağlı
function processAllySupport(war, prevProgress) {
    const drop = prevProgress - war.progress;
    if (drop < 2.5) return; // küçük salınımlarda destek yok

    const allies = (GameState.alliances || []).filter(a =>
        a.a === GameState.player || a.b === GameState.player
    );
    if (!allies.length) return;

    if (!GameState.lastAllyAidWeek) GameState.lastAllyAidWeek = {};
    const weekKey = GameState.date.getTime();

    allies.forEach(alliance => {
        const allyIso = alliance.a === GameState.player ? alliance.b : alliance.a;
        const ally = GameState.countries[allyIso];
        if (!ally || ally.isCapitulated) return;

        // Cooldown: aynı müttefik 4 haftada bir defadan fazla yardım etmez
        if (GameState.lastAllyAidWeek[allyIso] && (weekKey - GameState.lastAllyAidWeek[allyIso]) < 28 * 24 * 3600 * 1000) {
            return;
        }

        const rel = (GameState.relations && GameState.relations[allyIso]) || 0;
        const quality = alliance.quality != null ? alliance.quality : Math.min(100, Math.max(20, rel));
        // Ticaret geçmişi var mı?
        const hasTrade = (GameState.tradeDeals || []).some(d => d.partner === allyIso);
        const baseChance = 0.08 + (quality / 400) + (hasTrade ? 0.08 : 0) + (rel > 60 ? 0.06 : 0);
        // Zayıf / sadece isimden ittifak → neredeyse hiç yardım yok
        if (quality < 35 && !hasTrade) {
            if (Math.random() > 0.04) return;
        } else if (Math.random() > baseChance) {
            return;
        }

        ensureCivAllocation(ally);
        const player = GameState.countries[GameState.player];

        const scale = 0.4 + quality / 200;
        const moneyAid = Math.min(ally.money || 0, Math.floor((40 + Math.random() * 100) * scale));
        const mpAid = Math.min(ally.manpower || 0, Math.floor((1500 + Math.random() * 5000) * scale));
        const gunsAid = Math.min((ally.stockpile && ally.stockpile.guns) || 0, Math.floor((80 + Math.random() * 300) * scale));

        const parts = [];
        if (moneyAid >= 20) {
            ally.money -= moneyAid;
            player.money += moneyAid;
            parts.push(`+${moneyAid} 💰`);
        }
        if (mpAid >= 500) {
            ally.manpower -= mpAid;
            player.manpower += mpAid;
            parts.push(`+${mpAid.toLocaleString()} 👤`);
        }
        if (gunsAid >= 50 && ally.stockpile) {
            ally.stockpile.guns -= gunsAid;
            player.stockpile.guns += gunsAid;
            parts.push(`+${gunsAid} 🔫`);
        }

        if (parts.length) {
            war.progress += v27WarProgressDelta(0.8 + Math.random() * 1.5);
            GameState.lastAllyAidWeek[allyIso] = weekKey;
            log(`🛡️ MÜTTEFİK DESTEĞİ: ${ally.name} → ${parts.join(", ")}`, "text-indigo-400 font-bold");
            sfx.playBlip();
        }
    });
}

// Sürekli ticaret anlaşması
function openOngoingTrade(targetIso) {
    if (typeof isHostileToward === "function" && isHostileToward(targetIso)) {
        log("Düşmanlıkta sürekli ticaret yok.", "text-red-500");
        return;
    }
    const target = GameState.countries[targetIso];
    document.getElementById("trade-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "trade-modal";
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border-2 border-emerald-600 rounded-xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div class="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 class="text-sm font-black text-emerald-400 uppercase">📦 Sürekli Ticaret — ${target.name}</h3>
                <button onclick="document.getElementById('trade-modal').remove()" class="text-red-400 text-lg">✕</button>
            </div>
            <p class="text-[11px] text-slate-400">12 hafta boyunca her hafta otomatik alım/satım yapılır.</p>
            <div class="space-y-2 text-xs">
                <label class="block text-slate-300">Kaynak:</label>
                <select id="trade-resource" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                    <option value="food">🌾 Gıda</option>
                    <option value="ore">⛏️ Maden</option>
                    <option value="energy">⚡ Enerji</option>
                    <option value="goods">📦 Mallar</option>
                </select>
                <label class="block text-slate-300 mt-2">Haftalık miktar:</label>
                <input type="number" id="trade-amount" min="1" value="5" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                <label class="block text-slate-300 mt-2">Yön:</label>
                <select id="trade-action" class="w-full bg-slate-800 border border-slate-600 rounded p-2">
                    <option value="buy">Her hafta satın al</option>
                    <option value="sell">Her hafta sat</option>
                </select>
            </div>
            <button onclick="startOngoingTrade('${targetIso}')" class="w-full py-3 bg-emerald-700 hover:bg-emerald-600 rounded font-black text-white">Anlaşmayı Başlat (12 hafta)</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function startOngoingTrade(targetIso) {
    const res = document.getElementById("trade-resource").value;
    const amount = parseInt(document.getElementById("trade-amount").value) || 5;
    const direction = document.getElementById("trade-action").value;
    if (!GameState.tradeDeals) GameState.tradeDeals = [];
    // Aynı partner+resource varsa güncelle
    GameState.tradeDeals = GameState.tradeDeals.filter(d => !(d.partner === targetIso && d.resource === res));
    GameState.tradeDeals.push({ partner: targetIso, resource: res, amount, direction, weeksLeft: 12 });
    log(`TİCARET ANLAŞMASI: ${GameState.countries[targetIso].name} ile 12 haftalık ${res} anlaşması imzalandı.`, "text-emerald-400");
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[targetIso] = Math.min(100, (GameState.relations[targetIso] || 0) + 8);
    document.getElementById("trade-modal")?.remove();
    renderDiplomacyTab();
}

function processTradeDeals() {
    if (!GameState.tradeDeals || !GameState.tradeDeals.length) return;
    const player = GameState.countries[GameState.player];
    ensureCivAllocation(player);
    const prices = { food: 8, ore: 12, energy: 15, goods: 20 };

    for (let i = GameState.tradeDeals.length - 1; i >= 0; i--) {
        const deal = GameState.tradeDeals[i];
        const partner = GameState.countries[deal.partner];
        if (!partner) { GameState.tradeDeals.splice(i, 1); continue; }
        ensureCivAllocation(partner);
        const cost = deal.amount * (prices[deal.resource] || 10);

        if (deal.direction === "buy") {
            if (player.money >= cost && (partner.resources[deal.resource] || 0) >= deal.amount) {
                player.money -= cost;
                player.resources[deal.resource] = (player.resources[deal.resource] || 0) + deal.amount;
                partner.resources[deal.resource] -= deal.amount;
                partner.money += cost;
            }
        } else {
            if ((player.resources[deal.resource] || 0) >= deal.amount) {
                player.resources[deal.resource] -= deal.amount;
                player.money += cost;
                partner.resources[deal.resource] = (partner.resources[deal.resource] || 0) + deal.amount;
            }
        }
        deal.weeksLeft--;
        if (deal.weeksLeft <= 0) {
            log(`Ticaret anlaşması sona erdi: ${partner.name} (${deal.resource})`, "text-slate-400");
            GameState.tradeDeals.splice(i, 1);
        }
    }
}

// ========== DİPLOMASİ EYLEMLERİ ==========
function isHostileToward(iso) {
    const rel = (GameState.relations && GameState.relations[iso] != null) ? GameState.relations[iso] : 0;
    const atWar = (GameState.activeWars || []).some(w => w.target === iso);
    return rel <= -80 || atWar;
}

const INSULT_LINES = [
    // Eski / Resmi
    "Lideriniz tarih önünde bir utançtır.",
    "Ordunuz kartondan askerlerle dolu.",
    "Başkentiniz zaten yenilgiye hazır.",
    "Halkınız sizi istemiyor; biz de istemiyoruz.",
    "Sınırlarınız kâğıt kalınlığında.",
    "Diplomasi masanız çürümüş tahtadan.",
    "Caydırıcılığınız bir masal.",
    "Tarih sizi unutacak; biz hızlandıracağız.",
    "Fabrikalarınız hurda, generalleriniz korkak.",
    "Barış dilini unuttunuz; savaş dilini öğreneceksiniz.",
    // Yeni / Samimi
    "Lideriniz mahalle muhtarı bile olamaz!",
    "Ordunuz kartondan, generalleriniz korkaktan ibaret.",
    "Başkentinize bayrağı dikmemiz sadece birkaç saat sürer.",
    "Halkın bile sizden bıkmış, bize dua ediyorlar!",
    "Sınır hatlarınız kevgire dönmüş, haberiniz yok.",
    "Masada lak lak edeceğine git orduna iki tüfek al.",
    "Caydırıcılığınız ancak mahallenin kedilerine söker.",
    "Tarih sizi unutacak; biz de süreci hızlandıracağız!",
    "Fabrikalarınız pas tutmuş, tanklarınız çalışmıyor bile.",
    "Barış dilini anlamadınız, kötek dilinden konuşacağız artık!"
];

function sendInsult(iso) {
    const rel = (GameState.relations && GameState.relations[iso] != null) ? GameState.relations[iso] : 0;
    if (rel >= 10) {
        log("İlişki +10 ve üzerindeyken hakaret/ambargo uygulanamaz.", "text-yellow-400");
        return;
    }

    if (!isHostileToward(iso)) {
        log("Hakaret yalnızca ilişki ≤ −80 veya savaştayken mümkün.", "text-yellow-400");
        return;
    }
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.max(-100, (GameState.relations[iso] || -80) - 5);
    const line = INSULT_LINES[Math.floor(Math.random() * INSULT_LINES.length)];
    if (!GameState.insults) GameState.insults = [];
    GameState.insults.unshift({ to: iso, text: line, t: Date.now() });
    if (GameState.insults.length > 30) GameState.insults.length = 30;
    log(`🤬 ${GameState.countries[iso]?.name}'e hakaret: "${line}" (ilişki ${GameState.relations[iso]})`, "text-red-400");
    // AI karşı hakaret şansı
    if (Math.random() < 0.55 && typeof pushInboxMessage === "function") {
        const counter = INSULT_LINES[Math.floor(Math.random() * INSULT_LINES.length)];
        pushInboxMessage({
            from: iso,
            type: "insult",
            text: counter,
            data: {},
            expiresWeeks: 6
        });
        GameState.relations[GameState.player] = GameState.relations[iso]; // simetri yok — player key yok
        log(`🤬 Karşı hakaret geldi: ${GameState.countries[iso]?.name}`, "text-red-500");
    }
    GameState.globalTension = Math.min(100, GameState.globalTension + 1);
    renderDiplomacyTab();
}

function improveRelations(iso) {
    if (isHostileToward(iso)) {
        log("Düşmanlıkta (≤ −80) ilişki geliştirilemez. Arabulucu bekleyin veya savaşın.", "text-red-500");
        return;
    }
    const player = GameState.countries[GameState.player];
    if (player.money < 150) { log("İlişki geliştirmek için 150 hazine gerekli.", "text-red-500"); return; }
    player.money -= 150;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.min(100, (GameState.relations[iso] || 0) + 15);
    log(`Diplomatik heyet ${GameState.countries[iso].name}'e gönderildi. İlişki: ${GameState.relations[iso]}`, "text-blue-400");
    updateHUD();
    renderDiplomacyTab();
}

/** İlişkiye zarar ver — propaganda / sınır olayı */
function damageRelations(iso) {
    if (!GameState.countries[iso] || iso === GameState.player) return;
    const player = GameState.countries[GameState.player];
    if (player.money < 80) { log("İlişkiye zarar vermek için 80 hazine gerekli.", "text-red-500"); return; }
    player.money -= 80;
    if (!GameState.relations) GameState.relations = {};
    const before = GameState.relations[iso] || 0;
    GameState.relations[iso] = Math.max(-100, before - 18);
    GameState.globalTension = Math.min(100, GameState.globalTension + 2);
    // Ticaret/NAP zayıflat
    if (GameState.relations[iso] <= -40) {
        GameState.tradeDeals = (GameState.tradeDeals || []).filter(d => d.partner !== iso);
    }
    if (GameState.relations[iso] <= -60) {
        GameState.nonAggression = (GameState.nonAggression || []).filter(n =>
            !((n.a === GameState.player && n.b === iso) || (n.b === GameState.player && n.a === iso))
        );
    }
    log(`💥 ${GameState.countries[iso].name} ile ilişki zarar gördü: ${before} → ${GameState.relations[iso]} (gerilim +2)`, "text-orange-400");
    // AI misilleme ihtimali
    if (Math.random() < 0.35 && typeof pushInboxMessage === "function") {
        pushInboxMessage({
            from: iso,
            type: "warning",
            text: "Provokasyonlarınızı kınıyoruz. İlişkilerimiz bozuldu.",
            data: {},
            expiresWeeks: 5
        });
    }
    updateHUD();
    renderDiplomacyTab();
}

/** İlişkileri kes — elçi çek, ticaret/NAP/ittifak bitir */
function severRelations(iso) {
    if (!GameState.countries[iso] || iso === GameState.player) return;
    if (!GameState.relations) GameState.relations = {};
    const name = GameState.countries[iso].name;
    // İttifak, NAP, ticaret kes
    GameState.alliances = (GameState.alliances || []).filter(a =>
        !((a.a === GameState.player && a.b === iso) || (a.b === GameState.player && a.a === iso))
    );
    GameState.nonAggression = (GameState.nonAggression || []).filter(n =>
        !((n.a === GameState.player && n.b === iso) || (n.b === GameState.player && n.a === iso))
    );
    GameState.tradeDeals = (GameState.tradeDeals || []).filter(d => d.partner !== iso);
    const before = GameState.relations[iso] || 0;
    GameState.relations[iso] = Math.min(before, -50);
    if (GameState.relations[iso] > -80) {
        // Tam düşmanlık değil ama soğuk savaş
        GameState.relations[iso] = Math.max(-79, Math.min(-50, before - 25));
    }
    GameState.globalTension = Math.min(100, GameState.globalTension + 4);
    log(`✂️ İlişkiler kesildi: ${name}. Elçiler çekildi, ticaret ve paktlar iptal. İlişki: ${GameState.relations[iso]}`, "text-slate-300 font-bold");
    if (typeof pushInboxMessage === "function" && Math.random() < 0.5) {
        pushInboxMessage({
            from: iso,
            type: "warning",
            text: "Elçilerimizi geri çağırdınız. Bu hareket unutulmayacak.",
            data: {},
            expiresWeeks: 8
        });
    }
    updateHUD();
    renderDiplomacyTab();
}

function formWarBlocs(enemyIso) {
    if (!GameState.blocs) GameState.blocs = [];
    // Oyuncu bloğu
    let playerBloc = GameState.blocs.find(b => b.leader === GameState.player);
    if (!playerBloc) {
        playerBloc = {
            id: "bloc_p_" + Date.now(),
            name: (GameState.countries[GameState.player]?.name || "Biz") + " Koalisyonu",
            members: [GameState.player],
            leader: GameState.player
        };
        (GameState.alliances || []).forEach(a => {
            const ally = a.a === GameState.player ? a.b : (a.b === GameState.player ? a.a : null);
            if (ally && !playerBloc.members.includes(ally)) playerBloc.members.push(ally);
        });
        GameState.blocs.push(playerBloc);
    }
    // Düşman bloğu
    let enemyBloc = GameState.blocs.find(b => b.leader === enemyIso);
    if (!enemyBloc) {
        enemyBloc = {
            id: "bloc_e_" + Date.now(),
            name: (GameState.countries[enemyIso]?.name || enemyIso) + " Cephesi",
            members: [enemyIso],
            leader: enemyIso
        };
        GameState.blocs.push(enemyBloc);
    }
    log(`🏛️ BLOKLAR: ${playerBloc.name} vs ${enemyBloc.name}`, "text-orange-400 font-bold");
}

function processMediator() {
    // Düşman çiftler için arabulucu — nadir
    if (Math.random() > 0.04) return;
    const hostiles = Object.keys(GameState.relations || {}).filter(iso => {
        if (iso === GameState.player) return false;
        if (typeof isCountryAlive === "function" && !isCountryAlive(iso)) return false;
        if (GameState.countries[iso]?.isCapitulated) return false;
        return (GameState.relations[iso] || 0) <= -80;
    });
    if (!hostiles.length) return;
    const target = hostiles[Math.floor(Math.random() * hostiles.length)];
    if (typeof isCountryAlive === "function" && !isCountryAlive(target)) return;

    const mapC = typeof getMapCountries === "function" ? getMapCountries() : new Set();
    const mediators = Object.keys(GameState.countries).filter(iso => {
        if (iso === GameState.player || iso === target) return false;
        if (mapC.size && !mapC.has(iso)) return false;
        if (typeof isCountryAlive === "function" && !isCountryAlive(iso)) return false;
        if (GameState.countries[iso]?.isCapitulated) return false;
        if ((GameState.activeWars || []).some(w => w.target === iso)) return false;
        const rel = GameState.relations[iso] || 0;
        return rel > -20;
    });
    if (!mediators.length) return;
    const med = mediators[Math.floor(Math.random() * mediators.length)];
    const medName = GameState.countries[med]?.name || med;
    const enemyName = GameState.countries[target]?.name || target;

    if (typeof pushInboxMessage === "function") {
        pushInboxMessage({
            from: med,
            type: "mediation",
            text: `${enemyName} ile aranızdaki gerginlikte arabuluculuk teklif ediyoruz. Kabul ederseniz her iki tarafın ilişkisi bir miktar yumuşar.`,
            data: { other: target },
            expiresWeeks: 6
        });
    }
    log(`🕊️ ARABULUCU: ${medName}, ${enemyName} ile sizi masaya davet ediyor.`, "text-cyan-400");
}

function acceptMediation(mediatorIso, otherIso) {
    if (typeof isCountryAlive === "function" && !isCountryAlive(otherIso)) {
        log("Bu ülke artık mevcut değil; arabuluculuk geçersiz.", "text-slate-400");
        return;
    }
    if (!GameState.relations) GameState.relations = {};
    const before = GameState.relations[otherIso] || -85;
    // -80 altından -55 civarına çek (hâlâ soğuk ama diplomasi açılabilir eşiğe yakın)
    GameState.relations[otherIso] = Math.min(-55, before + 30);
    if (GameState.relations[otherIso] > -80) {
        log(`🕊️ Arabuluculuk başarılı: ${GameState.countries[otherIso]?.name} ile ilişki ${GameState.relations[otherIso]}. Diplomasi yeniden mümkün olabilir.`, "text-emerald-400 font-bold");
    } else {
        log(`🕊️ Arabuluculuk kısmi: ilişki ${GameState.relations[otherIso]} (hâlâ düşman eşiğinde).`, "text-yellow-400");
    }
    GameState.relations[mediatorIso] = Math.min(100, (GameState.relations[mediatorIso] || 0) + 10);
    updateHUD();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
}

function getAllianceWith(iso) {
    return (GameState.alliances || []).find(a =>
        (a.a === GameState.player && a.b === iso) || (a.b === GameState.player && a.a === iso)
    );
}

function proposeAlliance(iso) {
    const myAllies = (GameState.alliances || []).filter(a => a.a === GameState.player || a.b === GameState.player);
    if (myAllies.length >= 2) {
        log("En fazla 2 ittifak kurabilirsiniz. Önce bir ittifaktan çıkın.", "text-yellow-400");
        return;
    }

    if (typeof isHostileToward === "function" && isHostileToward(iso)) {
        log("Düşmanlıkta ittifak kurulamaz.", "text-red-500");
        return;
    }
    if (!GameState.relations) GameState.relations = {};
    const rel = GameState.relations[iso] || 0;
    if (rel < 40) {
        log(`İttifak reddedildi. İlişki en az +40 olmalı (şu an: ${rel}).`, "text-red-500");
        return;
    }
    if (!GameState.alliances) GameState.alliances = [];
    if (getAllianceWith(iso)) { log("Zaten müttefiksiniz.", "text-yellow-400"); return; }
    const hasTrade = (GameState.tradeDeals || []).some(d => d.partner === iso);
    const quality = Math.min(100, rel + (hasTrade ? 15 : 0));
    GameState.alliances.push({
        a: GameState.player,
        b: iso,
        quality,
        mutualDefense: true,   // saldırıya uğrayınca çağrı
        offensive: quality >= 60, // kalite yüksekse saldırı savaşına da katılır
        weeks: 0
    });
    GameState.relations[iso] = Math.min(100, rel + 20);
    log(`🛡️ İTTİFAK: ${GameState.countries[iso].name} (Kalite ${quality}${quality >= 60 ? " · saldırı desteği açık" : ""})`, "text-indigo-400 font-black");
    sfx.playVictory();
    renderDiplomacyTab();
}

function breakAlliance(iso) {
    GameState.alliances = (GameState.alliances || []).filter(a =>
        !((a.a === GameState.player && a.b === iso) || (a.b === GameState.player && a.a === iso))
    );
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.max(-100, (GameState.relations[iso] || 0) - 30);
    GameState.globalTension = Math.min(100, GameState.globalTension + 5);
    log(`İttifak bozuldu: ${GameState.countries[iso].name}`, "text-orange-400");
    renderDiplomacyTab();
}

function strengthenAlliance(iso) {
    const al = getAllianceWith(iso);
    if (!al) return;
    const player = GameState.countries[GameState.player];
    if (player.money < 200) { log("İttifak güçlendirmek için 200 hazine gerekli.", "text-red-500"); return; }
    player.money -= 200;
    al.quality = Math.min(100, (al.quality || 40) + 12);
    if (al.quality >= 60) al.offensive = true;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.min(100, (GameState.relations[iso] || 0) + 8);
    log(`🛡️ İttifak güçlendirildi: ${GameState.countries[iso].name} → kalite ${al.quality}`, "text-indigo-400");
    updateHUD();
    renderDiplomacyTab();
}

function processAllianceTick() {
    if (!GameState.alliances) return;
    GameState.alliances.forEach(a => {
        a.weeks = (a.weeks || 0) + 1;
        const other = a.a === GameState.player ? a.b : a.a;
        const hasTrade = (GameState.tradeDeals || []).some(d => d.partner === other);
        // Ticaret yoksa kalite yavaş erir; varsa hafif artar
        if (hasTrade) a.quality = Math.min(100, (a.quality || 40) + 0.3);
        else if ((GameState.relations[other] || 0) < 30) a.quality = Math.max(10, (a.quality || 40) - 0.4);
        if (a.quality >= 60) a.offensive = true;
        else a.offensive = false;
    });
}

function callAlliesToWar(targetIso, isOffensive) {
    // Savaşa çağrı: kaliteye göre katılım
    (GameState.alliances || []).forEach(a => {
        const allyIso = a.a === GameState.player ? a.b : (a.b === GameState.player ? a.a : null);
        if (!allyIso || allyIso === targetIso) return;
        const ally = GameState.countries[allyIso];
        if (!ally || ally.isCapitulated) return;

        if (isOffensive && !a.offensive) {
            log(`🛡️ ${ally.name} saldırı savaşına katılmayı reddetti (ittifak kalitesi düşük).`, "text-slate-400");
            return;
        }
        const joinChance = 0.35 + (a.quality || 40) / 150;
        if (Math.random() > joinChance) {
            log(`🛡️ ${ally.name} bu sefer cepheye gelmeyecek.`, "text-slate-500");
            return;
        }
        // Savaş skoruna bonus (müttefik kuvvet katkısı)
        const war = GameState.activeWars.find(w => w.target === targetIso);
        if (war) {
            const boost = 2 + (a.quality || 40) / 25;
            war.progress += v27WarProgressDelta(boost);
            war.allyBoost = (war.allyBoost || 0) + boost;
        }
        // Kaynak transferi
        const player = GameState.countries[GameState.player];
        const guns = Math.min((ally.stockpile && ally.stockpile.guns) || 0, 150 + Math.floor(Math.random() * 200));
        if (guns > 0 && ally.stockpile) {
            ally.stockpile.guns -= guns;
            player.stockpile.guns += guns;
        }
        log(`⚔️ SAVAŞA ÇAĞRI: ${ally.name} cepheye katıldı! (+${guns} tüfek, savaş skoru boost)`, "text-indigo-400 font-bold");
    });
}

function signNAP(iso) {
    if (typeof isHostileToward === "function" && isHostileToward(iso)) {
        log("Düşmanlıkta saldırmazlık paktı imzalanamaz.", "text-red-500");
        return;
    }
    if (!GameState.nonAggression) GameState.nonAggression = [];
    const exists = GameState.nonAggression.some(n =>
        (n.a === GameState.player && n.b === iso) || (n.b === GameState.player && n.a === iso)
    );
    if (exists) return;
    GameState.nonAggression.push({ a: GameState.player, b: iso, weeksLeft: 52 });
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.min(100, (GameState.relations[iso] || 0) + 10);
    log(`📜 Saldırmazlık paktı imzalandı: ${GameState.countries[iso].name} (1 yıl)`, "text-emerald-400");
    renderDiplomacyTab();
}

function startJustification(iso) {
    if (!GameState.justifications) GameState.justifications = [];
    if (GameState.justifications.some(j => j.target === iso)) {
        log("Bu ülke için zaten gerekçe hazırlanıyor.", "text-yellow-400");
        return;
    }
    if (GameState.justifications.length >= 2) {
        log("Aynı anda en fazla 2 savaş gerekçesi hazırlanabilir.", "text-red-500");
        return;
    }
    GameState.justifications.push({ target: iso, progress: 0 });
    log(`📋 ${GameState.countries[iso].name} için savaş gerekçesi hazırlanmaya başlandı (≈10 hafta).`, "text-orange-400");
    renderDiplomacyTab();
}

function processJustifications() {
    if (!GameState.justifications) return;
    GameState.justifications.forEach(j => {
        if (j.progress >= 100) return; // zaten tamam — bir daha artırma/spam yok
        j.progress = Math.min(100, j.progress + 1.5); // günlük (~70 gün)
        if (j.progress >= 100 && !j.notified) {
            j.notified = true;
            j.progress = 100;
            log(`✅ Savaş gerekçesi tamamlandı: ${GameState.countries[j.target]?.name}`, "text-orange-400 font-bold");
        }
    });
}

function processNAPs() {
    if (!GameState.nonAggression) return;
    for (let i = GameState.nonAggression.length - 1; i >= 0; i--) {
        GameState.nonAggression[i].weeksLeft--;
        if (GameState.nonAggression[i].weeksLeft <= 0) {
            const n = GameState.nonAggression[i];
            const other = n.a === GameState.player ? n.b : n.a;
            log(`Saldırmazlık paktı süresi doldu: ${GameState.countries[other]?.name}`, "text-slate-400");
            GameState.nonAggression.splice(i, 1);
        }
    }
}

// ========== RASTGELE OLAYLAR ==========
const RANDOM_EVENTS = [
    {
        id: "good_harvest",
        title: "Bereketli Hasat",
        desc: "Tarım üretimi rekor kırdı.",
        chance: 0.08,
        apply: (p) => { p.money += 400; p.resources = p.resources || {}; p.resources.food = (p.resources.food||0) + 40; log("🌾 OLAY: Bereketli hasat! +400 hazine, +40 gıda", "text-emerald-400"); }
    },
    {
        id: "strike",
        title: "İşçi Grevi",
        desc: "Fabrikalar bir hafta yavaşladı.",
        chance: 0.05,
        apply: (p) => { p.money = Math.max(0, p.money - 200); log("⚒️ OLAY: İşçi grevi! −200 hazine", "text-orange-400"); }
    },
    {
        id: "volunteers",
        title: "Gönüllü Akını",
        desc: "Vatandaşlar orduya koşuyor.",
        chance: 0.06,
        apply: (p) => { p.manpower += 25000; log("🎖️ OLAY: Gönüllü akını! +25.000 insan gücü", "text-cyan-400"); }
    },
    {
        id: "tech_breakthrough",
        title: "Teknoloji Atılımı",
        desc: "Fabrika verimliliği arttı.",
        chance: 0.04,
        apply: (p) => { p.factoryEfficiency = Math.min(1.5, (p.factoryEfficiency || 1) + 0.05); log("🔬 OLAY: Teknoloji atılımı! Fabrika verimliliği +5%", "text-purple-400"); }
    },
    {
        id: "border_incident",
        title: "Sınır Olayı",
        desc: "Komşu sınırında gerilim.",
        chance: 0.05,
        apply: (p) => { GameState.globalTension = Math.min(100, GameState.globalTension + 4); log("🔥 OLAY: Sınır olayı! Küresel gerilim +4", "text-red-400"); }
    },
    {
        id: "foreign_investment",
        title: "Yabancı Yatırım",
        desc: "Dış sermaye ülkeye aktı.",
        chance: 0.05,
        apply: (p) => { p.civFactories += 1; p.money += 300; log("💼 OLAY: Yabancı yatırım! +1 sivil fabrika, +300 hazine", "text-yellow-400"); }
    },
    {
        id: "espionage",
        title: "Casusluk Skandalı",
        desc: "Düşman casusları bozguna uğratıldı.",
        chance: 0.04,
        apply: (p) => { p.stockpile.guns += 500; log("🕵️ OLAY: Casus ağı çözüldü! +500 tüfek ele geçirildi", "text-slate-300"); }
    }
];

function processRandomEvents() {
    if (GameState.eventsEnabled === false) return;
    if (GameState.settings && GameState.settings.eventsEnabled === false) return;
    const histHeavy = (GameState.scenarioId === "ww1" || GameState.scenarioId === "ww2");
    if (Math.random() > (histHeavy ? 0.08 : 0.18)) return;
    const player = GameState.countries[GameState.player];
    const pool = RANDOM_EVENTS.filter(e => Math.random() < e.chance);
    if (!pool.length) return;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    ensureCivAllocation(player);
    ev.apply(player);
    updateHUD();
}

// ====================== DİPLOMATİK POSTA (INBOX) ======================
const AI_MSG_TEMPLATES = {
greet: [
        // Eski / Resmi
        "Sayın lider, ülkelerimiz arasındaki köprüleri güçlendirmek isteriz.",
        "Başkentinizden esen rüzgâr dostluk kokuyor. Görüşelim.",
        "Tarih, işbirliği yapan milletleri ödüllendirir. Bir adım atalım.",
        "Diplomatik kanallarımız açık. Samimi bir diyalog bekliyoruz.",
        "Komşuluk, yalnız sınır çizgisinden ibaret değildir.",
        "Haritamızda yan yana duruyoruz; masada da yan yana oturalım.",
        "Yeni bir çağın eşiğindeyiz. Ortak dil bulabiliriz.",
        "Elçimiz yolda. Kısa bir selam ile başlamak istedik.",
        "Resmi ziyaret protokolümüz hazır. Ne zaman müsaitsiniz?",
        "Kardeş milletler masada buluşursa tarih de gülümser.",
        "Sessiz diplomasi çoğu zaman toplardan daha etkilidir.",
        // Yeni / Samimi
        "Eyvallah reis, sınırlar komşu olunca bir selam çakalım dedik.",
        "Gözümüz üstünde ama kötü niyetten değil, muhabbetimiz bol olsun diye.",
        "Haritada yan yanayız kardeş, gel bir çayımızı iç, laflayalım.",
        "Milletlerimiz kaynaşsın, elçileri boş göndermeyelim dedik.",
        "Aleykümselam diyeceğiz de önce sen bir adım at bakalım.",
        "Komşu komşunun külüne muhtaçtır derler, ne dersin bu işe?",
        "Bizde racondur, komşuya önce tatlı dille gidilir. Naber?",
        "Bırakalım resmiyeti, ne var ne yok senin tarafta?",
        "Seninle aramızı iyi tutalım diyorum, ne dersin ey büyük lider?",
        "Sınırda devriyeler selam çakıyor, masada da çaksınlar."
    ],
    trade: [
        // Eski / Resmi
        "Depolarımız dolu, sizin pazarınız ise fırsatlarla dolu. Takas teklifimiz var.",
        "Karşılıklı fayda esasına dayalı bir ticaret önerisi sunuyoruz.",
        "Bu sezon hasadımız bereketli. Kaynak değişimi yapalım mı?",
        "Sanayi hatlarımız fazla üretiyor. Sizinle dengeli bir takas isteriz.",
        "Ticaret, barışın en sessiz dilidir. Teklifimizi değerlendirin.",
        "Limanlarımız açık. Karşılıklı sevkiyat için anlaşalım.",
        "Hammadde fazlamız var; sizin stoklarınızla tamamlayalım.",
        "Kısa vadeli bir takas, uzun vadeli güven inşa eder.",
        "Enerji fazlasını gıda ile değişmek isteriz.",
        "Petrol karşılığı çelik — klasik ama işe yarar. Konuşalım.",
        "Gümrük tarifelerini düşürelim, her iki taraf da kazansın.",
        // Yeni / Samimi
        "Kral bizim depolar ağzına kadar dolu, sizde durumlar nasıl? Takas yapak mı?",
        "Çelik var, petrol var, ne lazımsa söyle; yabancıya gitmesin.",
        "Bizim ambarlar patlayacak. Ver oradan biraz gıda, al bizden malı.",
        "Ticaret yapalım da iki tarafın da cebi para görsün, ne dersin?",
        "Malın iyisinden anlarsın, sana özel bir takas teklifim var.",
        "Bak elin adamına kaptırmayalım kaynağı, ver tüccarlara geçiş iznini.",
        "Al gülüm ver gülüm yapalım, gümrükte de çok darlama bizim çocukları.",
        "Bendeki çelikle senin gıdayı kırdıralım mı kafa kafaya?",
        "Sana uygun fiyat çekeriz, maksat ayağımız alışsın.",
        "Depoda mal çürüyeceğine senin işin görülsün, at imzayı."
    ],
    alliance: [
        // Eski / Resmi
        "Dünya fırtınalıyken omuz omuza durmak akılcıdır. İttifak teklif ediyoruz.",
        "Ortak güvenlik, ortak gelecektir. Resmi ittifak önerimiz var.",
        "Düşmanlarımız çoğalıyor. Birlikte daha güçlüyüz.",
        "Savunma paktı imzalayarak bölge istikrarını koruyabiliriz.",
        "Tarih bizi yargılayacak: yalnız mı kaldık, yoksa müttefik mi olduk?",
        "Ortak tatbikat ve istihbarat paylaşımı da masada.",
        "Tek başımıza adalarız; birlikte kıta oluruz.",
        "Saldırıya uğrarsanız silahlarımız sizinle yan yana durur.",
        // Yeni / Samimi
        "Ortalık fena karışacak kanka, gel sırt sırta verelim kimse dokunamasın.",
        "Tek başına yutarlar seni, gel bizim tayfaya katıl rahat et.",
        "Düşmanlarımız ortak, dostluğumuz baki olsun. İttifakı kuruyoruz mu?",
        "Bizimle takılanın sırtı yere gelmez. Omuz omuza savaşa var mısın?",
        "Sana yamuk yapan bize yapmış sayılır, gel çak bir müttefiklik imzası.",
        "Sınırları emniyete alalım, dışarıdakiler düşünsün gerisini.",
        "Birlikte olursak haritanın altını üstüne getiririz, net!",
        "Sana saldıran karşısında bizi bulur, arkandayız rahat ol."
    ],
    relation: [
        // Eski / Resmi
        "İlişkilerimizi yumuşatmak için heyet göndermek istiyoruz.",
        "Geçmiş sürtüşmeleri geride bırakmanın zamanı geldi.",
        "Kültürel değişim programı ile halklarımız birbirini tanısın.",
        "Samimi bir jest: dostluk ziyareti teklif ediyoruz.",
        "Küçük bir jest büyük bir güven inşa eder. İlişki geliştirelim.",
        "Olimpiyat dostluk maçı düzenleyelim — simgesel ama etkili.",
        "Büyükelçilik kadromuzu güçlendirelim; diyalog artsın.",
        // Yeni / Samimi
        "Aramızdaki o ufak tatsızlığı unutalım gitsin, tatlıya bağlayalım.",
        "Geçmişe sünger çekelim, gel bir yemek yiyelim diplomatlarla.",
        "Aramızı düzeltelim de millet diplomasi görsün biraz.",
        "Bizden sana zarar gelmez, sen de biraz yumuşak davran be kanka.",
        "Güzellikle hallolmayacak iş yok, uzat elini barışalım.",
        "Kültür festivali falan yapalım, bizim halk sizin tarafa gidip gelsin."
    ],
    nap: [
        // Eski / Resmi
        "Sınırlarımızda silahlar susmalı. Saldırmazlık paktı öneriyoruz.",
        "Bir yıl boyunca birbirimize silah çekmeme taahhüdü verelim.",
        "Barış, imza ile başlar. Saldırmazlık anlaşması hazır.",
        "Sınır gözlem istasyonları kuralım; güven artar.",
        "Askeri tatbikatları sınırdan uzak tutalım — karşılıklı taahhüt.",
        // Yeni / Samimi
        "Birbirimize mermi sıkmaya gerek yok, saldırmazlık paktını imzalayalım.",
        "Sen kendi işine bak ben kendi işime, sınırlarda silahlar sussun.",
        "Bir süre birbirimizi elleşmeyelim, herkes kendi yağında kavrulsun.",
        "Sınırda askerleri karşı karşıya dikmeyelim, huzurumuz kaçmasın.",
        "Gel bir seneliğine söz verelim, kimse kimsenin sınırına girmesin."
    ],
    warning: [
        // Eski / Resmi
        "Askeri yığınaklarınız endişe verici. Gerilimi düşürmenizi rica ederiz.",
        "Sınır olayları artıyor. Sorumlu davranmanızı bekliyoruz.",
        "Küresel gerilim herkesi yakar. Dengeli politika öneriyoruz.",
        "Casusluk faaliyetleriniz tespit edildi. Durdurun.",
        "Provokasyonlar kontrol altına alınmazsa sonuçları ağır olur.",
        "Nükleer tırmanma kimseyi kazandırmaz. Geri adım atın.",
        "Müttefiklerimiz sizin hareketlerinizi yakından izliyor.",
        // Yeni / Samimi
        "Sınırıma o kadar asker yığma kanka, ayağını denk al uyarayım.",
        "Bak sabrımızı zorluyorsun, oradaki hareketlilik hiç hoşumuza gitmedi.",
        "Casusların bizim sarayın etrafında dolanıyor, yakalarsam fena yaparım.",
        "Aklını başına topla, bizim ordu senin haritanı silmeye yeter.",
        "Kaşınma istersen, sonra 'bana kimse söylemedi' deme.",
        "Racon kesmeyi bırak da border'dan çek o askerleri.",
        "O füzeleri nereye doğruluyorsun sen? Yanlış adrestesin!"
    ],
    thanks: [
        // Eski / Resmi
        "Son jestiniz unutulmayacak. Teşekkür ederiz.",
        "Dostluğunuz bize güç verdi. Müteşekkiriz.",
        "İşbirliğiniz halkımıza umut aşıladı.",
        "Yardımınız kıtlık döneminde can kurtardı.",
        // Yeni / Samimi
        "Eyvallah kral, bu iyiliğini asla unutmayız!",
        "Adamsın! Zor zamanımızda imdadımıza koştun.",
        "Hakkın ödenmez, bu yardım ilaç gibi geldi valla.",
        "Adamsın adam! İki elimiz kanda olsa yardımına koşarız artık."
    ],
    concern: [
        // Eski / Resmi
        "İç karışıklıklarınız duyuluyor. Destek teklif edebiliriz.",
        "Asiler sınır güvenliğini tehdit ediyor. Ortak önlem alalım mı?",
        "İstikrar paketimiz hazır; kabul ederseniz hazine ve gıda göndeririz.",
        // Yeni / Samimi
        "Halka bakıyorum da sizin orada işler karışık, yardım lazımsa çekinme.",
        "Asiler kapına dayanmış kanka, gıda veya bütçe atalım mı biraz?",
        "İçeride çalkalanıyorsun, toparlanman için biraz destek atabiliriz."
    ],
    intel: [
        // Eski / Resmi
        "İstihbarat paylaşımı öneriyoruz: ortak düşman hakkında dosya.",
        "Casus ağımız komşunuzda hareketlilik tespit etti. Bilgi takası?",
        "Savaş planlarınız sızmış olabilir. Güvenlik brifingi verelim.",
        // Yeni / Samimi
        "Ajanlar senin yan komşunun fena planlar yaptığını öğrendi, satayım mı bilgiyi?",
        "Ortak düşmanın ciğerini biliyoruz, dosyaları önüne sereyim mi?",
        "Savaş planların sızmış kardeş, bak sana iyilik yapıp haber veriyorum."
    ],
    embargo: [
        // Eski / Resmi
        "Politikanız nedeniyle ekonomik ambargo uygulamayı düşünüyoruz.",
        "Ticaret kısıtlaması masada. Davranışınızı gözden geçirin.",
        "Limanlarınıza giriş yasağı tartışılıyor.",
        // Yeni / Samimi
        "Bu kafayla devam edersen sana tek bir çivi bile satmam, haberin olsun.",
        "Limanları kapatıyoruz sana, git malını başka yere sat şimdi.",
        "Sana ekonomik ambargoyu bir koyarsak belini toplayamazsın."
    ],
    peace: [
        // Eski / Resmi
        "Ateşkes teklif ediyoruz. Kan dökmek yeterli oldu.",
        "Barış masası hazır. Şartları konuşalım.",
        "Savaş her iki halkı da yoruyor. Mütareke?",
        "Status quo ante ile barışa dönebiliriz.",
        "Tazminat öderiz; silahlar sussun.",
        // Yeni / Samimi
        "Yeter la kaç gündür kan gövdeyi götürdü, gel uzlaşalım artık.",
        "İki taraf da yıprandı, baltaları gömelim masaya oturalım.",
        "Savaştık tamam da uzatmanın alemi yok, ver biraz tazminat kapatalım.",
        "Tamam senin dediğin olsun, yeter ki şu silahlar sussun artık."
    ],
    insult: [
        // Eski / Resmi
        "Ordunuz bir tiyatro kumpanyasından farksız.",
        "Haritanızda renksiniz, sahada gölge bile değilsiniz.",
        "Liderliğiniz tarih kitaplarında dipnot olur — utanç dipnotu.",
        "Sınırınızı çizenler bile pişman olmuştur.",
        "Fabrikalarınız hurda, tümenleriniz kâğıt kaplan.",
        "Diplomasi diliniz dilencilik kadar inandırıcı.",
        "Ordularınız sınırımda piknik mi yapıyor?",
        "Bayrağınız rüzgârda titriyor; korkudan mı?",
        "Sizin 'stratejiniz' rastgele zar atmakla aynı.",
        "Tarih sizi unutacak; biz hatırlamaya bile üşeniriz.",
        "Askerleriniz haritada kalın çizgi, sahada ince iplik.",
        // Yeni / Samimi
        "Ordun değil kanka o, bayram yürüyüşü bandosu sanki!",
        "Haritada yer kaplıyorsun ama için bomboş, tam bir balonsun.",
        "O generalleri nereden buldun? Kahveden adam toplasan daha iyi yönetirdi!",
        "Bayrağınız rüzgardan değil, bizim ordunun korkusundan sallanıyor.",
        "Orduların sınırımda piknik mi yapıyor senin? Topla şunları rezil olma.",
        "Sizinki strateji değil, bildiğin rüzgara karşı gözü kapalı koşmak.",
        "Tarih sizi yazmayacak, direkt üzerinizi çizecek!",
        "Siz ancak kâğıttan kaplan olursunuz, sahaya çıkınca erirsiniz.",
        "Diplomasi yapıyorsun aklınca ama mahalle muhtarı bile seni takmaz.",
        "Tümen sayına güvenme, hepsi saman doldurması gibi duruyor!"
    ],
    praise: [
        // Eski / Resmi
        "Sizinle müttefik olmak bir şereftir.",
        "Ordunuzun disiplini bölgede örnek teşkil ediyor.",
        "Diplomasi masanızda her zaman adil bir partner oldunuz.",
        "Sanayi mucizeniz kıskanılacak cinsten.",
        "Halkınızın azmi bize ilham veriyor.",
        "Cesur ama ölçülü politikalarınız takdire şayan.",
        // Yeni / Samimi
        "Helal olsun, adamlarda ne sanayi var be! Takdir ettim.",
        "Ordunun disiplini harbiden parmak ısırtıyor, helal.",
        "Senin gibi delikanlı lider az bulunur bu devirde.",
        "Seninle müttefik olanın sırtı yere gelmez, kralsın!"
    ],
    volunteer: [
        // Eski / Resmi
        "Cepheye gönüllü birlik gönderebiliriz — karşılıklı çıkar için.",
        "Eğitim misyonu teklifimiz var: subaylarınızı eğitelim.",
        "İnsani yardım konvoyu yola çıkmaya hazır.",
        // Yeni / Samimi
        "Sizin cephe patlamış, biraz gönüllü çocuklardan yollayalım mı desteğe?",
        "Subaylarınızı getirin bizim kışlada bir güzel eğitelim, adam olsunlar.",
        "İnsani yardım tırlarını çıkardık yola, kafana takma hallederiz."
    ],
    science: [
        // Eski / Resmi
        "Ortak araştırma projesi: fabrika verimliliği paylaşımı.",
        "Teknoloji lisansı karşılığında kaynak istiyoruz.",
        "Bilim heyetlerimiz buluşsun.",
        // Yeni / Samimi
        "Kafa kafaya verelim de şu fabrika teknolojisini çözelim.",
        "Biz yeni bir şey bulduk, ver oradan biraz kaynak sana da öğretek.",
        "Bilim adamlarını topla, ortak projeye giriyoruz."
    ]
};

function pickMsg(type) {
    const arr = AI_MSG_TEMPLATES[type] || AI_MSG_TEMPLATES.greet;
    return arr[Math.floor(Math.random() * arr.length)];
}

function updateInboxBadge() {
    const badge = document.getElementById("inbox-badge");
    if (!badge) return;
    const unread = (GameState.inbox || []).filter(m => !m.read).length;
    if (unread > 0) {
        badge.classList.remove("hidden");
        badge.textContent = unread > 9 ? "9+" : String(unread);
    } else {
        badge.classList.add("hidden");
    }
}

function pushInboxMessage(msg) {
    if (!GameState.inbox) GameState.inbox = [];
    GameState.inbox.unshift({
        id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        from: msg.from,
        type: msg.type,
        text: msg.text,
        data: msg.data || {},
        read: false,
        time: GameState.date.getTime(),
        expiresWeeks: msg.expiresWeeks != null ? msg.expiresWeeks : 8
    });
    if (GameState.inbox.length > 40) GameState.inbox.length = 40;
    updateInboxBadge();
    if (!GameState.settings || GameState.settings.sfx !== false) sfx.playBlip();
}

function toggleInbox() {
    const existing = document.getElementById("inbox-panel");
    if (existing) { existing.remove(); return; }

    const panel = document.createElement("div");
    panel.id = "inbox-panel";
    panel.className = "fixed top-16 right-4 z-[10001] w-[380px] max-h-[70vh] bg-slate-900 border-2 border-slate-600 rounded-xl shadow-2xl flex flex-col overflow-hidden";

    const msgs = GameState.inbox || [];
    panel.innerHTML = `
        <div class="p-3 border-b border-slate-700 bg-slate-950 flex justify-between items-center">
            <h3 class="text-xs font-black text-cyan-400 uppercase tracking-wider">✉️ Diplomatik Posta</h3>
            <button onclick="document.getElementById('inbox-panel').remove()" class="text-red-400 text-lg">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-2" id="inbox-list">
            ${msgs.length === 0 ? `<div class="text-xs text-slate-500 italic text-center py-8">Gelen kutusu boş.</div>` : ""}
        </div>
    `;
    document.body.appendChild(panel);

    const list = document.getElementById("inbox-list");
    msgs.forEach(m => {
        const country = GameState.countries[m.from];
        const name = country ? country.name : m.from;
        const flag = country ? country.flag : "un";
        const div = document.createElement("div");
        div.className = `p-3 rounded border ${m.read ? "border-slate-800 bg-slate-950/50" : "border-cyan-800 bg-slate-800/80"} space-y-2`;
        const exp = m.expiresWeeks != null ? m.expiresWeeks : "?";
        const expLabel = exp <= 1 ? "Bu hafta doluyor" : exp <= 4 ? `${exp} hafta sonra tükenir` : exp <= 12 ? `${exp} hafta (~${Math.ceil(exp/4)} ay)` : `${exp} hafta (~${(exp/52).toFixed(1)} yıl)`;
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <img src="https://flagcdn.com/w40/${flag}.png" class="w-6 h-4 object-cover rounded border border-slate-700">
                <span class="text-[11px] font-black text-slate-200 uppercase">${name}</span>
                <span class="text-[9px] text-slate-500 ml-auto">${m.type}</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-relaxed">${m.text}</p>
            <div class="text-[9px] text-orange-400/90 font-mono">⏳ ${expLabel}</div>
            <div class="flex gap-2" id="msg-actions-${m.id}"></div>
        `;
        list.appendChild(div);
        m.read = true;

        const actions = div.querySelector(`#msg-actions-${m.id}`);
        if (m.type === "nuclear_crisis") {
            actions.innerHTML = `<button onclick="document.getElementById('inbox-panel')?.remove();showNuclearCrisisModal()" class="w-full py-1.5 bg-purple-800 hover:bg-purple-700 border border-purple-500 rounded text-[10px] font-bold">☢️ Krizi Yönet</button>`;
        } else if (m.type === "mediation") {
            actions.innerHTML = `
                <button onclick="respondInbox('${m.id}','yes')" class="flex-1 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded text-[10px] font-bold">✅ Kabul</button>
                <button onclick="respondInbox('${m.id}','no')" class="flex-1 py-1.5 bg-red-900/70 hover:bg-red-800 border border-red-700 rounded text-[10px] font-bold">❌ Red</button>
            `;
        } else if (m.type === "insult") {
            actions.innerHTML = `
                <button onclick="respondInbox('${m.id}','insult_back')" class="flex-1 py-1.5 bg-red-900 hover:bg-red-800 border border-red-600 rounded text-[10px] font-bold">🤬 Karşılık</button>
                <button onclick="respondInbox('${m.id}','ok')" class="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold">Yoksay</button>
            `;
        } else if (["trade","alliance","nap","relation","intel","volunteer","science","peace","concern","mediation"].includes(m.type)) {
            actions.innerHTML = `
                <button onclick="respondInbox('${m.id}','yes')" class="flex-1 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded text-[10px] font-bold">✅ Kabul</button>
                <button onclick="respondInbox('${m.id}','no')" class="flex-1 py-1.5 bg-red-900/70 hover:bg-red-800 border border-red-700 rounded text-[10px] font-bold">❌ Red</button>
            `;
        } else {
            actions.innerHTML = `<button onclick="respondInbox('${m.id}','ok')" class="w-full py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold">Tamam</button>`;
        }
    });
    updateInboxBadge();
}

function respondInbox(msgId, answer) {
    const msg = (GameState.inbox || []).find(m => m.id === msgId);
    if (!msg) return;
    const from = msg.from;
    const country = GameState.countries[from];
    if (!GameState.relations) GameState.relations = {};

    if (answer === "no") {
        GameState.relations[from] = Math.max(-100, (GameState.relations[from] || 0) - 5);
        log(`Diplomatik red: ${country?.name}`, "text-slate-400");
    } else if (answer === "yes") {
        if (msg.type === "trade") {
            const player = GameState.countries[GameState.player];
            ensureCivAllocation(player);
            ensureCivAllocation(country);
            const give = msg.data.wantRes || "food";
            const get = msg.data.giveRes || "ore";
            const giveAmt = msg.data.wantAmt || 15;
            const getAmt = msg.data.giveAmt || 12;
            if ((player.resources[give] || 0) >= giveAmt && (country.resources[get] || 0) >= getAmt) {
                player.resources[give] -= giveAmt;
                player.resources[get] = (player.resources[get] || 0) + getAmt;
                country.resources[get] -= getAmt;
                country.resources[give] = (country.resources[give] || 0) + giveAmt;
                GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 8);
                log(`✅ AI takası kabul edildi: ${country.name}`, "text-emerald-400");
            } else {
                log("Takas için stok yetersiz — teklif düştü.", "text-yellow-400");
            }
        } else if (msg.type === "alliance") {
            const rel = GameState.relations[from] || 0;
            if (rel < 25) {
                log("İlişki çok düşük, ittifak kurulamadı.", "text-red-500");
            } else {
                if (!GameState.alliances) GameState.alliances = [];
                const exists = GameState.alliances.some(a =>
                    (a.a === GameState.player && a.b === from) || (a.b === GameState.player && a.a === from)
                );
                if (!exists) {
                    const _allyCnt = (GameState.alliances||[]).filter(a => a.a===GameState.player||a.b===GameState.player).length;
                if (_allyCnt >= 2) { log("İttifak limiti (2) dolu.", "text-yellow-400"); }
                else GameState.alliances.push({ a: GameState.player, b: from, quality: Math.min(100, rel + 10) });
                    GameState.relations[from] = Math.min(100, rel + 15);
                    log(`🛡️ ${country.name} ile ittifak kabul edildi!`, "text-indigo-400 font-bold");
                    sfx.playVictory();
                }
            }
        } else if (msg.type === "nap") {
            if (!GameState.nonAggression) GameState.nonAggression = [];
            const exists = GameState.nonAggression.some(n =>
                (n.a === GameState.player && n.b === from) || (n.b === GameState.player && n.a === from)
            );
            if (!exists) {
                GameState.nonAggression.push({ a: GameState.player, b: from, weeksLeft: 52 });
                GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 8);
                log(`📜 ${country.name} ile saldırmazlık kabul edildi.`, "text-emerald-400");
            }
        } else if (msg.type === "relation") {
            if (isHostileToward(from)) {
                log("Düşmanlıkta ilişki teklifi geçersiz.", "text-red-500");
            } else {
                GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 12);
                log(`🤝 ${country.name} ile ilişkiler gelişti.`, "text-blue-400");
            }
        } else if (msg.type === "mediation") {
            const other = msg.data && msg.data.other;
            if (other && typeof acceptMediation === "function") acceptMediation(from, other);
        } else if (msg.type === "intel") {
            GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 5);
            const player = GameState.countries[GameState.player];
            player.stockpile.guns = (player.stockpile.guns || 0) + 100;
            log(`🕵️ İstihbarat paylaşımı: +100 tüfek keşfi, ilişki +5`, "text-cyan-400");
        } else if (msg.type === "volunteer") {
            const player = GameState.countries[GameState.player];
            player.manpower += 8000;
            GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 6);
            log(`🎖️ Gönüllü destek kabul: +8.000 insan gücü`, "text-indigo-400");
        } else if (msg.type === "science") {
            const player = GameState.countries[GameState.player];
            player.factoryEfficiency = Math.min(1.6, (player.factoryEfficiency || 1) + 0.03);
            GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 5);
            log(`🔬 Bilim işbirliği: fabrika verimi +3%`, "text-purple-400");
        } else if (msg.type === "peace") {
            // Ateşkes: o ülkeye savaş yoksa ilişki yumuşat
            GameState.relations[from] = Math.min(-20, (GameState.relations[from] || -80) + 25);
            log(`🕊️ Barış jesti: ${country?.name} ile ilişki yumuşadı.`, "text-emerald-400");
        } else if (msg.type === "embargo") {
            GameState.relations[from] = Math.max(-100, (GameState.relations[from] || 0) - 10);
            log(`🚫 Ambargo tehdidi reddedilmedi — ilişki bozuldu.`, "text-orange-400");
        } else if (msg.type === "concern") {
            const player = GameState.countries[GameState.player];
            player.money += 150;
            player.resources = player.resources || {};
            player.resources.food = (player.resources.food || 0) + 20;
            if (GameState.rebelActive) GameState.rebelProgress = Math.max(0, GameState.rebelProgress - 8);
            log(`🆘 Dış istikrar yardımı: +150💰 +20🌾, asi −8%`, "text-emerald-400");
        }
    } else if (answer === "insult_back") {
        if (typeof sendInsult === "function") sendInsult(from);
    } else {
        if (msg.type === "thanks") GameState.relations[from] = Math.min(100, (GameState.relations[from] || 0) + 2);
        if (msg.type === "embargo" && answer === "ok") {
            GameState.relations[from] = Math.max(-100, (GameState.relations[from] || 0) - 5);
        }
    }

    // Mesajı listeden çıkar
    GameState.inbox = GameState.inbox.filter(m => m.id !== msgId);
    document.getElementById("inbox-panel")?.remove();
    updateInboxBadge();
    updateHUD();
    if (typeof refreshOpenTab === "function") refreshOpenTab();
}

// Haritada eyaleti olan ülkeler
function getMapCountries() {
    const set = new Set();
    if (typeof provinceOwners !== "undefined") {
        Object.values(provinceOwners).forEach(iso => {
            if (iso && iso !== "NEUTRAL") set.add(iso);
        });
    }
    return set;
}

// Düşman ülkelerden ara sıra hakaret
function processHostileInsults() {
    if (GameState.gameOver || Math.random() > 0.06) return;
    const hostiles = Object.keys(GameState.relations || {}).filter(iso =>
        iso !== GameState.player && (GameState.relations[iso] || 0) <= -80 && GameState.countries[iso] && !GameState.countries[iso].isCapitulated
    );
    if (!hostiles.length) return;
    const iso = hostiles[Math.floor(Math.random() * hostiles.length)];
    const line = (typeof INSULT_LINES !== "undefined")
        ? INSULT_LINES[Math.floor(Math.random() * INSULT_LINES.length)]
        : "Sözleriniz boş, ordunuz zayıf.";
    if (typeof pushInboxMessage === "function") {
        pushInboxMessage({ from: iso, type: "insult", text: line, data: {}, expiresWeeks: 5 });
        log(`🤬 ${GameState.countries[iso].name} size hakaret etti.`, "text-red-400");
    }
}

// ====================== AI BEYİN ======================
function processAIDiplomacy() {
    if (GameState.gameOver) return;
    // %75 daha az posta: ~%2 haftalık (msgRare açıkken)
    const rareFactor = (GameState.settings && GameState.settings.msgRare !== false) ? 0.02 : 0.05;
    if (Math.random() > rareFactor) return;
    // Aynı anda max 2 okunmamış mesaj
    const unread = (GameState.inbox || []).filter(m => !m.read).length;
    if (unread >= 2) return;

    const player = GameState.player;
    const mapCountries = getMapCountries();
    const candidates = Object.keys(GameState.countries).filter(iso => {
        if (iso === player) return false;
        if (mapCountries.size > 0 && !mapCountries.has(iso)) return false;
        const c = GameState.countries[iso];
        if (!c || c.isCapitulated) return false;
        if (typeof isCountryAlive === "function" && !isCountryAlive(iso)) return false;
        if (GameState.activeWars.some(w => w.target === iso)) return false;
        // Düşmanlara ticaret/ittifak teklifi yok — hakaret ayrı
        if ((GameState.relations[iso] || 0) <= -80) return false;
        return true;
    });
    if (!candidates.length) return;

    candidates.sort((a, b) => ((GameState.relations[b] || 0) - (GameState.relations[a] || 0)));
    const pool = candidates.slice(0, 12);
    const iso = pool[Math.floor(Math.random() * pool.length)];
    const rel = (GameState.relations && GameState.relations[iso]) || 0;
    const c = GameState.countries[iso];
    ensureCivAllocation(c);

    const isAlly = (GameState.alliances || []).some(a =>
        (a.a === player && a.b === iso) || (a.b === player && a.a === iso)
    );
    const hasNAP = (GameState.nonAggression || []).some(n =>
        (n.a === player && n.b === iso) || (n.b === player && n.a === iso)
    );

    let type = null;
    const roll = Math.random();
    const atWarWithSomeone = (GameState.activeWars || []).length > 0;

    if (rel >= 50 && !isAlly && roll < 0.10) type = "alliance";
    else if (rel >= 20 && !hasNAP && roll < 0.18) type = "nap";
    else if (roll < 0.32) type = "trade";
    else if (roll < 0.42) type = "relation";
    else if (GameState.globalTension > 50 && roll < 0.52) type = "warning";
    else if (rel > 40 && roll < 0.60) type = "thanks";
    else if (GameState.rebelActive && roll < 0.68) type = "concern";
    else if (GameState.nuclear && GameState.nuclear.unlocked && roll < 0.74) type = "warning";
    else if (rel >= 30 && roll < 0.80) type = "intel";
    else if (GameState.globalTension > 60 && roll < 0.85) type = "embargo";
    else if (atWarWithSomeone && rel > 20 && roll < 0.90) type = "volunteer";
    else if (rel >= 25 && roll < 0.94) type = "science";
    else if (atWarWithSomeone && (GameState.relations[iso] || 0) < -40 && roll < 0.97) type = "peace";
    else type = "greet";

    if ((type === "alliance" || type === "nap") && rel < 15) type = "relation";

    const text = pickMsg(type);
    const data = {};
    // Süre: 4–12 hafta
    const expiresWeeks = 4 + Math.floor(Math.random() * 9);

    if (type === "trade") {
        const keys = ["food", "ore", "energy", "goods"];
        data.giveRes = keys[Math.floor(Math.random() * keys.length)];
        data.wantRes = keys.filter(k => k !== data.giveRes)[Math.floor(Math.random() * 3)];
        data.giveAmt = 8 + Math.floor(Math.random() * 20);
        data.wantAmt = 8 + Math.floor(Math.random() * 18);
        if ((c.resources[data.giveRes] || 0) < data.giveAmt) return;
    }

    pushInboxMessage({ from: iso, type, text, data, expiresWeeks });
    log(`✉️ Yeni diplomatik mesaj: ${c.name} (${expiresWeeks} hafta geçerli)`, "text-cyan-400");
}

function processInboxExpiry() {
    if (!GameState.inbox || !GameState.inbox.length) return;
    let changed = false;
    for (let i = GameState.inbox.length - 1; i >= 0; i--) {
        const m = GameState.inbox[i];
        if (m.expiresWeeks == null) continue;
        m.expiresWeeks--;
        if (m.expiresWeeks <= 0) {
            const name = GameState.countries[m.from]?.name || m.from;
            log(`⌛ Diplomatik teklif süresi doldu: ${name}`, "text-slate-500");
            GameState.inbox.splice(i, 1);
            changed = true;
        }
    }
    if (changed && typeof updateInboxBadge === "function") updateInboxBadge();
}

// ====================== NÜKLEER PROGRAM ======================
function processNuclear() {
    if (GameState.gameOver) return;
    if (typeof eraBlocksNuclear === "function" && eraBlocksNuclear()) {
        if (GameState.nuclear) { GameState.nuclear.active = false; }
        return;
    }
    const player = GameState.countries[GameState.player];
    if (!player || !GameState.nuclear) return;
    if (GameState.nuclear.unlocked) return;
    if (!GameState.nuclear.active) return;
    const era2 = typeof eraNuclearVeryHard === "function" && eraNuclearVeryHard();
    const cost = era2 ? 200 : 80;
    const progressGain = era2 ? (0.4 + Math.min(1, (player.milFactories || 0) / 40)) : (2 + Math.min(3, (player.milFactories || 0) / 20));
    if (player.money < cost) {
        log("⚛️ Nükleer program: yetersiz hazine, araştırma yavaşladı.", "text-yellow-400");
        GameState.nuclear.progress += era2 ? 0.15 : 0.5;
    } else {
        player.money -= cost;
        GameState.nuclear.progress += progressGain;
    }
    if (GameState.nuclear.progress >= 100) {
        GameState.nuclear.progress = 100;
        GameState.nuclear.unlocked = true;
        GameState.nuclear.active = false;
        GameState.nuclear.warheads = 1;
        GameState.globalTension = Math.min(100, GameState.globalTension + 20);
        log("☢️ NÜKLEER CAYDIRICILIK: İlk savaş başlığı hazır! Küresel gerilim yükseldi.", "text-red-500 font-black");
        sfx.playSiren();
        if (typeof startNuclearCrisis === "function") startNuclearCrisis();
    }
}

function startNuclearCrisis() {
    GameState.nuclearCrisis = { active: true, weeksLeft: 8, resolved: false };
    // Büyük güçlerden tepki mesajları
    const mapC = typeof getMapCountries === "function" ? getMapCountries() : new Set();
    const big = ["USA", "RUS", "CHN", "GBR", "FRA", "DEU", "IND", "PAK", "ISR"].filter(iso =>
        iso !== GameState.player && GameState.countries[iso] && (mapC.size === 0 || mapC.has(iso))
    );
    big.slice(0, 3).forEach(iso => {
        if (typeof pushInboxMessage === "function") {
            pushInboxMessage({
                from: iso,
                type: "nuclear_crisis",
                text: pickMsg("warning") + " Nükleer programınız uluslararası kriz yarattı. Müzakere masasına oturun veya yaptırım riski alın.",
                data: { crisis: true },
                expiresWeeks: 8
            });
        }
        if (!GameState.relations) GameState.relations = {};
        GameState.relations[iso] = Math.max(-100, (GameState.relations[iso] || 0) - 25);
    });
    showNuclearCrisisModal();
}

function showNuclearCrisisModal() {
    document.getElementById("nuclear-crisis-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "nuclear-crisis-modal";
    modal.className = "fixed inset-0 z-[15000] flex items-center justify-center bg-black/85 p-4";
    modal.innerHTML = `
        <div class="bg-slate-950 border-2 border-purple-600 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h2 class="text-sm font-black text-purple-400 uppercase tracking-wider">☢️ Nükleer Kriz Müzakeresi</h2>
            <p class="text-xs text-slate-300 leading-relaxed">
                Dünya kamuoyu nükleer programınıza tepki gösterdi. Seçiminiz gerilim, ilişki ve caydırıcılığı etkiler.
            </p>
            <div class="space-y-2">
                <button onclick="resolveNuclearCrisis('talk')" class="w-full py-3 bg-blue-800 hover:bg-blue-700 border border-blue-500 rounded text-xs font-bold text-left px-3">
                    🕊️ Müzakere et — Gerilim −15, program dondurulur (başlık kalır)
                </button>
                <button onclick="resolveNuclearCrisis('sanction')" class="w-full py-3 bg-yellow-900/80 hover:bg-yellow-800 border border-yellow-600 rounded text-xs font-bold text-left px-3">
                    ⚖️ Yaptırımları göze al — −400 hazine, gerilim +5, program devam
                </button>
                <button onclick="resolveNuclearCrisis('flex')" class="w-full py-3 bg-red-900/80 hover:bg-red-800 border border-red-600 rounded text-xs font-bold text-left px-3">
                    ☢️ Caydırıcılığı göster — Gerilim +20, düşman moral − (savaş skoru +3)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function resolveNuclearCrisis(choice) {
    document.getElementById("nuclear-crisis-modal")?.remove();
    const player = GameState.countries[GameState.player];
    if (!GameState.nuclearCrisis) GameState.nuclearCrisis = {};
    GameState.nuclearCrisis.resolved = true;
    GameState.nuclearCrisis.active = false;

    if (choice === "talk") {
        GameState.globalTension = Math.max(0, GameState.globalTension - 15);
        GameState.nuclear.active = false;
        log("🕊️ Nükleer müzakere: Gerilim düştü. Program donduruldu, mevcut başlık korundu.", "text-blue-400 font-bold");
    } else if (choice === "sanction") {
        player.money = Math.max(0, player.money - 400);
        GameState.globalTension = Math.min(100, GameState.globalTension + 5);
        log("⚖️ Yaptırımlar göze alındı. Hazine yara aldı; program sürüyor.", "text-yellow-400 font-bold");
    } else if (choice === "flex") {
        GameState.globalTension = Math.min(100, GameState.globalTension + 20);
        GameState.activeWars.forEach(w => { w.progress += 3; });
        log("☢️ Caydırıcılık gösterisi: Cephelerde moral etkisi. Küresel gerilim tırmandı.", "text-red-400 font-bold");
    }
    updateHUD();
}

function canStartNuclearProgram() {
    const reasons = [];
    if (typeof eraBlocksNuclear === "function" && eraBlocksNuclear()) {
        reasons.push("Bu çağda nükleer kilitli (1914)");
        return { ok: false, reasons };
    }
    const p = GameState.countries[GameState.player];
    if (!p) return { ok: false, reasons: ["Oyuncu yok"] };
    const era = (typeof getTechEra === "function") ? getTechEra() : 3;
    if (era < 2) reasons.push("Teknoloji çağı en az 2 (WW2+) olmalı");
    if ((p.milFactories || 0) < 12) reasons.push("En az 12 askeri fabrika");
    if ((p.civFactories || 0) < 8) reasons.push("En az 8 sivil fabrika");
    if ((p.money || 0) < 5000) reasons.push("En az 5000 hazine");
    // Üniversite / akademi sayısı (eyalet binaları)
    let uni = 0;
    const pb = GameState.provinceBuildings || {};
    Object.keys(pb).forEach(pr => {
        const owner = (typeof provinceOwners !== "undefined" && provinceOwners[pr]) || null;
        if (owner !== GameState.player) return;
        (pb[pr] || []).forEach(b => {
            if (b === "university" || b === "academy") uni++;
        });
    });
    if (uni < 3) reasons.push("En az 3 Üniversite veya Akademi binası (" + uni + "/3)");
    // Ortalama altyapı
    let infraSum = 0, infraN = 0;
    if (typeof provinceOwners !== "undefined" && typeof getProvinceInfra === "function") {
        Object.keys(provinceOwners).forEach(pr => {
            if (provinceOwners[pr] !== GameState.player) return;
            infraSum += getProvinceInfra(pr);
            infraN++;
        });
    }
    const avgInfra = infraN ? (infraSum / infraN) : 0;
    if (avgInfra < 4) reasons.push("Ortalama altyapı ≥ 4 (şimdi " + avgInfra.toFixed(1) + ")");
    // Araştırma
    const completed = (p.research && p.research.completed) ? p.research.completed.length : (p.completedFocuses || []).length;
    if (completed < 2) reasons.push("En az 2 tamamlanmış araştırma/odak");
    return { ok: reasons.length === 0, reasons, uni, avgInfra };
}

function startNuclearProgram() {
    if (!GameState.nuclear) GameState.nuclear = { progress: 0, unlocked: false, warheads: 0 };
    if (GameState.nuclear.unlocked) { log("Nükleer program zaten tamamlandı.", "text-yellow-400"); return; }
    if (GameState.nuclear.active) { log("Program zaten aktif.", "text-slate-400"); return; }
    const check = canStartNuclearProgram();
    if (!check.ok) {
        log("Nükleer program şartları sağlanmadı: " + check.reasons.join(" · "), "text-red-500");
        return;
    }
    const player = GameState.countries[GameState.player];
    const era2 = typeof eraNuclearVeryHard === "function" && eraNuclearVeryHard();
    const startCost = era2 ? 2500 : 1500;
    if (player.money < startCost) {
        log("Başlangıç yatırımı: " + startCost + " hazine gerekli.", "text-red-500");
        return;
    }
    player.money -= startCost;
    GameState.nuclear.active = true;
    GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + (era2 ? 12 : 8));
    log("⚛️ Nükleer program başlatıldı. Sıkı şartlar karşılandı — dünya gerilimi arttı.", "text-purple-300 font-bold");
    try { sfx.playAlert(); } catch (e) {}
    if (typeof updateHUD === "function") updateHUD();
    if (typeof renderMilitaryTab === "function") renderMilitaryTab();
}


function processRebels() {
    if (GameState.gameOver) return;
    const player = GameState.countries[GameState.player];
    if (!player) return;

    // İlhak sayısı → asi riski (dengeli, küçük artış)
    const annexBonus = GameState.rebelRiskBonus || 0;
    const baseChance = 0.02;
    const tensionFactor = GameState.globalTension >= 90 ? 0.02 : (GameState.globalTension >= 70 ? 0.01 : 0);
    const spawnChance = baseChance + annexBonus + tensionFactor;

    if (!GameState.rebelActive && Math.random() < spawnChance && (GameState.globalTension >= 70 || annexBonus >= 0.04)) {
        GameState.rebelActive = true;
        GameState.rebelProgress = 12 + Math.floor(Math.random() * 18);
        GameState.rebelWeeks = 0;
        log("⚠️ ASİ HAREKETİ: İşgal topraklarında huzursuzluk büyüyor!", "text-red-500 font-black");
        sfx.playSiren();
        return;
    }

    if (!GameState.rebelActive) return;

    GameState.rebelWeeks++;
    const suppressCost = 200;
    const divs = Object.values(player.divisions).reduce((a, b) => a + b, 0);
    const suppressChance = 0.25 + Math.min(0.4, divs / 80);

    if (Math.random() < suppressChance && player.money >= suppressCost) {
        player.money -= suppressCost;
        GameState.rebelProgress -= 8 + Math.floor(Math.random() * 12);
        log(`🛡️ Asi mücadelesi: %${Math.max(0, Math.floor(GameState.rebelProgress))} −${suppressCost} 💰`, "text-yellow-400");
    } else {
        GameState.rebelProgress += 4 + Math.floor(Math.random() * 8);
        ensureCivAllocation(player);
        const foodLoss = Math.min(player.resources.food || 0, 5 + Math.floor(Math.random() * 15));
        const moneyLoss = Math.min(player.money, 50 + Math.floor(Math.random() * 150));
        player.resources.food = (player.resources.food || 0) - foodLoss;
        player.money -= moneyLoss;
        if (player.civFactories > 1 && Math.random() < 0.15) {
            player.civFactories--;
            log("💥 Asiler bir sivil fabrikayı sabote etti!", "text-red-500");
        }
        log(`⚠️ Asi baskını: −${moneyLoss} 💰 −${foodLoss} 🌾 (isyan %${Math.floor(GameState.rebelProgress)})`, "text-red-400");
    }

    if (GameState.rebelProgress <= 0) {
        GameState.rebelActive = false;
        GameState.rebelProgress = 0;
        GameState.globalTension = Math.max(30, GameState.globalTension - 15);
        log("✅ Asiler bastırıldı. Ülke sükûnete kavuştu.", "text-emerald-400 font-bold");
        sfx.playVictory();
    } else if (GameState.rebelProgress >= 100) {
        triggerGameOver("rebel");
    }
    if (typeof renderActiveWarsDisplay === "function") renderActiveWarsDisplay();
}

function triggerGameOver(reason) {
    if (GameState.gameOver) return;
    GameState.gameOver = true;
    GameState.running = false;
    sfx.playSiren();

    let title = "GAME OVER";
    let body = "";
    if (reason === "no_land" || reason === "hakimiyet0") {
        title = "GAME OVER — HAKİMİYET %0";
        body = `
            <p class="text-sm text-slate-300 leading-relaxed mb-3">
                Haritada tek bir eyaletiniz kalmadı. Hakimiyetiniz <b class="text-red-400">%0</b>.
                Devlet fiilen sona erdi; ordu, hazine ve diplomasi çöktü.
            </p>
            <p class="text-xs text-slate-400 leading-relaxed mb-3">
                Topraksız bir hükümet ayakta kalamaz. Yeni bir seferde sınırlarınızı koruyun.
            </p>`;
    } else if (reason === "rebel") {
        title = "GAME OVER — ASİ ZAFERİ";
        body = `
            <p class="text-sm text-slate-300 leading-relaxed mb-3">
                İç isyan kontrol edilemez hale geldi. Asiler başkenti ele geçirdi, hükümet devrildi ve
                ordu dağıldı. Fabrikalar yakıldı, hazine yağmalandı, sınırlar kaos içinde.
            </p>
            <p class="text-xs text-slate-400 leading-relaxed mb-3">
                Tarihçiler bu dönemi “Büyük Ayaklanma” olarak kaydedecek. Küresel gerilim tavan yapmış,
                diplomatik yalnızlık ve yetersiz bastırma gücü ülkeyi içten çökertmişti.
                ${GameState.rebelWeeks || "?"} hafta süren isyan, nihayetinde merkezi otoriteyi yok etti.
            </p>
            <p class="text-xs text-red-400 font-bold">Son isyan seviyesi: %100 · Gerilim: ${GameState.globalTension}%</p>
        `;
    } else {
        body = `<p class="text-sm text-slate-300">Sefer sona erdi.</p>`;
    }

    document.getElementById("gameover-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "gameover-modal";
    modal.className = "fixed inset-0 z-[20000] flex items-center justify-center bg-black/90 p-4";
    modal.innerHTML = `
        <div class="bg-slate-950 border-2 border-red-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h1 class="text-2xl font-black text-red-500 tracking-widest uppercase text-center">${title}</h1>
            ${body}
            <div class="flex gap-2 pt-2">
                <button onclick="location.reload()" class="flex-1 py-3 bg-cyan-700 hover:bg-cyan-600 rounded font-black text-white uppercase text-sm">
                    Ana Menü
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ====================== AYARLAR (ESC + mobil ⚙️) ======================
function ensureSettingsDefaults() {
    if (!GameState.settings) GameState.settings = {};
    const s = GameState.settings;
    if (s.sfx === undefined) s.sfx = true;
    if (s.music === undefined) s.music = true;
    if (s.autoSave === undefined) s.autoSave = true;
    if (s.msgRare === undefined) s.msgRare = true;
    if (s.eventsEnabled === undefined) s.eventsEnabled = true;
    if (s.volume === undefined) s.volume = 0.45;
    if (s.lowGfx === undefined) { try { s.lowGfx = localStorage.getItem("sc_lowGfx")==="1"; } catch(e){ s.lowGfx=false; } }
    if (s.showCapitals === undefined) { try { s.showCapitals = localStorage.getItem("sc_showCapitals")!=="0"; } catch(e){ s.showCapitals=true; } }
    if (s.lowAiExpand === undefined) s.lowAiExpand = true;
    if (s.fewEvents === undefined) s.fewEvents = false;
    if (s.showCountryNames === undefined) {
      try {
        var ls = localStorage.getItem("sc_showCountryNames");
        s.showCountryNames = ls === null ? true : ls !== "0";
      } catch (e) { s.showCountryNames = true; }
    }
    if (s.tickMs === undefined) s.tickMs = GameState.speed || 800;
    if (GameState.eventsEnabled === undefined) GameState.eventsEnabled = s.eventsEnabled !== false;
    return s;
}

function toggleSettings() {
    const existing = document.getElementById("settings-overlay");
    if (existing) { existing.remove(); return; }
    const s = ensureSettingsDefaults();
    const speedVal = s.tickMs || GameState.speed || 800;
    // 5 seviye: 1x yavaş … 5x çok hızlı (ms / gün)
    const speeds = [
        { v: 2000, label: "1x Yavaş" },
        { v: 1200, label: "2x" },
        { v: 800, label: "3x Normal" },
        { v: 400, label: "4x Hızlı" },
        { v: 200, label: "5x Turbo" }
    ];
    const speedOpts = speeds.map(sp =>
        `<option value="${sp.v}" ${Math.abs(speedVal - sp.v) < 50 || (speedVal === sp.v) ? "selected" : ""}>${sp.label}</option>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.id = "settings-overlay";
    overlay.className = "fixed inset-0 z-[20000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3";
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="w-full max-w-lg bg-slate-900 border-2 border-cyan-700/60 rounded-2xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800">
          <h2 class="text-lg font-black text-cyan-300 tracking-widest uppercase">⚙️ Ayarlar</h2>
          <button onclick="document.getElementById('settings-overlay').remove()" class="text-2xl text-red-400 hover:text-red-300 leading-none px-2">✕</button>
        </div>
        <div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
          <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Harita</div>
          <label class="flex items-center justify-between text-slate-200">
            <span>Ülke isimleri</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${(s.showCountryNames !== false) ? "checked" : ""}
              onchange="GameState.settings.showCountryNames=this.checked; try{ localStorage.setItem('sc_showCountryNames', this.checked?'1':'0'); }catch(e){}; if(typeof scRefreshCountryNames==='function') scRefreshCountryNames(true);">
          </label>
          <p class="text-[10px] text-slate-500 -mt-2">Yakınlaştıkça küçük ülkelerin isimleri de açılır.</p>
          <label class="flex items-center justify-between text-slate-200">
            <span>Başkent işaretleri</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${(s.showCapitals !== false) ? "checked" : ""}
              onchange="GameState.settings.showCapitals=this.checked; try{localStorage.setItem('sc_showCapitals',this.checked?'1':'0')}catch(e){}; if(typeof updateCapitalMarkers==='function')updateCapitalMarkers();">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Düşük grafik (optimize)</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.lowGfx ? "checked" : ""}
              onchange="GameState.settings.lowGfx=this.checked; try{localStorage.setItem('sc_lowGfx',this.checked?'1':'0')}catch(e){}; document.body.classList.toggle('sc-low-gfx',this.checked);">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>AI genişleme (düşük)</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${(s.lowAiExpand !== false) ? "checked" : ""}
              onchange="GameState.settings.lowAiExpand=this.checked; GameState._aiExpandChance=this.checked?0.06:0.2; GameState._aiExpandMinDays=this.checked?32:14;">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Olay sıklığı (az)</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.fewEvents ? "checked" : ""}
              onchange="GameState.settings.fewEvents=this.checked;">
          </label>
          <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Ses & Müzik</div>
          <label class="flex items-center justify-between text-slate-200">
            <span>Ses efektleri (SFX)</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.sfx !== false ? "checked" : ""}
              onchange="GameState.settings.sfx=this.checked">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Arka plan müziği</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.music !== false ? "checked" : ""}
              onchange="toggleMusicEnabled(this.checked)">
          </label>
          <div class="flex items-center justify-between gap-3">
            <span class="text-slate-200">Ses seviyesi</span>
            <div class="flex items-center gap-2 flex-1 max-w-[220px]">
              <button type="button" class="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs" onclick="nudgeVolume(-0.1)">−</button>
              <input id="settings-vol" type="range" min="0" max="1" step="0.05" value="${s.volume}"
                class="flex-1 accent-cyan-500"
                oninput="setMusicVolume(parseFloat(this.value))">
              <button type="button" class="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs" onclick="nudgeVolume(0.1)">+</button>
            </div>
          </div>
          <button type="button" onclick="skipMusicTrack()" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-bold text-cyan-300">
            🎵 Sonraki parça
          </button>

          <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Oyun</div>
          <label class="flex items-center justify-between text-slate-200">
            <span>Oyun hızı</span>
            <select class="bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs font-bold" onchange="setGameSpeed(parseInt(this.value))">
              ${speedOpts}
            </select>
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Rastgele olaylar (Events)</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${(s.eventsEnabled !== false && GameState.eventsEnabled !== false) ? "checked" : ""}
              onchange="GameState.settings.eventsEnabled=this.checked; GameState.eventsEnabled=this.checked;">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Nadir diplomatik mesaj</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.msgRare !== false ? "checked" : ""}
              onchange="GameState.settings.msgRare=this.checked">
          </label>
          <label class="flex items-center justify-between text-slate-200">
            <span>Otomatik kayıt</span>
            <input type="checkbox" class="accent-cyan-500 w-5 h-5" ${s.autoSave !== false ? "checked" : ""}
              onchange="GameState.settings.autoSave=this.checked">
          </label>

          <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Ekran</div>
          <button type="button" onclick="toggleFullscreen()" class="w-full py-3 bg-indigo-800 hover:bg-indigo-700 border border-indigo-500 rounded-lg text-sm font-black text-white tracking-wide">
            ⛶ Tam Ekran Aç / Kapat
          </button>
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onclick="saveGame(); if(typeof log==='function')log('Kaydedildi','text-emerald-400')" class="py-2.5 bg-emerald-800 hover:bg-emerald-700 rounded-lg text-xs font-bold">💾 Kaydet</button>
            <button type="button" onclick="loadGamePrompt()" class="py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-xs font-bold">📂 Yükle</button>
          </div>
          <p class="text-[10px] text-slate-500 text-center pt-1">ESC ile kapat · Mobil: ⚙️ butonu aynı menüyü açar</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
}

function setGameSpeed(ms) {
    ensureSettingsDefaults();
    GameState.settings.tickMs = ms;
    GameState.speed = ms;
    if (window.gameTickInterval) {
        clearInterval(window.gameTickInterval);
        window.gameTickInterval = setInterval(gameTick, ms);
    }
    if (typeof log === "function") log(`Oyun hızı: ${ms}ms / gün`, "text-slate-400");
    const btn = document.getElementById("btn-speed");
    if (btn) {
        const map = {2000:"1x",1200:"2x",800:"3x",400:"4x",200:"5x"};
        let lab = map[ms] || "3x";
        for (const [k,v] of Object.entries(map)) if (Math.abs(ms-parseInt(k))<50) lab=v;
        btn.innerText = "▶ " + lab;
    }
}

function toggleMusicEnabled(on) {
    ensureSettingsDefaults();
    GameState.settings.music = !!on;
    try {
        if (!MusicPlayer.audio) return;
        if (on) {
            if (!MusicPlayer.started) MusicPlayer.start();
            else MusicPlayer.audio.play().catch(()=>{});
            MusicPlayer.audio.muted = false;
        } else {
            MusicPlayer.audio.pause();
            MusicPlayer.audio.muted = true;
        }
    } catch (e) {}
}

function setMusicVolume(v) {
    ensureSettingsDefaults();
    const vol = Math.max(0, Math.min(1, v));
    GameState.settings.volume = vol;
    try { MusicPlayer.setVolume(vol); } catch (e) {}
    const el = document.getElementById("settings-vol");
    if (el) el.value = String(vol);
}

function nudgeVolume(delta) {
    ensureSettingsDefaults();
    setMusicVolume((GameState.settings.volume || 0.45) + delta);
}

function skipMusicTrack() {
    try {
        if (!MusicPlayer.started) MusicPlayer.start();
        else MusicPlayer.next();
    } catch (e) {}
}

function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(()=>{});
        } else {
            document.exitFullscreen().catch(()=>{});
        }
    } catch (e) {
        if (typeof log === "function") log("Tam ekran desteklenmiyor", "text-yellow-400");
    }
}

// ESC → ayarlar (input içindeyken değil)
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    toggleSettings();
});


// ====================== LOBİ ARKA PLAN ======================
function initLobbyBackground() {
    const lobby = document.getElementById("lobby-screen");
    if (!lobby) return;
    const url = "https://i.imgur.com/A80rMlE.png";
    lobby.style.backgroundImage = `linear-gradient(rgba(2,6,23,0.75), rgba(2,6,23,0.88)), url('${url}')`;
    lobby.style.backgroundSize = "cover";
    lobby.style.backgroundPosition = "center";
}

window.addEventListener("DOMContentLoaded", () => {
    try { initLobbyBackground(); } catch(e) {}
});

// ====================== KAYIT SİSTEMİ ======================

function saveGame() {
    // Fethedilen ülkelerin renklerini güncelle
    Object.keys(GameState.countries).forEach(iso => {
        const c = GameState.countries[iso];
        if (c.isCapitulated && c.occupier) {
            const occupier = GameState.countries[c.occupier];
            if (occupier) c.savedColor = occupier.color; // save için özel renk
        } else {
            c.savedColor = c.color;
        }
    });

    const saveData = {
        player: GameState.player,
        date: GameState.date.getTime(),
        countries: GameState.countries,
        activeWars: GameState.activeWars,
        trainingQueue: GameState.trainingQueue,
        globalTension: GameState.globalTension,
        provinceOwners: typeof provinceOwners !== "undefined" ? provinceOwners : {},
        alliances: GameState.alliances || [],
        nonAggression: GameState.nonAggression || [],
        justifications: GameState.justifications || [],
        relations: GameState.relations || {},
        tradeDeals: GameState.tradeDeals || [],
        inbox: GameState.inbox || [],
        rebelActive: GameState.rebelActive || false,
        rebelProgress: GameState.rebelProgress || 0,
        lastAllyAidWeek: GameState.lastAllyAidWeek || {},
        nuclear: GameState.nuclear || { progress: 0, unlocked: false, warheads: 0 },
        settings: GameState.settings || {},
        scenarioId: GameState.scenarioId || "modern",
        scenarioName: GameState.scenarioName || "",
        techEra: GameState.techEra || 3,
        eventsEnabled: GameState.eventsEnabled !== false,
        puppets: GameState.puppets || {},
        speed: GameState.speed || 800,
        occupations: GameState.occupations || {},
        hoi: GameState.hoi || null,
        difficulty: GameState.difficulty || "normal",
        capitals: GameState.capitals || {},
        nameOffsets: GameState.nameOffsets || window.__SC_NAME_OFFSETS || {},
        nameOverrides: GameState.nameOverrides || window.__SC_NAME_OVERRIDES || {},
        saveVersion: 6,
        timestamp: Date.now()
    };
    
    try {
      localStorage.setItem(GameState.saveSlot, JSON.stringify(saveData));
      localStorage.setItem(GameState.saveSlot + "_meta", JSON.stringify({
        version: 6, player: GameState.player, date: saveData.date, scenarioId: saveData.scenarioId, ts: Date.now()
      }));
      log("OYUN KAYDEDİLDİ (v6)", "text-emerald-400");
      if (typeof showToast === "function") showToast("Kayıt tamam", "ok");
    } catch (e) {
      log("Kayıt başarısız — depolama dolu olabilir.", "text-red-400");
      console.warn(e);
    }
}

function loadGame(saveKey = "save1") {
    const saved = localStorage.getItem(saveKey);
    if (!saved) {
        log("YÜKLENECEK KAYIT BULUNAMADI", "text-red-500");
        return false;
    }
    
    try {
        const data = JSON.parse(saved);
        
        GameState.player = data.player;
        GameState.date = new Date(data.date);
        GameState.countries = data.countries;
        if (data.occupations) GameState.occupations = data.occupations;
        if (data.capitals) GameState.capitals = data.capitals;
        if (data.nameOffsets) {
          GameState.nameOffsets = data.nameOffsets;
          window.__SC_NAME_OFFSETS = data.nameOffsets;
        }
        if (data.nameOverrides) {
          GameState.nameOverrides = data.nameOverrides;
          window.__SC_NAME_OVERRIDES = data.nameOverrides;
          try {
            Object.keys(data.nameOverrides).forEach(function(iso){
              if (GameState.countries[iso]) GameState.countries[iso].name = data.nameOverrides[iso];
            });
          } catch(e){}
        }
        else if (!GameState.occupations) GameState.occupations = {};
        if (data.hoi) GameState.hoi = data.hoi;
        if (data.difficulty) GameState.difficulty = data.difficulty;
        if (data.saveVersion && data.saveVersion < 5) {
          console.log("Eski kayıt yüklendi (v" + data.saveVersion + ") — uyumluluk modu");
        }
        // Yüklenen renkleri haritaya uygula
        setTimeout(() => {
            d3.selectAll(".country-path").each(function() {
                const iso = this.id;
                if (iso && GameState.countries[iso]) {
                    const country = GameState.countries[iso];
                    
                    let colorToUse = country.color;
                    if (country.savedColor) {
                        colorToUse = country.savedColor;
                    } else if (country.isCapitulated && country.occupier) {
                        const occ = GameState.countries[country.occupier];
                        if (occ) colorToUse = occ.color;
                    }
                    
                    d3.select(this).style("fill", colorToUse);
                }
            });
        }, 800);
        GameState.activeWars = data.activeWars || [];
        GameState.trainingQueue = data.trainingQueue || [];
        GameState.globalTension = data.globalTension || 5;
        GameState.alliances = data.alliances || [];
        GameState.nonAggression = data.nonAggression || [];
        GameState.justifications = data.justifications || [];
        GameState.relations = data.relations || {};
        GameState.tradeDeals = data.tradeDeals || [];
        GameState.inbox = data.inbox || [];
        GameState.rebelActive = data.rebelActive || false;
        GameState.rebelProgress = data.rebelProgress || 0;
        GameState.lastAllyAidWeek = data.lastAllyAidWeek || {};
        GameState.nuclear = data.nuclear || { progress: 0, unlocked: false, warheads: 0 };
        GameState.settings = data.settings || GameState.settings || {};
        GameState.gameOver = false;
        if (data.provinceOwners && typeof provinceOwners !== "undefined") {
            Object.keys(provinceOwners).forEach(k => delete provinceOwners[k]);
            Object.assign(provinceOwners, data.provinceOwners);
        }
        if (typeof updateInboxBadge === "function") updateInboxBadge();
        
        // KRİTİK: OYUNU TEKRAR BAŞLAT
                GameState.running = true;
        
        // Otomatik kaydetmeyi başlat (varsa yeniden başlatma)
        if (!window.autoSaveInterval) {
            startAutoSave();
        }
        
        // OYUN TICK DÖNGÜSÜNÜ GARANTİ ALTINA AL
        if (window.gameTickInterval) {
            clearInterval(window.gameTickInterval);
        }
        window.gameTickInterval = setInterval(gameTick, GameState.speed || 1000);
        
        console.log("✅ GameTick interval yeniden başlatıldı (Yükleme sonrası)");
        
        // Senaryo meta
        if (data.scenarioId) GameState.scenarioId = data.scenarioId;
        if (data.scenarioName) GameState.scenarioName = data.scenarioName;
        if (data.techEra != null) GameState.techEra = data.techEra;
        if (data.eventsEnabled != null) GameState.eventsEnabled = data.eventsEnabled;
        if (data.puppets) GameState.puppets = data.puppets;
        if (data.speed) {
            GameState.speed = data.speed;
            if (GameState.settings) GameState.settings.tickMs = data.speed;
        }

        log("KAYIT BAŞARIYLA YÜKLENDİ → Oyun devam ediyor", "text-emerald-400");

        // HUD
        const playerCountry = GameState.countries[GameState.player];
        if (playerCountry) {
            const fl = document.getElementById("hud-flag");
            if (fl) fl.src = (typeof getFlagUrl === "function") ? getFlagUrl(GameState.player) : `https://flagcdn.com/w40/${playerCountry.flag}.png`;
            const hn = document.getElementById("hud-country-name");
            if (hn) hn.innerText = playerCountry.name;
            const hi = document.getElementById("hud-country-ideology");
            if (hi) hi.innerText = playerCountry.ideology;
        }

        // Harita: provinceOwners üzerinden yeniden boya
        if (typeof refreshMapColors === "function") {
            try { refreshMapColors(); } catch (e) {}
        }
        setTimeout(() => { try { if (typeof refreshMapColors === "function") refreshMapColors(); } catch(e){} }, 200);

        // Müzik: yeni oyun gibi sıfırla ve başlat
        try {
            MusicPlayer.started = false;
            if (MusicPlayer.audio) {
                try { MusicPlayer.audio.pause(); } catch(e){}
            }
            ensureSettingsDefaults();
            if (GameState.settings.music !== false) {
                MusicPlayer.start();
            }
        } catch (e) { console.warn("Load müzik:", e); }

        // Lobiyi kapat (kayıttan devam)
        const lobby = document.getElementById("lobby-screen");
        if (lobby) lobby.style.display = "none";

        if (typeof updateHUD === "function") updateHUD();
        if (typeof renderProductionTab === "function") renderProductionTab();
        if (typeof renderFocusTree === "function") renderFocusTree();
        if (typeof renderMilitaryTab === "function") renderMilitaryTab();
        if (typeof updateInboxBadge === "function") updateInboxBadge();

        if (!window.autoSaveInterval && typeof startAutoSave === "function") {
            startAutoSave();
        }

        return true;
    } catch(e) {
        log("KAYIT YÜKLENİRKEN HATA OLUŞTU", "text-red-500");
        // HARİTA RENKLERİNİ GÜNCELLE (Özellikle fethedilen ülkeler)
        refreshMapColors();
                // Harita renklerini yenile (biraz gecikmeli)
        setTimeout(() => {
            refreshMapColors();
        }, 800);
        console.error(e);
        return false;
    }
}

function startAutoSave() {
    setInterval(() => {
        if (GameState.running) saveGame();
    }, 30000); // 30 saniyede bir
}

function handleSaveShortcut(e) {
    if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        exportSaveFile();
    }
    // Space: pause
    if (e.code === "Space" && !e.target.matches("input,textarea,select")) {
        e.preventDefault();
        if (typeof toggleGameSpeed === "function") toggleGameSpeed();
    }
    // 1-5 hız
    if (!e.ctrlKey && !e.altKey && !e.target.matches("input,textarea,select") && e.key >= "1" && e.key <= "5") {
        const speeds = { "1": 2000, "2": 1500, "3": 1000, "4": 500, "5": 250 };
        GameState.speedLevel = parseInt(e.key);
        if (typeof setGameSpeed === "function") setGameSpeed(speeds[e.key]);
        else {
            GameState.speed = speeds[e.key];
            if (window.gameTickInterval) {
                clearInterval(window.gameTickInterval);
                window.gameTickInterval = setInterval(gameTick, GameState.speed);
            }
        }
        log(`Hız seviyesi: ${e.key}`, "text-slate-400");
    }
}

function exportSaveFile() {
    saveGame(); // önce localStorage'a kaydet
    const saveData = localStorage.getItem(GameState.saveSlot);
    if (!saveData) return;
    
    const blob = new Blob([saveData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supreme_command_save_${GameState.player}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log("SAVE DOSYASI İNDİRİLDİ", "text-cyan-400");
}

// ====================== YÜKLEME MENÜSÜ ======================
function loadGamePrompt() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = JSON.parse(ev.target.result);
                localStorage.setItem(GameState.saveSlot, JSON.stringify(data));
                
                if (loadGame(GameState.saveSlot)) {
                    document.getElementById("lobby-screen").classList.add("hidden");
            const _mm = document.getElementById("main-menu-screen");
            if (_mm) _mm.classList.add("hidden");
            try { if (typeof applyCapitalsAndIdentity === "function") applyCapitalsAndIdentity(GameState.scenarioId); } catch(e){}
                    // Oyun zaten loadGame içinde başlatılıyor
                }
            } catch(err) {
                alert("Geçersiz save dosyası!");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// Klavye dinleyicisini başlat
document.addEventListener("keydown", handleSaveShortcut);

function ideologyColor(ideo) {
    if (!ideo) return "#64748b";
    const s = String(ideo).toLowerCase();
    if (s.includes("komün") || s.includes("sosyal")) return "#b91c1c";
    if (s.includes("faş") || s.includes("milliyet")) return "#1e3a5f";
    if (s.includes("monar")) return "#7c3aed";
    if (s.includes("cumhur") || s.includes("demo") || s.includes("liberal")) return "#2563eb";
    return "#64748b";
}

function setMapMode(mode) {
    GameState.mapMode = mode || "political";
    document.querySelectorAll(".map-mode-btn").forEach(b => {
        b.classList.toggle("border-cyan-400", b.dataset.mode === mode);
        b.classList.toggle("text-cyan-300", b.dataset.mode === mode);
    });
    refreshMapColors();
    log(`Harita modu: ${mode}`, "text-slate-400");
}


function blendHexColors(a, b, t) {
    t = Math.max(0, Math.min(1, t == null ? 0.5 : t));
    function parse(h) {
        h = String(h || "#334155").replace("#", "");
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
    }
    var A = parse(a), B = parse(b);
    var r = Math.round(A[0] + (B[0]-A[0])*t);
    var g = Math.round(A[1] + (B[1]-A[1])*t);
    var bl = Math.round(A[2] + (B[2]-A[2])*t);
    return "#" + [r,g,bl].map(function(x){ var s=x.toString(16); return s.length<2?"0"+s:s; }).join("");
}
try { window.blendHexColors = blendHexColors; } catch (e) {}

function refreshMapColors() {
    const mode = GameState.mapMode || "political";
    d3.selectAll(".country-path").each(function() {
        const path = d3.select(this);
        const name = path.attr("data-name");
        if (!name) return;

        const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : "NEUTRAL";
        let fillColor = "#1e293b";

        if (owner && owner !== "NEUTRAL" && GameState.countries[owner]) {
            const country = GameState.countries[owner];
            if (mode === "ideology") {
                fillColor = ideologyColor(country.ideology);
            } else if (mode === "tension") {
                const atWar = (GameState.activeWars || []).some(w => w.target === owner);
                const rel = (GameState.relations && GameState.relations[owner]) || 0;
                if (atWar) fillColor = "#ef4444";
                else if (rel <= -80) fillColor = "#9f1239";
                else if (GameState.globalTension > 70) fillColor = "#c2410c";
                else if (GameState.globalTension > 40) fillColor = "#a16207";
                else fillColor = "#166534";
            } else if (mode === "industry") {
                const ind = (country.civFactories || 0) + (country.milFactories || 0);
                if (ind > 80) fillColor = "#fbbf24";
                else if (ind > 40) fillColor = "#a3e635";
                else if (ind > 15) fillColor = "#4ade80";
                else fillColor = "#14532d";
            } else {
                fillColor = country.color || "#1e293b";
                if (country.isCapitulated && country.occupier && GameState.countries[country.occupier]) {
                    fillColor = GameState.countries[country.occupier].color;
                } else if (country.savedColor) {
                    fillColor = country.savedColor;
                }
                // Kukla: biraz soluk
                if (country.isPuppet) fillColor = fillColor; // keep color
            }
        }
        path.style("fill", fillColor);
    });
}

// ====================== HOI SİSTEMLERİ: HAVA / PETROL / KUKLA / ULTİM ======================
function ensureStratResources(c) {
    if (!c) return;
    if (!c.strat) {
        const scale = Math.max(1, (c.civFactories || 5) / 10);
        c.strat = {
            oil: Math.floor(20 + Math.random() * 40 * scale),
            steel: Math.floor(30 + Math.random() * 50 * scale),
            aluminum: Math.floor(15 + Math.random() * 30 * scale),
            rubber: Math.floor(10 + Math.random() * 25 * scale)
        };
    }
    if (!c.airforce) c.airforce = { fighters: Math.floor((c.milFactories || 1) * 2), bombers: Math.floor((c.milFactories || 1) * 1) };
    if (!c.navy) c.navy = { ships: Math.floor((c.civFactories || 1) / 5), destroyer: 0, cruiser: 0, battleship: 0 };
    if (c.navy && c.navy.destroyer == null) { c.navy.destroyer = 0; c.navy.cruiser = 0; c.navy.battleship = 0; }
}

function getAirSupremacyBonus(attacker, defender) {
    ensureStratResources(attacker);
    ensureStratResources(defender);
    const a = (attacker.airforce.fighters || 0) + (attacker.airforce.bombers || 0) * 1.2;
    const d = (defender.airforce.fighters || 0) + (defender.airforce.bombers || 0) * 1.2;
    if (a > d * 1.3) return 1.25;
    if (a > d) return 1.1;
    if (d > a * 1.3) return 0.8;
    return 1;
}

function getOilPenalty(country) {
    ensureStratResources(country);
    const oil = country.strat.oil || 0;
    const tanks = country.divisions?.arm || 0;
    const need = tanks * 2 + (country.airforce?.fighters || 0) * 0.1;
    if (oil <= 0 && need > 0) return 0.5; // %50 güç
    if (oil < need) return 0.75;
    return 1;
}

function processStrategicResources() {
    const player = GameState.countries[GameState.player];
    if (!player) return;
    ensureStratResources(player);
    // Haftalık üretim: madencilik sektörü benzeri
    const civ = player.civFactories || 0;
    player.strat.oil += Math.floor(civ * 0.3);
    player.strat.steel += Math.floor(civ * 0.4);
    player.strat.aluminum += Math.floor(civ * 0.2);
    player.strat.rubber += Math.floor(civ * 0.15);
    // Tüketim
    const arm = player.divisions?.arm || 0;
    const air = (player.airforce?.fighters || 0) + (player.airforce?.bombers || 0);
    player.strat.oil = Math.max(0, player.strat.oil - Math.floor(arm * 1.5 + air * 0.05));
    // Çelik üretimi için (askeri üretim basit)
    if (player.milFactories > 0) {
        player.strat.steel = Math.max(0, player.strat.steel - Math.floor(player.milFactories * 0.5));
    }
}

function makePuppet(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    if (!target || !player) return;
    target.isPuppet = true;
    target.subjectType = "vassal";
    target.overlord = GameState.player;
    if (!GameState.puppets[GameState.player]) GameState.puppets[GameState.player] = [];
    if (!GameState.puppets[GameState.player].includes(targetIso)) GameState.puppets[GameState.player].push(targetIso);
    // Fabrika payı %30
    const civShare = Math.floor(target.civFactories * 0.3);
    const milShare = Math.floor(target.milFactories * 0.3);
    player.civFactories += civShare;
    player.milFactories += milShare;
    target.civFactories = Math.max(1, target.civFactories - civShare);
    target.milFactories = Math.max(0, target.milFactories - milShare);
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[targetIso] = Math.max(-40, Math.min(30, (GameState.relations[targetIso] || 0) + 20));
    log(`🎭 KUKLA: ${target.name} vasal oldu. +${civShare} sivil / +${milShare} askeri fabrika payı.`, "text-purple-400 font-bold");
    document.getElementById("territory-demand-modal")?.remove();
    refreshMapColors();
    updateHUD();
}

function sendUltimatum(iso) {
    if (typeof isHostileToward === "function" && isHostileToward(iso) && !(GameState.activeWars || []).some(w => w.target === iso)) {
        // ok
    }
    const target = GameState.countries[iso];
    if (!target) return;
    const player = GameState.countries[GameState.player];
    const pDivs = Object.values(player.divisions).reduce((a,b)=>a+b,0);
    const tDivs = Math.max(1, Object.values(target.divisions).reduce((a,b)=>a+b,0));
    const ratio = pDivs / tDivs;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.max(-100, (GameState.relations[iso] || 0) - 20);
    GameState.globalTension = Math.min(100, GameState.globalTension + 8);
    // AI kabul: güç oranı yüksekse
    if (ratio >= 1.4 && Math.random() < 0.55) {
        const provs = Object.keys(provinceOwners).filter(p => provinceOwners[p] === iso);
        if (provs.length) {
            const give = provs[Math.floor(Math.random() * provs.length)];
            provinceOwners[give] = GameState.player;
            log(`📜 ULTİM ATUM KABUL: ${target.name} ${give.replace(/_/g," ")} eyaletini devretti!`, "text-emerald-400 font-bold");
            refreshMapColors();
        } else {
            player.money += 300;
            log(`📜 Ultimatom kabul: ${target.name} 300 hazine tazminat ödedi.`, "text-emerald-400");
        }
    } else {
        log(`📜 Ultimatom reddedildi: ${target.name}. Gerilim yükseldi.`, "text-red-400");
        if (typeof pushInboxMessage === "function") {
            pushInboxMessage({ from: iso, type: "warning", text: "Ultimatomunuz kabul edilemez. Savaşa hazır olun.", expiresWeeks: 4 });
        }
    }
    updateHUD();
    renderDiplomacyTab();
}

function requestMilitaryAccess(iso) {
    if (typeof isHostileToward === "function" && isHostileToward(iso)) {
        log("Düşmanlıkta askeri geçiş hakkı istenemez.", "text-red-500");
        return;
    }
    const rel = (GameState.relations && GameState.relations[iso]) || 0;
    if (rel < 20) {
        log("Askeri geçiş için ilişki en az +20 olmalı.", "text-red-500");
        return;
    }
    if (!GameState.militaryAccess) GameState.militaryAccess = [];
    const exists = GameState.militaryAccess.some(m => m.from === GameState.player && m.to === iso);
    if (exists) { log("Zaten geçiş hakkınız var.", "text-yellow-400"); return; }
    GameState.militaryAccess.push({ from: GameState.player, to: iso });
    GameState.relations[iso] = Math.min(100, rel + 5);
    log(`🛂 Askeri geçiş hakkı: ${GameState.countries[iso].name}`, "text-cyan-400");
    renderDiplomacyTab();
}

function buildAirUnit(type) {
    const p = GameState.countries[GameState.player];
    ensureStratResources(p);
    // WW1: sadece keşif / ilkel uçak; bombardıman yok
    if (typeof eraBlocksAdvancedAir === "function" && eraBlocksAdvancedAir()) {
        if (type === "bombers") {
            log("⛔ Gelişmiş bombardıman bu çağda mevcut değil! (1914 — yalnızca keşif uçağı)", "text-red-500");
            return;
        }
        type = "fighters"; // keşif
    }
    let cost = type === "fighters" ? { money: 200, alum: 15, oil: 5 } : { money: 280, alum: 20, oil: 8 };
    if (getTechEra() === 1) cost = { money: 120, alum: 5, oil: 2 }; // ilkel
    if (p.money < cost.money || p.strat.aluminum < cost.alum || p.strat.oil < cost.oil) {
        log("Hava birliği için yetersiz kaynak (para/alüminyum/petrol).", "text-red-500");
        return;
    }
    p.money -= cost.money;
    p.strat.aluminum -= cost.alum;
    p.strat.oil -= cost.oil;
    p.airforce[type] = (p.airforce[type] || 0) + (getTechEra() === 1 ? 2 : 5);
    const label = getTechEra() === 1 ? "keşif/sipahi uçağı" : (type === "fighters" ? "avcı" : "bombardıman");
    log(`✈️ +${getTechEra() === 1 ? 2 : 5} ${label} üretildi.`, "text-cyan-400");
    updateHUD();
    if (typeof renderMilitaryTab === "function") renderMilitaryTab();
}

// ====================== ARAŞTIRMA & GENERAL & AI ======================
const RESEARCH_TREE = [
    { id: "ind_1", cat: "Sanayi", title: "Montaj Hatları", desc: "Fabrika verimi +8%", weeks: 8, cost: 200, minEra: 1, effect: (p) => { p.factoryEfficiency = Math.min(1.8, (p.factoryEfficiency||1)+0.08); } },
    { id: "ind_2", cat: "Sanayi", title: "Ağır Sanayi", desc: "+2 askeri fabrika", weeks: 10, cost: 350, minEra: 1, effect: (p) => { p.milFactories += 2; } },
    { id: "inf_1", cat: "Piyade", title: "Modern Tüfek", desc: "Piyade gücü +15%", weeks: 7, cost: 180, minEra: 2, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.inf = (p.doctrine.inf||1)+0.15; } },
    { id: "inf_0", cat: "Piyade", title: "Tekrarlayan Tüfek", desc: "Piyade +8% (1914)", weeks: 6, cost: 120, minEra: 1, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.inf = (p.doctrine.inf||1)+0.08; } },
    { id: "arm_1", cat: "Zırhlı", title: "Zırh Plakası", desc: "Tank gücü +20%", weeks: 9, cost: 280, minEra: 2, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.arm = (p.doctrine.arm||1)+0.2; } },
    { id: "arm_0", cat: "Zırhlı", title: "İlkel Zırh", desc: "İlkel tank +10%", weeks: 12, cost: 220, minEra: 1, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.arm = (p.doctrine.arm||1)+0.1; } },
    { id: "air_1", cat: "Hava", title: "Radar", desc: "Hava üstünlüğü +15%", weeks: 8, cost: 250, minEra: 2, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.air = (p.doctrine.air||1)+0.15; } },
    { id: "air_0", cat: "Hava", title: "Keşif Uçağı", desc: "Keşif +8%", weeks: 7, cost: 140, minEra: 1, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.air = (p.doctrine.air||1)+0.08; } },
    { id: "jet_1", cat: "Hava", title: "Jet Motoru", desc: "Modern hava +25%", weeks: 14, cost: 600, minEra: 3, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.air = (p.doctrine.air||1)+0.25; } },
    { id: "doc_att", cat: "Doktrin", title: "Yıldırım Saldırısı", desc: "Saldırı +12%", weeks: 10, cost: 300, minEra: 2, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.attack = (p.doctrine.attack||1)+0.12; } },
    { id: "doc_def", cat: "Doktrin", title: "Derin Savunma", desc: "Savunma +15%", weeks: 10, cost: 300, minEra: 1, effect: (p) => { p.doctrine = p.doctrine||{}; p.doctrine.defense = (p.doctrine.defense||1)+0.15; } }
];

const GENERAL_POOL = [
    { id: "g1", name: "Mareşal Yıldırım", atk: 0.12, def: 0.05, trait: "Saldırı" },
    { id: "g2", name: "General Demir", atk: 0.04, def: 0.15, trait: "Savunma" },
    { id: "g3", name: "General Kartal", atk: 0.08, def: 0.08, trait: "Dengeli" },
    { id: "g4", name: "Mareşal Fırtına", atk: 0.15, def: 0.0, trait: "Taarruz" },
    { id: "g5", name: "General Kale", atk: 0.0, def: 0.18, trait: "İstihkam" }
];


function buildShip(type) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    if (typeof ensureStratResources === "function") ensureStratResources(p);
    p.navy = p.navy || { ships: 0, destroyer: 0, cruiser: 0, battleship: 0 };
    const costs = {
        destroyer:  { money: 350, steel: 25, oil: 8,  title: "Muhrip", add: 1 },
        cruiser:    { money: 600, steel: 45, oil: 15, title: "Kruvazör", add: 1 },
        battleship: { money: 1200, steel: 80, oil: 25, title: "Savaş Gemisi", add: 1 }
    };
    const req = costs[type];
    if (!req) return;
    if ((p.money || 0) < req.money || (p.strat.steel || 0) < req.steel || (p.strat.oil || 0) < req.oil) {
        log("Deniz birimi için yetersiz kaynak (para/çelik/petrol).", "text-red-500");
        return;
    }
    p.money -= req.money;
    p.strat.steel -= req.steel;
    p.strat.oil -= req.oil;
    p.navy[type] = (p.navy[type] || 0) + req.add;
    p.navy.ships = (p.navy.ships || 0) + req.add;
    log("🚢 " + req.title + " denize indi. Filo: " + p.navy.ships, "text-blue-300");
    try { sfx.playBuild(); } catch (e) {}
    if (typeof updateHUD === "function") updateHUD();
    if (typeof renderMilitaryTab === "function") renderMilitaryTab();
}

function ensureResearchState(p) {
    if (!p.research) p.research = { completed: [], active: null, progress: 0 };
    if (!p.doctrine) p.doctrine = { inf: 1, arm: 1, air: 1, attack: 1, defense: 1 };
    if (!p.generals) p.generals = { owned: ["g1", "g3"], assigned: null };
}

function renderResearchTab() {
    const p = GameState.countries[GameState.player];
    ensureResearchState(p);
    const activeEl = document.getElementById("research-active");
    const list = document.getElementById("research-list");
    if (!list) return;
    if (p.research.active) {
        const r = RESEARCH_TREE.find(x => x.id === p.research.active);
        activeEl.innerHTML = `🔬 ${r?.title || p.research.active}: <span class="text-cyan-400">${p.research.progress}%</span>`;
    } else activeEl.innerHTML = "Aktif proje yok";

    const era = typeof getTechEra === "function" ? getTechEra() : 3;
    list.innerHTML = RESEARCH_TREE.map(r => {
        const locked = (r.minEra || 1) > era;
        const done = p.research.completed.includes(r.id);
        const active = p.research.active === r.id;
        return `<div class="p-2 rounded border ${locked ? "border-slate-800 opacity-50" : done ? "border-emerald-700 bg-emerald-950/30" : active ? "border-cyan-600 bg-cyan-950/30" : "border-slate-700 bg-slate-900"} text-xs">
            <div class="flex justify-between"><span class="font-bold text-slate-200">${r.title}</span><span class="text-slate-500">${r.cat}</span></div>
            <p class="text-[10px] text-slate-400">${r.desc} · ${r.weeks} hafta · ${r.cost}💰</p>
            ${locked ? '<span class="text-red-400 text-[10px]">Bu teknoloji bu çağda mevcut değil!</span>' :
              done ? '<span class="text-emerald-400 text-[10px]">Tamamlandı</span>' :
              active ? '<span class="text-cyan-400 text-[10px]">Araştırılıyor...</span>' :
              `<button onclick="startResearch('${r.id}')" class="mt-1 px-2 py-1 bg-slate-800 hover:bg-cyan-900 border border-slate-600 rounded text-[10px] font-bold">Başlat</button>`}
        </div>`;
    }).join("");

    const gList = document.getElementById("generals-list");
    if (gList) {
        gList.innerHTML = GENERAL_POOL.filter(g => p.generals.owned.includes(g.id)).map(g => {
            const assigned = p.generals.assigned === g.id;
            return `<div class="flex justify-between items-center p-2 bg-slate-900 border border-slate-700 rounded text-xs">
                <div><span class="font-bold">${g.name}</span> <span class="text-slate-500">(${g.trait})</span><br>
                <span class="text-[10px] text-red-400">ATK +${Math.round(g.atk*100)}%</span>
                <span class="text-[10px] text-blue-400 ml-2">DEF +${Math.round(g.def*100)}%</span></div>
                <button onclick="assignGeneral('${g.id}')" class="px-2 py-1 ${assigned ? "bg-cyan-800 border-cyan-500" : "bg-slate-800 border-slate-600"} border rounded text-[10px] font-bold">${assigned ? "Atandı ✓" : "Cepheye Ata"}</button>
            </div>`;
        }).join("") || `<div class="text-slate-500 text-xs">General yok</div>`;
    }
}

function startResearch(id) {
    const p = GameState.countries[GameState.player];
    ensureResearchState(p);
    const r = RESEARCH_TREE.find(x => x.id === id);
    if (!r || p.research.completed.includes(id) || p.research.active) {
        if (p.research.active) log("Zaten aktif araştırma var.", "text-yellow-400");
        return;
    }
    const era = typeof getTechEra === "function" ? getTechEra() : 3;
    if ((r.minEra || 1) > era) {
        log("⛔ Bu teknoloji bu çağda mevcut değil!", "text-red-500");
        return;
    }
    if (p.money < r.cost) { log("Araştırma için yetersiz hazine.", "text-red-500"); return; }
    p.money -= r.cost;
    p.research.active = id;
    p.research.progress = 0;
    log(`🔬 Araştırma başladı: ${r.title}`, "text-cyan-400");
    updateHUD();
    renderResearchTab();
}

function processResearch() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    ensureResearchState(p);
    if (!p.research.active) return;
    const r = RESEARCH_TREE.find(x => x.id === p.research.active);
    if (!r) return;
    p.research.progress += Math.max(0.5, 100 / (r.weeks * 7)); // günlük
    if (p.research.progress >= 100) {
        r.effect(p);
        p.research.completed.push(r.id);
        log(`🔬 Araştırma tamamlandı: ${r.title}`, "text-emerald-400 font-bold");
        p.research.active = null;
        p.research.progress = 0;
        sfx.playBlip();
    }
}

function assignGeneral(gid) {
    const p = GameState.countries[GameState.player];
    ensureResearchState(p);
    p.generals.assigned = gid;
    const g = GENERAL_POOL.find(x => x.id === gid);
    log(`⭐ ${g?.name} cephe komutanlığına atandı.`, "text-yellow-400");
    renderResearchTab();
}

function getGeneralBonus() {
    const p = GameState.countries[GameState.player];
    if (!p?.generals?.assigned) return { atk: 1, def: 1 };
    const g = GENERAL_POOL.find(x => x.id === p.generals.assigned);
    if (!g) return { atk: 1, def: 1 };
    return { atk: 1 + g.atk, def: 1 + g.def };
}

function takeReparations(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    if (!target || !player) return;
    const gold = Math.floor((target.money || 0) * 0.4) + 200;
    target.money = Math.max(0, (target.money || 0) - gold);
    player.money += gold;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[targetIso] = Math.max(-100, (GameState.relations[targetIso] || -80) + 15);
    log(`💰 Savaş tazminatı: ${target.name} → +${gold} hazine`, "text-yellow-400 font-bold");
    document.getElementById("territory-demand-modal")?.remove();
    updateHUD();
}

