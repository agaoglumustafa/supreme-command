// ===== Stability Fix — permanent strip + anti-blink =====
(function SCStabilityFix() {
  "use strict";

  function nuke(id) {
    try {
      var el = document.getElementById(id);
      if (el) el.remove();
    } catch (e) {}
  }

  function stripDeadUI() {
    [
      "sc-cmd-dock",
      "sc-atmo-dock",
      "sc-viral-hud",
      "sc-camp-hud",
      "sc-hour-missions",
      "sc-tl-modal",
      "sc-ws-modal",
      "sc-camp-modal",
      "sc-form-modal",
      "mm-campaigns",
      "mm-workshop",
      "sc-army-layer"
    ].forEach(nuke);
    // clear army layer children if recreated as group
    try {
      var army = document.getElementById("sc-army-layer");
      if (army) while (army.firstChild) army.removeChild(army.firstChild);
    } catch (e) {}
  }

  // Permanent no-ops for removed systems
  window.scOpenTimelapse = function () {};
  window.scOpenWorkshop = function () {};
  window.scOpenCampaigns = function () {};
  window.scSendUltimatum = function () {};
  window.openTimelapse = function () {};
  window.openWorkshop = function () {};

  // Prevent opacity flicker on province paths from competing paints
  try {
    var st = document.createElement("style");
    st.id = "sc-stability-css";
    st.textContent = [
      "body.sc-low-gfx #sc-country-names{opacity:0.55;}",
      "body.sc-low-gfx .capital-marker{display:none!important;}",
      "body.sc-low-gfx path.country-path{stroke-width:0.02!important;}",

      "#sc-cmd-dock,#sc-atmo-dock,#sc-viral-hud,#sc-camp-hud,#sc-hour-missions{display:none!important;}",
      "#game-map path.country-path{opacity:1!important;}",
      "#sc-country-names{pointer-events:none;}"
    ].join("");
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  function boot() {
    stripDeadUI();
    setTimeout(stripDeadUI, 1000);
    setTimeout(stripDeadUI, 3000);
    // rare cleanup only
    setInterval(stripDeadUI, 15000);
    console.log("[stability] dead UI stripped · paint opacity locked");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("sc-ready", function () {
    stripDeadUI();
  });
})();
