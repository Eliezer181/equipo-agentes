(function () {
  var actions = document.querySelector(".top-actions");
  if (actions && !document.getElementById("btn-settings")) {
    var gear = document.createElement("button");
    gear.type = "button";
    gear.id = "btn-settings";
    gear.title = "Ajustes";
    gear.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    var searchBtn = document.getElementById("btn-search");
    actions.insertBefore(gear, searchBtn || actions.firstChild);
  }
  if (!document.querySelector('link[href*="extras.css"]')) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/static/extras.css?v=3";
    document.head.appendChild(link);
  }

  var chat = document.getElementById("chat");
  var thread = document.getElementById("thread");
  if (chat && thread && !document.getElementById("jump-bottom")) {
    var jump = document.createElement("button");
    jump.type = "button";
    jump.id = "jump-bottom";
    jump.setAttribute("aria-label", "Ir al final");
    jump.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    chat.appendChild(jump);
    function nearBottom() {
      return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
    }
    function syncJump() { jump.classList.toggle("on", !nearBottom()); }
    thread.addEventListener("scroll", syncJump, { passive: true });
    jump.addEventListener("click", function () {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
    new MutationObserver(syncJump).observe(thread, { childList: true, subtree: true });
  }

  async function searchMessages(q) {
    try {
      var res = await fetch("/api/search?q=" + encodeURIComponent(q));
      if (res.ok) {
        var data = await res.json();
        return data.items || [];
      }
    } catch (e) {}
    var specs = (typeof specialists !== "undefined" && specialists) || [];
    var out = [];
    var needle = q.toLowerCase();
    for (var i = 0; i < specs.length && out.length < 30; i++) {
      var spec = specs[i];
      try {
        var msgs = await (await fetch("/api/specialists/" + spec.id + "/messages")).json();
        (msgs || []).forEach(function (m) {
          var text = String((m && m.content) || "");
          if (text.toLowerCase().indexOf(needle) >= 0 && text.indexOf("RESULTADO DE TU COMPUTADORA") !== 0) {
            out.push({ id: spec.id, agent: spec.name, text: text.replace(/\n/g, " ").slice(0, 140) });
          }
        });
      } catch (e2) {}
    }
    return out;
  }

  var searchEl = document.getElementById("search");
  var listEl = document.getElementById("list");
  if (searchEl && listEl) {
    var hits = document.getElementById("search-hits");
    if (!hits) {
      hits = document.createElement("div");
      hits.id = "search-hits";
      listEl.parentNode.appendChild(hits);
    }
    var timer = null;
    searchEl.addEventListener("input", function () {
      clearTimeout(timer);
      var q = searchEl.value.trim();
      if (q.length < 2) { hits.innerHTML = ""; return; }
      timer = setTimeout(async function () {
        var items = await searchMessages(q);
        if (!items.length) {
          hits.innerHTML = '<p class="section-label">Mensajes</p><p class="preview" style="padding:8px 16px">No hay mensajes con esa frase.</p>';
          return;
        }
        hits.innerHTML = '<p class="section-label">Mensajes</p>' + items.map(function (it) {
          return '<button type="button" class="hit" data-open="' + it.id + '"><b>' +
            (it.agent || "Chat") + '</b><span>' + (it.text || "") + '</span></button>';
        }).join("");
      }, 180);
    });
    hits.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-open]");
      if (!btn || typeof openChat !== "function") return;
      openChat(btn.getAttribute("data-open"));
    });
  }

  var modal = document.createElement("div");
  modal.id = "settings-modal";
  modal.className = "modal hidden";
  modal.innerHTML = '<div class="sheet"><button type="button" id="set-x">\u00d7</button><h2 id="set-title">Ajustes</h2>' +
    '<div id="set-home">' +
    '<button type="button" class="set-row" id="set-conn"><div>Conectores<span>GitHub, Gmail y el resto</span></div></button>' +
    '<button type="button" class="set-row" id="set-help"><div>Ayuda<span>Cómo usar Glou y el navegador</span></div></button>' +
    '<button type="button" class="set-row" id="set-about"><div>Acerca de Glou<span>Agentes con computadora en la nube</span></div></button>' +
    '<button type="button" class="set-row" id="set-out"><div>Cerrar sesión<span>Salir de esta cuenta</span></div></button></div>' +
    '<div id="set-note" class="set-note" hidden></div></div>';
  (document.getElementById("app") || document.body).appendChild(modal);
  var home = document.getElementById("set-home");
  var note = document.getElementById("set-note");
  var title = document.getElementById("set-title");
  function closeSet() {
    modal.classList.add("hidden");
    home.hidden = false;
    note.hidden = true;
    title.textContent = "Ajustes";
  }
  function openNote(name, html) {
    title.textContent = name;
    home.hidden = true;
    note.hidden = false;
    note.innerHTML = html + '<button type="button" class="set-back" id="set-back">Volver</button>';
    document.getElementById("set-back").onclick = function () {
      home.hidden = false;
      note.hidden = true;
      title.textContent = "Ajustes";
    };
  }
  document.getElementById("set-x").onclick = closeSet;
  modal.addEventListener("click", function (e) { if (e.target === modal) closeSet(); });
  var gearBtn = document.getElementById("btn-settings");
  if (gearBtn) gearBtn.addEventListener("click", function () { modal.classList.remove("hidden"); });
  document.getElementById("set-conn").onclick = function () {
    closeSet();
    if (typeof window.openConnectors === "function") window.openConnectors();
  };
  document.getElementById("set-help").onclick = function () {
    openNote("Ayuda", "<p>Escribile al agente lo que necesitás, en castellano.</p><p>Si querés una página, pedile captura. La flecha del chat baja al último mensaje.</p><p>GitHub y Gmail se conectan desde Conectores, con el logo.</p>");
  };
  document.getElementById("set-about").onclick = function () {
    openNote("Acerca de Glou", "<p>Glou es un equipo de agentes. Cada uno tiene chat, archivos y un Chrome en la nube.</p><p>No es un chatbot suelto: el agente puede entrar a una web, tomar captura y volver con el resultado.</p>");
  };
  document.getElementById("set-out").onclick = async function () {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/landing";
  };

  var s = document.createElement("script");
  s.src = "/static/agent-actions.js?v=1";
  document.body.appendChild(s);
})();
