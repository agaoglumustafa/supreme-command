// Supreme Command — UI boot: open panels on game enter & MP room enter
(function SCUIBoot() {
  "use strict";

  function $(id) { return document.getElementById(id); }

  window.scOpenSidebar = function () {
    try {
      document.body.classList.remove("sidebar-kapali");
      var edge = $("sidebar-edge-btn");
      if (edge) edge.textContent = "◀";
      var lp = $("left-panel");
      if (lp) {
        lp.style.setProperty("display", "flex", "important");
        lp.style.setProperty("visibility", "visible", "important");
        lp.style.opacity = "1";
      }
    } catch (e) {}
  };

  window.scOpenGameUI = function () {
    try {
      // menus off
      ["main-menu-screen", "lobby-screen", "credits-modal"].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.classList.add("hidden");
        el.style.setProperty("display", "none", "important");
      });
      // shell on
      var root = $("game-root");
      if (root) {
        root.style.setProperty("display", "flex", "important");
        root.style.visibility = "visible";
        root.style.opacity = "1";
      }
      var top = $("top-bar");
      if (top) {
        top.style.setProperty("display", "flex", "important");
        top.style.visibility = "visible";
      }
      var mc = $("map-container");
      if (mc) {
        mc.style.visibility = "visible";
        mc.style.opacity = "1";
      }
      scOpenSidebar();
      // default tab sections
      if (typeof window.switchTab === "function") {
        try { window.switchTab("dashboard"); } catch (e) {}
      } else {
        ["dashboard", "production", "military", "economy", "focus", "research", "diplomacy", "province"].forEach(function (t) {
          var el = $("content-" + t);
          if (el) el.classList.add("hidden");
        });
        var dash = $("content-dashboard");
        if (dash) dash.classList.remove("hidden");
      }
      var logp = $("log-panel");
      if (logp) logp.classList.remove("hidden");
      document.body.classList.add("sc-ingame");
    } catch (e) {
      console.warn("[ui-boot] open game", e);
    }
  };

  window.scOpenRoomUI = function () {
    try {
      var modal = $("mp-lobby-modal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.style.setProperty("display", "flex", "important");
        modal.style.visibility = "visible";
      }
      var roomInfo = $("mp-room-info");
      if (roomInfo) roomInfo.classList.remove("hidden");
      var leave = $("mp-btn-leave");
      if (leave) leave.classList.remove("hidden");
      var pre = $("mp-pre-room-btns");
      if (pre) pre.classList.add("hidden");
      // host opts if host
      try {
        var MP = window.MP || (window.GameState && window.GameState.mp);
        if (MP && MP.isHost) {
          $("mp-host-opts") && $("mp-host-opts").classList.remove("hidden");
          $("mp-start-btn") && $("mp-start-btn").classList.remove("hidden");
        }
      } catch (e) {}
      // player list / chat areas
      ["mp-player-list", "mp-chat-log", "mp-room-settings", "mp-sup-panel"].forEach(function (id) {
        var el = $(id);
        if (el) {
          el.classList.remove("hidden");
          el.style.visibility = "visible";
        }
      });
    } catch (e) {
      console.warn("[ui-boot] open room", e);
    }
  };

  // Wrap startGame when available
  function hookStart() {
    var prev = window.startGame;
    if (typeof prev !== "function" || prev._uiBootHooked) return false;
    window.startGame = async function () {
      var r;
      try { r = await prev.apply(this, arguments); } catch (e) { console.error(e); }
      try { scOpenGameUI(); } catch (e) {}
      // keep open a few seconds (fight other handlers)
      var i = 0;
      var iv = setInterval(function () {
        scOpenGameUI();
        if (++i > 12) clearInterval(iv);
      }, 250);
      return r;
    };
    window.startGame._uiBootHooked = true;
    return true;
  }

  function hookRoom() {
    var prev = window.mpSetLobbyInRoom;
    if (typeof prev !== "function" || prev._uiBootHooked) {
      // still provide polling path
      return typeof prev === "function" && prev._uiBootHooked;
    }
    window.mpSetLobbyInRoom = function (inRoom) {
      var r = prev.apply(this, arguments);
      if (inRoom) {
        try { scOpenRoomUI(); } catch (e) {}
      }
      return r;
    };
    window.mpSetLobbyInRoom._uiBootHooked = true;
    return true;
  }

  function hookMpStart() {
    ["mpHostStart", "mpHostStartSupremacy"].forEach(function (name) {
      var prev = window[name];
      if (typeof prev !== "function" || prev._uiBootHooked) return;
      window[name] = function () {
        var r = prev.apply(this, arguments);
        try { scOpenGameUI(); } catch (e) {}
        return r;
      };
      window[name]._uiBootHooked = true;
    });
  }

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    hookStart();
    hookRoom();
    hookMpStart();
    if (tries > 60) clearInterval(iv);
  }, 200);

  // When body becomes sc-ingame, ensure panels
  setInterval(function () {
    try {
      if (document.body.classList.contains("sc-ingame") || (window.GameState && GameState.running)) {
        var lp = $("left-panel");
        if (lp && document.body.classList.contains("sidebar-kapali")) {
          // keep user preference if they closed it — only force open once per session
          if (!window._scSidebarForced) {
            window._scSidebarForced = true;
            scOpenSidebar();
          }
        }
      }
    } catch (e) {}
  }, 2000);

  console.log("[ui-boot] game/room panel openers ready");
})();
