
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
// Aktif harita: assets/maps/1081/
const MAP_PACK_ID = "1081";
const MAP_PACK_BASE = "./assets/maps/" + MAP_PACK_ID + "/";
const MAP_JSON_URL = MAP_PACK_BASE + "map.json";
const PROVINCE_DATA_URL = MAP_PACK_BASE + "PROVINCE_DATA.json";
const SCENARIOS_DIR = MAP_PACK_BASE + "scenarios/";

// Senaryolar SADECE diskten — gömülü veri YOK
var SCENARIOS = {};
window.SCENARIOS = SCENARIOS;

/**
 * assets/maps/1081/scenarios/index.json + modern.json / ww1.json / ww2.json
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
                this.init();
                if (!this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    this.playTone(440, now, 0.12);
                    this.playTone(554, now + 0.12, 0.12);
                    this.playTone(659, now + 0.24, 0.12);
                    this.playTone(880, now + 0.36, 0.35);
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
                this.init(); if (!this.ctx) return;
                try {
                    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                    o.type = "square"; o.connect(g); g.connect(this.ctx.destination);
                    o.frequency.setValueAtTime(600, this.ctx.currentTime);
                    o.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.25);
                    g.gain.setValueAtTime(0.05, this.ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
                    o.start(); o.stop(this.ctx.currentTime + 0.3);
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
"AZE": {name: "Azerbaycan", flag: "az", color: "#0369a1", ideology: "Milliyetçilik", pop: 10000000, civFactories: 16, milFactories: 12, money: 6500, manpower: 180000, divisions: { inf: 10, art: 4, arm: 3 },
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
        if (typeof mapEditorOpen !== "undefined" && mapEditorOpen &&
            typeof editorBrushMode !== "undefined" && editorBrushMode) {
            return event.type === "wheel";
        }
        return !event.ctrlKey && !event.button;
    })
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
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
            const hatchId = ensureOccupierHatch(owner, occupier);
            path.style("fill", "url(#" + hatchId + ")");
            path.classed("prov-occupied", true);
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
          class="w-full py-2 bg-amber-900/80 hover:bg-amber-800 border border-amber-600 rounded text-[11px] font-bold">⬆ Altyapı Geliştir</button>` : `<div class="text-[10px] text-slate-500 italic">Yalnızca kendi eyaletlerinizde yatırım yapılabilir.</div>`}
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
    if (player && !String(target.name).includes("Yönetimindeki")) {
        target.name = `${player.name} Yönetimindeki ${target.name}`;
    }

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
                    log("Senaryo dosyaları yüklenemedi (assets/maps/1081/scenarios/).", "text-red-400");
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
            document.getElementById("hud-flag").src = `https://flagcdn.com/w40/${player.flag}.png`;
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
        msg: "🤖 Grok seni izliyor… (+3 Teknoloji Çağı puanı hissi, +8000 hazine)",
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
    if (reason === "rebel") {
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
        saveVersion: 5,
        timestamp: Date.now()
    };
    
    try {
      localStorage.setItem(GameState.saveSlot, JSON.stringify(saveData));
      localStorage.setItem(GameState.saveSlot + "_meta", JSON.stringify({
        version: 5, player: GameState.player, date: saveData.date, scenarioId: saveData.scenarioId, ts: Date.now()
      }));
      log("OYUN KAYDEDİLDİ (v5)", "text-emerald-400");
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

function emergencyMobilization() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const now = GameState.date?.getTime?.() || Date.now();
    if (GameState._lastEmergency && (now - GameState._lastEmergency) < 30 * 24 * 3600 * 1000) {
        log("Acil seferberlik soğumada (30 gün).", "text-yellow-400");
        return;
    }
    const easy = GameState.difficulty === "easy";
    const cost = easy ? 80 : 200;
    if (p.money < cost) { log(`Acil seferberlik: ${cost}💰 gerekli.`, "text-red-500"); return; }
    p.money -= cost;
    const mp = easy ? 45000 : 20000;
    const guns = easy ? 4000 : 1500;
    p.manpower = (p.manpower || 0) + mp;
    p.stockpile = p.stockpile || {};
    p.stockpile.guns = (p.stockpile.guns || 0) + guns;
    if (easy) {
        p.divisions = p.divisions || { inf: 0, art: 0, arm: 0 };
        p.divisions.inf = (p.divisions.inf || 0) + 2;
        p.money += 150; // kolayda kısmen iade / yardım
    }
    GameState._lastEmergency = now;
    log(`🆘 Acil seferberlik: +${mp.toLocaleString()} insan · +${guns} tüfek${easy ? " · +2 piyade" : ""}`, "text-amber-400 font-bold");
    try { sfx.playAlert(); } catch(e){}
    updateHUD();
    if (typeof renderMilitaryTab === "function") renderMilitaryTab();
}

function importStrategicResource(res) {
    const p = GameState.countries[GameState.player];
    ensureStratResources(p);
    const prices = { oil: 40, steel: 30, aluminum: 35, rubber: 25 };
    const price = prices[res] || 40;
    if ((p.civFactories || 0) < 1) { log("İthalat için en az 1 sivil fabrika gerekir (kira).", "text-red-500"); return; }
    if (p.money < price * 5) { log("İthalat için yetersiz hazine.", "text-red-500"); return; }
    // 1 sivil fabrika "kiralanmış" gibi: verim düşmez ama para gider
    p.money -= price * 5;
    p.strat[res] = (p.strat[res] || 0) + 25;
    log(`🌍 Piyasadan ithal: +25 ${res} (−${price*5}💰, sivil kapasite kullanımı)`, "text-emerald-400");
    updateHUD();
    if (typeof renderMilitaryTab === "function") renderMilitaryTab();
    if (typeof renderEconomyTab === "function") renderEconomyTab();
}

// Gelişmiş AI — savaş, sınır, fabrika, ittifak (aggression ile sınırlı)
function processAITick() {
    const agg = GameState.aiAggression != null ? GameState.aiAggression : 1;
    // Kolayda çok seyrek çalış
    if (GameState.gameOver || Math.random() > (0.25 * agg + 0.15)) return;
    const mapC = typeof getMapCountries === "function" ? getMapCountries() : new Set();
    const ais = Object.keys(GameState.countries).filter(iso => {
        if (iso === GameState.player) return false;
        if (mapC.size && !mapC.has(iso)) return false;
        const c = GameState.countries[iso];
        return c && !c.isCapitulated && !c.isPuppet;
    });
    if (!ais.length) return;
    const iso = ais[Math.floor(Math.random() * ais.length)];
    const c = GameState.countries[iso];
    if (typeof ensureCivAllocation === "function") ensureCivAllocation(c);
    if (typeof ensureStratResources === "function") ensureStratResources(c);

    // AI ekonomik karar (mantıklı üretim — her tur bedava tümen yok)
    if (typeof aiEconomicTick === "function") {
        aiEconomicTick(iso, c);
    } else {
        const aiProdChance = 0.25 * (GameState.aiProdMul || 1);
        if (c.money > 500 && Math.random() < aiProdChance) {
            c.money -= 280;
            if ((c.civFactories||0) < (c.milFactories||0) + 8) c.civFactories = (c.civFactories||0) + 1;
            else c.milFactories = (c.milFactories||0) + 1;
        }
    }

    // Sınır kapatma
    const relP = (GameState.relations && GameState.relations[iso]) || 0;
    if (relP < -40 && Math.random() < 0.08 * agg) {
        c.bordersClosed = true;
        if (typeof pushInboxMessage === "function" && Math.random() < 0.4) {
            pushInboxMessage({ from: iso, type: "warning", text: "Sınırlarımız güvenlik gerekçesiyle kapatılmıştır. Ticaret ve geçiş askıya alındı.", expiresWeeks: 6 });
        }
    } else if (c.bordersClosed && relP > 20 && Math.random() < 0.2) {
        c.bordersClosed = false;
    }

    // AI asla oyuncuya sebepsiz savaş açmaz (kolay/normal)
    // Sadece ilişki ≤ -80 ve gerilim yüksek ve AI çok daha güçlüyse mesaj
    if (relP <= -80 && GameState.globalTension > 65 && Math.random() < 0.02 * agg) {
        const pPower = typeof getCountryPower === "function" ? getCountryPower(GameState.player) : 50;
        const aPower = typeof getCountryPower === "function" ? getCountryPower(iso) : 40;
        // Sadece kara komşusu ise sınır/yığınak uyarısı
        const sharesBorder = (typeof countriesShareBorder === "function")
            ? countriesShareBorder(iso, GameState.player)
            : true;
        if (sharesBorder && aPower > pPower * 1.5 && typeof pushInboxMessage === "function") {
            pushInboxMessage({ from: iso, type: "warning", text: pickMsg("warning") || "Sınırınızdaki askeri yığınak kabul edilemez.", expiresWeeks: 5 });
        }
        // Savaş ilanı: sadece hard + çok güçlü
        const canThreatenPlayer = ["hard", "veryhard", "impossible"].includes(GameState.difficulty);
        if (canThreatenPlayer && aPower > pPower * 1.8 && Math.random() < (GameState.difficulty === "impossible" ? 0.15 : 0.08)) {
            if (!(GameState.activeWars || []).some(w => w.target === GameState.player || w.attacker === iso)) {
                log(`⚠️ ${c.name} size karşı gerilim tırmandırıyor.`, "text-orange-400");
            }
        }
    }

    // AI-AI baskı / savaş tehdidi
    if (GameState.globalTension > 55 && Math.random() < 0.08 * agg) {
        const victims = ais.filter(v => v !== iso);
        if (victims.length) {
            const v = victims[Math.floor(Math.random() * victims.length)];
            const vc = GameState.countries[v];
            const cDiv = Object.values(c.divisions || {}).reduce((a, b) => a + b, 0);
            const vDiv = Object.values(vc.divisions || {}).reduce((a, b) => a + b, 0);
            if (cDiv > vDiv * 1.25) {
                GameState.globalTension = Math.min(100, GameState.globalTension + 3);
                if (Math.random() < 0.25) {
                    log(`🌍 AI KRİZ: ${c.name}, ${vc.name} üzerinde askeri baskı kuruyor.`, "text-orange-400");
                }
                // Çok agresif: AI vs AI savaş skoru (oyuncu paneline düşmez, gerilim artar)
                if (GameState.globalTension > 70 && Math.random() < 0.15) {
                    GameState.globalTension = Math.min(100, GameState.globalTension + 5);
                    log(`⚔️ Bölgesel savaş: ${c.name} × ${vc.name} (gerilim yükseldi)`, "text-red-400");
                    c.money = Math.max(0, c.money - 80);
                    vc.money = Math.max(0, (vc.money || 0) - 60);
                }
            }
        }
    }

    // Oyuncuya karşı: düşmanlıkta sınır + tehdit mesajı
    if (relP <= -80 && Math.random() < 0.08 && typeof pushInboxMessage === "function") {
        pushInboxMessage({ from: iso, type: "insult", text: pickMsg("insult") || "Sınırlarınızı gözetliyoruz.", expiresWeeks: 4 });
    }

    if (GameState.globalTension > 40 && Math.random() < 0.05 && typeof pushInboxMessage === "function") {
        if (relP > 10) {
            pushInboxMessage({ from: iso, type: "alliance", text: pickMsg("alliance"), expiresWeeks: 6 });
        } else if (relP > -20 && Math.random() < 0.5) {
            pushInboxMessage({ from: iso, type: "nap", text: pickMsg("nap") || "Saldırmazlık paktı öneriyoruz.", expiresWeeks: 6 });
        }
    }
}

// Seçimli olay pop-up (RANDOM_EVENTS ile çakışmasın diye ayrı isim)
const CHOICE_EVENTS = [
    {
        id: "strike_choice", title: "İşçi Grevi",
        text: "Büyük sanayi bölgelerinde grev başladı. Üretim düşebilir.",
        choices: [
            { label: "Müzakere et (−150💰, +üretim)", effect: (p) => { p.money = Math.max(0, p.money - 150); p.factoryEfficiency = Math.min(1.5, (p.factoryEfficiency || 1) + 0.05); } },
            { label: "Bastır (+gerilim, −insan gücü)", effect: (p) => { GameState.globalTension = Math.min(100, GameState.globalTension + 5); p.manpower = Math.max(0, p.manpower - 5000); } }
        ]
    },
    {
        id: "oilboom", title: "Petrol Keşfi",
        text: "Yeni petrol sahaları bulundu. Nasıl değerlendirilecek?",
        choices: [
            { label: "Devlet kontrolü (+petrol, +para)", effect: (p) => { if (typeof ensureStratResources === "function") ensureStratResources(p); p.strat.oil += 40; p.money += 120; } },
            { label: "Yabancı yatırım (+sivil fabrika)", effect: (p) => { p.civFactories += 1; } }
        ]
    },
    {
        id: "spy", title: "Casus Skandalı",
        text: "Büyükelçilikte casus iddiası. Diplomasi geriliyor.",
        choices: [
            { label: "İnkâr et (ilişki −10 rastgele)", effect: () => {
                const keys = Object.keys(GameState.relations || {});
                if (keys.length) { const k = keys[Math.floor(Math.random() * keys.length)]; GameState.relations[k] = Math.max(-100, (GameState.relations[k] || 0) - 10); }
            }},
            { label: "Özür + tazminat (−100💰)", effect: (p) => { p.money = Math.max(0, p.money - 100); } }
        ]
    },
    {
        id: "parade", title: "Zafer Geçidi",
        text: "Ordu moral için geçit töreni talep ediyor.",
        choices: [
            { label: "Düzenle (−80💰, +insan gücü)", effect: (p) => { p.money = Math.max(0, p.money - 80); p.manpower += 8000; } },
            { label: "Reddet", effect: () => {} }
        ]
    },
    {
        id: "techleak", title: "Teknoloji Sızıntısı",
        text: "Araştırma laboratuvarından bilgi sızdı.",
        choices: [
            { label: "Güvenliği sıkılaştır (−120💰)", effect: (p) => { p.money = Math.max(0, p.money - 120); } },
            { label: "Görmezden gel (gerilim +3)", effect: () => { GameState.globalTension = Math.min(100, GameState.globalTension + 3); } }
        ]
    }
];

function processChoiceEvents() {
    if (GameState.gameOver || document.getElementById("event-modal")) return;
    if (GameState.eventsEnabled === false) return;
    if (GameState.settings && GameState.settings.eventsEnabled === false) return;
    if (Math.random() > 0.025) return;
    const ev = CHOICE_EVENTS[Math.floor(Math.random() * CHOICE_EVENTS.length)];
    showEventModal(ev);
}

function showEventModal(ev) {
    document.getElementById("event-modal")?.remove();
    if (window._eventAutoTimer) clearTimeout(window._eventAutoTimer);
    const modal = document.createElement("div");
    modal.id = "event-modal";
    modal.className = "fixed inset-0 z-[10050] flex items-center justify-center bg-black/75 p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border-2 border-amber-600 rounded-xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <button onclick="resolveEventChoice('${ev.id}', 0)" class="absolute top-2 left-2 w-7 h-7 rounded bg-slate-800 hover:bg-red-900 border border-slate-600 text-slate-300 text-sm font-bold z-10" title="Kapat (varsayılan)">✕</button>
            <div class="p-3 bg-slate-950 border-b border-slate-700 pl-10">
                <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider">📜 Olay: ${ev.title}</h2>
                <p class="text-[9px] text-slate-500 mt-0.5">Karar verilmezse varsayılan seçenek uygulanır</p>
            </div>
            <div class="p-4 text-xs text-slate-300 leading-relaxed">${ev.text}</div>
            <div class="p-3 space-y-2 border-t border-slate-800">
                ${ev.choices.map((c, i) => `
                    <button onclick="resolveEventChoice('${ev.id}', ${i})" class="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-[11px] font-bold text-left px-3">
                        ${c.label}
                    </button>
                `).join("")}
            </div>
        </div>`;
    document.body.appendChild(modal);
    GameState._pendingEvent = ev;
    try { sfx.playAlert(); } catch(e){}
    // 10 sn → varsayılan (ilk) seçenek
    const autoMs = (ev && ev._historical) ? 22000 : 10000;
    window._eventAutoTimer = setTimeout(() => {
        if (document.getElementById("event-modal")) resolveEventChoice(ev.id, 0);
    }, autoMs);
}

function resolveEventChoice(evId, idx) {
    if (window._eventAutoTimer) { clearTimeout(window._eventAutoTimer); window._eventAutoTimer = null; }
    const ev = GameState._pendingEvent || CHOICE_EVENTS.find(e => e.id === evId);
    document.getElementById("event-modal")?.remove();
    if (!ev) return;
    const choice = ev.choices[idx];
    const p = GameState.countries[GameState.player];
    if (choice && choice.effect) choice.effect(p);
    log(`📜 Olay kararı: ${ev.title} → ${choice?.label || "?"}`, "text-amber-400");
    GameState._pendingEvent = null;
    try { sfx.playClick(); } catch(e){}
    updateHUD();
}

function sellLandTo(iso) {
    if (typeof isHostileToward === "function" && isHostileToward(iso)) {
        log("Düşmanlığa arazi satılmaz.", "text-red-500");
        return;
    }
    const myProvs = Object.keys(provinceOwners).filter(p => provinceOwners[p] === GameState.player);
    if (myProvs.length < 2) { log("Satılacak fazla eyalet yok.", "text-red-500"); return; }
    const sell = myProvs[myProvs.length - 1];
    provinceOwners[sell] = iso;
    const price = 400;
    GameState.countries[GameState.player].money += price;
    if (GameState.countries[iso]) GameState.countries[iso].money = Math.max(0, (GameState.countries[iso].money || 0) - price);
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.min(100, (GameState.relations[iso] || 0) + 12);
    log(`🗺️ Arazi satıldı: ${sell} → ${GameState.countries[iso]?.name} (+${price}💰)`, "text-emerald-400");
    refreshMapColors();
    updateHUD();
    renderDiplomacyTab();
}

function launchNuclearStrike(iso) {
    const nuc = GameState.nuclear || {};
    if (!nuc.unlocked || (nuc.warheads || 0) < 1) {
        log("Nükleer savaş başlığı yok. Programı tamamlayın.", "text-red-500");
        return;
    }
    if (!confirm(`${GameState.countries[iso]?.name} hedefine nükleer saldırı? Gerilim patlar.`)) return;
    nuc.warheads--;
    GameState.globalTension = Math.min(100, GameState.globalTension + 40);
    const t = GameState.countries[iso];
    if (t) {
        t.civFactories = Math.max(0, Math.floor(t.civFactories * 0.6));
        t.milFactories = Math.max(0, Math.floor(t.milFactories * 0.5));
        t.manpower = Math.max(0, Math.floor((t.manpower || 0) * 0.7));
        t.divisions = t.divisions || {};
        Object.keys(t.divisions).forEach(k => { t.divisions[k] = Math.max(0, Math.floor(t.divisions[k] * 0.5)); });
    }
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = -100;
    Object.keys(GameState.countries).forEach(o => {
        if (o !== GameState.player && o !== iso) {
            GameState.relations[o] = Math.max(-100, (GameState.relations[o] || 0) - 25);
        }
    });
    sfx.playSiren();
    log(`☢️ NÜKLEER SALDIRI: ${t?.name} yerle bir oldu. Dünya tepki gösterdi.`, "text-red-500 font-black");
    updateHUD();
    renderDiplomacyTab();
}

// ====================== FORMABLE NATIONS ======================
const FORMABLES = [
    { id: "OTT", name: "Osmanlı İmparatorluğu", color: "#8B0000", flag: "tr", need: ["TUR"], optional: ["SYR","IRQ","LBN","JOR","ISR","EGY","SAU","YEM","GRC","BGR"], minExtra: 2 },
    { id: "ROM", name: "Roma İmparatorluğu", color: "#7c2d12", flag: "it", need: ["ITA"], optional: ["ESP","FRA","GRC","TUN","HRV","ALB"], minExtra: 3 },
    { id: "ARA", name: "Arap Birliği", color: "#065f46", flag: "sa", need: ["SAU"], optional: ["EGY","IRQ","SYR","JOR","YEM","ARE","KWT","QAT","OMN"], minExtra: 3 },
    { id: "EUR", name: "Avrupa Federasyonu", color: "#1e3a8a", flag: "eu", need: ["FRA","DEU"], optional: ["ITA","ESP","NLD","BEL","POL","AUT"], minExtra: 2 }
];

function getOwnedFormableCount(formable) {
    const player = GameState.player;
    let n = 0;
    formable.need.forEach(iso => {
        if (iso === player || (GameState.countries[iso]?.isPuppet && GameState.countries[iso]?.overlord === player) ||
            Object.values(provinceOwners).includes(iso) === false && iso === player) n++;
        // oyuncu ISO veya o ülkenin tüm eyaletleri bizde
        const theirProvs = Object.keys(provinceOwners).filter(p => provinceOwners[p] === iso);
        const ourOwned = theirProvs.filter(p => provinceOwners[p] === player);
        if (iso === player) n++;
        else if (theirProvs.length && ourOwned.length === theirProvs.length) n++;
    });
    // simpler: need countries must be player or puppet
    let needOk = formable.need.every(iso => {
        if (iso === GameState.player) return true;
        const c = GameState.countries[iso];
        return c && (c.isPuppet && c.overlord === GameState.player || c.isCapitulated && c.occupier === GameState.player);
    });
    let extra = formable.optional.filter(iso => {
        const c = GameState.countries[iso];
        return iso === GameState.player || (c && ((c.isPuppet && c.overlord === GameState.player) || (c.isCapitulated && c.occupier === GameState.player)));
    }).length;
    // also count if player owns provinces of that country majority
    formable.optional.forEach(iso => {
        if (extra) return;
        const provs = Object.keys(provinceOwners).filter(p => {
            // original owner was iso - hard without history; skip
            return false;
        });
    });
    return { needOk, extra, canForm: needOk && extra >= formable.minExtra };
}

function tryFormNation(fid) {
    const f = FORMABLES.find(x => x.id === fid);
    if (!f) return;
    // Basitleştirilmiş: oyuncu need listesindeki ülkelerden biri ise ve ilişkili topraklar varsa
    const player = GameState.countries[GameState.player];
    const needOwned = f.need.every(iso => iso === GameState.player || (GameState.countries[iso]?.overlord === GameState.player));
    const extraCount = f.optional.filter(iso => {
        const c = GameState.countries[iso];
        return c && (c.overlord === GameState.player || c.isCapitulated);
    }).length;
    if (!(needOwned || f.need.includes(GameState.player)) || extraCount < f.minExtra) {
        log(`Formlanamaz: ${f.name} — yeterli toprak/kukla yok (ek +${f.minExtra} gerekli, sizde ${extraCount}).`, "text-red-400");
        return;
    }
    player.name = f.name;
    player.color = f.color;
    player.flag = f.flag.length === 2 ? f.flag : player.flag;
    player.money += 500;
    player.civFactories += 2;
    log(`🏛️ MEDENİYET KURULDU: ${f.name}!`, "text-yellow-400 font-black");
    try { sfx.playVictory(); } catch(e){}
    document.getElementById("hud-country-name").innerText = f.name;
    refreshMapColors();
    updateHUD();
}

// ====================== ADMIN / GOD PANEL ======================
let adminOpen = false;
let adminAuthed = false;

function promptAdmin() {
    if (adminAuthed) { toggleAdminPanel(); return; }
    document.getElementById("admin-auth-modal")?.remove();
    const m = document.createElement("div");
    m.id = "admin-auth-modal";
    m.className = "fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 p-4";
    m.innerHTML = `
        <div class="bg-slate-900 border border-red-700 rounded-xl p-5 w-full max-w-sm">
            <h3 class="text-sm font-black text-red-400 mb-3">🔐 ADMIN ERİŞİM</h3>
            <input id="admin-pass" type="password" placeholder="Şifre" class="w-full bg-slate-950 border border-slate-600 rounded p-2 text-sm mb-3" onkeydown="if(event.key==='Enter')checkAdminPass()">
            <div class="flex gap-2">
                <button onclick="checkAdminPass()" class="flex-1 py-2 bg-red-800 hover:bg-red-700 rounded font-bold text-xs">Giriş</button>
                <button onclick="document.getElementById('admin-auth-modal').remove()" class="px-3 py-2 bg-slate-700 rounded text-xs">İptal</button>
            </div>
        </div>`;
    document.body.appendChild(m);
    setTimeout(() => document.getElementById("admin-pass")?.focus(), 50);
}

function checkAdminPass() {
    const v = document.getElementById("admin-pass")?.value || "";
    if (v === "agaoglu") {
        adminAuthed = true;
        document.getElementById("admin-auth-modal")?.remove();
        toggleAdminPanel();
        log("God mode aktif.", "text-red-400 font-bold");
    } else {
        alert("Yanlış şifre");
    }
}

function toggleAdminPanel() {
    if (document.getElementById("admin-god-panel")) {
        document.getElementById("admin-god-panel").remove();
        adminOpen = false;
        return;
    }
    adminOpen = true;
    const countries = Object.keys(GameState.countries).map(iso =>
        `<option value="${iso}">${GameState.countries[iso].name}</option>`
    ).join("");
    const panel = document.createElement("div");
    panel.id = "admin-god-panel";
    panel.className = "fixed top-16 right-4 z-[10055] w-[360px] max-h-[80vh] overflow-y-auto bg-slate-950 border-2 border-red-700 rounded-xl shadow-2xl p-4 text-xs space-y-3";
    panel.innerHTML = `
        <div class="flex justify-between items-center border-b border-slate-700 pb-2">
            <h3 class="font-black text-red-400">⚡ GOD PANEL</h3>
            <button onclick="toggleAdminPanel()" class="text-slate-400 hover:text-white text-lg">✕</button>
        </div>
        <div>
            <label class="text-slate-500">Hedef ülke</label>
            <select id="god-target" class="w-full bg-slate-900 border border-slate-600 rounded p-2 mt-1">${countries}</select>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <button onclick="godAdd('money',5000)" class="py-2 bg-yellow-900 border border-yellow-700 rounded font-bold">+5K 💰</button>
            <button onclick="godAdd('manpower',50000)" class="py-2 bg-slate-800 border border-slate-600 rounded font-bold">+50K 👤</button>
            <button onclick="godAdd('civ',5)" class="py-2 bg-slate-800 border border-slate-600 rounded font-bold">+5 Sivil</button>
            <button onclick="godAdd('mil',5)" class="py-2 bg-slate-800 border border-slate-600 rounded font-bold">+5 Askeri</button>
            <button onclick="godAddDivs()" class="py-2 bg-cyan-900 border border-cyan-700 rounded font-bold">+10 Tümen</button>
            <button onclick="godFinishResearch()" class="py-2 bg-purple-900 border border-purple-700 rounded font-bold">Araştırma ✓</button>
            <button onclick="godFinishFocus()" class="py-2 bg-indigo-900 border border-indigo-700 rounded font-bold">Odak ✓</button>
            <button onclick="godNukeUnlock()" class="py-2 bg-yellow-950 border border-yellow-600 rounded font-bold">☢️ Nükleer</button>
            <button onclick="godForceWar()" class="py-2 bg-red-900 border border-red-600 rounded font-bold">Savaş İlân</button>
            <button onclick="godForcePeace()" class="py-2 bg-emerald-900 border border-emerald-600 rounded font-bold">Barış Zorla</button>
        </div>
        <div class="border-t border-slate-800 pt-2">
            <p class="text-slate-500 mb-1">Oyuncu mesajı → AI cevap</p>
            <select id="god-chat-tpl" class="w-full bg-slate-900 border border-slate-600 rounded p-2 mb-1">
                <option value="alliance">Müttefik olalım mı?</option>
                <option value="trade">Ticaret anlaşması?</option>
                <option value="nap">Saldırmazlık paktı?</option>
                <option value="threat">Sınırlarınızı ihlal etmeyin</option>
                <option value="greet">Dostluk mesajı</option>
            </select>
            <button onclick="godSendAIChat()" class="w-full py-2 bg-cyan-800 hover:bg-cyan-700 rounded font-bold">Mesaj Gönder (AI cevaplar)</button>
        </div>
        <div class="border-t border-slate-800 pt-2 space-y-1">
            <button onclick="tryFormNation('OTT')" class="w-full py-1.5 bg-slate-800 border border-slate-600 rounded">Form: Osmanlı</button>
            <button onclick="tryFormNation('ROM')" class="w-full py-1.5 bg-slate-800 border border-slate-600 rounded">Form: Roma</button>
            <button onclick="tryFormNation('ARA')" class="w-full py-1.5 bg-slate-800 border border-slate-600 rounded">Form: Arap Birliği</button>
            <button onclick="tryFormNation('EUR')" class="w-full py-1.5 bg-slate-800 border border-slate-600 rounded">Form: Avrupa Fed.</button>
        </div>
    `;
    document.body.appendChild(panel);
}

function godTarget() {
    return document.getElementById("god-target")?.value || GameState.player;
}
function godAdd(type, n) {
    const c = GameState.countries[godTarget()];
    if (!c) return;
    if (type === "money") c.money += n;
    if (type === "manpower") c.manpower += n;
    if (type === "civ") c.civFactories += n;
    if (type === "mil") c.milFactories += n;
    try { sfx.playBuild(); } catch(e){}
    updateHUD();
    log(`GOD: ${c.name} +${type} ${n}`, "text-red-400");
}
function godAddDivs() {
    const c = GameState.countries[godTarget()];
    if (!c) return;
    c.divisions = c.divisions || { inf: 0, art: 0, arm: 0 };
    c.divisions.inf = (c.divisions.inf || 0) + 6;
    c.divisions.art = (c.divisions.art || 0) + 2;
    c.divisions.arm = (c.divisions.arm || 0) + 2;
    updateHUD();
    log(`GOD: ${c.name} +10 tümen`, "text-red-400");
}
function godFinishResearch() {
    const c = GameState.countries[GameState.player];
    if (typeof ensureResearchState === "function") ensureResearchState(c);
    if (typeof RESEARCH_TREE !== "undefined") {
        RESEARCH_TREE.forEach(r => {
            if (!c.research.completed.includes(r.id)) {
                r.effect(c);
                c.research.completed.push(r.id);
            }
        });
        c.research.active = null;
        c.research.progress = 0;
    }
    log("GOD: Tüm araştırmalar tamam", "text-red-400");
}
function godFinishFocus() {
    const c = GameState.countries[GameState.player];
    if (c.activeFocus) {
        c.focusProgress = 100;
        log("GOD: Odak %100", "text-red-400");
    }
}
function godNukeUnlock() {
    GameState.nuclear = GameState.nuclear || {};
    GameState.nuclear.unlocked = true;
    GameState.nuclear.progress = 100;
    GameState.nuclear.warheads = (GameState.nuclear.warheads || 0) + 3;
    log("GOD: Nükleer +3 başlık", "text-red-400");
}
function godForceWar() {
    const t = godTarget();
    if (t === GameState.player) return;
    if (typeof declareWar === "function") declareWar(t);
}
function godForcePeace() {
    GameState.activeWars = (GameState.activeWars || []).filter(w => w.target !== godTarget());
    log("GOD: Barış zorlandı", "text-red-400");
    if (typeof renderActiveWarsDisplay === "function") renderActiveWarsDisplay();
}
function godSendAIChat() {
    const t = godTarget();
    const tpl = document.getElementById("god-chat-tpl")?.value || "greet";
    const rel = (GameState.relations && GameState.relations[t]) || 0;
    const name = GameState.countries[t]?.name || t;
    const playerMsgs = {
        alliance: "Müttefik olalım mı?",
        trade: "Ticaret anlaşması yapalım mı?",
        nap: "Saldırmazlık paktı imzalayalım mı?",
        threat: "Sınırlarınızı ihlal etmeyin.",
        greet: "Dostluk ve işbirliği dileklerimizle."
    };
    log(`📤 Biz → ${name}: ${playerMsgs[tpl]}`, "text-cyan-400");
    // AI kural tabanlı cevap
    let reply = "Not edildi.";
    if (tpl === "alliance") {
        if (rel >= 40) reply = "İttifak teklifinizi olumlu karşılıyoruz.";
        else if (rel >= 10) reply = "Önce ilişkileri güçlendirelim, sonra konuşuruz.";
        else reply = "Şu an ittifak mümkün değil.";
        if (rel >= 40 && typeof proposeAlliance === "function") { /* already proposed via text */ }
    } else if (tpl === "trade") {
        reply = rel > -20 ? "Ticaret masasına oturabiliriz." : "Ticaret için güven yetersiz.";
    } else if (tpl === "nap") {
        reply = rel > -40 ? "Saldırmazlık kabul edilebilir." : "Reddediyoruz.";
    } else if (tpl === "threat") {
        reply = rel <= -50 ? "Tehditleriniz boşa. Hazırız." : "Uyarıyı aldık. Gerilimi tırmandırmayın.";
    } else {
        reply = rel >= 0 ? "Selamınızı aldık. Dostlukla." : "Mesajınız kayda geçti.";
    }
    setTimeout(() => {
        log(`📥 ${name} → Biz: ${reply}`, "text-yellow-400");
        try { sfx.playMessage(); } catch(e){}
        if (typeof pushInboxMessage === "function") {
            pushInboxMessage({ from: t, type: "greet", text: reply, expiresWeeks: 14 });
        }
    }, 600);
}

// admin yazılınca
document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select")) {
        // input içinde "admin" tamamlanınca
        return;
    }
});
// Konsole / chat: window type admin
(function setupAdminTrigger() {
    let buf = "";
    document.addEventListener("keypress", (e) => {
        if (e.target.matches("input,textarea,select")) return;
        buf += e.key.toLowerCase();
        if (buf.length > 10) buf = buf.slice(-10);
        if (buf.endsWith("admin")) {
            buf = "";
            promptAdmin();
        }
    });
})();

// ====================== EDİTÖR PANELİ ======================

let editorOpen = false;

function toggleEditor() {
    if (editorOpen) {
        document.getElementById("editor-panel").remove();
        editorOpen = false;
        return;
    }

    editorOpen = true;

    const editorHTML = `
    <div id="editor-panel" class="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center">
        <div class="bg-slate-900 border border-slate-700 rounded-xl w-[90%] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-950">
                <h2 class="text-xl font-black text-cyan-400">⚙️ GELİŞTİRİCİ EDİTÖRÜ</h2>
                <button onclick="toggleEditor()" class="text-red-500 hover:text-red-400 text-2xl">✕</button>
            </div>
            
            <div class="p-6 flex-1 overflow-auto">
                <div class="grid grid-cols-2 gap-6">
                    <!-- ÜLKE EDİTÖRÜ -->
                    <div class="bg-slate-800 p-5 rounded-xl">
                        <h3 class="font-bold text-yellow-400 mb-4">ÜLKE EDİTÖRÜ</h3>
                        <select id="edit-country-select" class="w-full bg-slate-900 p-3 rounded mb-4"></select>
                        <div class="space-y-3 text-sm">
                            <input id="edit-name" placeholder="Ülke Adı" class="w-full bg-slate-900 p-3 rounded">
                            <input id="edit-color" type="color" class="w-full h-12 bg-slate-900 rounded">
                            <input id="edit-pop" type="number" placeholder="Nüfus" class="w-full bg-slate-900 p-3 rounded">
                            <input id="edit-civ" type="number" placeholder="Sivil Fabrika" class="w-full bg-slate-900 p-3 rounded">
                            <input id="edit-mil" type="number" placeholder="Askeri Fabrika" class="w-full bg-slate-900 p-3 rounded">
                        </div>
                    </div>

                    <!-- BAYRAK EDİTÖRÜ -->
                    <div class="bg-slate-800 p-5 rounded-xl">
                        <h3 class="font-bold text-yellow-400 mb-4">BAYRAK EDİTÖRÜ</h3>
                        <input id="edit-flag-url" placeholder="Bayrak URL'si[](https://...)" class="w-full bg-slate-900 p-3 rounded mb-4">
                        <button onclick="applyFlagChange()" class="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold">Bayrak Değiştir</button>
                    </div>
                </div>
            </div>

            <div class="p-4 border-t border-slate-700 bg-slate-950 flex gap-3">
                <button onclick="exportFullHTML()" class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 font-black rounded-xl">📥 GÜNCELLENMİŞ HTML İNDİR</button>
                <button onclick="toggleEditor()" class="flex-1 py-4 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl">KAPAT</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', editorHTML);
    populateCountrySelect();
    // Ülke seçildiğinde verileri doldur
    document.getElementById("edit-country-select").addEventListener("change", loadCountryData);
    // İlk yüklemede de doldur
    setTimeout(loadCountryData, 100);
}

function populateCountrySelect() {
    const select = document.getElementById("edit-country-select");
    select.innerHTML = "";
    Object.keys(GameState.countries).forEach(iso => {
        const c = GameState.countries[iso];
        const opt = document.createElement("option");
        opt.value = iso;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

function applyFlagChange() {
    const iso = document.getElementById("edit-country-select").value;
    const url = document.getElementById("edit-flag-url").value.trim();
    if (iso && url) {
        GameState.countries[iso].flag = url; // geçici
        log(`Bayrak güncellendi: ${iso}`, "text-cyan-400");
    }
}

function exportFullHTML() {
// Seçili ülkenin verilerini kaydet
    const iso = document.getElementById("edit-country-select").value;
    if (iso) {
        const country = GameState.countries[iso];
        if (country) {
            country.name = document.getElementById("edit-name").value || country.name;
            country.color = document.getElementById("edit-color").value;
            country.pop = parseInt(document.getElementById("edit-pop").value) || country.pop;
            country.civFactories = parseInt(document.getElementById("edit-civ").value) || country.civFactories;
            country.milFactories = parseInt(document.getElementById("edit-mil").value) || country.milFactories;
        }
    }
    const fullHTML = document.documentElement.outerHTML;
    const blob = new Blob([fullHTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supreme_command_edited.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log("GÜNCEL HTML İNDİRİLDİ", "text-emerald-400");
}

function loadCountryData() {
    const iso = document.getElementById("edit-country-select").value;
    if (!iso) return;
    
    const country = GameState.countries[iso];
    if (!country) return;
    
    document.getElementById("edit-name").value = country.name || "";
    document.getElementById("edit-color").value = country.color || "#dc2626";
    document.getElementById("edit-pop").value = country.pop || 0;
    document.getElementById("edit-civ").value = country.civFactories || 0;
    document.getElementById("edit-mil").value = country.milFactories || 0;
    
    // Bayrak URL'sini de göster
    document.getElementById("edit-flag-url").value = `https://flagcdn.com/w320/${country.flag}.png`;
}

// ====================== HARİTA EDİTÖRÜ ======================
let mapEditorOpen = false;
let editorSelectedCountry = "TUR";

function toggleMapEditor() {
    if (mapEditorOpen) {
        document.getElementById("map-editor-panel")?.remove();
        mapEditorOpen = false;
        return;
    }

    mapEditorOpen = true;

    const panel = document.createElement("div");
    panel.id = "map-editor-panel";
    panel.className = "fixed top-20 right-4 z-[9999] w-80 bg-slate-900 border-2 border-purple-600 rounded-xl shadow-2xl p-4 flex flex-col gap-3";
    
    panel.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-700 pb-2">
            <h3 class="text-sm font-black text-purple-400 uppercase tracking-wider">✏️ Harita Editörü</h3>
            <button onclick="toggleMapEditor()" class="text-red-400 hover:text-red-300 text-lg font-bold">✕</button>
        </div>

        <div>
            <label class="text-[10px] text-slate-400 uppercase font-bold block mb-1">Atanacak Ülke</label>
            <select id="editor-country-select" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-xs font-bold text-slate-200">
                ${Object.keys(GameState.countries).map(iso => 
                    `<option value="${iso}" ${iso === editorSelectedCountry ? "selected" : ""}>${GameState.countries[iso].name}</option>`
                ).join("")}
            </select>
        </div>

        <div class="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800">
            Haritadan eyalete tıkla → seçili ülkeye atanır.<br>
            <span class="text-yellow-400">Şu an seçili:</span> <span id="editor-current-country" class="font-bold text-cyan-400">${GameState.countries[editorSelectedCountry]?.name || "TUR"}</span>
        </div>

        <label class="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
            <input type="checkbox" id="editor-brush-mode" class="accent-purple-500" onchange="editorBrushMode=this.checked;try{svg.call(zoom);}catch(e){};if(typeof log==='function')log(this.checked?'🖌️ Fırça AÇIK — sürükleyerek boya':'🖐️ Fırça KAPALI — harita kaydırma','text-slate-400')">
            <span>🖌️ Fırça modu (sürükle-boya)</span>
        </label>
        <div class="text-[10px] text-slate-500">Palet:
            <div class="flex flex-wrap gap-1 mt-1" id="editor-color-presets"></div>
        </div>
        <div class="flex gap-2">
            <button onclick="exportProvinceOwners()" class="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black rounded">
                📥 JSON İNDİR
            </button>
            <button onclick="clearAllOwners()" class="px-3 py-2.5 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded">
                TEMİZLE
            </button>
        </div>

        <div class="text-[10px] text-slate-500 text-center">
            Toplam atanan: <span id="editor-count" class="text-cyan-400 font-mono">0</span>
        </div>
    `;

    document.body.appendChild(panel);

    // Ülke değişince güncelle
    document.getElementById("editor-country-select").addEventListener("change", (e) => {
        editorSelectedCountry = e.target.value;
        document.getElementById("editor-current-country").innerText = GameState.countries[editorSelectedCountry].name;
    });

    updateEditorCount();
    if (typeof fillEditorColorPresets === "function") fillEditorColorPresets();
    // Fırça: mousedown/mousemove
    if (!window._brushWired) {
        window._brushWired = true;
        svg.on("mousedown.brush", (ev) => {
            if (mapEditorOpen && editorBrushMode) { editorPainting = true; try { ev.preventDefault(); } catch(e){} }
        });
        svg.on("mousemove.brush", (ev) => {
            if (!(mapEditorOpen && editorBrushMode && editorPainting)) return;
            const el = ev.target;
            if (!el || !el.getAttribute) return;
            const name = el.getAttribute("data-name");
            if (name && typeof paintProvince === "function") paintProvince(name, el);
        });
        svg.on("mouseup.brush", () => { editorPainting = false; });
        svg.on("mouseleave.brush", () => { editorPainting = false; });
    }
}

// Eyalet tıklanınca
function handleProvinceClick(event, d) {
    sfx.playBlip();
    const isRightClick = (event.button === 2 || event.which === 3 || event.type === "contextmenu");

    if (window.peaceMode && window.peaceTargetIso) {
        try { event.preventDefault(); event.stopPropagation(); } catch (e) {}
        togglePeaceProvince(d.name);
        return;
    }

    // Editör açıksa
    if (mapEditorOpen) {
        if (isRightClick) {
            event.preventDefault();
            delete provinceOwners[d.name];
            d3.select(event.currentTarget).style("fill", "#1e293b");
            console.log(`🗑️ ${d.name} sahiplik kaldırıldı`);
            updateEditorCount();
            return;
        }
        provinceOwners[d.name] = editorSelectedCountry;
        d3.select(event.currentTarget).style("fill", GameState.countries[editorSelectedCountry].color);
        console.log(`✅ ${d.name} → ${editorSelectedCountry}`);
        updateEditorCount();
        return;
    }

    // Normal oyun
    const owner = getProvinceOwner(d.name);
    GameState.selectedProvince = d.name;
    GameState.selectedCountry = owner;
    console.log("Eyalet:", d.name, "| Sahip:", owner, "| Sağ tık:", isRightClick);
    try { if (typeof trackProvinceSpamEasterEgg === "function") trackProvinceSpamEasterEgg(d.name, isRightClick); } catch (e) {}

    // Eyalet coğrafya / kaynak bilgisi (PROVINCE_DATA)
    const info = typeof getProvinceInfo === "function" ? getProvinceInfo(d.name) : null;
    if (info && info.terrain !== "unknown") {
        const tip = typeof formatProvinceTooltip === "function" ? formatProvinceTooltip(d.name) : d.name;
        log(`📍 ${tip.replace(/\n/g, " · ")}`, "text-cyan-300");
    } else if (!provinceDataReady) {
        log(`📍 ${d.name.replace(/_/g, " ")} · sahip: ${owner} (eyalet verisi yükleniyor…)`, "text-slate-400");
    }

    if (isRightClick) event.preventDefault();
    if (typeof renderProvincePanel === "function") renderProvincePanel();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab(true);
    // Kendi eyaletin → Eyalet sekmesi; yabancı → Diplomasi
    if (owner === GameState.player && !isRightClick) {
        switchTab("province");
    } else {
        switchTab("diplomacy");
    }
}

function updateEditorCount() {
    const count = Object.keys(provinceOwners).length;
    const el = document.getElementById("editor-count");
    if (el) el.innerText = count;
}

function exportProvinceOwners() {
    const data = JSON.stringify(provinceOwners, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "provinceOwners.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log("provinceOwners.json indirildi", "text-emerald-400");
}

function clearAllOwners() {
    if (!confirm("Bütün atamaları silmek istediğine emin misin?")) return;
    for (let key in provinceOwners) delete provinceOwners[key];
    refreshMapColors();
    updateEditorCount();
    log("Bütün eyalet atamaları temizlendi", "text-red-400");
}



// ====================== V21+ MEKANİKLER ======================
// Hazır renk paletleri
const COLOR_PRESETS = [
    { name: "Kırmızı", hex: "#dc2626" },
    { name: "Lacivert", hex: "#1e3a8a" },
    { name: "Yeşil", hex: "#16a34a" },
    { name: "Altın", hex: "#fbbf24" },
    { name: "Mor", hex: "#7c3aed" },
    { name: "Turkuaz", hex: "#0891b2" },
    { name: "Turuncu", hex: "#ea580c" },
    { name: "Gri", hex: "#64748b" },
    { name: "Pembe", hex: "#db2777" },
    { name: "Zeytin", hex: "#4d7c0f" },
    { name: "Bordo", hex: "#9f1239" },
    { name: "Gece", hex: "#0f172a" }
];

let editorBrushMode = false;
let editorPainting = false;

function fillEditorColorPresets() {
    const box = document.getElementById("editor-color-presets");
    if (!box) return;
    box.innerHTML = COLOR_PRESETS.map(c =>
        `<button type="button" title="${c.name}" onclick="applyPresetColor('${c.hex}')"
            class="w-5 h-5 rounded border border-slate-600" style="background:${c.hex}"></button>`
    ).join("");
}

function applyPresetColor(hex) {
    const iso = editorSelectedCountry || document.getElementById("editor-country-select")?.value;
    if (!iso || !GameState.countries[iso]) return;
    GameState.countries[iso].color = hex;
    if (typeof refreshMapColors === "function") refreshMapColors();
    log(`Palet: ${iso} → ${hex}`, "text-slate-400");
}

function paintProvince(name, el) {
    if (!mapEditorOpen || !editorSelectedCountry) return;
    provinceOwners[name] = editorSelectedCountry;
    const col = GameState.countries[editorSelectedCountry]?.color || "#334155";
    if (el) d3.select(el).style("fill", col);
    else d3.selectAll(".country-path").filter(function(){ return d3.select(this).attr("data-name")===name; }).style("fill", col);
    if (typeof updateEditorCount === "function") updateEditorCount();
}

/** İki ülke kara komşusu mu? (PROVINCE_DATA neighbors + provinceOwners) */
function countriesShareBorder(isoA, isoB) {
    if (!isoA || !isoB || isoA === isoB) return false;
    const aProvs = Object.keys(provinceOwners).filter(p => provinceOwners[p] === isoA);
    for (const p of aProvs) {
        const neigh = (typeof getProvinceNeighbors === "function") ? getProvinceNeighbors(p) : [];
        for (const n of neigh) {
            if (provinceOwners[n] === isoB) return true;
        }
    }
    return false;
}

// --- Senaryo görselleri (renk + bayrak) ---
// SCENARIOS.*.countryColors / countryFlags esnek key-value
if (typeof SCENARIOS !== "undefined") {
    if (SCENARIOS.ww1) {
        SCENARIOS.ww1.countryColors = SCENARIOS.ww1.countryColors || {
            TUR: "#dc2626", DEU: "#1a1a1a", RUS: "#1e3a5f", AUT: "#f5f5f4",
            GBR: "#9f1239", FRA: "#1d4ed8", USA: "#1e40af", HUN: "#7f1d1d"
        };
        SCENARIOS.ww1.countryFlags = SCENARIOS.ww1.countryFlags || {
            // Özel URL veya flagcdn kodu; URL ise http ile başlar
            TUR: "tr", DEU: "de", RUS: "ru", AUT: "at", GBR: "gb", FRA: "fr"
        };
    }
    if (SCENARIOS.ww2) {
        SCENARIOS.ww2.countryColors = SCENARIOS.ww2.countryColors || {
            TUR: "#dc2626", DEU: "#171717", RUS: "#9f1239", GBR: "#b91c1c",
            FRA: "#2563eb", USA: "#1e3a8a", JPN: "#991b1b", ITA: "#166534"
        };
        SCENARIOS.ww2.countryFlags = SCENARIOS.ww2.countryFlags || {
            DEU: "de", RUS: "RU", ITA: "it", JPN: "jp"
        };
    }
    if (SCENARIOS.modern) {
        SCENARIOS.modern.countryColors = SCENARIOS.modern.countryColors || {};
        SCENARIOS.modern.countryFlags = SCENARIOS.modern.countryFlags || {};
    }
}

function applyScenarioVisuals(sc) {
    if (!sc || !GameState.countries) return;
    Object.keys(GameState.countries).forEach(iso => {
        const c = GameState.countries[iso];
        if (!c) return;
        if (!c._baseColor) c._baseColor = c.color;
        if (!c._baseFlag) c._baseFlag = c.flag;
        if (sc.countryColors && sc.countryColors[iso]) c.color = sc.countryColors[iso];
        else if (c._baseColor) c.color = c._baseColor;
        if (sc.countryFlags && sc.countryFlags[iso]) c.flag = sc.countryFlags[iso];
        else if (c._baseFlag) c.flag = c._baseFlag;
    });
    if (typeof refreshMapColors === "function") setTimeout(refreshMapColors, 100);
}

function getFlagUrl(isoOrFlag) {
    const c = GameState.countries[isoOrFlag];
    const flag = c ? c.flag : isoOrFlag;
    if (!flag) return "";
    if (String(flag).startsWith("http")) return flag;
    return `https://flagcdn.com/w40/${flag}.png`;
}

// --- Jeopolitik statüler ---
// subjectType: null | "puppet" | "vassal" | "colony" | "dominion"
function setSubjectStatus(overlordIso, subjectIso, type) {
    const sub = GameState.countries[subjectIso];
    const over = GameState.countries[overlordIso];
    if (!sub || !over) return;
    sub.isPuppet = (type === "puppet" || type === "vassal");
    sub.subjectType = type;
    sub.overlord = overlordIso;
    GameState.puppets = GameState.puppets || {};
    if (!GameState.puppets[overlordIso]) GameState.puppets[overlordIso] = [];
    if (!GameState.puppets[overlordIso].includes(subjectIso)) GameState.puppets[overlordIso].push(subjectIso);
    const labels = { puppet: "Kukla", vassal: "Vasal", colony: "Koloni", dominion: "Sömürge/Dominion" };
    log(`📜 ${sub.name} → ${over.name} altında ${labels[type] || type}`, "text-purple-400");
    if (typeof refreshMapColors === "function") refreshMapColors();
}

function processSubjectTributes() {
    if (GameState.gameOver) return;
    // Günlük küçük vergi (DAY ~ 1/7 haftalık)
    Object.keys(GameState.countries).forEach(iso => {
        const sub = GameState.countries[iso];
        if (!sub || !sub.overlord || !sub.subjectType) return;
        const over = GameState.countries[sub.overlord];
        if (!over) return;
        const rates = { puppet: 0.12, vassal: 0.08, colony: 0.15, dominion: 0.06 };
        const rate = rates[sub.subjectType] || 0.1;
        const tax = Math.floor((sub.money || 0) * rate * (1/30)); // günlük
        if (tax > 0 && sub.money > tax) {
            sub.money -= tax;
            over.money += tax;
        }
        // Koloni kaynak transferi
        if (sub.subjectType === "colony" && sub.strat && over.strat) {
            ["oil","steel","rubber","aluminum"].forEach(r => {
                const give = Math.floor((sub.strat[r] || 0) * 0.02);
                if (give > 0) { sub.strat[r] -= give; over.strat[r] = (over.strat[r]||0) + give; }
            });
        }
    });
}

// --- İdeoloji & istikrar & iç savaş ---
const IDEOLOGY_POOL = ["Demokrasi", "Cumhuriyet", "Komünizm", "Faşizm", "Monarşi", "Milliyetçilik", "Sosyalizm", "Cunta"];

function ensureStability(c) {
    if (c.stability == null) c.stability = 55 + Math.floor(Math.random() * 25);
    if (c.popularSupport == null) {
        c.popularSupport = {};
        const main = c.ideology || "Demokrasi";
        c.popularSupport[main] = 50 + Math.floor(Math.random() * 25);
        IDEOLOGY_POOL.filter(i => i !== main).slice(0, 3).forEach(i => {
            c.popularSupport[i] = Math.floor(Math.random() * 20);
        });
    }
}

function processIdeologyTick() {
    if (GameState.gameOver) return;
    // Seyrek çalış
    if (Math.random() > 0.08) return;
    const iso = Object.keys(GameState.countries)[Math.floor(Math.random() * Object.keys(GameState.countries).length)];
    const c = GameState.countries[iso];
    if (!c || c.isCapitulated) return;
    ensureStability(c);

    // Gerilim / savaş / asiler istikrarı düşürür
    let delta = (Math.random() * 2 - 1) * 0.8;
    if (GameState.globalTension > 70) delta -= 0.5;
    if ((GameState.activeWars || []).some(w => w.target === iso || w.attacker === iso)) delta -= 1.2;
    if (iso === GameState.player && GameState.rebelActive) delta -= 2;
    c.stability = Math.max(0, Math.min(100, c.stability + delta));

    // Halk desteği kayması
    const keys = Object.keys(c.popularSupport);
    if (keys.length >= 2 && Math.random() < 0.4) {
        const a = keys[Math.floor(Math.random() * keys.length)];
        const b = keys[Math.floor(Math.random() * keys.length)];
        if (a !== b) {
            const shift = 1 + Math.floor(Math.random() * 3);
            c.popularSupport[a] = Math.max(0, (c.popularSupport[a] || 0) - shift);
            c.popularSupport[b] = (c.popularSupport[b] || 0) + shift;
        }
    }
    // En yüksek destek ideolojiyi değiştirsin
    let top = c.ideology, topV = -1;
    Object.entries(c.popularSupport).forEach(([k, v]) => { if (v > topV) { topV = v; top = k; } });
    if (top !== c.ideology && topV >= 45) {
        const old = c.ideology;
        c.ideology = top;
        if (iso === GameState.player || Math.random() < 0.3) {
            log(`🏛️ ${c.name}: ideoloji ${old} → ${top}`, "text-yellow-400");
        }
        if (iso === GameState.player) {
            const el = document.getElementById("hud-country-ideology");
            if (el) el.innerText = top;
        }
    }

    // İç savaş: istikrar kritik
    if (c.stability < 18 && !c.civilWar && Math.random() < 0.15) {
        c.civilWar = true;
        c.stability = Math.min(c.stability, 15);
        GameState.globalTension = Math.min(100, GameState.globalTension + 8);
        log(`🔥 İÇ SAVAŞ: ${c.name}! İstikrar %${Math.floor(c.stability)}`, "text-red-500 font-black");
        try { sfx.playSiren(); } catch(e){}
        // Oyuncu ülkesinde asi sistemiyle bağla
        if (iso === GameState.player && !GameState.rebelActive) {
            GameState.rebelActive = true;
            GameState.rebelProgress = 25 + Math.floor(Math.random() * 20);
        }
        // AI: tümen ve para kaybı
        if (c.divisions) {
            Object.keys(c.divisions).forEach(k => {
                c.divisions[k] = Math.max(0, Math.floor((c.divisions[k] || 0) * 0.7));
            });
        }
        c.money = Math.floor((c.money || 0) * 0.6);
    }
    // İç savaş bitişi
    if (c.civilWar && c.stability > 40 && Math.random() < 0.1) {
        c.civilWar = false;
        log(`🕊️ ${c.name} iç savaşı sona erdi.`, "text-emerald-400");
    }
}

// makePuppet → subjectType vassal
const _origMakePuppet = typeof makePuppet === "function" ? makePuppet : null;
if (_origMakePuppet) {
    window.makePuppet = function(targetIso) {
        _origMakePuppet(targetIso);
        const t = GameState.countries[targetIso];
        if (t) { t.subjectType = "vassal"; }
    };
}

console.log("V21+ modules loaded: ideology, subjects, brush, presets, scenario visuals, border AI");


// ====================== V24: Kültür / Din / Gazete / Bina / Ekonomi / Ülkeler ======================

/** Ülke ana kültür / din / etnisite (ISO → meta) */
const COUNTRY_IDENTITY = {
  TUR: { culture: "Türk", religion: "İslam", sect: "Sünni", ethnicity: "Türk" },
  AZE: { culture: "Türk", religion: "İslam", sect: "Şii", ethnicity: "Türk" },
  DEU: { culture: "Alman", religion: "Hristiyan", sect: "Protestan", ethnicity: "Germen" },
  AUT: { culture: "Alman", religion: "Hristiyan", sect: "Katolik", ethnicity: "Germen" },
  CHE: { culture: "Alman", religion: "Hristiyan", sect: "Protestan", ethnicity: "Germen" },
  RUS: { culture: "Rus", religion: "Hristiyan", sect: "Ortodoks", ethnicity: "Slav" },
  UKR: { culture: "Ukrayna", religion: "Hristiyan", sect: "Ortodoks", ethnicity: "Slav" },
  POL: { culture: "Polonya", religion: "Hristiyan", sect: "Katolik", ethnicity: "Slav" },
  FRA: { culture: "Fransız", religion: "Hristiyan", sect: "Katolik", ethnicity: "Latin" },
  ITA: { culture: "İtalyan", religion: "Hristiyan", sect: "Katolik", ethnicity: "Latin" },
  ESP: { culture: "İspanyol", religion: "Hristiyan", sect: "Katolik", ethnicity: "Latin" },
  GBR: { culture: "İngiliz", religion: "Hristiyan", sect: "Anglikan", ethnicity: "Anglosakson" },
  USA: { culture: "Amerikan", religion: "Hristiyan", sect: "Protestan", ethnicity: "Anglosakson" },
  JPN: { culture: "Japon", religion: "Şinto", sect: "Şinto", ethnicity: "Japon" },
  CHN: { culture: "Çin", religion: "Budist", sect: "Mahayana", ethnicity: "Han" },
  IRN: { culture: "Fars", religion: "İslam", sect: "Şii", ethnicity: "İranlı" },
  SAU: { culture: "Arap", religion: "İslam", sect: "Sünni", ethnicity: "Arap" },
  EGY: { culture: "Arap", religion: "İslam", sect: "Sünni", ethnicity: "Arap" },
  IND: { culture: "Hint", religion: "Hindu", sect: "Hindu", ethnicity: "Hint" },
  BRA: { culture: "Brezilya", religion: "Hristiyan", sect: "Katolik", ethnicity: "Latin" }
};

/** Etnik akrabalık grupları — aynı gruptaysa ilhak huzursuzluğu yok sayılır */
const ETHNIC_KIN = {
  Türk: ["TUR","AZE","TKM","UZB","KAZ","KGZ","TUR"],
  Germen: ["DEU","AUT","CHE","LIE","LUX","NLD","BEL"],
  Slav: ["RUS","UKR","BLR","POL","CZE","SVK","SRB","HRV","BGR","MKD"],
  Latin: ["FRA","ITA","ESP","PRT","ROU","MDA","BRA","ARG","MEX","COL","CHL","PER"],
  Anglosakson: ["GBR","USA","CAN","AUS","NZL","IRL"],
  Arap: ["SAU","EGY","IRQ","SYR","JOR","LBN","YEM","OMN","QAT","BHR","KWT","UAE","LBY","TUN","DZA","MAR","SDN","PSE"],
  Japon: ["JPN"],
  Han: ["CHN","TWN"]
};

function getCountryIdentity(iso) {
  const c = GameState.countries[iso];
  if (c && c.identity) return c.identity;
  if (COUNTRY_IDENTITY[iso]) return COUNTRY_IDENTITY[iso];
  return { culture: "Yerel", religion: "Karma", sect: "—", ethnicity: "Yerel" };
}

function ensureCountryIdentity(iso) {
  const c = GameState.countries[iso];
  if (!c) return null;
  if (!c.identity) c.identity = Object.assign({}, getCountryIdentity(iso));
  return c.identity;
}

function areEthnicKin(isoA, isoB) {
  const idA = getCountryIdentity(isoA).ethnicity;
  const idB = getCountryIdentity(isoB).ethnicity;
  if (idA && idB && idA === idB) return true;
  for (const group of Object.values(ETHNIC_KIN)) {
    if (group.includes(isoA) && group.includes(isoB)) return true;
  }
  return false;
}

/** PROVINCE_DATA üzerine kültür/din (yoksa sahibe göre) */
function getProvinceCultureMeta(pName) {
  const d = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
  const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(pName) : "NEUTRAL";
  const base = getCountryIdentity(owner);
  return {
    culture: (d && d.culture) || base.culture,
    religion: (d && d.religion) || base.religion,
    sect: (d && d.sect) || base.sect,
    ethnicity: (d && d.ethnicity) || base.ethnicity
  };
}

function isProvinceMismatch(pName, ownerIso) {
  if (!ownerIso || ownerIso === "NEUTRAL") return false;
  if (areEthnicKin(ownerIso, ownerIso)) { /* no-op */ }
  // Eyaletin "orijinal" kimliği: PROVINCE_DATA veya ilk sahip tahmini
  const meta = getProvinceCultureMeta(pName);
  const id = getCountryIdentity(ownerIso);
  // Akraba etnisite → uyum
  const kinEthnic = meta.ethnicity && id.ethnicity && meta.ethnicity === id.ethnicity;
  if (kinEthnic) return false;
  // Aynı kültür grubu listesinde mi
  for (const [eth, list] of Object.entries(ETHNIC_KIN)) {
    if (list.includes(ownerIso) && meta.ethnicity === eth) return false;
  }
  return meta.culture !== id.culture || meta.religion !== id.religion;
}

function processCultureUnrest() {
  if (GameState.gameOver || Math.random() > 0.12) return;
  const iso = GameState.player;
  const c = GameState.countries[iso];
  if (!c) return;
  ensureCountryIdentity(iso);
  const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso);
  let mismatch = 0;
  provs.forEach(p => { if (isProvinceMismatch(p, iso)) mismatch++; });
  if (mismatch === 0) return;
  const ratio = mismatch / Math.max(1, provs.length);
  // Uyum: vergi/üretim cezası
  const penalty = Math.min(0.35, ratio * 0.4);
  c._culturePenalty = penalty;
  if (ratio > 0.25 && Math.random() < 0.08) {
    c.stability = Math.max(0, (c.stability || 50) - 1);
    if (Math.random() < 0.3) {
      log(`⚠️ Kültürel huzursuzluk: ${mismatch} eyalette gerilim (üretim −${Math.floor(penalty*100)}%)`, "text-orange-400");
    }
    if (ratio > 0.45 && Math.random() < 0.04 && !GameState.rebelActive) {
      GameState.rebelActive = true;
      GameState.rebelProgress = Math.min(40, 10 + Math.floor(ratio * 30));
      log("🔥 Farklı kültür/din bölgelerinde isyan kıvılcımı!", "text-red-500");
      try { showNewspaper({ headline: "İSYAN DALGASi", sub: c.name + " eyaletlerinde huzursuzluk", body: "Farklı kimlikli eyaletlerde vergi ve asayiş sorunları büyüyor." }); } catch(e){}
    }
  }
}

// ---------- Gazete manşeti ----------
function showNewspaper(opts) {
  const { headline, sub, body, dateStr } = opts || {};
  document.getElementById("newspaper-modal")?.remove();
  const d = dateStr || (GameState.date ? GameState.date.toLocaleDateString("tr-TR") : "");
  const modal = document.createElement("div");
  modal.id = "newspaper-modal";
  modal.className = "fixed inset-0 z-[10060] flex items-center justify-center bg-black/75 p-4";
  modal.innerHTML = `
    <div class="relative w-full max-w-xl bg-[#f4e9d8] text-[#1a1208] shadow-2xl border-4 border-[#2c1810] rounded-sm overflow-hidden" style="font-family:Georgia,'Times New Roman',serif">
      <div class="bg-[#2c1810] text-[#f4e9d8] px-4 py-2 flex justify-between items-center">
        <span class="text-[10px] tracking-[0.3em] uppercase">The World Gazette</span>
        <span class="text-[10px]">${d}</span>
      </div>
      <div class="px-6 py-4 border-b-2 border-[#2c1810]">
        <div class="text-center text-[11px] tracking-widest uppercase text-[#5c4033] mb-1">Özel Baskı</div>
        <h1 class="text-2xl md:text-3xl font-black text-center leading-tight">${headline || "MANŞET"}</h1>
        ${sub ? `<p class="text-center text-sm italic mt-2 text-[#3d2914]">${sub}</p>` : ""}
      </div>
      <div class="px-6 py-4 text-sm leading-relaxed columns-1">
        <p>${body || ""}</p>
      </div>
      <div class="px-6 pb-4">
        <button onclick="document.getElementById('newspaper-modal').remove()" class="w-full py-2 bg-[#2c1810] text-[#f4e9d8] text-xs font-bold tracking-wider hover:bg-[#3d2914]">KAPAT</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  try { sfx.playAlert(); } catch(e){}
}

// Hook: savaş / barış / yıkım çağrıları (mevcut log noktalarına ek sarmalayıcı)
const _origDeclareWar = typeof declareWar === "function" ? declareWar : null;
if (_origDeclareWar) {
  window.declareWar = function() {
    const r = _origDeclareWar.apply(this, arguments);
    try {
      const t = arguments[0] || GameState.selectedCountry;
      const name = GameState.countries[t]?.name || t;
      showNewspaper({
        headline: "SAVAŞ İLAN EDİLDİ!",
        sub: (GameState.countries[GameState.player]?.name || "") + " × " + name,
        body: "Diplomatik kanallar kapandı. Cephelerde seferberlik ilan edildi. Dünya kamuoyu gelişmeleri endişe ile izliyor."
      });
    } catch(e){}
    return r;
  };
}

// ---------- Eyalet kaynak → ekonomi (güçlendirilmiş) ----------
function processProvinceEconomy() {
  if (GameState.gameOver) return;
  // Oyuncu + seyrek AI
  const targets = [GameState.player];
  if (Math.random() < 0.05) {
    const keys = Object.keys(GameState.countries || {});
    targets.push(keys[Math.floor(Math.random() * keys.length)]);
  }
  targets.forEach(iso => {
    const c = GameState.countries[iso];
    if (!c || c.isCapitulated) return;
    if (typeof ensureStratResources === "function") ensureStratResources(c);
    else {
      c.strat = c.strat || { oil: 0, steel: 0, rubber: 0, aluminum: 0, food: 0, energy: 0 };
    }
    const DAY = 1/7;
    const pen = 1 - (c._culturePenalty || 0);
    const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso);
    let food = 0, energy = 0, trade = 0, ore = 0;
    provs.forEach(pName => {
      const d = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
      if (!d) return;
      const r = (d.primaryResource || "").toLowerCase();
      const infra = Math.max(1, d.infrastructureLevel || 1);
      const mult = (infra / 5) * pen;
      if (r.includes("oil") || r.includes("petrol")) { c.strat.oil = (c.strat.oil||0) + 0.4 * mult * DAY; energy += 0.3 * mult; }
      else if (r.includes("steel") || r.includes("iron") || r.includes("coal") || r.includes("ore")) { c.strat.steel = (c.strat.steel||0) + 0.35 * mult * DAY; ore += 0.4 * mult; }
      else if (r.includes("rubber")) { c.strat.rubber = (c.strat.rubber||0) + 0.25 * mult * DAY; }
      else if (r.includes("aluminum") || r.includes("bauxite")) { c.strat.aluminum = (c.strat.aluminum||0) + 0.2 * mult * DAY; }
      else if (r.includes("grain") || r.includes("food") || r.includes("wheat") || r.includes("rice")) { food += 0.5 * mult; }
      else if (r.includes("gold") || r.includes("trade") || r.includes("port")) { trade += 0.4 * mult; }
      else { food += 0.15 * mult; }
      // Bina bonusları
      const builds = (GameState.provinceBuildings && GameState.provinceBuildings[pName]) || [];
      builds.forEach(b => {
        if (b === "farm") food += 0.3;
        if (b === "energy") energy += 0.35;
        if (b === "bank") trade += 0.25;
        if (b === "tax") trade += 0.2;
        if (b === "port") trade += 0.4;
      });
    });
    c.strat.food = (c.strat.food || 0) + food * DAY;
    c.strat.energy = (c.strat.energy || 0) + energy * DAY;
    c.money = (c.money || 0) + Math.floor((trade * 2 + food * 0.8 + ore * 1.2) * DAY * pen);
  });
}

// ---------- Altyapı & binalar ----------
const BUILDING_DEFS = {
  school:      { name: "Okul", slots: 1, cost: 80 },
  university:  { name: "Üniversite", slots: 2, cost: 220 },
  academy:     { name: "Akademi", slots: 2, cost: 200 },
  bank:        { name: "Banka", slots: 1, cost: 120 },
  temple:      { name: "Tapınak", slots: 1, cost: 90 },
  monument:    { name: "Anıt", slots: 1, cost: 100 },
  amphitheater:{ name: "Amfitiyatro", slots: 1, cost: 110 },
  library:     { name: "Kütüphane", slots: 1, cost: 95 },
  tax:         { name: "Vergi Tahsildarı", slots: 1, cost: 70 },
  hospital:    { name: "Hastane", slots: 1, cost: 130 },
  bunker:      { name: "Sığınak", slots: 1, cost: 140 },
  cityhall:    { name: "Belediye", slots: 1, cost: 100 },
  trench:      { name: "Hendek", slots: 1, cost: 60 },
  barracks:    { name: "Kışla", slots: 1, cost: 150 },
  fort:        { name: "Kale", slots: 2, cost: 280 },
  arsenal:     { name: "Cephanelik", slots: 2, cost: 260 },
  port:        { name: "Liman", slots: 2, cost: 240 },
  farm:        { name: "Tarım Tesisi", slots: 1, cost: 90 },
  energy:      { name: "Enerji Tesisi", slots: 2, cost: 200 }
};

function maxInfraForProvince(pName) {
  const d = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
  if (!d) return 10;
  const climate = (d.climate || "").toLowerCase();
  const terrain = (d.terrain || "").toLowerCase();
  if (climate.includes("arctic") || climate.includes("polar") || terrain.includes("tundra")) return 3;
  if (climate.includes("arid") || terrain.includes("desert")) return 4;
  if (terrain.includes("mountain") || terrain.includes("alpine")) return 5;
  if (terrain.includes("jungle")) return 6;
  return 10;
}

function getProvinceInfra(pName) {
  const d = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
  let lvl = (d && d.infrastructureLevel != null) ? d.infrastructureLevel : 1;
  // PROVINCE_DATA 0-5 ölçeğini 0-10'a genişlet
  if (lvl <= 5) lvl = Math.min(10, lvl * 2);
  const cap = maxInfraForProvince(pName);
  return Math.min(lvl, cap);
}

function getBuildingSlotsUsed(pName) {
  const list = (GameState.provinceBuildings && GameState.provinceBuildings[pName]) || [];
  return list.reduce((sum, id) => sum + ((BUILDING_DEFS[id] && BUILDING_DEFS[id].slots) || 1), 0);
}

function getBuildingSlotsMax(pName) {
  return getProvinceInfra(pName); // 1 infra = 1 slot
}

function buildInProvince(pName, buildingId) {
  const def = BUILDING_DEFS[buildingId];
  if (!def) return;
  const owner = provinceOwners[pName];
  if (owner !== GameState.player) { log("Yalnızca kendi eyaletlerinize inşa edebilirsiniz.", "text-red-400"); return; }
  GameState.provinceBuildings = GameState.provinceBuildings || {};
  if (!GameState.provinceBuildings[pName]) GameState.provinceBuildings[pName] = [];
  const used = getBuildingSlotsUsed(pName);
  const max = getBuildingSlotsMax(pName);
  if (used + def.slots > max) {
    log(`Yetersiz slot: ${used}/${max} (altyapı sınırı ${maxInfraForProvince(pName)})`, "text-yellow-400");
    return;
  }
  const c = GameState.countries[GameState.player];
  if ((c.money || 0) < def.cost) { log("Yetersiz bütçe.", "text-red-400"); return; }
  c.money -= def.cost;
  GameState.provinceBuildings[pName].push(buildingId);
  log(`🏗️ ${def.name} inşa edildi: ${pName.replace(/_/g," ")}`, "text-emerald-400");
  try { sfx.playBuild(); } catch(e){}
}

function demolishBuilding(pName, index) {
  if (!GameState.provinceBuildings || !GameState.provinceBuildings[pName]) return;
  const removed = GameState.provinceBuildings[pName].splice(index, 1)[0];
  log(`Yıkıldı: ${(BUILDING_DEFS[removed]||{}).name || removed} @ ${pName}`, "text-slate-400");
}

function upgradeProvinceInfra(pName) {
  const owner = provinceOwners[pName];
  if (owner !== GameState.player) return;
  const d = (typeof getProvinceInfo === "function") ? getProvinceInfo(pName) : null;
  if (!d) { log("Eyalet verisi yok.", "text-yellow-400"); return; }
  const cap = maxInfraForProvince(pName);
  let cur = d.infrastructureLevel || 0;
  // 0-5 scale in data
  if (cur >= Math.ceil(cap / 2) && cur <= 5) {
    log(`İklim/arazi nedeniyle altyapı tavanı: max ${cap}/10`, "text-orange-400");
    return;
  }
  if (cur >= 5) { log("Altyapı veri tavanında.", "text-slate-400"); return; }
  const c = GameState.countries[GameState.player];
  const cost = 100 + cur * 40;
  if ((c.money||0) < cost) { log("Yetersiz bütçe.", "text-red-400"); return; }
  c.money -= cost;
  d.infrastructureLevel = cur + 1;
  log(`Altyapı yükseltildi: ${pName.replace(/_/g," ")} → ${d.infrastructureLevel}`, "text-cyan-300");
}

// ---------- Casus görev tick ----------
function processSpyMissions() {
  if (!GameState.spyMissions || !GameState.spyMissions.length) return;
  GameState.spyMissions.forEach(m => {
    if (m.done) return;
    m.days = (m.days || 0) + 1;
    // 10. hafta = gün 70: yakalanma riski
    if (!m.caught && m.days >= (m.catchDay || 70) && m.days < (m.catchDay || 70) + 2) {
      if (Math.random() < 0.35) {
        m.caught = true;
        m.done = true;
        const t = GameState.countries[m.target];
        if (!GameState.relations) GameState.relations = {};
        GameState.relations[m.target] = Math.max(-100, (GameState.relations[m.target] || 0) - 12);
        GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 2);
        log(`🕵️ Casus yakalandı! ${t ? t.name : m.target} ile ilişki −12`, "text-red-400");
        try { sfx.playAlert(); } catch(e){}
        return;
      }
    }
    if (m.days >= (m.duration || 140)) {
      m.done = true;
      if (!m.caught && typeof showSpyReport === "function") {
        showSpyReport(m.target);
        log("🕵️ Casus görevi tamamlandı — rapor geldi.", "text-emerald-400");
        if ((GameState.activeWars || []).some(w => w.target === m.target)) {
          const war = GameState.activeWars.find(w => w.target === m.target);
          if (war) war.progress = Math.min(100, (war.progress || 0) + 1.5);
        }
      }
    }
  });
  GameState.spyMissions = GameState.spyMissions.filter(m => !m.done || m.days < 200);
}

// ---------- AI diplomasisi (nadir) ----------
function processAIDiplomacyRare() {
  if (Math.random() > 0.015) return; // çok nadir
  const keys = Object.keys(GameState.countries || {}).filter(k => k !== GameState.player && !GameState.countries[k].isCapitulated);
  if (keys.length < 2) return;
  const a = keys[Math.floor(Math.random() * keys.length)];
  const b = keys[Math.floor(Math.random() * keys.length)];
  if (a === b) return;
  if (!GameState.relations) GameState.relations = {};
  // Sadece komşular
  if (typeof countriesShareBorder === "function" && !countriesShareBorder(a, b)) return;
  const roll = Math.random();
  if (roll < 0.4) {
    // ilişki +
    const key = a < b ? a + "_" + b : b + "_" + a;
    // store pairwise lightly via both directions average not needed
    log(`🕊️ ${GameState.countries[a].name} ile ${GameState.countries[b].name} ilişkilerini yumuşatıyor.`, "text-slate-500");
  } else if (roll < 0.7) {
    GameState.nonAggression = GameState.nonAggression || [];
    const exists = GameState.nonAggression.some(n => (n.a===a&&n.b===b)||(n.a===b&&n.b===a));
    if (!exists) {
      GameState.nonAggression.push({ a, b, expires: 365 });
      log(`📜 NAP: ${GameState.countries[a].name} — ${GameState.countries[b].name}`, "text-slate-400");
    }
  } else {
    GameState.alliances = GameState.alliances || [];
    const aCount = GameState.alliances.filter(x => x.a===a||x.b===a).length;
    const bCount = GameState.alliances.filter(x => x.a===b||x.b===b).length;
    if (aCount >= 2 || bCount >= 2) return;
    const exists = GameState.alliances.some(x => (x.a===a&&x.b===b)||(x.a===b&&x.b===a));
    if (!exists && Math.random() < 0.35) {
      GameState.alliances.push({ a, b, quality: 40 + Math.floor(Math.random()*30) });
      log(`🤝 İttifak: ${GameState.countries[a].name} + ${GameState.countries[b].name}`, "text-indigo-300");
      try {
        showNewspaper({
          headline: "YENİ İTTİFAK",
          sub: GameState.countries[a].name + " & " + GameState.countries[b].name,
          body: "İki devlet karşılıklı güvenlik taahhüdünde bulundu. Diplomasi masalarında dengeler değişiyor."
        });
      } catch(e){}
    }
  }
}

// ---------- Incidents (eventlerden ayrı, küçük günlük olaylar) ----------
const INCIDENTS = [
  { id: "border_skirmish", text: "Sınırda küçük çaplı çatışma haberi.", tension: 1 },
  { id: "trade_boom", text: "Ticaret hacmi arttı.", money: 40 },
  { id: "crop_fail", text: "Hasat beklentinin altında.", money: -30 },
  { id: "factory_strike", text: "Fabrika grevi üretim düşürdü.", money: -20 },
  { id: "science_fair", text: "Bilim fuarı moral yükseltti.", stability: 1 },
  { id: "smuggler", text: "Kaçakçılık çetesi yakalandı.", money: 25 }
];

function processIncidents() {
  if (GameState.gameOver) return;
  if (GameState.settings && GameState.settings.eventsEnabled === false) return;
  if (GameState.eventsEnabled === false) return;
  if (Math.random() > 0.012) return;
  const inc = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
  const c = GameState.countries[GameState.player];
  if (!c) return;
  if (inc.money) c.money = (c.money || 0) + inc.money;
  if (inc.stability) c.stability = Math.max(0, Math.min(100, (c.stability || 50) + inc.stability));
  if (inc.tension) GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + inc.tension);
  log(`📌 Olay: ${inc.text}`, "text-slate-400");
}

// ---------- Manuel bayrak URL ----------
// getFlagUrl zaten http destekliyor; country.flag = full URL senaryodan gelebilir
function setCountryFlagUrl(iso, url) {
  const c = GameState.countries[iso];
  if (!c) return;
  c.flag = url;
  if (iso === GameState.player) {
    const el = document.getElementById("hud-flag");
    if (el) el.src = url;
  }
}

// ---------- Yeni ülkeler (küçük/ada devletleri) ----------
(function registerExtraCountries() {
  const EXTRA = {
    AND: ["Andorra", "ad", "#e63946"], ATG: ["Antigua ve Barbuda", "ag", "#ce1126"],
    BHS: ["Bahamalar", "bs", "#00abc0"], BHR: ["Bahreyn", "bh", "#ce1126"],
    BRB: ["Barbados", "bb", "#00267f"], BLR: ["Belarus", "by", "#c8312a"],
    BLZ: ["Belize", "bz", "#003f87"], BEN: ["Benin", "bj", "#008751"],
    BTN: ["Bhutan", "bt", "#ff4e00"], BWA: ["Botsvana", "bw", "#6da9d2"],
    BRN: ["Brunei", "bn", "#f7e017"], BFA: ["Burkina Faso", "bf", "#ef2b2d"],
    BDI: ["Burundi", "bi", "#ce1126"], CPV: ["Yeşil Burun", "cv", "#003893"],
    DJI: ["Cibuti", "dj", "#6ab2e7"], TCD: ["Çad", "td", "#002664"],
    TLS: ["Doğu Timor", "tl", "#dc241f"], DMA: ["Dominika", "dm", "#006b3f"],
    GNQ: ["Ekvator Ginesi", "gq", "#3e9a00"], SLV: ["El Salvador", "sv", "#0f47af"],
    ERI: ["Eritre", "er", "#ea0437"], SWZ: ["Esvatini", "sz", "#3e5eb9"],
    FJI: ["Fiji", "fj", "#68bfe5"], CIV: ["Fildişi Sahili", "ci", "#f77f00"],
    GAB: ["Gabon", "ga", "#009e60"], GMB: ["Gambiya", "gm", "#ce1126"],
    GRD: ["Grenada", "gd", "#ce1126"], GUY: ["Guyana", "gy", "#009e60"],
    SSD: ["Güney Sudan", "ss", "#078930"], HTI: ["Haiti", "ht", "#00209f"],
    HND: ["Honduras", "hn", "#0073cf"], JAM: ["Jamaika", "jm", "#009b3a"],
    KHM: ["Kamboçya", "kh", "#032ea1"], CMR: ["Kamerun", "cm", "#007a5e"],
    MNE: ["Karadağ", "me", "#c40308"], QAT: ["Katar", "qa", "#8d1b3d"],
    KIR: ["Kiribati", "ki", "#ce1126"], COM: ["Komorlar", "km", "#3a75c4"],
    COG: ["Kongo Cumhuriyeti", "cg", "#009543"], COD: ["Demokratik Kongo", "cd", "#007fff"],
    RKS: ["Kosova", "xk", "#244aa5"], KWT: ["Kuveyt", "kw", "#007a3d"],
    LAO: ["Laos", "la", "#ce1126"], LSO: ["Lesoto", "ls", "#00209f"],
    LIE: ["Lihtenştayn", "li", "#002b7f"], MWI: ["Malavi", "mw", "#ce1126"],
    MDV: ["Maldivler", "mv", "#d21034"], MLI: ["Mali", "ml", "#14b53a"],
    MLT: ["Malta", "mt", "#cf142b"], MHL: ["Marshall Adaları", "mh", "#003893"],
    MUS: ["Mauritius", "mu", "#ea2839"], MRT: ["Moritanya", "mr", "#00a95c"],
    FSM: ["Mikronezya", "fm", "#75b2dd"], MCO: ["Monako", "mc", "#ce1126"],
    MOZ: ["Mozambik", "mz", "#007168"], NAM: ["Namibya", "na", "#003580"],
    NRU: ["Nauru", "nr", "#002b7f"], NPL: ["Nepal", "np", "#dc143c"],
    NIC: ["Nikaragua", "ni", "#0067c6"], NER: ["Nijer", "ne", "#e05206"],
    CAF: ["Orta Afrika Cumhuriyeti", "cf", "#003082"], UZB: ["Özbekistan", "uz", "#1eb53a"],
    PLW: ["Palau", "pw", "#4aadd6"], PSE: ["Filistin", "ps", "#007a3d"],
    PNG: ["Papua Yeni Gine", "pg", "#ce1126"], RWA: ["Ruanda", "rw", "#00a1de"],
    KNA: ["Saint Kitts ve Nevis", "kn", "#ce1126"], LCA: ["Saint Lucia", "lc", "#66ccff"],
    VCT: ["Saint Vincent", "vc", "#009e60"], WSM: ["Samoa", "ws", "#ce1126"],
    SMR: ["San Marino", "sm", "#5eb6e4"], STP: ["Sao Tome ve Principe", "st", "#12ad2b"],
    SYC: ["Seyşeller", "sc", "#003d88"], SLE: ["Sierra Leone", "sl", "#1eb53a"],
    SLB: ["Solomon Adaları", "sb", "#0051ba"], SOM: ["Somali", "so", "#4189dd"],
    SUR: ["Surinam", "sr", "#377e3f"], TJK: ["Tacikistan", "tj", "#cc0000"],
    TZA: ["Tanzanya", "tz", "#1eb53a"], TGO: ["Togo", "tg", "#006a4e"],
    TON: ["Tonga", "to", "#c10000"], TTO: ["Trinidad ve Tobago", "tt", "#ce1126"],
    TUV: ["Tuvalu", "tv", "#00247d"], OMN: ["Umman", "om", "#db161b"],
    VUT: ["Vanuatu", "vu", "#009543"], VAT: ["Vatikan", "va", "#ffe000"],
    NZL: ["Yeni Zelanda", "nz", "#00247d"], ZMB: ["Zambiya", "zm", "#198a00"],
    ZWE: ["Zimbabve", "zw", "#ffd200"], CYP: ["Kıbrıs Rum Cumhuriyeti", "cy", "#4189dd"],
GNB: ["Gine-Bissau","gw", "#008751"], GIN: ["Gine","gw", "#377e3f"], SHN: ["Birleşik Krallık Deniz Aşırı Toprakları","gb", "#0067c6"]
  };
  if (!GameState || !GameState.countries) return;
  Object.entries(EXTRA).forEach(([iso, [name, flag, color]]) => {
    if (GameState.countries[iso]) return;
    GameState.countries[iso] = {
      name, flag, color, ideology: "Cumhuriyet", pop: 2000000,
      civFactories: 3, milFactories: 1, money: 400, manpower: 40000,
      divisions: { inf: 2, art: 0, arm: 0 },
      factoryEfficiency: 1.0,
      productionLines: { guns: 1, artillery: 1, tanks: 1 },
      stockpile: { guns: 2000, artillery: 20, tanks: 5 },
      prodAllocation: { guns: 1, artillery: 0, tanks: 0 },
      completedFocuses: [], activeFocus: null, focusProgress: 0,
      identity: { culture: "Yerel", religion: "Karma", sect: "—", ethnicity: "Yerel" }
    };
  });
  // Bilinen kimlikler
  if (GameState.countries.BLR) GameState.countries.BLR.identity = { culture: "Belarus", religion: "Hristiyan", sect: "Ortodoks", ethnicity: "Slav" };
  if (GameState.countries.UZB) GameState.countries.UZB.identity = { culture: "Özbek", religion: "İslam", sect: "Sünni", ethnicity: "Türk" };
  if (GameState.countries.AZE) GameState.countries.AZE.identity = { culture: "Türk", religion: "İslam", sect: "Şii", ethnicity: "Türk" };
  if (GameState.countries.PSE) GameState.countries.PSE.identity = { culture: "Arap", religion: "İslam", sect: "Sünni", ethnicity: "Arap" };
  if (GameState.countries.NZL) GameState.countries.NZL.identity = { culture: "Yeni Zelanda", religion: "Hristiyan", sect: "Protestan", ethnicity: "Anglosakson" };
  console.log("V24: ekstra ülkeler kayıtlı · toplam", Object.keys(GameState.countries).length);
})();

// İlhak sonrası kültür notu
const _origAnnexHook = typeof annexCountry === "function" ? annexCountry : null;
// soft: when province owner changes, log kin
function noteAnnexCulture(pName, newOwner) {
  if (!isProvinceMismatch(pName, newOwner) || areEthnicKin(newOwner, newOwner)) {
    // kin path
  }
}

console.log("V24 modules: culture, newspaper, buildings, province economy, spy weeks, AI diplo, incidents, extra countries");



// ============================================================
// SUPREME COMMAND V27 — EFSANE MODÜL
// Zafer, seferberlik, mevsim, ikmal, milli ruh, işgal politikası,
// savaş raporu, stratejik hedefler, dünya sıralaması, toast UI
// ============================================================

(function initV27Legendary() {
  if (typeof GameState === "undefined") return;

  // --- State defaults ---
  if (!GameState.v27) GameState.v27 = {};
  const V = GameState.v27;
  if (V.warSupport == null) V.warSupport = 55;
  if (V.conscription == null) V.conscription = "volunteer"; // volunteer | limited | extensive | scraping
  if (V.mobilization == null) V.mobilization = "civilian"; // civilian | early | partial | total
  if (V.occupation == null) V.occupation = "balanced"; // gentle | balanced | harsh
  if (!V.nationalSpirits) V.nationalSpirits = [];
  if (!V.objectives) V.objectives = [];
  if (!V.combatLog) V.combatLog = [];
  if (!V.season) V.season = "İlkbahar";
  if (V.victoryScore == null) V.victoryScore = 0;
  if (V.battlesWon == null) V.battlesWon = 0;
  if (V.daysPlayed == null) V.daysPlayed = 0;
  if (!V.toasts) V.toasts = [];

  const CONSCRIPTION = {
    volunteer:  { label: "Gönüllü Ordu", mpMul: 1.0, recovery: 1.0, cost: 0 },
    limited:    { label: "Sınırlı Askere Alma", mpMul: 1.35, recovery: 1.15, cost: 5 },
    extensive:  { label: "Geniş Seferberlik", mpMul: 1.75, recovery: 1.35, cost: 12 },
    scraping:   { label: "Varını Yoğunu", mpMul: 2.4, recovery: 1.6, cost: 22 }
  };
  const MOBILIZATION = {
    civilian: { label: "Sivil Ekonomi", milMul: 1.0, civMul: 1.15, wsDrain: 0 },
    early:    { label: "Erken Seferberlik", milMul: 1.2, civMul: 1.0, wsDrain: 0.02 },
    partial:  { label: "Kısmi Seferberlik", milMul: 1.45, civMul: 0.9, wsDrain: 0.05 },
    total:    { label: "Toplam Savaş Ekonomisi", milMul: 1.85, civMul: 0.7, wsDrain: 0.1 }
  };
  const OCCUPATION = {
    gentle:   { label: "Yumuşak İşgal", unrest: 0.5, loot: 0.4, infra: 0.9 },
    balanced: { label: "Dengeli İşgal", unrest: 1.0, loot: 1.0, infra: 1.0 },
    harsh:    { label: "Sert İşgal", unrest: 1.8, loot: 1.6, infra: 0.7 }
  };

  const SPIRIT_POOL = [
    { id: "indomitable", name: "Yenilmez Ruh", desc: "+10% savunma, +5 savaş desteği", atk: 0, def: 0.1, ws: 5 },
    { id: "war_economy", name: "Savaş Ekonomisi", desc: "+15% askeri üretim", mil: 0.15, civ: -0.05 },
    { id: "propaganda", name: "Propaganda Makinesi", desc: "+8 istikrar, +10 savaş desteği", stab: 8, ws: 10 },
    { id: "fortress", name: "Kaleler Ülkesi", desc: "+12% ev sahibi savunma", homeDef: 0.12 },
    { id: "blitz", name: "Yıldırım Doktrini", desc: "+12% saldırı, -5% savunma", atk: 0.12, def: -0.05 },
    { id: "diplomats", name: "Diplomasi Geleneği", desc: "İlişki iyileşmesi hızlanır", diplo: 1.25 },
    { id: "scientists", name: "Bilim Seferberliği", desc: "Araştırma +20% hızlı", research: 0.2 }
  ];

  window.V27 = {
    CONSCRIPTION, MOBILIZATION, OCCUPATION, SPIRIT_POOL,
    getConscription() { return CONSCRIPTION[GameState.v27.conscription] || CONSCRIPTION.volunteer; },
    getMobilization() { return MOBILIZATION[GameState.v27.mobilization] || MOBILIZATION.civilian; },
    getOccupation() { return OCCUPATION[GameState.v27.occupation] || OCCUPATION.balanced; }
  };

  // ---------- Toast ----------
  window.showToast = function(msg, kind) {
    kind = kind || "info";
    let host = document.getElementById("v27-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "v27-toast-host";
      host.style.cssText = "position:fixed;top:64px;right:16px;left:auto;transform:none;z-index:12000;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:min(92vw,320px);";
      document.body.appendChild(host);
    }
    const colors = { info: "#3d9b94", good: "#3d8f6e", bad: "#b33b4a", war: "#c9a227", epic: "#8b7355" };
    const el = document.createElement("div");
    el.style.cssText = `pointer-events:auto;background:#12161f;border:1px solid ${colors[kind]||colors.info};border-left-width:3px;color:#d5dbe6;padding:10px 12px;border-radius:4px;font-size:12px;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,0.5);animation:v27fade 4s forwards;`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  };

  // ---------- Season ----------
  window.updateSeason = function() {
    if (!GameState.date) return;
    const m = GameState.date.getMonth();
    const s = m < 2 || m === 11 ? "Kış" : m < 5 ? "İlkbahar" : m < 8 ? "Yaz" : "Sonbahar";
    const prev = GameState.v27.season;
    GameState.v27.season = s;
    if (prev && prev !== s) {
      log(`🌤 Mevsim: ${s}`, "text-cyan-300");
      if (typeof showToast === "function") showToast("Mevsim değişti: " + s, "info");
    }
    setText("v27-season", s);
  };

  window.getSeasonCombatMod = function() {
    const s = GameState.v27?.season || "İlkbahar";
    if (s === "Kış") return { atk: 0.88, move: 0.75, label: "Kış — hareket/saldırı cezası" };
    if (s === "Yaz") return { atk: 1.05, move: 1.05, label: "Yaz — hareket avantajı" };
    if (s === "Sonbahar") return { atk: 0.97, move: 0.92, label: "Sonbahar — hafif çamur" };
    return { atk: 1.0, move: 1.0, label: "İlkbahar" };
  };

  // ---------- Laws ----------
  window.setConscription = function(key) {
    if (!CONSCRIPTION[key]) return;
    GameState.v27.conscription = key;
    const c = CONSCRIPTION[key];
    log(`🪖 Askere alma: ${c.label}`, "text-amber-300");
    showToast("Askere alma: " + c.label, "war");
    renderV27Laws();
  };
  window.setMobilization = function(key) {
    if (!MOBILIZATION[key]) return;
    GameState.v27.mobilization = key;
    const c = MOBILIZATION[key];
    log(`⚙️ Seferberlik: ${c.label}`, "text-orange-300");
    showToast("Seferberlik: " + c.label, "war");
    renderV27Laws();
  };
  window.setOccupationPolicy = function(key) {
    if (!OCCUPATION[key]) return;
    GameState.v27.occupation = key;
    log(`🏛 İşgal politikası: ${OCCUPATION[key].label}`, "text-slate-300");
    renderV27Laws();
  };

  window.renderV27Laws = function() {
    const box = document.getElementById("v27-laws");
    if (!box) return;
    const con = GameState.v27.conscription;
    const mob = GameState.v27.mobilization;
    const occ = GameState.v27.occupation;
    const btn = (group, key, label, active) =>
      `<button type="button" onclick="${group}('${key}')" class="px-2 py-1 rounded text-[9px] font-bold border ${active ? "border-cyan-500 bg-cyan-950/50 text-cyan-300" : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"}">${label}</button>`;
    box.innerHTML = `
      <div class="space-y-2 text-[10px]">
        <div>
          <div class="text-slate-500 font-bold uppercase mb-1">Askere Alma</div>
          <div class="flex flex-wrap gap-1">
            ${Object.keys(CONSCRIPTION).map(k => btn("setConscription", k, CONSCRIPTION[k].label.split(" ")[0], k===con)).join("")}
          </div>
        </div>
        <div>
          <div class="text-slate-500 font-bold uppercase mb-1">Seferberlik</div>
          <div class="flex flex-wrap gap-1">
            ${Object.keys(MOBILIZATION).map(k => btn("setMobilization", k, MOBILIZATION[k].label.split(" ")[0], k===mob)).join("")}
          </div>
        </div>
        <div>
          <div class="text-slate-500 font-bold uppercase mb-1">İşgal Politikası</div>
          <div class="flex flex-wrap gap-1">
            ${Object.keys(OCCUPATION).map(k => btn("setOccupationPolicy", k, OCCUPATION[k].label.split(" ")[0], k===occ)).join("")}
          </div>
        </div>
      </div>`;
  };

  // ---------- National Spirits ----------
  window.gainNationalSpirit = function(id) {
    const sp = SPIRIT_POOL.find(s => s.id === id);
    if (!sp) return;
    if (!GameState.v27.nationalSpirits.includes(id)) {
      GameState.v27.nationalSpirits.push(id);
      if (sp.ws) GameState.v27.warSupport = Math.min(100, GameState.v27.warSupport + sp.ws);
      if (sp.stab) {
        const p = GameState.countries[GameState.player];
        if (p) p.stability = Math.min(100, (p.stability || 50) + sp.stab);
      }
      log(`Milli ruh kazanıldı: ${sp.name} — ${sp.desc}`, "text-amber-300");
      showToast("Yeni milli ruh: " + sp.name, "info");
      renderV27Spirits();
    }
  };

  window.renderV27Spirits = function() {
    const box = document.getElementById("v27-spirits");
    if (!box) return;
    const ids = GameState.v27.nationalSpirits || [];
    if (!ids.length) {
      box.innerHTML = `<div class="text-[10px] text-slate-500 italic">Henüz milli ruh yok. Büyük zaferler ve olaylar kazandırır.</div>`;
      return;
    }
    box.innerHTML = ids.map(id => {
      const sp = SPIRIT_POOL.find(s => s.id === id);
      return sp ? `<div class="p-2 rounded border border-purple-800/60 bg-purple-950/30 text-[10px]"><b class="text-purple-300">${sp.name}</b><div class="text-slate-400">${sp.desc}</div></div>` : "";
    }).join("");
  };

  // ---------- Victory score & ranking ----------
  window.computeVictoryScore = function(iso) {
    iso = iso || GameState.player;
    const c = GameState.countries[iso];
    if (!c) return 0;
    const provs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === iso).length;
    const divs = Object.values(c.divisions || {}).reduce((a, b) => a + b, 0);
    const fac = (c.civFactories || 0) + (c.milFactories || 0) * 1.5;
    // puppets: { overlord: [subjects] } veya eski dizi formu
    let puppets = 0;
    const P = GameState.puppets;
    if (Array.isArray(P)) {
      puppets = P.filter(p => p && (p.overlord === iso || p === iso)).length;
    } else if (P && typeof P === "object") {
      if (Array.isArray(P[iso])) puppets = P[iso].length;
      else {
        // { subject: overlord } düz map
        puppets = Object.keys(P).filter(k => P[k] === iso || (Array.isArray(P[k]) && k === iso)).length;
        if (Array.isArray(P[iso])) puppets = P[iso].length;
      }
    }
    return Math.floor(provs * 3 + divs * 2 + fac * 1.5 + puppets * 8 + (GameState.v27.battlesWon || 0) * 5);
  };

  window.renderWorldRanking = function() {
    const box = document.getElementById("v27-ranking");
    if (!box) return;
    const scores = Object.keys(GameState.countries || {}).map(iso => ({
      iso, name: (typeof getCountryDisplayName === "function" ? getCountryDisplayName(iso) : GameState.countries[iso].name) || iso,
      score: computeVictoryScore(iso)
    })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
    box.innerHTML = scores.map((s, i) => {
      const me = s.iso === GameState.player;
      return `<div class="flex justify-between text-[10px] ${me ? "text-cyan-300 font-black" : "text-slate-400"}">
        <span>${i + 1}. ${s.name}</span><span class="font-mono">${s.score}</span></div>`;
    }).join("") || `<div class="text-slate-600 text-[10px]">Veri yok</div>`;
  };

  // ---------- Objectives ----------
  window.ensureObjectives = function() {
    if ((GameState.v27.objectives || []).length) return;
    const player = GameState.player;
    GameState.v27.objectives = [
      { id: "expand", title: "Bölgesel Genişleme", desc: "En az 5 yeni eyalet kontrol et", progress: 0, target: 5, reward: "provinces", done: false },
      { id: "industry", title: "Sanayi Hamlesi", desc: "Toplam 25 fabrikaya ulaş", progress: 0, target: 25, type: "factories", done: false },
      { id: "army", title: "Büyük Ordu", desc: "40 tümene ulaş", progress: 0, target: 40, type: "divs", done: false },
      { id: "diplomacy", title: "Diplomatik Ağ", desc: "2 ittifak kur", progress: 0, target: 2, type: "allies", done: false }
    ];
  };

  window.updateObjectives = function() {
    ensureObjectives();
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const provs = Object.keys(provinceOwners || {}).filter(x => provinceOwners[x] === GameState.player).length;
    const startP = GameState.v27.startProvinces || provs;
    const divs = Object.values(p.divisions || {}).reduce((a, b) => a + b, 0);
    const fac = (p.civFactories || 0) + (p.milFactories || 0);
    const allies = (GameState.alliances || []).filter(a => a.a === GameState.player || a.b === GameState.player).length;

    GameState.v27.objectives.forEach(o => {
      if (o.done) return;
      if (o.type === "provinces") o.progress = Math.max(0, provs - startP);
      if (o.type === "factories") o.progress = fac;
      if (o.type === "divs") o.progress = divs;
      if (o.type === "allies") o.progress = allies;
      if (o.progress >= o.target) {
        o.done = true;
        p.money = (p.money || 0) + 800;
        GameState.v27.warSupport = Math.min(100, (GameState.v27.warSupport || 50) + 5);
        log(`Hedef tamam: ${o.title} (+800💰)`, "text-emerald-400 font-bold");
        showToast("Hedef tamamlandı: " + o.title, "good");
        if (Math.random() < 0.4) gainNationalSpirit(SPIRIT_POOL[Math.floor(Math.random() * SPIRIT_POOL.length)].id);
      }
    });
    renderV27Objectives();
  };

  window.renderV27Objectives = function() {
    const box = document.getElementById("v27-objectives");
    if (!box) return;
    ensureObjectives();
    box.innerHTML = GameState.v27.objectives.map(o => {
      const pct = Math.min(100, Math.floor((o.progress / o.target) * 100));
      return `<div class="p-2 rounded border ${o.done ? "border-emerald-700 bg-emerald-950/30" : "border-slate-700 bg-slate-900/50"}">
        <div class="flex justify-between text-[10px] font-bold ${o.done ? "text-emerald-400" : "text-slate-200"}">
          <span>${o.done ? "✓ " : ""}${o.title}</span>
          <span class="font-mono">${Math.min(o.progress, o.target)}/${o.target}</span>
        </div>
        <div class="text-[9px] text-slate-500 mb-1">${o.desc}</div>
        <div class="h-1.5 bg-slate-800 rounded overflow-hidden"><div class="h-full ${o.done ? "bg-emerald-500" : "bg-cyan-500"}" style="width:${pct}%"></div></div>
      </div>`;
    }).join("");
  };

  // ---------- Combat report ----------
  window.pushCombatReport = function(title, lines, kind) {
    GameState.v27.combatLog = GameState.v27.combatLog || [];
    GameState.v27.combatLog.unshift({ title, lines, kind: kind || "info", t: Date.now() });
    if (GameState.v27.combatLog.length > 30) GameState.v27.combatLog.length = 30;
    const host = document.getElementById("v27-combat-feed");
    if (host) {
      host.innerHTML = GameState.v27.combatLog.slice(0, 5).map(c =>
        `<div class="text-[10px] border-b border-slate-800 py-1"><b class="text-amber-300">${c.title}</b><div class="text-slate-400">${(c.lines || []).join(" · ")}</div></div>`
      ).join("");
    }
  };

  // ---------- Manpower recovery ----------
  window.processManpowerRecovery = function() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const cons = V27.getConscription();
    const provs = Object.keys(provinceOwners || {}).filter(x => provinceOwners[x] === GameState.player).length;
    const base = Math.floor(80 + provs * 12);
    const gain = Math.floor(base * (cons.recovery || 1) * (1 / 7)); // daily fraction of weekly
    p.manpower = (p.manpower || 0) + gain;
    // war support drift
    const wars = (GameState.activeWars || []).length;
    let ws = GameState.v27.warSupport || 50;
    if (wars > 0) ws -= 0.08 * wars;
    else ws += 0.04;
    const mob = V27.getMobilization();
    ws -= (mob.wsDrain || 0);
    GameState.v27.warSupport = Math.max(5, Math.min(100, ws));
    // stability soft recovery
    if (p.stability != null && p.stability < 70 && wars === 0) p.stability = Math.min(100, p.stability + 0.05);
  };

  // ---------- Supply attrition (off-home / occupied) ----------
  window.processSupplyAttrition = function() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const wars = GameState.activeWars || [];
    if (!wars.length) return;
    // fighting abroad without oil -> attrition
    const oil = (p.strat && p.strat.oil) || 0;
    if (oil < 5 && wars.length) {
      const loss = Math.max(1, Math.floor(Object.values(p.divisions || {}).reduce((a, b) => a + b, 0) * 0.01));
      if (p.divisions && p.divisions.inf > 0) {
        p.divisions.inf = Math.max(0, p.divisions.inf - Math.min(loss, 1));
        if (Math.random() < 0.15) {
          log("⛽ İkmal zayıf: cephede yıpranma (petrol düşük).", "text-orange-400");
          pushCombatReport("İkmal Yıpranması", ["Petrol kritik", "Piyade zayiatı"], "bad");
        }
      }
    }
  };

  // ---------- Production multipliers from laws ----------
  window.applyV27ProdModifiers = function(player) {
    if (!player) return;
    const mob = V27.getMobilization();
    player._v27MilMul = mob.milMul || 1;
    player._v27CivMul = mob.civMul || 1;
    // spirits
    let mil = 1, civ = 1;
    (GameState.v27.nationalSpirits || []).forEach(id => {
      const sp = SPIRIT_POOL.find(s => s.id === id);
      if (!sp) return;
      if (sp.mil) mil += sp.mil;
      if (sp.civ) civ += sp.civ;
    });
    player._v27MilMul *= mil;
    player._v27CivMul *= civ;
  };

  // ---------- Tick hook ----------
  window.processV27Tick = function() {
    try {
      GameState.v27.daysPlayed = (GameState.v27.daysPlayed || 0) + 1;
      updateSeason();
      processManpowerRecovery();
      processSupplyAttrition();
      applyV27ProdModifiers(GameState.countries[GameState.player]);
      if ((GameState.v27.daysPlayed % 7) === 0) {
        updateObjectives();
        renderWorldRanking();
        GameState.v27.victoryScore = computeVictoryScore(GameState.player);
        setText("v27-score", String(GameState.v27.victoryScore));
      }
      // war support HUD
      setText("v27-ws", Math.floor(GameState.v27.warSupport || 0) + "%");
      const stab = GameState.countries[GameState.player]?.stability;
      if (stab != null) setText("v27-stab", Math.floor(stab) + "%");
      // occupation loot on annexed provinces lightly
      const occ = V27.getOccupation();
      if (occ.loot > 1 && Math.random() < 0.05) {
        const p = GameState.countries[GameState.player];
        if (p) p.money = (p.money || 0) + Math.floor(20 * occ.loot);
      }
    } catch (e) {
      console.warn("V27 tick", e);
    }
  };

  // ---------- UI render all ----------
  window.renderV27Panel = function() {
    renderV27Laws();
    renderV27Spirits();
    renderV27Objectives();
    renderWorldRanking();
    setText("v27-score", String(computeVictoryScore(GameState.player)));
    setText("v27-ws", Math.floor(GameState.v27.warSupport || 0) + "%");
    setText("v27-season", GameState.v27.season || "—");
    const stab = GameState.countries[GameState.player]?.stability;
    if (stab != null) setText("v27-stab", Math.floor(stab) + "%");
  };

  // Hook resolveWar for combat reports & spirits
  const _origResolveWar = typeof resolveWar === "function" ? resolveWar : null;
  if (_origResolveWar && !window._v27WarHooked) {
    window._v27WarHooked = true;
    window.resolveWar = function(index, victory) {
      const war = GameState.activeWars[index];
      const targetName = GameState.countries[war?.target]?.name || "Düşman";
      _origResolveWar(index, victory);
      if (victory) {
        GameState.v27.battlesWon = (GameState.v27.battlesWon || 0) + 1;
        GameState.v27.warSupport = Math.min(100, (GameState.v27.warSupport || 50) + 8);
        pushCombatReport("Zafer: " + targetName, ["Cephe çöktü", "Savaş desteği +8"], "good");
        showToast("Zafer! " + targetName + " yenildi", "good");
        if (GameState.v27.battlesWon === 1) gainNationalSpirit("indomitable");
        if (GameState.v27.battlesWon === 3) gainNationalSpirit("blitz");
      } else {
        GameState.v27.warSupport = Math.max(10, (GameState.v27.warSupport || 50) - 12);
        pushCombatReport("Bozgun: " + targetName, ["Geri çekilme", "Savaş desteği -12"], "bad");
        showToast("Bozgun — " + targetName, "bad");
      }
    };
  }

  // Province hover tooltips
  function wireProvinceTooltips() {
    if (window._v27TipsWired) return;
    window._v27TipsWired = true;
    const tip = document.createElement("div");
    tip.id = "v27-map-tip";
    tip.style.cssText = "position:fixed;z-index:11000;pointer-events:none;display:none;background:rgba(2,6,23,0.94);border:1px solid #334155;color:#e2e8f0;padding:8px 10px;border-radius:8px;font-size:11px;max-width:240px;box-shadow:0 6px 20px rgba(0,0,0,0.5);";
    document.body.appendChild(tip);
    document.addEventListener("mousemove", (ev) => {
      const t = ev.target;
      if (!t || !t.classList || !t.classList.contains("country-path")) {
        tip.style.display = "none";
        return;
      }
      const name = t.getAttribute("data-name");
      if (!name) return;
      const owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : (provinceOwners || {})[name];
      const cname = owner && GameState.countries[owner] ? ((typeof getCountryDisplayName === "function" ? getCountryDisplayName(owner) : GameState.countries[owner].name)) : "Tarafsız";
      const info = (typeof getProvinceInfo === "function") ? getProvinceInfo(name) : null;
      const terrain = info?.terrain || "?";
      const climate = info?.climate || "?";
      const res = info?.primaryResource || info?.resource || "—";
      tip.innerHTML = `<b>${name.replace(/_/g, " ")}</b><br><span style="color:#94a3b8">Sahip:</span> ${cname}<br><span style="color:#94a3b8">Arazi:</span> ${terrain} · ${climate}<br><span style="color:#94a3b8">Kaynak:</span> ${res}`;
      tip.style.display = "block";
      tip.style.left = Math.min(window.innerWidth - 260, ev.clientX + 14) + "px";
      tip.style.top = Math.min(window.innerHeight - 100, ev.clientY + 14) + "px";
    });
  }

  // Init after start
  window.bootV27 = function() {
    if (!GameState.v27.startProvinces) {
      GameState.v27.startProvinces = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === GameState.player).length;
    }
    ensureObjectives();
    renderV27Panel();
    wireProvinceTooltips();
    // inject CSS anim
    if (!document.getElementById("v27-style")) {
      const st = document.createElement("style");
      st.id = "v27-style";
      st.textContent = `@keyframes v27fade{0%{opacity:0;transform:translateY(-6px)}12%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}`;
      document.head.appendChild(st);
    }
    console.log("V27 Legendary module online");
  };

  // Auto-boot when game likely started
  const _obs = setInterval(() => {
    if (GameState && GameState.player && document.getElementById("hud-gold")) {
      bootV27();
      clearInterval(_obs);
    }
  }, 800);
})();

// Hook processV27Tick into gameTick safely via wrapper once
(function hookV27IntoGameTick() {
  if (window._v27TickHooked) return;
  const prev = typeof gameTick === "function" ? gameTick : null;
  if (!prev) return;
  window._v27TickHooked = true;
  // Monkey-patch by reassignment after definition - if gameTick is const-bound this may fail
  // Use interval companion instead (safer)
  setInterval(() => {
    if (typeof GameState === "undefined" || !GameState.running || GameState.gameOver) return;
    if (typeof processV27Tick === "function") processV27Tick();
  }, 1000);
})();

// Apply law production modifiers into existing economy lightly
(function patchProdMulFromV27() {
  const orig = typeof processCivilianEconomy === "function" ? processCivilianEconomy : null;
  // soft: playerProdMul already exists - combine when rendering
})();


function v27WarProgressDelta(base) {
  let d = base;
  try {
    if (typeof getSeasonCombatMod === "function") {
      const sm = getSeasonCombatMod();
      d *= (sm.atk || 1);
    }
    const ws = (GameState.v27 && GameState.v27.warSupport) || 50;
    d *= (0.85 + (ws / 100) * 0.3); // 0.85–1.15
    // national spirits attack
    if (GameState.v27 && GameState.v27.nationalSpirits) {
      GameState.v27.nationalSpirits.forEach(id => {
        const sp = (typeof V27 !== "undefined" && V27.SPIRIT_POOL) ? V27.SPIRIT_POOL.find(s => s.id === id) : null;
        if (sp && sp.atk) d *= (1 + sp.atk);
        if (sp && sp.def) d *= (1 + sp.def * 0.3);
      });
    }
  } catch (e) {}
  return d;
}

console.log("V27 Legendary systems loaded");



// ============================================================
// TARİHSEL EVENT AĞAÇLARI (WW1 / WW2 / Soğuk Savaş–Modern)
// Senaryo yılı + tarih + oyuncu ülkesine göre zincirlenir.
// eventsEnabled=false ise tamamen devre dışı.
// ============================================================

(function HistoricalEventTrees() {
  if (typeof GameState === "undefined") return;

  function histState() {
    if (!GameState.histEvents) {
      GameState.histEvents = {
        fired: {},      // id -> true
        flags: {},      // chain flags
        queue: []       // delayed {id, onDate: Date}
      };
    }
    return GameState.histEvents;
  }

  function eventsOn() {
    if (GameState.eventsEnabled === false) return false;
    if (GameState.settings && GameState.settings.eventsEnabled === false) return false;
    return true;
  }

  function scenId() {
    return GameState.scenarioId || "modern";
  }

  function techEra() {
    return (typeof getTechEra === "function") ? getTechEra() : (GameState.techEra || 3);
  }

  function yearNow() {
    return GameState.date ? GameState.date.getFullYear() : 1939;
  }

  function monthNow() {
    return GameState.date ? GameState.date.getMonth() + 1 : 1;
  }

  function dayNow() {
    return GameState.date ? GameState.date.getDate() : 1;
  }

  function hasFired(id) {
    return !!histState().fired[id];
  }

  function markFired(id) {
    histState().fired[id] = true;
  }

  function setFlag(k, v) {
    histState().flags[k] = v;
  }

  function getFlag(k) {
    return histState().flags[k];
  }

  function playerIs(...tags) {
    return tags.includes(GameState.player);
  }

  function countryAlive(iso) {
    if (typeof isCountryAlive === "function") return isCountryAlive(iso);
    return !!(GameState.countries && GameState.countries[iso]);
  }

  function transferSomeProvinces(fromIso, toIso, maxN) {
    const list = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === fromIso);
    if (!list.length) return 0;
    const n = Math.min(maxN || list.length, list.length);
    const take = list.slice(-n);
    take.forEach(p => { provinceOwners[p] = toIso; });
    if (typeof refreshMapColors === "function") refreshMapColors();
    return take.length;
  }

  /** Belirtilen eyalet listesini devret (haritada yoksa atla). Log: hangi eyalet kime. */
  function transferNamedProvinces(fromIso, toIso, provinceNames) {
    const moved = [];
    (provinceNames || []).forEach(p => {
      if (provinceOwners[p] === fromIso || (!fromIso && provinceOwners[p])) {
        if (fromIso && provinceOwners[p] !== fromIso) return;
        provinceOwners[p] = toIso;
        if (GameState.occupations) delete GameState.occupations[p];
        moved.push(p);
      }
    });
    if (moved.length) {
      log("Toprak devri → " + toIso + ": " + moved.map(x => x.replace(/_/g, " ")).join(", "), "text-amber-300");
      if (typeof refreshMapColors === "function") refreshMapColors();
    }
    return moved;
  }

  /**
   * Scripted savaş: saldırgan hedefe savaş açar, days sonra kesin zafer + named/fallback eyaletler.
   * opts: { provinces:[], maxFallback:n, annexAll:bool, onDone:fn }
   */
  function scriptedWar(attacker, target, days, opts) {
    opts = opts || {};
    if (!countryAlive(attacker) || !countryAlive(target)) return;
    ensureWar(attacker, target);
    // Saldırgana ilerleme avantajı
    const war = (GameState.activeWars || []).find(w =>
      w.target === target && (w.attacker === attacker || !w.attacker)
    );
    if (war) {
      war.progress = Math.max(war.progress || 0, 35);
      war.scripted = true;
      war.scriptedWinDays = days || 14;
      war.scriptedOpts = opts;
      war.attacker = attacker;
    }
    log("Scripted cephe: " + attacker + " → " + target + " (" + (days || 14) + " gün)", "text-slate-400");
  }

  function processScriptedWars() {
    if (!GameState.activeWars) return;
    GameState.activeWars.forEach(w => {
      if (!w.scripted || w.scriptedWinDays == null) return;
      w.scriptedWinDays--;
      // garanti ilerleme
      w.progress = Math.min(100, (w.progress || 0) + 4 + Math.random() * 3);
      if (w.scriptedWinDays > 0 && w.progress < 100) return;
      w.progress = 100;
      const att = w.attacker || GameState.player;
      const tgt = w.target;
      const opts = w.scriptedOpts || {};
      if (opts.provinces && opts.provinces.length) {
        transferNamedProvinces(tgt, att, opts.provinces);
      } else if (opts.annexAll) {
        Object.keys(provinceOwners).forEach(p => {
          if (provinceOwners[p] === tgt) provinceOwners[p] = att;
        });
        if (typeof refreshMapColors === "function") refreshMapColors();
        log(tgt + " tamamen " + att + " kontrolüne geçti (scripted).", "text-amber-300");
      } else {
        transferSomeProvinces(tgt, att, opts.maxFallback || 4);
      }
      if (typeof opts.onDone === "function") try { opts.onDone(att, tgt); } catch (e) {}
      // Savaşı kapat
      w._scriptedDone = true;
    });
    GameState.activeWars = GameState.activeWars.filter(w => !w._scriptedDone);
  }
  window.processScriptedWars = processScriptedWars;
  window.transferNamedProvinces = transferNamedProvinces;
  window.scriptedWar = scriptedWar;

  function addRel(iso, delta) {
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[iso] = Math.max(-100, Math.min(100, (GameState.relations[iso] || 0) + delta));
  }

  function ensureWar(attacker, target) {
    if (!GameState.activeWars) GameState.activeWars = [];
    if (GameState.activeWars.some(w => (w.target === target && (w.attacker === attacker || !w.attacker)))) return;
    GameState.activeWars.push({
      attacker: attacker,
      target: target,
      progress: 0,
      start: GameState.date ? new Date(GameState.date) : new Date()
    });
    GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 12);
    if (GameState.relations) {
      GameState.relations[target] = Math.min(-80, (GameState.relations[target] || 0) - 40);
    }
  }

  function addAlliance(a, b) {
    if (!GameState.alliances) GameState.alliances = [];
    if (GameState.alliances.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return;
    GameState.alliances.push({ a, b });
  }

  function bumpWS(delta) {
    if (!GameState.v27) GameState.v27 = { warSupport: 55 };
    GameState.v27.warSupport = Math.max(0, Math.min(100, (GameState.v27.warSupport || 55) + delta));
  }

  function bumpStab(delta) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.stability = Math.max(0, Math.min(100, (p.stability || 50) + delta));
  }

  function giveMP(n) {
    const p = GameState.countries[GameState.player];
    if (p) p.manpower = (p.manpower || 0) + n;
  }

  function giveMoney(n) {
    const p = GameState.countries[GameState.player];
    if (p) p.money = Math.max(0, (p.money || 0) + n);
  }

  function giveDivs(n) {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    p.divisions = p.divisions || {};
    p.divisions.inf = (p.divisions.inf || 0) + n;
  }

  // Registry: id -> event definition
  const HIST = {};

  function def(ev) {
    HIST[ev.id] = ev;
  }

  // ========== WW2 CHAIN (techEra 2 or scenario ww2, years 1936-1945) ==========

  def({
    id: "ww2_spanish_civil_war",
    title: "İspanya İç Savaşı",
    text: "1936: İspanya'da cumhuriyetçiler ile milliyetçiler arasında iç savaş patladı. Avrupa güçleri müdahale etmeye çağrılıyor. Hangi tarafı desteklersiniz?",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1936, yearMax: 1939,
    monthMin: 1,
    once: true,
    forPlayer: null, // any
    priority: 10,
    choices: [
      {
        label: "Milliyetçilere gönüllü + malzeme gönder (−200💰, −5K👤, gerilim +4)",
        effect: (p) => {
          giveMoney(-200); giveMP(-5000);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 4);
          setFlag("spain_nationalist_aid", true);
          bumpWS(3);
          log("🇪🇸 İspanya: Milliyetçi tarafa destek verildi.", "text-amber-300");
        }
      },
      {
        label: "Cumhuriyetçilere yardım (−150💰, istikrar +2)",
        effect: (p) => {
          giveMoney(-150); bumpStab(2);
          setFlag("spain_republican_aid", true);
          addRel("FRA", 8); addRel("SOV", 5); addRel("RUS", 5);
          log("🇪🇸 İspanya: Cumhuriyetçi tarafa yardım.", "text-cyan-300");
        }
      },
      {
        label: "Tarafsız kal (istikrar +3, savaş desteği −2)",
        effect: () => { bumpStab(3); bumpWS(-2); setFlag("spain_neutral", true); }
      }
    ]
  });

  def({
    id: "ww2_anschluss_hint",
    title: "Avusturya Krizi (Anschluss)",
    text: "Almanya, Avusturya ile birleşmeyi dayatıyor. Avrupa sessiz kalırsa denge bozulacak.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1938, yearMax: 1938,
    monthMin: 2, monthMax: 4,
    once: true,
    requireFlagAbsent: "anschluss_done",
    choices: [
      {
        label: "Protesto et (DEU ile ilişki −15, gerilim +3)",
        effect: () => { addRel("DEU", -15); GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 3); }
      },
      {
        label: "Sessiz kal (gerilim +6, savaş desteği −4)",
        effect: () => {
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 6);
          bumpWS(-4);
          setFlag("anschluss_done", true);
          // soft transfer few AUT provinces to DEU if exist
          if (countryAlive("AUT") && countryAlive("DEU")) {
            const n = transferSomeProvinces("AUT", "DEU", 4);
            if (n) log("🇦🇹 Anschluss: " + n + " eyalet Almanya'ya bağlandı (simülasyon).", "text-red-300");
          }
        }
      },
      {
        label: "Almanya'yı destekle (DEU +20 ilişki)",
        effect: () => {
          addRel("DEU", 20); setFlag("anschluss_done", true);
          if (countryAlive("AUT") && countryAlive("DEU")) transferSomeProvinces("AUT", "DEU", 4);
        }
      }
    ]
  });

  def({
    id: "ww2_munich",
    title: "Münih Krizi — Südetler",
    text: "1938: Hitler Südetlerin Almanya'ya verilmesini istiyor. Chamberlain 'barış için zaman' diyor. Siz ne yaparsınız?",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1938, yearMax: 1939,
    monthMin: 9, monthMax: 10,
    once: true,
    requireFlagAbsent: "munich_done",
    choices: [
      {
        label: "Münih Anlaşması'nı kabul et (barış şansı, gerilim +8)",
        effect: () => {
          setFlag("munich_done", true); setFlag("sudeten_to_deu", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 8);
          bumpWS(-5);
          if (countryAlive("CZE") && countryAlive("DEU")) transferSomeProvinces("CZE", "DEU", 3);
          else if (countryAlive("SVK") && countryAlive("DEU")) transferSomeProvinces("SVK", "DEU", 2);
          log("📜 Münih: Südetler Almanya'ya bırakıldı.", "text-yellow-300");
          if (typeof showNewspaper === "function") {
            try { showNewspaper("MÜNİH ANLAŞMASI", "Avrupa 'barış' diye toprağı sattı. Südetler Reich'a bağlandı."); } catch(e){}
          }
        }
      },
      {
        label: "Çekoslovakya'yı destekle — savaş riski (gerilim +15, DEU −30)",
        effect: () => {
          setFlag("munich_done", true); setFlag("munich_refused", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 15);
          addRel("DEU", -30); bumpWS(8);
          if (playerIs("GBR", "FRA", "POL")) {
            // path to war later
            setFlag("allied_guarantee_cze", true);
          }
          log("⚔️ Münih reddedildi — gerilim tırmandı.", "text-red-400");
        }
      },
      {
        label: "Almanya saflarında ol (DEU +25, istikrar −3)",
        effect: () => {
          setFlag("munich_done", true); setFlag("sudeten_to_deu", true);
          addRel("DEU", 25); bumpStab(-3);
          if (countryAlive("CZE") && countryAlive("DEU")) transferSomeProvinces("CZE", "DEU", 3);
        }
      }
    ]
  });

  def({
    id: "ww2_prague",
    title: "Bohemya-Moravya İşgali",
    text: "Mart 1939: Almanya, Münih'e rağmen Prag'a yürüyor. Çekoslovakya fiilen yok ediliyor.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1939, yearMax: 1939,
    monthMin: 3, monthMax: 4,
    once: true,
    requireFlag: "munich_done",
    requireFlagAbsent: "prague_done",
    choices: [
      {
        label: "Kınama yayınla (gerilim +10, DEU −20)",
        effect: () => {
          setFlag("prague_done", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 10);
          addRel("DEU", -20); bumpWS(5);
          if (countryAlive("CZE") && countryAlive("DEU")) transferSomeProvinces("CZE", "DEU", 6);
          log("🇨🇿 Prag düştü — Avrupa şokta.", "text-red-400");
        }
      },
      {
        label: "Savaş tehdidi (DEU ile kriz, gerilim +18)",
        effect: () => {
          setFlag("prague_done", true); setFlag("anti_german_bloc", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 18);
          addRel("DEU", -40); bumpWS(10);
          if (countryAlive("CZE") && countryAlive("DEU")) transferSomeProvinces("CZE", "DEU", 6);
        }
      },
      {
        label: "Almanya'nın 'haklı' olduğunu söyle",
        effect: () => {
          setFlag("prague_done", true); addRel("DEU", 15); bumpStab(-5);
          if (countryAlive("CZE") && countryAlive("DEU")) transferSomeProvinces("CZE", "DEU", 6);
        }
      }
    ]
  });

  def({
    id: "ww2_vienna_award",
    title: "Birinci Viyana Ödülü",
    text: "Kasım 1938: Almanya–İtalya hakemliği. Macaristan'a Güney Slovakya ve Podkarpatská Rus devredilir (isimli eyaletler, rastgele değil).",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1938, yearMax: 1939,
    monthMin: 11, monthMax: 12,
    once: true,
    priority: 70,
    choices: [
      {
        label: "Ödülü uygula — Southern_Slovakia + Podkarpatská_Rus → HUN",
        effect: () => {
          setFlag("vienna_award", true);
          const list = ["Southern_Slovakia", "Podkarpatská_Rus"];
          list.forEach(p => {
            if (provinceOwners[p] && provinceOwners[p] !== "HUN") {
              const from = provinceOwners[p];
              provinceOwners[p] = "HUN";
              log("Viyana I: " + p + " (" + from + " → HUN)", "text-amber-300");
            }
          });
          if (typeof transferNamedProvinces === "function") {
            transferNamedProvinces("SVK", "HUN", list);
            transferNamedProvinces("CZE", "HUN", list);
          }
          addRel("HUN", 20); addRel("CZE", -10);
          if (typeof refreshMapColors === "function") refreshMapColors();
        }
      },
      {
        label: "Reddet (gerilim +5)",
        effect: () => { setFlag("vienna_award", true); GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 5); }
      }
    ]
  });

  def({
    id: "ww2_second_vienna_award",
    title: "İkinci Viyana Ödülü — Kuzey Transilvanya",
    text: "Ağustos 1940: Kuzey Transilvanya (North_Transylvania) Macaristan'a verilir. Güney Transilvanya Romanya'da kalır.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 8, monthMax: 9,
    once: true,
    priority: 82,
    choices: [
      {
        label: "North_Transylvania → Macaristan",
        effect: () => {
          setFlag("second_vienna", true);
          if (provinceOwners["North_Transylvania"] === "ROU" || provinceOwners["North_Transylvania"]) {
            const from = provinceOwners["North_Transylvania"];
            provinceOwners["North_Transylvania"] = "HUN";
            log("İkinci Viyana: North_Transylvania (" + from + " → HUN)", "text-amber-300");
          }
          // Crisana bazen pakete dahil
          if (provinceOwners["Crisana"] === "ROU") {
            provinceOwners["Crisana"] = "HUN";
            log("İkinci Viyana: Crisana (ROU → HUN)", "text-amber-300");
          }
          addRel("HUN", 25); addRel("ROU", -25);
          if (typeof refreshMapColors === "function") refreshMapColors();
        }
      },
      {
        label: "Romanya'nın bütünlüğünü savun (HUN −20)",
        effect: () => {
          setFlag("second_vienna", true);
          addRel("HUN", -20); addRel("ROU", 15);
          // Tarihsel baskı: yine de transfer
          if (provinceOwners["North_Transylvania"] === "ROU") {
            provinceOwners["North_Transylvania"] = "HUN";
            log("İkinci Viyana (zorunlu): North_Transylvania → HUN", "text-amber-300");
            if (typeof refreshMapColors === "function") refreshMapColors();
          }
        }
      }
    ]
  });

  def({
    id: "ww2_bessarabia_ultimatum",
    title: "SSCB Ültimatomu — Besarabya",
    text: "Haziran 1940: Moskova Romanya'dan Bessarabia ve Southern_Bessarabia'yı ister. Bucovina da baskı altındadır.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 6, monthMax: 7,
    once: true,
    priority: 84,
    choices: [
      {
        label: "Ültimatomu kabul et — Bessarabia + Southern_Bessarabia → RUS",
        effect: () => {
          setFlag("bessarabia_taken", true);
          ["Bessarabia", "Southern_Bessarabia"].forEach(p => {
            if (provinceOwners[p] === "ROU") {
              provinceOwners[p] = "RUS";
              log("Besarabya: " + p + " (ROU → RUS)", "text-red-400");
            }
          });
          // Kuzey Bucovina tarihsel olarak da gitti
          if (provinceOwners["Bucovina"] === "ROU") {
            provinceOwners["Bucovina"] = "RUS";
            log("Besarabya: Bucovina (ROU → RUS)", "text-red-400");
          }
          addRel("RUS", 10); addRel("ROU", -30);
          if (typeof refreshMapColors === "function") refreshMapColors();
        }
      },
      {
        label: "Reddet — yine de SSCB alır (scripted)",
        effect: () => {
          setFlag("bessarabia_taken", true);
          ["Bessarabia", "Southern_Bessarabia", "Bucovina"].forEach(p => {
            if (provinceOwners[p] === "ROU") provinceOwners[p] = "RUS";
          });
          log("Besarabya zorla alındı: Bessarabia, Southern_Bessarabia, Bucovina → RUS", "text-red-400");
          if (typeof ensureWar === "function" && countryAlive("ROU") && countryAlive("RUS")) {
            // kısa gerilim; toprak zaten gitti
          }
          addRel("RUS", -5); addRel("ROU", -10);
          if (typeof refreshMapColors === "function") refreshMapColors();
        }
      }
    ]
  });

  def({
    id: "ww2_tripartite_pact",
    title: "Üçlü Pakt",
    text: "Eylül 1940: Almanya, İtalya ve Japonya askeri ittifakı. Macaristan, Romanya, Bulgaristan katılım için baskı altında.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1941,
    monthMin: 9, monthMax: 12,
    once: true,
    priority: 60,
    choices: [
      {
        label: "Mihver'e yaklaş (DEU/ITA +15)",
        effect: () => {
          setFlag("tripartite", true);
          addRel("DEU", 15); addRel("ITA", 12); addRel("JPN", 10); addRel("GBR", -10); addRel("USA", -8);
          if (typeof addAlliance === "function") {
            try { addAlliance("DEU", "ITA"); addAlliance("DEU", "JPN"); } catch(e){}
          }
          bumpWS(5);
        }
      },
      {
        label: "Tarafsız kal",
        effect: () => { setFlag("tripartite", true); bumpStab(3); }
      }
    ]
  });

  def({
    id: "ww2_barbarossa",
    title: "Barbarossa Harekâtı",
    text: "Haziran 1941: Almanya SSCB'ye savaş açar. Doğu cephesi açılır (scripted savaş).",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1941, yearMax: 1941,
    monthMin: 6, monthMax: 7,
    once: true,
    priority: 98,
    requireFlag: "ww2_started",
    choices: [
      {
        label: "Barbarossa — DEU savaş ilanı RUS'a",
        effect: () => {
          setFlag("barbarossa", true);
          if (typeof ensureWar === "function") ensureWar("DEU", "RUS");
          if (typeof scriptedWar === "function") {
            // uzun cephe, kesin değil — sadece savaş
          }
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 25);
          bumpWS(12);
          if (typeof showNewspaper === "function") try { showNewspaper("BARBAROSSA", "Doğu cephesi alevler içinde."); } catch(e){}
          log("Barbarossa: Almanya → SSCB savaşta.", "text-red-500 font-bold");
        }
      },
      {
        label: "Ertele (gerilim +10)",
        effect: () => {
          setFlag("barbarossa_delayed", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 10);
          histState().queue.push({ id: "ww2_barbarossa", afterDays: 30 });
        }
      }
    ]
  });

  def({
    id: "ww2_pearl_harbor",
    title: "Pearl Harbor",
    text: "7 Aralık 1941: Japonya ABD'ye saldırır. Pasifik savaşı başlar.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1941, yearMax: 1941,
    monthMin: 12, monthMax: 12,
    once: true,
    priority: 97,
    choices: [
      {
        label: "Pasifik savaşı — JPN ↔ USA",
        effect: () => {
          setFlag("pearl_harbor", true);
          if (typeof ensureWar === "function") {
            ensureWar("JPN", "USA");
            ensureWar("JPN", "GBR");
            if (countryAlive("DEU")) ensureWar("DEU", "USA");
          }
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 20);
          log("Pearl Harbor: ABD savaşa girdi.", "text-red-500");
          if (typeof showNewspaper === "function") try { showNewspaper("PEARL HARBOR", "Amerika ateş altında — dünya savaşı küresel."); } catch(e){}
        }
      },
      {
        label: "Diplomatik gerilim (savaş yok)",
        effect: () => {
          setFlag("pearl_harbor", true);
          addRel("JPN", -40); addRel("USA", -20);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 12);
        }
      }
    ]
  });

  def({
    id: "ww2_ops_weser",
    title: "Weserübung — Danimarka ve Norveç",
    text: "Nisan 1940: Almanya Danimarka ve Norveç'i işgal eder (scripted ilhak).",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 4, monthMax: 5,
    once: true,
    priority: 80,
    requireFlag: "ww2_started",
    choices: [
      {
        label: "İşgali uygula — DEN/NOR → DEU",
        effect: () => {
          setFlag("weserubung", true);
          ["DEN", "DNK", "NOR"].forEach(t => {
            if (typeof annexAllFrom === "function" && Object.values(provinceOwners).some(o => o === t)) {
              annexAllFrom(t, "DEU");
            } else if (typeof transferSomeProvinces === "function" && countryAlive(t)) {
              transferSomeProvinces(t, "DEU", 99);
            }
          });
          if (typeof ensureWar === "function") {
            try { ensureWar("DEU", "GBR"); } catch(e){}
          }
        }
      },
      {
        label: "Müttefik tepkisi (gerilim +8)",
        effect: () => {
          setFlag("weserubung", true);
          addRel("GBR", 10); addRel("DEU", -10);
          ["DEN", "DNK", "NOR"].forEach(t => {
            if (typeof annexAllFrom === "function" && Object.values(provinceOwners).some(o => o === t)) annexAllFrom(t, "DEU");
          });
        }
      }
    ]
  });

  def({
    id: "ww2_danzig",
    title: "Danzig veya Savaş!",
    text: "Eylül 1939: Almanya Polonya'dan Danzig Koridoru'nu istiyor. Ültimatom reddedilirse Avrupa savaşa sürüklenir. İkinci Dünya Savaşı'nın kıvılcımı.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1939, yearMax: 1939,
    monthMin: 8, monthMax: 9,
    once: true,
    priority: 100,
    requireFlagAbsent: "ww2_started",
    choices: [
      {
        label: "Polonya'ya güvenlik garantisi ver — savaşa hazırlan",
        effect: () => {
          setFlag("ww2_started", true); setFlag("allies_poland", true); try { joinFaction("GBR","allies",true); joinFaction("FRA","allies",true); joinFaction("POL","allies",false); joinFaction("DEU","axis",true); } catch(e){}
          bumpWS(15); GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 25);
          addRel("POL", 30); addRel("DEU", -50);
          if (playerIs("GBR", "FRA", "POL") || true) {
            if (countryAlive("DEU") && countryAlive("POL")) {
              ensureWar(playerIs("DEU") ? "DEU" : "DEU", "POL");
              // player joins if allied path
              if (playerIs("GBR", "FRA", "POL")) {
                ensureWar(GameState.player === "POL" ? "DEU" : GameState.player, playerIs("POL") ? "DEU" : "DEU");
              }
            }
          }
          if (typeof showNewspaper === "function") {
            try { showNewspaper("SAVAŞ!", "Almanya Polonya'ya yürüdü. Avrupa alevler içinde."); } catch(e){}
          }
          log("⚔️ II. Dünya Savaşı başladı — Danzig krizi!", "text-red-500 font-black");
          if (typeof showToast === "function") showToast("II. Dünya Savaşı başladı!", "war");
        }
      },
      {
        label: "Alman ültimatomunu destekle (POL −40, DEU +25)",
        effect: () => {
          setFlag("ww2_started", true); setFlag("axis_path", true);
          addRel("POL", -40); addRel("DEU", 25); bumpWS(5);
          if (countryAlive("POL") && countryAlive("DEU")) {
            scriptedWar("DEU", "POL", 16, {
              provinces: ["Danzig", "Gdynia", "Poznan", "Lodz"].filter(p => provinceOwners[p] === "POL"),
              maxFallback: 6
            });
          }
          log("🌑 Danzig: Almanya'nın talebi desteklendi.", "text-slate-300");
        }
      },
      {
        label: "Son bir diplomatik konferans dene (gerilim +10, gecikme)",
        effect: () => {
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 10);
          bumpStab(2); bumpWS(-3);
          // delay war: queue event
          setFlag("danzig_delayed", true);
          histState().queue.push({ id: "ww2_danzig_fallback", afterDays: 21 });
        }
      }
    ]
  });

  def({
    id: "ww2_danzig_fallback",
    title: "Konferans Çöktü — Savaş",
    text: "Diplomatik çabalar sonuçsuz kaldı. Alman zırhlıları Polonya sınırında.",
    scenario: ["ww2"],
    era: [2],
    once: true,
    manualOnly: true, // only from queue
    choices: [
      {
        label: "Savaşa gir",
        effect: () => {
          setFlag("ww2_started", true);
          if (countryAlive("DEU") && countryAlive("POL")) ensureWar("DEU", "POL");
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 20);
          bumpWS(12);
          log("⚔️ Savaş kaçınılmaz hale geldi.", "text-red-500");
        }
      },
      {
        label: "Hâlâ tarafsız kal (istikrar −8)",
        effect: () => {
          setFlag("ww2_started", true); bumpStab(-8); bumpWS(-10);
          if (countryAlive("DEU") && countryAlive("POL")) ensureWar("DEU", "POL");
        }
      }
    ]
  });

  def({
    id: "ww2_weserubung",
    title: "Weserübung — Danimarka & Norveç",
    text: "1940: Almanya İskandinavya'ya çıkarma planlıyor. Danimarka ve Norveç ültimatom altında.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 4, monthMax: 5,
    once: true,
    requireFlag: "ww2_started",
    choices: [
      {
        label: "Müttefikleri destekle (gerilim +5, −100💰 yardım)",
        effect: () => { giveMoney(-100); bumpWS(4); addRel("GBR", 10); addRel("DEU", -10); }
      },
      {
        label: "Alman operasyonuna göz yum",
        effect: () => {
          addRel("DEU", 12);
          if (countryAlive("DEN") && countryAlive("DEU")) transferSomeProvinces("DEN", "DEU", 2);
          if (countryAlive("NOR") && countryAlive("DEU")) transferSomeProvinces("NOR", "DEU", 2);
        }
      },
      { label: "Tarafsız kal", effect: () => { bumpStab(2); } }
    ]
  });

  def({
    id: "ww2_benelux",
    title: "Benelüks Ültimatomu",
    text: "Almanya, Belçika-Hollanda-Lüksemburg üzerinden Fransa'ya yürüyüş için geçiş hakkı istiyor — veya işgal.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 5, monthMax: 6,
    once: true,
    requireFlag: "ww2_started",
    choices: [
      {
        label: "Fransa/İngiltere ile savunma hattı",
        effect: () => {
          addRel("FRA", 15); addRel("GBR", 15); addRel("DEU", -20); bumpWS(6);
          if (playerIs("FRA", "GBR", "BEL", "NLD") && countryAlive("DEU")) ensureWar(GameState.player, "DEU");
        }
      },
      {
        label: "Geçiş izni ver (DEU +15, istikrar −6)",
        effect: () => { addRel("DEU", 15); bumpStab(-6); }
      },
      { label: "Protesto et, savaşma", effect: () => { GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 5); } }
    ]
  });

  def({
    id: "ww2_baltic_ultimatum",
    title: "Baltık Ültimatomu",
    text: "1940: Moskova, Estonya / Letonya / Litvanya'ya üs ve geçiş dayatıyor. Red = Kızıl Ordu. Scripted savaş: SSCB kısa sürede kesin galip; eyaletler isimle devredilir.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1939, yearMax: 1940,
    monthMin: 6, monthMax: 10,
    once: true,
    priority: 85,
    choices: [
      {
        label: "Ültimatomu izle — SSCB Baltık seferine girişir",
        effect: () => {
          setFlag("baltic_occupied", true);
          const hints = {
            EST: ["Estonia", "Tallinn", "Livonia", "Saaremaa", "Narva"],
            LVA: ["Latvia", "Riga", "Kurzeme", "Latgale", "Vidzeme", "Liepaja"],
            LTU: ["Lithuania", "Kaunas", "Vilnius", "Memel", "Klaipeda", "Wilno"]
          };
          ["EST", "LVA", "LTU", "LAT", "LIT"].forEach(tag => {
            if (!countryAlive(tag)) return;
            const key = tag === "LAT" ? "LVA" : tag === "LIT" ? "LTU" : tag;
            const all = Object.keys(provinceOwners || {});
            const named = all.filter(p => {
              if (provinceOwners[p] !== tag) return false;
              const low = p.toLowerCase();
              return (hints[key] || []).some(h => low.includes(h.toLowerCase())) || true;
            });
            // Tüm Baltık eyaletleri (ülkenin hepsi) — kesin ilhak scripted savaş ile
            scriptedWar("RUS", tag, 10, {
              provinces: named.length ? named : undefined,
              annexAll: true,
              onDone: () => log("Baltık seferi: " + tag + " → RUS (scripted zafer)", "text-red-400")
            });
          });
          // Tag yoksa isimle RUS'a
          const orphan = Object.keys(provinceOwners || {}).filter(p =>
            /estonia|latvia|lithuania|riga|tallinn|kaunas|livonia|kurzeme|klaipeda|wilno|memel/i.test(p) &&
            provinceOwners[p] !== "RUS"
          );
          if (orphan.length) transferNamedProvinces(null, "RUS", orphan);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 12);
          if (typeof showNewspaper === "function") try { showNewspaper("BALTIK KRİZİ", "Kızıl Ordu kuzeye yürüyor."); } catch(e){}
        }
      },
      {
        label: "Batı protestosu (RUS −25, yine de sefer başlar)",
        effect: () => {
          setFlag("baltic_occupied", true);
          addRel("RUS", -25); addRel("GBR", 12);
          ["EST", "LVA", "LTU", "LAT", "LIT"].forEach(t => {
            if (countryAlive(t)) scriptedWar("RUS", t, 12, { annexAll: true });
          });
        }
      },
      {
        label: "Müdahale etme — sefer yine tarihsel akar",
        effect: () => {
          setFlag("baltic_occupied", true);
          ["EST", "LVA", "LTU", "LAT", "LIT"].forEach(t => {
            if (countryAlive(t)) scriptedWar("RUS", t, 8, { annexAll: true });
          });
        }
      }
    ]
  });

  def({
    id: "ww2_poland_invasion",
    title: "Polonya Seferi (1939)",
    text: "Almanya Polonya'ya saldırır; kısa süre sonra SSCB doğudan girer. Scripted: DEU batı eyaletleri, RUS doğu eyaletleri alır. Kazanma oranı scripted olarak kesinleşir.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1939, yearMax: 1939,
    monthMin: 9, monthMax: 10,
    once: true,
    priority: 95,
    choices: [
      {
        label: "Tarihsel bölünme — seferi başlat",
        effect: () => {
          setFlag("poland_partition", true);
          setFlag("ww2_started", true);
          const deuClaim = ["Danzig", "Gdynia", "Poznan", "Lodz", "Katowice", "Kielce", "Warszawa", "Płock", "West_Prussia", "Posen"];
          const sovClaim = ["Wilno", "Nowogródek", "Polesie", "Stanisławów", "Lwów", "Lwow", "Białystok", "Wilejka", "Lublin"];
          if (countryAlive("POL") && countryAlive("DEU")) {
            const west = deuClaim.filter(p => provinceOwners[p] === "POL");
            scriptedWar("DEU", "POL", 14, {
              provinces: west,
              maxFallback: 8,
              onDone: () => {
                const east = sovClaim.filter(p => provinceOwners[p] === "POL");
                if (countryAlive("RUS")) {
                  if (east.length) transferNamedProvinces("POL", "RUS", east);
                  else transferSomeProvinces("POL", "RUS", 5);
                }
                log("Polonya paylaşıldı: batı DEU, doğu RUS (eyalet listeli).", "text-red-400");
              }
            });
          }
          if (countryAlive("POL") && countryAlive("RUS")) ensureWar("RUS", "POL");
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 18);
          if (typeof showNewspaper === "function") try { showNewspaper("POLONYA", "İki cepheli işgal başladı."); } catch(e){}
        }
      },
      {
        label: "Müttefik garantisi — GBR/FRA savaşa girer",
        effect: () => {
          setFlag("poland_partition", true);
          setFlag("ww2_started", true);
          if (countryAlive("DEU") && countryAlive("POL")) {
            scriptedWar("DEU", "POL", 16, {
              provinces: ["Danzig", "Gdynia", "Poznan", "Lodz", "Katowice"].filter(p => provinceOwners[p] === "POL"),
              maxFallback: 10
            });
          }
          if (countryAlive("GBR") && countryAlive("DEU")) ensureWar("GBR", "DEU");
          if (countryAlive("FRA") && countryAlive("DEU")) ensureWar("FRA", "DEU");
          addAlliance("GBR", "FRA");
          bumpWS(10);
          log("Batı savaşa girdi: GBR & FRA → DEU", "text-red-500");
        }
      },
      {
        label: "Yalnızca nota (yine de Alman seferi scripted)",
        effect: () => {
          setFlag("poland_partition", true);
          setFlag("ww2_started", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 6);
          if (countryAlive("DEU") && countryAlive("POL")) {
            scriptedWar("DEU", "POL", 14, {
              provinces: ["Danzig", "Gdynia", "Poznan"].filter(p => provinceOwners[p] === "POL"),
              maxFallback: 8
            });
          }
        }
      }
    ]
  });

  def({
    id: "ww2_fall_gelb",
    title: "Gelb Planı — Batı Taarruzu",
    text: "1940: Ardenler üzerinden Benelüks ve Fransa. Scripted savaşlar: BEL/NLD kısa düşüş; FRA'dan isimli eyaletler.",
    scenario: ["ww2"],
    era: [2],
    yearMin: 1940, yearMax: 1940,
    monthMin: 5, monthMax: 6,
    once: true,
    priority: 88,
    requireFlag: "ww2_started",
    choices: [
      {
        label: "Taarruzu izle (scripted)",
        effect: () => {
          setFlag("fall_gelb", true);
          ["BEL", "NLD", "LUX"].forEach(t => {
            if (countryAlive(t) && countryAlive("DEU")) scriptedWar("DEU", t, 10, { annexAll: true });
          });
          if (countryAlive("FRA") && countryAlive("DEU")) {
            const fr = ["Alsace", "Lorraine", "Nord", "Normandy", "Picardy", "Ile_de_France"].filter(p => provinceOwners[p] === "FRA");
            scriptedWar("DEU", "FRA", 18, { provinces: fr, maxFallback: 6 });
          }
        }
      },
      {
        label: "Müttefik yardımı (−200💰)",
        effect: () => {
          setFlag("fall_gelb", true);
          giveMoney(-200); bumpWS(5); addRel("FRA", 12); addRel("DEU", -12);
          if (countryAlive("DEU") && countryAlive("FRA")) ensureWar("DEU", "FRA");
        }
      }
    ]
  });

  // ========== COLD WAR / MODERN ==========
  def({
    id: "cw_germany_split",
    title: "Almanya'nın Bölünmesi",
    text: "1945 sonrası: Almanya işgal bölgelerine ayrılıyor. Doğu-Batı bloku şekilleniyor.",
    scenario: ["modern"],
    era: [3],
    yearMin: 1945, yearMax: 1950,
    once: true,
    // modern scenario starts 2026 so this may not fire - also allow flag for alternate
    choices: [
      { label: "Batı bloğunu destekle", effect: () => { addRel("USA", 20); addRel("GBR", 15); addRel("RUS", -15); setFlag("cold_war", true); } },
      { label: "Doğu bloğunu destekle", effect: () => { addRel("RUS", 20); addRel("USA", -15); setFlag("cold_war", true); } },
      { label: "Bağlantısız kal", effect: () => { bumpStab(5); setFlag("nonaligned", true); } }
    ]
  });

  def({
    id: "cw_suez",
    title: "Süveyş Krizi",
    text: "1956: Mısır kanalı millileştirdi. Britanya-Fransa-İsrail müdahalesi dünyayı geriyor.",
    scenario: ["modern"],
    era: [3],
    yearMin: 1956, yearMax: 1957,
    once: true,
    choices: [
      { label: "Mısır'ı destekle (GBR/FRA −15, Arap +10)", effect: () => { addRel("GBR", -15); addRel("FRA", -15); giveMoney(50); } },
      { label: "Müdahaleyi destekle", effect: () => { addRel("GBR", 12); addRel("FRA", 12); GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 8); } },
      { label: "BM çizgisinde kal", effect: () => { bumpStab(3); } }
    ]
  });

  def({
    id: "cw_cuba",
    title: "Küba Füze Krizi",
    text: "1962: Sovyet füzeleri Küba'da. Dünya nükleer uçurumun kenarında. Nasıl bir tutum alırsınız?",
    scenario: ["modern"],
    era: [3],
    yearMin: 1962, yearMax: 1963,
    once: true,
    priority: 50,
    choices: [
      {
        label: "ABD ablukasını destekle (gerilim +12, RUS −20)",
        effect: () => {
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 12);
          addRel("USA", 15); addRel("RUS", -20); bumpWS(8);
          if (typeof showNewspaper === "function") try { showNewspaper("FÜZE KRİZİ", "Karayip'te nükleer gerilim — dünya nefesini tuttu."); } catch(e){}
        }
      },
      {
        label: "Moskova'nın egemenlik hakkını savun",
        effect: () => { addRel("RUS", 15); addRel("USA", -15); GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 10); }
      },
      {
        label: "Arabuluculuk öner (istikrar +4, gerilim −5)",
        effect: () => {
          bumpStab(4);
          GameState.globalTension = Math.max(0, (GameState.globalTension || 0) - 5);
          log("🕊️ Küba: Arabuluculuk teklif edildi.", "text-blue-300");
        }
      }
    ]
  });

  def({
    id: "modern_flashpoint",
    title: "Çağdaş Gerilim Noktası",
    text: "Günümüzde sınır krizleri, enerji şantajı ve siber saldırılar diplomasinin yerini alıyor. Ülkeniz nasıl konumlanacak?",
    scenario: ["modern"],
    era: [3],
    yearMin: 2020, yearMax: 2035,
    once: true,
    monthMin: 1,
    choices: [
      {
        label: "NATO/Batı ile hizalan (+ABD ilişki, askeri üretim)",
        effect: (p) => {
          addRel("USA", 18); addRel("GBR", 12);
          if (p) p.milFactories = (p.milFactories || 0) + 1;
          bumpWS(5); setFlag("modern_west", true);
        }
      },
      {
        label: "Çok kutuplu denge (istikrar +6, gerilim −3)",
        effect: () => { bumpStab(6); GameState.globalTension = Math.max(0, (GameState.globalTension || 0) - 3); setFlag("modern_balance", true); }
      },
      {
        label: "Sert güç yatırımı (−300💰, +3 tümen)",
        effect: () => { giveMoney(-300); giveDivs(3); bumpWS(8); }
      }
    ]
  });

  // ========== WW1 CHAIN ==========
  def({
    id: "ww1_sarajevo",
    title: "Saraybosna Suikastı",
    text: "28 Haziran 1914: Arşidük Franz Ferdinand Saraybosna'da suikasta uğradı. Avusturya-Macaristan Sırbistan'ı sorumlu tutuyor. Temmuz Krizi başlıyor.",
    scenario: ["ww1"],
    era: [1],
    yearMin: 1914, yearMax: 1914,
    monthMin: 6, monthMax: 7,
    once: true,
    priority: 100,
    choices: [
      {
        label: "Sırbistan'a ültimatomu destekle (AUT +20, SRB −30)",
        effect: () => {
          setFlag("sarajevo_done", true); setFlag("ultimatum_serbia", true);
          addRel("AUT", 20); addRel("SRB", -30); addRel("RUS", -10);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 15);
          bumpWS(6);
          if (typeof showNewspaper === "function") try { showNewspaper("SUİKAST!", "Saraybosna: Arşidük öldürüldü — Avrupa nefesini tuttu."); } catch(e){}
          log("📰 Saraybosna: Temmuz Krizi başladı.", "text-red-400");
        }
      },
      {
        label: "Sırbistan'ı savunan dil kullan (RUS +15, AUT −20)",
        effect: () => {
          setFlag("sarajevo_done", true); setFlag("serbia_backed", true);
          addRel("RUS", 15); addRel("SRB", 20); addRel("AUT", -20);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 12);
        }
      },
      {
        label: "Uluslararası soruşturma öner",
        effect: () => {
          setFlag("sarajevo_done", true); setFlag("sarajevo_mediation", true);
          bumpStab(3);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 8);
          histState().queue.push({ id: "ww1_july_ultimatum", afterDays: 14 });
        }
      }
    ]
  });

  def({
    id: "ww1_july_ultimatum",
    title: "Temmuz Ültimatomu",
    text: "Avusturya-Macaristan Sırbistan'a ağır ültimatom verdi. Kabul edilmezse savaş kaçınılmaz.",
    scenario: ["ww1"],
    era: [1],
    once: true,
    requireFlag: "sarajevo_done",
    choices: [
      {
        label: "Ültimatomu kabul etmeye çağır (barış şansı düşük)",
        effect: () => {
          setFlag("ww1_started", true);
          bumpWS(-4);
          // still cascade
          histState().queue.push({ id: "ww1_alliance_cascade", afterDays: 7 });
        }
      },
      {
        label: "Savaş — ittifakları devreye sok",
        effect: () => {
          setFlag("ww1_started", true); setFlag("july_war", true);
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 30);
          bumpWS(12);
          if (countryAlive("AUT") && countryAlive("SRB")) ensureWar("AUT", "SRB");
          histState().queue.push({ id: "ww1_alliance_cascade", afterDays: 3 });
          log("⚔️ 1914: Büyük Savaş'ın kapıları açıldı!", "text-red-500 font-black");
          if (typeof showToast === "function") showToast("I. Dünya Savaşı ateşlendi!", "war");
        }
      },
      {
        label: "Rusya seferberliğini destekle",
        effect: () => {
          setFlag("ww1_started", true);
          addRel("RUS", 20); addRel("AUT", -25); addRel("DEU", -15);
          if (countryAlive("AUT") && countryAlive("SRB")) ensureWar("AUT", "SRB");
          if (countryAlive("RUS") && countryAlive("AUT")) ensureWar("RUS", "AUT");
          histState().queue.push({ id: "ww1_alliance_cascade", afterDays: 2 });
        }
      }
    ]
  });

  def({
    id: "ww1_alliance_cascade",
    title: "İttifak Zinciri — Avrupa Alev Alıyor",
    text: "Sırbistan'a savaş ilanı ittifakları tetikledi: Rusya seferber, Almanya Rusya'ya, Fransa Almanya'ya, İngiltere belirsiz... Zincirleme savaş başlıyor.",
    scenario: ["ww1"],
    era: [1],
    once: true,
    manualOnly: true,
    priority: 90,
    choices: [
      {
        label: "İttifak yükümlülüğünü yerine getir — savaşa gir",
        effect: () => {
          setFlag("ww1_cascade", true);
          bumpWS(15);
          const p = GameState.player;
          // generic major war links
          if (playerIs("DEU", "AUT")) {
            if (countryAlive("RUS")) ensureWar(p, "RUS");
            if (countryAlive("FRA")) ensureWar(p, "FRA");
          } else if (playerIs("RUS", "SRB", "FRA", "GBR")) {
            if (countryAlive("DEU")) ensureWar(p, "DEU");
            if (countryAlive("AUT")) ensureWar(p, "AUT");
          } else {
            if (countryAlive("DEU") && countryAlive("RUS")) ensureWar("DEU", "RUS");
            if (countryAlive("DEU") && countryAlive("FRA")) ensureWar("DEU", "FRA");
          }
          addAlliance("DEU", "AUT");
          addAlliance("FRA", "RUS");
          if (typeof showNewspaper === "function") try { showNewspaper("BÜYÜK SAVAŞ", "İttifaklar ateşledi — Avrupa genel savaşta."); } catch(e){}
        }
      },
      {
        label: "Tarafsızlık ilan et (istikrar +5, prestij −)",
        effect: () => { bumpStab(5); bumpWS(-8); setFlag("ww1_neutral", true); }
      },
      {
        label: "Sınırlı seferberlik (tümen +2, −150💰)",
        effect: () => { giveDivs(2); giveMoney(-150); bumpWS(5); setFlag("ww1_partial", true); }
      }
    ]
  });

  def({
    id: "ww1_goeben",
    title: "Göben ve Breslau (Yavuz & Midilli)",
    text: "Alman savaş gemileri Göben ve Breslau Osmanlı sularına sığındı. Gemilerin 'satın alınması' Osmanlı'yı İttifak'a çekebilir.",
    scenario: ["ww1"],
    era: [1],
    yearMin: 1914, yearMax: 1914,
    monthMin: 8, monthMax: 11,
    once: true,
    requireFlag: "ww1_started",
    choices: [
      {
        label: "Osmanlı'nın savaşa girmesini destekle (TUR +25)",
        effect: () => {
          setFlag("ottoman_entry", true);
          addRel("TUR", 25); addRel("DEU", 15); addRel("GBR", -15);
          if (playerIs("TUR") && countryAlive("RUS")) ensureWar("TUR", "RUS");
          if (playerIs("TUR") && countryAlive("GBR")) ensureWar("TUR", "GBR");
          if (!playerIs("TUR") && countryAlive("TUR") && countryAlive("RUS")) ensureWar("TUR", "RUS");
          log("⚓ Yavuz & Midilli: Osmanlı savaşa sürüklendi.", "text-amber-300");
        }
      },
      {
        label: "Osmanlı tarafsız kalsın (TUR istikrar)",
        effect: () => {
          if (playerIs("TUR")) { bumpStab(8); bumpWS(-5); }
          addRel("TUR", 5); setFlag("ottoman_neutral", true);
        }
      },
      {
        label: "İtilaf lehine baskı yap",
        effect: () => { addRel("GBR", 12); addRel("FRA", 10); addRel("TUR", -10); addRel("DEU", -8); }
      }
    ]
  });

  def({
    id: "ww1_london_treaty",
    title: "Londra Antlaşması — İtalya'nın Tarafı",
    text: "Gizli görüşmeler: İtalya'ya toprak vaadi karşılığında İtilaf safına geçmesi teklif ediliyor.",
    scenario: ["ww1"],
    era: [1],
    yearMin: 1915, yearMax: 1915,
    monthMin: 4, monthMax: 5,
    once: true,
    requireFlag: "ww1_started",
    choices: [
      {
        label: "İtalya'yı İtilaf'a çek (ITA +20, AUT −25)",
        effect: () => {
          setFlag("italy_switches", true);
          addRel("ITA", 20); addRel("AUT", -25); addRel("DEU", -10);
          if (countryAlive("ITA") && countryAlive("AUT")) ensureWar("ITA", "AUT");
          log("🇮🇹 Londra: İtalya taraf değiştirdi.", "text-cyan-300");
        }
      },
      {
        label: "İtalya'yı İttifak'ta tutmaya çalış",
        effect: () => { addRel("ITA", 10); addRel("AUT", 8); setFlag("italy_central", true); }
      },
      { label: "Umursama", effect: () => { GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 3); } }
    ]
  });

  def({
    id: "ww1_sykes_picot",
    title: "Gizli Paylaşım (Sykes-Picot tarzı)",
    text: "İtilaf devletleri Osmanlı topraklarının savaş sonrası paylaşımını konuşuyor. Haritalar yeniden çiziliyor...",
    scenario: ["ww1"],
    era: [1],
    yearMin: 1916, yearMax: 1917,
    once: true,
    requireFlag: "ww1_started",
    choices: [
      {
        label: "Paylaşım planını destekle (GBR/FRA +15, TUR −30)",
        effect: () => {
          addRel("GBR", 15); addRel("FRA", 15); addRel("TUR", -30);
          setFlag("sykes_picot", true);
          bumpWS(playerIs("TUR") ? -10 : 4);
          log("🗺️ Gizli anlaşma: Ortadoğu pazarlığı.", "text-yellow-400");
        }
      },
      {
        label: "Osmanlı toprak bütünlüğünü savunan açıklama",
        effect: () => { addRel("TUR", 20); addRel("GBR", -10); addRel("FRA", -10); }
      },
      {
        label: "Açığa vur — skandal (gerilim +8, istikrar −3)",
        effect: () => {
          GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 8);
          bumpStab(-3); setFlag("sykes_leaked", true);
        }
      }
    ]
  });

  // ---------- Engine ----------
  function matchesFilters(ev) {
    if (ev.manualOnly) return false;
    if (ev.once && hasFired(ev.id)) return false;
    // Senaryo veya tech era uyumu
    if (ev.scenario && ev.scenario.length) {
      const sid = scenId();
      const scenOk = ev.scenario.includes(sid);
      const eraOk = ev.era && ev.era.length && ev.era.includes(techEra());
      if (!scenOk && !eraOk) return false;
    } else if (ev.era && ev.era.length && !ev.era.includes(techEra())) {
      return false;
    }
    if (ev.yearMin != null && yearNow() < ev.yearMin) return false;
    if (ev.yearMax != null && yearNow() > ev.yearMax) return false;
    if (ev.monthMin != null && monthNow() < ev.monthMin) return false;
    if (ev.monthMax != null && monthNow() > ev.monthMax) return false;
    if (ev.requireFlag && !getFlag(ev.requireFlag)) return false;
    if (ev.requireFlagAbsent && getFlag(ev.requireFlagAbsent)) return false;
    if (ev.forPlayer && !playerIs(...(Array.isArray(ev.forPlayer) ? ev.forPlayer : [ev.forPlayer]))) return false;
    return true;
  }

  function findHistoricalEvent(id) {
    return HIST[id] || null;
  }

  function showHistoricalEvent(ev) {
    if (!ev || document.getElementById("event-modal")) return;
    // Adapt to showEventModal format
    const adapted = {
      id: ev.id,
      title: "📜 " + ev.title,
      text: ev.text + (ev.scenario ? `<div class="mt-2 text-[9px] text-slate-500">Tarihsel zincir · ${yearNow()}</div>` : ""),
      choices: ev.choices,
      _historical: true
    };
    GameState._pendingEvent = adapted;
    GameState._pendingHistoricalId = ev.id;
    if (typeof showEventModal === "function") {
      showEventModal(adapted);
    }
  }

  // Patch resolveEventChoice to mark historical fired
  const _origResolve = typeof resolveEventChoice === "function" ? resolveEventChoice : null;
  window.resolveEventChoice = function(evId, idx) {
    if (_origResolve) _origResolve(evId, idx);
    else {
      // fallback minimal
      const ev = GameState._pendingEvent;
      document.getElementById("event-modal")?.remove();
      if (ev && ev.choices && ev.choices[idx] && ev.choices[idx].effect) {
        ev.choices[idx].effect(GameState.countries[GameState.player]);
      }
    }
    if (GameState._pendingHistoricalId) {
      markFired(GameState._pendingHistoricalId);
      GameState._pendingHistoricalId = null;
    } else if (HIST[evId]) {
      markFired(evId);
    }
    try {
      if (typeof updateHUD === "function") updateHUD();
      if (typeof renderV27Panel === "function") renderV27Panel();
    } catch (e) {}
  };

  // Queue processor (afterDays)
  function processHistQueue() {
    const st = histState();
    if (!st.queue || !st.queue.length) return;
    st.queue.forEach(q => {
      if (q.afterDays == null) q.afterDays = 0;
      q.afterDays--;
    });
    const ready = st.queue.filter(q => q.afterDays <= 0);
    st.queue = st.queue.filter(q => q.afterDays > 0);
    ready.forEach(q => {
      if (hasFired(q.id)) return;
      const ev = HIST[q.id];
      if (ev && !document.getElementById("event-modal")) {
        showHistoricalEvent(ev);
      }
    });
  }

  window.processHistoricalEvents = function() {
    if (!eventsOn() || GameState.gameOver) return;
    try { if (typeof processScriptedWars === "function") processScriptedWars(); } catch (e) {}
    if (document.getElementById("event-modal")) return;

    processHistQueue();
    if (document.getElementById("event-modal")) return;

    // Candidate events
    const list = Object.values(HIST).filter(matchesFilters);
    if (!list.length) return;

    // Don't spam: ~12% chance per day when candidates exist, higher if priority
    list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const top = list[0];
    const chance = (top.priority || 0) >= 90 ? 0.45 : (top.priority || 0) >= 40 ? 0.2 : 0.1;
    if (Math.random() > chance) return;

    showHistoricalEvent(top);
  };

  // Soft date align for scenarios: if ww1 and date year wrong, still allow 1914 events by mapping
  // (GameState.date should already be set from scenario year)

  // Hook into gameTick companion
  if (!window._histEventsInterval) {
    window._histEventsInterval = setInterval(() => {
      if (typeof GameState === "undefined" || !GameState.running || GameState.gameOver) return;
      if (typeof processHistoricalEvents === "function") {
        try { processHistoricalEvents(); } catch (e) { console.warn("hist events", e); }
      }
    }, 1200);
  }

  window.HISTORICAL_EVENTS = HIST;
  console.log("Historical event trees loaded:", Object.keys(HIST).length, "events");
})();




// ============================================================
// V30 — Komuta derinliği: siyasi güç, savaş yorgunluğu,
// teçhizat aşınması, zafer koşulları, cephe raporu
// ============================================================
(function V30CommandDepth() {
  if (typeof GameState === "undefined") return;

  function st() {
    if (!GameState.v30) {
      GameState.v30 = {
        politicalPower: 50,
        warExhaustion: 0,
        victory: null,
        lastPPTick: 0
      };
    }
    return GameState.v30;
  }

  window.addPoliticalPower = function(n) {
    const s = st();
    s.politicalPower = Math.max(0, Math.min(200, (s.politicalPower || 0) + n));
    setText("v30-pp", Math.floor(s.politicalPower).toString());
  };

  window.spendPoliticalPower = function(cost) {
    const s = st();
    if ((s.politicalPower || 0) < cost) {
      log("Yetersiz siyasi güç (" + Math.floor(s.politicalPower) + "/" + cost + ").", "text-red-400");
      return false;
    }
    s.politicalPower -= cost;
    setText("v30-pp", Math.floor(s.politicalPower).toString());
    return true;
  };

  window.processV30Tick = function() {
    try {
      const s = st();
      const p = GameState.countries[GameState.player];
      if (!p) return;
      const wars = (GameState.activeWars || []).length;
      // PP recovery
      let ppGain = 0.35;
      if ((p.stability || 50) > 70) ppGain += 0.15;
      if (wars) ppGain *= 0.7;
      s.politicalPower = Math.min(200, (s.politicalPower || 0) + ppGain);
      // War exhaustion
      if (wars > 0) {
        s.warExhaustion = Math.min(100, (s.warExhaustion || 0) + 0.12 * wars);
        // equipment attrition
        if (p.stockpile) {
          p.stockpile.guns = Math.max(0, (p.stockpile.guns || 0) - Math.floor(2 + wars));
          if (Math.random() < 0.2) p.stockpile.artillery = Math.max(0, (p.stockpile.artillery || 0) - 1);
        }
        // WS drain already in v27; exhaustion hits stability slowly
        if (s.warExhaustion > 40 && Math.random() < 0.08) {
          p.stability = Math.max(5, (p.stability || 50) - 0.4);
        }
      } else {
        s.warExhaustion = Math.max(0, (s.warExhaustion || 0) - 0.25);
      }
      setText("v30-pp", Math.floor(s.politicalPower).toString());
      setText("v30-we", Math.floor(s.warExhaustion || 0) + "%");
      // Victory check weekly-ish
      if ((GameState.v27 && GameState.v27.daysPlayed || 0) % 14 === 0) checkVictoryConditions();
    } catch (e) {
      console.warn("v30", e);
    }
  };

  window.checkVictoryConditions = function() {
    const s = st();
    if (s.victory || GameState.gameOver) return;
    const score = (typeof computeVictoryScore === "function") ? computeVictoryScore(GameState.player) : 0;
    const totalProvs = Object.keys(provinceOwners || {}).length || 1;
    const myProvs = Object.keys(provinceOwners || {}).filter(p => provinceOwners[p] === GameState.player).length;
    const share = myProvs / totalProvs;
    // Domination
    if (share >= 0.35 || score >= 900) {
      s.victory = "domination";
      showVictoryScreen("Hakimiyet", "Ülkeniz kıtalararası bir güç haline geldi. Haritanın önemli bir kısmı kontrolünüzde.");
      return;
    }
    // Economic
    const p = GameState.countries[GameState.player];
    if (p && ((p.civFactories || 0) + (p.milFactories || 0)) >= 80 && score >= 500) {
      s.victory = "industry";
      showVictoryScreen("Sanayi Üstünlüğü", "Fabrika hatlarınız dünyayı besliyor. Ekonomik zafer ilan edildi.");
    }
  };

  window.showVictoryScreen = function(title, body) {
    if (document.getElementById("victory-modal")) return;
    GameState.running = false;
    const m = document.createElement("div");
    m.id = "victory-modal";
    m.className = "fixed inset-0 z-[13000] flex items-center justify-center bg-black/80 p-4";
    m.innerHTML = `
      <div class="w-full max-w-md border border-amber-800/60 bg-[#12161f] rounded-lg shadow-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-800 bg-[#0e1219]">
          <div class="text-[10px] uppercase tracking-[0.2em] text-amber-600/90 font-bold mb-1">Zafer</div>
          <h2 class="text-lg font-bold text-amber-200">${title}</h2>
        </div>
        <div class="px-5 py-4 text-sm text-slate-300 leading-relaxed">${body}</div>
        <div class="px-5 py-3 border-t border-slate-800 flex gap-2">
          <button type="button" onclick="document.getElementById('victory-modal').remove();GameState.running=true;" class="flex-1 py-2 text-xs font-bold border border-slate-600 rounded bg-slate-900 hover:bg-slate-800">Devam et</button>
          <button type="button" onclick="location.reload()" class="flex-1 py-2 text-xs font-bold border border-amber-800/50 rounded bg-amber-950/40 text-amber-200 hover:bg-amber-900/40">Yeni oyun</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    log("Zafer: " + title, "text-amber-300 font-bold");
    if (typeof showToast === "function") showToast("Zafer — " + title, "good");
  };

  // Decision: spend PP for emergency measures
  window.decisionPartialMobilization = function() {
    if (!spendPoliticalPower(40)) return;
    if (typeof setMobilization === "function") setMobilization("partial");
    else if (GameState.v27) GameState.v27.mobilization = "partial";
    log("Karar: Kısmi seferberlik (40 SP).", "text-amber-300");
  };
  window.decisionWarBonds = function() {
    if (!spendPoliticalPower(25)) return;
    const p = GameState.countries[GameState.player];
    if (p) p.money = (p.money || 0) + 600;
    st().warExhaustion = Math.min(100, (st().warExhaustion || 0) + 3);
    log("Karar: Savaş tahvilleri (+600, yorgunluk +3).", "text-amber-300");
    updateHUD();
  };
  window.decisionPropaganda = function() {
    if (!spendPoliticalPower(30)) return;
    if (GameState.v27) GameState.v27.warSupport = Math.min(100, (GameState.v27.warSupport || 50) + 12);
    const p = GameState.countries[GameState.player];
    if (p) p.stability = Math.min(100, (p.stability || 50) + 4);
    log("Karar: Propaganda kampanyası.", "text-amber-300");
  };

  window.renderV30Decisions = function() {
    const box = document.getElementById("v30-decisions");
    if (!box) return;
    const pp = Math.floor(st().politicalPower || 0);
    box.innerHTML = `
      <div class="text-[10px] text-slate-500 mb-2">Siyasi güç: <b class="text-amber-500/90 font-mono">${pp}</b></div>
      <div class="flex flex-col gap-1.5">
        <button type="button" onclick="decisionWarBonds()" class="cmd-btn text-left">Savaş tahvilleri <span class="text-slate-500">(25 SP)</span></button>
        <button type="button" onclick="decisionPropaganda()" class="cmd-btn text-left">Propaganda <span class="text-slate-500">(30 SP)</span></button>
        <button type="button" onclick="decisionPartialMobilization()" class="cmd-btn text-left">Kısmi seferberlik <span class="text-slate-500">(40 SP)</span></button>
      </div>`;
  };

  // Enhance war display
  const _rawWar = typeof renderActiveWarsDisplay === "function" ? renderActiveWarsDisplay : null;
  window.renderActiveWarsDisplay = function() {
    if (_rawWar) _rawWar();
    const container = document.getElementById("dash-active-wars");
    if (!container) return;
    const s = st();
    if ((s.warExhaustion || 0) > 5) {
      const note = document.createElement("div");
      note.className = "text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800";
      note.textContent = "Savaş yorgunluğu: " + Math.floor(s.warExhaustion) + "% — uzun cepheler istikrarı aşındırır.";
      if (!container.querySelector(".we-note")) {
        note.classList.add("we-note");
        container.appendChild(note);
      } else {
        container.querySelector(".we-note").textContent = note.textContent;
      }
    }
  };

  // Tick hook
  if (!window._v30Interval) {
    window._v30Interval = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      processV30Tick();
      if (document.getElementById("v30-decisions")) renderV30Decisions();
    }, 1000);
  }

  const _boot = window.bootV27;
  window.bootV27 = function() {
    if (_boot) _boot();
    st();
    renderV30Decisions();
    setText("v30-pp", Math.floor(st().politicalPower).toString());
    setText("v30-we", Math.floor(st().warExhaustion || 0) + "%");
  };

  console.log("V30 command depth online");
})();



// ============================================================
// V31 — Okyanus #031a5c + ek komuta katmanları
// Doktrin seçimi, istihkam, deniz ticareti etkisi, moral
// ============================================================
(function V31Depth() {
  if (typeof GameState === "undefined") return;

  function s31() {
    if (!GameState.v31) {
      GameState.v31 = {
        doctrine: "balanced", // balanced | offensive | defensive | mobile
        fortsBuilt: 0,
        convoyEfficiency: 1,
        armyMorale: 70
      };
    }
    return GameState.v31;
  }

  const DOCTRINES = {
    balanced:  { label: "Dengeli doktrin", atk: 1.0, def: 1.0, desc: "Saldırı ve savunmada nötr." },
    offensive: { label: "Taarruz doktrini", atk: 1.14, def: 0.92, desc: "+14% saldırı, −8% savunma." },
    defensive:{ label: "Savunma doktrini", atk: 0.92, def: 1.16, desc: "+16% savunma, −8% saldırı." },
    mobile:   { label: "Hareketli harp", atk: 1.08, def: 0.98, move: 1.12, desc: "Hız ve esnek taarruz." }
  };

  window.setDoctrine = function(key) {
    if (!DOCTRINES[key]) return;
    if (typeof spendPoliticalPower === "function" && !spendPoliticalPower(20)) {
      // allow first free set if PP system missing cost fail only when low
      const pp = GameState.v30 && GameState.v30.politicalPower;
      if (pp != null && pp < 20) return;
      if (GameState.v30) GameState.v30.politicalPower = Math.max(0, (GameState.v30.politicalPower || 0) - 20);
    }
    s31().doctrine = key;
    log("Doktrin: " + DOCTRINES[key].label + " — " + DOCTRINES[key].desc, "text-amber-300");
    renderV31Doctrine();
  };

  window.renderV31Doctrine = function() {
    const box = document.getElementById("v31-doctrine");
    if (!box) return;
    const cur = s31().doctrine;
    box.innerHTML = Object.keys(DOCTRINES).map(k => {
      const d = DOCTRINES[k];
      const on = k === cur;
      return `<button type="button" onclick="setDoctrine('${k}')" class="cmd-btn ${on ? "cmd-btn-on" : ""}" title="${d.desc}">${d.label}</button>`;
    }).join("");
  };

  window.fortifyBorder = function() {
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const cost = 180;
    if ((p.money || 0) < cost) { log("İstihkam için yetersiz hazine.", "text-red-400"); return; }
    if (typeof spendPoliticalPower === "function" && !spendPoliticalPower(15)) return;
    p.money -= cost;
    s31().fortsBuilt = (s31().fortsBuilt || 0) + 1;
    s31().armyMorale = Math.min(100, (s31().armyMorale || 70) + 2);
    log("Sınır istihkamı güçlendirildi (+savunma). Toplam istihkam: " + s31().fortsBuilt, "text-slate-300");
    if (typeof updateHUD === "function") updateHUD();
    renderV31Status();
  };

  window.renderV31Status = function() {
    const box = document.getElementById("v31-status");
    if (!box) return;
    const s = s31();
    const d = DOCTRINES[s.doctrine] || DOCTRINES.balanced;
    box.innerHTML = `
      <div class="text-[10px] text-slate-400 space-y-1">
        <div>Doktrin: <b class="text-slate-200">${d.label}</b></div>
        <div>İstihkam seviyesi: <b class="font-mono text-slate-200">${s.fortsBuilt || 0}</b></div>
        <div>Ordu moralı: <b class="font-mono text-slate-200">${Math.floor(s.armyMorale || 70)}%</b></div>
        <div>Konvoy verimi: <b class="font-mono text-slate-200">${Math.round((s.convoyEfficiency || 1) * 100)}%</b></div>
      </div>
      <button type="button" onclick="fortifyBorder()" class="cmd-btn mt-2">Sınır istihkamı (180💰 · 15 SP)</button>`;
  };

  // Hook doctrine + forts into war progress delta
  const prevDelta = typeof v27WarProgressDelta === "function" ? v27WarProgressDelta : null;
  window.v27WarProgressDelta = function(base) {
    let d = prevDelta ? prevDelta(base) : base;
    try {
      const s = s31();
      const doc = DOCTRINES[s.doctrine] || DOCTRINES.balanced;
      d *= (doc.atk || 1);
      // forts help when defending (negative progress pressure reduction simulated as slight positive when losing)
      if ((s.fortsBuilt || 0) > 0) d *= (1 + Math.min(0.12, s.fortsBuilt * 0.02));
      const moral = (s.armyMorale || 70) / 100;
      d *= (0.85 + moral * 0.25);
      // season already in prev
    } catch (e) {}
    return d;
  };

  window.processV31Tick = function() {
    try {
      const s = s31();
      const wars = (GameState.activeWars || []).length;
      if (wars > 0) {
        s.armyMorale = Math.max(25, (s.armyMorale || 70) - 0.05 * wars);
        // convoy disruption if at war and low navy
        const p = GameState.countries[GameState.player];
        const ships = (p && p.navy && (p.navy.ships || 0)) || 0;
        if (ships < 3) s.convoyEfficiency = Math.max(0.55, (s.convoyEfficiency || 1) - 0.002);
        else s.convoyEfficiency = Math.min(1, (s.convoyEfficiency || 1) + 0.003);
        // trade income soft hit
        if (p && s.convoyEfficiency < 0.95 && Math.random() < 0.1) {
          p.money = Math.max(0, (p.money || 0) - Math.floor(8 * (1 - s.convoyEfficiency)));
        }
      } else {
        s.armyMorale = Math.min(95, (s.armyMorale || 70) + 0.08);
        s.convoyEfficiency = Math.min(1, (s.convoyEfficiency || 1) + 0.005);
      }
    } catch (e) {}
  };

  if (!window._v31Interval) {
    window._v31Interval = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      processV31Tick();
    }, 1000);
  }

  const prevBoot = window.bootV27;
  window.bootV27 = function() {
    if (prevBoot) prevBoot();
    s31();
    renderV31Doctrine();
    renderV31Status();
    // re-apply ocean
    try {
      const mc = document.getElementById("map-container");
      if (mc) mc.style.background = "#031a5c";
      const g = document.getElementById("game-map");
      if (g) g.style.background = "#031a5c";
    } catch (e) {}
  };

  console.log("V31 depth + ocean #031a5c");
})();



// ============================================================
// V32 — TEK SEFERLİK KOMPLE REFORM
// Cephe işgali, ikmal, sadeleştirilmiş gürültü, öğretici, lobi
// ============================================================
(function V32FinalReform() {
  if (typeof GameState === "undefined") return;

  /** Savaşta ikmal çarpanı: petrol + donanma + yorgunluk */
  window.getWarSupplyMul = function(iso, targetIso) {
    const c = GameState.countries[iso];
    if (!c) return 1;
    let m = 1;
    const oil = (c.strat && c.strat.oil) || 0;
    if (oil < 5) m *= 0.7;
    else if (oil < 15) m *= 0.88;
    const ships = (c.navy && c.navy.ships) || 0;
    if (ships < 2) m *= 0.92;
    const we = (GameState.v30 && GameState.v30.warExhaustion) || 0;
    if (we > 50) m *= 0.9;
    if (we > 75) m *= 0.85;
    // convoy from v31
    if (GameState.v31 && GameState.v31.convoyEfficiency) m *= (0.7 + 0.3 * GameState.v31.convoyEfficiency);
    return Math.max(0.45, Math.min(1.15, m));
  };

  /**
   * Cephe ilerlemesine göre kademeli eyalet işgali.
   * %25 / %50 / %75 eşiklerinde düşmandan 1-3 eyalet alınır.
   */
  window.processFrontOccupation = function(war) {
    if (!war || !war.target) return;
    const prog = war.progress || 0;
    war._occ = war._occ || { t25: false, t50: false, t75: false };
    const thresholds = [
      { key: "t25", at: 25, n: 1 },
      { key: "t50", at: 50, n: 2 },
      { key: "t75", at: 75, n: 3 }
    ];
    thresholds.forEach(th => {
      if (prog >= th.at && !war._occ[th.key]) {
        war._occ[th.key] = true;
        seizeEnemyProvinces(war.target, GameState.player, th.n);
      }
    });
  };

  /** İşgal: sahiplik DEĞİŞMEZ — yalnızca occupations haritası (barışta devredilir) */
  window.seizeEnemyProvinces = function(fromIso, toIso, count) {
    if (!GameState.occupations) GameState.occupations = {};
    const list = Object.keys(provinceOwners || {}).filter(p =>
      provinceOwners[p] === fromIso && GameState.occupations[p] !== toIso
    );
    if (!list.length) return 0;
    let pool = list.slice();
    try {
      const PD = (typeof PROVINCE_DATA !== "undefined") ? PROVINCE_DATA : {};
      const mine = new Set(Object.keys(provinceOwners).filter(p =>
        provinceOwners[p] === toIso || GameState.occupations[p] === toIso
      ));
      const border = list.filter(p => {
        const nbs = (PD[p] && PD[p].neighbors) || [];
        return nbs.some(n => mine.has(n));
      });
      if (border.length) pool = border;
    } catch (e) {}
    const n = Math.min(count, pool.length);
    const taken = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const name = pool.splice(idx, 1)[0];
      GameState.occupations[name] = toIso;
      taken.push(name);
    }
    if (taken.length) {
      log("Cephe ilerliyor — işgal (barışta alınır): " + taken.map(t => t.replace(/_/g, " ")).join(", "), "text-amber-300");
      if (typeof refreshMapColors === "function") refreshMapColors();
      if (typeof updateCapitalMarkers === "function") updateCapitalMarkers();
      if (typeof showToast === "function") showToast(taken.length + " eyalet işgal altında", "war");
    }
    return taken.length;
  };

  /** İlk oyun öğreticisi */
  window.maybeShowTutorial = function() {
    if (localStorage.getItem("sc_tutorial_done") === "1") return;
    if (document.getElementById("sc-tutorial")) return;
    const m = document.createElement("div");
    m.id = "sc-tutorial";
    m.className = "fixed inset-0 z-[14000] flex items-center justify-center bg-black/75 p-4";
    m.innerHTML = `
      <div class="w-full max-w-md bg-[#12161f] border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-800 bg-[#0e1219]">
          <div class="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-bold">Komuta brifingi</div>
          <h2 class="text-base font-bold text-slate-100 mt-0.5">İlk adımlar</h2>
        </div>
        <ol class="px-5 py-4 text-sm text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
          <li><b class="text-slate-100">Üretim</b> sekmesinden fabrika hatlarını doldur.</li>
          <li><b class="text-slate-100">Ordu</b> sekmesinde tümen eğit; stok tüketilir.</li>
          <li>Haritadan komşu seç → <b class="text-slate-100">Diplomasi</b> → gerekçe / savaş.</li>
          <li>Savaş skoru yükseldikçe cephede eyaletler otomatik düşer; barışta kalanını seçersin.</li>
        </ol>
        <div class="px-5 py-3 border-t border-slate-800">
          <button type="button" id="sc-tut-ok" class="w-full py-2.5 text-xs font-bold rounded border border-amber-800/50 bg-amber-950/30 text-amber-100 hover:bg-amber-900/40">Anlaşıldı — komutaya geç</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    document.getElementById("sc-tut-ok").onclick = () => {
      localStorage.setItem("sc_tutorial_done", "1");
      m.remove();
    };
  };

  // AI posta sıklığını düşür (varsa)
  if (typeof processAIDiplomacyRare === "function" && !window._v32DiploWrap) {
    window._v32DiploWrap = true;
    const prev = processAIDiplomacyRare;
    window.processAIDiplomacyRare = function() {
      if (Math.random() > 0.4) return; // %60 skip
      return prev.apply(this, arguments);
    };
  }

  // startGame hook tutorial + ocean
  const _sg = typeof startGame === "function" ? startGame : null;
  // Can't easily wrap async startGame if nested - use interval detect
  if (!window._v32BootWatch) {
    window._v32BootWatch = setInterval(() => {
      if (GameState && GameState.player && document.getElementById("hud-gold") && !document.getElementById("lobby-screen")?.classList.contains("hidden") === false) {
        // when lobby hidden
      }
      const lobby = document.getElementById("lobby-screen");
      if (lobby && lobby.classList.contains("hidden") && GameState.player && !window._v32TutShown) {
        window._v32TutShown = true;
        setTimeout(() => { try { maybeShowTutorial(); } catch(e){} }, 600);
      }
    }, 1500);
  }

  console.log("V32 final reform online — front occupation, supply, tutorial, quieter AI");
})();



// ============================================================
// V33 — Başkentler (senaryoya göre) · Ülke kimliği · Ana menü
// ============================================================
(function V33CapitalsIdentityMenu() {
  if (typeof GameState === "undefined") return;

  /** Senaryoya göre başkentler (eyalet adı = haritadaki province key) */
  const CAPITALS = {
    modern: {
      TUR: "Ankara", DEU: "Brandenburg", USA: "District_of_Columbia", RUS: "Moscow",
      GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", JPN: "Kanto",
      CHN: "Beijing", IND: "Delhi", BRA: "Goiás", POL: "Warszawa", ESP: "Madrid",
      SAU: "Nejd", IRN: "Tehran", EGY: "Cairo", KOR: "South_Korea", PRK: "Pyongyang",
      AUS: "New_South_Wales", CAN: "Southern_Ontario", MEX: "México", ARG: "Buenos_Aires",
      NLD: "Holland", BEL: "Vlaanderen", SWE: "Svealand", NOR: "Ostlandet", FIN: "Uusimaa",
      GRC: "Attica", ROU: "Muntenia", HUN: "Northern_Hungary", CZE: "Bohemia",
      AUT: "Ostmark", CHE: "Switzerland", PRT: "Lisbon", IRL: "Leinster",
      UKR: "Kiev", BLR: "Minsk", SRB: "Serbia", BGR: "Sofia", HRV: "Croatia",
      ISR: "Palestine", IRQ: "Baghdad", SYR: "Damascus", JOR: "Jordan", LBN: "Lebanon",
      PAK: "West_Punjab", BGD: "East_Bengal", IDN: "Java", THA: "Siam", VNM: "Tonkin",
      MYS: "Malaya", SGP: "Singapore", PHL: "Luzon", NZL: "North_Island",
      ZAF: "Transvaal", NGA: "Nigeria", ETH: "Ethiopia", KEN: "Kenya",
      DZA: "Algiers", MAR: "Morocco", TUN: "Tunisia", LBY: "Tripoli",
      CHL: "Santiago", COL: "Cundinamarca", PER: "Lima", VEN: "Miranda",
      TWN: "Taiwan", KAZ: "Alma-Ata", AZE: "Azerbaijan", GEO: "Georgia", ARM: "Armenia",
      AFG: "Kabul", UZB: "Tashkent", CUB: "Cuba", PAN: "Panamá"
    },
    ww1: {
      TUR: "Istanbul", DEU: "Brandenburg", RUS: "Saint_Petersburg", AUT: "Ostmark",
      GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", USA: "District_of_Columbia",
      SRB: "Serbia", BEL: "Vlaanderen", NLD: "Holland", ROU: "Muntenia", BGR: "Sofia",
      GRC: "Attica", JPN: "Kanto", CHN: "Beijing", POL: "Warszawa", HUN: "Northern_Hungary",
      ESP: "Madrid", PRT: "Lisbon", SWE: "Svealand", NOR: "Ostlandet", DNK: "Denmark",
      CHE: "Switzerland", IRN: "Tehran", EGY: "Cairo", MEX: "México", BRA: "Goiás"
    },
    ww2: {
      TUR: "Ankara", DEU: "Brandenburg", RUS: "Moscow", GBR: "Greater_London_Area",
      FRA: "Ile_de_France", ITA: "Lazio", USA: "District_of_Columbia", JPN: "Kanto",
      POL: "Warszawa", CHN: "Chongqing", ESP: "Madrid", FIN: "Uusimaa", ROU: "Muntenia",
      HUN: "Northern_Hungary", BGR: "Sofia", GRC: "Attica", YUG: "Serbia", SRB: "Serbia",
      BEL: "Vlaanderen", NLD: "Holland", NOR: "Ostlandet", DNK: "Denmark", SWE: "Svealand",
      CHE: "Switzerland", PRT: "Lisbon", IRN: "Tehran", IRQ: "Baghdad", EGY: "Cairo",
      BRA: "Goiás", ARG: "Buenos_Aires", MEX: "México", CAN: "Southern_Ontario",
      AUS: "New_South_Wales", IND: "Delhi", SAU: "Nejd"
    }
  };

  /** Ülke kimliği — kültür, din, dil, etnik çekirdek */
  const IDENTITY = {
    TUR: { culture: "Türk", religion: "İslam", sect: "Sünni", ethnicity: "Türk", language: "Türkçe", gov: "Cumhuriyet" },
    DEU: { culture: "Alman", religion: "Hristiyanlık", sect: "Protestan/Katolik", ethnicity: "Germen", language: "Almanca", gov: "Federal cumhuriyet" },
    USA: { culture: "Amerikan", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Anglo-Amerikan", language: "İngilizce", gov: "Federal cumhuriyet" },
    RUS: { culture: "Rus", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Doğu Slav", language: "Rusça", gov: "Federasyon" },
    GBR: { culture: "İngiliz", religion: "Hristiyanlık", sect: "Anglikan", ethnicity: "Anglo-Sakson", language: "İngilizce", gov: "Anayasal monarşi" },
    FRA: { culture: "Fransız", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin/Frank", language: "Fransızca", gov: "Cumhuriyet" },
    ITA: { culture: "İtalyan", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin", language: "İtalyanca", gov: "Cumhuriyet" },
    JPN: { culture: "Japon", religion: "Şinto/Budizm", sect: "—", ethnicity: "Japon", language: "Japonca", gov: "Anayasal monarşi" },
    CHN: { culture: "Han Çin", religion: "Laik/Budizm", sect: "—", ethnicity: "Han", language: "Çince", gov: "Sosyalist cumhuriyet" },
    IND: { culture: "Hint", religion: "Hinduizm", sect: "—", ethnicity: "Hint-Aryan", language: "Hintçe", gov: "Federal cumhuriyet" },
    BRA: { culture: "Brezilya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "Portekizce", gov: "Federal cumhuriyet" },
    POL: { culture: "Polonya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Batı Slav", language: "Lehçe", gov: "Cumhuriyet" },
    ESP: { culture: "İspanyol", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin", language: "İspanyolca", gov: "Anayasal monarşi" },
    SAU: { culture: "Arap", religion: "İslam", sect: "Sünni (Vehhabi)", ethnicity: "Arap", language: "Arapça", gov: "Mutlak monarşi" },
    IRN: { culture: "Fars", religion: "İslam", sect: "Şii", ethnicity: "İrani", language: "Farsça", gov: "İslam cumhuriyeti" },
    EGY: { culture: "Arap", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    KOR: { culture: "Kore", religion: "Hristiyan/Budizm", sect: "—", ethnicity: "Kore", language: "Korece", gov: "Cumhuriyet" },
    PRK: { culture: "Kore", religion: "Juche", sect: "—", ethnicity: "Kore", language: "Korece", gov: "Sosyalist devlet" },
    AUS: { culture: "Avustralya", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Anglo", language: "İngilizce", gov: "Federal monarşi" },
    CAN: { culture: "Kanada", religion: "Hristiyanlık", sect: "Katolik/Protestan", ethnicity: "Anglo-Fransız", language: "İngilizce/Fransızca", gov: "Federal monarşi" },
    MEX: { culture: "Meksika", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Mestizo", language: "İspanyolca", gov: "Federal cumhuriyet" },
    ARG: { culture: "Arjantin", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Federal cumhuriyet" },
    NLD: { culture: "Hollanda", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Germen", language: "Hollandaca", gov: "Anayasal monarşi" },
    BEL: { culture: "Belçika", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Flam/Valon", language: "Flamanca/Fransızca", gov: "Anayasal monarşi" },
    SWE: { culture: "İsveç", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "İskandinav", language: "İsveççe", gov: "Anayasal monarşi" },
    NOR: { culture: "Norveç", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "İskandinav", language: "Norveççe", gov: "Anayasal monarşi" },
    FIN: { culture: "Fin", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "Fin-Ugor", language: "Fince", gov: "Cumhuriyet" },
    GRC: { culture: "Yunan", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Helen", language: "Yunanca", gov: "Cumhuriyet" },
    ROU: { culture: "Romanya", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Latin/Doğu Romance", language: "Romence", gov: "Cumhuriyet" },
    HUN: { culture: "Macar", religion: "Hristiyanlık", sect: "Katolik/Kalvinist", ethnicity: "Macar", language: "Macarca", gov: "Cumhuriyet" },
    CZE: { culture: "Çek", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Batı Slav", language: "Çekçe", gov: "Cumhuriyet" },
    AUT: { culture: "Avusturya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Germen", language: "Almanca", gov: "Cumhuriyet" },
    CHE: { culture: "İsviçre", religion: "Hristiyanlık", sect: "Katolik/Protestan", ethnicity: "Germen/Latin", language: "Almanca/Fransızca/İtalyanca", gov: "Federal confederation" },
    PRT: { culture: "Portekiz", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin", language: "Portekizce", gov: "Cumhuriyet" },
    IRL: { culture: "İrlanda", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Kelt", language: "İngilizce/İrlandaca", gov: "Cumhuriyet" },
    UKR: { culture: "Ukrayna", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Doğu Slav", language: "Ukraynaca", gov: "Cumhuriyet" },
    BLR: { culture: "Belarus", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Doğu Slav", language: "Belarusça/Rusça", gov: "Cumhuriyet" },
    SRB: { culture: "Sırp", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Güney Slav", language: "Sırpça", gov: "Cumhuriyet" },
    BGR: { culture: "Bulgar", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Güney Slav", language: "Bulgarca", gov: "Cumhuriyet" },
    HRV: { culture: "Hırvat", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Güney Slav", language: "Hırvatça", gov: "Cumhuriyet" },
    ISR: { culture: "İsrail", religion: "Yahudilik", sect: "—", ethnicity: "Yahudi", language: "İbranice", gov: "Parlamenter demokrasi" },
    IRQ: { culture: "Arap", religion: "İslam", sect: "Şii/Sünni", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    SYR: { culture: "Arap", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    PAK: { culture: "Pakistan", religion: "İslam", sect: "Sünni", ethnicity: "Hint-Aryan/İrani", language: "Urduca", gov: "İslam cumhuriyeti" },
    IDN: { culture: "Endonezya", religion: "İslam", sect: "Sünni", ethnicity: "Malay", language: "Endonezce", gov: "Cumhuriyet" },
    THA: { culture: "Tay", religion: "Budizm", sect: "Theravada", ethnicity: "Tay", language: "Tayca", gov: "Anayasal monarşi" },
    VNM: { culture: "Vietnam", religion: "Budizm", sect: "—", ethnicity: "Kinh", language: "Vietnamca", gov: "Sosyalist cumhuriyet" },
    ZAF: { culture: "Güney Afrika", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Çok etnikli", language: "İngilizce/Afrikaans", gov: "Cumhuriyet" },
    AZE: { culture: "Azeri", religion: "İslam", sect: "Şii", ethnicity: "Türk", language: "Azerbaycanca", gov: "Cumhuriyet" },
    GEO: { culture: "Gürcü", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Kafkas", language: "Gürcüce", gov: "Cumhuriyet" },
    ARM: { culture: "Ermeni", religion: "Hristiyanlık", sect: "Apostolik", ethnicity: "Ermeni", language: "Ermenice", gov: "Cumhuriyet" },
    KAZ: { culture: "Kazak", religion: "İslam", sect: "Sünni", ethnicity: "Türk", language: "Kazakça", gov: "Cumhuriyet" },
    AFG: { culture: "Afgan", religion: "İslam", sect: "Sünni", ethnicity: "Peştun/Tacik", language: "Peştuca/Dari", gov: "İslam emirliği" },
    DNK: { culture: "Danimarka", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "İskandinav", language: "Danca", gov: "Anayasal monarşi" },
    TWN: { culture: "Tayvan", religion: "Budizm/Tao", sect: "—", ethnicity: "Han", language: "Çince", gov: "Cumhuriyet" },
    CUB: { culture: "Küba", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Sosyalist cumhuriyet" },
    NZL: { culture: "Yeni Zelanda", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Anglo/Maori", language: "İngilizce", gov: "Anayasal monarşi" },
    // WW1 özel etiketler için aynı kimlik çekirdeği
    AUT_EMP: { culture: "Avusturya-Macar", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Germen/Macar", language: "Almanca/Macarca", gov: "İmparatorluk" }
  };

  // Scenario-specific identity overrides (gov/name flavor only)
  const IDENTITY_ERA = {
    ww1: {
      TUR: { gov: "Osmanlı saltanatı" },
      DEU: { gov: "İmparatorluk" },
      RUS: { gov: "Çarlık" },
      AUT: { gov: "Çift monarşi" },
      GBR: { gov: "Anayasal monarşi" },
      JPN: { gov: "İmparatorluk" }
    },
    ww2: {
      DEU: { gov: "Ulusal sosyalist rejim" },
      ITA: { gov: "Faşist rejim" },
      RUS: { gov: "Sovyet sosyalist cumhuriyetler" },
      JPN: { gov: "İmparatorluk" },
      CHN: { gov: "Milliyetçi hükümet" }
    }
  };

  window.getCountryCapital = function(iso, scenarioId) {
    const sid = scenarioId || GameState.scenarioId || "modern";
    const pack = CAPITALS[sid] || CAPITALS.modern;
    return pack[iso] || (CAPITALS.modern[iso] || null);
  };

  window.getCountryIdentity = function(iso, scenarioId) {
    const base = Object.assign({}, IDENTITY[iso] || {
      culture: "—", religion: "—", sect: "—", ethnicity: "—", language: "—", gov: "—"
    });
    const sid = scenarioId || GameState.scenarioId || "modern";
    const era = IDENTITY_ERA[sid];
    if (era && era[iso]) Object.assign(base, era[iso]);
    return base;
  };

  window.applyCapitalsAndIdentity = function(scenarioId) {
    const sid = scenarioId || GameState.scenarioId || "modern";
    if (!GameState.countries) return;
    Object.keys(GameState.countries).forEach(iso => {
      const c = GameState.countries[iso];
      if (!c) return;
      const cap = getCountryCapital(iso, sid);
      if (cap) c.capital = cap;
      const id = getCountryIdentity(iso, sid);
      c.identity = id;
      c.culture = id.culture;
      c.religion = id.religion;
      c.ethnicity = id.ethnicity;
      c.language = id.language;
    });
    console.log("✓ Başkent + kimlik uygulandı:", sid);
  };

  // Hook applyScenarioToGameState
  const _apply = typeof applyScenarioToGameState === "function" ? applyScenarioToGameState : null;
  if (_apply && !window._v33ApplyHook) {
    window._v33ApplyHook = true;
    window.applyScenarioToGameState = function(scenarioId) {
      const r = _apply.apply(this, arguments);
      try { applyCapitalsAndIdentity(scenarioId); } catch (e) { console.warn(e); }
      return r;
    };
  }

  // Lobby preview
  const _sel = typeof selectLobbyCountry === "function" ? selectLobbyCountry : null;
  if (_sel && !window._v33SelHook) {
    window._v33SelHook = true;
    window.selectLobbyCountry = function(iso) {
      const r = _sel.apply(this, arguments);
      try {
        const sid = (document.getElementById("lobby-scenario-select") || {}).value || GameState.scenarioId || "modern";
        const cap = getCountryCapital(iso, sid);
        const id = getCountryIdentity(iso, sid);
        const elC = document.getElementById("lobby-stat-capital");
        const elI = document.getElementById("lobby-stat-identity");
        if (elC) elC.textContent = cap ? cap.replace(/_/g, " ") : "—";
        if (elI) elI.textContent = id.culture + " · " + id.religion + (id.sect && id.sect !== "—" ? " (" + id.sect + ")" : "");
      } catch (e) {}
      return r;
    };
  }

  // ----- Ana menü -----
  window.mainMenuNewGame = function() {
    const mm = document.getElementById("main-menu-screen");
    const lobby = document.getElementById("lobby-screen");
    if (mm) mm.classList.add("hidden");
    if (lobby) lobby.classList.remove("hidden");
  };
  window.mainMenuBack = function() {
    const mm = document.getElementById("main-menu-screen");
    const lobby = document.getElementById("lobby-screen");
    if (lobby) lobby.classList.add("hidden");
    if (mm) mm.classList.remove("hidden");
    refreshContinueButton();
  };
  window.mainMenuLoad = function() {
    if (typeof loadGamePrompt === "function") loadGamePrompt();
    else alert("Kayıt sistemi hazır değil.");
  };
  window.mainMenuContinue = function() {
    try {
      const raw = localStorage.getItem("supreme_command_save");
      if (!raw) return;
      if (typeof loadGameFromData === "function") {
        loadGameFromData(JSON.parse(raw));
      } else if (typeof loadGamePrompt === "function") {
        loadGamePrompt();
      }
      const mm = document.getElementById("main-menu-screen");
      if (mm) mm.classList.add("hidden");
    } catch (e) {
      console.warn(e);
      mainMenuLoad();
    }
  };
  window.mainMenuCredits = function() {
    const m = document.getElementById("credits-modal");
    if (m) m.classList.remove("hidden");
  };
  window.refreshContinueButton = function() {
    const btn = document.getElementById("mm-continue");
    if (!btn) return;
    const has = !!localStorage.getItem("supreme_command_save");
    btn.classList.toggle("hidden", !has);
  };

  // Diplomacy panel capital line helper
  window.formatCountryIdentityBlock = function(iso) {
    const id = getCountryIdentity(iso);
    const cap = getCountryCapital(iso);
    const capLabel = cap ? cap.replace(/_/g, " ") : "—";
    return `<div class="text-[10px] text-slate-400 space-y-0.5 mt-1">
      <div>Başkent: <b class="text-slate-200">${capLabel}</b></div>
      <div>Kültür: <b class="text-slate-200">${id.culture}</b> · Etnik: <b class="text-slate-200">${id.ethnicity}</b></div>
      <div>Din: <b class="text-slate-200">${id.religion}</b>${id.sect && id.sect !== "—" ? " (" + id.sect + ")" : ""}</div>
      <div>Dil: <b class="text-slate-200">${id.language}</b> · Yönetim: <b class="text-slate-200">${id.gov}</b></div>
    </div>`;
  };

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    refreshContinueButton();
    const lobby = document.getElementById("lobby-screen");
    if (lobby && !lobby.classList.contains("hidden")) {
      // ensure main menu shows first
      lobby.classList.add("hidden");
    }
    const mm = document.getElementById("main-menu-screen");
    if (mm) mm.classList.remove("hidden");
  });

  // Also apply on startGame end
  const _boot = window.bootV27;
  window.bootV27 = function() {
    if (_boot) _boot();
    try { applyCapitalsAndIdentity(GameState.scenarioId); } catch (e) {}
  };

  console.log("V33 capitals + identity + main menu online");
})();



// ============================================================
// V34 — İşgal tarama · başkent işaretleri · sınır kalınlığı
// · senaryo ülke filtresi · WW event AI · kimlik tamamlama
// ============================================================
(function V34OccupationCapitalsEvents() {
  if (typeof GameState === "undefined") return;
  if (!GameState.occupations) GameState.occupations = {};

  function countryPower(iso) {
    const c = GameState.countries[iso];
    if (!c) return 0;
    const divs = c.divisions || {};
    const d = (divs.inf || 0) * 10 + (divs.art || 0) * 20 + (divs.arm || 0) * 40;
    const fac = (c.milFactories || 0) * 8 + (c.civFactories || 0) * 3;
    const prov = Object.values(provinceOwners || {}).filter(o => o === iso).length * 2;
    return d + fac + prov;
  }

  function capitalMarkerKind(iso) {
    if (iso === GameState.player) return "self";
    const rel = (GameState.relations && GameState.relations[iso] != null) ? GameState.relations[iso] : 0;
    const atWar = (GameState.activeWars || []).some(w => w.target === iso || w.attacker === iso);
    const pp = countryPower(GameState.player);
    const tp = countryPower(iso);
    if (atWar || rel <= -40) return "rival"; // swords
    if (tp < pp * 0.75) return "weaker"; // skull
    if (tp > pp * 1.25) return "stronger"; // building
    return "peer";
  }

  function markerEmoji(kind) {
    if (kind === "rival") return "⚔️";
    if (kind === "weaker") return "💀";
    if (kind === "stronger") return "🏛️";
    if (kind === "self") return "⭐";
    return "🏳️";
  }

  function flagUrl(iso) {
    if (typeof getFlagUrl === "function") return getFlagUrl(iso);
    const c = GameState.countries[iso];
    const f = (c && c.flag) || String(iso).toLowerCase().slice(0, 2);
    return "https://flagcdn.com/w40/" + f + ".png";
  }

  /** Başkent province centroid yaklaşık — path bbox merkezi */
  function provinceCentroid(pName) {
    try {
      const el = d3.select('.country-path[data-name="' + pName + '"]');
      if (el.empty()) return null;
      const bb = el.node().getBBox();
      return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    } catch (e) { return null; }
  }

  window.updateCapitalMarkers = function() {
    /* V35: başkent işaretleri kaldırıldı */
    try {
      d3.selectAll("g.capital-layer").remove();
    } catch (e) {}
    return;
    const svg = d3.select("#game-map");
    if (svg.empty()) return;
    let layer = svg.select("g.capital-layer");
    if (layer.empty()) {
      layer = d3.select("#game-map g").append("g").attr("class", "capital-layer");
      const rootG = svg.select("g");
      if (!rootG.empty()) layer = rootG.append("g").attr("class", "capital-layer");
    }
    layer.selectAll("*").remove();

    const scen = GameState.scenarioId || "modern";
    const seen = new Set();
    Object.keys(GameState.countries || {}).forEach(iso => {
      const c = GameState.countries[iso];
      if (!c) return;
      // ülke haritada yoksa atla
      const hasLand = Object.values(provinceOwners || {}).some(o => o === iso);
      if (!hasLand) return;
      let cap = c.capital || (typeof getCountryCapital === "function" ? getCountryCapital(iso, scen) : null);
      if (!cap) return;
      // başkent başka ülkeye geçtiyse veya işgalde sil / gösterme
      const owner = provinceOwners[cap];
      if (owner !== iso) {
        c.capitalLost = true;
        return;
      }
      if ((GameState.occupations || {})[cap] && GameState.occupations[cap] !== iso) {
        // başkent işgal altındaysa işaret soluk
      }
      c.capitalLost = false;
      if (seen.has(cap)) return;
      seen.add(cap);
      const pt = provinceCentroid(cap);
      if (!pt) return;
      const kind = capitalMarkerKind(iso);
      const em = markerEmoji(kind);
      const g = layer.append("g")
        .attr("class", "capital-marker")
        .attr("data-iso", iso)
        .attr("transform", "translate(" + pt.x + "," + pt.y + ")")
        .style("pointer-events", "none");
      // emoji
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", kind === "rival" ? 22 : 16)
        .text(em);
      // flag above
      g.append("image")
        .attr("href", flagUrl(iso))
        .attr("x", -8)
        .attr("y", kind === "rival" ? -28 : -24)
        .attr("width", 16)
        .attr("height", 10)
        .attr("preserveAspectRatio", "xMidYMid slice");
    });
  };

  // Lobby: yalnızca senaryodaki ülkeler — sert filtre
  window.enforceScenarioCountrySelect = function() {
    if (typeof refreshLobbyCountrySelect === "function") refreshLobbyCountrySelect();
  };

  // WW1/WW2 ekstra event'ler (oyuncu + AI)
  const AI_HIST_EVENTS = [
    {
      id: "ww1_blank_cheque",
      scenario: ["ww1"], year: 1914, month: 7,
      title: "Almanya'nın Açık Çeki",
      desc: "Berlin, Viyana'ya Sırbistan konusunda koşulsuz destek sinyali veriyor.",
      aiTags: ["DEU", "AUT"],
      choices: [
        { text: "Tam destek (gerilim +)", effect: { tension: 12 } },
        { text: "Temkinli destek", effect: { tension: 4 } }
      ]
    },
    {
      id: "ww1_schlieffen",
      scenario: ["ww1"], year: 1914, month: 8,
      title: "Belçika'ya Ültimatom",
      desc: "Alman planı Belçika topraklarından geçiş talep ediyor.",
      aiTags: ["DEU"],
      choices: [
        { text: "Ültimatom gönder", effect: { tension: 20, forceWar: ["DEU", "BEL"] } },
        { text: "Ertele", effect: { tension: 5 } }
      ]
    },
    {
      id: "ww2_molotov",
      scenario: ["ww2"], year: 1939, month: 8,
      title: "Saldırmazlık Paktı",
      desc: "Moskova ile Berlin arasında gizli protokollü bir anlaşma masada.",
      aiTags: ["DEU", "RUS"],
      choices: [
        { text: "Paktı imzala", effect: { tension: -5 } },
        { text: "Reddet", effect: { tension: 8 } }
      ]
    },
    {
      id: "ww2_barbarossa_prep",
      scenario: ["ww2"], year: 1941, month: 4,
      title: "Doğu Seferi Hazırlığı",
      desc: "Genelkurmay doğu sınırına yığınak öneriyor.",
      aiTags: ["DEU"],
      choices: [
        { text: "Yığınağı artır", effect: { tension: 15 } },
        { text: "Bekle", effect: {} }
      ]
    },
    {
      id: "ww2_lend_lease",
      scenario: ["ww2"], year: 1941, month: 3,
      title: "Ödünç Verme-Kiralama",
      desc: "Washington müttefiklere malzeme hattı açmayı tartışıyor.",
      aiTags: ["USA", "GBR"],
      choices: [
        { text: "Programı başlat", effect: { tension: 6 } },
        { text: "Kongre'yi bekle", effect: {} }
      ]
    }
  ];

  window.processAIHistoricalEvents = function() {
    if (GameState.eventsEnabled === false) return;
    if (GameState.settings && GameState.settings.eventsEnabled === false) return;
    const sid = GameState.scenarioId;
    if (sid !== "ww1" && sid !== "ww2") return;
    if (Math.random() > 0.04) return;
    const y = GameState.date ? GameState.date.getFullYear() : 1939;
    const m = GameState.date ? (GameState.date.getMonth() + 1) : 1;
    if (!GameState._aiHistFired) GameState._aiHistFired = {};
    const pool = AI_HIST_EVENTS.filter(e =>
      e.scenario.includes(sid) &&
      y >= e.year &&
      (!e.month || m >= e.month - 1) &&
      !GameState._aiHistFired[e.id]
    );
    if (!pool.length) return;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    GameState._aiHistFired[ev.id] = true;
    // AI otomatik seçim: ilk seçenek
    const choice = ev.choices[0];
    if (choice.effect && choice.effect.tension) {
      GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + choice.effect.tension);
    }
    log("Tarihsel gelişme (" + (ev.aiTags || []).join("/") + "): " + ev.title, "text-amber-300");
    // Oyuncu ilgili taraftaysa modal
    if (ev.aiTags && ev.aiTags.includes(GameState.player) && typeof showEventModal === "function") {
      showEventModal({
        title: ev.title,
        desc: ev.desc,
        choices: ev.choices.map(ch => ({
          text: ch.text,
          effect: () => {
            if (ch.effect && ch.effect.tension) {
              GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + ch.effect.tension);
            }
          }
        }))
      });
    }
  };

  // Extra identities for missing tags
  const MORE_ID = {
    DZA: { culture: "Cezayir", religion: "İslam", sect: "Sünni", ethnicity: "Arap/Berberi", language: "Arapça", gov: "Cumhuriyet" },
    MAR: { culture: "Fas", religion: "İslam", sect: "Sünni", ethnicity: "Arap/Berberi", language: "Arapça", gov: "Monarşi" },
    TUN: { culture: "Tunus", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    LBY: { culture: "Libya", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    SDN: { culture: "Sudan", religion: "İslam", sect: "Sünni", ethnicity: "Arap/Afrikalı", language: "Arapça", gov: "Cumhuriyet" },
    ETH: { culture: "Etiyopya", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Habeş", language: "Amharca", gov: "Federal cumhuriyet" },
    KEN: { culture: "Kenya", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Afrikalı", language: "İngilizce/Svahili", gov: "Cumhuriyet" },
    NGA: { culture: "Nijerya", religion: "İslam/Hristiyan", sect: "—", ethnicity: "Afrikalı", language: "İngilizce", gov: "Federal cumhuriyet" },
    AGO: { culture: "Angola", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Afrikalı", language: "Portekizce", gov: "Cumhuriyet" },
    COL: { culture: "Kolombiya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    PER: { culture: "Peru", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    VEN: { culture: "Venezuela", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    CHL: { culture: "Şili", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    PHL: { culture: "Filipin", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Austronezya", language: "Filipince", gov: "Cumhuriyet" },
    MYS: { culture: "Malezya", religion: "İslam", sect: "Sünni", ethnicity: "Malay", language: "Malayca", gov: "Federal monarşi" },
    SGP: { culture: "Singapur", religion: "Çok dinli", sect: "—", ethnicity: "Çin/Malay/Hint", language: "İngilizce", gov: "Cumhuriyet" },
    BGD: { culture: "Bengal", religion: "İslam", sect: "Sünni", ethnicity: "Bengal", language: "Bengalce", gov: "Cumhuriyet" },
    LKA: { culture: "Sri Lanka", religion: "Budizm", sect: "Theravada", ethnicity: "Sinhala/Tamil", language: "Sinhala", gov: "Cumhuriyet" },
    MMR: { culture: "Myanmar", religion: "Budizm", sect: "Theravada", ethnicity: "Bamar", language: "Birmanca", gov: "Cunta/devlet" },
    KHM: { culture: "Khmer", religion: "Budizm", sect: "Theravada", ethnicity: "Khmer", language: "Khmerce", gov: "Anayasal monarşi" },
    UZB: { culture: "Özbek", religion: "İslam", sect: "Sünni", ethnicity: "Türk", language: "Özbekçe", gov: "Cumhuriyet" },
    TKM: { culture: "Türkmen", religion: "İslam", sect: "Sünni", ethnicity: "Türk", language: "Türkmence", gov: "Cumhuriyet" },
    KGZ: { culture: "Kırgız", religion: "İslam", sect: "Sünni", ethnicity: "Türk", language: "Kırgızca", gov: "Cumhuriyet" },
    TJK: { culture: "Tacik", religion: "İslam", sect: "Sünni", ethnicity: "İrani", language: "Tacikçe", gov: "Cumhuriyet" },
    MNG: { culture: "Moğol", religion: "Budizm", sect: "—", ethnicity: "Moğol", language: "Moğolca", gov: "Cumhuriyet" },
    ALB: { culture: "Arnavut", religion: "İslam", sect: "Sünni", ethnicity: "Arnavut", language: "Arnavutça", gov: "Cumhuriyet" },
    SVN: { culture: "Sloven", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Güney Slav", language: "Slovence", gov: "Cumhuriyet" },
    SVK: { culture: "Slovak", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Batı Slav", language: "Slovakça", gov: "Cumhuriyet" },
    BIH: { culture: "Boşnak/Sırp/Hırvat", religion: "İslam/Hristiyan", sect: "—", ethnicity: "Güney Slav", language: "Boşnakça", gov: "Cumhuriyet" },
    MKD: { culture: "Makedon", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Güney Slav", language: "Makedonca", gov: "Cumhuriyet" },
    MDA: { culture: "Moldova", religion: "Hristiyanlık", sect: "Ortodoks", ethnicity: "Latin/Doğu Romance", language: "Romence", gov: "Cumhuriyet" },
    EST: { culture: "Estonya", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "Fin-Ugor", language: "Estonca", gov: "Cumhuriyet" },
    LVA: { culture: "Letonya", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "Baltık", language: "Letonca", gov: "Cumhuriyet" },
    LTU: { culture: "Litvanya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Baltık", language: "Litvanca", gov: "Cumhuriyet" },
    ISL: { culture: "İzlanda", religion: "Hristiyanlık", sect: "Lutheran", ethnicity: "İskandinav", language: "İzlandaca", gov: "Cumhuriyet" },
    LUX: { culture: "Lüksemburg", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Germen", language: "Lüksemburgca", gov: "Anayasal monarşi" },
    JOR: { culture: "Ürdün", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Anayasal monarşi" },
    LBN: { culture: "Lübnan", religion: "İslam/Hristiyan", sect: "—", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    KWT: { culture: "Kuveyt", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Emirlik" },
    QAT: { culture: "Katar", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Emirlik" },
    ARE: { culture: "Emirlik", religion: "İslam", sect: "Sünni", ethnicity: "Arap", language: "Arapça", gov: "Federasyon" },
    OMN: { culture: "Umman", religion: "İslam", sect: "İbadi", ethnicity: "Arap", language: "Arapça", gov: "Sultanlık" },
    YEM: { culture: "Yemen", religion: "İslam", sect: "Sünni/Zeydi", ethnicity: "Arap", language: "Arapça", gov: "Cumhuriyet" },
    BOL: { culture: "Bolivya", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    ECU: { culture: "Ekvador", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    URY: { culture: "Uruguay", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    PRY: { culture: "Paraguay", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    PAN: { culture: "Panama", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    CRI: { culture: "Kosta Rika", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    GTM: { culture: "Guatemala", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    DOM: { culture: "Dominik", religion: "Hristiyanlık", sect: "Katolik", ethnicity: "Latin Amerika", language: "İspanyolca", gov: "Cumhuriyet" },
    JAM: { culture: "Jamaika", religion: "Hristiyanlık", sect: "Protestan", ethnicity: "Karayip", language: "İngilizce", gov: "Anayasal monarşi" }
  };

  // Merge into getCountryIdentity if exists
  const _gci = window.getCountryIdentity;
  window.getCountryIdentity = function(iso, scenarioId) {
    let base = _gci ? _gci(iso, scenarioId) : null;
    if (!base || base.culture === "—") {
      base = Object.assign({
        culture: "—", religion: "—", sect: "—", ethnicity: "—", language: "—", gov: "—"
      }, MORE_ID[iso] || {});
    } else if (MORE_ID[iso] && base.culture === "—") {
      Object.assign(base, MORE_ID[iso]);
    }
    // fill gaps from MORE_ID
    if (MORE_ID[iso]) {
      Object.keys(MORE_ID[iso]).forEach(k => {
        if (!base[k] || base[k] === "—") base[k] = MORE_ID[iso][k];
      });
    }
    return base;
  };

  // Tick hooks
  if (!window._v34Interval) {
    window._v34Interval = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      try { processAIHistoricalEvents(); } catch (e) {}
      if ((GameState.v27 && GameState.v27.daysPlayed || 0) % 3 === 0) {
        try { updateCapitalMarkers(); } catch (e) {}
      }
    }, 1000);
  }

  const _boot = window.bootV27;
  window.bootV27 = function() {
    if (_boot) _boot();
    if (!GameState.occupations) GameState.occupations = {};
    setTimeout(() => {
      try { refreshMapColors(); } catch (e) {}
      try { updateCapitalMarkers(); } catch (e) {}
    }, 500);
  };

  // Scenario change refreshes lobby list
  document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "lobby-scenario-select") {
      setTimeout(() => {
        if (typeof refreshLobbyCountrySelect === "function") refreshLobbyCountrySelect();
      }, 50);
    }
  });

  console.log("V34 occupation hatch + capitals + AI hist events");
})();



// ============================================================
// V36 — WW2 scripted ilhak zinciri (Baltık, Polonya, Benelüks,
// Fransa/Vichy), ölü ülke AI kapalı, DNZ serbest şehir
// ============================================================
(function V36WW2AnnexChain() {
  if (typeof GameState === "undefined") return;

  const SOV_POL = ["Białystok", "Nowogródek", "Wilejka", "Polesie", "Wołyn", "Lwów", "Stanisławów", "Wilno"];
  const VICHY_KEEP = ["Midi_Pyrenees", "Limousin", "Centre_Sud", "Auvergne", "Rhone", "Languedoc", "Alpes", "Bouches_du_Rhone", "Var"];

  function ensureCountry(iso, name, color) {
    if (!GameState.countries[iso]) {
      GameState.countries[iso] = {
        name: name || iso,
        color: color || "#888888",
        flag: "un",
        ideology: "Bilinmiyor",
        pop: 500000,
        civFactories: 2,
        milFactories: 1,
        money: 200,
        manpower: 50000,
        divisions: { inf: 2, art: 0, arm: 0 },
        stability: 50
      };
    } else if (name) GameState.countries[iso].name = name;
  }

  window.annexAllFrom = function(fromIso, toIso) {
    const moved = [];
    Object.keys(provinceOwners || {}).forEach(p => {
      if (provinceOwners[p] === fromIso) {
        provinceOwners[p] = toIso;
        if (GameState.occupations) delete GameState.occupations[p];
        moved.push(p);
      }
    });
    if (moved.length) {
      log("İlhak " + fromIso + " → " + toIso + " (" + moved.length + " eyalet): " + moved.slice(0, 8).map(x => x.replace(/_/g, " ")).join(", ") + (moved.length > 8 ? "…" : ""), "text-amber-300");
      if (typeof refreshMapColors === "function") refreshMapColors();
    }
    // ölü ülke
    if (typeof clearCountryDiplomacy === "function") clearCountryDiplomacy(fromIso);
    const c = GameState.countries[fromIso];
    if (c) { c.isCapitulated = true; c.alive = false; }
    return moved;
  };

  window.partitionPoland1939 = function() {
    if (!countryAliveSafe("POL")) return;
    const pol = Object.keys(provinceOwners).filter(p => provinceOwners[p] === "POL");
    const toSov = [];
    const toDeu = [];
    pol.forEach(p => {
      if (SOV_POL.includes(p)) toSov.push(p);
      else toDeu.push(p);
    });
    toSov.forEach(p => { provinceOwners[p] = "RUS"; });
    toDeu.forEach(p => { provinceOwners[p] = "DEU"; });
    if (GameState.occupations) {
      [...toSov, ...toDeu].forEach(p => delete GameState.occupations[p]);
    }
    log("Polonya paylaşımı — SSCB: " + toSov.join(", "), "text-red-400");
    log("Polonya paylaşımı — Almanya: " + toDeu.join(", "), "text-red-400");
    if (typeof clearCountryDiplomacy === "function") clearCountryDiplomacy("POL");
    if (GameState.countries.POL) { GameState.countries.POL.isCapitulated = true; GameState.countries.POL.alive = false; }
    if (typeof refreshMapColors === "function") refreshMapColors();
  };

  window.annexBalticsToUSSR = function() {
    ["EST", "LVA", "LTU", "LAT", "LIT"].forEach(t => {
      if (Object.values(provinceOwners).some(o => o === t)) annexAllFrom(t, "RUS");
    });
  };

  window.runBeneluxGermanVictory = function() {
    ["BEL", "NLD", "LUX"].forEach(t => {
      if (Object.values(provinceOwners).some(o => o === t) && typeof scriptedWar === "function") {
        scriptedWar("DEU", t, 8, {
          annexAll: true,
          onDone: () => annexAllFrom(t, "DEU")
        });
      } else if (Object.values(provinceOwners).some(o => o === t)) {
        annexAllFrom(t, "DEU");
      }
    });
    // Brabant zaten NLD olmalı; ilhakta DEU'ya gider
  };

  window.runFallOfFranceVichy = function(mode) {
    // mode: "vichy" | "full"
    const fraMainland = ["Brittany","Normandy","Picardy","Nord_Pas_de_Calais","Champagne","Alsace_Lorraine","Franche_Comte","Rhone","Alpes","Savoy","Var","Bouches_du_Rhone","Languedoc","Midi_Pyrenees","Pyrénées_Atlantiques","Poitou","Loire","Centre","Ile_de_France","Bourgogne","Auvergne","Centre_Sud","Limousin","Aquitaine","Corsica"];
    const keep = new Set(VICHY_KEEP);
    if (mode === "full") {
      fraMainland.forEach(p => {
        if (provinceOwners[p] === "FRA") provinceOwners[p] = "DEU";
      });
      log("Fransa ana karası tamamen Alman işgalinde.", "text-red-400");
    } else {
      // Vichy: keep list stays FRA, rest mainland -> DEU, colonies stay FRA
      fraMainland.forEach(p => {
        if (provinceOwners[p] !== "FRA") return;
        if (keep.has(p)) return;
        provinceOwners[p] = "DEU";
      });
      if (GameState.countries.FRA) {
        GameState.countries.FRA.name = "Vichy Fransası";
        GameState.countries.FRA.isVichy = true;
      }
      // optional puppet flag
      if (!GameState.puppets) GameState.puppets = {};
      GameState.puppets["FRA"] = "DEU";
      log("Vichy kuruldu. Kalan eyaletler: " + VICHY_KEEP.join(", ") + " + sömürgeler.", "text-amber-300");
    }
    if (typeof refreshMapColors === "function") refreshMapColors();
  };

  function countryAliveSafe(iso) {
    if (!GameState.countries[iso]) return false;
    if (GameState.countries[iso].alive === false || GameState.countries[iso].isCapitulated) {
      // still alive if has provinces
    }
    return Object.values(provinceOwners || {}).some(o => o === iso);
  }
  window.countryAliveSafe = countryAliveSafe;

  // Patch countryAlive used in hist module if possible
  const _ca = typeof countryAlive === "function" ? null : null;

  // Dead countries cannot act in AI
  window.isCountryPlayableAI = function(iso) {
    if (!iso || iso === GameState.player) return false;
    if (!GameState.countries[iso]) return false;
    if (GameState.countries[iso].alive === false && !Object.values(provinceOwners || {}).some(o => o === iso)) return false;
    if (!Object.values(provinceOwners || {}).some(o => o === iso)) return false;
    return true;
  };

  // Override hist events by re-def if HIST exists
  function patchHist() {
    if (typeof HISTORICAL_EVENTS === "undefined" && typeof window.HISTORICAL_EVENTS === "undefined") return;
    const HIST = window.HISTORICAL_EVENTS || {};
    // We'll register via process by replacing effect handlers at runtime through flags
  }

  // Direct event runner for AI when player is not DEU
  window.triggerWW2AnnexEvent = function(id) {
    if (id === "baltic") annexBalticsToUSSR();
    if (id === "poland") partitionPoland1939();
    if (id === "benelux") runBeneluxGermanVictory();
    if (id === "france_vichy") runFallOfFranceVichy("vichy");
    if (id === "france_full") runFallOfFranceVichy("full");
  };

  // Ensure DNZ exists when ww2 loads
  const _apply = window.applyScenarioToGameState;
  if (_apply && !window._v36Apply) {
    window._v36Apply = true;
    window.applyScenarioToGameState = function(scenarioId) {
      const r = _apply.apply(this, arguments);
      try {
        if ((scenarioId || GameState.scenarioId) === "ww2") {
          ensureCountry("DNZ", "Danzig Serbest Yönetimi", "#c4a574");
          if (provinceOwners["Danzig"] == null) provinceOwners["Danzig"] = "DNZ";
          // Brabant fix if still BEL
          if (provinceOwners["Brabant"] === "BEL") provinceOwners["Brabant"] = "NLD";
        }
      } catch (e) {}
      return r;
    };
  }

  // Replace baltic/poland event effects by monkeypatching showHistoricalEvent choices - better: replace HIST entries
  function rebindWW2Events() {
    const HIST = window.HISTORICAL_EVENTS;
    if (!HIST) return;
    if (HIST.ww2_baltic_ultimatum) {
      HIST.ww2_baltic_ultimatum.text = "1940: SSCB Baltık cumhuriyetlerini tamamen ilhak eder. Tüm Estonya, Letonya ve Litvanya eyaletleri Sovyetler Birliği'ne geçer.";
      HIST.ww2_baltic_ultimatum.choices = [
        {
          label: "İlhakı onayla / izle — tüm Baltık → SSCB",
          effect: () => {
            if (typeof setFlag === "function") setFlag("baltic_occupied", true);
            annexBalticsToUSSR();
            GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 10);
          }
        },
        {
          label: "Protesto et (yine de ilhak gerçekleşir)",
          effect: () => {
            if (typeof setFlag === "function") setFlag("baltic_occupied", true);
            annexBalticsToUSSR();
            if (typeof addRel === "function") { try { addRel("RUS", -20); } catch(e){} }
          }
        }
      ];
    }
    if (HIST.ww2_poland_invasion) {
      HIST.ww2_poland_invasion.text = "Polonya Seferi: Białystok, Nowogródek, Wilejka, Polesie, Wołyn, Lwów, Stanisławów, Wilno → SSCB; kalan tüm Polonya eyaletleri → Almanya. Sonra Benelüks ve Fransa scripted zaferleri.";
      HIST.ww2_poland_invasion.choices = [
        {
          label: "Tarihsel paylaşım + Benelüks seferi",
          effect: () => {
            if (typeof setFlag === "function") { setFlag("poland_partition", true); setFlag("ww2_started", true); }
            partitionPoland1939();
            // DEU vs GBR/FRA war
            if (typeof ensureWar === "function") {
              try {
                if (countryAliveSafe("GBR")) ensureWar("DEU", "GBR");
                if (countryAliveSafe("FRA")) ensureWar("DEU", "FRA");
              } catch(e){}
            }
            setTimeout(() => runBeneluxGermanVictory(), 500);
            GameState.globalTension = Math.min(100, (GameState.globalTension || 0) + 20);
          }
        },
        {
          label: "Yalnızca Polonya paylaşımı",
          effect: () => {
            if (typeof setFlag === "function") { setFlag("poland_partition", true); setFlag("ww2_started", true); }
            partitionPoland1939();
          }
        }
      ];
    }
    if (HIST.ww2_fall_gelb) {
      HIST.ww2_fall_gelb.text = "Batı taarruzu: Benelüks düşer (garanti Alman zaferi). Fransa yenilir — Vichy veya tam işgal seçimi.";
      HIST.ww2_fall_gelb.choices = [
        {
          label: "Benelüks + Vichy Fransası",
          effect: () => {
            if (typeof setFlag === "function") setFlag("fall_gelb", true);
            runBeneluxGermanVictory();
            setTimeout(() => runFallOfFranceVichy("vichy"), 800);
            if (typeof ensureWar === "function") {
              try { ensureWar("DEU", "FRA"); ensureWar("DEU", "GBR"); } catch(e){}
            }
          }
        },
        {
          label: "Benelüks + Fransa tam işgal",
          effect: () => {
            if (typeof setFlag === "function") setFlag("fall_gelb", true);
            runBeneluxGermanVictory();
            setTimeout(() => runFallOfFranceVichy("full"), 800);
          }
        }
      ];
    }
    // New dedicated fall of france if missing
    if (!HIST.ww2_fall_of_france) {
      HIST.ww2_fall_of_france = {
        id: "ww2_fall_of_france",
        title: "Fransa'nın Düşüşü",
        text: "Paris düştü. Vichy mi, yoksa tüm ana kara Alman yönetimi mi?",
        scenario: ["ww2"],
        era: [2],
        yearMin: 1940, yearMax: 1940,
        monthMin: 6, monthMax: 7,
        once: true,
        priority: 92,
        requireFlag: "ww2_started",
        choices: [
          { label: "Vichy rejimi (güney eyaletleri + sömürgeler Fransız)", effect: () => runFallOfFranceVichy("vichy") },
          { label: "Fransa ana karasını tamamen işgal et", effect: () => runFallOfFranceVichy("full") }
        ]
      };
    }
    console.log("V36 WW2 hist events rebound");
  }

  setTimeout(rebindWW2Events, 800);
  setInterval(() => { if (window.HISTORICAL_EVENTS && !window._v36Rebound) { rebindWW2Events(); window._v36Rebound = true; } }, 2000);

  // AI: skip dead
  if (!window._v36AiPatch) {
    window._v36AiPatch = true;
    const prev = window.aiTick || window.processAI || null;
    // wrap common AI country loops via aiCountryAllowed
  }

  console.log("V36 WW2 annex chain ready");
})();



// ============================================================
// V38 — HOI4 tarzı çekirdek katman
// Fraksiyonlar · Call to Arms · WT · Ordu XP · Araştırma slotları
// · Ekipman açığı · Odak hızı · AI fraksiyon davranışı
// ============================================================
(function V38HOILayer() {
  if (typeof GameState === "undefined") return;

  function st() {
    if (!GameState.hoi) {
      GameState.hoi = {
        factions: {
          axis: { name: "Mihver", leader: "DEU", members: [] },
          allies: { name: "Müttefikler", leader: "GBR", members: [] },
          comintern: { name: "Komintern", leader: "RUS", members: [] }
        },
        armyXP: 0,
        navyXP: 0,
        airXP: 0,
        researchSlots: 2,
        guarantees: {}, // iso -> guarantor
        factionJoinCooldown: {}
      };
      // senaryoya göre varsayılan üyeler
      seedFactions();
    }
    return GameState.hoi;
  }

  function seedFactions() {
    const h = GameState.hoi;
    const sid = GameState.scenarioId || "modern";
    h.factions.axis.members = [];
    h.factions.allies.members = [];
    h.factions.comintern.members = [];
    if (sid === "ww2") {
      joinFaction("DEU", "axis", true);
      joinFaction("ITA", "axis", true);
      joinFaction("JPN", "axis", true);
      joinFaction("GBR", "allies", true);
      joinFaction("FRA", "allies", true);
      joinFaction("RUS", "comintern", true);
    } else if (sid === "ww1") {
      joinFaction("DEU", "axis", true);
      joinFaction("AUT", "axis", true);
      joinFaction("GBR", "allies", true);
      joinFaction("FRA", "allies", true);
      joinFaction("RUS", "allies", true);
    } else {
      // modern: NATO-ish / loose
      joinFaction("USA", "allies", true);
      joinFaction("GBR", "allies", true);
      joinFaction("FRA", "allies", true);
      joinFaction("DEU", "allies", true);
    }
  }

  window.joinFaction = function(iso, factionId, silent) {
    const h = st();
    const f = h.factions[factionId];
    if (!f) return;
    // tek fraksiyon
    Object.keys(h.factions).forEach(fid => {
      h.factions[fid].members = (h.factions[fid].members || []).filter(m => m !== iso);
    });
    if (!f.members.includes(iso)) f.members.push(iso);
    if (GameState.countries[iso]) GameState.countries[iso].faction = factionId;
    if (!silent) log((GameState.countries[iso]?.name || iso) + " → " + f.name, "text-cyan-300");
  };

  window.getFactionOf = function(iso) {
    const h = st();
    for (const fid of Object.keys(h.factions)) {
      if ((h.factions[fid].members || []).includes(iso)) return fid;
    }
    return null;
  };

  window.callFactionToArms = function(leaderIso, enemyIso) {
    const fid = getFactionOf(leaderIso);
    if (!fid) return;
    const f = st().factions[fid];
    (f.members || []).forEach(m => {
      if (m === leaderIso || m === enemyIso) return;
      if (typeof isCountryPlayableAI === "function" && !isCountryPlayableAI(m) && m !== GameState.player) {
        // ölü atla
        if (!Object.values(provinceOwners || {}).some(o => o === m)) return;
      }
      if (typeof ensureWar === "function") {
        try { ensureWar(m, enemyIso); } catch (e) {}
      }
      // player member: notify
      if (m === GameState.player) {
        log("Fraksiyon savaşa çağırıyor: " + (GameState.countries[enemyIso]?.name || enemyIso), "text-red-400 font-bold");
        if (typeof showToast === "function") showToast("Call to Arms: " + (f.name), "war");
      }
    });
  };

  // declareWar hook
  const _dw = typeof declareWar === "function" ? declareWar : null;
  if (_dw && !window._hoiDw) {
    window._hoiDw = true;
    // declareWar may be nested - assign window
    window.declareWar = function(targetIso) {
      const r = _dw.apply(this, arguments);
      try {
        callFactionToArms(GameState.player, targetIso);
        // enemy faction responds
        const ef = getFactionOf(targetIso);
        if (ef) {
          const leader = st().factions[ef].leader;
          if (leader && leader !== targetIso) callFactionToArms(leader, GameState.player);
        }
        st().armyXP = Math.min(500, (st().armyXP || 0) + 2);
      } catch (e) {}
      return r;
    };
  }

  // Research slots from civ+mil factories
  window.calcResearchSlots = function(iso) {
    const c = GameState.countries[iso];
    if (!c) return 1;
    const fac = (c.civFactories || 0) + (c.milFactories || 0);
    if (fac >= 60) return 5;
    if (fac >= 40) return 4;
    if (fac >= 25) return 3;
    if (fac >= 12) return 2;
    return 1;
  };

  // Equipment: understrength penalty on war progress for player
  window.getEquipmentFactor = function(iso) {
    const c = GameState.countries[iso];
    if (!c || !c.divisions || !c.stockpile) return 1;
    const need = (c.divisions.inf || 0) * 1000 + (c.divisions.art || 0) * 200 + (c.divisions.arm || 0) * 100;
    const have = (c.stockpile.guns || 0) + (c.stockpile.artillery || 0) * 5 + (c.stockpile.tanks || 0) * 20;
    if (need <= 0) return 1;
    const ratio = have / need;
    return Math.max(0.45, Math.min(1.15, ratio));
  };

  // Hook war delta
  const prevDelta = window.v27WarProgressDelta;
  window.v27WarProgressDelta = function(base) {
    let d = prevDelta ? prevDelta(base) : base;
    try {
      d *= getEquipmentFactor(GameState.player);
      // army XP small bonus
      const xp = (st().armyXP || 0);
      d *= (1 + Math.min(0.12, xp / 2000));
    } catch (e) {}
    return d;
  };

  // Focus progress HOI-like: ~70 days default already in game - boost with PP
  window.hoiTick = function() {
    try {
      const h = st();
      h.researchSlots = calcResearchSlots(GameState.player);
      // WT mirror
      const wt = GameState.globalTension || 0;
      setText("hoi-wt", Math.floor(wt) + "%");
      setText("hoi-army-xp", Math.floor(h.armyXP || 0));
      setText("hoi-research-slots", String(h.researchSlots || 1));
      renderHoiFactions();

      // XP from wars
      if ((GameState.activeWars || []).length) {
        h.armyXP = Math.min(500, (h.armyXP || 0) + 0.15);
      }

      // AI majors drift into factions at high WT
      if (wt > 40 && Math.random() < 0.02) {
        aiFactionDrift();
      }

      // Equipment attrition already elsewhere; soft stockpile demand
      const p = GameState.countries[GameState.player];
      if (p && p.divisions && p.stockpile) {
        const gunDrain = Math.floor((p.divisions.inf || 0) * 0.4);
        if (gunDrain && (GameState.activeWars || []).length) {
          p.stockpile.guns = Math.max(0, (p.stockpile.guns || 0) - gunDrain);
        }
      }

      // National focus auto-tick if stalled - ensure progress field moves
      if (p && p.activeFocus && p.focusProgress != null) {
        const slots = h.researchSlots || 2;
        // slight boost from slots (industrial capacity)
        p.focusProgress = Math.min(100, (p.focusProgress || 0) + 0.15 * Math.min(3, slots / 2));
      }
    } catch (e) {
      console.warn("hoiTick", e);
    }
  };

  function aiFactionDrift() {
    const majors = ["ITA", "JPN", "HUN", "ROU", "BGR", "ESP", "TUR", "SWE", "USA"];
    const wt = GameState.globalTension || 0;
    majors.forEach(iso => {
      if (!GameState.countries[iso]) return;
      if (getFactionOf(iso)) return;
      if (!Object.values(provinceOwners || {}).some(o => o === iso)) return;
      if (iso === "USA" && wt > 70) joinFaction(iso, "allies", false);
      if (["ITA", "HUN", "ROU", "BGR"].includes(iso) && wt > 50) joinFaction(iso, "axis", false);
      if (iso === "JPN" && wt > 55) joinFaction(iso, "axis", false);
    });
  }

  window.renderHoiFactions = function() {
    const box = document.getElementById("hoi-faction-panel");
    if (!box) return;
    const h = st();
    box.innerHTML = Object.keys(h.factions).map(fid => {
      const f = h.factions[fid];
      const mem = (f.members || []).filter(m => Object.values(provinceOwners || {}).some(o => o === m));
      const names = mem.map(m => (GameState.countries[m]?.name || m)).slice(0, 6).join(", ");
      const you = mem.includes(GameState.player) ? " <span class='text-amber-400'>★</span>" : "";
      return `<div><b class="text-slate-300">${f.name}</b>${you}<span class="text-slate-600"> · </span>${names || "—"}</div>`;
    }).join("");
  };

  window.playerJoinFaction = function(fid) {
    if ((GameState.globalTension || 0) < 15 && fid === "axis") {
      log("Düşük dünya geriliminde Mihver'e katılım kısıtlı.", "text-yellow-400");
    }
    joinFaction(GameState.player, fid, false);
    renderHoiFactions();
  };

  // Historical event hooks: join factions
  const _boot = window.bootV27;
  window.bootV27 = function() {
    if (_boot) _boot();
    st();
    seedFactions();
    // player not auto forced
    const fid = getFactionOf(GameState.player);
    renderHoiFactions();
    setTimeout(() => {
      try { hoiTick(); } catch (e) {}
    }, 400);
  };

  // On barbarossa / pearl flags join
  const origSetFlag = window.setFlag;
  // setFlag is local inside hist IIFE - can't hook easily

  if (!window._hoiInterval) {
    window._hoiInterval = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      hoiTick();
    }, 1000);
  }

  // Peace: warscore claim boost message
  window.hoiPeaceWarscore = function(targetIso) {
    const war = (GameState.activeWars || []).find(w => w.target === targetIso);
    return war ? Math.floor(war.progress || 0) : 0;
  };

  // Button row for faction join in diplomacy when viewing self - inject via renderHoiFactions only

  console.log("V38 HOI4 layer: factions, CTA, WT, XP, research slots, equipment factor");
})();



// ============================================================
// Easter eggs — aynı eyalete spam + saçmalıklar
// ============================================================
(function EasterEggsSupreme() {
  if (typeof GameState === "undefined") return;

  const spam = { name: null, count: 0, lastT: 0 };
  let adlibPlaying = false;

  const MSG5 = [
    "Komutan, bu eyalet zaten seçili. Harita bir düğme değil.",
    "Aynı toprağa 5 kez bastınız. Ordu hâlâ yolda değil, fare yoruldu.",
    "İstihbarat: Düşman yok. Sadece sizin tıklama parmaklarınız var.",
    "Genelkurmay notu: Eyalet yerinden oynamadı. Şaşırtıcı.",
    "Bu eyalet sizi seviyor olabilir. Siz onu eziyorsunuz."
  ];
  const MSG8 = [
    "8 tık. Harita size kişisel bir mesele haline geldi.",
    "Personel: 'Komutan yine aynı yere basıyor.' — 'Bırakın, terapi gibi.'",
    "Eyalet yerel halkı: 'Yine mi o tık sesi?'",
    "Taktik değerlendirme: Daha fazla tıklamak zafer getirmez. Belki dans eder.",
    "8. vuruş. Karargâh kahve sipariş etti. Sizin için değil, kendileri için."
  ];
  const MSG10 = [
    "10 tık. Yeter. Müzik konuşsun.",
    "Komuta günlüğü kilitlendi. Sırada: Adlib.",
    "Harita isyan etti. Playlist devreye girdi."
  ];

  function logEE(msg) {
    if (typeof log === "function") log("🥚 " + msg, "text-yellow-300");
    else console.log("[EE]", msg);
  }

  window.trackProvinceSpamEasterEgg = function(pName, isRight) {
    if (isRight) return;
    const now = Date.now();
    if (spam.name !== pName || now - spam.lastT > 8000) {
      spam.name = pName;
      spam.count = 0;
    }
    spam.lastT = now;
    spam.count++;
    const n = spam.count;
    const label = String(pName || "").replace(/_/g, " ");

    if (n === 5) {
      logEE(MSG5[Math.floor(Math.random() * MSG5.length)] + " (" + label + ")");
    } else if (n === 8) {
      logEE(MSG8[Math.floor(Math.random() * MSG8.length)] + " [" + label + " ×8]");
    } else if (n === 10) {
      logEE(MSG10[Math.floor(Math.random() * MSG10.length)]);
      playAdlibEasterEgg();
      spam.count = 0;
      spam.name = null;
    } else if (n > 10 && n % 5 === 0) {
      logEE("Hâlâ " + label + "? (" + n + ") Karargâh sizi izliyor.");
    }
  };

  window.playAdlibEasterEgg = function() {
    if (adlibPlaying) {
      logEE("Adlib zaten çalıyor. Biraz nefes alın, komutan.");
      return;
    }
    adlibPlaying = true;
    logEE("♪ Adlib başlıyor — https://music.youtube.com/watch?v=L8OGuf20s1g");
    // Gömülü oynatıcı (autoplay kullanıcı tıklamasından geldiği için genelde izinli)
    let host = document.getElementById("ee-adlib-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "ee-adlib-host";
      host.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:20000;width:320px;max-width:92vw;background:#0b0e14;border:1px solid #3d4658;border-radius:8px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.55);";
      host.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;font-size:10px;color:#c9a227;letter-spacing:.08em;text-transform:uppercase;font-weight:700"><span>Easter Egg · Adlib</span><button type="button" id="ee-adlib-close" style="background:#1a2030;border:1px solid #2a3142;color:#ddd;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:10px">Kapat</button></div><div id="ee-adlib-frame" style="aspect-ratio:16/9;background:#000"></div>';
      document.body.appendChild(host);
      document.getElementById("ee-adlib-close").onclick = function() {
        stopAdlibEasterEgg();
      };
    }
    host.style.display = "block";
    const frame = document.getElementById("ee-adlib-frame");
    // YouTube embed — müzik videosu sonuna kadar
    frame.innerHTML = '<iframe width="100%" height="100%" src="https://www.youtube.com/embed/L8OGuf20s1g?autoplay=1&rel=0" title="Adlib" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="display:block;width:100%;height:100%;min-height:180px"></iframe>';
    // Yedek: yeni sekme
    try {
      // bazı tarayıcılar iframe autoplay engeller
      setTimeout(function() {
        if (!document.getElementById("ee-adlib-host")) return;
      }, 2000);
    } catch (e) {}
  };

  window.stopAdlibEasterEgg = function() {
    adlibPlaying = false;
    const host = document.getElementById("ee-adlib-host");
    if (host) {
      const frame = document.getElementById("ee-adlib-frame");
      if (frame) frame.innerHTML = "";
      host.style.display = "none";
    }
    logEE("Adlib kapatıldı. Haritaya dönülebilir.");
  };

  // --- Diğer saçma easter egg'ler ---

  // Konami: ↑↑↓↓←→←→BA
  const konami = [38,38,40,40,37,39,37,39,66,65];
  let ki = 0;
  document.addEventListener("keydown", function(e) {
    if (window.mpIsActive && window.mpIsActive()) return;
    if (e.keyCode === konami[ki]) {
      ki++;
      if (ki === konami.length) {
        ki = 0;
        logEE("KONAMİ KODU: +999 insan gücü (sadece moral). Gerçekte +50 manpower.");
        const p = GameState.countries && GameState.countries[GameState.player];
        if (p) p.manpower = (p.manpower || 0) + 50;
        if (typeof updateHUD === "function") updateHUD();
        if (typeof showToast === "function") showToast("Konami!", "epic");
      }
    } else {
      ki = e.keyCode === konami[0] ? 1 : 0;
    }
    // "nuketown" typed
  });

  // Gizli yazı buffer
  let buf = "";
  let bufT = 0;
  document.addEventListener("keypress", function(e) {
    if (window.mpIsActive && window.mpIsActive()) return;
    if (!e.key || e.key.length !== 1) return;
    const now = Date.now();
    if (now - bufT > 2500) buf = "";
    bufT = now;
    buf = (buf + e.key.toLowerCase()).slice(-16);
    if (buf.endsWith("sus")) {
      logEE("AMONG US? Bu bir grand strategy. Impostor eyaletlerin içinde.");
    }
    if (buf.endsWith("42")) {
      logEE("42: Hayatın, evrenin ve her şeyin cevabı. Savaş skoru değil.");
    }
    if (buf.endsWith("hobbit")) {
      logEE("İkinci kahvaltı vakti. Ordu erzak stokundan +1 ekmek (hayali).");
    }
    if (buf.endsWith("help")) {
      logEE("Yardım menüsü yok. Sadece umut ve kötü AI.");
    }
    if (buf.endsWith("agaoglu")) {
      logEE("Şifre doğru… ama bu sefer god panel değil, sadece selam komutan.");
    }
    if (buf.endsWith("adlib")) {
      playAdlibEasterEgg();
    }
  });

  // Hızlı space spam pause
  let spaceC = 0, spaceT = 0;
  document.addEventListener("keydown", function(e) {
    if (e.code !== "Space") return;
    const n = Date.now();
    if (n - spaceT > 1500) spaceC = 0;
    spaceT = n;
    spaceC++;
    if (spaceC === 7) {
      logEE("Space'e 7 kez bastınız. Oyun zaten duraklatılabilir. Siz duramıyorsunuz.");
      spaceC = 0;
    }
  });

  // Boş diplomasi: kendi ülkenize 15 kez diplo sekmesi — handled lightly via tab
  let tabSpam = {};
  const _st = window.switchTab;
  if (typeof _st === "function" && !window._eeTab) {
    window._eeTab = true;
    window.switchTab = function(tabId) {
      const r = _st.apply(this, arguments);
      try {
        tabSpam[tabId] = (tabSpam[tabId] || 0) + 1;
        if (tabId === "diplomacy" && tabSpam[tabId] === 12) {
          logEE("Diplomasi sekmesi 12. kez. Müttefikler sizden korkmaya başladı.");
        }
        if (tabId === "military" && tabSpam[tabId] === 15) {
          logEE("Ordu sekmesi rekoru. Generaller imza günlüğü istiyor.");
        }
      } catch (e) {}
      return r;
    };
  }

  console.log("Easter eggs loaded (province spam, konami, adlib, typed secrets)");
})();



// ============================================================
// PLAN Adım 1 — Teknik sağlamlaştırma (V40)
// ============================================================
(function V40Foundation() {
  if (typeof GameState === "undefined") return;

  // Güçlü setText / setHtml
  window.setText = function(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.innerText = value == null ? "" : String(value); } catch (e) {}
  };
  window.setHtml = function(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.innerHTML = value == null ? "" : String(value); } catch (e) {}
  };

  /** Ülke haritada toprak sahibi mi? */
  window.countryHasLand = function(iso) {
    if (!iso) return false;
    try {
      return Object.values(provinceOwners || {}).some(o => o === iso);
    } catch (e) { return false; }
  };

  window.isCountryOperational = function(iso) {
    if (!iso || !GameState.countries || !GameState.countries[iso]) return false;
    const c = GameState.countries[iso];
    if (c.alive === false && !countryHasLand(iso)) return false;
    if (c.isCapitulated && !countryHasLand(iso)) return false;
    return countryHasLand(iso);
  };

  // declareWar koruması
  const _dw = window.declareWar;
  if (typeof _dw === "function" && !window._v40Dw) {
    window._v40Dw = true;
    window.declareWar = function(targetIso) {
      if (!isCountryOperational(GameState.player)) {
        if (typeof log === "function") log("Savaş ilan edilemez: ülkengiz operasyonel değil.", "text-red-400");
        return;
      }
      if (!isCountryOperational(targetIso)) {
        if (typeof log === "function") log("Hedef ülke artık haritada yok veya çökmüş.", "text-red-400");
        return;
      }
      return _dw.apply(this, arguments);
    };
  }

  // ensureWar koruması (hist scripted)
  const _ew = window.ensureWar;
  if (typeof _ew === "function" && !window._v40Ew) {
    window._v40Ew = true;
    window.ensureWar = function(attacker, target) {
      if (!isCountryOperational(attacker) || !isCountryOperational(target)) return;
      return _ew.apply(this, arguments);
    };
  }

  // activeWars temizliği: hedef/attacker topraksızsa kapat
  window.pruneDeadWars = function() {
    if (!GameState.activeWars) return;
    const before = GameState.activeWars.length;
    GameState.activeWars = GameState.activeWars.filter(w => {
      const tOk = isCountryOperational(w.target);
      const aOk = !w.attacker || isCountryOperational(w.attacker) || w.attacker === GameState.player;
      return tOk && aOk;
    });
    if (GameState.activeWars.length < before && typeof log === "function") {
      log("Geçersiz cepheler temizlendi.", "text-slate-500");
    }
  };

  // Lobi stat güvenli
  window.safeLobbyStats = function(iso) {
    try {
      const country = GameState.countries[iso];
      if (!country) return;
      const pop = country.pop || 0;
      const el = (id) => document.getElementById(id);
      if (el("lobby-stat-pop")) {
        el("lobby-stat-pop").innerText = pop >= 1e9 ? (pop / 1e9).toFixed(1) + " Milyar" : (pop / 1e6).toFixed(1) + " Milyon";
      }
      if (el("lobby-stat-div") && country.divisions)
        el("lobby-stat-div").innerText = Object.values(country.divisions).reduce((a, b) => a + b, 0) + " Tümen";
      if (el("lobby-stat-civ")) el("lobby-stat-civ").innerText = (country.civFactories || 0) + " Fabrika";
      if (el("lobby-stat-mil")) el("lobby-stat-mil").innerText = (country.milFactories || 0) + " Fabrika";
      if (el("lobby-stat-gold")) el("lobby-stat-gold").innerText = (country.money || 0) + "";
      if (el("lobby-stat-ideo")) el("lobby-stat-ideo").innerText = country.ideology || "—";
    } catch (e) {}
  };

  // gameTick sarmalayıcı — uncaught'ları yut
  if (typeof gameTick === "function" && !window._v40TickWrap) {
    window._v40TickWrap = true;
    const _gt = gameTick;
    window.gameTick = function() {
      try {
        if (typeof pruneDeadWars === "function") pruneDeadWars();
        return _gt.apply(this, arguments);
      } catch (err) {
        console.warn("gameTick fault (yalıtıldı):", err);
      }
    };
    // global function may still be the old one if const-bound — also assign
    try { gameTick = window.gameTick; } catch (e) {}
  }

  // updateHUD ekstra güvenlik
  if (typeof updateHUD === "function" && !window._v40Hud) {
    window._v40Hud = true;
    const _uh = updateHUD;
    window.updateHUD = function() {
      try { return _uh.apply(this, arguments); }
      catch (e) { console.warn("updateHUD", e); }
    };
  }

  // refreshMapColors güvenli
  if (typeof refreshMapColors === "function" && !window._v40Rmc) {
    window._v40Rmc = true;
    const _rm = refreshMapColors;
    window.refreshMapColors = function() {
      try { return _rm.apply(this, arguments); }
      catch (e) { console.warn("refreshMapColors", e); }
    };
  }

  console.log("V40 Adım1: teknik sağlamlaştırma aktif · PLAN.txt");
})();



// ============================================================
// PLAN Adım 2 — Cephe & barış döngüsü (V41)
// İşgal → skor → barış talebi → devir / serbest bırakma
// ============================================================
(function V41FrontPeaceLoop() {
  if (typeof GameState === "undefined") return;
  if (!GameState.occupations) GameState.occupations = {};

  window.countOccupiedBy = function(occupier, ownerIso) {
    return Object.keys(GameState.occupations || {}).filter(p =>
      GameState.occupations[p] === occupier && (!ownerIso || provinceOwners[p] === ownerIso)
    ).length;
  };

  window.listOccupiedBy = function(occupier, ownerIso) {
    return Object.keys(GameState.occupations || {}).filter(p =>
      GameState.occupations[p] === occupier && (!ownerIso || provinceOwners[p] === ownerIso)
    );
  };

  /** Savaş raporunu dash-active-wars içine işgal satırı ekle */
  const _raw = window.renderActiveWarsDisplay;
  if (typeof _raw === "function" && !window._v41WarDisp) {
    window._v41WarDisp = true;
    window.renderActiveWarsDisplay = function() {
      _raw.apply(this, arguments);
      try {
        const container = document.getElementById("dash-active-wars");
        if (!container) return;
        (GameState.activeWars || []).forEach((war, i) => {
          const n = countOccupiedBy(GameState.player, war.target);
          if (n <= 0) return;
          const cards = container.querySelectorAll(".space-y-3 > div, .space-y-2 > div, div");
          // soft: append note once via data
        });
        // Tek blok: işgal özeti
        let note = container.querySelector(".v41-occ-note");
        const totalOcc = countOccupiedBy(GameState.player);
        if (totalOcc > 0) {
          if (!note) {
            note = document.createElement("div");
            note.className = "v41-occ-note text-[10px] text-amber-500/90 mt-2 pt-2 border-t border-slate-800";
            container.appendChild(note);
          }
          note.textContent = "İşgal altında (taralı, henüz sizin değil): " + totalOcc + " eyalet — barışta devredilir.";
        } else if (note) note.remove();
      } catch (e) {}
    };
  }

  // Peace map: highlight occupied stronger
  const _enter = window.enterPeaceMapMode;
  if (typeof _enter === "function" && !window._v41Peace) {
    window._v41Peace = true;
    window.enterPeaceMapMode = function(targetIso) {
      _enter.apply(this, arguments);
      try {
        const occ = GameState.occupations || {};
        d3.selectAll(".country-path").each(function() {
          const path = d3.select(this);
          const name = path.attr("data-name");
          if (!name) return;
          if (occ[name] === GameState.player && provinceOwners[name] === targetIso) {
            path.style("stroke", "#f59e0b").style("stroke-width", "0.7px").style("opacity", 1);
          }
        });
      } catch (e) {}
    };
  }

  // Scripted annex still direct; player wars stay occupation-first
  console.log("V41 Adım2: cephe-işgal-barış döngüsü sıkılaştırıldı");
})();



// ============================================================
// PLAN Adım 3 — Üretim & ordu netliği (V42)
// ============================================================
(function V42ProductionArmy() {
  if (typeof GameState === "undefined") return;

  // Tümen başına ekipman ihtiyacı (okunabilir sabitler)
  const EQUIP_NEED = {
    inf: { guns: 1000, artillery: 0, tanks: 0 },
    art: { guns: 400, artillery: 120, tanks: 0 },
    arm: { guns: 200, artillery: 40, tanks: 50 }
  };

  window.getDivisionEquipmentNeed = function(iso) {
    const c = GameState.countries[iso];
    if (!c || !c.divisions) return { guns: 0, artillery: 0, tanks: 0 };
    const d = c.divisions;
    const need = { guns: 0, artillery: 0, tanks: 0 };
    Object.keys(EQUIP_NEED).forEach(k => {
      const n = d[k] || 0;
      need.guns += n * EQUIP_NEED[k].guns;
      need.artillery += n * EQUIP_NEED[k].artillery;
      need.tanks += n * EQUIP_NEED[k].tanks;
    });
    return need;
  };

  window.getEquipmentCoverage = function(iso) {
    const c = GameState.countries[iso];
    if (!c) return { ratio: 1, need: {}, have: {}, deficit: false };
    const need = getDivisionEquipmentNeed(iso);
    const st = c.stockpile || { guns: 0, artillery: 0, tanks: 0 };
    const have = {
      guns: st.guns || 0,
      artillery: st.artillery || 0,
      tanks: st.tanks || 0
    };
    const ratios = [];
    ["guns", "artillery", "tanks"].forEach(k => {
      if (need[k] > 0) ratios.push(Math.min(1.25, have[k] / need[k]));
      else ratios.push(1);
    });
    const ratio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return {
      ratio: Math.max(0.35, Math.min(1.2, ratio)),
      need, have,
      deficit: ratio < 0.65
    };
  };

  // Override soft equipment factor used in war
  window.getEquipmentFactor = function(iso) {
    return getEquipmentCoverage(iso).ratio;
  };

  window.renderEquipmentPanel = function() {
    const cov = getEquipmentCoverage(GameState.player);
    const fmt = (a, b) => {
      const ok = a >= b;
      return (ok ? "" : "⚠ ") + Math.floor(a).toLocaleString() + " / " + Math.floor(b).toLocaleString();
    };
    setText("v42-need-guns", fmt(cov.have.guns, cov.need.guns));
    setText("v42-need-art", fmt(cov.have.artillery, cov.need.artillery));
    setText("v42-need-tank", fmt(cov.have.tanks, cov.need.tanks));
    const pct = Math.round(cov.ratio * 100);
    const stEl = document.getElementById("v42-equip-status");
    if (stEl) {
      stEl.textContent = pct + "% donanım";
      stEl.className = "text-[10px] font-bold px-2 py-0.5 rounded " +
        (pct >= 95 ? "bg-emerald-900/50 text-emerald-300" :
         pct >= 70 ? "bg-amber-900/50 text-amber-300" :
         "bg-red-900/50 text-red-300");
    }
    const bar = document.getElementById("v42-equip-bar");
    if (bar) {
      bar.style.width = Math.min(100, pct) + "%";
      bar.className = "h-full transition-all " +
        (pct >= 95 ? "bg-emerald-600" : pct >= 70 ? "bg-amber-500" : "bg-red-600");
    }
    const hint = document.getElementById("v42-equip-hint");
    if (hint) {
      hint.textContent = cov.deficit
        ? "Stok yetersiz — cephe ilerlemesi ×" + cov.ratio.toFixed(2)
        : "Donanım yeterli. Üretim hatları stoku büyütür.";
    }
    // military tab
    const mil = document.getElementById("v42-mil-equip");
    if (mil) {
      mil.innerHTML = "<b class='text-slate-300'>Donanım</b> " + pct + "% · Tüfek " +
        Math.floor(cov.have.guns) + "/" + Math.floor(cov.need.guns) +
        " · Top " + Math.floor(cov.have.artillery) + "/" + Math.floor(cov.need.artillery) +
        " · Tank " + Math.floor(cov.have.tanks) + "/" + Math.floor(cov.need.tanks);
    }
    // HUD soft warn on factories line color via title
    const fac = document.getElementById("hud-factories");
    if (fac) {
      fac.title = cov.deficit ? "Ekipman açığı %" + (100 - pct) : "Donanım OK";
      if (cov.deficit) fac.classList.add("text-amber-400");
      else fac.classList.remove("text-amber-400");
    }
  };

  /** Hava / deniz basit destek bonusu */
  window.getSupportCombatBonus = function(iso) {
    const c = GameState.countries[iso];
    if (!c) return { air: 0, navy: 0, total: 1 };
    const air = (c.airForce && (c.airForce.fighters || 0) + (c.airForce.bombers || 0)) || c.airPower || 0;
    const navy = (c.navy && (c.navy.ships || 0)) || c.navalPower || 0;
    // divisions may store planes
    const fighters = c.divisions?.fighter || c.fighters || 0;
    const bombers = c.divisions?.bomber || c.bombers || 0;
    const ships = c.divisions?.ship || c.ships || 0;
    const airPts = air + fighters * 2 + bombers * 3;
    const navyPts = navy + ships * 2;
    const airBonus = Math.min(0.25, airPts * 0.004);
    const navyBonus = Math.min(0.15, navyPts * 0.003);
    return { air: airBonus, navy: navyBonus, total: 1 + airBonus + navyBonus };
  };

  // Hook war progress
  const prevDelta = window.v27WarProgressDelta;
  window.v27WarProgressDelta = function(base) {
    let d = prevDelta ? prevDelta(base) : base;
    try {
      d *= getEquipmentCoverage(GameState.player).ratio;
      d *= getSupportCombatBonus(GameState.player).total;
    } catch (e) {}
    return d;
  };

  window.renderSupportBonusPanel = function() {
    const b = getSupportCombatBonus(GameState.player);
    const el = document.getElementById("v42-support-bonus");
    if (!el) return;
    el.innerHTML = "<b class='text-slate-300'>Destek</b> Hava +" + Math.round(b.air * 100) +
      "% · Deniz +" + Math.round(b.navy * 100) + "% · Toplam çarpan ×" + b.total.toFixed(2);
  };

  // Overview cards on military tab
  window.renderMilOverviewV42 = function() {
    const box = document.getElementById("mil-overview");
    if (!box) return;
    const p = GameState.countries[GameState.player];
    if (!p) return;
    const d = p.divisions || {};
    const total = Object.values(d).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    const cov = getEquipmentCoverage(GameState.player);
    box.innerHTML = [
      ["Tümen", total, "text-slate-100"],
      ["Mil. fab.", p.milFactories || 0, "text-cyan-300"],
      ["Donanım", Math.round(cov.ratio * 100) + "%", cov.deficit ? "text-amber-400" : "text-emerald-400"]
    ].map(([l, v, cls]) =>
      `<div class="rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-center">
        <div class="text-[9px] text-slate-500 uppercase">${l}</div>
        <div class="text-sm font-black ${cls}">${v}</div>
      </div>`
    ).join("");
    renderSupportBonusPanel();
    renderEquipmentPanel();
  };

  // Tick
  if (!window._v42Interval) {
    window._v42Interval = setInterval(() => {
      if (!GameState.running || GameState.gameOver) return;
      try {
        renderEquipmentPanel();
        renderSupportBonusPanel();
      } catch (e) {}
    }, 2000);
  }

  const _st = window.switchTab;
  if (typeof _st === "function" && !window._v42Tab) {
    window._v42Tab = true;
    window.switchTab = function(tabId) {
      const r = _st.apply(this, arguments);
      try {
        if (tabId === "production" || tabId === "military" || tabId === "dashboard") {
          renderEquipmentPanel();
          if (tabId === "military") renderMilOverviewV42();
        }
      } catch (e) {}
      return r;
    };
  }

  // Deficit log throttle
  let lastWarn = 0;
  window.warnEquipmentIfNeeded = function() {
    const cov = getEquipmentCoverage(GameState.player);
    if (!cov.deficit) return;
    const now = Date.now();
    if (now - lastWarn < 45000) return;
    lastWarn = now;
    if (typeof log === "function")
      log("Ekipman açığı — cephe gücü ×" + cov.ratio.toFixed(2) + ". Üretim sekmesinden fabrika ata.", "text-amber-400");
  };

  // Hook into gameTick lightly
  const _gt = window.gameTick;
  if (typeof _gt === "function" && !window._v42Tick) {
    window._v42Tick = true;
    window.gameTick = function() {
      const r = _gt.apply(this, arguments);
      try {
        if (GameState.activeWars && GameState.activeWars.length) warnEquipmentIfNeeded();
        if (GameState.date && GameState.date.getDate() === 1) renderEquipmentPanel();
      } catch (e) {}
      return r;
    };
  }

  setTimeout(() => {
    try { renderEquipmentPanel(); renderMilOverviewV42(); } catch (e) {}
  }, 800);

  console.log("V42 Adım3: ekipman paneli, açık oran, hava/deniz destek bonusu");
})();



// ============================================================
// PLAN Adım 4 — Fraksiyon & diplomasi (V43)
// Katıl / ayrıl · garanti · gerilim kapıları · CTA netliği
// ============================================================
(function V43FactionDiplo() {
  if (typeof GameState === "undefined") return;

  function st() {
    if (!GameState.hoi) {
      GameState.hoi = {
        factions: {
          axis: { name: "Mihver", leader: "DEU", members: [] },
          allies: { name: "Müttefikler", leader: "GBR", members: [] },
          comintern: { name: "Komintern", leader: "RUS", members: [] }
        },
        armyXP: 0, navyXP: 0, airXP: 0, researchSlots: 2,
        guarantees: {},
        factionJoinCooldown: {}
      };
    }
    if (!GameState.hoi.guarantees) GameState.hoi.guarantees = {};
    if (!GameState.hoi.factionJoinCooldown) GameState.hoi.factionJoinCooldown = {};
    return GameState.hoi;
  }

  window.leaveFaction = function(iso) {
    iso = iso || GameState.player;
    const h = st();
    Object.keys(h.factions).forEach(fid => {
      h.factions[fid].members = (h.factions[fid].members || []).filter(m => m !== iso);
    });
    if (GameState.countries[iso]) GameState.countries[iso].faction = null;
    h.factionJoinCooldown[iso] = (GameState.date ? GameState.date.getTime() : Date.now()) + 30 * 86400000; // ~30 gün
    if (typeof log === "function") log((GameState.countries[iso]?.name || iso) + " fraksiyondan ayrıldı.", "text-slate-400");
    renderHoiFactions();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
  };

  // Gelişmiş join: gerilim + cooldown + ideoloji soft
  window.playerJoinFaction = function(fid) {
    const h = st();
    const wt = GameState.globalTension || 0;
    const iso = GameState.player;
    const cd = h.factionJoinCooldown[iso] || 0;
    const now = GameState.date ? GameState.date.getTime() : Date.now();
    if (cd > now) {
      log("Fraksiyon değişimi için bekleme süresi var (~30 gün).", "text-yellow-400");
      return;
    }
    if (fid === "axis" && wt < 20) {
      log("Dünya gerilimi düşük — Mihver'e katılım için WT ≥ 20 gerekir.", "text-yellow-400");
      return;
    }
    if (fid === "comintern" && wt < 15) {
      log("Komintern için dünya gerilimi ≥ 15 önerilir (yine de katılınıyor).", "text-slate-400");
    }
    if (typeof joinFaction === "function") joinFaction(iso, fid, false);
    else {
      // fallback
      Object.keys(h.factions).forEach(f => {
        h.factions[f].members = (h.factions[f].members || []).filter(m => m !== iso);
      });
      if (h.factions[fid] && !h.factions[fid].members.includes(iso)) h.factions[fid].members.push(iso);
    }
    log("Fraksiyon: " + (h.factions[fid]?.name || fid), "text-cyan-300");
    renderHoiFactions();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
  };

  window.guaranteeIndependence = function(targetIso) {
    if (!targetIso || targetIso === GameState.player) return;
    if (typeof isCountryOperational === "function" && !isCountryOperational(targetIso)) {
      log("Hedef ülke operasyonel değil.", "text-red-400");
      return;
    }
    const wt = GameState.globalTension || 0;
    if (wt < 10) {
      log("Garanti için dünya gerilimi ≥ 10 olmalı.", "text-yellow-400");
      return;
    }
    const h = st();
    h.guarantees[targetIso] = GameState.player;
    if (!GameState.relations) GameState.relations = {};
    GameState.relations[targetIso] = (GameState.relations[targetIso] || 0) + 15;
    log((GameState.countries[targetIso]?.name || targetIso) + " bağımsızlığı garanti edildi.", "text-emerald-400");
    GameState.globalTension = Math.min(100, wt + 2);
    renderHoiFactions();
    if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
  };

  window.revokeGuarantee = function(targetIso) {
    const h = st();
    if (h.guarantees[targetIso] === GameState.player) {
      delete h.guarantees[targetIso];
      log("Garanti kaldırıldı: " + (GameState.countries[targetIso]?.name || targetIso), "text-slate-400");
      renderHoiFactions();
      if (typeof renderDiplomacyTab === "function") renderDiplomacyTab();
    }
  };

  // Savaşta garanti → otomatik CTA
  const _cta = window.callFactionToArms;
  window.callFactionToArms = function(leaderIso, enemyIso) {
    if (_cta) try { _cta(leaderIso, enemyIso); } catch (e) {}
    try {
      const h = st();
      // Garantörler
      Object.keys(h.guarantees || {}).forEach(protectedIso => {
        if (protectedIso === enemyIso) {
          const g = h.guarantees[protectedIso];
          if (g && g !== leaderIso && typeof ensureWar === "function") {
            try { ensureWar(g, leaderIso); } catch (e) {}
            if (g === GameState.player)
              log("Garanti devreye girdi — " + (GameState.countries[enemyIso]?.name || enemyIso) + " için savaşa girildi!", "text-red-400 font-bold");
          }
        }
      });
    } catch (e) {}
  };

  window.htmlFactionBlock = function() {
    const h = st();
    const fid = typeof getFactionOf === "function" ? getFactionOf(GameState.player) : null;
    const fname = fid && h.factions[fid] ? h.factions[fid].name : "Bağımsız";
    return `<div class="pt-2 border-t border-slate-800 space-y-2">
      <h4 class="text-[10px] text-rose-400 uppercase font-black tracking-wider">Fraksiyon</h4>
      <div class="text-[11px] text-slate-300">Üyelik: <b class="text-slate-100">${fname}</b></div>
      <div class="grid grid-cols-2 gap-1.5">
        <button type="button" onclick="playerJoinFaction('allies')" class="py-1.5 text-[9px] font-bold rounded bg-blue-900/50 border border-blue-700 hover:bg-blue-800">Müttefikler</button>
        <button type="button" onclick="playerJoinFaction('axis')" class="py-1.5 text-[9px] font-bold rounded bg-zinc-800 border border-zinc-600 hover:bg-zinc-700">Mihver</button>
        <button type="button" onclick="playerJoinFaction('comintern')" class="py-1.5 text-[9px] font-bold rounded bg-red-950/60 border border-red-800 hover:bg-red-900">Komintern</button>
        <button type="button" onclick="leaveFaction()" class="py-1.5 text-[9px] font-bold rounded bg-slate-800 border border-slate-600 hover:bg-slate-700">Ayrıl</button>
      </div>
      <p class="text-[9px] text-slate-500">Mihver için WT≥20. Ayrılınca ~30 gün bekleme.</p>
    </div>`;
  };

  // Override renderHoiFactions with buttons
  window.renderHoiFactions = function() {
    const box = document.getElementById("hoi-faction-panel");
    const actions = document.getElementById("hoi-faction-actions");
    const gEl = document.getElementById("hoi-guarantees");
    const h = st();
    if (box) {
      box.innerHTML = Object.keys(h.factions).map(fid => {
        const f = h.factions[fid];
        const mem = (f.members || []).filter(m =>
          typeof countryHasLand === "function" ? countryHasLand(m) : true
        );
        const names = mem.map(m => (GameState.countries[m]?.name || m)).slice(0, 5).join(", ");
        const you = mem.includes(GameState.player) ? " ★" : "";
        return `<div><b class="text-slate-300">${f.name}</b><span class="text-amber-400">${you}</span>
          <span class="text-slate-600"> · </span>${names || "—"}</div>`;
      }).join("");
    }
    if (actions) {
      const cur = typeof getFactionOf === "function" ? getFactionOf(GameState.player) : null;
      actions.innerHTML = `
        <button type="button" onclick="playerJoinFaction('allies')" class="px-2 py-0.5 text-[9px] rounded border border-blue-800 bg-blue-950/40 text-blue-200">+ Müttefik</button>
        <button type="button" onclick="playerJoinFaction('axis')" class="px-2 py-0.5 text-[9px] rounded border border-zinc-600 bg-zinc-900 text-zinc-300">+ Mihver</button>
        <button type="button" onclick="playerJoinFaction('comintern')" class="px-2 py-0.5 text-[9px] rounded border border-red-900 bg-red-950/40 text-red-200">+ Komintern</button>
        ${cur ? `<button type="button" onclick="leaveFaction()" class="px-2 py-0.5 text-[9px] rounded border border-slate-600 text-slate-400">Ayrıl</button>` : ""}
      `;
    }
    if (gEl) {
      const mine = Object.keys(h.guarantees || {}).filter(k => h.guarantees[k] === GameState.player);
      gEl.textContent = mine.length
        ? mine.map(k => GameState.countries[k]?.name || k).join(", ")
        : "yok";
    }
  };

  // Diplomacy actions for other countries — inject guarantee button via hook
  const _rd = window.renderDiplomacyTab;
  if (typeof _rd === "function" && !window._v43Diplo) {
    window._v43Diplo = true;
    window.renderDiplomacyTab = function() {
      _rd.apply(this, arguments);
      try {
        const targetIso = GameState.selectedCountry;
        if (!targetIso || targetIso === GameState.player) return;
        const container = document.getElementById("diplo-country-details");
        if (!container || container.querySelector(".v43-guarantee")) return;
        const h = st();
        const isG = h.guarantees[targetIso] === GameState.player;
        const wrap = document.createElement("div");
        wrap.className = "v43-guarantee pt-2 border-t border-slate-800 space-y-1";
        const tf = typeof getFactionOf === "function" ? getFactionOf(targetIso) : null;
        const pf = typeof getFactionOf === "function" ? getFactionOf(GameState.player) : null;
        wrap.innerHTML = `
          <div class="text-[10px] text-slate-500">Hedef fraksiyon: <b class="text-slate-300">${tf ? (h.factions[tf]?.name || tf) : "Bağımsız"}</b>
            · Siz: <b class="text-slate-300">${pf ? (h.factions[pf]?.name || pf) : "Bağımsız"}</b></div>
          ${isG
            ? `<button type="button" onclick="revokeGuarantee('${targetIso}')" class="w-full py-1.5 text-[10px] font-bold rounded bg-slate-800 border border-slate-600">Garantiyi kaldır</button>`
            : `<button type="button" onclick="guaranteeIndependence('${targetIso}')" class="w-full py-1.5 text-[10px] font-bold rounded bg-emerald-950 border border-emerald-700 text-emerald-200">Bağımsızlığı garanti et (WT+2)</button>`
          }
        `;
        container.appendChild(wrap);
      } catch (e) {}
    };
  }

  // Refresh panel
  setTimeout(() => { try { renderHoiFactions(); } catch (e) {} }, 600);
  console.log("V43 Adım4: fraksiyon katıl/ayrıl, garanti, WT kapıları, CTA");
})();



// ============================================================
// PLAN Adım 5 — Cilâ & içerik (V44)
// Event sıklığı · kayıt v5 · öğretici · HUD cilâ · toast
// ============================================================
(function V44Polish() {
  if (typeof GameState === "undefined") return;

  // Event throttle: aynı anda max 1 modal, min aralık
  if (!GameState._eventGate) GameState._eventGate = { last: 0, minMs: 45000, queue: 0 };

  const _show = window.showEventModal;
  if (typeof _show === "function" && !window._v44EventGate) {
    window._v44EventGate = true;
    window.showEventModal = function(ev) {
      if (GameState.eventsEnabled === false) return;
      if (GameState.settings && GameState.settings.eventsEnabled === false) return;
      if (document.getElementById("event-modal") || document.querySelector("[id*='event-modal']")) {
        // zaten açık — kuyruğa
        if (!GameState._eventQueue) GameState._eventQueue = [];
        if (GameState._eventQueue.length < 5) GameState._eventQueue.push(ev);
        return;
      }
      const now = Date.now();
      const gate = GameState._eventGate;
      if (now - gate.last < gate.minMs && !(ev && ev.priority >= 90)) {
        if (!GameState._eventQueue) GameState._eventQueue = [];
        if (GameState._eventQueue.length < 5) GameState._eventQueue.push(ev);
        return;
      }
      gate.last = now;
      return _show.apply(this, arguments);
    };
  }

  // Modal kapanınca kuyruktan bir sonraki
  window.drainEventQueue = function() {
    if (!GameState._eventQueue || !GameState._eventQueue.length) return;
    if (document.getElementById("event-modal")) return;
    const next = GameState._eventQueue.shift();
    if (next && typeof showEventModal === "function") setTimeout(() => showEventModal(next), 600);
  };

  // Observer: when event modal removed
  if (!window._v44Obs) {
    window._v44Obs = true;
    const obs = new MutationObserver(() => {
      if (!document.getElementById("event-modal")) {
        try { drainEventQueue(); } catch (e) {}
      }
    });
    setTimeout(() => {
      try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    }, 1000);
  }

  // Toast helper
  window.showToast = window.showToast || function(msg, kind) {
    let t = document.getElementById("sc-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "sc-toast";
      t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:30000;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:.04em;pointer-events:none;transition:opacity .3s;background:#0f1419;border:1px solid #3d4658;color:#e2e8f0;box-shadow:0 8px 32px rgba(0,0,0,.45)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    t.style.borderColor = kind === "ok" ? "#166534" : kind === "war" ? "#991b1b" : "#3d4658";
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2800);
  };

  // Gelişmiş öğretici (işgal + fraksiyon + üretim)
  window.maybeShowTutorial = function() {
    if (localStorage.getItem("sc_tutorial_done") === "1") return;
    if (document.getElementById("sc-tutorial")) return;
    const m = document.createElement("div");
    m.id = "sc-tutorial";
    m.style.cssText = "position:fixed;inset:0;z-index:25000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px";
    m.innerHTML = `
      <div style="max-width:420px;width:100%;background:#0b0e14;border:1px solid #2a3142;border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.55)">
        <div style="padding:14px 18px;border-bottom:1px solid #1e2430;background:linear-gradient(90deg,#1a1520,#0b0e14)">
          <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#c9a227;font-weight:700">Supreme Command</div>
          <div style="font-size:16px;font-weight:800;color:#f1f5f9;margin-top:4px">Komuta özeti</div>
        </div>
        <ol style="margin:0;padding:16px 18px 8px 32px;color:#94a3b8;font-size:12px;line-height:1.55">
          <li><b style="color:#e2e8f0">Üretim</b> — askeri fabrikaları tüfek/top/tanka böl; donanım barına bak.</li>
          <li><b style="color:#e2e8f0">Savaş</b> — eyaletler önce taralı işgal olur; barışta seçtiklerin senin olur.</li>
          <li><b style="color:#e2e8f0">Fraksiyon</b> — Özet panelinden Mihver / Müttefik / Komintern; garanti diplomaside.</li>
          <li><b style="color:#e2e8f0">Kayıt</b> — Ayarlar veya F5/F9 (varsa) · kayıt v5 işgal+fraksiyon tutar.</li>
          <li style="color:#64748b">ESC = ayarlar · Space = duraklat</li>
        </ol>
        <div style="padding:12px 18px 16px;border-top:1px solid #1e2430;display:flex;gap:8px">
          <button type="button" id="sc-tut-ok" style="flex:1;padding:10px;font-size:12px;font-weight:700;border-radius:8px;border:1px solid #854d0e;background:#422006;color:#fef3c7;cursor:pointer">Anlaşıldı</button>
          <button type="button" id="sc-tut-never" style="padding:10px 12px;font-size:11px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer">Bir daha gösterme</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); };
    document.getElementById("sc-tut-ok").onclick = () => {
      localStorage.setItem("sc_tutorial_done", "1");
      close();
      if (typeof showToast === "function") showToast("İyi komutalar", "ok");
    };
    document.getElementById("sc-tut-never").onclick = () => {
      localStorage.setItem("sc_tutorial_done", "1");
      close();
    };
  };

  // loadGame sonrası müzik + harita
  const _lg = window.loadGame;
  if (typeof _lg === "function" && !window._v44Load) {
    window._v44Load = true;
    window.loadGame = function() {
      const ok = _lg.apply(this, arguments);
      try {
        if (ok !== false) {
          setTimeout(() => {
            if (typeof refreshMapColors === "function") refreshMapColors();
            if (typeof updateHUD === "function") updateHUD();
            if (typeof renderHoiFactions === "function") renderHoiFactions();
            if (typeof renderEquipmentPanel === "function") renderEquipmentPanel();
            if (window.MusicPlayer && typeof MusicPlayer.start === "function") {
              try { MusicPlayer.start(); } catch (e) {}
            } else if (window.musicPlayer && typeof musicPlayer.play === "function") {
              try { musicPlayer.play(); } catch (e) {}
            }
            showToast("Kayıt yüklendi", "ok");
          }, 400);
        }
      } catch (e) {}
      return ok;
    };
  }

  // Hafif HUD stil birliği
  if (!document.getElementById("v44-polish-css")) {
    const s = document.createElement("style");
    s.id = "v44-polish-css";
    s.textContent = `
      #hud-gold, #hud-manpower, #hud-factories, #hud-tension { font-variant-numeric: tabular-nums; }
      .tab-btn.active, .tab-btn[data-active="1"] { border-color: #b45309 !important; color: #fef3c7 !important; }
      #log-content p { line-height: 1.35; }
      #sc-toast { font-family: ui-sans-serif, system-ui, sans-serif; }
    `;
    document.head.appendChild(s);
  }

  // Help key F1
  document.addEventListener("keydown", function(e) {
    if (e.key === "F1") {
      e.preventDefault();
      localStorage.removeItem("sc_tutorial_done");
      window._v32TutShown = false;
      maybeShowTutorial();
    }
  });

  console.log("V44 Adım5: event kapısı, kayıt v5, öğretici, toast, yükleme cilâsı");
})();


// V45 — savaş kolaylaştırma notu
(function(){
  if (typeof GameState === "undefined") return;
  // Mevcut savaşların mühimmat ihtiyacını da düşür
  if (GameState.activeWars) {
    GameState.activeWars.forEach(w => {
      if (w.dailyGunsReq > 60) w.dailyGunsReq = 45;
      if (w.dailyArtilleryReq > 12) w.dailyArtilleryReq = 8;
    });
  }
  console.log("V45: savaş denge — rakip zayiat gerçek, oyuncu kayıp düşük, ilerleme boost");
})();



// ============================================================
// Inline flags: {TUR} → flagcdn img (1em, vertical-align middle)
// ============================================================
(function InlineFlagSystem() {
  // Alpha-3 → FlagCDN alpha-2 (oyun ülkeleri + yaygınlar)
  const ISO3_TO_2 = {
    TUR: "tr", USA: "us", DEU: "de", GBR: "gb", FRA: "fr", RUS: "ru", ITA: "it", JPN: "jp",
    AZE: "az", UKR: "ua", POL: "pl", ESP: "es", PRT: "pt", NLD: "nl", BEL: "be", CHE: "ch",
    AUT: "at", HUN: "hu", ROU: "ro", BGR: "bg", GRC: "gr", SRB: "rs", HRV: "hr", CZE: "cz",
    SVK: "sk", SWE: "se", NOR: "no", DNK: "dk", FIN: "fi", IRL: "ie", CHN: "cn", IND: "in",
    BRA: "br", ARG: "ar", MEX: "mx", CAN: "ca", AUS: "au", NZL: "nz", KOR: "kr", PRK: "kp",
    VNM: "vn", THA: "th", IDN: "id", MYS: "my", SGP: "sg", PHL: "ph", PAK: "pk", BGD: "bd",
    IRN: "ir", IRQ: "iq", SAU: "sa", ISR: "il", EGY: "eg", ZAF: "za", NGA: "ng", ETH: "et",
    KEN: "ke", MAR: "ma", DZA: "dz", TUN: "tn", LBY: "ly", SDN: "sd", AFG: "af", GEO: "ge",
    ARM: "am", KAZ: "kz", UZB: "uz", TKM: "tm", KGZ: "kg", TJK: "tj", MNG: "mn", TWN: "tw",
    PRY: "py", URY: "uy", CHL: "cl", COL: "co", PER: "pe", VEN: "ve", BOL: "bo", ECU: "ec",
    CUB: "cu", DOM: "do", GTM: "gt", HND: "hn", SLV: "sv", NIC: "ni", CRI: "cr", PAN: "pa",
    LTU: "lt", LVA: "lv", EST: "ee", BLR: "by", MDA: "md", ALB: "al", MKD: "mk", BIH: "ba",
    SVN: "si", MNE: "me", LUX: "lu", ISL: "is", MLT: "mt", CYP: "cy", AND: "ad", MCO: "mc",
    LIE: "li", SMR: "sm", VAT: "va", QAT: "qa", ARE: "ae", KWT: "kw", BHR: "bh", OMN: "om",
    YEM: "ye", JOR: "jo", LBN: "lb", SYR: "sy", PSE: "ps", LKA: "lk", MMR: "mm", KHM: "kh",
    LAO: "la", NPL: "np", BTN: "bt", MNG: "mn", PRK: "kp", TZA: "tz", UGA: "ug", GHA: "gh",
    CIV: "ci", SEN: "sn", CMR: "cm", COD: "cd", COG: "cg", AGO: "ao", MOZ: "mz", ZWE: "zw",
    ZMB: "zm", BWA: "bw", NAM: "na", RWA: "rw", BDI: "bi", SOM: "so", ERI: "er", DJI: "dj",
    SSD: "ss", GAB: "ga", GNQ: "gq", CAF: "cf", TCD: "td", NER: "ne", MLI: "ml", BFA: "bf",
    GIN: "gn", GNB: "gw", SLE: "sl", LBR: "lr", TGO: "tg", BEN: "bj", GMB: "gm", CPV: "cv",
    MUS: "mu", SYC: "sc", COM: "km", MDG: "mg", MWI: "mw", LSO: "ls", SWZ: "sz", FJI: "fj",
    PNG: "pg", SLB: "sb", VUT: "vu", WSM: "ws", TON: "to", KIR: "ki", TUV: "tv", NRU: "nr",
    PLW: "pw", FSM: "fm", MHL: "mh", DNZ: "pl", // Danzig fallback
    AUT: "at", HUN: "hu"
  };

  // Ülke verisinden flag alanı varsa onu tercih et
  function resolveIso2(iso3) {
    const code = String(iso3 || "").toUpperCase();
    if (typeof GameState !== "undefined" && GameState.countries && GameState.countries[code]) {
      const f = GameState.countries[code].flag;
      if (f && typeof f === "string" && f.length === 2 && !f.startsWith("http")) return f.toLowerCase();
    }
    return ISO3_TO_2[code] || null;
  }

  window.formatInlineFlags = function(text) {
    if (text == null) return "";
    const s = String(text);
    // Zaten img içeren HTML'e dokunma kısmen — sadece {ABC} kalıpları
    return s.replace(/\{([A-Za-z]{3})\}/g, (match, iso3) => {
      const iso2 = resolveIso2(iso3);
      if (!iso2) return match;
      const src = "https://flagcdn.com/" + iso2.toLowerCase() + ".svg";
      return '<img src="' + src + '" class="inline-flag" alt="' + String(iso3).toUpperCase() + '" title="' + String(iso3).toUpperCase() + '" loading="lazy">';
    });
  };

  /** Belirli bir elementin innerHTML içindeki {ISO} kalıplarını bayrağa çevir */
  window.convertTextToFlags = function(root) {
    const el = typeof root === "string" ? document.getElementById(root) : (root || document.body);
    if (!el) return;
    // Text node walker — innerHTML replace riskli; basit container'lar için OK
    const targets = el.querySelectorAll
      ? [el, ...el.querySelectorAll(".log-line, #log-content, #diplo-country-details, #hoi-faction-panel, .panel-card, p, span, div")]
      : [el];
    const seen = new Set();
    targets.forEach(node => {
      if (!node || seen.has(node) || !node.childNodes) return;
      // Sadece doğrudan metin + basit HTML karışımı olan yaprak-ish node'larda
      if (node.children && node.children.length > 8) return;
      const html = node.innerHTML;
      if (!html || html.indexOf("{") === -1) return;
      if (!/\{[A-Za-z]{3}\}/.test(html)) return;
      // Script/style atla
      if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
      seen.add(node);
      try {
        node.innerHTML = formatInlineFlags(html);
      } catch (e) {}
    });
  };

  // Toast / newspaper helper
  const _toast = window.showToast;
  if (typeof _toast === "function" && !window._flagToast) {
    window._flagToast = true;
    window.showToast = function(msg, kind) {
      return _toast.call(this, typeof formatInlineFlags === "function" ? msg : msg, kind);
      // toast uses textContent usually — skip
    };
  }

  // MutationObserver: yeni log satırları (zaten log hook'lu) + diplo panelleri
  if (!window._flagObs) {
    window._flagObs = true;
    document.addEventListener("DOMContentLoaded", () => {
      try { convertTextToFlags(document.getElementById("game-lobby") || document.body); } catch (e) {}
    });
    // Geç yükleme
    setTimeout(() => {
      try { convertTextToFlags(document.body); } catch (e) {}
    }, 1500);
  }

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
      mm_version: "v1.1 · Grand Master · Map 1081",
      mm_subtitle: "1081 provinces · occupation before annexation · scenario history",
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
      mm_version: "v1.1 · Grand Master · Harita 1081",
      mm_subtitle: "1081 eyalet · ilhaktan önce işgal · senaryo tarihi",
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

  // ---------- Public guards ----------
  window.mpIsActive = function () { return !!MP.active; };
  window.mpIsHost = function () { return !!MP.isHost; };
  window.mpIsSpectator = function () { return !!MP.spectator || !!MP.eliminated; };

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
      if (!on) {
        document.getElementById("mp-host-opts")?.classList.add("hidden");
        document.getElementById("mp-start-btn")?.classList.add("hidden");
      }
    } catch (e) {
      console.warn("[MP] lobby UI:", e);
    }
  };

  function mpRenderLobbyList() {
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
          country: String(msg.country || "TUR").toUpperCase().slice(0, 3),
          ready: false,
          spectator: !!msg.spectator,
          eliminated: false
        };
        mpRenderLobbyList();
        broadcast({ t: "players", players: MP.players });
        sendTo(MP.conns[fromId], { t: "welcome", hostId: MP.peerId, players: MP.players, roomCode: MP.roomCode, scenario: MP.scenario, speed: MP.speedLevel, maxPlayers: maxP });
        mpSysChat((msg.name || fromId) + " katıldı");
        try { if (typeof window.mpAnnounceRoom === "function") window.mpAnnounceRoom(); } catch (e) {}
        break;
      }
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
        mpRenderLobbyList();
        mpSetLobbyInRoom(true);
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
    MP.country = (document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 3);
    // Supremacy: full ISO from select
    MP.spectator = !!document.getElementById("mp-spectator")?.checked;
    MP.scenario = document.getElementById("mp-scenario")?.value || "modern";
    MP.roomCode = genRoomCode();
    setRoomHash(MP.roomCode);
    lockEasterEggs();

    const hid = hostPeerIdFromCode(MP.roomCode);
    try { if (MP.peer) MP.peer.destroy(); } catch (e) {}
    MP.peer = new Peer(hid, { debug: 0 });
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
    MP.country = (document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 3);
    // Supremacy: full ISO from select
    MP.spectator = !!document.getElementById("mp-spectator")?.checked;
    MP.roomCode = code;
    setRoomHash(code);
    MP.isHost = false;
    MP.active = true;
    lockEasterEggs();

    try { if (MP.peer) MP.peer.destroy(); } catch (e) {}
    MP.peer = new Peer(undefined, { debug: 0 });
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
      GameState.player = MP.players[MP.peerId].country;
      MP.country = GameState.player;
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
// Engineered by Grok · Canonical release freeze
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
        "%c Engineered by Grok %c HTML5 / JavaScript Grand Strategy Engine ",
        "background:#1a1810;color:#e8eef7;font-weight:700;padding:3px 8px;",
        "background:#0a1018;color:#5a6450;padding:3px 8px;"
      );
      console.log("[SC] Release freeze · map pack 1081 · host-centric MP · focus · supply · intel · designer");
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
    if (!mpActive() || !isHost() || !GameState.mp) return;
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
        el.textContent = "v1.1 · Grand Master · Harita 1081";
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
    const myIso = (mp() && mp().country) || sel.value || "TUR";
    const list = Object.keys(GameState.countries)
      .map(iso => ({ iso, name: GameState.countries[iso].name || iso }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    sel.innerHTML = list.map(x => {
      const locked = taken.has(x.iso) && x.iso !== myIso;
      return `<option value="${x.iso}" ${x.iso === myIso ? "selected" : ""} ${locked ? "disabled" : ""}>${x.name}${locked ? " (alınmış)" : ""}</option>`;
    }).join("");
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

  // Keep select fresh
  setInterval(function () {
    try {
      if (document.getElementById("mp-lobby-modal") && !document.getElementById("mp-lobby-modal").classList.contains("hidden")) {
        mpRefreshCountrySelect();
      }
    } catch (e) {}
  }, 1500);

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

  console.log("[Supremacy MP] continuous world · AI fill · newspaper · ranking");
})();

// ============================================================
// PLAYABLE FIX — map redraw + menu nuclear hide + SP smoke path
// ============================================================
(function SCPlayableFix() {
  "use strict";

  window.scCountMapPaths = function () {
    try {
      return document.querySelectorAll("#game-map path.country-path, #game-map path").length;
    } catch (e) { return 0; }
  };

  window.scForceHideMenus = function () {
    ["main-menu-screen", "lobby-screen", "sc-tutorial", "credits-modal", "mp-lobby-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.setAttribute("aria-hidden", "true");
    });
  };

  window.scShowGameShell = function () {
    scForceHideMenus();
    var root = document.getElementById("game-root");
    if (root) {
      root.style.setProperty("display", "flex", "important");
      root.style.setProperty("visibility", "visible", "important");
      root.style.opacity = "1";
    }
    var top = document.getElementById("top-bar");
    if (top) {
      top.style.setProperty("display", "flex", "important");
      top.style.visibility = "visible";
    }
    var mc = document.getElementById("map-container");
    if (mc) {
      mc.style.visibility = "visible";
      mc.style.opacity = "1";
    }
  };

  // Full map redraw if wiped
  window.scRedrawMap = function () {
    return new Promise(function (resolve) {
      try {
        if (typeof d3 === "undefined") return resolve(false);
        var svg = d3.select("#game-map");
        if (svg.empty()) return resolve(false);
        var g = svg.select("g");
        if (g.empty()) g = svg.append("g");
        // clear only paths, keep structure
        g.selectAll("path").remove();
        var url = (typeof MAP_JSON_URL !== "undefined") ? MAP_JSON_URL : "./assets/maps/1081/map.json";
        d3.json(url).then(function (provinces) {
          if (!provinces || !provinces.length) {
            console.warn("[playable] map.json empty");
            return resolve(false);
          }
          g.selectAll("path")
            .data(provinces)
            .enter()
            .append("path")
            .attr("d", function (d) { return d.path; })
            .attr("class", "country-path")
            .attr("id", function (d) { return String(d.name).replace(/[^a-zA-Z0-9_]/g, "_"); })
            .attr("data-name", function (d) { return d.name; })
            .style("fill", function (d) {
              var owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(d.name) : "NEUTRAL";
              return (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
            })
            .style("stroke", "rgba(0,0,0,0.2)")
            .style("stroke-width", 0.02)
            .on("click", function (event, d) {
              if (typeof handleProvinceClick === "function") handleProvinceClick(event, d);
            })
            .on("contextmenu", function (event, d) {
              event.preventDefault();
              if (typeof handleProvinceClick === "function") handleProvinceClick(event, d);
            });
          try {
            if (typeof refreshMapColors === "function") refreshMapColors();
          } catch (e) {}
          // Fit view
          try {
            var bounds = g.node().getBBox();
            var zoom = d3.zoom();
            var scale = Math.min(
              (window.innerWidth - 80) / Math.max(bounds.width, 1),
              (window.innerHeight - 80) / Math.max(bounds.height, 1)
            ) * 0.85;
            svg.call(zoom.transform, d3.zoomIdentity
              .translate(window.innerWidth / 2, window.innerHeight / 2)
              .scale(scale)
              .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2));
          } catch (e) {}
          console.log("[playable] map redrawn →", provinces.length);
          resolve(true);
        }).catch(function (e) {
          console.error("[playable] map fetch", e);
          resolve(false);
        });
      } catch (e) {
        console.error("[playable] redraw", e);
        resolve(false);
      }
    });
  };

  // Reliable political color paint (bypass broken wrappers)
  window.scPaintPolitical = function () {
    try {
      var occ = GameState.occupations || {};
      d3.selectAll("#game-map path.country-path").each(function () {
        var path = d3.select(this);
        var name = path.attr("data-name");
        if (!name) return;
        var owner = (typeof getProvinceOwner === "function") ? getProvinceOwner(name) : (provinceOwners[name] || "NEUTRAL");
        var color = (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
        if (occ[name] && occ[name] !== owner && GameState.countries[occ[name]]) {
          // simple darker blend for occupation
          path.style("fill", GameState.countries[occ[name]].color || color);
          path.style("opacity", 0.85);
        } else {
          path.style("fill", color);
          path.style("opacity", 1);
        }
      });
    } catch (e) {
      console.warn("[paint]", e);
    }
  };

  // Wrap startGame to always show shell + ensure map
  (function wrapStart() {
    var prev = window.startGame;
    if (typeof prev !== "function") return;
    window.startGame = async function () {
      var r;
      try {
        r = await prev.apply(this, arguments);
      } catch (e) {
        console.error("[start]", e);
      }
      try {
        scShowGameShell();
        var n = scCountMapPaths();
        if (n < 100) {
          console.warn("[playable] map missing after start (" + n + ") — redraw");
          await scRedrawMap();
        }
        scPaintPolitical();
        scShowGameShell();
        // Keep menus dead for a few seconds (fight any re-show)
        var i = 0;
        var iv = setInterval(function () {
          scShowGameShell();
          if (++i > 15) clearInterval(iv);
        }, 200);
      } catch (e) {
        console.error("[playable post-start]", e);
      }
      return r;
    };
  })();

  // One-click playable: from main menu go TUR modern
  window.scQuickPlay = async function () {
    try {
      if (typeof mainMenuNewGame === "function") mainMenuNewGame();
      await new Promise(function (r) { setTimeout(r, 100); });
      var ls = document.getElementById("lobby-country-select");
      if (ls) {
        if ([].some.call(ls.options, function (o) { return o.value === "TUR"; })) ls.value = "TUR";
      }
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) ss.value = "modern";
      GameState.player = "TUR";
      if (typeof startGame === "function") await startGame();
      scShowGameShell();
      if (scCountMapPaths() < 100) await scRedrawMap();
      scPaintPolitical();
      try {
        if (typeof log === "function") log("Hızlı oyun: Türkiye · Modern", "text-emerald-400");
      } catch (e) {}
      return true;
    } catch (e) {
      console.error("[quickplay]", e);
      return false;
    }
  };

  // CSS nuclear
  var style = document.createElement("style");
  style.id = "sc-playable-css";
  style.textContent = [
    "#main-menu-screen.hidden,#lobby-screen.hidden,#sc-tutorial,#credits-modal.hidden,#mp-lobby-modal.hidden{",
    "display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important;z-index:-1!important;}",
    "#game-root{min-height:0;}",
    "#map-container{background:#031a5c!important;}",
    ".country-path{cursor:pointer;}"
  ].join("");
  if (document.head) document.head.appendChild(style);
  else document.addEventListener("DOMContentLoaded", function () { document.head.appendChild(style); });

  // Watchdog: if game running but map empty, redraw once
  var _wdOnce = false;
  setInterval(function () {
    try {
      if (!GameState || !GameState.running || GameState.gameOver) return;
      if (scCountMapPaths() >= 100) { _wdOnce = false; return; }
      if (_wdOnce) return;
      _wdOnce = true;
      console.warn("[playable] watchdog redraw");
      scRedrawMap().then(function () { scPaintPolitical(); scShowGameShell(); });
    } catch (e) {}
  }, 2500);

  console.log("[playable] map redraw · menu lock · quickplay ready");
})();

// ============================================================
// PLAYABLE HARD LOCK — keep menus dead while running + SP polish
// ============================================================
(function SCHardPlayable() {
  "use strict";

  function hardHideMenus() {
    ["main-menu-screen", "lobby-screen", "sc-tutorial", "credits-modal", "mp-lobby-modal"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("flex");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("opacity", "0", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("z-index", "-1", "important");
    });
  }

  function ensureShell() {
    hardHideMenus();
    var root = document.getElementById("game-root");
    if (root) {
      root.style.setProperty("display", "flex", "important");
      root.style.setProperty("visibility", "visible", "important");
      root.style.opacity = "1";
    }
    var top = document.getElementById("top-bar");
    if (top) {
      top.style.setProperty("display", "flex", "important");
      top.style.visibility = "visible";
      top.style.opacity = "1";
    }
    var mc = document.getElementById("map-container");
    if (mc) {
      mc.style.visibility = "visible";
      mc.style.opacity = "1";
    }
    var logp = document.getElementById("log-panel");
    if (logp) logp.classList.remove("hidden");
  }

  // Continuous lock while game is running
  setInterval(function () {
    try {
      if (!window.GameState || !GameState.running || GameState.gameOver) return;
      ensureShell();
    } catch (e) {}
  }, 400);

  // Patch startGame one more time — last wins
  var _prevStart = window.startGame;
  window.startGame = async function () {
    var r;
    try {
      if (typeof _prevStart === "function") r = await _prevStart.apply(this, arguments);
    } catch (e) {
      console.error("[hard-start]", e);
    }
    try {
      GameState.running = true;
      ensureShell();
      if (typeof scCountMapPaths === "function" && scCountMapPaths() < 100 && typeof scRedrawMap === "function") {
        await scRedrawMap();
      }
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      ensureShell();
      // aggressive lock for first 5s
      var i = 0;
      var iv = setInterval(function () {
        ensureShell();
        if (++i > 25) clearInterval(iv);
      }, 200);
    } catch (e) {
      console.error("[hard post-start]", e);
    }
    return r;
  };

  // One-button reliable SP: TUR modern
  window.scForcePlay = async function () {
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls) ls.value = "TUR";
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) ss.value = "modern";
      GameState.player = "TUR";
      if (typeof startGame === "function") await startGame();
      ensureShell();
      return true;
    } catch (e) {
      console.error("[forcePlay]", e);
      return false;
    }
  };

  // Extra CSS nuclear
  var st = document.createElement("style");
  st.id = "sc-hard-playable-css";
  st.textContent = [
    "body.sc-ingame #main-menu-screen,",
    "body.sc-ingame #lobby-screen,",
    "body.sc-ingame #credits-modal,",
    "body.sc-ingame #mp-lobby-modal,",
    "body.sc-ingame #sc-tutorial {",
    "  display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;",
    "}",
    "body.sc-ingame #game-root { display:flex!important; visibility:visible!important; }",
    "body.sc-ingame #top-bar { display:flex!important; visibility:visible!important; }"
  ].join("");
  (document.head || document.documentElement).appendChild(st);

  // Toggle body class with running state
  setInterval(function () {
    try {
      if (GameState && GameState.running && !GameState.gameOver) {
        document.body.classList.add("sc-ingame");
      } else {
        document.body.classList.remove("sc-ingame");
      }
    } catch (e) {}
  }, 300);

  console.log("[hard-playable] menu lock + forcePlay ready");
})();



// Ensure GameState is reachable from window (classic script const is not on window)
(function(){
  try {
    if (typeof GameState !== "undefined") window.GameState = GameState;
    if (typeof provinceOwners !== "undefined") window.provinceOwners = provinceOwners;
  } catch (e) {}
})();

// ===== SC RELEASE POLISH v1.1.3 =====
(function SCRelease113() {
  "use strict";

  function showEl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("hidden");
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("z-index", id === "main-menu-screen" ? "60" : "50", "important");
  }
  function hideEl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add("hidden");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("z-index", "-1", "important");
  }

  // Reliable menu navigation
  window.mainMenuNewGame = function () {
    hideEl("main-menu-screen");
    hideEl("credits-modal");
    hideEl("mp-lobby-modal");
    showEl("lobby-screen");
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls && !ls.value) ls.value = "TUR";
      var ss = document.getElementById("lobby-scenario-select");
      if (ss && !ss.value) ss.value = "modern";
    } catch (e) {}
  };
  window.mainMenuBack = function () {
    hideEl("lobby-screen");
    hideEl("mp-lobby-modal");
    showEl("main-menu-screen");
    try { if (typeof refreshContinueButton === "function") refreshContinueButton(); } catch (e) {}
  };

  // Final start wrapper — always last
  var _relPrev = window.startGame;
  window.startGame = async function startGameRelease() {
    var err = null;
    try {
      if (typeof _relPrev === "function") await _relPrev.apply(this, arguments);
    } catch (e) {
      err = e;
      console.error("[release-start]", e);
    }
    try {
      if (typeof GameState !== "undefined") GameState.running = true;
      hideEl("main-menu-screen");
      hideEl("lobby-screen");
      hideEl("credits-modal");
      hideEl("mp-lobby-modal");
      document.body.classList.add("sc-ingame");
      var root = document.getElementById("game-root");
      if (root) {
        root.style.setProperty("display", "flex", "important");
        root.style.setProperty("visibility", "visible", "important");
      }
      var top = document.getElementById("top-bar");
      if (top) top.style.setProperty("display", "flex", "important");
      if (typeof scCountMapPaths === "function" && scCountMapPaths() < 100 && typeof scRedrawMap === "function") {
        await scRedrawMap();
      }
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      // Keep menus dead 6s
      var n = 0;
      var iv = setInterval(function () {
        hideEl("main-menu-screen");
        hideEl("lobby-screen");
        if (++n > 30) clearInterval(iv);
      }, 200);
    } catch (e2) {
      console.error("[release-post]", e2);
    }
    if (err) throw err;
  };

  // Force play always available
  window.scForcePlay = async function () {
    try {
      var ls = document.getElementById("lobby-country-select");
      if (ls) {
        try { ls.value = "TUR"; } catch (e) {}
      }
      var ss = document.getElementById("lobby-scenario-select");
      if (ss) {
        try { ss.value = "modern"; } catch (e) {}
      }
      if (typeof GameState !== "undefined") GameState.player = "TUR";
      hideEl("main-menu-screen");
      showEl("lobby-screen");
      await new Promise(function (r) { setTimeout(r, 80); });
      if (typeof startGame === "function") await startGame();
      hideEl("main-menu-screen");
      hideEl("lobby-screen");
      document.body.classList.add("sc-ingame");
      return true;
    } catch (e) {
      console.error("[scForcePlay]", e);
      try {
        if (typeof showToast === "function") showToast("Başlatma hatası: " + (e && e.message ? e.message : e), "bad");
      } catch (e2) {}
      return false;
    }
  };

  // Continuous menu lock while running
  setInterval(function () {
    try {
      if (typeof GameState === "undefined" || !GameState.running || GameState.gameOver) {
        document.body.classList.remove("sc-ingame");
        return;
      }
      document.body.classList.add("sc-ingame");
      ["main-menu-screen", "lobby-screen", "credits-modal", "mp-lobby-modal", "sc-tutorial"].forEach(hideEl);
    } catch (e) {}
  }, 500);

  console.log("[release v1.1.3] menu nav + forcePlay + lock");
})();


// ===== SC HOUR ONE — first-hour engagement =====
// Goal: player should not stare at a quiet map for the first ~1h of real play.
(function SCHourOne() {
  "use strict";

  var DAY_MS = 24 * 3600 * 1000;
  var WINDOW_DAYS = 120; // first ~4 game months = dense opening

  function GS() {
    try { return window.GameState || (typeof GameState !== "undefined" ? GameState : null); } catch (e) { return null; }
  }

  function ensureHour() {
    var g = GS();
    if (!g) return null;
    if (!g.hourOne) {
      g.hourOne = {
        startMs: g.date ? g.date.getTime() : Date.now(),
        dayIndex: 0,
        lastPulseDay: -1,
        lastNewsDay: -1,
        missionsDone: {},
        flashWars: 0,
        tensionBoosted: false,
        introFired: false
      };
    }
    return g.hourOne;
  }

  function daysSinceStart(g, h) {
    if (!g || !g.date || !h) return 0;
    return Math.max(0, Math.floor((g.date.getTime() - h.startMs) / DAY_MS));
  }

  function inOpening(g, h) {
    return daysSinceStart(g, h) <= WINDOW_DAYS;
  }

  function neighborsOfPlayer(g) {
    var out = [];
    try {
      if (typeof countriesShareBorder !== "function") return out;
      Object.keys(g.countries || {}).forEach(function (iso) {
        if (iso === g.player) return;
        if (countriesShareBorder(iso, g.player)) out.push(iso);
      });
    } catch (e) {}
    return out;
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function nameOf(g, iso) {
    var c = g.countries[iso];
    return (c && c.name) || iso;
  }

  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(msg, kind || "info");
      else if (typeof log === "function") log(msg, "text-amber-300");
    } catch (e) {}
  }

  function slog(msg, cls) {
    try { if (typeof log === "function") log(msg, cls || "text-slate-300"); } catch (e) {}
  }

  // ----- Opening missions (auto-tracked) -----
  var MISSIONS = [
    {
      id: "focus_start",
      title: "Milli odak başlat",
      hint: "Sol panelden bir milli odak seç — ilk 2 hafta içinde.",
      check: function (g) {
        var p = g.countries[g.player];
        return !!(p && (p.activeFocus || (p.completedFocuses && p.completedFocuses.length)));
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 250;
        p.manpower = (p.manpower || 0) + 8000;
        slog("🎯 GÖREV: Milli odak — +250 hazine, +8K İG", "text-emerald-400");
        toast("Görev tamam: Milli odak", "good");
      }
    },
    {
      id: "build_civ",
      title: "1 sivil fabrika kur / yükselt",
      hint: "Ekonomi paneli veya inşa ile sivil fabrika sayını artır.",
      check: function (g, h) {
        var p = g.countries[g.player];
        if (!p) return false;
        if (h.baseCiv == null) h.baseCiv = p.civFactories || 0;
        return (p.civFactories || 0) > h.baseCiv;
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 400;
        slog("🎯 GÖREV: Sivil fabrika — +400 hazine", "text-emerald-400");
        toast("Görev tamam: Sanayi", "good");
      }
    },
    {
      id: "raise_div",
      title: "Orduyu büyüt",
      hint: "En az +2 piyade tümeni kur (stok / seferberlik).",
      check: function (g, h) {
        var p = g.countries[g.player];
        if (!p || !p.divisions) return false;
        var inf = p.divisions.inf || 0;
        if (h.baseInf == null) h.baseInf = inf;
        return inf >= h.baseInf + 2;
      },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.stockpile = p.stockpile || {};
        p.stockpile.guns = (p.stockpile.guns || 0) + 1200;
        slog("🎯 GÖREV: Ordu büyütme — +1200 tüfek", "text-emerald-400");
        toast("Görev tamam: Seferberlik", "good");
      }
    },
    {
      id: "survive_crisis",
      title: "İlk krizi atlat",
      hint: "Açılış krizlerinden birini seçimle çöz.",
      check: function (g, h) { return !!h.crisisResolved; },
      reward: function (g) {
        var p = g.countries[g.player];
        if (!p) return;
        p.money = (p.money || 0) + 300;
        g.globalTension = Math.max(0, (g.globalTension || 0) - 3);
        slog("🎯 GÖREV: Kriz yönetimi — +300 hazine, gerilim −3", "text-emerald-400");
        toast("Görev tamam: Kriz", "good");
      }
    }
  ];

  function checkMissions(g, h) {
    MISSIONS.forEach(function (m) {
      if (h.missionsDone[m.id]) return;
      try {
        if (m.check(g, h)) {
          h.missionsDone[m.id] = true;
          m.reward(g);
          try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
        }
      } catch (e) {}
    });
  }

  // ----- Scripted crises (modal when possible) -----
  function fireChoiceEvent(title, desc, choices) {
    try {
      if (typeof showEventModal === "function") {
        // generic fallback below
      }
    } catch (e) {}
    // Build a lightweight modal compatible with existing event-modal id
    if (document.getElementById("event-modal")) return false;
    var modal = document.createElement("div");
    modal.id = "event-modal";
    modal.className = "fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 p-4";
    var btns = choices.map(function (c, i) {
      return '<button type="button" data-i="' + i + '" class="w-full text-left px-3 py-2 mb-2 rounded border border-slate-600 bg-slate-900 hover:border-amber-600 text-sm text-slate-200">' +
        c.label + "</button>";
    }).join("");
    modal.innerHTML =
      '<div class="w-full max-w-md rounded border border-amber-800/50 bg-[#12161f] shadow-2xl overflow-hidden">' +
      '<div class="px-4 py-3 border-b border-slate-800 bg-[#0e1219]">' +
      '<div class="text-[10px] uppercase tracking-widest text-amber-600 font-bold">Açılış Krizi</div>' +
      '<h2 class="text-base font-bold text-amber-100 mt-1">' + title + "</h2></div>" +
      '<div class="px-4 py-3 text-sm text-slate-300 leading-relaxed">' + desc + "</div>" +
      '<div class="px-4 py-3 border-t border-slate-800">' + btns + "</div></div>";
    document.body.appendChild(modal);
    modal.querySelectorAll("button[data-i]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-i"), 10);
        try { choices[idx].fn(); } catch (e) { console.warn(e); }
        modal.remove();
        var g = GS();
        var h = ensureHour();
        if (h) h.crisisResolved = true;
        try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
      });
    });
    return true;
  }

  function crisisBorder(g, h) {
    var n = pick(neighborsOfPlayer(g));
    if (!n) n = pick(Object.keys(g.countries || {}).filter(function (x) { return x !== g.player; }));
    if (!n) return;
    var nm = nameOf(g, n);
    fireChoiceEvent(
      "Sınır Olayı — " + nm,
      nm + " birlikleri sınırda 'tatbikat' adı altında yığınak yaptı. Basın galeyanda. Nasıl karşılık veriyorsun?",
      [
        {
          label: "Diplomatik nota ver (gerilim +2, ilişki −5)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 2);
            if (!g.relations) g.relations = {};
            g.relations[n] = (g.relations[n] || 0) - 5;
            slog("📜 Nota: " + nm + " protesto edildi.", "text-yellow-300");
          }
        },
        {
          label: "Karşılık yığınak (para −120, gerilim +6, ordu moral +)",
          fn: function () {
            var p = g.countries[g.player];
            if (p) p.money = Math.max(0, (p.money || 0) - 120);
            g.globalTension = Math.min(100, (g.globalTension || 0) + 6);
            if (p && p.divisions) p.divisions.inf = (p.divisions.inf || 0) + 1;
            slog("🪖 Sınır yığınağı: " + nm + " karşısında 1 tümen konuşlandı.", "text-orange-400");
          }
        },
        {
          label: "Görmezden gel (gerilim +1, istikrar riski)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 1);
            var p = g.countries[g.player];
            if (p) p.stability = Math.max(20, (p.stability || 55) - 4);
            slog("😶 Kriz yok sayıldı — muhalefet sert eleştirdi.", "text-slate-400");
          }
        }
      ]
    );
  }

  function crisisEconomy(g, h) {
    fireChoiceEvent(
      "Bütçe Krizi",
      "Hazine beklenenden zayıf geldi. Kabine ikiye bölündü: kemer sıkma mı, açık mı?",
      [
        {
          label: "Kemer sık (para +180, fabrika verimi −3% 60 gün)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = (p.money || 0) + 180;
            p.factoryEfficiency = Math.max(0.7, (p.factoryEfficiency || 1) - 0.03);
            slog("💰 Kemer sıkma paketi kabul edildi.", "text-yellow-300");
          }
        },
        {
          label: "Açık ver, silahlan (para −100, +800 tüfek, gerilim +3)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = Math.max(0, (p.money || 0) - 100);
            p.stockpile = p.stockpile || {};
            p.stockpile.guns = (p.stockpile.guns || 0) + 800;
            g.globalTension = Math.min(100, (g.globalTension || 0) + 3);
            slog("🔫 Silahlanma kredisi açıldı.", "text-orange-400");
          }
        },
        {
          label: "Dış borç (para +500, ilişki maliyeti — komşular −8)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = (p.money || 0) + 500;
            if (!g.relations) g.relations = {};
            neighborsOfPlayer(g).forEach(function (iso) {
              g.relations[iso] = (g.relations[iso] || 0) - 8;
            });
            slog("🏦 Dış borç alındı — komşular tedirgin.", "text-amber-300");
          }
        }
      ]
    );
  }

  function crisisRefugees(g, h) {
    var n = pick(neighborsOfPlayer(g)) || "Bölge";
    var nm = typeof n === "string" && g.countries[n] ? nameOf(g, n) : "komşu bölge";
    fireChoiceEvent(
      "Mülteci Dalgası",
      nm + " tarafından sınırına onlarca bin sivil yığıldı. Kabul mü, geri çevirme mi?",
      [
        {
          label: "Kabul et (+15K İG, para −150, istikrar −3)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.manpower = (p.manpower || 0) + 15000;
            p.money = Math.max(0, (p.money || 0) - 150);
            p.stability = Math.max(15, (p.stability || 55) - 3);
            slog("🏕️ Mülteciler kabul edildi.", "text-cyan-300");
          }
        },
        {
          label: "Sınırı kapat (gerilim +5, ilişki −12)",
          fn: function () {
            g.globalTension = Math.min(100, (g.globalTension || 0) + 5);
            if (g.countries[n] && g.relations) g.relations[n] = (g.relations[n] || 0) - 12;
            slog("🚧 Sınır kapatıldı — uluslararası tepki.", "text-orange-400");
          }
        },
        {
          label: "Geçici kamplar (para −80, İG +6K)",
          fn: function () {
            var p = g.countries[g.player];
            if (!p) return;
            p.money = Math.max(0, (p.money || 0) - 80);
            p.manpower = (p.manpower || 0) + 6000;
            slog("⛺ Geçici kamplar kuruldu.", "text-slate-300");
          }
        }
      ]
    );
  }

  function maybeScriptedCrisis(g, h, day) {
    if (document.getElementById("event-modal")) return;
    // Day 3, 12, 28, 45, 70...
    var slots = [3, 12, 28, 45, 70, 95];
    if (slots.indexOf(day) === -1) return;
    if (h["crisis_" + day]) return;
    h["crisis_" + day] = true;
    var roll = Math.random();
    if (roll < 0.34) crisisBorder(g, h);
    else if (roll < 0.67) crisisEconomy(g, h);
    else crisisRefugees(g, h);
  }

  // ----- World news pulse (log spam that feels alive) -----
  var NEWS = [
    function (g) {
      var a = pick(Object.keys(g.countries)); var b = pick(Object.keys(g.countries));
      if (!a || !b || a === b) return null;
      return "📰 " + nameOf(g, a) + " ile " + nameOf(g, b) + " arasında ticaret görüşmeleri sürüyor.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "🏭 " + nameOf(g, a) + " yeni bir silah fabrikasını devreye aldı." : null;
    },
    function (g) {
      return "📡 Küresel gerilim: %" + Math.floor(g.globalTension || 0) + " — borsalar temkinli.";
    },
    function (g) {
      var a = pick(neighborsOfPlayer(g));
      return a ? "🚨 İstihbarat: " + nameOf(g, a) + " sınırında olağan dışı hareketlilik." : "🚨 İstihbarat: bölgede tatbikat yoğunluğu arttı.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "🕊️ " + nameOf(g, a) + " barış çağrısı yayımladı (propaganda olabilir)." : null;
    },
    function (g) {
      return "⚔️ Ani çatışma raporları: uzak bir cephede topçu ateşi duyuldu.";
    },
    function (g) {
      var a = pick(Object.keys(g.countries));
      return a ? "👷 " + nameOf(g, a) + " içinde grev dalgası — üretim düştü." : null;
    }
  ];

  function pulseNews(g, h, day) {
    if (day === h.lastNewsDay) return;
    if (day % 2 !== 0) return; // every other day in opening
    h.lastNewsDay = day;
    var fn = pick(NEWS);
    var line = fn && fn(g);
    if (line) slog(line, "text-slate-400");
  }

  // ----- AI flash wars (not on player, but visible) -----
  function maybeFlashWar(g, h, day) {
    if (h.flashWars >= 5) return;
    if (day < 5 || day % 11 !== 0) return;
    if (Math.random() > 0.55) return;
    var keys = Object.keys(g.countries || {}).filter(function (iso) {
      return iso !== g.player && g.countries[iso] && !g.countries[iso].isCapitulated;
    });
    if (keys.length < 2) return;
    var a = pick(keys);
    var b = pick(keys.filter(function (x) { return x !== a; }));
    if (!a || !b) return;
    h.flashWars++;
    g.globalTension = Math.min(100, (g.globalTension || 0) + 4 + Math.floor(Math.random() * 5));
    var ca = g.countries[a], cb = g.countries[b];
    if (ca) ca.money = Math.max(0, (ca.money || 0) - 60);
    if (cb) cb.money = Math.max(0, (cb.money || 0) - 50);
    slog("⚔️ BÖLGESEL ÇATIŞMA: " + nameOf(g, a) + " × " + nameOf(g, b) + " — gerilim yükseldi!", "text-red-400");
    toast(nameOf(g, a) + " savaşa girdi", "bad");
  }

  // ----- Neighbor harassment -----
  function maybeNeighborPressure(g, h, day) {
    if (day < 6 || day % 9 !== 0) return;
    var n = pick(neighborsOfPlayer(g));
    if (!n) return;
    if (!g.relations) g.relations = {};
    g.relations[n] = (g.relations[n] || 0) - (2 + Math.floor(Math.random() * 4));
    g.globalTension = Math.min(100, (g.globalTension || 0) + 1);
    if (Math.random() < 0.5 && typeof pushInboxMessage === "function") {
      try {
        pushInboxMessage({
          from: n,
          type: "warning",
          text: "Sınır hattındaki hareketleriniz endişe verici. Açıklama bekliyoruz.",
          expiresWeeks: 4
        });
      } catch (e) {}
    } else {
      slog("⚠️ " + nameOf(g, n) + " sınır protestosu yayımladı.", "text-orange-300");
    }
  }

  // ----- Mission strip UI -----
  function ensureMissionStrip(g, h) {
    if (!inOpening(g, h)) {
      var dead = document.getElementById("sc-hour-missions");
      if (dead) dead.remove();
      return;
    }
    var el = document.getElementById("sc-hour-missions");
    if (!el) {
      el = document.createElement("div");
      el.id = "sc-hour-missions";
      el.style.cssText = "position:fixed;top:3.25rem;left:50%;transform:translateX(-50%);z-index:90;max-width:min(640px,94vw);width:100%;pointer-events:none;";
      document.body.appendChild(el);
    }
    var pending = MISSIONS.filter(function (m) { return !h.missionsDone[m.id]; }).slice(0, 3);
    if (!pending.length) {
      el.innerHTML = '<div style="margin:0 auto;width:fit-content;background:rgba(6,20,12,.88);border:1px solid #2d6b52;color:#86efac;font:11px/1.3 system-ui;padding:6px 12px;border-radius:6px;">✓ Açılış görevleri tamam — dünya hâlâ hareketli</div>';
      return;
    }
    el.innerHTML =
      '<div style="margin:0 auto;background:rgba(12,14,20,.92);border:1px solid #3f3f46;border-radius:8px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.45);">' +
      '<div style="font:10px system-ui;letter-spacing:.14em;text-transform:uppercase;color:#c4a35a;margin-bottom:4px;">İlk saat hedefleri · gün ' + daysSinceStart(g, h) + "/" + WINDOW_DAYS + "</div>" +
      pending.map(function (m) {
        return '<div style="font:12px system-ui;color:#e2e8f0;margin:2px 0;"><span style="color:#fbbf24;">▸</span> <b>' + m.title + "</b> <span style=\"color:#94a3b8;font-size:11px;\">— " + m.hint + "</span></div>";
      }).join("") +
      "</div>";
  }

  function introOnce(g, h) {
    if (h.introFired) return;
    h.introFired = true;
    if (!h.tensionBoosted) {
      g.globalTension = Math.min(100, Math.max(28, (g.globalTension || 0) + 12));
      h.tensionBoosted = true;
    }
    // seed mission baselines
    var p = g.countries[g.player];
    if (p) {
      h.baseCiv = p.civFactories || 0;
      h.baseInf = (p.divisions && p.divisions.inf) || 0;
    }
    slog("🔥 AÇILIŞ: Bölge kaynıyor. İlk 4 ay kritik — görevlerini tamamla, krizleri yönet.", "text-amber-300 font-bold");
    toast("Açılış fazı: dünya hareketleniyor", "info");
    try {
      if (typeof pushInboxMessage === "function") {
        pushInboxMessage({
          from: g.player,
          type: "greet",
          text: "Kurmay başkanı: Komşular teyakkazda. Odak seç, orduyu kur, ilk krize hazır ol.",
          expiresWeeks: 8
        });
      }
    } catch (e) {}
  }

  function hourPulse() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var h = ensureHour();
    if (!h) return;
    if (!g.date) return;
    // bind start on first running tick
    if (!h._bound) {
      h.startMs = g.date.getTime();
      h._bound = true;
    }
    var day = daysSinceStart(g, h);
    h.dayIndex = day;
    if (!inOpening(g, h)) {
      ensureMissionStrip(g, h);
      return;
    }
    introOnce(g, h);
    if (day !== h.lastPulseDay) {
      h.lastPulseDay = day;
      pulseNews(g, h, day);
      maybeScriptedCrisis(g, h, day);
      maybeFlashWar(g, h, day);
      maybeNeighborPressure(g, h, day);
      // denser random events in opening
      if (day > 0 && day % 3 === 0 && typeof processRandomEvents === "function" && Math.random() < 0.65) {
        try { processRandomEvents(); } catch (e) {}
      }
    }
    checkMissions(g, h);
    ensureMissionStrip(g, h);
  }

  // Wrap gameTick
  var _tick = typeof gameTick === "function" ? gameTick : null;
  if (_tick) {
    window.gameTick = function () {
      try { _tick.apply(this, arguments); } catch (e) { console.warn("[tick]", e); }
      try { hourPulse(); } catch (e) { console.warn("[hourOne]", e); }
    };
  } else {
    // poll if tick name not yet bound
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof gameTick === "function" && !gameTick._hourWrapped) {
        var prev = gameTick;
        window.gameTick = function () {
          try { prev.apply(this, arguments); } catch (e) {}
          try { hourPulse(); } catch (e) {}
        };
        window.gameTick._hourWrapped = true;
        clearInterval(iv);
      }
      if (tries > 40) clearInterval(iv);
    }, 250);
  }

  // Boost AI aggression slightly during opening via processAITick wrap
  var _ai = window.processAITick;
  if (typeof processAITick === "function" || _ai) {
    var prevAI = window.processAITick || processAITick;
    window.processAITick = function () {
      var g = GS();
      var h = g && ensureHour();
      var old = g && g.aiAggression;
      if (g && h && inOpening(g, h)) {
        g.aiAggression = Math.max(old || 1, 1.35);
      }
      try { return prevAI.apply(this, arguments); } finally {
        if (g && old != null) g.aiAggression = old;
      }
    };
  }

  // Also run pulse on interval as safety if tick wrapper misses
  setInterval(function () {
    try {
      var g = GS();
      if (g && g.running && !g.gameOver) hourPulse();
    } catch (e) {}
  }, 4000);

  console.log("[hour-one] first-hour engagement online");
})();


// ===== SC PROGRESSION — growth loop + AI map + rank =====
// Makes the campaign develop: recruit → fight → take land → rank up → harder world.
(function SCProgression() {
  "use strict";

  function GS() {
    try { return window.GameState || (typeof GameState !== "undefined" ? GameState : null); } catch (e) { return null; }
  }
  function owners() {
    try { return window.provinceOwners || (typeof provinceOwners !== "undefined" ? provinceOwners : null); } catch (e) { return null; }
  }
  function slog(msg, cls) {
    try { if (typeof log === "function") log(msg, cls || "text-slate-300"); } catch (e) {}
  }
  function toast(msg, kind) {
    try { if (typeof showToast === "function") showToast(msg, kind || "info"); } catch (e) {}
  }
  function paint() {
    try {
      if (typeof scPaintPolitical === "function") scPaintPolitical();
      else if (typeof refreshMapColors === "function") refreshMapColors();
    } catch (e) {}
  }
  function hud() {
    try { if (typeof updateHUD === "function") updateHUD(); } catch (e) {}
  }
  function cname(g, iso) {
    var c = g.countries[iso];
    return (c && c.name) || iso;
  }
  function countProvs(po, iso) {
    if (!po) return 0;
    var n = 0;
    for (var k in po) if (po[k] === iso) n++;
    return n;
  }
  function totalDivs(c) {
    if (!c || !c.divisions) return 0;
    return (c.divisions.inf || 0) + (c.divisions.art || 0) + (c.divisions.arm || 0);
  }
  function powerOf(g, iso) {
    var c = g.countries[iso];
    if (!c) return 0;
    var po = owners();
    var prov = countProvs(po, iso);
    var fac = (c.civFactories || 0) + (c.milFactories || 0) * 1.4;
    var div = totalDivs(c);
    return prov * 2 + fac * 3 + div * 4 + (c.money || 0) / 200;
  }

  // ---------- Rank / campaign stage ----------
  var RANKS = [
    { id: "minor", title: "Bölgesel Güç", minProv: 0, color: "#94a3b8" },
    { id: "regional", title: "Bölgesel Aktör", minProv: 12, color: "#38bdf8" },
    { id: "major", title: "Büyük Güç", minProv: 35, color: "#a78bfa" },
    { id: "great", title: "Büyük Devlet", minProv: 70, color: "#fbbf24" },
    { id: "super", title: "Süper Güç", minProv: 140, color: "#f87171" }
  ];

  function ensureProg(g) {
    if (!g.progression) {
      g.progression = {
        rankId: "minor",
        lastRank: "minor",
        lastAiExpandDay: -99,
        lastDockRefresh: 0,
        conquests: 0,
        warsWon: 0,
        stage: 1,
        stageNotes: {}
      };
    }
    return g.progression;
  }

  function currentRank(g) {
    var po = owners();
    var n = countProvs(po, g.player);
    var rank = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) {
      if (n >= RANKS[i].minProv) rank = RANKS[i];
    }
    // industry can bump one tier
    var p = g.countries[g.player];
    var fac = p ? (p.civFactories || 0) + (p.milFactories || 0) : 0;
    if (fac >= 60 && rank.id === "regional") rank = RANKS[2];
    if (fac >= 100 && rank.id === "major") rank = RANKS[3];
    return rank;
  }

  function applyRankBonuses(g, rank) {
    var p = g.countries[g.player];
    if (!p) return;
    // soft passive by rank
    var mul = { minor: 1, regional: 1.04, major: 1.08, great: 1.12, super: 1.18 };
    g.playerProdMul = mul[rank.id] || 1;
  }

  function checkRankUp(g, prog) {
    var rank = currentRank(g);
    prog.rankId = rank.id;
    if (rank.id !== prog.lastRank) {
      var up = RANKS.findIndex(function (r) { return r.id === rank.id; }) >
               RANKS.findIndex(function (r) { return r.id === prog.lastRank; });
      prog.lastRank = rank.id;
      applyRankBonuses(g, rank);
      if (up) {
        slog("🏅 RÜTBE: " + rank.title + " — üretim ve prestij arttı.", "text-amber-300 font-bold");
        toast("Rütbe: " + rank.title, "good");
        var p = g.countries[g.player];
        if (p) {
          p.money = (p.money || 0) + 350;
          p.manpower = (p.manpower || 0) + 12000;
        }
        hud();
      }
    } else {
      applyRankBonuses(g, rank);
    }
    // update HUD chip
    var chip = document.getElementById("sc-rank-chip");
    if (chip) {
      chip.textContent = rank.title;
      chip.style.color = rank.color;
    }
  }

  // ---------- Province transfer helper ----------
  function transferProvinces(fromIso, toIso, maxN, onlyBorder) {
    var po = owners();
    var g = GS();
    if (!po || !g) return [];
    var pool = [];
    for (var name in po) {
      if (po[name] !== fromIso) continue;
      if (onlyBorder && typeof getProvinceNeighbors === "function") {
        try {
          var neigh = getProvinceNeighbors(name) || [];
          var touches = neigh.some(function (nb) { return po[nb] === toIso; });
          if (!touches) continue;
        } catch (e) {}
      }
      pool.push(name);
    }
    if (!pool.length) {
      // fallback: any province of fromIso
      for (var name2 in po) if (po[name2] === fromIso) pool.push(name2);
    }
    // shuffle
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var taken = pool.slice(0, Math.max(0, maxN || 1));
    taken.forEach(function (pr) {
      po[pr] = toIso;
      if (window.provinceOwners) window.provinceOwners[pr] = toIso;
    });
    // economic loot
    var loser = g.countries[fromIso];
    var winner = g.countries[toIso];
    if (winner && taken.length) {
      winner.money = (winner.money || 0) + taken.length * 40;
      winner.manpower = (winner.manpower || 0) + taken.length * 2000;
      if (Math.random() < 0.35) winner.civFactories = (winner.civFactories || 0) + 1;
      if (Math.random() < 0.25) winner.milFactories = (winner.milFactories || 0) + 1;
    }
    if (loser && taken.length) {
      loser.money = Math.max(0, (loser.money || 0) - taken.length * 25);
      if ((loser.civFactories || 0) > 2 && Math.random() < 0.3) loser.civFactories--;
    }
    return taken;
  }

  // ---------- Player war: drip occupation ----------
  function dripPlayerWars(g, prog) {
    var wars = g.activeWars || [];
    if (!wars.length) return;
    wars.forEach(function (w) {
      if (!w || !w.target) return;
      var atk = w.attacker || g.player;
      // only drip if player is involved
      if (atk !== g.player && w.target !== g.player) return;
      var winner = atk === g.player ? g.player : (w.target === g.player ? null : atk);
      // player attacking AI
      if (atk === g.player && (w.progress || 0) >= 18 && Math.random() < 0.22) {
        var n = 1 + ((w.progress || 0) > 55 ? 1 : 0);
        var taken = transferProvinces(w.target, g.player, n, true);
        if (taken.length) {
          prog.conquests += taken.length;
          g.occupations = g.occupations || {};
          taken.forEach(function (pr) { g.occupations[pr] = g.player; });
          slog("🏴 Cephe ilerledi: " + taken.length + " eyalet (" + cname(g, w.target) + ") kontrolüne geçti.", "text-emerald-400");
          toast("+" + taken.length + " eyalet", "good");
          paint();
          hud();
        }
      }
      // AI attacking player — lose provinces slowly
      if (w.target === g.player && (w.progress || 0) < 40 && Math.random() < 0.12) {
        var lost = transferProvinces(g.player, atk, 1, true);
        if (lost.length) {
          slog("💥 Geri çekilme: " + lost.length + " eyalet " + cname(g, atk) + " eline geçti!", "text-red-400");
          toast("Eyalet kaybedildi", "bad");
          paint();
          hud();
        }
      }
    });
  }

  // ---------- AI expands on the map ----------
  function aiExpand(g, prog, dayKey) {
    if (dayKey - prog.lastAiExpandDay < 5) return;
    if (Math.random() > 0.55) return;
    prog.lastAiExpandDay = dayKey;
    var po = owners();
    if (!po) return;
    var isos = Object.keys(g.countries || {}).filter(function (iso) {
      var c = g.countries[iso];
      return c && !c.isCapitulated && iso !== g.player;
    });
    if (isos.length < 2) return;
    // pick strong AI
    isos.sort(function (a, b) { return powerOf(g, b) - powerOf(g, a); });
    var strong = isos[Math.floor(Math.random() * Math.min(6, isos.length))];
    // pick weaker victim preferably bordering
    var victims = isos.filter(function (v) { return v !== strong && powerOf(g, v) < powerOf(g, strong) * 0.85; });
    if (!victims.length) return;
    var victim = victims[Math.floor(Math.random() * victims.length)];
    // prefer border
    var taken = transferProvinces(victim, strong, 1 + (Math.random() < 0.35 ? 1 : 0), true);
    if (!taken.length) return;
    g.globalTension = Math.min(100, (g.globalTension || 0) + 2);
    slog("🗺️ Harita değişti: " + cname(g, strong) + " ← " + cname(g, victim) + " (" + taken.length + " eyalet)", "text-orange-300");
    if (Math.random() < 0.4) toast(cname(g, strong) + " genişliyor", "info");
    paint();
    // if victim nearly dead
    if (countProvs(po, victim) <= 1) {
      var vc = g.countries[victim];
      if (vc) {
        vc.isCapitulated = true;
        slog("☠️ " + cname(g, victim) + " fiilen çöktü.", "text-red-400");
      }
    }
  }

  // ---------- Quick actions (exported) ----------
  window.scQuickTrainInf = function () {
    var g = GS();
    if (!g || !g.running) return false;
    var p = g.countries[g.player];
    if (!p) return false;
    p.stockpile = p.stockpile || { guns: 0, artillery: 0, tanks: 0 };
    p.divisions = p.divisions || { inf: 0, art: 0, arm: 0 };
    var mp = 8000, guns = 400, cost = 80;
    if ((p.manpower || 0) < mp) { slog("Yetersiz insan gücü.", "text-red-400"); toast("İG yetersiz", "bad"); return false; }
    if ((p.stockpile.guns || 0) < guns) { slog("Yetersiz tüfek stoku — üretim hatlarını doldur.", "text-red-400"); toast("Tüfek yok", "bad"); return false; }
    if ((p.money || 0) < cost) { slog("Yetersiz hazine.", "text-red-400"); return false; }
    p.manpower -= mp;
    p.stockpile.guns -= guns;
    p.money -= cost;
    p.divisions.inf = (p.divisions.inf || 0) + 1;
    slog("🪖 +1 Piyade Tümeni (acele seferberlik).", "text-emerald-400");
    toast("+1 Piyade", "good");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickBuildCiv = function () {
    if (typeof buildFactory === "function") {
      try { buildFactory("civ"); refreshDock(); return true; } catch (e) {}
    }
    var g = GS();
    var p = g && g.countries[g.player];
    if (!p) return false;
    if ((p.money || 0) < 800) { slog("Sivil fabrika için 800 hazine gerekir.", "text-red-400"); return false; }
    p.money -= 800;
    p.civFactories = (p.civFactories || 0) + 1;
    slog("🏭 +1 Sivil fabrika.", "text-yellow-400");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickBuildMil = function () {
    if (typeof buildFactory === "function") {
      try { buildFactory("mil"); refreshDock(); return true; } catch (e) {}
    }
    var g = GS();
    var p = g && g.countries[g.player];
    if (!p) return false;
    if ((p.money || 0) < 1000) { slog("Askeri fabrika için 1000 hazine gerekir.", "text-red-400"); return false; }
    p.money -= 1000;
    p.milFactories = (p.milFactories || 0) + 1;
    slog("🏭 +1 Askeri fabrika.", "text-yellow-400");
    hud();
    refreshDock();
    return true;
  };

  window.scQuickJustifySelected = function () {
    var g = GS();
    if (!g) return;
    var iso = g.selectedCountry;
    if (!iso || iso === g.player) {
      slog("Haritadan yabancı bir ülke eyaleti seç.", "text-yellow-400");
      toast("Düşman eyalet seç", "info");
      return;
    }
    if (typeof startJustification === "function") startJustification(iso);
    else {
      g.justifications = g.justifications || [];
      if (!g.justifications.some(function (j) { return j.target === iso; })) {
        g.justifications.push({ target: iso, progress: 0 });
        slog("Gerekçe hazırlanıyor: " + cname(g, iso), "text-orange-400");
      }
    }
    refreshDock();
  };

  window.scQuickDeclareSelected = function () {
    var g = GS();
    if (!g) return;
    var iso = g.selectedCountry;
    if (!iso || iso === g.player) {
      slog("Savaş için yabancı ülke seç.", "text-yellow-400");
      return;
    }
    if (typeof declareWar === "function") declareWar(iso);
    else if (window.declareWar) window.declareWar(iso);
    refreshDock();
  };

  // ---------- Command dock UI ----------
  function refreshDock() {
    var g = GS();
    if (!g || !g.running || g.gameOver) {
      var d0 = document.getElementById("sc-cmd-dock");
      if (d0) d0.style.display = "none";
      return;
    }
    var dock = document.getElementById("sc-cmd-dock");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "sc-cmd-dock";
      dock.style.cssText = "position:fixed;left:50%;bottom:0.6rem;transform:translateX(-50%);z-index:95;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:min(920px,96vw);pointer-events:auto;";
      document.body.appendChild(dock);
    }
    dock.style.display = "flex";
    var p = g.countries[g.player] || {};
    var po = owners();
    var provN = countProvs(po, g.player);
    var rank = currentRank(g);
    var sel = g.selectedCountry && g.selectedCountry !== g.player ? cname(g, g.selectedCountry) : "—";
    var just = (g.justifications || []).filter(function (j) { return j.progress >= 100; }).map(function (j) { return j.target; });
    var canDec = g.selectedCountry && just.indexOf(g.selectedCountry) >= 0;
    dock.innerHTML =
      '<div style="background:rgba(8,12,18,.94);border:1px solid #334155;border-radius:10px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;box-shadow:0 8px 28px rgba(0,0,0,.5);">' +
      '<span id="sc-rank-chip" style="font:11px system-ui;font-weight:700;color:' + rank.color + ';padding:2px 8px;border:1px solid #475569;border-radius:999px;">' + rank.title + "</span>" +
      '<span style="font:11px system-ui;color:#94a3b8;">Eyalet <b style="color:#e2e8f0">' + provN + "</b> · Piyade <b style=\"color:#86efac\">" + ((p.divisions && p.divisions.inf) || 0) + "</b></span>" +
      '<button type="button" onclick="scQuickTrainInf()" style="font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #166534;background:#052e16;color:#bbf7d0;cursor:pointer;">+ Piyade</button>' +
      '<button type="button" onclick="scQuickBuildCiv()" style="font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #a16207;background:#1c1917;color:#fde68a;cursor:pointer;">+ Sivil Fab</button>' +
      '<button type="button" onclick="scQuickBuildMil()" style="font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #9a3412;background:#1c1410;color:#fdba74;cursor:pointer;">+ Askeri Fab</button>' +
      '<span style="font:10px system-ui;color:#64748b;margin-left:4px;">Hedef: ' + sel + "</span>" +
      '<button type="button" onclick="scQuickJustifySelected()" style="font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #c2410c;background:#1c1008;color:#fdba74;cursor:pointer;">Gerekçe</button>' +
      '<button type="button" onclick="scQuickDeclareSelected()" style="font:11px system-ui;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #b91c1c;background:' + (canDec ? "#450a0a" : "#1f1212") + ";color:#fecaca;cursor:pointer;" + (canDec ? "" : "opacity:.55;") + '">Savaş İlan</button>' +
      "</div>";
  }

  // ---------- Campaign stages (post hour-one) ----------
  function campaignStage(g, prog, dayApprox) {
    // stage 2: industrial push
    if (dayApprox > 120 && prog.stage < 2) {
      prog.stage = 2;
      slog("📈 SAFHA 2: Sanayi yarışı — fabrikalar ve ordu büyüt, komşular kıpırdanıyor.", "text-cyan-300 font-bold");
      toast("Safha 2: Sanayi yarışı", "info");
    }
    if (dayApprox > 300 && prog.stage < 3) {
      prog.stage = 3;
      g.globalTension = Math.min(100, (g.globalTension || 0) + 10);
      slog("🌋 SAFHA 3: Büyük güç rekabeti — gerilim tırmandı, harita yeniden çiziliyor.", "text-red-300 font-bold");
      toast("Safha 3: Büyük güçler", "bad");
    }
    // coalition pressure if player too strong
    if (prog.stage >= 2 && prog.rankId !== "minor" && Math.random() < 0.02) {
      var po = owners();
      var my = countProvs(po, g.player);
      if (my > 40) {
        g.globalTension = Math.min(100, (g.globalTension || 0) + 3);
        if (!g.relations) g.relations = {};
        Object.keys(g.countries).forEach(function (iso) {
          if (iso === g.player) return;
          if (Math.random() < 0.25) g.relations[iso] = Math.min(g.relations[iso] || 0, (g.relations[iso] || 0) - 4);
        });
        if (Math.random() < 0.5) slog("🤝 Koalisyon fısıltıları: büyük güçler seni dengelemek istiyor.", "text-orange-300");
      }
    }
  }

  // ---------- Hook tick ----------
  function dayKeyOf(g) {
    if (!g.date) return 0;
    return Math.floor(g.date.getTime() / 86400000);
  }

  function progressionPulse() {
    var g = GS();
    if (!g || !g.running || g.gameOver) return;
    var prog = ensureProg(g);
    var dk = dayKeyOf(g);
    checkRankUp(g, prog);
    dripPlayerWars(g, prog);
    aiExpand(g, prog, dk);
    // hourOne day index if present
    var dayApprox = 0;
    if (g.hourOne && g.hourOne.startMs && g.date) {
      dayApprox = Math.floor((g.date.getTime() - g.hourOne.startMs) / 86400000);
    } else {
      dayApprox = dk % 10000;
    }
    campaignStage(g, prog, dayApprox);
    if (dk !== prog.lastDockRefresh) {
      prog.lastDockRefresh = dk;
      refreshDock();
    }
  }

  // wrap gameTick
  function wrapTick() {
    var prev = window.gameTick;
    if (typeof prev !== "function") return false;
    if (prev._progWrapped) return true;
    window.gameTick = function () {
      try { prev.apply(this, arguments); } catch (e) { console.warn(e); }
      try { progressionPulse(); } catch (e) { console.warn("[progression]", e); }
    };
    window.gameTick._progWrapped = true;
    return true;
  }
  if (!wrapTick()) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (wrapTick() || tries > 50) clearInterval(iv);
    }, 200);
  }

  // export helpers used by dock
  try {
    if (typeof trainDivision === "function") window.trainDivision = trainDivision;
    if (typeof buildFactory === "function") window.buildFactory = buildFactory;
    if (typeof startJustification === "function") window.startJustification = startJustification;
  } catch (e) {}

  // refresh dock often while running
  setInterval(function () {
    try {
      var g = GS();
      if (g && g.running && !g.gameOver) refreshDock();
    } catch (e) {}
  }, 2500);

  // when province selected, refresh dock
  var _hpc = window.handleProvinceClick;
  // can't easily wrap declaration; poll selectedCountry
  var lastSel = null;
  setInterval(function () {
    try {
      var g = GS();
      if (!g || !g.running) return;
      if (g.selectedCountry !== lastSel) {
        lastSel = g.selectedCountry;
        refreshDock();
      }
    } catch (e) {}
  }, 600);

  console.log("[progression] rank · dock · AI expand · war drip online");
})();
