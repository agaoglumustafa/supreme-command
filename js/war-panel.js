// Net savaş paneli
(function SCWarPanel() {
  "use strict";
  function ensure() {
    if (document.getElementById("sc-war-panel")) return;
    var d = document.createElement("div");
    d.id = "sc-war-panel";
    d.style.cssText =
      "position:fixed;right:10px;bottom:80px;z-index:9000;width:260px;max-height:40vh;overflow:auto;background:rgba(15,18,24,.94);border:1px solid #7f1d1d;border-radius:8px;padding:8px;font-size:11px;color:#e2e8f0;display:none";
    d.innerHTML = '<div class="font-bold text-red-400 mb-1 tracking-wide">CEPHELER</div><div id="sc-war-list"></div>';
    document.body.appendChild(d);
  }
  function render() {
    ensure();
    var box = document.getElementById("sc-war-list");
    var panel = document.getElementById("sc-war-panel");
    if (!box || !panel || !window.GameState) return;
    var wars = GameState.activeWars || [];
    if (!wars.length) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";
    box.innerHTML = wars
      .map(function (w) {
        var a = (GameState.countries[w.attacker] && GameState.countries[w.attacker].name) || w.attacker;
        var b = (GameState.countries[w.target] && GameState.countries[w.target].name) || w.target;
        var prog = Math.min(100, Math.floor(w.progress || 0));
        return (
          '<div style="border-bottom:1px solid #334155;padding:6px 0">' +
          "<b>" +
          a +
          "</b> vs <b>" +
          b +
          "</b><br>" +
          '<div style="height:4px;background:#1e293b;border-radius:2px;margin:4px 0"><div style="height:100%;width:' +
          prog +
          '%;background:#dc2626;border-radius:2px"></div></div>' +
          '<span style="color:#94a3b8">İlerleme ' +
          prog +
          "% · zayiat " +
          (w.casualties || 0) +
          " / " +
          (w.enemyCasualties || 0) +
          "</span></div>"
        );
      })
      .join("");
  }
  setInterval(render, 2000);
  window.scRenderWarPanel = render;
  console.log("[war-panel] ready");
})();
