(function () {
  function sheetFor(id, name) {
    var old = document.getElementById("agent-act");
    if (old) old.remove();
    var m = document.createElement("div");
    m.id = "agent-act";
    m.className = "modal";
    m.innerHTML = '<div class="sheet"><button type="button" class="act-x">\u00d7</button><h2>' +
      (name || "Agente") + '</h2>' +
      '<button type="button" class="set-row" data-act="edit">Editar avatar</button>' +
      '<button type="button" class="set-row" data-act="archive">Archivar</button>' +
      '<button type="button" class="set-row" data-act="del"><div>Eliminar<span>Se borra el chat también</span></div></button></div>';
    document.body.appendChild(m);
    function close() { m.remove(); }
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest(".act-x")) close(); });
    m.querySelector("[data-act=edit]").onclick = function () {
      close();
      if (typeof openChat === "function") openChat(id).then(function () {
        var b = document.getElementById("btn-agent-menu");
        if (b) b.click();
      });
    };
    m.querySelector("[data-act=archive]").onclick = async function () {
      await fetch("/api/specialists/" + id + "/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      close();
      if (typeof loadList === "function") loadList();
    };
    m.querySelector("[data-act=del]").onclick = async function () {
      if (!confirm("¿Eliminar a " + name + "? Se borra el chat también.")) return;
      var res = await fetch("/api/specialists/" + id, { method: "DELETE" });
      if (!res.ok) { alert("No se pudo eliminar"); return; }
      close();
      if (typeof closeChat === "function") closeChat();
      if (typeof loadList === "function") loadList();
    };
  }

  var list = document.getElementById("list");
  if (list) {
    list.addEventListener("click", function (e) {
      var more = e.target.closest("[data-more]");
      if (!more) return;
      e.preventDefault();
      e.stopPropagation();
      sheetFor(more.getAttribute("data-more"), more.getAttribute("data-name") || "Agente");
    }, true);
  }

  if (typeof renderList === "function") {
    var _rl = renderList;
    renderList = function () {
      _rl.apply(this, arguments);
      document.querySelectorAll("#list .row[data-id]").forEach(function (row) {
        if (row.querySelector("[data-more]")) return;
        var id = row.getAttribute("data-id");
        var name = ((row.querySelector(".name") || {}).textContent || "").split("\n")[0].trim();
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "row-more";
        btn.setAttribute("data-more", id);
        btn.setAttribute("data-name", name);
        btn.setAttribute("aria-label", "Opciones");
        btn.textContent = "⋮";
        row.appendChild(btn);
      });
    };
  }

  var del = document.getElementById("btn-delete-agent");
  if (del) {
    del.addEventListener("click", function () {
      setTimeout(function () { if (typeof loadList === "function") loadList(); }, 400);
    });
  }
})();
