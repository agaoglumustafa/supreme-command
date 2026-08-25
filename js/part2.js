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
            GBR: "#9f1239", FRA: "#1d4ed8", USA: "Virginia", HUN: "#7f1d1d"
        };
        SCENARIOS.ww1.countryFlags = SCENARIOS.ww1.countryFlags || {
            // Özel URL veya flagcdn kodu; URL ise http ile başlar
            TUR: "tr", DEU: "de", RUS: "ru", AUT: "at", GBR: "gb", FRA: "fr"
        };
    }
    if (SCENARIOS.ww2) {
        SCENARIOS.ww2.countryColors = SCENARIOS.ww2.countryColors || {
            TUR: "#dc2626", DEU: "#171717", RUS: "#9f1239", GBR: "#b91c1c",
            FRA: "#2563eb", USA: "Virginia", JPN: "#991b1b", ITA: "#166534"
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
    ZWE: ["Zimbabve", "zw", "#ffd200"], CYP: ["Güney Kıbrıs Rum Yönetimi", "cy", "#4189dd"], KTC: ["Kuzey Kıbrıs Türk Cumhuriyeti", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg/250px-Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg.png", "#ffffff"],
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
    // Hakimiyet %0 → anında game over
    if (myProvs <= 0 || share <= 0) {
      if (typeof triggerGameOver === "function") triggerGameOver("no_land");
      else {
        GameState.gameOver = true;
        GameState.running = false;
      }
      return;
    }
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
      TUR: "Ankara", DEU: "Brandenburg", USA: "Virginia", RUS: "Moscow",
      GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", JPN: "Kanto",
      CHN: "Hebei", IND: "Delhi", BRA: "Goiás", POL: "Warszawa", ESP: "Madrid",
      SAU: "Nejd", IRN: "Tehran", EGY: "Cairo", KOR: "Gyeonggi", PRK: "Pyongan-Hwanghae",
      AUS: "New_South_Wales", CAN: "Southern_Ontario", MEX: "Mexico_City", ARG: "Buenos_Aires",
      NLD: "Holland", BEL: "Vlaanderen", SWE: "Södermanland", NOR: "Oslofjord", FIN: "Uusimaa",
      GRC: "Attica", ROU: "Muntenia", HUN: "Northern_Hungary", CZE: "Bohemia",
      AUT: "Ostmark", CHE: "Swiss_Plateau", PRT: "Lisbon", IRL: "Leinster",
      UKR: "Kyiv", BLR: "Minsk", SRB: "Serbia", BGR: "Sofia", HRV: "Croatia",
      ISR: "Palestine", IRQ: "Baghdad", SYR: "Damascus", JOR: "Jordan", LBN: "Lebanon",
      PAK: "West_Punjab", BGD: "East_Bengal", IDN: "Java", THA: "Siam", VNM: "Tonkin",
      MYS: "Malaya", SGP: "Singapore", PHL: "Luzon", NZL: "North_Island",
      ZAF: "Transvaal", NGA: "Lagos", ETH: "Shewa", KEN: "Nairobi",
      DZA: "Algiers", MAR: "Casablanca", TUN: "Tunisia", LBY: "Tripoli",
      CHL: "Santiago", COL: "Cundinamarca", PER: "Lima", VEN: "Miranda",
      TWN: "Taiwan", KAZ: "Alma_Ata", AZE: "Azerbaijan", GEO: "Georgia", ARM: "Armenia",
      AFG: "Kabul", UZB: "Tashkent", CUB: "Cuba", PAN: "Panamá"
    },
    ww1: {
      TUR: "Istanbul", DEU: "Brandenburg", RUS: "Saint_Petersburg", AUT: "Ostmark",
      GBR: "Greater_London_Area", FRA: "Ile_de_France", ITA: "Lazio", USA: "District_of_Columbia",
      SRB: "Serbia", BEL: "Vlaanderen", NLD: "Holland", ROU: "Muntenia", BGR: "Sofia",
      GRC: "Attica", JPN: "Kanto", CHN: "Hebei", POL: "Warszawa", HUN: "Northern_Hungary",
      ESP: "Madrid", PRT: "Lisbon", SWE: "Södermanland", NOR: "Oslofjord", DNK: "Denmark",
      CHE: "Swiss_Plateau", IRN: "Tehran", EGY: "Cairo", MEX: "Mexico_City", BRA: "Goiás"
    },
    ww2: {
      TUR: "Ankara", DEU: "Brandenburg", RUS: "Moscow", GBR: "Greater_London_Area",
      FRA: "Ile_de_France", ITA: "Lazio", USA: "District_of_Columbia", JPN: "Kanto",
      POL: "Warszawa", CHN: "Hebei", ESP: "Madrid", FIN: "Uusimaa", ROU: "Muntenia",
      HUN: "Northern_Hungary", BGR: "Sofia", GRC: "Attica", YUG: "Serbia", SRB: "Serbia",
      BEL: "Vlaanderen", NLD: "Holland", NOR: "Oslofjord", DNK: "Denmark", SWE: "Södermanland",
      CHE: "Swiss_Plateau", PRT: "Lisbon", IRN: "Tehran", IRQ: "Baghdad", EGY: "Cairo",
      BRA: "Goiás", ARG: "Buenos_Aires", MEX: "Mexico_City", CAN: "Southern_Ontario",
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
    AZE: "az", UKR: "Kyiv", POL: "pl", ESP: "es", PRT: "pt", NLD: "nl", BEL: "be", CHE: "ch",
    AUT: "at", HUN: "hu", ROU: "ro", BGR: "bg", GRC: "gr", SRB: "rs", HRV: "hr", CZE: "cz",
    SVK: "sk", SWE: "se", NOR: "no", DNK: "dk", FIN: "fi", IRL: "ie", CHN: "cn", IND: "in",
    BRA: "br", ARG: "ar", MEX: "mx", CAN: "ca", AUS: "au", NZL: "nz", KOR: "Gyeonggi", PRK: "Pyongan-Hwanghae",
    VNM: "vn", THA: "th", IDN: "id", MYS: "my", SGP: "sg", PHL: "ph", PAK: "pk", BGD: "bd",
    IRN: "ir", IRQ: "iq", SAU: "sa", ISR: "il", EGY: "eg", ZAF: "za", NGA: "Lagos", ETH: "Shewa",
    KEN: "Nairobi", MAR: "Casablanca", DZA: "dz", TUN: "tn", LBY: "ly", SDN: "sd", AFG: "af", GEO: "ge",
    ARM: "am", KAZ: "Alma_Ata", UZB: "uz", TKM: "tm", KGZ: "kg", TJK: "tj", MNG: "mn", TWN: "tw",
    PRY: "py", URY: "uy", CHL: "cl", COL: "co", PER: "pe", VEN: "ve", BOL: "bo", ECU: "ec",
    CUB: "cu", DOM: "do", GTM: "gt", HND: "hn", SLV: "sv", NIC: "ni", CRI: "cr", PAN: "pa",
    LTU: "lt", LVA: "lv", EST: "ee", BLR: "by", MDA: "md", ALB: "al", MKD: "mk", BIH: "ba",
    SVN: "si", MNE: "me", LUX: "lu", ISL: "is", MLT: "mt", CYP: "cy", AND: "ad", MCO: "mc",
    LIE: "li", SMR: "sm", VAT: "va", QAT: "qa", ARE: "ae", KWT: "kw", BHR: "bh", OMN: "om",
    YEM: "ye", JOR: "jo", LBN: "lb", SYR: "sy", PSE: "ps", LKA: "lk", MMR: "mm", KHM: "kh",
    LAO: "la", NPL: "np", BTN: "bt", MNG: "mn", PRK: "Pyongan-Hwanghae", TZA: "tz", UGA: "ug", GHA: "gh",
    CIV: "ci", SEN: "sn", CMR: "cm", COD: "cd", COG: "cg", AGO: "ao", MOZ: "mz", ZWE: "zw",
    ZMB: "zm", BWA: "bw", NAM: "na", RWA: "rw", BDI: "bi", SOM: "so", ERI: "er", DJI: "dj",
    SSD: "ss", GAB: "ga", GNQ: "gq", CAF: "cf", TCD: "td", NER: "ne", MLI: "ml", BFA: "bf",
    GIN: "gn", GNB: "gw", SLE: "sl", LBR: "lr", TGO: "tg", BEN: "bj", GMB: "gm", CPV: "cv",
    MUS: "mu", SYC: "sc", COM: "km", MDG: "mg", MWI: "mw", LSO: "ls", SWZ: "sz", FJI: "fj",
    PNG: "pg", SLB: "sb", VUT: "vu", WSM: "ws", TON: "to", KIR: "ki", TUV: "tv", NRU: "nr", KTC: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg/250px-Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg.png", 		
    PLW: "pw", FSM: "fm", MHL: "mh", DNZ: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/POL_Gda%C5%84sk_flag.svg/250px-POL_Gda%C5%84sk_flag.svg.png", // Danzig
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

