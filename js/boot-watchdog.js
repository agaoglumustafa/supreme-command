
(function SCBootWatchdog() {
  "use strict";
  console.log("[boot-watchdog] güvenli boot · menüye zorlamaz");

  function inGame() {
    try {
      if (document.body && document.body.classList.contains("sc-ingame")) return true;
      if (window.GameState && GameState.running) return true;
    } catch (e) {}
    return false;
  }

  function lobbyOpen() {
    var lb = document.getElementById("lobby-screen");
    if (!lb) return false;
    if (lb.classList.contains("hidden")) return false;
    var d = window.getComputedStyle(lb).display;
    return d !== "none";
  }

  // Only ensure menu exists on first paint if nothing else is up
  function softMenuOnce() {
    if (inGame() || lobbyOpen()) return;
    var mm = document.getElementById("main-menu-screen");
    if (!mm) return;
    // do not set style.display = flex if already managed by mods
    try {
      mm.classList.remove("hidden");
    } catch (e) {}
  }

  softMenuOnce();
  setTimeout(softMenuOnce, 400);

  // Stop reload thrash
  try {
    var n = parseInt(sessionStorage.getItem("sc_boot_reloads") || "0", 10) || 0;
    var last = parseInt(sessionStorage.getItem("sc_boot_last") || "0", 10) || 0;
    var now = Date.now();
    if (now - last < 4000) n++; else n = 0;
    sessionStorage.setItem("sc_boot_reloads", String(n));
    sessionStorage.setItem("sc_boot_last", String(now));
    if (n >= 4) {
      var u = new URL(location.href);
      u.searchParams.delete("_t");
      sessionStorage.setItem("sc_boot_reloads", "0");
      history.replaceState(null, "", u.toString());
    }
  } catch (e) {}
})();
