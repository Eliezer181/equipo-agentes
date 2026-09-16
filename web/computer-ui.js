/* Computadora real del agente: archivos, terminal y navegador contra el
   backend (/api/specialists/{id}/computer/...). Persiste en el servidor. */
(function () {
  var desk = document.getElementById("desk");
  if (!desk) return;

  var titleEl = document.getElementById("desk-agent");
  var filesEl = document.getElementById("desk-files");
  var termEl = document.getElementById("desk-term");
  var browserEl = document.getElementById("desk-browser");
  var statusEl = document.getElementById("desk-status");
  var openBtn = document.getElementById("btn-desk");
  var backBtn = document.getElementById("btn-desk-back");
  var agentId = "";
  var agentName = "Agente";
  var app = "files";
  var termLog = [];

  function key() {
    return "glou-desk-" + (agentId || "none");
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    setTimeout(function () { el.classList.remove("on"); }, 2600);
  }

  async function api(path, opts) {
    var res = await fetch(path, opts);
    if (!res.ok) {
      var detail = "";
      try { detail = (await res.json()).detail || ""; } catch (_) {}
      throw new Error(detail || ("HTTP " + res.status));
    }
    return res.json();
  }

  function showApp(name) {
    app = name;
    desk.querySelectorAll("[data-desk-app]").forEach(function (el) {
      el.classList.toggle("on", el.getAttribute("data-desk-app") === name);
    });
    desk.querySelectorAll("[data-desk-pane]").forEach(function (el) {
      el.hidden = el.getAttribute("data-desk-pane") !== name;
    });
  }

  function renderTerm() {
    termEl.textContent = termLog.join("\n");
    termEl.scrollTop = termEl.scrollHeight;
  }

  function pushTerm(lines) {
    termLog = termLog.concat(lines).slice(-60);
    renderTerm();
  }

  async function loadFiles() {
    try {
      var state = await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer");
      filesEl.innerHTML = (state.files || []).map(function (f) {
        var kb = f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(1) + " KB";
        return "<button type=\"button\" class=\"desk-file\" data-file=\"" + escapeHtml(f.name) + "\">" +
          "<b>" + escapeHtml(f.name) + "</b><span>" + escapeHtml(kb) +
          " <i class=\"desk-del\" data-del=\"" + escapeHtml(f.name) + "\" title=\"borrar\">×</i></span></button>";
      }).join("") || "<p class=\"desk-empty\">Sin archivos todavía.</p>";
    } catch (err) {
      filesEl.innerHTML = "<p class=\"desk-empty\">No pude leer los archivos: " + escapeHtml(err.message) + "</p>";
    }
  }

  async function openFile(name) {
    try {
      var data = await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer/files/" + encodeURIComponent(name));
      var next = prompt("Editar " + name, data.body || "");
      if (next == null) return;
      await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, body: next })
      });
      pushTerm(["$ guardado " + name]);
      await loadFiles();
    } catch (err) {
      toast(err.message);
    }
  }

  async function deleteFile(name) {
    if (!confirm("¿Borrar " + name + "?")) return;
    try {
      await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer/files/" + encodeURIComponent(name), { method: "DELETE" });
      pushTerm(["$ rm " + name]);
      await loadFiles();
    } catch (err) {
      toast(err.message);
    }
  }

  async function resolveAgent() {
    var name = (document.getElementById("chat-name") || {}).textContent || "";
    agentName = name || "Agente";
    try {
      var specs = await (await fetch("/api/specialists")).json();
      var hit = specs.find(function (s) { return s.name === name; });
      agentId = hit ? hit.id : (name || "agente").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    } catch (_) {
      agentId = (name || "agente").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    }
  }

  async function openDesk() {
    var chat = document.getElementById("chat");
    if (chat && !chat.classList.contains("active")) return;
    await resolveAgent();
    if (titleEl) titleEl.textContent = "PC · " + agentName;
    if (statusEl) statusEl.textContent = "en línea";
    if (!termLog.length) {
      termLog = [
        agentName.toLowerCase().replace(/[^a-z0-9_-]/g, "") + "@" + agentId + " ~ % listo",
        "# computadora real · archivos y terminal del servidor"
      ];
    }
    renderTerm();
    await loadFiles();
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === "desk");
    });
  }

  function closeDesk() {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === "chat");
    });
  }

  if (openBtn) openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    openDesk();
  });
  if (backBtn) backBtn.addEventListener("click", closeDesk);

  desk.addEventListener("click", function (e) {
    var dock = e.target.closest("[data-desk-app]");
    if (dock) {
      showApp(dock.getAttribute("data-desk-app"));
      return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      deleteFile(del.getAttribute("data-del"));
      return;
    }
    var file = e.target.closest("[data-file]");
    if (file) {
      openFile(file.getAttribute("data-file"));
    }
  });

  var addFile = document.getElementById("desk-add-file");
  if (addFile) addFile.addEventListener("click", async function () {
    var name = prompt("Nombre del archivo", "entrega.md");
    if (!name) return;
    try {
      await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, body: "" })
      });
      pushTerm(["$ touch " + name]);
      await loadFiles();
      openFile(name);
    } catch (err) {
      toast(err.message);
    }
  });

  var urlForm = document.getElementById("desk-url-form");
  if (urlForm) urlForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var url = ((document.getElementById("desk-url") || {}).value || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/+/, "");
    browserEl.innerHTML = "<p class=\"desk-empty\">Cargando " + escapeHtml(url) + "…</p>";
    showApp("browser");
    var proxy = "/api/specialists/" + encodeURIComponent(agentId) +
      "/computer/proxy?url=" + encodeURIComponent(url);
    pushTerm(["$ open " + url]);
    browserEl.classList.add("browsing");
    browserEl.innerHTML =
      "<iframe class=\"desk-frame\" src=\"" + proxy + "\" " +
      "sandbox=\"\" referrerpolicy=\"no-referrer\" title=\"navegador del agente\"></iframe>";
  });

  var termForm = document.getElementById("desk-term-form");
  if (termForm) termForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var field = document.getElementById("desk-cmd");
    var cmd = (field && field.value || "").trim();
    if (!cmd) return;
    if (field) field.value = "";
    showApp("term");
    pushTerm(["% " + cmd]);
    try {
      var r = await api("/api/specialists/" + encodeURIComponent(agentId) + "/computer/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: cmd })
      });
      var lines = [];
      if (r.stdout) lines.push(r.stdout.trimEnd());
      if (r.stderr) lines.push(r.stderr.trimEnd());
      if (!lines.length) lines.push("(sin salida)");
      if (r.code !== 0) lines.push("[" + "exit " + r.code + "]");
      pushTerm(lines);
    } catch (err) {
      pushTerm(["error: " + err.message]);
    }
  });
})();
