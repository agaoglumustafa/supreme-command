// Senaryoya göre isim ofseti + ad + renk
(function SCScenarioNames() {
  "use strict";

  function applyLayout(sc) {
    if (!sc) return;
    try {
      var off = sc.nameOffsets || {};
      var ov = sc.nameOverrides || sc.countryNames || {};
      GameState.nameOffsets = Object.assign({}, off);
      GameState.nameOverrides = Object.assign({}, ov);
      window.__SC_NAME_OFFSETS = GameState.nameOffsets;
      window.__SC_NAME_OVERRIDES = GameState.nameOverrides;

      if (GameState.countries) {
        Object.keys(GameState.countries).forEach(function (iso) {
          var c = GameState.countries[iso];
          if (!c) return;
          if (!c._baseName) c._baseName = c.name;
          if (sc.countryNames && sc.countryNames[iso]) c.name = sc.countryNames[iso];
          else if (ov[iso]) c.name = ov[iso];
          else if (c._baseName) c.name = c._baseName;
          if (sc.countryColors && sc.countryColors[iso]) {
            c.color = sc.countryColors[iso];
          }
        });
      }
      if (typeof refreshMapColors === "function") refreshMapColors();
      if (typeof scRefreshCountryNames === "function") scRefreshCountryNames(true);
      if (typeof updateHUD === "function") updateHUD();
    } catch (e) {
      console.warn("[scenario-names]", e);
    }
  }

  window.scApplyScenarioNameLayout = applyLayout;

  // Hook applyScenario / applyScenarioToGameState
  function hook() {
    var prev = window.applyScenarioToGameState;
    if (typeof prev === "function" && !prev._nameLayout) {
      window.applyScenarioToGameState = function (id) {
        var sc = prev.apply(this, arguments);
        try {
          var pack = window.SCENARIOS || {};
          applyLayout(sc || pack[id]);
        } catch (e) {}
        return sc;
      };
      window.applyScenarioToGameState._nameLayout = true;
    }
    var prev2 = window.applyScenario;
    if (typeof prev2 === "function" && !prev2._nameLayout) {
      window.applyScenario = function (id) {
        var sc = prev2.apply(this, arguments);
        try {
          var pack = window.SCENARIOS || {};
          applyLayout(sc || pack[id]);
        } catch (e) {}
        return sc;
      };
      window.applyScenario._nameLayout = true;
    }
    var prev3 = window.applyCountryNamesForScenario;
    if (typeof prev3 === "function" && !prev3._nameLayout) {
      window.applyCountryNamesForScenario = function (sc) {
        prev3.apply(this, arguments);
        applyLayout(sc);
      };
      window.applyCountryNamesForScenario._nameLayout = true;
    }
  }

  hook();
  setTimeout(hook, 500);
  setTimeout(hook, 2000);
  window.addEventListener("sc-ready", function () {
    hook();
    try {
      var id = GameState.scenarioId || "modern";
      var sc = (window.SCENARIOS || {})[id];
      if (sc) applyLayout(sc);
    } catch (e) {}
  });

  // name-editor export should save into current scenario key when possible
  var prevExport = window.scExportNameLayout;
  console.log("[scenario-names] per-scenario offsets · names · colors");
})();
