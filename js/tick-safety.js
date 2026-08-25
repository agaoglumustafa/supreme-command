
(function () {
  "use strict";
  window.campaignStage = window.campaignStage || function () {};
  window.dayKeyOf = window.dayKeyOf || function (g) {
    try {
      if (!g || !g.date) return 0;
      var d = g.date instanceof Date ? g.date : new Date(g.date);
      if (isNaN(d.getTime())) return 0;
      return (d.getFullYear() * 10000) + ((d.getMonth() + 1) * 100) + d.getDate();
    } catch (e) { return 0; }
  };
  console.log("[tick-safety] campaignStage/dayKeyOf stubs");
})();
