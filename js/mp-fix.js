// ===== MP Fix — PeerJS load, room code, open list, STUN =====
(function SCMPFix() {
  "use strict";

  var PEER_CDNS = [
    "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
    "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js"
  ];

  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(msg, kind || "info");
      else if (typeof mpToast === "function") mpToast(msg, kind);
      else console.log("[MP]", msg);
    } catch (e) {
      console.log("[MP]", msg);
    }
  }

  function mp() {
    try {
      return (window.GameState && GameState.mp) || null;
    } catch (e) {
      return null;
    }
  }

  // Ücretsiz: public PeerJS + ücretsiz STUN (ücretli TURN yok)
  var FREE_PEER_HOSTS = [
    { host: "0.peerjs.com", port: 443, path: "/", secure: true },
    { host: "peerjs.herokuapp.com", port: 443, path: "/", secure: true } // may be dead; skipped on error
  ];
  function peerOptions(hostIdx) {
    var h = FREE_PEER_HOSTS[hostIdx || 0] || FREE_PEER_HOSTS[0];
    return {
      debug: 1,
      host: h.host,
      port: h.port,
      path: h.path,
      secure: !!h.secure,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" }
        ]
      }
    };
  }

  // ---------- Robust PeerJS loader ----------
  window.loadPeerJS = function () {
    return new Promise(function (resolve, reject) {
      if (window.Peer) return resolve(window.Peer);
      if (window.__peerLoading) return window.__peerLoading.then(resolve, reject);

      window.__peerLoading = new Promise(function (res, rej) {
        var i = 0;
        function tryNext() {
          if (window.Peer) return res(window.Peer);
          if (i >= PEER_CDNS.length) {
            rej(new Error("PeerJS yüklenemedi (tüm CDN)"));
            return;
          }
          var src = PEER_CDNS[i++];
          var s = document.createElement("script");
          s.src = src;
          s.async = true;
          s.onload = function () {
            if (window.Peer) res(window.Peer);
            else tryNext();
          };
          s.onerror = function () {
            console.warn("[MP] PeerJS CDN fail", src);
            tryNext();
          };
          document.head.appendChild(s);
        }
        tryNext();
      });

      window.__peerLoading.then(resolve, reject);
    });
  };

  function genCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function hostIdFromCode(code) {
    return "sc" + String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  }

  function showCodeUI(code, status) {
    try {
      var info = document.getElementById("mp-room-info");
      if (info) info.classList.remove("hidden");
      var codeEl = document.getElementById("mp-room-code");
      if (codeEl) codeEl.textContent = code || "————";
      var st = document.getElementById("mp-conn-status");
      if (st) st.textContent = status || "Bağlanıyor…";
      var role = document.getElementById("mp-role");
      if (role) role.textContent = "Host";
      document.getElementById("mp-host-opts")?.classList.remove("hidden");
      document.getElementById("mp-start-btn")?.classList.remove("hidden");
      document.getElementById("mp-pre-room-btns")?.classList.add("hidden");
      document.getElementById("mp-btn-leave")?.classList.remove("hidden");
    } catch (e) {}
  }

  // ---------- Open rooms (localStorage + BroadcastChannel) ----------
  var ROOM_KEY = "sc_open_rooms_v1";
  var bc = null;
  try {
    bc = new BroadcastChannel("sc_mp_rooms");
  } catch (e) {}

  function loadRooms() {
    try {
      return JSON.parse(localStorage.getItem(ROOM_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveRooms(list) {
    try {
      localStorage.setItem(ROOM_KEY, JSON.stringify((list || []).slice(0, 30)));
    } catch (e) {}
  }

  window.renderOpenRooms = function () {
    var box = document.getElementById("mp-open-rooms");
    if (!box) return;
    var list = loadRooms().filter(function (r) {
      return Date.now() - (r.ts || 0) < 1000 * 60 * 60 * 6;
    });
    if (!list.length) {
      box.innerHTML =
        '<div class="text-[10px] text-slate-500 p-2 leading-relaxed">' +
        "Açık oda yok.<br>• Host: <b>Listeye Yaz</b><br>" +
        "• Aynı tarayıcı/cihazda görünür<br>" +
        "• Uzak oyuncu: <b>kod ile katıl</b></div>";
      return;
    }
    box.innerHTML = list
      .map(function (r) {
        return (
          '<button type="button" onclick="mpJoinFromList(\'' +
          r.code +
          '\')" class="w-full text-left px-2 py-2 mb-1 rounded border border-slate-700 bg-slate-900/80 hover:border-cyan-600 text-[11px]">' +
          '<span class="font-bold text-cyan-300 font-mono">' +
          r.code +
          "</span>" +
          '<span class="text-slate-400 ml-2">' +
          (r.name || "Host") +
          "</span>" +
          '<span class="float-right text-slate-500">' +
          (r.players || 1) +
          "/" +
          (r.maxPlayers || 6) +
          "</span></button>"
        );
      })
      .join("");
  };

  window.mpAnnounceRoom = function () {
    var M = mp();
    if (!M || !M.active || !M.isHost || !M.roomCode) {
      toast("Önce oda kur (host ol)", "bad");
      return;
    }
    var list = loadRooms().filter(function (r) {
      return r.code !== M.roomCode;
    });
    list.unshift({
      code: M.roomCode,
      name: M.name || "Host",
      scenario: M.scenario || "modern",
      players: Object.keys(M.players || {}).length || 1,
      maxPlayers: M.maxPlayers || 6,
      ts: Date.now()
    });
    saveRooms(list);
    try {
      if (bc) bc.postMessage({ t: "rooms", list: list });
    } catch (e) {}
    window.renderOpenRooms();
    toast("Oda listeye yazıldı: " + M.roomCode, "good");
  };

  window.mpJoinFromList = function (code) {
    if (!code) return;
    var input = document.getElementById("mp-join-code") || document.getElementById("mp-room-code-input");
    if (input) input.value = code;
    window.mpJoinRoomFixed(code);
  };

  if (bc) {
    bc.onmessage = function (ev) {
      if (ev.data && ev.data.t === "rooms" && ev.data.list) {
        saveRooms(ev.data.list);
        window.renderOpenRooms();
      }
    };
  }
  try {
    window.addEventListener("storage", function (ev) {
      if (ev.key === ROOM_KEY) window.renderOpenRooms();
    });
  } catch (e) {}

  // ---------- Create room with working Peer ----------
  window.mpCreateRoomFixed = async function () {
    var M = mp();
    if (!M) {
      toast("MP motoru yok — sayfayı yenile", "bad");
      return;
    }
    if (M.active && M.peerId) {
      showCodeUI(M.roomCode, "Açık");
      toast("Zaten odadasın: " + M.roomCode, "info");
      return;
    }

    try {
      await window.loadPeerJS();
    } catch (e) {
      toast("PeerJS yüklenemedi — internet / reklam engelleyici?", "bad");
      console.error(e);
      return;
    }
    if (!window.Peer) {
      toast("Peer sınıfı yok", "bad");
      return;
    }

    M.name = (document.getElementById("mp-player-name")?.value || "Host").slice(0, 16);
    M.country = (window.__mpPickedCountry || document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 5);
    window.__mpPickedCountry = M.country;
    M.spectator = !!document.getElementById("mp-spectator")?.checked;
    M.scenario = document.getElementById("mp-scenario")?.value || "modern";
    M.roomCode = genCode();
    M.maxPlayers = M.maxPlayers || 6;

    // Show code IMMEDIATELY (before peer open)
    showCodeUI(M.roomCode, "Broker’a bağlanıyor…");
    toast("Oda kodu: " + M.roomCode + " — bağlanıyor…", "info");
    try {
      if (location.hash !== "#" + M.roomCode) history.replaceState(null, "", "#" + M.roomCode);
    } catch (e) {}

    function bindHostPeer(peer, attempt) {
      peer.on("open", function (id) {
        M.peerId = id;
        M.isHost = true;
        M.active = true;
        M.hostId = id;
        M.peer = peer;
        M.players = M.players || {};
        M.players[id] = {
          id: id,
          name: M.name,
          country: M.country,
          ready: false,
          spectator: M.spectator,
          eliminated: false
        };
        showCodeUI(M.roomCode, "Açık ✓");
        try {
          if (typeof mpSetLobbyInRoom === "function") mpSetLobbyInRoom(true);
          if (typeof mpRenderLobbyList === "function") mpRenderLobbyList();
        } catch (e) {}
        toast("Oda hazır #" + M.roomCode + " — kodu paylaş", "good");
        try {
          window.mpAnnounceRoom();
        } catch (e) {}
      });

      peer.on("connection", function (conn) {
        conn.on("open", function () {
          try {
            if (typeof wireConn === "function") wireConn(conn);
          } catch (e) {
            // internal wire may be scoped — use data welcome
            try {
              M.conns = M.conns || {};
              M.conns[conn.peer] = conn;
              conn.send({
                t: "welcome",
                hostId: M.peerId,
                players: M.players,
                roomCode: M.roomCode,
                scenario: M.scenario,
                maxPlayers: M.maxPlayers || 6
              });
            } catch (e2) {}
          }
        });
        // Try engine wire if exposed
        try {
          if (typeof window.__scWireConn === "function") window.__scWireConn(conn);
        } catch (e) {}
      });

      peer.on("error", function (err) {
        console.warn("[MP] host peer error", err);
        var typ = (err && err.type) || "";
        showCodeUI(M.roomCode, "Hata: " + typ);
        if (typ === "unavailable-id" || typ === "peer-unavailable") {
          if (attempt < 3) {
            toast("Kimlik meşgul — yeni kod…", "info");
            try {
              peer.destroy();
            } catch (e) {}
            M.roomCode = genCode();
            showCodeUI(M.roomCode, "Yeniden…");
            startHost(attempt + 1);
            return;
          }
        }
        toast("Peer hata: " + (typ || err.message || "error") + " — tekrar dene", "bad");
      });
    }

    function startHost(attempt) {
      attempt = attempt || 0;
      try {
        if (M.peer) M.peer.destroy();
      } catch (e) {}
      var hid = hostIdFromCode(M.roomCode);
      var peer;
      try {
        peer = new Peer(hid, peerOptions());
      } catch (e) {
        // fallback default cloud
        peer = new Peer(hid);
      }
      M.peer = peer;
      bindHostPeer(peer, attempt);
    }

    startHost(0);
  };

  // ---------- Join room ----------
  window.mpJoinRoomFixed = async function (code) {
    var M = mp();
    if (!M) {
      toast("MP motoru yok", "bad");
      return;
    }
    code = String(code || document.getElementById("mp-join-code")?.value || document.getElementById("mp-room-code-input")?.value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!code || code.length < 4) {
      toast("Geçerli oda kodu gir", "bad");
      return;
    }

    try {
      await window.loadPeerJS();
    } catch (e) {
      toast("PeerJS yüklenemedi", "bad");
      return;
    }

    M.name = (document.getElementById("mp-player-name")?.value || "Oyuncu").slice(0, 16);
    M.country = (window.__mpPickedCountry || document.getElementById("mp-player-country")?.value || "TUR").toUpperCase().slice(0, 5);
    window.__mpPickedCountry = M.country;
    M.roomCode = code;
    showCodeUI(code, "Host’a bağlanıyor…");

    try {
      if (M.peer) M.peer.destroy();
    } catch (e) {}

    var peer;
    try {
      peer = new Peer(undefined, peerOptions());
    } catch (e) {
      peer = new Peer();
    }
    M.peer = peer;
    M.isHost = false;

    peer.on("open", function (id) {
      M.peerId = id;
      M.active = true;
      var hostId = hostIdFromCode(code);
      M.hostId = hostId;
      toast("Bağlanıyor: " + hostId, "info");
      var conn = peer.connect(hostId, { reliable: true });
      var opened = false;
      conn.on("open", function () {
        opened = true;
        M.conns = M.conns || {};
        M.conns[hostId] = conn;
        try {
          conn.send({
            t: "join",
            name: M.name,
            country: M.country,
            spectator: !!document.getElementById("mp-spectator")?.checked
          });
        } catch (e) {}
        try {
          if (typeof window.__scWireConn === "function") window.__scWireConn(conn);
        } catch (e) {}
        // Prefer engine join path
        try {
          if (typeof wireConn === "function") wireConn(conn);
        } catch (e) {}
        showCodeUI(code, "Bağlandı");
        try {
          if (typeof mpSetLobbyInRoom === "function") mpSetLobbyInRoom(true);
        } catch (e) {}
        toast("Odaya katıldın #" + code, "good");
      });
      conn.on("error", function (err) {
        console.warn("[MP] conn error", err);
        toast("Bağlantı hatası — host açık mı?", "bad");
      });
      setTimeout(function () {
        if (!opened) {
          showCodeUI(code, "Zaman aşımı");
          toast("Host bulunamadı — kod/host kontrol et", "bad");
        }
      }, 12000);
    });

    peer.on("error", function (err) {
      console.warn("[MP] join peer error", err);
      toast("Peer: " + ((err && err.type) || "error"), "bad");
    });
  };

  // ---------- Wire buttons / override engine entry points ----------
  function wireButtons() {
    // Keep engine create/join if present, but ensure Peer loads + country pick
    var engCreate = window.mpCreateRoom;
    var engJoin = window.mpJoinRoom;
    window.mpCreateRoom = function () {
      try {
        var sel = document.getElementById("mp-player-country");
        if (sel && sel.value) {
          window.__mpPickedCountry = sel.value;
          if (window.GameState && GameState.mp) GameState.mp.country = sel.value;
        }
      } catch (e) {}
      if (typeof window.Peer === "undefined") {
        window.loadPeerJS().then(function () {
          if (typeof engCreate === "function" && engCreate !== window.mpCreateRoom) engCreate();
          else window.mpCreateRoomFixed();
        });
        return;
      }
      if (typeof engCreate === "function" && !String(engCreate).includes("mpCreateRoomFixed")) {
        try { engCreate(); return; } catch (e) { console.warn(e); }
      }
      window.mpCreateRoomFixed();
    };
    window.mpJoinRoom = function (code) {
      try {
        var sel = document.getElementById("mp-player-country");
        if (sel && sel.value) {
          window.__mpPickedCountry = sel.value;
          if (window.GameState && GameState.mp) GameState.mp.country = sel.value;
        }
      } catch (e) {}
      if (typeof window.Peer === "undefined") {
        window.loadPeerJS().then(function () {
          if (typeof engJoin === "function" && engJoin !== window.mpJoinRoom) engJoin(code);
          else window.mpJoinRoomFixed(code);
        });
        return;
      }
      if (typeof engJoin === "function" && !String(engJoin).includes("mpJoinRoomFixed")) {
        try { engJoin(code); return; } catch (e) { console.warn(e); }
      }
      window.mpJoinRoomFixed(code);
    };
    window.mpJoinRoomPrompt = function () {
      var code = null;
      try {
        code = prompt("Oda kodu (6 karakter):", (location.hash || "").replace(/^#/, ""));
      } catch (e) {}
      if (code) window.mpJoinRoom(code);
    };

    // Ensure create button works
    var createBtn = document.getElementById("mp-btn-create");
    if (createBtn && !createBtn._mpFixed) {
      createBtn._mpFixed = true;
      createBtn.onclick = function (ev) {
        ev.preventDefault();
        window.mpCreateRoomFixed();
      };
    }
    var joinBtn = document.getElementById("mp-btn-join");
    if (joinBtn && !joinBtn._mpFixed) {
      joinBtn._mpFixed = true;
      joinBtn.onclick = function (ev) {
        ev.preventDefault();
        window.mpJoinRoomPrompt();
      };
    }
  }

  function wrapMenu() {
    var prev = window.mainMenuMultiplayer;
    window.mainMenuMultiplayer = async function () {
      try {
        await window.loadPeerJS();
      } catch (e) {
        alert("PeerJS yüklenemedi. İnternet veya reklam engelleyiciyi kontrol et.");
        console.error(e);
      }
      if (typeof prev === "function") {
        try {
          return await prev.apply(this, arguments);
        } catch (e) {
          console.warn(e);
        }
      }
      try {
        document.getElementById("main-menu-screen")?.classList.add("hidden");
        var modal = document.getElementById("mp-lobby-modal");
        if (modal) {
          modal.classList.remove("hidden");
          modal.style.removeProperty("display");
        }
      } catch (e) {}
      setTimeout(function () {
        wireButtons();
        window.renderOpenRooms();
      }, 100);
    };
    window.mainMenuMultiplayer._peerLazy = true;
  }

  function boot() {
    wireButtons();
    wrapMenu();
    window.renderOpenRooms();
    // preload PeerJS in background
    setTimeout(function () {
      window.loadPeerJS().catch(function () {});
    }, 800);
    setTimeout(wireButtons, 2000);
    console.log("[mp-fix] PeerJS multi-CDN · room code immediate · open list fixed");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
