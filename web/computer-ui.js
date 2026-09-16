(function () {
  var desk = document.getElementById("desk");
  if (!desk) return;

  var titleEl = document.getElementById("desk-agent");
  var stage = document.getElementById("desk-stage");
  var filesEl = document.getElementById("desk-files");
  var termEl = document.getElementById("desk-term");
  var browserEl = document.getElementById("desk-browser");
  var statusEl = document.getElementById("desk-status");
  var openBtn = document.getElementById("btn-desk");
  var backBtn = document.getElementById("btn-desk-back");
  var agentId = "";
  var agentName = "Agente";
  var app = "files";

  function key() {
    return "glou-desk-" + (agentId || "none");
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(key()) || "null") || defaultState();
    } catch (_) {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      files: [
        { name: "brief.md", body: "Encargo en curso." },
        { name: "notas.txt", body: "Lo que no puede olvidar este agente." }
      ],
      url: "https://",
      log: [
        agentName.toLowerCase() + "@glou ~ % ready",
        "# pantalla de " + agentName,
        "# archivos · navegador · terminal"
      ]
    };
  }

  function saveState(state) {
    localStorage.setItem(key(), JSON.stringify(state));
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

  function renderFiles(state) {
    filesEl.innerHTML = state.files.map(function (f, i) {
      return "<button type=\"button\" class=\"desk-file\" data-file=\"" + i + "\"><b>" +
        escapeHtml(f.name) + "</b><span>" + escapeHtml((f.body || "").slice(0, 42)) + "</span></button>";
    }).join("") || "<p class=\"desk-empty\">Sin archivos todavía.</p>";
  }

  function renderTerm(state) {
    termEl.textContent = (state.log || []).join("\n");
    termEl.scrollTop = termEl.scrollHeight;
  }

  function renderBrowser(state) {
    var bar = document.getElementById("desk-url");
    if (bar) bar.value = state.url || "https://";
    browserEl.innerHTML =
      "<div class=\"desk-page\"><em>" + escapeHtml(agentName) + "</em> está en su navegador.<br/>" +
      "Sesión de esta pantalla, no de la tuya.<p>" + escapeHtml(state.url || "https://") + "</p></div>";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function paint() {
    var state = loadState();
    if (titleEl) titleEl.textContent = "PC · " + agentName;
    if (statusEl) statusEl.textContent = "en línea";
    renderFiles(state);
    renderTerm(state);
    renderBrowser(state);
    showApp(app);
  }

  async function resolveAgent() {
    var name = (document.getElementById("chat-name") || {}).textContent || "";
    agentName = name || "Agente";
    try {
      var specs = await (await fetch("/api/specialists")).json();
      var hit = specs.find(function (s) { return s.name === name; });
      agentId = hit ? hit.id : (name || "agente").toLowerCase();
    } catch (_) {
      agentId = name || "agente";
    }
  }

  async function openDesk() {
    var chat = document.getElementById("chat");
    if (chat && !chat.classList.contains("active")) return;
    await resolveAgent();
    paint();
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
    var file = e.target.closest("[data-file]");
    if (file) {
      var state = loadState();
      var item = state.files[+file.getAttribute("data-file")];
      if (!item) return;
      var next = prompt("Editar " + item.name, item.body || "");
      if (next == null) return;
      item.body = next;
      saveState(state);
      paint();
    }
  });

  var addFile = document.getElementById("desk-add-file");
  if (addFile) addFile.addEventListener("click", function () {
    var name = prompt("Nombre del archivo", "entrega.md");
    if (!name) return;
    var state = loadState();
    state.files.push({ name: name, body: "" });
    state.log.push(agentName.toLowerCase() + "@glou ~ % touch " + name);
    saveState(state);
    paint();
  });

  var urlForm = document.getElementById("desk-url-form");
  if (urlForm) urlForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var state = loadState();
    var url = (document.getElementById("desk-url") || {}).value || "https://";
    state.url = url;
    state.log.push(agentName.toLowerCase() + "@glou ~ % open " + url);
    saveState(state);
    paint();
    showApp("browser");
  });

  var termForm = document.getElementById("desk-term-form");
  if (termForm) termForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var field = document.getElementById("desk-cmd");
    var cmd = (field && field.value || "").trim();
    if (!cmd) return;
    var state = loadState();
    state.log.push(agentName.toLowerCase() + "@glou ~ % " + cmd);
    state.log.push("ok");
    saveState(state);
    if (field) field.value = "";
    paint();
    showApp("term");
  });
})();
