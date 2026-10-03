// ===== Colors · short names · missing states · less AI expand =====
(function SCColorsNames() {
  "use strict";

  var EUROPE_COLORS = {
    TUR: "#dc2626",
    GBR: "#be123c",
    IRL: "#15803d",
    FRA: "#1d4ed8",
    ESP: "#eab308", // sarı
    PRT: "#16a34a",
    DEU: "#0f766e",
    ITA: "#16a34a",
    POL: "#d946ef", // macenta
    UKR: "#ca8a04",
    RUS: "#1e40af",
    BLR: "#f43f5e", // pembe-kırmızı
    MDA: "#eab308", // sarı
    ROU: "#d97706",
    BGR: "#047857",
    GRC: "#0ea5e9",
    HUN: "#166534",
    CZE: "#3b82f6",
    SVK: "#1d4ed8",
    AUT: "#e2e8f0",
    CHE: "#dc2626", // kırmızı
    NLD: "#ea580c",
    BEL: "#fbbf24",
    LUX: "#06b6d4",
    DNK: "#be123c",
    SWE: "#2563eb", // mavi
    NOR: "#b91c1c",
    FIN: "#ffffff", // beyaz
    ISL: "#1e3a8a",
    EST: "#2563eb",
    LVA: "#9f1239",
    LTU: "#a16207",
    SRB: "#f43f5e", // pembe-kırmızı
    HRV: "#9f1239",
    BIH: "#2563eb",
    SVN: "#0ea5e9",
    ALB: "#7f1d1d",
    MKD: "#b45309",
    MNE: "#eab308", // sarı
    RKS: "#eab308", // Kosova sarı
    KOS: "#eab308",
    CYP: "#fbbf24",
    MLT: "#ef4444",
    ABK: "#fb923c"
  };

  var WORLD_COLORS = {
    USA: "#2563eb", // mavi
    CAN: "#f43f5e", // pembe-kırmızı
    MEX: "#15803d",
    GTM: "#0d9488",
    CRI: "#1e3a8a",
    PAN: "#dc2626",
    CUB: "#1d4ed8",
    DOM: "#3b82f6",
    COL: "#1e3a8a",
    VEN: "#b91c1c",
    BRA: "#15803d",
    ARG: "#38bdf8",
    CHL: "#0369a1",
    PER: "#991b1b",
    BOL: "#16a34a",
    ECU: "#ea580c",
    PRY: "#b91c1c",
    URY: "#0284c7",
    CHN: "#dc2626",
    IND: "#ea580c",
    JPN: "#9f1239",
    KOR: "#2563eb",
    PRK: "#7f1d1d",
    TWN: "#0284c7",
    MNG: "#b91c1c",
    PAK: "#14532d",
    BGD: "#065f46",
    AFG: "#374151",
    IRN: "#047857",
    IRQ: "#065f46",
    SYR: "#166534",
    SAU: "#166534",
    ARE: "#0f766e",
    QAT: "#7f1d1d", // bordo
    KWT: "#0d9488",
    OMN: "#047857",
    YEM: "#4b5563",
    JOR: "#0f766e",
    LBN: "#b91c1c",
    ISR: "#1d4ed8",
    EGY: "#ca8a04",
    LBY: "#166534",
    TUN: "#dc2626",
    DZA: "#065f46",
    MAR: "#9a3412",
    SDN: "#374151",
    SSD: "#7c2d12",
    ETH: "#16a34a",
    KEN: "#854d0e",
    UGA: "#eab308",
    TZA: "#0d9488",
    NGA: "#15803d",
    GHA: "#eab308",
    SEN: "#15803d",
    CIV: "#ea580c",
    AGO: "#7f1d1d",
    ZAF: "#d97706",
    ZMB: "#16a34a",
    MOZ: "#047857",
    MDG: "#dc2626",
    LBR: "#1e40af",
    AUS: "#1d4ed8",
    NZL: "#0f172a",
    IDN: "#b91c1c",
    MYS: "#1e40af",
    SGP: "#ef4444",
    THA: "#1e3a8a",
    VNM: "#cc2525",
    PHL: "#1d4ed8",
    MMR: "#eab308",
    LKA: "#854d0e",
    KAZ: "#0284c7",
    UZB: "#0d9488",
    TKM: "#166534",
    KGZ: "#dc2626",
    TJK: "#991b1b",
    AZE: "#16a34a", // yeşil
    GEO: "#ea580c", // turuncu
    ARM: "#b45309",
    SOM: "#0ea5e9",
    SML: "#fbbf24", // Somaliland
    KTC: "#ffffff", // KKTC
    DJI: "#1e3a8a",
    ATA: "#e2e8f0",
    CYP: "#fbbf24"
  };

  var SHORT_NAMES = {
    USA: "ABD", RUS: "Rusya", GBR: "BK", CHN: "Çin", ARE: "BAE",
    SAU: "S. Arabistan", DOM: "Dominik", CIV: "F. Sahili", MKD: "K. Makedonya",
    PRK: "K. Kore", KOR: "G. Kore", ZAF: "G. Afrika", SSD: "G. Sudan",
    BIH: "Bosna", RKS: "Kosova", KOS: "Kosova", ABK: "Abhazya", SML: "Somaliland", KTC: "KKTC",
    COD: "Kongo", CAF: "O. Afrika", PNG: "P.Y.Gine", PSE: "Filistin"
  };

  // Minimal country stubs for missing ISOs (scenario has land, engine had no state)
  var EXTRA_COUNTRIES = {
    BLR: { name: "Belarus", flag: "by", color: "#f43f5e", ideology: "Otoriter", pop: 9200000, civFactories: 12, milFactories: 6, money: 1200, manpower: 200000, divisions: { inf: 8, art: 2, arm: 1 } },
    MNE: { name: "Karadağ", flag: "me", color: "#eab308", ideology: "Demokrasi", pop: 620000, civFactories: 2, milFactories: 1, money: 400, manpower: 8000, divisions: { inf: 1, art: 0, arm: 0 } },
    RKS: { name: "Kosova", flag: "xk", color: "#eab308", ideology: "Demokrasi", pop: 1800000, civFactories: 3, milFactories: 1, money: 500, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    KOS: { name: "Kosova", flag: "xk", color: "#eab308", ideology: "Demokrasi", pop: 1800000, civFactories: 3, milFactories: 1, money: 500, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    SOM: { name: "Somali", flag: "so", color: "#0ea5e9", ideology: "Kabile", pop: 17000000, civFactories: 4, milFactories: 2, money: 300, manpower: 80000, divisions: { inf: 5, art: 1, arm: 0 } },
    SML: { name: "Somaliland", flag: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Flag_of_Somaliland.svg/330px-Flag_of_Somaliland.svg.png&w=80", color: "#fbbf24", ideology: "Cumhuriyet", pop: 4500000, civFactories: 3, milFactories: 1, money: 400, manpower: 25000, divisions: { inf: 3, art: 0, arm: 0 } },
    ABK: { name: "Abhazya", flag: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Flag_of_the_Republic_of_Abkhazia.svg/250px-Flag_of_the_Republic_of_Abkhazia.svg.png&w=80", color: "#fb923c", ideology: "Cumhuriyet", pop: 245000, civFactories: 1, milFactories: 1, money: 200, manpower: 8000, divisions: { inf: 2, art: 0, arm: 0 } },
    DJI: { name: "Cibuti", flag: "dj", color: "#1e3a8a", ideology: "Cumhuriyet", pop: 1100000, civFactories: 2, milFactories: 1, money: 500, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    CYP: { name: "Kıbrıs", flag: "cy", color: "#fbbf24", ideology: "Cumhuriyet", pop: 1200000, civFactories: 3, milFactories: 1, money: 800, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    KTC: { name: "Kuzey Kıbrıs Türk Cumhuriyeti", flag: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg/250px-Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg.png&w=80", color: "#ffffff", ideology: "Cumhuriyet", pop: 380000, civFactories: 2, milFactories: 1, money: 500, manpower: 12000, divisions: { inf: 2, art: 0, arm: 0 } },
    MLT: { name: "Malta", flag: "mt", color: "#ef4444", ideology: "Demokrasi", pop: 500000, civFactories: 2, milFactories: 0, money: 600, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    PSE: { name: "Filistin", flag: "ps", color: "#15803d", ideology: "Ulusal", pop: 5000000, civFactories: 2, milFactories: 1, money: 200, manpower: 20000, divisions: { inf: 2, art: 0, arm: 0 } },
    COD: { name: "Kongo D.C.", flag: "cd", color: "#fbbf24", ideology: "Cumhuriyet", pop: 95000000, civFactories: 8, milFactories: 3, money: 800, manpower: 150000, divisions: { inf: 10, art: 2, arm: 0 } },
    NPL: { name: "Nepal", flag: "np", color: "#dc2626", ideology: "Cumhuriyet", pop: 30000000, civFactories: 5, milFactories: 2, money: 600, manpower: 80000, divisions: { inf: 6, art: 1, arm: 0 } },
    PNG: { name: "P. Yeni Gine", flag: "pg", color: "#fbbf24", ideology: "Demokrasi", pop: 10000000, civFactories: 3, milFactories: 1, money: 500, manpower: 20000, divisions: { inf: 2, art: 0, arm: 0 } },
    ZWE: { name: "Zimbabve", flag: "zw", color: "#15803d", ideology: "Otoriter", pop: 15000000, civFactories: 4, milFactories: 2, money: 400, manpower: 40000, divisions: { inf: 4, art: 1, arm: 0 } },
    NAM: { name: "Namibya", flag: "na", color: "#1d4ed8", ideology: "Demokrasi", pop: 2500000, civFactories: 3, milFactories: 1, money: 700, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    MLI: { name: "Mali", flag: "ml", color: "#eab308", ideology: "Askeri", pop: 22000000, civFactories: 3, milFactories: 1, money: 350, manpower: 30000, divisions: { inf: 4, art: 0, arm: 0 } },
    NER: { name: "Nijer", flag: "ne", color: "#ea580c", ideology: "Askeri", pop: 26000000, civFactories: 2, milFactories: 1, money: 300, manpower: 25000, divisions: { inf: 3, art: 0, arm: 0 } },
    TCD: { name: "Çad", flag: "td", color: "#fbbf24", ideology: "Otoriter", pop: 18000000, civFactories: 2, milFactories: 1, money: 300, manpower: 30000, divisions: { inf: 4, art: 0, arm: 0 } },
    CMR: { name: "Kamerun", flag: "cm", color: "#16a34a", ideology: "Otoriter", pop: 28000000, civFactories: 4, milFactories: 1, money: 500, manpower: 40000, divisions: { inf: 5, art: 1, arm: 0 } },
    CIV: { name: "Fildişi Sahili", flag: "ci", color: "#ea580c", ideology: "Demokrasi", pop: 28000000, civFactories: 5, milFactories: 1, money: 700, manpower: 35000, divisions: { inf: 4, art: 0, arm: 0 } },
    GIN: { name: "Gine", flag: "gn", color: "#eab308", ideology: "Askeri", pop: 14000000, civFactories: 2, milFactories: 1, money: 300, manpower: 20000, divisions: { inf: 3, art: 0, arm: 0 } },
    SEN: { name: "Senegal", flag: "sn", color: "#15803d", ideology: "Demokrasi", pop: 17000000, civFactories: 3, milFactories: 1, money: 500, manpower: 20000, divisions: { inf: 3, art: 0, arm: 0 } },
    RWA: { name: "Ruanda", flag: "rw", color: "#1e3a8a", ideology: "Otoriter", pop: 14000000, civFactories: 2, milFactories: 1, money: 400, manpower: 25000, divisions: { inf: 3, art: 0, arm: 0 } },
    BDI: { name: "Burundi", flag: "bi", color: "#dc2626", ideology: "Cumhuriyet", pop: 12000000, civFactories: 1, milFactories: 0, money: 200, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    HTI: { name: "Haiti", flag: "ht", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 11000000, civFactories: 2, milFactories: 0, money: 250, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    JAM: { name: "Jamaika", flag: "jm", color: "#15803d", ideology: "Demokrasi", pop: 2800000, civFactories: 2, milFactories: 0, money: 400, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    HND: { name: "Honduras", flag: "hn", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 10000000, civFactories: 2, milFactories: 1, money: 350, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    SLV: { name: "El Salvador", flag: "sv", color: "#1e3a8a", ideology: "Cumhuriyet", pop: 6300000, civFactories: 2, milFactories: 1, money: 400, manpower: 12000, divisions: { inf: 2, art: 0, arm: 0 } },
    NIC: { name: "Nikaragua", flag: "ni", color: "#1d4ed8", ideology: "Otoriter", pop: 6800000, civFactories: 2, milFactories: 1, money: 300, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    GUY: { name: "Guyana", flag: "gy", color: "#15803d", ideology: "Demokrasi", pop: 800000, civFactories: 1, milFactories: 0, money: 400, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    SUR: { name: "Surinam", flag: "sr", color: "#16a34a", ideology: "Demokrasi", pop: 600000, civFactories: 1, milFactories: 0, money: 350, manpower: 2000, divisions: { inf: 1, art: 0, arm: 0 } },
    ERI: { name: "Eritre", flag: "er", color: "#dc2626", ideology: "Otoriter", pop: 3600000, civFactories: 1, milFactories: 1, money: 200, manpower: 20000, divisions: { inf: 4, art: 1, arm: 0 } },
    GAB: { name: "Gabon", flag: "ga", color: "#1e3a8a", ideology: "Cumhuriyet", pop: 2300000, civFactories: 2, milFactories: 0, money: 600, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    COG: { name: "Kongo C.", flag: "cg", color: "#15803d", ideology: "Cumhuriyet", pop: 5500000, civFactories: 2, milFactories: 0, money: 400, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    CAF: { name: "O. Afrika C.", flag: "cf", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 5000000, civFactories: 1, milFactories: 0, money: 200, manpower: 8000, divisions: { inf: 2, art: 0, arm: 0 } },
    TGO: { name: "Togo", flag: "tg", color: "#eab308", ideology: "Cumhuriyet", pop: 8500000, civFactories: 1, milFactories: 0, money: 250, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    BEN: { name: "Benin", flag: "bj", color: "#15803d", ideology: "Demokrasi", pop: 13000000, civFactories: 2, milFactories: 0, money: 300, manpower: 12000, divisions: { inf: 2, art: 0, arm: 0 } },
    BFA: { name: "Burkina Faso", flag: "bf", color: "#dc2626", ideology: "Askeri", pop: 22000000, civFactories: 2, milFactories: 1, money: 280, manpower: 20000, divisions: { inf: 3, art: 0, arm: 0 } },
    MRT: { name: "Moritanya", flag: "mr", color: "#15803d", ideology: "Cumhuriyet", pop: 4600000, civFactories: 1, milFactories: 0, money: 300, manpower: 10000, divisions: { inf: 2, art: 0, arm: 0 } },
    GNB: { name: "Gine-Bissau", flag: "gw", color: "#eab308", ideology: "Cumhuriyet", pop: 2000000, civFactories: 1, milFactories: 0, money: 150, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    GMB: { name: "Gambiya", flag: "gm", color: "#dc2626", ideology: "Cumhuriyet", pop: 2700000, civFactories: 1, milFactories: 0, money: 150, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    SLE: { name: "Sierra Leone", flag: "sl", color: "#1e3a8a", ideology: "Cumhuriyet", pop: 8600000, civFactories: 1, milFactories: 0, money: 200, manpower: 8000, divisions: { inf: 2, art: 0, arm: 0 } },
    LBR: { name: "Liberya", flag: "lr", color: "#1e40af", ideology: "Cumhuriyet", pop: 5300000, civFactories: 1, milFactories: 0, money: 200, manpower: 6000, divisions: { inf: 1, art: 0, arm: 0 } },
    GNQ: { name: "Ekvator Ginesi", flag: "gq", color: "#15803d", ideology: "Otoriter", pop: 1600000, civFactories: 2, milFactories: 0, money: 800, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    BWA: { name: "Botsvana", flag: "bw", color: "#1d4ed8", ideology: "Demokrasi", pop: 2600000, civFactories: 2, milFactories: 0, money: 700, manpower: 8000, divisions: { inf: 1, art: 0, arm: 0 } },
    MWI: { name: "Malavi", flag: "mw", color: "#dc2626", ideology: "Cumhuriyet", pop: 20000000, civFactories: 2, milFactories: 0, money: 250, manpower: 15000, divisions: { inf: 2, art: 0, arm: 0 } },
    RWA: { name: "Ruanda", flag: "rw", color: "#1e3a8a", ideology: "Otoriter", pop: 14000000, civFactories: 2, milFactories: 1, money: 400, manpower: 25000, divisions: { inf: 3, art: 0, arm: 0 } },
    BTN: { name: "Butan", flag: "bt", color: "#ea580c", ideology: "Monarşi", pop: 780000, civFactories: 1, milFactories: 0, money: 300, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    BRN: { name: "Brunei", flag: "bn", color: "#eab308", ideology: "Monarşi", pop: 450000, civFactories: 2, milFactories: 0, money: 2000, manpower: 2000, divisions: { inf: 1, art: 0, arm: 0 } },
    TLS: { name: "Doğu Timor", flag: "tl", color: "#dc2626", ideology: "Cumhuriyet", pop: 1300000, civFactories: 1, milFactories: 0, money: 200, manpower: 4000, divisions: { inf: 1, art: 0, arm: 0 } },
    FJI: { name: "Fiji", flag: "fj", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 900000, civFactories: 1, milFactories: 0, money: 300, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    SLB: { name: "Solomon Adaları", flag: "sb", color: "#1e3a8a", ideology: "Demokrasi", pop: 700000, civFactories: 1, milFactories: 0, money: 150, manpower: 2000, divisions: { inf: 1, art: 0, arm: 0 } },
    VUT: { name: "Vanuatu", flag: "vu", color: "#dc2626", ideology: "Demokrasi", pop: 300000, civFactories: 1, milFactories: 0, money: 100, manpower: 1000, divisions: { inf: 0, art: 0, arm: 0 } },
    WSM: { name: "Samoa", flag: "ws", color: "#dc2626", ideology: "Demokrasi", pop: 200000, civFactories: 1, milFactories: 0, money: 100, manpower: 1000, divisions: { inf: 0, art: 0, arm: 0 } },
    TON: { name: "Tonga", flag: "to", color: "#dc2626", ideology: "Monarşi", pop: 100000, civFactories: 0, milFactories: 0, money: 80, manpower: 500, divisions: { inf: 0, art: 0, arm: 0 } },
    BHS: { name: "Bahamalar", flag: "bs", color: "#1d4ed8", ideology: "Demokrasi", pop: 400000, civFactories: 1, milFactories: 0, money: 400, manpower: 1500, divisions: { inf: 0, art: 0, arm: 0 } },
    TTO: { name: "Trinidad", flag: "tt", color: "#dc2626", ideology: "Demokrasi", pop: 1400000, civFactories: 2, milFactories: 0, money: 600, manpower: 4000, divisions: { inf: 1, art: 0, arm: 0 } },
    BLZ: { name: "Belize", flag: "bz", color: "#1e3a8a", ideology: "Demokrasi", pop: 400000, civFactories: 1, milFactories: 0, money: 200, manpower: 1500, divisions: { inf: 0, art: 0, arm: 0 } },
    BHR: { name: "Bahreyn", flag: "bh", color: "#dc2626", ideology: "Monarşi", pop: 1500000, civFactories: 2, milFactories: 1, money: 2500, manpower: 5000, divisions: { inf: 1, art: 0, arm: 0 } },
    MDV: { name: "Maldivler", flag: "mv", color: "#15803d", ideology: "Cumhuriyet", pop: 500000, civFactories: 1, milFactories: 0, money: 300, manpower: 2000, divisions: { inf: 0, art: 0, arm: 0 } },
    MUS: { name: "Mauritius", flag: "mu", color: "#dc2626", ideology: "Demokrasi", pop: 1300000, civFactories: 2, milFactories: 0, money: 500, manpower: 3000, divisions: { inf: 1, art: 0, arm: 0 } },
    SYC: { name: "Seyşeller", flag: "sc", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 100000, civFactories: 1, milFactories: 0, money: 200, manpower: 500, divisions: { inf: 0, art: 0, arm: 0 } },
    COM: { name: "Komorlar", flag: "km", color: "#15803d", ideology: "Cumhuriyet", pop: 800000, civFactories: 1, milFactories: 0, money: 100, manpower: 2000, divisions: { inf: 0, art: 0, arm: 0 } },
    CPV: { name: "Yeşil Burun", flag: "cv", color: "#1d4ed8", ideology: "Demokrasi", pop: 500000, civFactories: 1, milFactories: 0, money: 200, manpower: 1500, divisions: { inf: 0, art: 0, arm: 0 } },
    STP: { name: "Sao Tome", flag: "st", color: "#eab308", ideology: "Demokrasi", pop: 220000, civFactories: 0, milFactories: 0, money: 80, manpower: 500, divisions: { inf: 0, art: 0, arm: 0 } },
    FSM: { name: "Mikronezya", flag: "fm", color: "#1d4ed8", ideology: "Demokrasi", pop: 100000, civFactories: 0, milFactories: 0, money: 50, manpower: 300, divisions: { inf: 0, art: 0, arm: 0 } },
    MHL: { name: "Marshall Ad.", flag: "mh", color: "#1e3a8a", ideology: "Cumhuriyet", pop: 60000, civFactories: 0, milFactories: 0, money: 40, manpower: 200, divisions: { inf: 0, art: 0, arm: 0 } },
    PLW: { name: "Palau", flag: "pw", color: "#1d4ed8", ideology: "Cumhuriyet", pop: 18000, civFactories: 0, milFactories: 0, money: 30, manpower: 100, divisions: { inf: 0, art: 0, arm: 0 } },
    KIR: { name: "Kiribati", flag: "ki", color: "#dc2626", ideology: "Cumhuriyet", pop: 120000, civFactories: 0, milFactories: 0, money: 40, manpower: 200, divisions: { inf: 0, art: 0, arm: 0 } },
    TUV: { name: "Tuvalu", flag: "tv", color: "#1d4ed8", ideology: "Demokrasi", pop: 12000, civFactories: 0, milFactories: 0, money: 20, manpower: 50, divisions: { inf: 0, art: 0, arm: 0 } },
    NRU: { name: "Nauru", flag: "nr", color: "#eab308", ideology: "Cumhuriyet", pop: 12000, civFactories: 0, milFactories: 0, money: 30, manpower: 50, divisions: { inf: 0, art: 0, arm: 0 } },
    ATG: { name: "Antigua", flag: "ag", color: "#dc2626", ideology: "Demokrasi", pop: 100000, civFactories: 0, milFactories: 0, money: 100, manpower: 300, divisions: { inf: 0, art: 0, arm: 0 } },
    LCA: { name: "Saint Lucia", flag: "lc", color: "#1d4ed8", ideology: "Demokrasi", pop: 180000, civFactories: 0, milFactories: 0, money: 100, manpower: 400, divisions: { inf: 0, art: 0, arm: 0 } },
    ATA: { name: "Antarktika", flag: "aq", color: "#e2e8f0", ideology: "Antlaşma", pop: 5000, civFactories: 1, milFactories: 0, money: 200, manpower: 2000, divisions: { inf: 1, art: 0, arm: 0 } },
    NEUTRAL: { name: "Sahipsiz", flag: "un", color: "#94a3b8", ideology: "—", pop: 0, civFactories: 0, milFactories: 0, money: 0, manpower: 0, divisions: { inf: 0, art: 0, arm: 0 }, alive: false },
    SHN: { name: "Saint Helena", flag: "sh", color: "#1e3a8a", ideology: "Sömürge", pop: 5000, civFactories: 0, milFactories: 0, money: 20, manpower: 50, divisions: { inf: 0, art: 0, arm: 0 } }
  };

  function autoShort(name, iso) {
    if (SHORT_NAMES[iso]) return SHORT_NAMES[iso];
    if (!name) return iso;
    if (name.length <= 11) return name;
    var s = String(name)
      .replace(/\s+Federasyonu$/i, "")
      .replace(/\s+Cumhuriyeti$/i, "")
      .replace(/\s+Halk Cumhuriyeti$/i, "")
      .replace(/^Birleşik\s+/i, "")
      .replace(/^Kuzey\s+/i, "K. ")
      .replace(/^Güney\s+/i, "G. ");
    if (s.length > 14) s = s.slice(0, 12) + "…";
    return s;
  }

  function ensureExtras() {
    var g = window.GameState;
    if (!g) return;
    g.countries = g.countries || {};
    Object.keys(EXTRA_COUNTRIES).forEach(function (iso) {
      if (!g.countries[iso]) {
        var base = EXTRA_COUNTRIES[iso];
        g.countries[iso] = Object.assign({
          stockpile: { guns: 200, artillery: 20, tanks: 0 },
          research: {},
          focusProgress: 0
        }, base);
      }
    });
  }

  function reassignBreakaways() {
    try {
      var po = window.provinceOwners;
      if (!po) return;
      var sid = (window.GameState && GameState.scenarioId) || "modern";
      // Modern: Somaliland Somali'ye; Abhazya bağımsız
      if (sid === "modern") {
        if (po.Somaliland) po.Somaliland = "SML";
        if (po.British_Somaliland) po.British_Somaliland = "SML";
        if (po.Abkhazia) po.Abkhazia = "ABK";
        if (po.North_Cyprus) po.North_Cyprus = "KTC";
        if (po.South_Cyprus) po.South_Cyprus = "CYP";
      } else {
        // WW1/WW2: Abhazya ayrı devlet değil; KKTC yok
        if (po.Abkhazia === "ABK") po.Abkhazia = "RUS";
        if (po.North_Cyprus === "KTC") po.North_Cyprus = "GBR";
      }
    } catch (e) {}
  }

  function applyColors() {
    try {
      var g = window.GameState;
      if (!g || !g.countries) return 0;
      ensureExtras();
      var n = 0;
      Object.keys(g.countries).forEach(function (iso) {
        var c = g.countries[iso];
        if (!c) return;
        var col = EUROPE_COLORS[iso] || WORLD_COLORS[iso] || (EXTRA_COUNTRIES[iso] && EXTRA_COUNTRIES[iso].color);
        if (col) {
          c.color = col;
          c.savedColor = col;
          n++;
        }
        c.shortName = autoShort(c.name || iso, iso);
      });
      return n;
    } catch (e) {
      return 0;
    }
  }

  window.scCountryLabel = function (iso, mode) {
    try {
      var g = window.GameState;
      var c = g && g.countries && g.countries[iso];
      if (!c) return "";
      // silinen / topraksız ülke → isim yok
      var po = window.provinceOwners || {};
      var hasLand = false;
      for (var p in po) {
        if (po[p] === iso) {
          hasLand = true;
          break;
        }
      }
      if (!hasLand) return "";
      var shortN = c.shortName || autoShort(c.name, iso);
      var longN = c.name || iso;
      var k = window.__SC_ZOOM_K || 1;
      if (mode === "long") return longN;
      if (mode === "short") return shortN;
      if (k < 1.15) return shortN;
      if (longN.length > 16) return shortN;
      return longN;
    } catch (e) {
      return iso;
    }
  };

  function throttleAIExpand() {
    try {
      // wrap ai expand if exposed later via mods - reduce chance globally
      var g = window.GameState;
      if (g) {
        g._aiExpandChance = 0.08; // was ~0.28
        g._aiExpandMinDays = 28; // was 12
      }
    } catch (e) {}
  }

  function paint() {
    try {
      if (typeof refreshMapColors === "function") refreshMapColors();
      else if (typeof window.scPaintPolitical === "function") window.scPaintPolitical();
      if (typeof window.scRefreshCountryNames === "function") window.scRefreshCountryNames(true);
    } catch (e) {}
  }

  function boot() {
    ensureExtras();
    reassignBreakaways();
    applyColors();
    throttleAIExpand();
    var prev = window.startGame;
    if (typeof prev === "function" && !prev._colorNames) {
      window.startGame = async function () {
        var r = await prev.apply(this, arguments);
        ensureExtras();
        reassignBreakaways();
        applyColors();
        throttleAIExpand();
        setTimeout(paint, 500);
        setTimeout(function () {
          reassignBreakaways();
          applyColors();
          paint();
        }, 1500);
        return r;
      };
      window.startGame._colorNames = true;
    }
    setTimeout(function () {
      ensureExtras();
      reassignBreakaways();
      applyColors();
      paint();
    }, 2000);
    // senaryo renklerini yeniden uygula
  setTimeout(function(){
    try {
      if (typeof window.scApplyScenarioNameLayout === "function" && window.SCENARIOS && GameState.scenarioId) {
        window.scApplyScenarioNameLayout(SCENARIOS[GameState.scenarioId]);
      }
    } catch(e){}
  }, 1200);
  
  // Custom wiki flags for unrecognized states
  function applyCustomFlags() {
    try {
      var g = window.GameState; if (!g || !g.countries) return;
      var map = {
        KTC: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg/250px-Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg.png",
        ABK: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Flag_of_the_Republic_of_Abkhazia.svg/250px-Flag_of_the_Republic_of_Abkhazia.svg.png",
        SML: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Flag_of_Somaliland.svg/330px-Flag_of_Somaliland.svg.png",
        DNZ: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/POL_Gda%C5%84sk_flag.svg/250px-POL_Gda%C5%84sk_flag.svg.png"
      };
      Object.keys(map).forEach(function (iso) {
        if (g.countries[iso]) {
          g.countries[iso].flag = map[iso];
          if (iso === "KTC") g.countries[iso].color = "#ffffff";
        }
      });
      // HUD refresh if player is one of these
      var fl = document.getElementById("hud-flag");
      if (fl && g.player && map[g.player]) fl.src = map[g.player];
    } catch (e) {}
  }
  var _oldStart = window.startGame;
  if (typeof _oldStart === "function") {
    window.startGame = async function () {
      var r = await _oldStart.apply(this, arguments);
      try { reassignBreakaways(); ensureExtras(); applyCustomFlags(); } catch (e) {}
      return r;
    };
  }
  setTimeout(function(){ try { applyCustomFlags(); } catch(e){} }, 2000);
  console.log("[colors-names] KTC/ABK/SML/DNZ flags + modern ownership");

  console.log("[colors-names] palette · ABK/SML/KTC · custom flags");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);

  // v1.9.11 HOI modern map palette override
  var HOI_MODERN = {"USA": "#3B8ED0", "CAN": "#8B3A2F", "MEX": "#6BA85A", "GTM": "#5A9B6A", "BLZ": "#4A8B7A", "HND": "#3D8B6A", "SLV": "#4A9B7A", "NIC": "#5A8B4A", "CRI": "#3A6B9B", "PAN": "#C43C3C", "CUB": "#2E5AA8", "DOM": "#3B7BC0", "HTI": "#1E3A6B", "JAM": "#2D6B4A", "TTO": "#8B1A1A", "COL": "#1E3A6B", "VEN": "#B91C1C", "GUY": "#C9A227", "SUR": "#B8860B", "GUF": "#3D6B9B", "BRA": "#5A9B4A", "ARG": "#A8A0C8", "CHL": "#2E6B7A", "PER": "#8B1A1A", "BOL": "#4A9B3A", "PRY": "#C45C6A", "URY": "#6B9BC8", "ECU": "#C9A227", "GBR": "#C45C6A", "IRL": "#2D8B4A", "FRA": "#3A5FBF", "ESP": "#E8C84A", "PRT": "#3D8B3D", "DEU": "#8B8B7A", "ITA": "#4A8B4A", "CHE": "#C43C3C", "AUT": "#E8E8E0", "BEL": "#E8B84A", "NLD": "#E07A30", "LUX": "#4A9BC8", "DNK": "#C43C4A", "SWE": "#3B7BC0", "NOR": "#A82A2A", "FIN": "#F0F4F8", "ISL": "#1E3A6B", "POL": "#C85CAC", "CZE": "#5A8BC8", "SVK": "#3A5FBF", "HUN": "#2D6B3A", "ROU": "#C97A20", "BGR": "#2D7A5A", "GRC": "#3B9BC8", "TUR": "#C43C3C", "UKR": "#C9A020", "BLR": "#C85C7A", "MDA": "#E8C84A", "LTU": "#A08020", "LVA": "#8B1A3A", "EST": "#3B7BC0", "SRB": "#C85C7A", "HRV": "#8B1A3A", "BIH": "#3B7BC0", "SVN": "#3B9BC8", "ALB": "#6B1A1A", "MKD": "#A06020", "MNE": "#E8C84A", "XKX": "#E8C84A", "KOS": "#E8C84A", "RKS": "#E8C84A", "CYP": "#E8B84A", "MLT": "#C43C3C", "RUS": "#3D8B4A", "GEO": "#E07A30", "ARM": "#8B3A5A", "AZE": "#3D8B6A", "ABK": "#E07A30", "KAZ": "#5AB8C8", "UZB": "#3D9B8A", "TKM": "#6BA89A", "KGZ": "#4A9B8A", "TJK": "#5A8B7A", "MNG": "#3D8B6A", "SAU": "#2D8B4A", "IRQ": "#5A8B6A", "IRN": "#5A9B8A", "SYR": "#6B8B5A", "JOR": "#8B6B3A", "ISR": "#3B7BC0", "LBN": "#C45C6A", "PSE": "#4A7A5A", "YEM": "#A08040", "OMN": "#6B8B4A", "ARE": "#2D7A4A", "QAT": "#6B1A2A", "KWT": "#3D8B5A", "BHR": "#8B2A3A", "EGY": "#C8B84A", "LBY": "#2D6B4A", "TUN": "#C45C4A", "DZA": "#2D7A3A", "MAR": "#C43C3C", "SDN": "#6B8B3A", "SSD": "#4A7A5A", "ETH": "#3D8B3A", "ERI": "#8B4A3A", "DJI": "#4A7A8A", "SOM": "#5A9BC8", "SML": "#4A8BB0", "KEN": "#2D7A4A", "UGA": "#C9A020", "TZA": "#3D8B5A", "RWA": "#4A7A3A", "BDI": "#5A8B4A", "COD": "#E8A020", "COG": "#3D8B4A", "GAB": "#2D6B3A", "CMR": "#C97A20", "NGA": "#2A8B4A", "NER": "#C9A040", "TCD": "#3D8B5A", "CAF": "#C45C6A", "GHA": "#C97A20", "CIV": "#C9A020", "SEN": "#3D8B5A", "MLI": "#C8B84A", "BFA": "#C97A30", "GIN": "#2D7A4A", "SLE": "#3D8B5A", "LBR": "#2D6B4A", "MRT": "#C8A050", "GNB": "#4A8B3A", "BEN": "#3D8B4A", "TGO": "#C43C3C", "AGO": "#8B1A2A", "ZMB": "#3D8B5A", "ZWE": "#4A7A3A", "BWA": "#5A9BC8", "NAM": "#C85C9A", "ZAF": "#C87A9A", "MOZ": "#3D8B5A", "MDG": "#C85C7A", "MWI": "#4A8B3A", "LSO": "#3B7BC0", "SWZ": "#C45C6A", "CHN": "#B02A2A", "TWN": "#3B7BC0", "PRK": "#8B1A1A", "KOR": "#3B7BC0", "JPN": "#E8D4A8", "IND": "#D4A017", "PAK": "#2D8B5A", "BGD": "#3D8B4A", "NPL": "#C43C3C", "BTN": "#C9A020", "LKA": "#C45C6A", "MMR": "#4A8B3A", "THA": "#C97A40", "LAO": "#5A9B4A", "KHM": "#3D7A5A", "VNM": "#C43C3C", "MYS": "#C9A020", "SGP": "#C45C6A", "IDN": "#B85A2A", "PHL": "#3B7BC0", "BRN": "#C9A020", "TLS": "#C43C3C", "PNG": "#C97A30", "AUS": "#7ABA6A", "NZL": "#C85C9A", "FJI": "#3B7BC0", "NCL": "#3A6B9B", "KTC": "#FFFFFF", "DNZ": "#C45C6A", "AFG": "#6B8B5A"};
  Object.keys(HOI_MODERN).forEach(function (iso) {
    if (typeof EUROPE_COLORS !== "undefined") EUROPE_COLORS[iso] = HOI_MODERN[iso];
    if (typeof WORLD_COLORS !== "undefined") WORLD_COLORS[iso] = HOI_MODERN[iso];
  });
  function applyHoiModernColors() {
    try {
      var g = window.GameState;
      if (!g || !g.countries) return;
      Object.keys(HOI_MODERN).forEach(function (iso) {
        if (g.countries[iso]) g.countries[iso].color = HOI_MODERN[iso];
      });
      if (g.scenarioId === "modern" || (g.scenario && String(g.scenario).indexOf("modern") >= 0)) {
        if (typeof refreshMapColors === "function") refreshMapColors();
      }
    } catch (e) {}
  }
  window.scApplyHoiModernColors = applyHoiModernColors;
  var _sg = window.startGame;
  if (typeof _sg === "function" && !_sg._hoiColor) {
    window.startGame = async function () {
      var r = await _sg.apply(this, arguments);
      setTimeout(applyHoiModernColors, 400);
      setTimeout(applyHoiModernColors, 1200);
      return r;
    };
    window.startGame._hoiColor = true;
  }
  setInterval(function () {
    try {
      var g = window.GameState;
      if (g && g.running && (g.scenarioId === "modern" || !g.scenarioId)) applyHoiModernColors();
    } catch (e) {}
  }, 8000);
  console.log("[v1.9.11] modern ülke renkleri (HOI harita paleti)");


  // v1.9.12 AoH3 modern palette (overrides previous)
  var AOH3_MODERN = {"USA": "#4B3B9B", "CAN": "#C43C18", "MEX": "#1A7A4A", "GTM": "#2D8B5A", "BLZ": "#3D9B6A", "HND": "#228B55", "SLV": "#2A9B60", "NIC": "#1E7A48", "CRI": "#3A6B9B", "PAN": "#8B2A6B", "CUB": "#5A2A9B", "DOM": "#3B7BC0", "HTI": "#2A4A7A", "JAM": "#2D6B4A", "TTO": "#8B1A1A", "COL": "#E8C020", "VEN": "#3B8ED0", "GUY": "#C9A227", "SUR": "#B8860B", "GUF": "#3D6B9B", "BRA": "#009B3A", "ARG": "#7EB6D9", "CHL": "#3B7BC0", "PER": "#C43030", "BOL": "#6B6B6B", "PRY": "#7B4B9B", "URY": "#5A9BC8", "ECU": "#C9A227", "GBR": "#2D9B8A", "IRL": "#1A8B4A", "FRA": "#1E3A8A", "ESP": "#C9A040", "PRT": "#2D7A40", "DEU": "#2A8B8B", "ITA": "#5A8B20", "CHE": "#C43030", "AUT": "#8B6B4A", "BEL": "#C9A020", "NLD": "#E07A30", "LUX": "#4A9BC8", "DNK": "#C43040", "SWE": "#E07030", "NOR": "#9B2040", "FIN": "#D06060", "ISL": "#5A7A9B", "POL": "#2A9B70", "CZE": "#4A8B9B", "SVK": "#3A7A9B", "HUN": "#C07020", "ROU": "#C9A020", "BGR": "#4A8B6A", "GRC": "#3B9BC8", "TUR": "#C43030", "UKR": "#E03020", "BLR": "#6B9B4A", "MDA": "#C9A040", "LTU": "#6B9B30", "LVA": "#9B2040", "EST": "#4A9BC8", "SRB": "#C05070", "HRV": "#3B7BC0", "BIH": "#5A8B9B", "SVN": "#3B9BC8", "ALB": "#8B1A1A", "MKD": "#A06020", "MNE": "#C9A040", "XKX": "#C9A040", "KOS": "#C9A040", "RKS": "#C9A040", "CYP": "#E8B84A", "MLT": "#C43030", "RUS": "#1A2A9B", "GEO": "#E07030", "ARM": "#9B3A5A", "AZE": "#2D9B6A", "ABK": "#E07030", "KAZ": "#3DB8C8", "UZB": "#2D9B8A", "TKM": "#5AA89A", "KGZ": "#4A9B8A", "TJK": "#5A8B7A", "MNG": "#4AB8C0", "SAU": "#1A7A40", "IRQ": "#2D8B50", "IRN": "#3DB870", "SYR": "#6B8B5A", "JOR": "#8B6B3A", "ISR": "#3B7BC0", "LBN": "#C05060", "PSE": "#4A7A5A", "YEM": "#A08040", "OMN": "#6B8B4A", "ARE": "#1A7A40", "QAT": "#6B1A2A", "KWT": "#2D8B50", "BHR": "#8B2A3A", "EGY": "#2D8B5A", "LBY": "#4A9B6A", "TUN": "#C05050", "DZA": "#1A6B3A", "MAR": "#C03030", "SDN": "#6B8B3A", "SSD": "#4A7A5A", "ETH": "#3B7BC0", "ERI": "#8B4A3A", "DJI": "#4A7A8A", "SOM": "#5A9BC8", "SML": "#4A8BB0", "KEN": "#2D7A4A", "UGA": "#C9A020", "TZA": "#3D8B5A", "RWA": "#4A7A3A", "BDI": "#5A8B4A", "COD": "#2A7AD0", "COG": "#2D8B4A", "GAB": "#1A6B3A", "CMR": "#C97A20", "NGA": "#8BB05A", "NER": "#C9A040", "TCD": "#3D8B5A", "CAF": "#C05060", "GHA": "#C97A20", "CIV": "#C9A020", "SEN": "#3D8B5A", "MLI": "#C8B84A", "BFA": "#C97A30", "GIN": "#2D7A4A", "SLE": "#3D8B5A", "LBR": "#2D6B4A", "MRT": "#C8A050", "GNB": "#4A8B3A", "BEN": "#3D8B4A", "TGO": "#C43030", "AGO": "#8B1A2A", "ZMB": "#3D8B5A", "ZWE": "#4A7A3A", "BWA": "#5A9BC8", "NAM": "#C85C9A", "ZAF": "#F0E060", "MOZ": "#3D8B5A", "MDG": "#C85C9A", "MWI": "#4A8B3A", "LSO": "#3B7BC0", "SWZ": "#C05060", "CHN": "#DE2915", "TWN": "#3B7BC0", "PRK": "#8B1A1A", "KOR": "#2A5AB0", "JPN": "#E07030", "IND": "#E8A010", "PAK": "#1A6B40", "BGD": "#2D8B4A", "NPL": "#C43030", "BTN": "#C9A020", "LKA": "#C05060", "MMR": "#4A8B3A", "THA": "#C97A40", "LAO": "#5A9B4A", "KHM": "#3D7A5A", "VNM": "#C05070", "MYS": "#C9A020", "SGP": "#C05060", "IDN": "#8B1515", "PHL": "#3B7BC0", "BRN": "#C9A020", "TLS": "#C43030", "PNG": "#C97A30", "AUS": "#3A3A9B", "NZL": "#4A4A9B", "FJI": "#3B7BC0", "NCL": "#3A6B9B", "AFG": "#4A6B4A", "KTC": "#FFFFFF", "DNZ": "#C05060"};
  function applyAoh3Colors() {
    try {
      var g = window.GameState;
      if (!g || !g.countries) return;
      Object.keys(AOH3_MODERN).forEach(function (iso) {
        if (g.countries[iso]) g.countries[iso].color = AOH3_MODERN[iso];
      });
      try {
        if (typeof EUROPE_COLORS !== "undefined") Object.assign(EUROPE_COLORS, AOH3_MODERN);
        if (typeof WORLD_COLORS !== "undefined") Object.assign(WORLD_COLORS, AOH3_MODERN);
      } catch (e) {}
      if (typeof refreshMapColors === "function") refreshMapColors();
    } catch (e) {}
  }
  window.scApplyAoh3Colors = applyAoh3Colors;
  window.scApplyHoiModernColors = applyAoh3Colors; // redirect old
  var _sg2 = window.startGame;
  if (typeof _sg2 === "function" && !_sg2._aohColor) {
    window.startGame = async function () {
      var r = await _sg2.apply(this, arguments);
      setTimeout(applyAoh3Colors, 300);
      setTimeout(applyAoh3Colors, 900);
      setTimeout(applyAoh3Colors, 2000);
      return r;
    };
    window.startGame._aohColor = true;
  }
  setTimeout(applyAoh3Colors, 1500);
  console.log("[v1.9.12] AoH3 modern ülke renkleri");

})();

/* aoh3-colors-fix.js is authoritative */
