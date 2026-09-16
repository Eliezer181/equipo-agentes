(function () {
  var FALLBACK = [
    {id:"github",name:"GitHub",ready:true},{id:"gmail",name:"Gmail",ready:true},
    {id:"slack",name:"Slack",ready:false},{id:"discord",name:"Discord",ready:false},
    {id:"whatsapp",name:"WhatsApp",ready:false},{id:"telegram",name:"Telegram",ready:false},
    {id:"notion",name:"Notion",ready:false},{id:"gcalendar",name:"Calendar",ready:false},
    {id:"gdrive",name:"Drive",ready:false},{id:"gsheets",name:"Sheets",ready:false},
    {id:"outlook",name:"Outlook",ready:false},{id:"stripe",name:"Stripe",ready:false},
    {id:"mercadopago",name:"Mercado Pago",ready:false},{id:"linkedin",name:"LinkedIn",ready:false},
    {id:"x",name:"X",ready:false},{id:"instagram",name:"Instagram",ready:false},
    {id:"youtube",name:"YouTube",ready:false},{id:"dropbox",name:"Dropbox",ready:false},
    {id:"trello",name:"Trello",ready:false},{id:"linear",name:"Linear",ready:false},
    {id:"hubspot",name:"HubSpot",ready:false},{id:"shopify",name:"Shopify",ready:false}
  ];
  var MARK = {
    github: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.46-1.2-1.12-1.52-1.12-1.52-.92-.64.07-.63.07-.63 1.02.07 1.56 1.07 1.56 1.07.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.8 0 .26.18.59.69.48A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>',
    gmail: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#EA4335" d="M2 6.5 12 13l10-6.5V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path fill="#34A853" d="M22 6.5 12 13 2 6.5 4 4l8 5 8-5z"/></svg>'
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

  function paint(items) {
    list.innerHTML = (items || []).map(function (it) {
      var mark = MARK[it.id] || ('<span style="font-size:18px">' + (it.name || "?").slice(0, 1) + '</span>');
      var state = it.connected ? "Listo" : (it.ready ? "Conectar" : "Pronto");
      return '<button type="button" class="conn-tile' + (it.connected ? " on" : "") + (it.ready ? "" : " soon") +
        '" data-pick="' + it.id + '" data-ready="' + (it.ready ? "1" : "0") + '" data-on="' + (it.connected ? "1" : "0") +
        '" data-name="' + it.name + '"><div class="mark">' + mark + '</div><b>' + it.name + '</b><em>' + state + '</em></button>';
    }).join("");
  }

  async function load() {
    paint(FALLBACK);
    try {
      var data = await (await fetch("/api/connectors")).json();
      if (data && data.items && data.items.length) paint(data.items);
    } catch (e) {}
    if (go) go.hidden = true;
  }

  window.openConnectors = function () {
    modal.classList.remove("hidden");
    load();
  };

  var btn = document.getElementById("btn-profile");
  if (btn) btn.addEventListener("click", window.openConnectors);

  list.addEventListener("click", function (e) {
    var tile = e.target.closest("[data-pick]");
    if (!tile) return;
    var id = tile.getAttribute("data-pick");
    var ready = tile.getAttribute("data-ready") === "1";
    var on = tile.getAttribute("data-on") === "1";
    var name = tile.getAttribute("data-name");
    go.hidden = false;
    if (!ready) {
      go.innerHTML = '<b>' + name + '</b><p>Este conector todavía no está activo.</p>';
      return;
    }
    if (on) {
      go.innerHTML = '<b>' + name + ' ya está conectado</b><button type="button" data-off="' + id + '">Desconectar</button>';
      return;
    }
    go.innerHTML = '<b>Conectar ' + name + '</b><p>Te llevo a autorizar.</p>' +
      '<button type="button" data-start="' + id + '">Continuar con ' + name + '</button>' +
      '<button type="button" class="ghost" data-cancel="1">Cancelar</button>';
  });

  go.addEventListener("click", async function (e) {
    if (e.target.getAttribute("data-cancel")) { go.hidden = true; return; }
    var off = e.target.getAttribute("data-off");
    if (off) { await fetch("/api/connectors/" + off, { method: "DELETE" }); load(); return; }
    var start = e.target.getAttribute("data-start");
    if (!start) return;
    var res = await fetch("/api/connectors/" + start + "/start");
    var data = await res.json().catch(function () { return {}; });
    if (data.url) { location.href = data.url; return; }
    go.innerHTML = '<b>Todavía falta OAuth en Fly</b><p>Cuando pongas GITHUB_OAUTH_CLIENT_ID y el secret, este botón entra directo.</p>';
  });

  load();
})();
