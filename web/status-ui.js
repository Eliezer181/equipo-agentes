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
    el.innerHTML = '<span class="think-dot"></span><span id="think-text">Razonando…</span>';
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
        if (parsed.text && !(parsed.at && parsed.at + 0.2 < startedAt)) setText(parsed.text);
      }
    } catch (_) {}
  }
  function startThink() {
    startedAt = Date.now() / 1000;
    var el = bar();
    setText("Razonando…");
    el.classList.remove("hidden");
    clearInterval(poll);
    clearTimeout(kill);
    poll = setInterval(tick, 450);
    kill = setTimeout(stopThink, 90000);
  }
  function stopThink() {
    clearInterval(poll);
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
