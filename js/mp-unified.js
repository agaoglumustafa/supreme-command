// ===== MP Unified v2 — short code + full Peer ID, retries, status =====
(function SCMPUnified() {
  "use strict";
  var CODE_MAP_KEY = "sc_mp_code_map_v2";
  var DIR_KEY = "sc_mp_open_rooms_v2";

  function M() {
    try { return GameState.mp; } catch (e) { return null; }
  }
  function toast(msg, kind) {
    try {
      if (typeof showToast === "function") showToast(String(msg).slice(0, 180), kind || "info");
    } catch (e) { console.log("[MP]", msg); }
  }
  function $(id) { return document.getElementById(id); }
  function peerOpts() {
    return {
      debug: 1,
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
  function shortCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 6; i++) s += chars[(Math.random() * chars.length) | 0];
    return s;
  }
  function saveMap(code, peerId, meta) {
    try {
      var map = JSON.parse(localStorage.getItem(CODE_MAP_KEY) || "{}");
      map[String(code).toUpperCase()] = Object.assign({ peerId: peerId, ts: Date.now() }, meta || {});
      // prune old
      var now = Date.now();
      Object.keys(map).forEach(function (k) {
        if (now - (map[k].ts || 0) > 6 * 3600 * 1000) delete map[k];
      });
      localStorage.setItem(CODE_MAP_KEY, JSON.stringify(map));
      if (typeof BroadcastChannel !== "undefined") {
        var bc = new BroadcastChannel("sc_mp_codes_v2");
        bc.postMessage({ code: String(code).toUpperCase(), peerId: peerId, meta: meta });
        setTimeout(function () { try { bc.close(); } catch (e) {} }, 400);
      }
    } catch (e) {}
  }
  function lookupCode(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    try {
      var map = JSON.parse(localStorage.getItem(CODE_MAP_KEY) || "{}");
      if (map[code] && map[code].peerId) return map[code].peerId;
    } catch (e) {}
    return null;
  }
  function announceOpen(code, peerId) {
    try {
      var list = JSON.parse(localStorage.getItem(DIR_KEY) || "[]");
      list = list.filter(function (r) { return r.peerId !== peerId && Date.now() - (r.ts || 0) < 3600000; });
      list.unshift({
        code: code,
        peerId: peerId,
        name: (M() && M().name) || "Host",
        scenario: (M() && M().scenario) || "modern",
        ts: Date.now()
      });
      localStorage.setItem(DIR_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (e) {}
  }
  function pickCountry() {
    var sel = $("mp-player-country");
    var v = (window.__mpUserPicked || window.__mpPickedCountry || (sel && sel.value) || "TUR").toUpperCase();
    window.__mpPickedCountry = v;
    return v.slice(0, 5);
  }
  function pickName() {
    var el = $("mp-player-name");
    return ((el && el.value) || "Oyuncu").slice(0, 16);
  }
  function setUI(code, role, status) {
    if ($("mp-room-code")) $("mp-room-code").textContent = code || "————";
    if ($("mp-role")) $("mp-role").textContent = role || "";
    if ($("mp-conn-status")) $("mp-conn-status").textContent = status || "";
    $("mp-room-info") && $("mp-room-info").classList.remove("hidden");
    // show peer id helper
    var help = $("mp-peer-help");
    if (!help && $("mp-room-info")) {
      help = document.createElement("div");
      help.id = "mp-peer-help";
      help.className = "text-[10px] text-slate-500 mt-1 break-all";
      $("mp-room-info").appendChild(help);
    }
    if (help) {
      var mp = M();
      help.textContent = mp && mp.peerId ? ("Peer ID: " + mp.peerId + " · kısa kod aynı ağ/sekmede, uzakta Peer ID kullan") : "";
    }
  }
  function renderPlayers() {
    var box = $("mp-player-list");
    var mp = M();
    if (!box || !mp) return;
    var rows = Object.values(mp.players || {});
    box.innerHTML = rows.length
      ? rows.map(function (p) {
          var me = p.id === mp.peerId;
          return (
            '<div class="flex justify-between text-[11px] py-1 ' + (me ? "text-cyan-300" : "") + '">' +
            "<span>" + (p.name || "?") + (me ? " (sen)" : "") + "</span>" +
            '<span class="text-amber-400">' + (p.country || "—") + "</span></div>"
          );
        }).join("")
      : '<div class="text-[11px] text-slate-500">—</div>';
  }
  function send(conn, obj) {
    if (!conn) return;
    try {
      var raw = JSON.stringify(obj);
      if (conn.open) conn.send(raw);
      else conn.on("open", function () { try { conn.send(raw); } catch (e) {} });
    } catch (e) {}
  }
  function broadcast(obj) {
    var mp = M();
    if (!mp) return;
    Object.keys(mp.conns || {}).forEach(function (id) { send(mp.conns[id], obj); });
  }
  window.mpBroadcast = broadcast;

  function wire(conn, asHost) {
    var mp = M();
    if (!mp || !conn) return;
    var id = conn.peer;
    mp.conns[id] = conn;
    conn.on("data", function (raw) {
      var msg = raw;
      try { if (typeof raw === "string") msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || !msg.t) return;
      if (asHost) {
        if (msg.t === "join") {
          mp.players[id] = {
            id: id,
            name: String(msg.name || "Oyuncu").slice(0, 16),
            country: String(msg.country || "TUR").toUpperCase().slice(0, 5)
          };
          toast((msg.name || "Oyuncu") + " katıldı · " + (msg.country || ""), "good");
          broadcast({ t: "players", players: mp.players });
          send(conn, {
            t: "welcome",
            hostId: mp.peerId,
            players: mp.players,
            roomCode: mp.roomCode,
            scenario: mp.scenario || "modern"
          });
          renderPlayers();
        } else if (msg.t === "ping") {
          send(conn, { t: "pong", ts: Date.now() });
        } else if (msg.t === "eventChoice") {
          broadcast({ t: "logline", text: "📜 " + (msg.title || "Olay") + " → " + (msg.choice || ""), cls: "text-amber-400" });
        }
      } else {
        if (msg.t === "welcome") {
          mp.active = true;
          mp.isHost = false;
          mp.players = msg.players || {};
          mp.roomCode = msg.roomCode || mp.roomCode;
          setUI(mp.roomCode, "Misafir", "Bağlandı · " + Object.keys(mp.players).length + " oyuncu");
          $("mp-host-opts") && $("mp-host-opts").classList.add("hidden");
          $("mp-start-btn") && $("mp-start-btn").classList.add("hidden");
          toast("Odaya girildi", "good");
          renderPlayers();
          if (window.__mpJoinOk) window.__mpJoinOk();
        } else if (msg.t === "players") {
          mp.players = msg.players || {};
          renderPlayers();
        } else if (msg.t === "start") {
          try { if (typeof window.mpBeginGame === "function") window.mpBeginGame(msg); } catch (e) {}
        } else if (msg.t === "event" && msg.ev && typeof showEventModal === "function") {
          msg.ev._fromHost = true;
          showEventModal(msg.ev);
        } else if (msg.t === "logline" && typeof log === "function") {
          log(msg.text || "", msg.cls || "text-slate-400");
        } else if (msg.t === "sync" && typeof window.applySyncPayload === "function") {
          window.applySyncPayload(msg);
        }
      }
    });
    conn.on("close", function () {
      try { delete mp.conns[id]; } catch (e) {}
      if (asHost && mp.players[id]) {
        delete mp.players[id];
        broadcast({ t: "players", players: mp.players });
        renderPlayers();
        toast("Bir oyuncu ayrıldı", "warn");
      }
    });
  }

  window.mpCreateRoom = async function () {
    var mp = M();
    if (!mp) return toast("MP yok", "bad");
    try { if (typeof loadPeerJS === "function") await loadPeerJS(); } catch (e) { return toast("PeerJS yok", "bad"); }
    try { if (mp.peer) mp.peer.destroy(); } catch (e) {}
    mp.conns = {};
    mp.players = {};
    mp.isHost = true;
    mp.active = false;
    mp.country = pickCountry();
    mp.name = pickName();
    mp.scenario = ($("mp-scenario") && $("mp-scenario").value) || "modern";
    var code = shortCode();
    mp.roomCode = code;
    setUI(code, "Host", "Bağlanıyor…");
    $("mp-pre-room-btns") && $("mp-pre-room-btns").classList.add("hidden");
    $("mp-btn-leave") && $("mp-btn-leave").classList.remove("hidden");
    $("mp-host-opts") && $("mp-host-opts").classList.remove("hidden");
    $("mp-start-btn") && $("mp-start-btn").classList.remove("hidden");
    toast("Oda " + code + " açılıyor…", "info");

    var peer = new Peer(undefined, peerOpts());
    mp.peer = peer;
    peer.on("error", function (err) {
      toast("Host hata: " + ((err && err.type) || "error"), "bad");
    });
    peer.on("open", function (id) {
      mp.peerId = id;
      mp.hostId = id;
      mp.active = true;
      mp.players[id] = { id: id, name: mp.name, country: mp.country };
      saveMap(code, id, { name: mp.name, scenario: mp.scenario });
      saveMap(id, id);
      announceOpen(code, id);
      setUI(code, "Host — dünyayı sen başlatırsın", "Açık · kod: " + code);
      renderPlayers();
      try { navigator.clipboard.writeText(code); } catch (e) {}
      toast("Kod: " + code + " (kopyalandı). Uzak arkadaş için Peer ID de paylaş.", "good");
    });
    peer.on("connection", function (conn) {
      wire(conn, true);
      conn.on("open", function () { wire(conn, true); });
    });
  };

  window.mpJoinRoom = async function (code) {
    code = String(code || "").replace(/^.*#/, "").trim();
    if (code.length < 4) return toast("Kod geçersiz", "bad");
    var mp = M();
    if (!mp) return toast("MP yok", "bad");
    try { if (typeof loadPeerJS === "function") await loadPeerJS(); } catch (e) { return toast("PeerJS yok", "bad"); }
    try { if (mp.peer) mp.peer.destroy(); } catch (e) {}
    mp.conns = {};
    mp.players = {};
    mp.isHost = false;
    mp.active = false;
    mp.country = pickCountry();
    mp.name = pickName();
    mp.roomCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "") || code;

    var hostId = lookupCode(mp.roomCode) || lookupCode(code) || code;
    // if still short and not found, try open dir
    if (hostId.length <= 8) {
      try {
        var list = JSON.parse(localStorage.getItem(DIR_KEY) || "[]");
        var hit = list.find(function (r) { return r.code === mp.roomCode; });
        if (hit) hostId = hit.peerId;
      } catch (e) {}
    }
    setUI(mp.roomCode, "Misafir", "Host aranıyor…");
    $("mp-pre-room-btns") && $("mp-pre-room-btns").classList.add("hidden");
    $("mp-host-opts") && $("mp-host-opts").classList.add("hidden");
    toast("Katılınıyor → " + hostId.slice(0, 12) + (hostId.length > 12 ? "…" : ""), "info");

    var welcomed = false;
    var attempt = 0;
    function tryConnect(peer) {
      attempt++;
      var conn = peer.connect(hostId, { reliable: true });
      wire(conn, false);
      conn.on("open", function () {
        mp.conns[hostId] = conn;
        send(conn, { t: "join", name: mp.name, country: mp.country });
      });
      conn.on("error", function () {
        if (attempt < 3 && !welcomed) setTimeout(function () { tryConnect(peer); }, 1500);
      });
    }
    var tOut = setTimeout(function () {
      if (!welcomed)
        toast("Oda yok. Host açık mı? Aynı PC: kısa kod · internet: host Peer ID yapıştır.", "bad");
    }, 16000);
    window.__mpJoinOk = function () { welcomed = true; clearTimeout(tOut); };

    var peer = new Peer(undefined, peerOpts());
    mp.peer = peer;
    peer.on("error", function (err) { toast("Hata: " + ((err && err.type) || "error"), "bad"); });
    peer.on("open", function (id) {
      mp.peerId = id;
      tryConnect(peer);
    });
  };

  window.mpJoinRoomPrompt = function () {
    var c = prompt("Oda kodu (6 hane) veya host Peer ID:", (location.hash || "").replace(/^#/, ""));
    if (c) window.mpJoinRoom(c);
  };
  window.mpCopyCode = function () {
    var mp = M();
    var c = (mp && (mp.roomCode || mp.peerId)) || "";
    try { navigator.clipboard.writeText(c); toast("Kopyalandı: " + c, "good"); }
    catch (e) { prompt("Kod:", c); }
  };
  window.mpCopyRoomLink = window.mpCopyCode;
  window.mpCopyPeerId = function () {
    var mp = M();
    var c = (mp && mp.peerId) || "";
    try { navigator.clipboard.writeText(c); toast("Peer ID kopyalandı", "good"); }
    catch (e) { prompt("Peer ID:", c); }
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      var bc = new BroadcastChannel("sc_mp_codes_v2");
      bc.onmessage = function (ev) {
        if (ev.data && ev.data.code && ev.data.peerId)
          saveMap(ev.data.code, ev.data.peerId, ev.data.meta);
      };
    }
  } catch (e) {}

  console.log("[mp-unified] v2 short code + peer id + retries");
})();
