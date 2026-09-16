(function () {
  function hex(c) {
    c = String(c || "#38bdf8");
    if (c[0] !== "#") c = "#" + c;
    return c;
  }
  function applyTheme(color) {
    var c = hex(color);
    document.documentElement.style.setProperty("--agent", c);
    document.documentElement.style.setProperty("--accent", c);
    var app = document.getElementById("app");
    if (app) app.style.setProperty("--agent", c);
  }
  function isActive(spec) {
    if (!spec) return false;
    if (spec.archived) return false;
    return !!(spec.last_message || spec.last_at);
  }
  function paintHero() {
    var face = document.getElementById("agent-hero-face");
    var state = document.getElementById("agent-state");
    if (!current || current.type !== "specialist") return;
    var color = document.getElementById("edit-color").value || current.color || "#38bdf8";
    applyTheme(color);
    if (face && typeof buddySvg === "function") face.innerHTML = buddySvg({ ...current, color: color }, 52);
    if (state) {
      var on = isActive(current);
      state.className = "agent-state " + (on ? "on" : "off");
      state.innerHTML = "<i></i> " + (on ? "Activo" : "Apagado");
    }
    var count = document.getElementById("work-count");
    var ta = document.getElementById("edit-instructions");
    if (count && ta) count.textContent = String(ta.value || "").length + "/4000";
  }

  var _open = window.openAgentSheet;
  if (typeof openAgentSheet === "function") {
    var orig = openAgentSheet;
    openAgentSheet = function () {
      orig.apply(this, arguments);
      var sheet = document.querySelector("#edit-agent");
      if (sheet) sheet.classList.add("agent-sheet");
      paintHero();
    };
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#edit-palette [data-color]")) return;
    setTimeout(paintHero, 0);
  });
  var ta = document.getElementById("edit-instructions");
  if (ta) ta.addEventListener("input", paintHero);

  var _openChat = window.openChat;
  if (typeof openChat === "function") {
    var oc = openChat;
    openChat = async function () {
      var r = await oc.apply(this, arguments);
      if (current && current.color) applyTheme(current.color);
      return r;
    };
  }
})();
