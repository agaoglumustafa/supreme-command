// 60 saniyelik ilk sefer öğretici
(function SCTutorial60() {
  "use strict";
  var KEY = "sc_tutorial60_done";
  function show() {
    try {
      if (localStorage.getItem(KEY) === "1") return;
    } catch (e) {}
    if (document.getElementById("sc-tut60")) return;
    var m = document.createElement("div");
    m.id = "sc-tut60";
    m.style.cssText =
      "position:fixed;inset:0;z-index:25000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px";
    m.innerHTML =
      '<div style="max-width:420px;background:#12161f;border:1px solid #334155;border-radius:10px;padding:16px;color:#e2e8f0;font-size:13px;line-height:1.5">' +
      '<div style="font-size:11px;letter-spacing:.15em;color:#94a3b8;font-weight:700;margin-bottom:6px">60 SANİYE</div>' +
      "<b>Nasıl başlanır</b>" +
      "<ol style='margin:8px 0 12px 18px;padding:0;color:#cbd5e1'>" +
      "<li>Haritada <b>kendi eyaletine</b> tıkla → altyapı / bina</li>" +
      "<li>Diplomasi’den hedef seç → <b>Savaş ilan et</b></li>" +
      "<li>Sağ altta <b>Cepheler</b> panelinden ilerlemeyi izle</li>" +
      "</ol>" +
      '<button id="sc-tut60-ok" style="width:100%;padding:10px;background:#0e7490;border:none;border-radius:6px;color:#fff;font-weight:800;cursor:pointer">Anladım — oyna</button>' +
      "</div>";
    document.body.appendChild(m);
    document.getElementById("sc-tut60-ok").onclick = function () {
      try {
        localStorage.setItem(KEY, "1");
      } catch (e) {}
      m.remove();
    };
  }
  var prev = window.startGame;
  if (typeof prev === "function" && !prev._tut60) {
    window.startGame = async function () {
      var r = await prev.apply(this, arguments);
      setTimeout(show, 900);
      return r;
    };
    window.startGame._tut60 = true;
  }
  console.log("[tutorial-60] ready");
})();
