
// ========== DİNAMİK MÜZİK ÇALAR (assets/audio/*.ogg) ==========
const MusicPlayer = {
    audio: null,
    tracks: [],
    index: 0,
    started: false,
    volume: 0.45,
    basePath: "./assets/audio/",
    // Varsayılan liste — assets/audio/ altına .ogg koyunca playlist.json veya bu liste kullanılır
    defaultTracks: [
        "theme_01.ogg",
        "theme_02.ogg",
        "march_01.ogg",
        "ambient_01.ogg",
        "war_theme.ogg",
        "diplomacy.ogg"
    ],
    async init() {
        // playlist.json varsa onu kullan; yoksa defaultTracks
        try {
            const r = await fetch(this.basePath + "playlist.json", { cache: "no-store" });
            if (r.ok) {
                const data = await r.json();
                if (Array.isArray(data.tracks) && data.tracks.length) {
                    this.tracks = data.tracks.map(f => f.endsWith(".ogg") ? f : f + ".ogg");
                }
            }
        } catch (e) {}
        if (!this.tracks.length) this.tracks = this.defaultTracks.slice();
        this.audio = new Audio();
        this.audio.preload = "none";
        this.audio.volume = this.volume;
        this.audio.addEventListener("ended", () => this.next());
        this.audio.addEventListener("error", () => {
            // Dosya yoksa bir sonrakine geç (esnek playlist)
            console.warn("Müzik yüklenemedi, sıradakine geçiliyor:", this.tracks[this.index]);
            this.next(true);
        });
        console.log("MusicPlayer hazır ·", this.tracks.length, "parça adayı");
    },
    currentUrl() {
        const f = this.tracks[this.index];
        if (!f) return null;
        return this.basePath + f.replace(/^\//, "");
    },
    async start() {
        if (this.started) return;
        if (!this.audio) await this.init();
        this.started = true;
        // İlk parça da rastgele
        this.shuffleStart();
    },
    playCurrent() {
        const url = this.currentUrl();
        if (!url || !this.audio) return;
        this.audio.src = url;
        const p = this.audio.play();
        if (p && typeof p.catch === "function") {
            p.catch(err => {
                console.warn("Müzik play engeli/hata:", err);
                // Kullanıcı etkileşimi geldiyse genelde çalışır; yine de sonraki parçayı dene
                setTimeout(() => this.next(true), 400);
            });
        }
        try {
            if (typeof log === "function") log(`🎵 Çalıyor: ${this.tracks[this.index]}`, "text-slate-400");
        } catch (e) {}
    },
    next(fromError) {
        if (!this.tracks.length) return;
        // Shuffle: bir öncekiyle aynı olmayan rastgele parça
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
        if (fromError) {
            this._errCount = (this._errCount || 0) + 1;
            if (this._errCount >= this.tracks.length) {
                console.warn("Hiçbir müzik dosyası çalınamadı (assets/audio/*.ogg eksik olabilir).");
                this.started = false;
                return;
            }
        } else {
            this._errCount = 0;
        }
        this.playCurrent();
    },
    shuffleStart() {
        if (!this.tracks.length) return;
        this.index = Math.floor(Math.random() * this.tracks.length);
        this.playCurrent();
    },
    toggleMute() {
        if (!this.audio) return;
        this.audio.muted = !this.audio.muted;
        return this.audio.muted;
    },
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.audio) this.audio.volume = this.volume;
    }
};
// Sayfa yüklenince sadece hazırla — autoplay YOK
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => { MusicPlayer.init(); });
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
                    countryFlags: sc.countryFlags || {}
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
    const dash = document.getElementById('content-dashboard');
    if (dash && dash.parentElement && dash.parentElement.parentElement) {
        const root = dash.parentElement.parentElement.parentElement;
        const btn = document.getElementById('sidebar-btn');
        
        // Klasik toggle yerine kontrol ederek yapalım, sınıf varsa sil, yoksa ekle
        if (root.classList.contains('sidebar-kapali')) {
            root.classList.remove('sidebar-kapali');
            if(btn) btn.style.transform = 'none';
        } else {
            root.classList.add('sidebar-kapali');
            if(btn) btn.style.transform = 'rotate(180deg)';
        }
        
        window.dispatchEvent(new Event('resize'));
    }
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
        function selectLobbyCountry(iso) {
            sfx.playBlip();
            const country = GameState.countries[iso];
            if (!country) return;

// Sayfa yüklenirken log panelini dinamik olarak en dışa (BODY'ye) enjekte ediyoruz
(function injectLogPanel() {
    if (document.getElementById("log-panel")) return;

    const panel = document.createElement("div");
    panel.id = "log-panel";
    // z-[9999] ile ekrandaki her şeyi ezip geçiyoruz
    panel.className = "fixed bottom-2 left-1/2 -translate-x-1/2 z-[9999] w-[min(520px,90vw)] h-[100px] bg-[#030712]/92 backdrop-blur-sm p-2 rounded-lg border border-slate-800 flex flex-col justify-end overflow-hidden pointer-events-none shadow-lg";
    
    panel.innerHTML = `
        <div class="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-0.5 pointer-events-none text-center">Günlük</div>
        <div id="log-content" class="overflow-y-auto font-mono text-[11px] leading-tight flex flex-col justify-end gap-0.5 scrollbar-none pointer-events-auto">
            <!-- Taktik Loglar -->
        </div>
    `;
    
    document.body.appendChild(panel);
})();

// Nüfusa göre Milyar veya Milyon yazdırma kısmı
            let pop = country.pop;
            if (pop >= 1000000000) {
            document.getElementById("lobby-stat-pop").innerText = (pop / 1000000000).toFixed(1) + " Milyar";
            } else {
            document.getElementById("lobby-stat-pop").innerText = (pop / 1000000).toFixed(1) + " Milyon";
            }

            document.getElementById("lobby-stat-div").innerText = Object.values(country.divisions).reduce((a, b) => a + b, 0) + " Tümen";
            document.getElementById("lobby-stat-civ").innerText = country.civFactories + " Fabrika";
            document.getElementById("lobby-stat-mil").innerText = country.milFactories + " Fabrika";
            document.getElementById("lobby-stat-gold").innerText = country.money + " 🪙";
            document.getElementById("lobby-stat-ideo").innerText = country.ideology;
            document.getElementById("lobby-country-flag").src = `https://flagcdn.com/w320/${country.flag}.png`;
        }

        // Initialize Lobby Stats on first script execute
        window.addEventListener("DOMContentLoaded", () => {
            selectLobbyCountry("TUR");
        });

// ========== YENİ HARİTA MOTORU (Eyalet bazlı) ==========
const svg = d3.select("#game-map");
const g = svg.append("g");

let _lastLodScale = 1;
const zoom = d3.zoom()
    .scaleExtent([0.25, 14])
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
.style("stroke-width", 0.12)
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
    d3.selectAll(".country-path").each(function() {
        const path = d3.select(this);
        const name = path.attr("data-name");
        if (!name) return;
        
        const owner = getProvinceOwner(name);
        const color = (GameState.countries[owner] && GameState.countries[owner].color) || "#1e293b";
        path.style("fill", color);
    });
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
        ${provName ? `<div class="text-[11px] text-cyan-400 font-bold">📍 Seçili Eyalet: ${provName}</div>` : ""}
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

            document.getElementById("prod-unallocated").innerText = `${unallocated} Boşta Fabrika`;

            // Atamalar
            document.getElementById("prod-guns-factories").innerText = `${player.prodAllocation.guns} Fabrika`;
            document.getElementById("prod-artillery-factories").innerText = `${player.prodAllocation.artillery} Fabrika`;
            document.getElementById("prod-tanks-factories").innerText = `${player.prodAllocation.tanks} Fabrika`;

            // Haftalık üretim miktarları
            document.getElementById("rate-prod-guns").innerText = `+${player.prodAllocation.guns * 15} / Hafta`;
            document.getElementById("rate-prod-artillery").innerText = `+${player.prodAllocation.artillery * 2} / Hafta`;
            document.getElementById("rate-prod-tanks").innerText = `+${player.prodAllocation.tanks * 1} / Hafta`;
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

            if (player.manpower >= req.mp && 
                player.stockpile.guns >= req.guns && 
                player.stockpile.artillery >= req.art && 
                player.stockpile.tanks >= req.tanks) {
                
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
                    btn.disabled = !!eraBlock;
                    btn.classList.toggle("opacity-40", !!eraBlock);
                    btn.innerText = eraBlock ? "⛔ Çağda mevcut değil" : "Programı Başlat / Sürdür";
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
                dailyGunsReq: 120,
                dailyArtilleryReq: 20,
                totalWeeks: 0
            });

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
        log(`💪 ZAFER: ${target.name} cephesindeki düşman ordular teslim oldu! Toprak talebi aşamasına geçiliyor...`, "text-emerald-400 font-black");
        GameState.activeWars.splice(index, 1);
        showTerritoryDemandModal(targetIso);
    } else {
        sfx.playSiren();
        log(`🥀 BOZGUN: ${target.name} cephesinde taarruz gücümüz kırıldı ve geri çekilmek zorunda kaldık!`, "text-red-500 font-black");
        if (d3.select(`#${targetIso}`).node()) {
            d3.select(`#${targetIso}`).classed("active-war", false).style("fill", target.color);
        }
        GameState.activeWars.splice(index, 1);
        updateHUD();
        renderDiplomacyTab();
        switchTab("dashboard");
    }
}

// ========== TOPRAK TALEP SİSTEMİ ==========
function showTerritoryDemandModal(targetIso) {
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    const pDivs = Object.values(player.divisions).reduce((a,b)=>a+b,0);
    const tDivs = Math.max(1, Object.values(target.divisions).reduce((a,b)=>a+b,0));
    const ratio = pDivs / tDivs;

    const enemyProvinces = Object.keys(provinceOwners).filter(p => provinceOwners[p] === targetIso);
    const provCount = enemyProvinces.length;

    // ratio = biz / onlar → 1.5 = %50 daha güçlü, 1.25 = %25 daha güçlü
    let maxClaim = 0;
    let claimLevel = "none";
    if (ratio >= 1.5) {
        maxClaim = provCount; // hepsi
        claimLevel = "full";
    } else if (ratio >= 1.25) {
        maxClaim = Math.max(1, Math.floor(provCount / 2)); // yarısı
        claimLevel = "half";
    } else {
        maxClaim = 0;
        claimLevel = "none";
    }

    // Eski modal varsa kaldır
    document.getElementById("territory-demand-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "territory-demand-modal";
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4";
    modal.innerHTML = `
        <div class="bg-slate-900 border-2 border-yellow-600 rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div class="p-4 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
                <h2 class="text-sm font-black text-yellow-400 uppercase tracking-wider">🏳️ Toprak Talebi — ${target.name}</h2>
                <span class="text-[10px] text-slate-400 font-mono">Güç Oranı: ${(ratio*100).toFixed(0)}% (biz/onlar)</span>
            </div>
            <div class="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
                <div class="bg-slate-800/80 p-3 rounded border border-slate-700 space-y-1">
                    <p>Bizim Tümen: <span class="text-cyan-400 font-bold">${pDivs}</span> | Düşman Tümen: <span class="text-red-400 font-bold">${tDivs}</span></p>
                    <p>Düşman Eyalet Sayısı: <span class="text-yellow-400 font-bold">${provCount}</span></p>
                    <p class="text-[10px] text-slate-500">Kural: ≥%150 güç → tüm toprak · ≥%125 güç → yarısı · altı → talep yok</p>
                    <p class="pt-1 border-t border-slate-700 mt-1">
                        ${claimLevel === "full" ? `<span class="text-emerald-400 font-black">✅ %50+ üstünlük: TÜM eyaletleri talep edebilirsiniz (${maxClaim})</span>` :
                          claimLevel === "half" ? `<span class="text-yellow-400 font-black">⚠️ %25+ üstünlük: En fazla ${maxClaim} eyalet (yarısı)</span>` :
                          `<span class="text-red-400 font-black">❌ Yetersiz güç: Toprak talep edemezsiniz (oran &lt; %125)</span>`}
                    </p>
                </div>
                ${claimLevel === "none" ? `
                    <p class="text-slate-400 italic text-center py-4">Barış anlaşması imzalandı. Toprak değişikliği olmadı.</p>
                    <button onclick="closeTerritoryModal('${targetIso}', false)" class="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded font-bold">Barışı Kabul Et</button>
                ` : `
                    <p class="text-[10px] text-slate-400">Talep etmek istediğiniz eyaletleri seçin (maks. ${maxClaim}):</p>
                    <div id="claim-province-list" class="space-y-1 max-h-48 overflow-y-auto">
                        ${enemyProvinces.map(p => `
                            <label class="flex items-center gap-2 p-2 bg-slate-800 rounded border border-slate-700 hover:border-cyan-600 cursor-pointer">
                                <input type="checkbox" class="claim-check accent-cyan-500" value="${p}" onchange="updateClaimCount(${maxClaim})">
                                <span class="text-slate-200">${p.replace(/_/g," ")}</span>
                            </label>
                        `).join("") || `<div class="text-slate-500 italic">Bu ülkeye atanmış eyalet yok (eski sistem). Fabrikalar ve isim devredilecek.</div>`}
                    </div>
                    <div class="text-[10px] text-cyan-400 font-mono">Seçilen: <span id="claim-selected-count">0</span> / ${maxClaim}</div>
                    <div class="flex flex-col gap-2 pt-2">
                        <button onclick="confirmTerritoryClaims('${targetIso}', ${maxClaim}, '${claimLevel}')" class="w-full py-3 bg-emerald-700 hover:bg-emerald-600 rounded font-black text-white">
                            🏳️ Talepleri Onayla (İlhak)
                        </button>
                        <button onclick="makePuppet('${targetIso}')" class="w-full py-2.5 bg-purple-800 hover:bg-purple-700 border border-purple-500 rounded font-bold text-white text-xs">
                            🎭 Kukla Devlet Yap (fabrika payı, tam ilhak yok)
                        </button>
                        <button onclick="takeReparations('${targetIso}')" class="w-full py-2.5 bg-yellow-900/80 hover:bg-yellow-800 border border-yellow-600 rounded font-bold text-white text-xs">
                            💰 Sadece Savaş Tazminatı Al
                        </button>
                        <button onclick="closeTerritoryModal('${targetIso}', true)" class="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded font-bold text-xs">
                            Hiç Alma
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
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
    const target = GameState.countries[targetIso];
    const player = GameState.countries[GameState.player];
    const checks = Array.from(document.querySelectorAll(".claim-check:checked")).map(c => c.value);
    const enemyProvinces = Object.keys(provinceOwners).filter(p => provinceOwners[p] === targetIso);

    if (checks.length === 0 && enemyProvinces.length > 0) {
        log("Hiç eyalet seçilmedi. Barış imzalandı.", "text-slate-400");
        closeTerritoryModal(targetIso, false);
        return;
    }

    // SADECE seçilen eyaletleri devret (claimLevel "full" = alabilirsin, otomatik hepsi değil)
    const toTake = checks.slice(0, Math.max(0, maxClaim || checks.length));
    toTake.forEach(pName => {
        provinceOwners[pName] = GameState.player;
    });

    const remaining = Object.keys(provinceOwners).filter(p => provinceOwners[p] === targetIso).length;
    const claimRatio = enemyProvinces.length > 0 ? (toTake.length / enemyProvinces.length) : 0;

    // Fabrika payı yalnızca alınan orana göre
    if (toTake.length > 0) {
        const civGain = Math.floor(target.civFactories * claimRatio * (remaining === 0 ? 1 : 0.5));
        const milGain = Math.floor(target.milFactories * claimRatio * (remaining === 0 ? 1 : 0.5));
        player.civFactories += civGain;
        player.milFactories += milGain;
        target.civFactories = Math.max(remaining === 0 ? 0 : 1, target.civFactories - civGain);
        target.milFactories = Math.max(remaining === 0 ? 0 : 0, target.milFactories - milGain);
    }

    if (remaining === 0) {
        // Gerçekten hiç eyalet kalmadı → tam ilhak + diplomatik temizlik
        annexCountryFully(targetIso);
        log(`💪 ${target.name} tamamen ilhak edildi (${toTake.length} eyalet).`, "text-emerald-400 font-black");
    } else {
        log(`🏳️ ${toTake.length} eyalet alındı. ${GameState.countries[targetIso]?.name || targetIso} hâlâ ${remaining} eyalete sahip.`, "text-emerald-400");
    }

    GameState.globalTension = Math.min(100, GameState.globalTension + (remaining === 0 ? 12 : 5));
    refreshMapColors();
    closeTerritoryModal(targetIso, false);
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
    document.getElementById("territory-demand-modal")?.remove();
    if (noClaim) {
        log("Toprak talebi yapılmadı. Savaş sona erdi.", "text-slate-400");
    }
    updateHUD();
    renderDiplomacyTab();
    switchTab("dashboard");
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
        GameState.difficulty = GameState.difficulty || "normal";
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
            document.getElementById("hud-country-name").innerText = (typeof getCountryDisplayName === "function") ? getCountryDisplayName(GameState.player) : player.name;
            document.getElementById("hud-country-ideology").innerText = player.ideology;
            document.getElementById("log-panel")?.classList.remove("hidden");

            document.getElementById("lobby-screen").classList.add("hidden");
            
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
            setTimeout(() => { if (typeof refreshMapColors === "function") refreshMapColors(); }, 400);

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
        <div class="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-0.5 pointer-events-none text-center">Günlük</div>
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
            document.getElementById("btn-speed").innerText = GameState.running ? "⏸ DURAKLAT" : "▶️ SÜRDÜR";
            sfx.playBlip();
        }

        // HUD GÜNCELLEME
        function updateHUD() {
            const player = GameState.countries[GameState.player];
            document.getElementById("hud-gold").innerText = player.money.toLocaleString();
            document.getElementById("hud-manpower").innerText = formatNumber(player.manpower);
            document.getElementById("hud-factories").innerText = `${player.civFactories} / ${player.milFactories}`;
            document.getElementById("hud-tension").innerText = GameState.globalTension + "%";

            // Dashboard
            document.getElementById("dash-guns").innerText = `${player.stockpile.guns.toLocaleString()} 🔫`;
            document.getElementById("dash-artillery").innerText = `${player.stockpile.artillery.toLocaleString()} 🚀`;
            document.getElementById("dash-tanks").innerText = `${player.stockpile.tanks.toLocaleString()} 🛡️`;
            
            const totalDivs = Object.values(player.divisions).reduce((a, b) => a + b, 0);
            document.getElementById("dash-divs").innerText = `${totalDivs} Tümen ⚔️`;
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
    p.innerHTML = `<span class="text-slate-600">[${dateStr}]</span> ${msg}`;
    logContent.appendChild(p);

    while (logContent.children.length > 25) {
        logContent.removeChild(logContent.firstChild);
    }

    logContent.scrollTop = logContent.scrollHeight;
}

// HAFTALIK GAME TICK SIMÜLASYONU
function gameTick() {
    if (!GameState.running || GameState.gameOver) return;
// Editör açma kısayolu (F9 tuşu)
if (!window.editorKeyListenerAdded) {
    document.addEventListener("keydown", (e) => {
        if (e.key === "F9") {
            toggleEditor();
        }
    });
    window.editorKeyListenerAdded = true;
}
    
    // 1. Tarihi İlerlet (1 GÜN)
    GameState.date.setDate(GameState.date.getDate() + 1);
    
    // === İKİ HANELİ TARİH FORMATI ===
    const day = String(GameState.date.getDate()).padStart(2, '0');
    const months = ['OCA','ŞUB','MAR','NİS','MAY','HAZ','TEM','AĞU','EYL','EKİ','KAS','ARA'];
    const month = months[GameState.date.getMonth()];
    const year = GameState.date.getFullYear();
   
    document.getElementById("hud-date").innerText = `${day} ${month} ${year}`;;

            const player = GameState.countries[GameState.player];

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
                
                const activeFocusData = GameState.activeFocusTree[GameState.player].find(n => n.id === player.activeFocus);
                document.getElementById("active-focus-display").innerHTML = `
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-slate-200">${activeFocusData.title}</span>
                        <span class="text-xs font-mono text-cyan-400">${player.focusProgress}%</span>
                    </div>
                    <div class="w-full bg-slate-950 rounded-full h-1">
                        <div class="bg-cyan-500 h-1 rounded-full transition-all duration-1000" style="width: ${player.focusProgress}%"></div>
                    </div>
                `;

const focusPanel = document.getElementById("focus-tree-panel"); // Panelinin ID'si neyse onu yaz
    if (focusPanel && !focusPanel.classList.contains("hidden")) { 
        renderFocusTree();
}

                if (player.focusProgress >= 100) {
                    activeFocusData.reward();
                    player.completedFocuses.push(player.activeFocus);
                    player.activeFocus = null;
                    player.focusProgress = 0;
                    document.getElementById("active-focus-display").innerHTML = `<div class="text-xs text-slate-500 italic">Milli odak tamamlandı. Yeni bir odak seçebilirsiniz.</div>`;
                    renderFocusTree();
                }
            }

            // 5. Cephe Muharebe Çatışmaları
            for (let i = GameState.activeWars.length - 1; i >= 0; i--) {
                const war = GameState.activeWars[i];
                war.totalWeeks++;
                if (war.lastProgress == null) war.lastProgress = war.progress;

                const target = GameState.countries[war.target];
                const prevProgress = war.progress;

                // Lojistik Mühimmat Kontrolü
                if (player.stockpile.guns >= war.dailyGunsReq && player.stockpile.artillery >= war.dailyArtilleryReq) {
                    player.stockpile.guns -= war.dailyGunsReq;
                    player.stockpile.artillery -= war.dailyArtilleryReq;

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
                    const pForce = ((player.divisions.inf * 10 * infMul) + (player.divisions.art * 20) + (player.divisions.arm * 40 * armMul)) * airBonus * (doc.air || 1) * gen.atk * (doc.attack || 1) * defB;
                    const enemyMul = ({ easy: 0.55, normal: 0.8, hard: 1, veryhard: 1.15, impossible: 1.35 })[GameState.difficulty] || 1;
                    const tForce = ((target.divisions.inf * 10) + (target.divisions.art * 20) + (target.divisions.arm * 40)) * globalThreatBonus * enemyMul * terrainDef;
                    const frontBonus = war.frontAssigned ? 1.15 : 1;
                    const ratio = (pForce * frontBonus) / (tForce || 1);
                    const progressGain = (Math.random() * 1.2 + 0.25) * ratio;
                    war.progress += progressGain;
                    if (oilPen < 1 && Math.random() < 0.2) log("⛽ Petrol yetersiz — zırhlı tümenler yavaşlıyor.", "text-yellow-500");
                    if (airBonus >= 1.2 && Math.random() < 0.15) log("✈️ Hava üstünlüğü cepheye avantaj sağlıyor.", "text-cyan-400");

                    const casScale = ({ easy: 0.4, normal: 0.7, hard: 1, veryhard: 1.25, impossible: 1.5 })[GameState.difficulty] || 1;
                    const casualties = Math.floor((Math.random() * 600 + 150) * casScale);
                    player.manpower = Math.max(0, player.manpower - casualties);
                    war.casualties = (war.casualties || 0) + casualties;
                    war.enemyCasualties = (war.enemyCasualties || 0) + Math.floor(casualties * (0.7 + Math.random() * 0.8));
                    if (Math.random() < 0.35) log(`SAVAŞ RAPORU: ${target.name} −${casualties} Asker · Skor %${Math.floor(war.progress)}`, "text-rose-400");
                } else {
                    war.progress -= 3;
                    log(`SAVAŞ RAPORU: Kaynak yetersizliği sebebiyle ${target.name} cephesinde geriliyoruz!`, "text-red-500 animate-pulse");
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

            updateHUD();
            renderActiveWarsDisplay();
            // Açık sekme canlı güncelle (ekonomi stokları, diplomasi gerekçe %, vs.)
            if (typeof refreshOpenTab === "function") refreshOpenTab();
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
                const name = GameState.countries[war.target]?.name || war.target;
                const prog = Math.floor(war.progress || 0);
                const weeks = war.totalWeeks || 0;
                const ally = war.allyBoost ? ` · Müttefik +${war.allyBoost.toFixed(0)}` : "";
                return `
                <div class="bg-slate-900 p-3 rounded border border-red-900/60 relative overflow-hidden">
                    <div class="absolute top-0 left-0 h-1 bg-red-600 transition-all duration-1000" style="width: ${Math.max(0, prog)}%"></div>
                    <div class="flex justify-between items-center text-xs font-semibold">
                        <span class="text-red-500">⚔️ ${name} Cephesi</span>
                        <span class="font-mono text-slate-300">${prog}% İlerleme</span>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1">${weeks}. hafta${ally}${war.frontAssigned ? " · 📍 Cephe atanmış" : ""}</div>
                    <div class="mt-1 grid grid-cols-2 gap-1 text-[9px] font-mono">
                        <div class="bg-slate-950/80 p-1 rounded border border-slate-800">Bizim zayiat: <span class="text-red-400">${(war.casualties||0).toLocaleString()}</span></div>
                        <div class="bg-slate-950/80 p-1 rounded border border-slate-800">Düşman zayiat: <span class="text-orange-400">${(war.enemyCasualties||0).toLocaleString()}</span></div>
                    </div>
                    <div class="w-full bg-slate-950 h-1.5 rounded mt-1 overflow-hidden flex">
                        <div class="bg-cyan-500 h-full" style="width:${Math.min(100, Math.max(5, prog))}%"></div>
                        <div class="bg-red-700 h-full flex-1"></div>
                    </div>
                    ${!war.frontAssigned ? `<button onclick="assignFront(${index})" class="mt-1 w-full py-1 bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-700 rounded text-[9px] font-bold">📍 Birlikleri Cepheye Ata (+%15)</button>` : ""}
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
    if (e.key.length === 1) {
        inputBuffer += e.key.toLowerCase();
        inputBuffer = inputBuffer.slice(-10); // Son 10 karakteri hafızada tut
        
        for (let code in targetCodes) {
            // Eğer yazılan kelime eşleşiyorsa VE daha önce KULLANILMAMIŞSA
            if (inputBuffer.endsWith(code) && !targetCodes[code].used) {
                targetCodes[code].used = true; // Kilidi vur, bir daha çalışmasın
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

    document.getElementById("econ-civ-count").innerText = `${totalCiv} Sivil Fabrika (${free} boşta)`;

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
            war.progress += 0.8 + Math.random() * 1.5;
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
            war.progress += boost;
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
    if (Math.random() > 0.35) return;
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

function startNuclearProgram() {
    if (typeof eraBlocksNuclear === "function" && eraBlocksNuclear()) {
        log("⛔ Bu teknoloji bu çağda mevcut değil! (1914 — nükleer kilitli)", "text-red-500");
        return;
    }
    if (!GameState.nuclear) GameState.nuclear = { progress: 0, unlocked: false, warheads: 0 };
    if (GameState.nuclear.unlocked) { log("Nükleer program zaten tamamlandı.", "text-yellow-400"); return; }
    if (GameState.nuclear.active) { log("Program zaten aktif.", "text-slate-400"); return; }
    const player = GameState.countries[GameState.player];
    const era2 = typeof eraNuclearVeryHard === "function" && eraNuclearVeryHard();
    const minMil = era2 ? 18 : 8;
    const startCost = era2 ? 2500 : 500;
    if ((player.milFactories || 0) < minMil) {
        log(`Nükleer program için en az ${minMil} askeri fabrika gerekli.`, "text-red-500");
        return;
    }
    if (player.money < startCost) {
        log(`Başlangıç yatırımı: ${startCost} hazine gerekli.`, "text-red-500");
        return;
    }
    player.money -= startCost;
    GameState.nuclear.active = true;
    GameState.globalTension = Math.min(100, GameState.globalTension + (era2 ? 12 : 5));
    log(era2
        ? "⚛️ Manhattan tarzı program başladı (1939 çağı — çok pahalı, yavaş)."
        : "⚛️ Nükleer araştırma programı başlatıldı.", "text-purple-400 font-bold");
    updateHUD();
}

// ====================== ASİ SİSTEMİ ======================
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
        timestamp: Date.now()
    };
    
    localStorage.setItem(GameState.saveSlot, JSON.stringify(saveData));
    log("OYUN KAYDEDİLDİ", "text-emerald-400");
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
    if (!c.navy) c.navy = { ships: Math.floor((c.civFactories || 1) / 5) };
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

    // AI üretim (kolayda yarı hız)
    const aiProdChance = 0.3 * (GameState.aiProdMul || 1);
    if (c.money > 400 && Math.random() < aiProdChance) {
        c.money -= 250;
        if (Math.random() < 0.5) c.civFactories++;
        else c.milFactories++;
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
    if (Math.random() > 0.07) return;
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
                <p class="text-[9px] text-slate-500 mt-0.5">⏱ 10 sn sonra otomatik kapanır</p>
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
    window._eventAutoTimer = setTimeout(() => {
        if (document.getElementById("event-modal")) resolveEventChoice(ev.id, 0);
    }, 10000);
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
            <input type="checkbox" id="editor-brush-mode" class="accent-purple-500" onchange="editorBrushMode=this.checked">
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
        svg.on("mousedown.brush", (ev) => { if (mapEditorOpen && editorBrushMode) editorPainting = true; });
        svg.on("mouseup.brush", () => { editorPainting = false; });
        svg.on("mouseleave.brush", () => { editorPainting = false; });
    }
}

// Eyalet tıklanınca
function handleProvinceClick(event, d) {
    sfx.playBlip();
    const isRightClick = (event.button === 2 || event.which === 3 || event.type === "contextmenu");

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
  if (Math.random() > 0.03) return; // nadir, events'ten ayrı
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
