// Performans: gereksiz tekrarları kıs
(function SCPerfTrim() {
  "use strict";
  // throttle applyCapitalsAndIdentity
  if (typeof window.applyCapitalsAndIdentity === "function") {
    var prev = window.applyCapitalsAndIdentity;
    var last = 0;
    window.applyCapitalsAndIdentity = function () {
      var n = Date.now();
      if (n - last < 2000) return last;
      last = n;
      return prev.apply(this, arguments);
    };
  }
  // mute noisy console.log from version banners (optional soft)
  var clog = console.log;
  console.log = function () {
    try {
      var s = arguments[0];
      if (typeof s === "string" && (/^V\d+|^\s*\[v1|Engineered|SUPREME COMMAND Grand|modules loaded/i.test(s) || s.indexOf("V2") === 0))
        return;
    } catch (e) {}
    return clog.apply(console, arguments);
  };
  console.log("[perf-trim] capitals throttle · log quiet");
})();
