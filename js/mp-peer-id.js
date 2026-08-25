// ===== MP Peer-ID rooms — guest connects to REAL host peer id =====
// Room code = host's PeerJS id (no sc+code derivation — that was the silent failure)
(function SCMPPeerIdRooms() {
  "use strict";

  function M() {
    try { return window.GameState && GameState.mp; } catch (e) { return null; }
  }
  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(String(msg).slice(0, 180), kind || "info");
      else console.log("[MP]", msg);
    } catch (e) {}
  }
  function $(id) { return document.getElementById(id); }
  function setStatus(t) { var e = $("mp-conn-status"); if (e) e.textContent = t; }
  function setRole(t) { var e = $("mp-role"); if (e) e.textContent = t; }
  function setCode(c) { var e = $("mp-room-code"); if (e) e.textContent = c || "————"; }

  function peerOpts() {
    return {
      debug: 2,
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" }
        ]
      }
    };
  }

  function pickCountry() {
    var v = (window.__mpUserPicked || window.__mpPickedCountry || "").toUpperCase();
    var sel = $("mp-player-country");
    if (sel && sel.value) v = sel.value.toUpperCase();
    if (!v) v = "TUR";
    window.__mpPickedCountry = v;
    return v.slice(0, 5);
  }
  function pickName() {
    var el = $("mp-player-name");
    return ((el && el.value) || "Oyuncu").slice(0, 16);
  }

  function renderPlayers() {
    var box = $("mp-player-list");
    var mp = M();
    if (!box) return;
    if (!mp || !mp.players) {
      box.innerHTML = '<div class="text-[11px] text-slate-500">—</div>';
      return;
    }
    var rows = Object.values(mp.players);
    if (!rows.length) {
      box.innerHTML = '<div class="text-[11px] text-slate-500">Oyuncu yok</div>';
      return;
    }
    box.innerHTML = rows.map(function (p) {
      var me = mp.peerId && p.id === mp.peerId;
      var hostMark = (p.id === mp.hostId || (mp.isHost && me)) ? "★ " : "";
      var nat = p.country || "—";
      try {
        if (GameState.countries && GameState.countries[p.country])
          nat = GameState.countries[p.country].name;
      } catch (e) {}
      return (
        '<div class="flex justify-between text-[11px] py-1 border-b border-slate-800 ' +
        (me ? "text-cyan-300 font-bold" : "") + '">' +
        "<span>" + hostMark + (p.name || "?") + (me ? " (sen)" : "") + "</span>" +
        '<span class="text-amber-400">' + nat + "</span></div>"
      );
    }).join("");
  }

  function showInRoomUI(isHost) {
    $("mp-room-info") && $("mp-room-info").classList.remove("hidden");
    $("mp-pre-room-btns") && $("mp-pre-room-btns").classList.add("hidden");
    $("mp-btn-leave") && $("mp-btn-leave").classList.remove("hidden");
    if (isHost) {
      $("mp-host-opts") && $("mp-host-opts").classList.remove("hidden");
      $("mp-start-btn") && $("mp-start-btn").classList.remove("hidden");
      setRole("Host — dünyayı sen başlatırsın");
    } else {
      $("mp-host-opts") && $("mp-host-opts").classList.add("hidden");
      $("mp-start-btn") && $("mp-start-btn").classList.add("hidden");
      setRole("Misafir — host başlatacak");
    }
  }

  function wireData(conn, asHost) {
    var mp = M();
    if (!mp || !conn) return;
    var id = conn.peer;
    mp.conns[id] = conn;

    conn.on("data", function (raw) {
      var msg = raw;
      try {
        if (typeof raw === "string") msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (!msg || !msg.t) return;
      console.log("[MP]", asHost ? "host←" : "client←", msg.t, msg);

      if (asHost) {
        if (msg.t === "join") {
          mp.players[id] = {
            id: id,
            name: String(msg.name || "Oyuncu").slice(0, 16),
            country: String(msg.country || "TUR").toUpperCase().slice(0, 5),
            ready: false,
            spectator: !!msg.spectator
          };
          toast((msg.name || "Oyuncu") + " katıldı (" + (msg.country || "?") + ")", "good");
          broadcast({ t: "players", players: mp.players });
          send(conn, {
            t: "welcome",
            hostId: mp.peerId,
            players: mp.players,
            roomCode: mp.roomCode,
            scenario: mp.scenario || "modern"
          });
          renderPlayers();
          setStatus("Host · " + Object.keys(mp.players).length + " oyuncu");
        } else if (msg.t === "countryPick" && mp.players[id]) {
          mp.players[id].country = String(msg.country || "").toUpperCase().slice(0, 5);
          broadcast({ t: "players", players: mp.players });
          renderPlayers();
        }
      } else {
        if (msg.t === "welcome") {
          mp.active = true;
          mp.isHost = false;
          mp.hostId = msg.hostId || id;
          mp.players = msg.players || {};
          mp.roomCode = msg.roomCode || mp.roomCode;
          mp.scenario = msg.scenario || mp.scenario;
          setCode(mp.roomCode);
          setStatus("Bağlandı · " + Object.keys(mp.players).length + " oyuncu");
          showInRoomUI(false);
          toast("Odaya girildi · " + Object.keys(mp.players).length + " oyuncu", "good");
          renderPlayers();
          if (window.__mpJoinOk) window.__mpJoinOk();
        } else if (msg.t === "players") {
          mp.players = msg.players || mp.players;
          setStatus("Bağlı · " + Object.keys(mp.players).length + " oyuncu");
          renderPlayers();
        } else if (msg.t === "start") {
          try {
            if (typeof window.mpBeginGame === "function") window.mpBeginGame(msg);
            else if (typeof mpBeginGame === "function") mpBeginGame(msg);
          } catch (e) {
            toast("Oyun başladı", "good");
          }
        }
      }
    });

    conn.on("close", function () {
      try {
        delete mp.conns[id];
        if (asHost && mp.players[id]) {
          var nm = mp.players[id].name;
          delete mp.players[id];
          broadcast({ t: "players", players: mp.players });
          toast(nm + " ayrıldı", "info");
          renderPlayers();
        } else if (!asHost) {
          toast("Host bağlantısı koptu", "bad");
          mp.active = false;
          setStatus("Koptu");
        }
      } catch (e) {}
    });
  }

  function send(conn, obj) {
    if (!conn) return;
    var raw = JSON.stringify(obj);
    try {
      if (conn.open) conn.send(raw);
      else conn.on("open", function () { try { conn.send(raw); } catch (e) {} });
    } catch (e) {
      try { conn.send(obj); } catch (e2) {}
    }
  }

  function broadcast(obj) {
    var mp = M();
    if (!mp) return;
    Object.keys(mp.conns || {}).forEach(function (id) {
      send(mp.conns[id], obj);
    });
  }

  // ---- CREATE: peer id = room code ----
  window.mpCreateRoom = async function () {
    var mp = M();
    if (!mp) {
      toast("MP yok — yenile", "bad");
      return;
    }
    try {
      if (typeof window.loadPeerJS === "function") await window.loadPeerJS();
    } catch (e) {
      toast("PeerJS yüklenemedi", "bad");
      return;
    }
    if (typeof Peer === "undefined") {
      toast("PeerJS yok", "bad");
      return;
    }

    try { if (mp.peer) mp.peer.destroy(); } catch (e) {}
    mp.conns = Object.create(null);
    mp.players = Object.create(null);
    mp.isHost = true;
    mp.active = false;
    mp.gameStarted = false;
    mp.name = pickName();
    mp.country = pickCountry();
    mp.scenario = ($("mp-scenario") && $("mp-scenario").value) || "modern";

    setStatus("Broker’a bağlanıyor…");
    setRole("Host");
    setCode("…");
    $("mp-room-info") && $("mp-room-info").classList.remove("hidden");
    toast("Oda açılıyor…", "info");

    var peer;
    try {
      peer = new Peer(undefined, peerOpts()); // let server assign ID
    } catch (e) {
      peer = new Peer();
    }
    mp.peer = peer;

    peer.on("error", function (err) {
      console.warn("[MP host]", err);
      setStatus("Hata: " + ((err && err.type) || "error"));
      toast("Host hata: " + ((err && err.type) || "error"), "bad");
    });

    peer.on("open", function (id) {
      mp.peerId = id;
      mp.hostId = id;
      mp.roomCode = id; // FULL peer id is the join code
      mp.active = true;
      mp.players[id] = {
        id: id,
        name: mp.name,
        country: mp.country,
        ready: true,
        spectator: false
      };
      setCode(id);
      setStatus("Açık — kodu paylaş");
      showInRoomUI(true);
      renderPlayers();
      toast("Oda hazır. Kodu kopyala ve gönder.", "good");
      // copy helper
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(id);
      } catch (e) {}
      console.log("[MP] HOST peer id / room code:", id);
    });

    peer.on("connection", function (conn) {
      console.log("[MP] incoming", conn.peer);
      // wire immediately + on open
      wireData(conn, true);
      conn.on("open", function () {
        wireData(conn, true);
        setStatus("Host · bağlantı +" + Object.keys(mp.conns).length);
      });
    });
  };

  // ---- JOIN: connect to exact peer id ----
  window.mpJoinRoom = async function (code) {
    code = String(code || "")
      .replace(/^.*#/, "")
      .replace(/^JOIN-/i, "")
      .trim();
    // Peer ids are lowercase alphanumeric; also accept upper
    var hostId = code.trim();
    if (hostId.length < 6) {
      toast("Kod çok kısa — host’taki tam kodu yapıştır", "bad");
      return;
    }

    var mp = M();
    if (!mp) {
      toast("MP yok", "bad");
      return;
    }
    try {
      if (typeof window.loadPeerJS === "function") await window.loadPeerJS();
    } catch (e) {
      toast("PeerJS yüklenemedi", "bad");
      return;
    }

    try { if (mp.peer) mp.peer.destroy(); } catch (e) {}
    mp.conns = Object.create(null);
    mp.players = Object.create(null);
    mp.isHost = false;
    mp.active = false;
    mp.gameStarted = false;
    mp.hostId = hostId;
    mp.roomCode = hostId;
    mp.name = pickName();
    mp.country = pickCountry();

    setCode(hostId);
    setRole("Misafir — bağlanıyor…");
    setStatus("Host’a bağlanılıyor…");
    $("mp-room-info") && $("mp-room-info").classList.remove("hidden");
    $("mp-pre-room-btns") && $("mp-pre-room-btns").classList.add("hidden");
    $("mp-btn-leave") && $("mp-btn-leave").classList.remove("hidden");
    $("mp-host-opts") && $("mp-host-opts").classList.add("hidden");
    toast("Bağlanıyor: " + hostId.slice(0, 12) + "…", "info");

    var welcomed = false;
    var peer;
    try {
      peer = new Peer(undefined, peerOpts());
    } catch (e) {
      peer = new Peer();
    }
    mp.peer = peer;

    var timeout = setTimeout(function () {
      if (welcomed) return;
      setStatus("Zaman aşımı — host yok veya kod yanlış");
      toast("Oda bulunamadı. Host kodu tam kopyaladı mı? Host sekmesi açık mı?", "bad");
      mp.active = false;
      $("mp-pre-room-btns") && $("mp-pre-room-btns").classList.remove("hidden");
    }, 16000);

    window.__mpJoinOk = function () {
      welcomed = true;
      clearTimeout(timeout);
    };

    peer.on("error", function (err) {
      console.warn("[MP join]", err);
      var typ = (err && err.type) || "error";
      setStatus("Hata: " + typ);
      if (typ === "peer-unavailable") {
        toast("Host çevrimdışı veya kod hatalı", "bad");
      } else {
        toast("Peer: " + typ, "bad");
      }
    });

    peer.on("open", function (id) {
      mp.peerId = id;
      setStatus("Connect → " + hostId.slice(0, 10) + "…");
      var conn = peer.connect(hostId, { reliable: true });
      wireData(conn, false);

      conn.on("open", function () {
        setStatus("Kanal açık — join…");
        mp.conns[hostId] = conn;
        send(conn, {
          t: "join",
          name: mp.name,
          country: mp.country,
          spectator: !!($("mp-spectator") && $("mp-spectator").checked)
        });
      });

      conn.on("error", function () {
        toast("Kanal hatası", "bad");
      });
    });
  };

  window.mpJoinRoomPrompt = function () {
    var code = null;
    try {
      code = prompt(
        "Host’taki TAM oda kodunu yapıştır\n(Peer ID — kısa 6 haneli eski kod değil):",
        (location.hash || "").replace(/^#/, "")
      );
    } catch (e) {}
    if (code) window.mpJoinRoom(code);
  };

  window.mpCopyCode = function () {
    var mp = M();
    var c = (mp && mp.roomCode) || ($("mp-room-code") && $("mp-room-code").textContent) || "";
    if (!c || c === "————") {
      toast("Kod yok", "bad");
      return;
    }
    try {
      navigator.clipboard.writeText(c);
      toast("Kod kopyalandı", "good");
    } catch (e) {
      try { prompt("Kodu kopyala:", c); } catch (e2) {}
    }
  };
  window.mpCopyRoomLink = window.mpCopyCode;

  // UI hint on lobby
  function hint() {
    var box = $("mp-open-rooms");
    if (!box) return;
    box.innerHTML =
      '<div class="text-[10px] text-slate-400 p-2 leading-relaxed">' +
      "<b>Nasıl:</b> Host oda kur → <b>tam kodu</b> kopyala → misafir yapıştır.<br>" +
      "Eski 6 haneli kod yok; kod = Peer kimliği (uzun).<br>" +
      "İkisi de internet + aynı sürüm; host sekmesi açık kalsın." +
      "</div>";
  }

  function boot() {
    hint();
    setInterval(function () {
      var mp = M();
      if (!mp || !mp.active) return;
      renderPlayers();
      if (mp.isHost) {
        setStatus("Host · " + Object.keys(mp.players || {}).length + " oyuncu · " + Object.keys(mp.conns || {}).length + " bağlantı");
      }
    }, 1200);
    console.log("[mp-peer-id] room code = real PeerJS id");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", function () {
    boot();
    // re-bind after other wrappers
    setTimeout(boot, 500);
  });
})();
