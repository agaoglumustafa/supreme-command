
(function SCFlagsFix() {
  "use strict";
  var FLAG_OVERRIDES = {
    AZE: "https://flagcdn.com/w80/az.png",
    TUR: "https://flagcdn.com/w80/tr.png",
    KTC: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg/250px-Flag_of_the_Turkish_Republic_of_Northern_Cyprus.svg.png&w=80",
    ABK: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Flag_of_the_Republic_of_Abkhazia.svg/250px-Flag_of_the_Republic_of_Abkhazia.svg.png&w=80",
    SML: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Flag_of_Somaliland.svg/330px-Flag_of_Somaliland.svg.png&w=80",
    DNZ: "https://images.weserv.nl/?url=upload.wikimedia.org/wikipedia/commons/thumb/f/fe/POL_Gda%25C5%2584sk_flag.svg/250px-POL_Gda%25C5%2584sk_flag.svg.png&w=80",
    CYP: "https://flagcdn.com/w80/cy.png",
    GEO: "https://flagcdn.com/w80/ge.png",
    ARM: "https://flagcdn.com/w80/am.png"
  };

  function resolveFlag(isoOrFlag) {
    if (!isoOrFlag) return "https://flagcdn.com/w40/un.png";
    var s = String(isoOrFlag);
    if (FLAG_OVERRIDES[s]) return FLAG_OVERRIDES[s];
    if (s.indexOf("http") === 0) {
      // proxy wiki if needed
      if (s.indexOf("upload.wikimedia.org") >= 0 && s.indexOf("images.weserv.nl") < 0) {
        return "https://images.weserv.nl/?url=" + encodeURIComponent(s.replace(/^https?:\/\//, "")) + "&w=80";
      }
      return s;
    }
    // 2-letter iso
    if (/^[a-z]{2}$/i.test(s)) return "https://flagcdn.com/w40/" + s.toLowerCase() + ".png";
    // country object lookup
    try {
      var g = window.GameState;
      if (g && g.countries && g.countries[s]) {
        var f = g.countries[s].flag;
        if (FLAG_OVERRIDES[s]) return FLAG_OVERRIDES[s];
        if (f && String(f).indexOf("http") === 0) {
          if (String(f).indexOf("upload.wikimedia.org") >= 0)
            return "https://images.weserv.nl/?url=" + encodeURIComponent(String(f).replace(/^https?:\/\//, "")) + "&w=80";
          return f;
        }
        if (f) return "https://flagcdn.com/w40/" + String(f).toLowerCase() + ".png";
      }
    } catch (e) {}
    return "https://flagcdn.com/w40/un.png";
  }

  function patchGetFlagUrl() {
    window.getFlagUrl = resolveFlag;
  }

  function applyCountryFlags() {
    try {
      var g = window.GameState;
      if (!g || !g.countries) return;
      Object.keys(FLAG_OVERRIDES).forEach(function (iso) {
        if (g.countries[iso]) {
          g.countries[iso].flag = FLAG_OVERRIDES[iso];
        }
      });
      // AZE always az via override URL
      if (g.countries.AZE) {
        g.countries.AZE.flag = FLAG_OVERRIDES.AZE;
      }
      var fl = document.getElementById("hud-flag");
      if (fl && g.player) fl.src = resolveFlag(g.player);
    } catch (e) {}
  }

  function wrapStart() {
    var prev = window.startGame;
    if (typeof prev !== "function") return;
    window.startGame = async function () {
      var r = await prev.apply(this, arguments);
      patchGetFlagUrl();
      applyCountryFlags();
      return r;
    };
  }

  patchGetFlagUrl();
  wrapStart();
  // late bind
  setInterval(function () {
    patchGetFlagUrl();
    try {
      var fl = document.getElementById("hud-flag");
      var g = window.GameState;
      if (fl && g && g.player && g.running) {
        var want = resolveFlag(g.player);
        if (fl.src !== want && fl.getAttribute("data-sc-flag") !== want) {
          fl.src = want;
          fl.setAttribute("data-sc-flag", want);
        }
      }
    } catch (e) {}
  }, 2000);

  console.log("[flags-fix] AZE/KTC/ABK/SML/DNZ + getFlagUrl proxy");
})();
