
/**
 * v1.9.13 — AoH3 modern renkler (düzeltilmiş)
 * ABD mor, Kanada turuncu-kırmızı, Rusya mavi, Çin kırmızı, vb.
 */
(function SCAoh3ColorsFix() {
  "use strict";
  var AOH3 = {"USA": "#302B84", "CAN": "#B52C04", "MEX": "#006848", "GTM": "#1A7A4A", "BLZ": "#2A8B5A", "HND": "#1E7A48", "SLV": "#228B50", "NIC": "#1A7040", "CRI": "#3A6B9B", "PAN": "#7B2A8B", "CUB": "#9D3CF9", "DOM": "#3B7BC0", "HTI": "#2A4A7A", "JAM": "#8473CF", "TTO": "#3F7ABC", "BHS": "#006847", "COL": "#D6C509", "VEN": "#3B8ED0", "GUY": "#3F7ABC", "SUR": "#3F7ABC", "GUF": "#3D6B9B", "BRA": "#009B3A", "ARG": "#74ACDF", "CHL": "#3B7BC0", "PER": "#D01020", "BOL": "#4A4E50", "PRY": "#5A4A6A", "URY": "#74ACDF", "ECU": "#C9A020", "GBR": "#0F45DF", "IRL": "#1A8B4A", "FRA": "#1A2A9B", "ESP": "#0A5028", "PRT": "#0A5028", "DEU": "#009246", "ITA": "#768E11", "CHE": "#C43030", "AUT": "#8B6B4A", "BEL": "#C9A020", "NLD": "#E07A30", "LUX": "#4A9BC8", "DNK": "#C43040", "SWE": "#E6642A", "NOR": "#992141", "FIN": "#DD5759", "ISL": "#5A7A9B", "POL": "#00966E", "CZE": "#4A8B9B", "SVK": "#3A7A9B", "HUN": "#C07020", "ROU": "#C9A020", "BGR": "#4A8B6A", "GRC": "#3B9BC8", "TUR": "#C82820", "UKR": "#E30A17", "BLR": "#6B9B4A", "MDA": "#C9A040", "LTU": "#6B9B30", "LVA": "#9B2040", "EST": "#4A9BC8", "SRB": "#C05070", "HRV": "#3B7BC0", "BIH": "#5A8B9B", "SVN": "#3B9BC8", "ALB": "#8B1A1A", "MKD": "#A06020", "MNE": "#C9A040", "XKX": "#C9A040", "KOS": "#C9A040", "RKS": "#C9A040", "CYP": "#E8B84A", "MLT": "#C43030", "RUS": "#1627A6", "GEO": "#E07030", "ARM": "#9B3A5A", "AZE": "#2D9B6A", "ABK": "#E07030", "KAZ": "#00AFCA", "UZB": "#2D9B8A", "TKM": "#5AA89A", "KGZ": "#4A9B8A", "TJK": "#5A8B7A", "MNG": "#40C8C0", "SAU": "#1A6B38", "IRQ": "#2D8B50", "IRN": "#33C371", "SYR": "#C05040", "JOR": "#8B6B3A", "ISR": "#3B7BC0", "LBN": "#C05060", "PSE": "#4A7A5A", "YEM": "#A08040", "OMN": "#6B8B4A", "ARE": "#1A7A40", "QAT": "#6B1A2A", "KWT": "#2D8B50", "BHR": "#8B2A3A", "EGY": "#69BABE", "LBY": "#69BABE", "TUN": "#768E11", "DZA": "#E05206", "MAR": "#C03030", "SDN": "#6B8B3A", "SSD": "#1246B3", "ETH": "#4189DE", "ERI": "#6A6A6A", "DJI": "#4A7A8A", "SOM": "#5A9BC8", "SML": "#4A8BB0", "KEN": "#2D7A4A", "UGA": "#4189DE", "TZA": "#3D8B5A", "RWA": "#8C0F06", "BDI": "#8C0F06", "COD": "#007FFF", "COG": "#2D8B4A", "GAB": "#007FFF", "CMR": "#C97A20", "NGA": "#9EC06F", "NER": "#C9A040", "TCD": "#3D8B5A", "CAF": "#C05060", "GHA": "#C97A20", "CIV": "#43757F", "SEN": "#3D8B5A", "MLI": "#C8B84A", "BFA": "#E05206", "GIN": "#BC4948", "SLE": "#BC4948", "LBR": "#EC8D1C", "MRT": "#6E313F", "GNB": "#6E313F", "BEN": "#9EC06F", "TGO": "#43757F", "AGO": "#8B1A2A", "ZMB": "#3D8B5A", "ZWE": "#780A16", "BWA": "#5A9BC8", "NAM": "#C85C9A", "ZAF": "#FFF58C", "MOZ": "#3D8B5A", "MDG": "#C85C9A", "MWI": "#00A3DD", "LSO": "#007168", "SWZ": "#C05060", "CHN": "#DE2915", "TWN": "#3B7BC0", "PRK": "#8B1A1A", "KOR": "#2A5AB0", "JPN": "#E07030", "IND": "#F99601", "PAK": "#1A6B40", "BGD": "#2D8B4A", "NPL": "#C43030", "BTN": "#C9A020", "LKA": "#C05060", "MMR": "#4A8B3A", "THA": "#C97A40", "LAO": "#5A9B4A", "KHM": "#3D7A5A", "VNM": "#F87F8B", "MYS": "#C9A020", "SGP": "#C05060", "IDN": "#8C0A0A", "PHL": "#3B7BC0", "BRN": "#C9A020", "TLS": "#C43030", "PNG": "#C97A30", "AUS": "#2E2E93", "NZL": "#414187", "FJI": "#3B7BC0", "NCL": "#3A6B9B", "AFG": "#4A6B4A", "KTC": "#FFFFFF", "DNZ": "#C05060"};

  function apply() {
    try {
      var g = window.GameState;
      if (!g || !g.countries) return 0;
      var n = 0;
      Object.keys(AOH3).forEach(function (iso) {
        if (g.countries[iso]) {
          g.countries[iso].color = AOH3[iso];
          n++;
        }
      });
      // scenario colors bag
      try {
        if (g.scenarioColors) Object.assign(g.scenarioColors, AOH3);
        if (g.countryColors) Object.assign(g.countryColors, AOH3);
      } catch (e) {}
      if (typeof refreshMapColors === "function") refreshMapColors();
      return n;
    } catch (e) { return -1; }
  }

  window.scApplyAoh3Colors = apply;

  function boot() {
    var n = apply();
    console.log("[v1.9.13] AoH3 renk fix · uygulanan", n);
  }

  // Hook start
  function wrap(name) {
    var prev = window[name];
    if (typeof prev !== "function" || prev._aoh13) return;
    window[name] = async function () {
      var r = await prev.apply(this, arguments);
      setTimeout(apply, 200);
      setTimeout(apply, 800);
      setTimeout(apply, 2000);
      return r;
    };
    window[name]._aoh13 = true;
  }
  ["startGame", "startGameSafe"].forEach(wrap);

  // Hook paint
  var _rmc = window.refreshMapColors;
  if (typeof _rmc === "function" && !_rmc._aoh13) {
    window.refreshMapColors = function () {
      try {
        var g = window.GameState;
        if (g && g.countries) {
          Object.keys(AOH3).forEach(function (iso) {
            if (g.countries[iso]) g.countries[iso].color = AOH3[iso];
          });
        }
      } catch (e) {}
      return _rmc.apply(this, arguments);
    };
    window.refreshMapColors._aoh13 = true;
  }

  setTimeout(boot, 500);
  setTimeout(boot, 2000);
  setTimeout(boot, 5000);
  window.addEventListener("sc-ready", function () { setTimeout(boot, 100); });
})();
