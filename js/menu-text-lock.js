
(function SCMenuTextLock() {
  "use strict";
  var VERSION = "v1.8.7 · Dünya / Avrupa haritası";
  var SUBTITLE = "Büyük strateji · İşgal · Barış masası · Çok oyunculu";
  var TAGLINE = "Tarayıcıda büyük strateji";

  function apply() {
    try {
      document.querySelectorAll("[data-i18n='mm_version']").forEach(function (el) {
        el.textContent = VERSION;
      });
      var menu = document.getElementById("main-menu-screen");
      if (!menu) return;
      var sub = menu.querySelector(".sc-menu-sub");
      if (sub) sub.textContent = TAGLINE;
      menu.querySelectorAll("p").forEach(function (p) {
        var t = (p.textContent || "").trim();
        if (/1095 eyalet|ilhaktan önce|occupation before|senaryo tarihi|provinces ·/.test(t) ||
            (p.className && p.className.indexOf("text-[11px]") >= 0)) {
          p.textContent = SUBTITLE;
        }
      });
    } catch (e) {}
  }

  // Only apply a few times — NO MutationObserver (tuşları bozuyordu)
  apply();
  setTimeout(apply, 500);
  setTimeout(apply, 2000);
  console.log("[menu-lock] metin sabit · observer yok");
})();
