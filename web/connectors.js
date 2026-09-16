(function () {
  var MARK = {
    github: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.46-1.2-1.12-1.52-1.12-1.52-.92-.64.07-.63.07-.63 1.02.07 1.56 1.07 1.56 1.07.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .26.18.59.69.48A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>',
    gmail: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#EA4335" d="M2 6.5 12 13l10-6.5V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path fill="#34A853" d="M22 6.5 12 13 2 6.5 4 4l8 5 8-5z"/></svg>',
    slack: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#E01E5A" d="M8 14a2 2 0 1 1-2 2v-2z"/><path fill="#36C5F0" d="M10 8a2 2 0 1 1 2-2v2z"/><path fill="#2EB67D" d="M16 10a2 2 0 1 1 2 2h-2z"/><path fill="#ECB22E" d="M14 16a2 2 0 1 1-2 2v-2z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#5865F2"><path d="M19.3 5.2A18 18 0 0 0 14.8 4l-.2.4a16 16 0 0 1 3.1 1.2 12 12 0 0 0-10.4 0A16 16 0 0 1 10.4 4L10.2 4A18 18 0 0 0 5.7 5.2C2.3 10.3 1.5 15.3 1.9 20.2A18 18 0 0 0 7.4 22l.5-.8a12 12 0 0 1-1.7-.8l.4-.3a13 13 0 0 0 11.8 0l.4.3a12 12 0 0 1-1.7.8l.5.8a18 18 0 0 0 5.5-1.8c.5-5.6-.5-10.6-3.8-15zM9 17c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#25D366"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3zm4.7 12.6c-.2.5-1 .9-1.4 1-.4.1-.8.2-2.6-.6-2.2-.9-3.6-3.2-3.7-3.3-.1-.2-1-1.3-1-2.5s.6-1.8.9-2 .5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.4.6c-.1.2-.3.3-.1.6.5.8 1.1 1.5 1.9 2 .2.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.4s0 .7-.3 1.2z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#229ED9"><path d="M20.7 4.3 3.8 10.8c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.7 5.2c.2.6.1.8.7.8.4 0 .5-.2.7-.4l2-2 4.2 3.1c.8.4 1.3.2 1.5-.7l2.8-13.2c.3-1.1-.4-1.6-1.2-1.3z"/></svg>',
    notion: '◫', gcalendar: '📅', gdrive: '📁', gsheets: '📊',
    outlook: '✉', stripe: 'S', mercadopago: '$', linkedin: 'in', x: 'X',
    instagram: '◎', youtube: '▶', dropbox: '▦', trello: 't', linear: '/', hubspot: 'h', shopify: '🛒'
  };
  var modal = document.createElement("div");
  modal.id = "conn-modal";
  modal.className = "modal hidden";
  modal.innerHTML = '<div class="sheet"><button type="button" id="conn-x">\u00d7</button><h2>Conectores</h2><p class="info-task">Tocá el logo. GitHub y Gmail se autorizan al toque.</p><div id="conn-list" class="conn-grid"></div><div id="conn-go" class="conn-go" hidden></div></div>';
  (document.getElementById("app") || document.body).appendChild(modal);
  var list = document.getElementById("conn-list");
  var go = document.getElementById("conn-go");
  function close() { modal.classList.add("hidden"); }
  document.getElementById("conn-x").onclick = close;
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  var btn = document.getElementById("btn-profile");
  if (btn) btn.addEventListener("click", function () { modal.classList.remove("hidden"); load(); });

  async function load() {
    var data = await (await fetch("/api/connectors")).json();
    list.innerHTML = (data.items || []).map(function (it) {
      var mark = MARK[it.id] || it.name.slice(0, 1);
      var state = it.connected ? "Listo" : (it.ready ? "Conectar" : "Pronto");
      return '<button type="button" class="conn-tile' + (it.connected ? " on" : "") + (it.ready ? "" : " soon") +
        '" data-pick="' + it.id + '" data-ready="' + (it.ready ? "1" : "0") + '" data-on="' + (it.connected ? "1" : "0") +
        '" data-name="' + it.name + '"><div class="mark">' + mark + '</div><b>' + it.name + '</b><em>' + state + '</em></button>';
    }).join("");
    go.hidden = true;
  }

  list.addEventListener("click", async function (e) {
    var tile = e.target.closest("[data-pick]");
    if (!tile) return;
    var id = tile.getAttribute("data-pick");
    var ready = tile.getAttribute("data-ready") === "1";
    var on = tile.getAttribute("data-on") === "1";
    var name = tile.getAttribute("data-name");
    if (!ready) { go.hidden = false; go.innerHTML = '<b>' + name + '</b><p>Este conector todavía no está activo.</p>'; return; }
    if (on) {
      go.hidden = false;
      go.innerHTML = '<b>' + name + ' ya está conectado</b><button type="button" data-off="' + id + '">Desconectar</button>';
      return;
    }
    go.hidden = false;
    go.innerHTML = '<b>Conectar ' + name + '</b><p>Te llevo a autorizar. No hace falta pegar la clave acá.</p>' +
      '<button type="button" data-start="' + id + '">Continuar con ' + name + '</button>' +
      '<button type="button" class="ghost" data-cancel="1">Cancelar</button>';
  });

  go.addEventListener("click", async function (e) {
    if (e.target.getAttribute("data-cancel")) { go.hidden = true; return; }
    var off = e.target.getAttribute("data-off");
    if (off) {
      await fetch("/api/connectors/" + off, { method: "DELETE" });
      load();
      return;
    }
    var start = e.target.getAttribute("data-start");
    if (!start) return;
    var res = await fetch("/api/connectors/" + start + "/start");
    var data = await res.json().catch(function () { return {}; });
    if (data.url) {
      location.href = data.url;
      return;
    }
    go.innerHTML = '<b>Falta activar OAuth en Fly</b><p>Poné GITHUB_OAUTH_CLIENT_ID y GITHUB_OAUTH_CLIENT_SECRET (o los de Google) en Secrets. Mientras tanto no pegas tokens en el chat: se cargan solo por acá cuando OAuth esté listo.</p>';
  });
})();
