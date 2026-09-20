(function () {
  function isInternal(m) {
    if (!m) return false;
    if (m.hidden) return true;
    var c = String(m.content || "");
    if (!c.trim()) return true;
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
    el.innerHTML = '<div class="tb-pill">'
      + '<span class="tb-brain"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9.5 3.5c2-1.4 5-1.2 6.6.7.9 1.1 1.2 2.5.9 3.8 1 .6 1.7 1.6 1.9 2.8.3 1.8-.6 3.5-2.2 4.3-.2 1.5-1.1 2.8-2.5 3.4-1.5.7-3.2.4-4.4-.6-1.4.3-2.9-.2-3.9-1.3-1-1.2-1.3-2.8-.8-4.2C4 12 3.3 10.6 3.5 9c.2-1.6 1.4-2.9 2.9-3.4.3-1 .8-1.7 1.6-2.1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.2v11.6M8.4 9.4h2.3M13.3 9.4h2.3M8.9 12.6h1.8M13.6 12.6h1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg></span>'
      + '<span class="tb-text"><span id="think-text">Analizando tu consulta…</span></span>'
      + '<span class="tb-dots"><i></i><i></i><i></i></span>'
      + '</div>';
    var composer = document.getElementById("composer");
    if (composer) composer.parentNode.insertBefore(el, composer);
    return el;
  }
  var poll = null;
  var kill = null;
  var startedAt = 0;
  function agentId() {
    return current && current.type === "specialist" ? current.id : "";
  }
  function setText(t) {
    var el = document.getElementById("think-text");
    if (el && t) el.textContent = t;
  }
  async function tick() {
    var id = agentId();
    if (!id) return;
    try {
      var res = await fetch("/api/specialists/" + encodeURIComponent(id) + "/computer/files/" + encodeURIComponent(".live.json"));
      if (res.ok) {
        var data = await res.json();
        var parsed = {};
        try { parsed = JSON.parse(data.body || data.text || ""); } catch (_) {}
        if (parsed.text && !(parsed.at && parsed.at + 0.2 < startedAt)) {
          setText(parsed.text);
          lastLiveAt = Date.now() / 1000;
          rIndex = 0;
        }
      }
    } catch (_) {}
  }
  function phrasesFor(msg) {
    var t = " " + String(msg || "").toLowerCase() + " ";
    if (/https?:\/\/|www\./.test(t) || /\b(abr|entr|naveg|captur)\b/.test(t)) return ["Preparando el navegador…", "Cargando la página…", "Tomando captura…", "Redactando la respuesta…"];
    if (/\b(pdf|documento|word|excel|planilla|archivo)\b/.test(t)) return ["Preparando tu archivo…", "Generando el contenido…", "Guardando el archivo…", "Listando el resultado…"];
    if (/\b(busca|busc[áa]|investig|google|informaci|noticias|qui[ée]n|qu[ée] es)\b/.test(t)) return ["Investigando en la web…", "Leyendo fuentes…", "Filtrando lo importante…", "Redactando la respuesta…"];
    if (/\b(c[óo]digo|python|script|programa|calcul)\b/.test(t)) return ["Preparando el código…", "Ejecutando en la computadora…", "Revisando el resultado…"];
    if (/\b(gmail|correo|email|mail|bandeja)\b/.test(t)) return ["Revisando el correo…", "Buscando en tu bandeja…", "Redactando la respuesta…"];
    if (/github|repo|commit/.test(t)) return ["Conectando a GitHub…", "Revisando el repositorio…", "Redactando la respuesta…"];
    if (/\b(imagen|logo|dise[ñn]o|avatar|foto|dibuj)\b/.test(t)) return ["Preparando el diseño…", "Generando la imagen…", "Redactando la respuesta…"];
    return ["Analizando tu consulta…", "Razonando…", "Redactando la respuesta…"];
  }
  var rotate = null;
  var rotation = [];
  var rIndex = 0;
  var lastLiveAt = 0;
  function startThink() {
    startedAt = Date.now() / 1000;
    var el = bar();
    var input = document.querySelector("#composer input, #composer textarea");
    rotation = phrasesFor(input ? input.value : "");
    rIndex = 0;
    lastLiveAt = 0;
    setText(rotation[0]);
    el.classList.remove("hidden");
    clearInterval(poll);
    clearTimeout(kill);
    clearInterval(rotate);
    poll = setInterval(tick, 450);
    rotate = setInterval(function () {
      if (Date.now() / 1000 - lastLiveAt < 5) return;  // el backend mando estado real hace poco: no pisarlo
      rIndex = (rIndex + 1) % rotation.length;
      setText(rotation[rIndex]);
    }, 4200);
    kill = setTimeout(stopThink, 90000);
  }
  function stopThink() {
    clearInterval(poll);
    clearInterval(rotate);
    clearTimeout(kill);
    poll = null;
    var el = document.getElementById("think-bar");
    if (el) el.classList.add("hidden");
    document.querySelectorAll("#thread .bubble.thinking").forEach(function (n) { n.remove(); });
  }
  function watchAgent(id) {
    var n = 0;
    var iv = setInterval(async function () {
      n += 1;
      try {
        var msgs = await (await fetch("/api/specialists/" + encodeURIComponent(id) + "/messages")).json();
        var visible = (msgs || []).filter(function (m) { return !isInternal(m); });
        var last = visible[visible.length - 1];
        if (last && last.role === "assistant") {
          if (typeof renderThread === "function") renderThread(msgs);
          stopThink();
          clearInterval(iv);
        }
      } catch (_) {}
      if (n > 90) { clearInterval(iv); stopThink(); }
    }, 900);
  }
  var form = document.getElementById("composer");
  if (form) form.addEventListener("submit", function () { startThink(); }, true);
  var origFetch = window.fetch;
  window.fetch = function () {
    var url = String(arguments[0] || "");
    var opts = arguments[1];
    var m = url.match(/\/api\/specialists\/([^/]+)\/chat$/);
    if (m) {
      url = "/api/agent-chat/" + m[1];
      arguments[0] = url;
    }
    if (window.__pendingShot && /agent-chat|\/chat$/.test(url) && opts && opts.body) {
      try {
        var body = JSON.parse(opts.body);
        body.message = "![foto](" + window.__pendingShot + ")\n" + (body.message || "");
        arguments[1] = Object.assign({}, opts, { body: JSON.stringify(body) });
        window.__pendingShot = "";
        var chip = document.getElementById("attach-chip");
        if (chip) chip.remove();
      } catch (_) {}
    }
    var p = origFetch.apply(this, arguments);
    if (/\/api\/agent-chat\/[^/]+$/.test(url)) {
      return p.then(function (res) {
        var copy = res.clone();
        copy.json().then(function (data) {
          if (data && data.pending) {
            var id = (url.match(/agent-chat\/([^/]+)/) || [])[1];
            if (id) watchAgent(id);
          } else {
            stopThink();
          }
        }).catch(function () { stopThink(); });
        return res;
      });
    }
    if (/\/chat$/.test(url)) return p.finally(stopThink);
    return p;
  };
  function syncChrome() {
    var at = document.getElementById("btn-at");
    if (at) at.classList.toggle("hidden", !(current && current.type === "group"));
  }
  if (typeof openChat === "function") {
    var oc = openChat;
    openChat = async function () { var r = oc.apply(this, arguments); syncChrome(); return r; };
  }
  if (typeof openGroup === "function") {
    var og = openGroup;
    openGroup = async function () { var r = og.apply(this, arguments); syncChrome(); return r; };
  }
  syncChrome();
})();
