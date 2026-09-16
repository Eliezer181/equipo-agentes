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

  // ---------- Navegador: Chrome real en la nube (Browserbase) ----------
  var chromeBtn = document.getElementById("desk-chrome-toggle");
  var bb = { on: false, viewerUrl: "", expiresAt: "" };

  function bbRender() {
    if (!browserEl) return;
    if (chromeBtn) {
      chromeBtn.textContent = bb.on ? "Apagar Chrome real" : "\u26a1 Chrome real";
      chromeBtn.classList.toggle("on", bb.on);
      chromeBtn.title = bb.on ? ("Expira: " + bb.expiresAt) : "Enciende un Chrome real en la nube";
    }
    if (bb.on && bb.viewerUrl) {
      browserEl.classList.add("browsing");
      // navbar=false: la barra de Browserbase queda oculta, usamos la nuestra.
      var viewer = bb.viewerUrl + (bb.viewerUrl.indexOf("?") === -1 ? "?" : "&") + "navbar=false";
      browserEl.innerHTML =
        "<div class=\"desk-real-badge\">\u25cf Chrome en vivo (se apaga solo a los 15 min)</div>" +
        "<button type=\"button\" class=\"desk-fs-exit\" title=\"Achicar\">\u2715</button>" +
        "<div class=\"desk-frame-wrap\">" +
        "<iframe class=\"desk-frame\" src=\"" + viewer + "\" " +
        "allow=\"clipboard-read; clipboard-write\" title=\"Chrome del agente\"></iframe>" +
        "<div class=\"desk-touch-overlay\"></div>" +
        "<div class=\"desk-cursor\"></div>" +
        "</div>" +
        "<div class=\"desk-touch-bar\">" +
        "<button type=\"button\" data-tk=\"up\">\u2191</button>" +
        "<button type=\"button\" data-tk=\"down\">\u2193</button>" +
        "<button type=\"button\" data-tk=\"kb\">\u2328 Escribir</button>" +
        "<button type=\"button\" data-tk=\"enter\">\u23ce</button>" +
        "<button type=\"button\" data-tk=\"back\">\u2190 Atr\u00e1s</button>" +
        "</div>";
      desk.classList.add("desk-fullscreen");
      attachTouchCursor();
      attachTouchBar();
      var exitBtn = browserEl.querySelector(".desk-fs-exit");
      if (exitBtn) exitBtn.addEventListener("click", function () {
        desk.classList.remove("desk-fullscreen");
      });
    } else {
      desk.classList.remove("desk-fullscreen");
    }
  }

  // ---------- Cursor táctil: sigue el dedo y hace click donde tocás ----------
  function attachTouchCursor() {
    var wrap = browserEl.querySelector(".desk-frame-wrap");
    var overlay = browserEl.querySelector(".desk-touch-overlay");
    var cursor = browserEl.querySelector(".desk-cursor");
    if (!wrap || !overlay || !cursor) return;
    var dragging = false, startX = 0, startY = 0, moved = false;

    function place(clientX, clientY) {
      var r = wrap.getBoundingClientRect();
      var lx = Math.min(r.width, Math.max(0, clientX - r.left));
      var ly = Math.min(r.height, Math.max(0, clientY - r.top));
      cursor.style.left = lx + "px";
      cursor.style.top = ly + "px";
      cursor.style.opacity = "1";
      return [lx / r.width, ly / r.height];
    }
    function onDown(cx, cy) {
      dragging = true; moved = false; startX = cx; startY = cy;
      place(cx, cy);
      cursor.classList.add("pressed");
    }
    function onMove(cx, cy) {
      if (!dragging) return;
      if (Math.abs(cx - startX) > 6 || Math.abs(cy - startY) > 6) moved = true;
      place(cx, cy);
    }
    async function onUp(cx, cy) {
      cursor.classList.remove("pressed");
      if (!dragging) return;
      dragging = false;
      var frac = place(cx, cy);
      if (moved) {
        setTimeout(function () { cursor.style.opacity = "0"; }, 500);
        return;
      }
      cursor.classList.add("tap");
      setTimeout(function () { cursor.classList.remove("tap"); }, 220);
      try {
        await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "click_xy", x: frac[0], y: frac[1] })
        });
      } catch (err) { /* toque perdido, no interrumpe */ }
      setTimeout(function () { cursor.style.opacity = "0"; }, 900);
    }
    overlay.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; onDown(t.clientX, t.clientY);
    }, { passive: true });
    overlay.addEventListener("touchmove", function (e) {
      var t = e.touches[0]; onMove(t.clientX, t.clientY);
    }, { passive: true });
    overlay.addEventListener("touchend", function (e) {
      var t = e.changedTouches[0]; onUp(t.clientX, t.clientY);
    });
    overlay.addEventListener("mousedown", function (e) { onDown(e.clientX, e.clientY); });
    overlay.addEventListener("mousemove", function (e) { if (dragging) onMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", function (e) { if (dragging) onUp(e.clientX, e.clientY); });
  }

  // ---------- Barra flotante: scroll, teclado, enter, atrás ----------
  function attachTouchBar() {
    var bar = browserEl.querySelector(".desk-touch-bar");
    if (!bar) return;
    bar.addEventListener("click", async function (e) {
      var btn = e.target.closest("button[data-tk]");
      if (!btn) return;
      var tk = btn.getAttribute("data-tk");
      try {
        if (tk === "up") await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "scroll", text: "up" })
        });
        else if (tk === "down") await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "scroll", text: "down" })
        });
        else if (tk === "enter") await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "key", text: "Enter" })
        });
        else if (tk === "back") await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "back" })
        });
        else if (tk === "kb") {
          var txt = window.prompt("Toc\u00e1 primero el campo en la pantalla, despu\u00e9s escrib\u00ed aqu\u00ed:");
          if (txt) await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ do: "type_focused", text: txt })
          });
        }
      } catch (err) { toast(err.message || "no se pudo"); }
    });
  }

  async function bbStatus() {
    try {
      var st = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser");
      bb.on = !!st.on;
      bb.viewerUrl = st.viewerUrl || "";
      bb.expiresAt = st.expiresAt || "";
      bbRender();
    } catch (err) { /* sin estado */ }
  }

  if (chromeBtn) chromeBtn.addEventListener("click", async function () {
    if (bb.on) {
      bb = { on: false, viewerUrl: "", expiresAt: "" };
      browserEl.innerHTML = "<p class=\"desk-empty\">Chrome real apagado.</p>";
      bbRender();
      pushTerm(["$ chrome stop"]);
      try { await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ do: "stop" })
      }); } catch (err) {}
      return;
    }
    chromeBtn.textContent = "Encendiendo\u2026";
    pushTerm(["$ chrome start"]);
    try {
      var st = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ do: "start" })
      });
      bb.on = !!st.on; bb.viewerUrl = st.viewerUrl || ""; bb.expiresAt = st.expiresAt || "";
      bbRender();
      pushTerm(["\u2192 navegador en vivo listo"]);
    } catch (err) {
      chromeBtn.textContent = "\u26a1 Chrome real";
      if (err.message.indexOf("premium") !== -1) {
        browserEl.innerHTML =
          "<div class=\"desk-premium\"><b>\u26a1 L\u00edmite del plan gratis alcanzado</b>" +
          "<p>Ya hay 2 navegadores encendidos. Para encender un 3ero, " +
          "activ\u00e1 la suscripci\u00f3n premium (US$30/mes) desde tu perfil.</p></div>";
      } else {
        browserEl.innerHTML = "<p class=\"desk-empty\">No se pudo encender: " + escapeHtml(err.message) + "</p>";
      }
    }
  });

  // Como un navegador de verdad: si no parece una URL/dominio, lo busca en Google
  function omniboxUrl(input) {
    var v = (input || "").trim();
    if (/^https?:\/\//i.test(v)) return v;
    v = v.replace(/^\/+/, "");
    var looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+([:/?#].*)?$/i.test(v) ||
      /^localhost(:\d+)?/i.test(v);
    if (looksLikeDomain && v.indexOf(" ") === -1) return "https://" + v;
    return "https://www.google.com/search?q=" + encodeURIComponent(v);
  }

  var urlForm = document.getElementById("desk-url-form");
  if (urlForm) urlForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var raw = ((document.getElementById("desk-url") || {}).value || "").trim();
    if (!raw) return;
    var url = omniboxUrl(raw);
    showApp("browser");
    if (bb.on) {
      // Chrome real: navega la sesión en vivo (el iframe se actualiza solo)
      pushTerm(["$ chrome open " + url]);
      var badge = browserEl.querySelector(".desk-real-badge");
      if (badge) badge.textContent = "\u25cf navegando\u2026";
      try {
        var r = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "navigate", url: url })
        });
        pushTerm(["\u2192 " + (r.title || r.url)]);
      } catch (err) {
        alert("No se pudo navegar: " + err.message);
      }
      return;
    }
    // Sin Chrome real: vista estática rápida vía proxy
    browserEl.innerHTML = "<p class=\"desk-empty\">Cargando " + escapeHtml(url) + "…</p>";
    var proxy = "/api/specialists/" + encodeURIComponent(agentId) +
      "/computer/proxy?url=" + encodeURIComponent(url);
    pushTerm(["$ open " + url]);
    browserEl.classList.add("browsing");
    browserEl.innerHTML =
      "<iframe class=\"desk-frame\" src=\"" + proxy + "\" " +
      "sandbox=\"\" referrerpolicy=\"no-referrer\" title=\"navegador del agente\"></iframe>";
  });

  bbStatus();

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
