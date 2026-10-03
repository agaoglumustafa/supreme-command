
(function SCI18nTR() {
  "use strict";
  console.log("[i18n-tr] arayüz Türkçe (doğal dil)");

  // Dictionary: English / mixed → natural Turkish (loanwords kept when natural)
  var T = {
    "Continue": "Devam et",
    "Settings": "Ayarlar",
    "About": "Hakkında",
    "Close": "Kapat",
    "Cancel": "İptal",
    "Confirm": "Onayla",
    "Save": "Kaydet",
    "Load": "Yükle",
    "Back": "Geri",
    "Next": "İleri",
    "Start": "Başlat",
    "Pause": "Duraklat",
    "Resume": "Sürdür",
    "Play": "Oynat",
    "Stop": "Durdur",
    "Yes": "Evet",
    "No": "Hayır",
    "OK": "Tamam",
    "Apply": "Uygula",
    "Delete": "Sil",
    "Edit": "Düzenle",
    "Search": "Ara",
    "Filter": "Filtre",
    "All": "Tümü",
    "None": "Yok",
    "Player": "Oyuncu",
    "Host": "Kurucu",
    "Client": "Katılımcı",
    "Ready": "Hazır",
    "Not ready": "Hazır değil",
    "Join": "Katıl",
    "Leave": "Ayrıl",
    "Create": "Kur",
    "Create Room": "Oda kur",
    "Join Room": "Odaya katıl",
    "Room code": "Oda kodu",
    "Room Code": "Oda kodu",
    "Multiplayer": "Çok oyunculu",
    "Single player": "Tek oyunculu",
    "New Game": "Yeni oyun",
    "Load Game": "Kayıt yükle",
    "Save Game": "Oyunu kaydet",
    "Game Over": "Oyun bitti",
    "Victory": "Zafer",
    "Defeat": "Yenilgi",
    "Peace": "Barış",
    "War": "Savaş",
    "Declare War": "Savaş ilan et",
    "Justify War": "Savaş gerekçesi",
    "Production": "Üretim",
    "Military": "Ordu",
    "Economy": "Ekonomi",
    "Diplomacy": "Diplomasi",
    "Research": "Araştırma",
    "Focus": "Odak",
    "Politics": "Siyaset",
    "Intelligence": "İstihbarat",
    "Logistics": "Lojistik",
    "Supply": "İkmal",
    "Manpower": "İnsan gücü",
    "Factories": "Fabrikalar",
    "Civilian Factories": "Sivil fabrikalar",
    "Military Factories": "Askeri fabrikalar",
    "Naval Dockyards": "Tersaneler",
    "Infrastructure": "Altyapı",
    "Construction": "İnşaat",
    "Division": "Tümen",
    "Army": "Ordu",
    "Air Force": "Hava kuvveti",
    "Navy": "Donanma",
    "Tank": "Tank",
    "Infantry": "Piyade",
    "Artillery": "Topçu",
    "Fighter": "Avcı",
    "Bomber": "Bombardıman",
    "Submarine": "Denizaltı",
    "Capital": "Başkent",
    "Core": "Öz toprak",
    "Colony": "Sömürge",
    "Puppet": "Kukla",
    "Faction": "Fraksiyon",
    "Alliance": "İttifak",
    "Trade": "Ticaret",
    "Embargo": "Ambargo",
    "Sanction": "Yaptırım",
    "World Tension": "Küresel gerilim",
    "War Support": "Savaş desteği",
    "Stability": "İstikrar",
    "Political Power": "Siyasi güç",
    "National Focus": "Ulusal odak",
    "Technology": "Teknoloji",
    "Doctrine": "Doktrin",
    "Equipment": "Ekipman",
    "Stockpile": "Stok",
    "Reinforcement": "Takviye",
    "Training": "Eğitim",
    "Experience": "Tecrübe",
    "Organization": "Organizasyon",
    "Strength": "Kuvvet",
    "Soft Attack": "Yumuşak saldırı",
    "Hard Attack": "Sert saldırı",
    "Defense": "Savunma",
    "Breakthrough": "Yarma",
    "Armor": "Zırh",
    "Piercing": "Delici",
    "Combat Width": "Cephe genişliği",
    "Terrain": "Arazi",
    "Weather": "Hava",
    "Season": "Mevsim",
    "Winter": "Kış",
    "Summer": "Yaz",
    "Spring": "İlkbahar",
    "Autumn": "Sonbahar",
    "Fall": "Sonbahar",
    "Occupation": "İşgal",
    "Resistance": "Direniş",
    "Compliance": "Uyum",
    "Annex": "İlhak",
    "Liberate": "Kurtar",
    "Satellite": "Uydu devlet",
    "Demilitarize": "Askerden arındır",
    "War Reparations": "Savaş tazminatı",
    "Peace Conference": "Barış masası",
    "Casualties": "Kayıplar",
    "Enemy": "Düşman",
    "Ally": "Müttefik",
    "Neutral": "Tarafsız",
    "Selected": "Seçili",
    "Available": "Müsait",
    "Locked": "Kilitli",
    "Completed": "Tamamlandı",
    "In Progress": "Devam ediyor",
    "Queued": "Sırada",
    "Paused": "Duraklatıldı",
    "Speed": "Hız",
    "Date": "Tarih",
    "Day": "Gün",
    "Week": "Hafta",
    "Month": "Ay",
    "Year": "Yıl",
    "Loading": "Yükleniyor",
    "Please wait": "Bekle",
    "Error": "Hata",
    "Warning": "Uyarı",
    "Info": "Bilgi",
    "Success": "Başarılı",
    "Failed": "Başarısız",
    "Connected": "Bağlandı",
    "Disconnected": "Bağlantı koptu",
    "Connecting": "Bağlanıyor",
    "Invite": "Davet",
    "Kick": "At",
    "Ban": "Yasakla",
    "Chat": "Sohbet",
    "Send": "Gönder",
    "Message": "Mesaj",
    "Inbox": "Gelen kutusu",
    "Events": "Olaylar",
    "Decisions": "Kararlar",
    "Missions": "Görevler",
    "Tutorial": "Öğretici",
    "Skip": "Atla",
    "Finish": "Bitir",
    "Restart": "Yeniden başlat",
    "Quit": "Çık",
    "Main Menu": "Ana menü",
    "Return to Menu": "Menüye dön",
    "Surrender": "Teslim ol",
    "Offer Peace": "Barış teklif et",
    "Accept": "Kabul et",
    "Reject": "Reddet",
    "Demand": "Talep",
    "Guarantee": "Garanti",
    "Military Access": "Askeri geçiş",
    "Non-Aggression Pact": "Saldırmazlık paktı",
    "Call to Arms": "Savaşa çağır",
    "Volunteer": "Gönüllü",
    "Expeditionary Force": "Sefer kuvveti",
    "Lend-Lease": "Ödünç ver",
    "Spy": "Casus",
    "Agent": "Ajan",
    "Network": "Ağ",
    "Cipher": "Şifre",
    "Collaboration": "İşbirliği",
    "Coup": "Darbe",
    "Propaganda": "Propaganda",
    "Recruit": "Askere al",
    "Deploy": "Konuşlandır",
    "Exercise": "Tatbikat",
    "Planning": "Planlama",
    "Frontline": "Cephe hattı",
    "Fallback Line": "Geri çekilme hattı",
    "Garrison": "Garnizon",
    "Naval Invasion": "Deniz çıkarması",
    "Paradrop": "Hava indirme",
    "Strategic Redeploy": "Stratejik kaydırma",
    "Railway": "Demiryolu",
    "Supply Hub": "İkmal merkezi",
    "Fuel": "Yakıt",
    "Oil": "Petrol",
    "Steel": "Çelik",
    "Aluminum": "Alüminyum",
    "Rubber": "Kauçuk",
    "Tungsten": "Tungsten",
    "Chromium": "Krom",
    "Rare Materials": "Nadir madde",
    "Consumer Goods": "Tüketim malı",
    "Trade Law": "Ticaret yasası",
    "Economy Law": "Ekonomi yasası",
    "Conscription Law": "Askere alma yasası",
    "Mobilization": "Seferberlik",
    "Total Mobilization": "Tam seferberlik",
    "Civilian Economy": "Sivil ekonomi",
    "War Economy": "Savaş ekonomisi",
    "Volunteer Only": "Yalnızca gönüllü",
    "Limited Conscription": "Sınırlı zorunlu",
    "Extensive Conscription": "Geniş zorunlu",
    "Service by Requirement": "İhtiyaç halinde hizmet",
    "All Adults Serve": "Tüm yetişkinler",
    "Scraping the Barrel": "Son yedekler",
    "Free Trade": "Serbest ticaret",
    "Export Focus": "İhracat odaklı",
    "Limited Exports": "Sınırlı ihracat",
    "Closed Economy": "Kapalı ekonomi",
    "Democratic": "Demokratik",
    "Communist": "Komünist",
    "Fascist": "Faşist",
    "Non-Aligned": "Bağlantısız",
    "Monarchist": "Monarşist",
    "Republic": "Cumhuriyet",
    "Empire": "İmparatorluk",
    "Kingdom": "Krallık",
    "Select country": "Ülke seç",
    "Select scenario": "Senaryo seç",
    "Difficulty": "Zorluk",
    "Easy": "Kolay",
    "Normal": "Normal",
    "Hard": "Zor",
    "Historical": "Tarihi",
    "Sandbox": "Serbest",
    "Modern": "Modern",
    "World Map": "Dünya haritası",
    "Europe": "Avrupa",
    "Loading map": "Harita yükleniyor",
    "Loading scenario": "Senaryo yükleniyor",
    "No save found": "Kayıt bulunamadı",
    "Autosave": "Otomatik kayıt",
    "Ironman": "Ironman",
    "Tooltip": "İpucu",
    "Help": "Yardım",
    "Version": "Sürüm",
    "Credits": "Emeği geçenler",
    "License": "Lisans",
    "Sound": "Ses",
    "Music": "Müzik",
    "Mute": "Sessiz",
    "Volume": "Ses düzeyi",
    "Graphics": "Grafik",
    "Language": "Dil",
    "Turkish": "Türkçe",
    "English": "İngilizce",
    "Fullscreen": "Tam ekran",
    "Windowed": "Pencere",
    "Battle": "Muharebe",
    "Retreat": "Geri çekil",
    "Advance": "İlerle",
    "Hold": "Tut",
    "Attack": "Saldır",
    "Support Attack": "Destek saldırı",
    "Encircle": "Kuşat",
    "Breakthrough": "Yarma",
    "Reorganize": "Yeniden düzenle",
    "Merge": "Birleştir",
    "Split": "Böl",
    "Rename": "Yeniden adlandır",
    "Disband": "Dağıt",
    "Upgrade": "Yükselt",
    "Convert": "Dönüştür",
    "Assign": "Ata",
    "Unassign": "Kaldır",
    "General": "General",
    "Field Marshal": "Mareşal",
    "Admiral": "Amiral",
    "Ace": "As pilot",
    "Trait": "Yetenek",
    "Skill": "Beceri",
    "Level": "Seviye",
    "XP": "XP",
    "Army XP": "Ordu XP",
    "Navy XP": "Donanma XP",
    "Air XP": "Hava XP",
    "Command Power": "Komuta gücü",
    "Planning Bonus": "Plan bonus",
    "Entrenchment": "Tahkimat",
    "Fort": "Kale",
    "Coastal Fort": "Sahil kalesi",
    "Air Base": "Hava üssü",
    "Naval Base": "Deniz üssü",
    "Radar": "Radar",
    "Rocket Site": "Roket sahası",
    "Nuclear Reactor": "Nükleer reaktör",
    "Synthetic Refinery": "Sentetik rafineri",
    "Fuel Silo": "Yakıt deposu",
    "Anti-Air": "Uçaksavar",
    "Land Doctrine": "Kara doktrini",
    "Naval Doctrine": "Deniz doktrini",
    "Air Doctrine": "Hava doktrini",
    "Mobile Warfare": "Seferi harp",
    "Superior Firepower": "Üstün ateş gücü",
    "Grand Battleplan": "Büyük muharebe planı",
    "Mass Assault": "Toplu taarruz",
    "Unknown": "Bilinmiyor",
    "N/A": "—",
    "None selected": "Seçim yok",
    "Click a province": "Bir eyalet seç",
    "No data": "Veri yok",
    "Empty": "Boş",
    "Full": "Dolu",
    "Low": "Düşük",
    "Medium": "Orta",
    "High": "Yüksek",
    "Critical": "Kritik",
    "Enabled": "Açık",
    "Disabled": "Kapalı",
    "On": "Açık",
    "Off": "Kapalı"
  };

  function tr(s) {
    if (s == null) return s;
    var str = String(s);
    if (T[str]) return T[str];
    // phrase contains known key
    var out = str;
    Object.keys(T).forEach(function (k) {
      if (k.length >= 4 && out.indexOf(k) >= 0) {
        out = out.split(k).join(T[k]);
      }
    });
    return out;
  }
  window.scTr = tr;
  window.SC_I18N = T;

  function walkText(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var v = node.nodeValue;
      if (!v || !/[A-Za-z]{3,}/.test(v)) return;
      var n = tr(v.trim());
      if (n !== v.trim() && T[v.trim()]) node.nodeValue = v.replace(v.trim(), n);
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = (node.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "code") return;
    // attributes
    ["title", "placeholder", "aria-label"].forEach(function (a) {
      if (node.getAttribute && node.hasAttribute(a)) {
        var av = node.getAttribute(a);
        var tv = tr(av);
        if (tv !== av) node.setAttribute(a, tv);
      }
    });
    var ch = node.childNodes;
    for (var i = 0; i < ch.length; i++) walkText(ch[i]);
  }

  function applyDom() {
    try {
      // known button ids / menus
      var map = {
        "mm-continue": "Devam et"
      };
      Object.keys(map).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = map[id];
      });
      walkText(document.getElementById("main-menu-screen"));
      walkText(document.getElementById("lobby-screen"));
      walkText(document.getElementById("credits-modal"));
      walkText(document.getElementById("mp-lobby-modal"));
      walkText(document.getElementById("top-bar"));
      walkText(document.getElementById("left-panel"));
    } catch (e) {}
  }

  // Wrap log() to translate common English fragments
  function wrapLog() {
    if (typeof window.log !== "function" || window.log._tr) return;
    var prev = window.log;
    window.log = function (msg, cls) {
      try {
        if (typeof msg === "string") msg = tr(msg);
      } catch (e) {}
      return prev.call(this, msg, cls);
    };
    window.log._tr = true;
  }

  // toast helper
  if (typeof window.toast === "function" && !window.toast._tr) {
    var pt = window.toast;
    window.toast = function (msg, kind) {
      try { if (typeof msg === "string") msg = tr(msg); } catch (e) {}
      return pt.apply(this, arguments);
    };
    window.toast._tr = true;
  }

  function boot() {
    applyDom();
    wrapLog();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 600);
  // tek sefer yeterli — çoklu walk tıklamayı bozmasın
})();
