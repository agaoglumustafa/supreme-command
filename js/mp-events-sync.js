// ===== MP Events → all members (not only host) =====
(function SCMPEventsSync() {
  "use strict";

  function active() {
    try {
      return !!(GameState.mp && GameState.mp.active);
    } catch (e) {
      return false;
    }
  }
  function isHost() {
    try {
      return !!(GameState.mp && GameState.mp.isHost);
    } catch (e) {
      return false;
    }
  }
  function broadcast(obj) {
    try {
      if (typeof window.broadcast === "function") {
        window.broadcast(obj);
        return;
      }
    } catch (e) {}
    // fallback via MP.conns
    try {
      var mp = GameState.mp;
      if (!mp || !mp.conns) return;
      var raw = JSON.stringify(obj);
      Object.keys(mp.conns).forEach(function (id) {
        var c = mp.conns[id];
        if (!c) return;
        try {
          if (c.open) c.send(raw);
        } catch (e) {}
      });
    } catch (e) {}
  }
  function sendToHost(obj) {
    try {
      if (typeof window.sendToHost === "function") {
        window.sendToHost(obj);
        return;
      }
    } catch (e) {}
    try {
      var mp = GameState.mp;
      if (!mp || mp.isHost) return;
      var c = mp.conns[mp.hostId] || Object.values(mp.conns || {})[0];
      if (c && c.open) c.send(JSON.stringify(obj));
    } catch (e) {}
  }

  // Serialize event (strip functions)
  function slimEvent(ev) {
    if (!ev) return null;
    return {
      id: ev.id || "ev_" + Date.now(),
      title: ev.title || "Olay",
      text: ev.text || ev.desc || "",
      choices: (ev.choices || []).map(function (c, i) {
        return {
          label: c.label || c.text || "Seçenek " + (i + 1),
          // effects stay host-side; clients see labels only
          _idx: i
        };
      }),
      _historical: !!ev._historical,
      _fromHost: true,
      priority: ev.priority || 0
    };
  }

  function patchShowEventModal() {
    var prev = window.showEventModal;
    if (typeof prev !== "function" || prev._mpEvents) return;
    window.showEventModal = function (ev) {
      // Always show locally
      var result = prev.apply(this, arguments);
      try {
        if (active() && isHost() && ev && !ev._fromHost) {
          var slim = slimEvent(ev);
          broadcast({ t: "event", ev: slim });
        }
      } catch (e) {
        console.warn("[mp-events]", e);
      }
      return result;
    };
    window.showEventModal._mpEvents = true;
  }

  function patchResolve() {
    var prev = window.resolveEventChoice;
    if (typeof prev !== "function" || prev._mpEvents) return;
    window.resolveEventChoice = function (evId, idx) {
      var pend = GameState._pendingEvent;
      var title = pend && pend.title;
      var choiceLabel =
        pend && pend.choices && pend.choices[idx] && (pend.choices[idx].label || pend.choices[idx].text);
      // If client received event from host, don't run host economy effects twice — only UI
      if (pend && pend._fromHost && active() && !isHost()) {
        try {
          if (window._eventAutoTimer) {
            clearTimeout(window._eventAutoTimer);
            window._eventAutoTimer = null;
          }
          document.getElementById("event-modal")?.remove();
          GameState._pendingEvent = null;
          if (typeof log === "function")
            log("📜 Olay kararı: " + (title || evId) + " → " + (choiceLabel || idx), "text-amber-400");
          sendToHost({
            t: "eventChoice",
            id: evId,
            idx: idx,
            title: title || evId,
            choice: choiceLabel || String(idx)
          });
          if (typeof showToast === "function") showToast("Karar iletildi: " + (choiceLabel || ""), "info");
          return;
        } catch (e) {}
      }
      var r = prev.apply(this, arguments);
      // Host shares decision log
      try {
        if (active() && isHost()) {
          broadcast({
            t: "logline",
            text: "📜 Olay: " + (title || evId) + " → " + (choiceLabel || idx),
            cls: "text-amber-400",
            toast: false
          });
        }
      } catch (e) {}
      return r;
    };
    window.resolveEventChoice._mpEvents = true;
  }

  function patchLog() {
    var prev = window.log;
    if (typeof prev !== "function" || prev._mpEvents) return;
    window.log = function (msg, typeClass) {
      var r = prev.apply(this, arguments);
      try {
        if (!active() || !isHost()) return r;
        var s = String(msg || "");
        // only meaningful lines to clients (avoid spam)
        if (
          s.indexOf("📜") >= 0 ||
          s.indexOf("SAVAŞ") >= 0 ||
          s.indexOf("savaş") >= 0 ||
          s.indexOf("Barış") >= 0 ||
          s.indexOf("barış") >= 0 ||
          s.indexOf("ODA") >= 0 ||
          s.indexOf("işgal") >= 0 ||
          s.indexOf("İşgal") >= 0 ||
          s.indexOf("GÖREV") >= 0 ||
          s.indexOf("Olay") >= 0 ||
          s.indexOf("ULT") >= 0 ||
          s.indexOf("diplomasi") >= 0 ||
          s.indexOf("Diplomasi") >= 0 ||
          (typeClass && String(typeClass).indexOf("amber") >= 0) ||
          (typeClass && String(typeClass).indexOf("red") >= 0) ||
          (typeClass && String(typeClass).indexOf("emerald") >= 0)
        ) {
          // throttle
          var now = Date.now();
          if (!window._mpLogLast) window._mpLogLast = 0;
          if (now - window._mpLogLast < 400) return r;
          window._mpLogLast = now;
          broadcast({ t: "logline", text: s.slice(0, 200), cls: typeClass || "text-slate-400" });
        }
      } catch (e) {}
      return r;
    };
    window.log._mpEvents = true;
  }

  // Also ensure client handler if part3 path missed (peer-id path)
  window.__scOnClientMsg = function (msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "event" && msg.ev) {
      try {
        msg.ev._fromHost = true;
        if (typeof window.showEventModal === "function") window.showEventModal(msg.ev);
      } catch (e) {}
    } else if (msg.t === "logline") {
      try {
        if (typeof log === "function") log(msg.text || "", msg.cls || "text-slate-400");
      } catch (e) {}
    } else if (msg.t === "news" && msg.entry) {
      try {
        GameState.mpNews = GameState.mpNews || [];
        GameState.mpNews.unshift(msg.entry);
        if (typeof showToast === "function") showToast(msg.entry.text, "info");
      } catch (e) {}
    }
  };

  // Export broadcast for host modules
  if (typeof window.broadcast !== "function") {
    // try capture from GameState later
  }

  function boot() {
    patchShowEventModal();
    patchResolve();
    patchLog();
    // re-patch after other scripts
    setTimeout(patchShowEventModal, 1500);
    setTimeout(patchResolve, 1500);
    setTimeout(patchLog, 1500);
    setTimeout(patchShowEventModal, 4000);
    console.log("[mp-events-sync] host events → all members");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", boot);
})();
