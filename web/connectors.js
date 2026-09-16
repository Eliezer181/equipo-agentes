(function () {
  var modal = document.createElement("div");
  modal.id = "conn-modal";
  modal.className = "modal hidden";
  modal.innerHTML = '<div class="sheet"><button type="button" id="conn-x" aria-label="Cerrar">\u00d7</button><h2>Conectores</h2><p class="info-task">GitHub y Gmail ya andan. El resto queda listo para cuando los actives.</p><div id="conn-list" class="conn-list"></div></div>';
  (document.getElementById("app") || document.body).appendChild(modal);
  var list = document.getElementById("conn-list");
  function close() { modal.classList.add("hidden"); }
  document.getElementById("conn-x").onclick = close;
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  var btn = document.getElementById("btn-profile");
  if (btn) btn.addEventListener("click", function () { modal.classList.remove("hidden"); load(); });

  function fieldHtml(f) {
    return '<label>' + f.label + '<input name="' + f.key + '" type="' + (f.type || "text") + '" autocomplete="off" /><div class="hint">' + (f.hint || "") + '</div></label>';
  }

  async function load() {
    var data = await (await fetch("/api/connectors")).json();
    list.innerHTML = (data.items || []).map(function (it) {
      var status = it.connected ? "Conectado" : (it.ready ? "Conectar" : "Pronto");
      var extra = "";
      if (it.ready) {
        extra = '<form class="conn-form" data-kind="' + it.id + '">' +
          (it.fields || []).map(fieldHtml).join("") +
          '<button type="submit">Guardar ' + it.name + '</button></form>';
        if (it.connected) extra += '<button type="button" class="on" data-off="' + it.id + '">Desconectar</button>';
      }
      return '<div class="conn-card"><div><b>' + it.name + '</b><span>' + it.blurb + '</span></div><div class="soon">' + status + '</div>' + extra + '</div>';
    }).join("");
  }

  list.addEventListener("submit", async function (e) {
    var form = e.target.closest("form.conn-form");
    if (!form) return;
    e.preventDefault();
    var body = {};
    form.querySelectorAll("input").forEach(function (inp) { body[inp.name] = inp.value; });
    var res = await fetch("/api/connectors/" + form.getAttribute("data-kind"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { alert(data.detail || "No se pudo conectar"); return; }
    load();
  });
  list.addEventListener("click", async function (e) {
    var off = e.target.getAttribute && e.target.getAttribute("data-off");
    if (!off) return;
    await fetch("/api/connectors/" + off, { method: "DELETE" });
    load();
  });
})();
