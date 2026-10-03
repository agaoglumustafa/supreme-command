
(function SCHoi4UI() {
  "use strict";
  console.log("%c[v1.8.1] SC UI theme · RELEASE", "color:#e8c547;font-size:15px;font-weight:bold");

  function enhanceTabs() {
    try {
      document.querySelectorAll("#left-panel .tab-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          document.querySelectorAll("#left-panel .tab-btn").forEach(function (b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
        });
      });
    } catch (e) {}
  }

  function markPack() {
    try {
      var p = window.MAP_PACK_ID || "1095";
      document.documentElement.classList.toggle("pack-europe", String(p).indexOf("Europe") === 0);
      document.body.setAttribute("data-pack", p);
    } catch (e) {}
  }

  function polishTopBar() {
    try {
      var tb = document.getElementById("top-bar");
      if (tb) tb.style.position = "relative";
    } catch (e) {}
  }

  function run() {
    enhanceTabs();
    markPack();
    polishTopBar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  setTimeout(run, 500);
  setTimeout(markPack, 2000);
  window.addEventListener("sc-ready", function () {
    run();
    setTimeout(markPack, 300);
  });
})();
