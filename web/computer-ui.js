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
  var bb = { on: false, viewerUrl: "", expiresAt: "", vpW: 1600, vpH: 900 };

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
        "<div class=\"desk-touch-overlay\"></div>" +
        "<div class=\"desk-frame-wrap\">" +
        "<div class=\"desk-frame-box\">" +
        "<iframe class=\"desk-frame\" src=\"" + viewer + "\" " +
        "allow=\"clipboard-read; clipboard-write\" title=\"Chrome del agente\"></iframe>" +
        "<div class=\"desk-cursor\"><svg viewBox='0 0 24 24' width='22' height='22'><path d='M4 2 L20 12.5 L12.3 13.8 L9 21 Z' fill='#f5f5f7' stroke='#0a0a0a' stroke-width='1.3' stroke-linejoin='round'/></svg></div>" +
        "</div>" +
        "</div>" +
        "<button type=\"button\" class=\"desk-corner-btn desk-corner-clip\" title=\"Portapapeles\"><svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='6' y='4' width='12' height='17' rx='2'/><path d='M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1'/><path d='M9 10h6M9 14h6M9 18h3'/></svg></button>" +
        "<button type=\"button\" class=\"desk-corner-btn desk-corner-kb\" title=\"Teclado\"><svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='6' width='20' height='12' rx='2'/><path d='M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12'/></svg></button>" +
        "<input class=\"desk-hidden-input\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" />";
      desk.classList.add("desk-fullscreen");
      sizeFrameBox();
      attachTouchCursor();
      attachKeyboard();
      attachClipboard();
      window.addEventListener("resize", sizeFrameBox);
      var exitBtn = browserEl.querySelector(".desk-fs-exit");
      if (exitBtn) exitBtn.addEventListener("click", function () {
        desk.classList.remove("desk-fullscreen");
      });
    } else {
      desk.classList.remove("desk-fullscreen");
    }
  }

  // Ajusta el tamaño del recuadro interno para que tenga EXACTAMENTE la misma
  // proporción que el viewport remoto (16:9 por defecto) -> sin franjas en
  // blanco/letterbox, así las coordenadas fraccionarias del toque coinciden
  // 1:1 con lo que se ve y con lo que recibe Playwright del lado del server.
  function sizeFrameBox() {
    var wrap = browserEl.querySelector(".desk-frame-wrap");
    var box = browserEl.querySelector(".desk-frame-box");
    if (!wrap || !box) return;
    var availW = wrap.clientWidth, availH = wrap.clientHeight;
    var ratio = bb.vpW / bb.vpH;
    var w = availW, h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    box.style.width = w + "px";
    box.style.height = h + "px";
  }

  // ---------- Cursor tipo flecha: se mueve como un trackpad (relativo al
  // arrastre, no pegado al dedo) para que el dedo nunca tape lo que apuntás.
  function attachTouchCursor() {
    // OJO: usamos el recuadro interno (proporción exacta 16:9), no el wrap
    // exterior, para que la fracción 0..1 coincida 1:1 con el viewport real.
    var wrap = browserEl.querySelector(".desk-frame-box");
    var overlay = browserEl.querySelector(".desk-touch-overlay");
    var cursor = browserEl.querySelector(".desk-cursor");
    if (!wrap || !overlay || !cursor) return;
    var virt = { fx: 0.5, fy: 0.5 };
    var dragging = false, lastX = 0, lastY = 0, movedDist = 0, twoFinger = false, scrollAcc = 0;

    function render() {
      var r = wrap.getBoundingClientRect();
      cursor.style.left = (virt.fx * r.width) + "px";
      cursor.style.top = (virt.fy * r.height) + "px";
      cursor.style.opacity = "1";
    }
    function onDown(cx, cy) {
      dragging = true; lastX = cx; lastY = cy; movedDist = 0;
      cursor.classList.add("pressed");
      render();
    }
    function onMove(cx, cy) {
      if (!dragging) return;
      var r = wrap.getBoundingClientRect();
      var dx = cx - lastX, dy = cy - lastY;
      lastX = cx; lastY = cy;
      movedDist += Math.abs(dx) + Math.abs(dy);
      virt.fx = Math.min(1, Math.max(0, virt.fx + dx / r.width));
      virt.fy = Math.min(1, Math.max(0, virt.fy + dy / r.height));
      render();
    }
    async function onUp() {
      cursor.classList.remove("pressed");
      if (!dragging) return;
      dragging = false;
      if (twoFinger) { twoFinger = false; scrollAcc = 0; return; }
      if (movedDist > 10) return; // fue un arrastre para reposicionar, no un tap
      cursor.classList.add("tap");
      setTimeout(function () { cursor.classList.remove("tap"); }, 220);
      try {
        await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "click_xy", x: virt.fx, y: virt.fy })
        });
      } catch (err) { /* toque perdido, no interrumpe */ }
    }
    async function onTwoFingerMove(dy) {
      scrollAcc += dy;
      if (Math.abs(scrollAcc) < 45) return;
      var dir = scrollAcc > 0 ? "down" : "up";
      scrollAcc = 0;
      try {
        await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ do: "scroll", text: dir })
        });
      } catch (err) { /* silencioso */ }
    }
    var lastTwoY = 0;
    overlay.addEventListener("touchstart", function (e) {
      if (e.touches.length >= 2) {
        twoFinger = true; dragging = true;
        lastTwoY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        return;
      }
      var t = e.touches[0]; onDown(t.clientX, t.clientY);
    }, { passive: true });
    overlay.addEventListener("touchmove", function (e) {
      if (twoFinger && e.touches.length >= 2) {
        var y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        onTwoFingerMove(y - lastTwoY);
        lastTwoY = y;
        return;
      }
      var t = e.touches[0]; if (t) onMove(t.clientX, t.clientY);
    }, { passive: true });
    overlay.addEventListener("touchend", function (e) { if (e.touches.length === 0) onUp(); });
    overlay.addEventListener("mousedown", function (e) { onDown(e.clientX, e.clientY); });
    overlay.addEventListener("mousemove", function (e) { if (dragging && !twoFinger) onMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", function () { onUp(); });
    render();
  }

  // ---------- Teclado nativo real: un input invisible enfocable trae el
  // teclado del celular y cada tecla se reenvía al campo del navegador real.
  function attachKeyboard() {
    var kbBtn = browserEl.querySelector(".desk-corner-kb");
    var frameWrap = browserEl.querySelector(".desk-frame-wrap");
    var hidden = browserEl.querySelector(".desk-hidden-input");
    if (!kbBtn || !hidden) return;
    var lastSent = "", flushTimer = null;

    async function sendAction(body) {
      try {
        return await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
      } catch (err) { return null; }
    }
    async function flush() {
      var cur = hidden.value;
      if (cur === lastSent) return;
      if (cur.indexOf(lastSent) === 0) {
        var added = cur.slice(lastSent.length);
        if (added) await sendAction({ do: "type_focused", text: added });
      } else if (lastSent.indexOf(cur) === 0) {
        var delCount = lastSent.length - cur.length;
        for (var i = 0; i < delCount; i++) await sendAction({ do: "key", text: "Backspace" });
      } else {
        for (var j = 0; j < lastSent.length; j++) await sendAction({ do: "key", text: "Backspace" });
        if (cur) await sendAction({ do: "type_focused", text: cur });
      }
      lastSent = cur;
    }
    hidden.addEventListener("input", function () {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 180);
    });
    hidden.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(flushTimer);
        flush().then(function () { sendAction({ do: "key", text: "Enter" }); });
        hidden.value = ""; lastSent = "";
      }
    });
    hidden.addEventListener("focus", function () {
      kbBtn.classList.add("on");
    });
    hidden.addEventListener("blur", function () {
      kbBtn.classList.remove("on");
      clearTimeout(flushTimer);
      flush();
      hidden.value = ""; lastSent = "";
    });
    kbBtn.addEventListener("click", function () {
      if (document.activeElement === hidden) hidden.blur();
      else hidden.focus();
    });
    // La pantalla del PC se corre hacia arriba cuando aparece el teclado real
    // (visualViewport encoge cuando el teclado del celular se despliega).
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        var kbHeight = window.innerHeight - window.visualViewport.height;
        frameWrap.style.transform = kbHeight > 60 ? ("translateY(-" + Math.round(kbHeight * 0.45) + "px)") : "";
      });
    }
  }

  // ---------- Portapapeles: pegar desde el teléfono / copiar al teléfono ----------
  function attachClipboard() {
    var clipBtn = browserEl.querySelector(".desk-corner-clip");
    if (!clipBtn) return;
    clipBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var existing = browserEl.querySelector(".desk-clip-menu");
      if (existing) { existing.remove(); return; }
      var menu = document.createElement("div");
      menu.className = "desk-clip-menu";
      menu.innerHTML =
        "<button type=\"button\" data-clip=\"paste\"><svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='6' y='4' width='12' height='17' rx='2'/><path d='M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1'/></svg><span>Pegar desde el tel\u00e9fono</span></button>" +
        "<button type=\"button\" data-clip=\"copy\"><svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='9' y='9' width='11' height='11' rx='2'/><path d='M5 15V5a2 2 0 0 1 2-2h10'/></svg><span>Copiar al tel\u00e9fono</span></button>";
      browserEl.appendChild(menu);
      menu.addEventListener("click", async function (ev) {
        var b = ev.target.closest("button[data-clip]");
        if (!b) return;
        var kind = b.getAttribute("data-clip");
        menu.remove();
        try {
          if (kind === "paste") {
            var txt = await navigator.clipboard.readText();
            if (txt) await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ do: "type_focused", text: txt })
            });
          } else {
            var r = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ do: "read_selection" })
            });
            if (r.text) { await navigator.clipboard.writeText(r.text); toast("Copiado al tel\u00e9fono"); }
            else toast("No hay texto seleccionado");
          }
        } catch (err) { toast(err.message || "no se pudo"); }
      });
      setTimeout(function () {
        document.addEventListener("click", function onDoc(ev2) {
          if (!menu.contains(ev2.target) && ev2.target !== clipBtn) { menu.remove(); document.removeEventListener("click", onDoc); }
        });
      }, 0);
    });
  }

  async function bbStatus() {
    try {
      var st = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser");
      bb.on = !!st.on;
      bb.viewerUrl = st.viewerUrl || "";
      bb.expiresAt = st.expiresAt || "";
      bb.vpW = st.viewportWidth || bb.vpW;
      bb.vpH = st.viewportHeight || bb.vpH;
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
      bb.vpW = st.viewportWidth || bb.vpW; bb.vpH = st.viewportHeight || bb.vpH;
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

  var backBtn2 = document.getElementById("desk-back-btn");
  if (backBtn2) backBtn2.addEventListener("click", async function () {
    if (!bb.on) { toast("Encend\u00e9 el Chrome real primero"); return; }
    try {
      var r = await api("/api/specialists/" + encodeURIComponent(agentId) + "/browser", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ do: "back" })
      });
      pushTerm(["$ chrome back → " + (r.title || r.url)]);
    } catch (err) { toast(err.message || "no se pudo volver"); }
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
