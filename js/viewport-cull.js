
(function SCViewportCull() {
  "use strict";
  // v1.8.5: NO detach — tüm eyaletler DOM'da kalsın.
  // Sadece görünür alanın renk güncellemesi (opsiyonel throttle).
  var state = { enabled: false, provinces: null };

  function packIsLarge() {
    var id = window.MAP_PACK_ID || "";
    return id.indexOf("Europe") === 0;
  }

  window.scCullEnable = function (provinces) {
    state.provinces = provinces || state.provinces;
    state.enabled = false; // detach kapalı
    try {
      console.log("[cull] detach kapalı · tüm eyaletler çizili · " + ((state.provinces && state.provinces.length) || 0));
    } catch (e) {}
  };

  window.scCullRefresh = function () {
    // no-op: paths stay; colors handled by refreshMapColors
  };

  // Compatibility: if something calls enable for 3728, just log
  window.scCullOnPackLoad = function (provs) {
    window.scCullEnable(provs);
  };

  console.log("[cull] v1.8.5 full-map mode (no viewport detach)");
})();
