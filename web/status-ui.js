(function () {
  function isInternal(m) {
    if (!m) return false;
    if (m.hidden) return true;
    var c = String(m.content || "");
    if (c.indexOf("RESULTADO DE TU COMPUTADORA") === 0) return true;
    if (c.indexOf("```json") !== -1 && c.indexOf('"tool"') !== -1) return true;
    if (c.indexOf('"tool": "browser"') !== -1 || c.indexOf('"tool":"browser"') !== -1) return true;
    return false;
  }

  if (typeof renderThread === "function") {
    var _rt = renderThread;
    renderThread = function (messages) {
      _rt((messages || []).filter(function (m) { return !isInternal(m); }));
    };
  }

  function bar() {
    var el = document.getElementById("think-bar");
    if (el) return el;
    el = document.createElement("div");
    el.id = "think-bar";
    el.className = "think-bar hidden";
    el.innerHTML = '<span class="think-dot"></span><span id="think-text">Razonando…</span>';
    var composer = document.getElementById("composer");
    if (composer) composer.parentNode.insertBefore(el, composer);
    return el;
  }

  var timer = null;
  var step = 0;
  function startThink(userText) {
    var el = bar();
    var web = /google|naveg|captura|screenshot|web|página|pagina|busc/i.test(userText || "");
    var lines = web
      ? ["Razonando…", "Entrando al navegador…", "Tomando captura…"]
      : ["Razonando…", "Pensando el pedido…"];
    step = 0;
    document.getElementById("think-text").textContent = lines[0];
    el.classList.remove("hidden");
    clearInterval(timer);
    timer = setInterval(function () {
      step = (step + 1) % lines.length;
      var t = document.getElementById("think-text");
      if (t) t.textContent = lines[step];
    }, 1400);
  }
  function stopThink() {
    clearInterval(timer);
    timer = null;
    var el = document.getElementById("think-bar");
    if (el) el.classList.add("hidden");
  }

  var form = document.getElementById("composer");
  if (form) {
    form.addEventListener("submit", function () {
      startThink((document.getElementById("input") || {}).value || "");
    }, true);
  }
  var origFetch = window.fetch;
  window.fetch = function () {
    var url = String(arguments[0] || "");
    var p = origFetch.apply(this, arguments);
    if (/\/chat$/.test(url)) return p.finally(stopThink);
    return p;
  };
})();
