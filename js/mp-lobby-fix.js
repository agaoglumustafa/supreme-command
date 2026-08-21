// ===== MP Lobby Fix — sticky country · visible players · reliable join =====
(function SCMPLobbyFix() {
  "use strict";

  // Hardcoded nations so dropdown works even before GameState.countries loads
  var NATIONS = [
    ["TUR", "Türkiye"], ["DEU", "Almanya"], ["USA", "ABD"], ["RUS", "Rusya"],
    ["GBR", "Birleşik Krallık"], ["FRA", "Fransa"], ["ITA", "İtalya"], ["JPN", "Japonya"],
    ["CHN", "Çin"], ["IND", "Hindistan"], ["BRA", "Brezilya"], ["CAN", "Kanada"],
    ["ESP", "İspanya"], ["POL", "Polonya"], ["UKR", "Ukrayna"], ["SWE", "İsveç"],
    ["NOR", "Norveç"], ["FIN", "Finlandiya"], ["NLD", "Hollanda"], ["BEL", "Belçika"],
    ["AUT", "Avusturya"], ["CHE", "İsviçre"], ["CZE", "Çekya"], ["HUN", "Macaristan"],
    ["ROU", "Romanya"], ["GRC", "Yunanistan"], ["PRT", "Portekiz"], ["IRL", "İrlanda"],
    ["AUS", "Avustralya"], ["KOR", "G. Kore"], ["PRK", "K. Kore"], ["IRN", "İran"],
    ["SAU", "S. Arabistan"], ["EGY", "Mısır"], ["ISR", "İsrail"], ["MEX", "Meksika"],
    ["ARG", "Arjantin"], ["ZAF", "G. Afrika"], ["IDN", "Endonezya"], ["PAK", "Pakistan"],
    ["AZE", "Azerbaycan"], ["GEO", "Gürcistan"], ["ARM", "Ermenistan"], ["KAZ", "Kazakistan"],
    ["BLR", "Belarus"], ["SRB", "Sırbistan"], ["MNE", "Karadağ"], ["RKS", "Kosova"],
    ["ABK", "Abhazya"], ["SML", "Somaliland"], ["SOM", "Somali"], ["QAT", "Katar"],
    ["ARE", "BAE"], ["IRQ", "Irak"], ["SYR", "Suriye"], ["DNK", "Danimarka"],
    ["SVK", "Slovakya"], ["HRV", "Hırvatistan"], ["BGR", "Bulgaristan"], ["MDA", "Moldova"]
  ];

  function M() {
    try { return (window.GameState && GameState.mp) || null; } catch (e) { return null; }
  }

  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(msg, kind || "info");
      else console.log("[MP]", msg);
    } catch (e) {}
  }

  function getPickedCountry() {
    var sel = document.getElementById("mp-player-country");
    var v = (window.__mpPickedCountry || (sel && sel.value) || "").toUpperCase().trim();
    if (!v || v === "TUR" && window.__mpUserPicked && window.__mpUserPicked !== "TUR") {
      // if user explicitly picked something else, prefer that
      if (window.__mpUserPicked) v = window.__mpUserPicked;
    }
    if (!v) v = window.__mpUserPicked || "TUR";
    return v.slice(0, 5);
  }

  function fillCountrySelect(forceKeep) {
    var sel = document.getElementById("mp-player-country");
    if (!sel) return;

    // Merge GameState countries if available
    var map = {};
    NATIONS.forEach(function (x) { map[x[0]] = x[1]; });
    try {
      if (window.GameState && GameState.countries) {
        Object.keys(GameState.countries).forEach(function (iso) {
          var c = GameState.countries[iso];
          if (c && c.name) map[iso] = c.name;
        });
      }
    } catch (e) {}

    var keep = forceKeep || window.__mpUserPicked || sel.value || window.__mpPickedCountry || "";
    if (document.activeElement === sel) return; // don't rebuild while open

    var keys = Object.keys(map).sort(function (a, b) {
      return String(map[a]).localeCompare(String(map[b]), "tr");
    });

    var html = keys.map(function (iso) {
      var selAttr = iso === keep ? " selected" : "";
      return '<option value="' + iso + '"' + selAttr + ">" + map[iso] + "</option>";
    }).join("");

    // only rewrite if changed length or keep missing
    if (sel.options.length !== keys.length || (keep && sel.value !== keep)) {
      sel.innerHTML = html;
      if (keep && map[keep]) sel.value = keep;
    }

    if (!sel._scSticky) {
      sel._scSticky = true;
      sel.addEventListener("change", function () {
        var v = sel.value;
        window.__mpUserPicked = v;
        window.__mpPickedCountry = v;
        var mp = M();
        if (mp) {
          mp.country = v;
          if (mp.peerId && mp.players && mp.players[mp.peerId]) {
            mp.players[mp.peerId].country = v;
          }
        }
        // notify host
        try {
          if (mp && mp.active && !mp.isHost && typeof window.mpSendCountryPick === "function") {
            window.mpSendCountryPick(v);
          } else if (mp && mp.active && !mp.isHost) {
            // fallback send
            var hostConn = mp.conns && (mp.conns[mp.hostId] || Object.values(mp.conns)[0]);
            if (hostConn && hostConn.open) {
              hostConn.send(JSON.stringify({ t: "countryPick", country: v }));
            }
          }
        } catch (e) {}
        renderPlayers();
        toast("Ülke: " + (map[v] || v), "info");
      });
    }
  }

  function nationName(iso) {
    if (!iso) return "—";
    try {
      if (GameState.countries && GameState.countries[iso] && GameState.countries[iso].name)
        return GameState.countries[iso].name;
    } catch (e) {}
    for (var i = 0; i < NATIONS.length; i++) if (NATIONS[i][0] === iso) return NATIONS[i][1];
    return iso;
  }

  function renderPlayers() {
    var box = document.getElementById("mp-player-list");
    if (!box) return;
    var mp = M();
    if (!mp || !mp.players) {
      box.innerHTML = '<div class="text-[11px] text-slate-500">Oyuncu yok — oda kur veya katıl</div>';
      return;
    }
    var rows = Object.values(mp.players);
    if (!rows.length) {
      box.innerHTML = '<div class="text-[11px] text-slate-500">Oyuncu yok</div>';
      return;
    }
    box.innerHTML = rows.map(function (p) {
      var me = mp.peerId && p.id === mp.peerId;
      var host = mp.isHost && me ? " ★HOST" : (p.id === mp.hostId ? " ★HOST" : "");
      var badge = p.spectator ? "👁️" : (p.ai ? "🤖" : "👤");
      var nat = nationName(p.country);
      return (
        '<div class="flex justify-between items-center gap-1 text-[11px] border-b border-slate-800/60 py-1.5 ' +
        (me ? "text-cyan-300" : "text-[#c8d0b8]") + '">' +
        "<span>" + badge + " <b>" + esc(p.name || "?") + "</b>" + (me ? " (sen)" : "") + host + "</span>" +
        '<span class="text-amber-500/90 font-bold">' + esc(nat) + "</span></div>"
      );
    }).join("");

    // claimed panel
    var claimed = document.getElementById("mp-claimed-nations");
    if (claimed) {
      claimed.innerHTML = rows
        .filter(function (p) { return p.country && !p.spectator; })
        .map(function (p) {
          return '<div class="flex justify-between"><span>' + esc(nationName(p.country)) +
            '</span><span class="text-cyan-600">' + esc(p.name || "") + "</span></div>";
        })
        .join("") || '<span class="text-slate-600">Henüz ulus seçilmedi</span>';
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Override refresh to sticky version
  window.mpRefreshCountrySelect = function () {
    fillCountrySelect(window.__mpUserPicked || window.__mpPickedCountry);
    renderPlayers();
  };

  // Force country into MP state right before create/join
  function stampCountry() {
    var v = getPickedCountry();
    window.__mpPickedCountry = v;
    if (!window.__mpUserPicked) {
      // if user never touched dropdown, still use current select value
      var sel = document.getElementById("mp-player-country");
      if (sel && sel.value) {
        v = sel.value;
        window.__mpPickedCountry = v;
      }
    } else {
      v = window.__mpUserPicked;
      window.__mpPickedCountry = v;
    }
    var mp = M();
    if (mp) {
      mp.country = v;
      if (mp.peerId && mp.players && mp.players[mp.peerId]) mp.players[mp.peerId].country = v;
    }
    return v;
  }

  function wrapCreateJoin() {
    var prevCreate = window.mpCreateRoom;
    window.mpCreateRoom = function () {
      var c = stampCountry();
      toast("Oda kuruluyor · ülke " + nationName(c), "info");
      if (typeof prevCreate === "function") return prevCreate.apply(this, arguments);
    };

    var prevJoin = window.mpJoinRoom;
    window.mpJoinRoom = function (code) {
      var c = stampCountry();
      toast("Katılınıyor · ülke " + nationName(c), "info");
      if (typeof prevJoin === "function") return prevJoin.apply(this, arguments);
    };

    // Host start: stamp again
    var prevStart = window.mpHostStartSupremacy;
    if (typeof prevStart === "function") {
      window.mpHostStartSupremacy = function () {
        stampCountry();
        return prevStart.apply(this, arguments);
      };
    }
    var prevStart2 = window.mpHostStart;
    if (typeof prevStart2 === "function") {
      window.mpHostStart = function () {
        stampCountry();
        return prevStart2.apply(this, arguments);
      };
    }
  }

  // Live player list while lobby open
  setInterval(function () {
    try {
      var modal = document.getElementById("mp-lobby-modal");
      if (!modal || modal.classList.contains("hidden")) return;
      fillCountrySelect(window.__mpUserPicked);
      renderPlayers();
      // status line
      var mp = M();
      var st = document.getElementById("mp-conn-status");
      if (st && mp) {
        if (mp.active && mp.isHost) {
          var n = Object.keys(mp.players || {}).length;
          var conns = Object.keys(mp.conns || {}).length;
          st.textContent = "Host · " + n + " oyuncu · " + conns + " bağlantı";
        } else if (mp.active) {
          st.textContent = "Misafir · bağlı";
        }
      }
    } catch (e) {}
  }, 800);

  // When main menu MP opens, fill select immediately
  function onOpenLobby() {
    setTimeout(function () {
      fillCountrySelect(window.__mpUserPicked);
      renderPlayers();
      wrapCreateJoin();
    }, 50);
    setTimeout(function () {
      fillCountrySelect(window.__mpUserPicked);
    }, 400);
  }

  var prevMenu = window.mainMenuMultiplayer;
  window.mainMenuMultiplayer = async function () {
    try {
      if (typeof window.loadPeerJS === "function") await window.loadPeerJS();
    } catch (e) {
      alert("PeerJS yüklenemedi");
    }
    if (typeof prevMenu === "function") {
      try { await prevMenu.apply(this, arguments); } catch (e) {
        document.getElementById("main-menu-screen")?.classList.add("hidden");
        document.getElementById("mp-lobby-modal")?.classList.remove("hidden");
      }
    } else {
      document.getElementById("main-menu-screen")?.classList.add("hidden");
      document.getElementById("mp-lobby-modal")?.classList.remove("hidden");
    }
    onOpenLobby();
  };

  function boot() {
    wrapCreateJoin();
    fillCountrySelect();
    renderPlayers();
    // Disable the aggressive refresh that forced TUR
    console.log("[mp-lobby-fix] sticky country · live player list");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
