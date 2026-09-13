(function () {
  let replyTarget = null;

  function members() {
    return (current && current.type === "group" && current.members) || [];
  }

  function rich(text) {
    const src = String(text || "");
    const out = [];
    const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/g;
    let last = 0, m;
    while ((m = re.exec(src))) {
      out.push(escapeHtml(src.slice(last, m.index)));
      if (m[2]) out.push('<img class="msg-img" alt="' + escapeHtml(m[1]) + '" src="' + escapeHtml(m[2]) + '">');
      else if (m[4]) out.push('<a class="msg-link" href="' + escapeHtml(m[4]) + '" target="_blank" rel="noopener">' + escapeHtml(m[3]) + '</a>');
      else {
        const url = m[5].replace(/[),.;]+$/, "");
        const img = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || /wikimedia|loremflickr|unsplash|imgur/i.test(url);
        out.push(img
          ? '<img class="msg-img" src="' + escapeHtml(url) + '" alt="">'
          : '<a class="msg-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a>');
      }
      last = m.index + m[0].length;
    }
    out.push(escapeHtml(src.slice(last)));
    return out.join("").replace(/@([\wÁ-ÚÑá-úñ-]+)/g, '<span class="mention">@$1</span>');
  }

  window.groupBubble = function (m) {
    const quote = m.reply_to_name ? '<div class="quote">↪ ' + escapeHtml(m.reply_to_name) + '</div>' : "";
    if (m.role === "user") {
      return '<div class="bubble user">' + quote + '<div class="sender user-sender">' + escapeHtml((current && current.leader) || "Líder") + '</div>' + rich(m.content) + '</div>';
    }
    const color = m.color || "#f97316";
    const sender = m.sender || "";
    const mid = m.member_id || "";
    return '<div class="bubble assistant swipeable" data-sender="' + escapeHtml(sender) + '" data-member="' + escapeHtml(mid) + '">' +
      '<button type="button" class="reply-hit" data-reply="1">↩</button>' +
      quote + '<div class="sender" style="color:' + color + '">' + escapeHtml(sender) + '</div>' + rich(m.content) +
      '</div>';
  };

  const prevRender = renderThread;
  renderThread = function (messages) {
    if (!current) return;
    if (current.type === "group") {
      thread.innerHTML = (messages || []).map(window.groupBubble).join("");
    } else {
      thread.innerHTML = (messages || []).map(function (x) {
        return '<div class="bubble ' + x.role + '">' + rich(x.content) + '</div>';
      }).join("");
    }
    thread.scrollTop = thread.scrollHeight;
  };

  function bar() {
    var el = document.getElementById("reply-bar");
    if (el) return el;
    el = document.createElement("div");
    el.id = "reply-bar";
    el.className = "reply-bar hidden";
    el.innerHTML = '<div class="reply-copy"><b id="reply-who"></b><span id="reply-preview"></span></div><button type="button" id="btn-cancel-reply">x</button>';
    document.getElementById("composer").parentNode.insertBefore(el, document.getElementById("composer"));
    document.getElementById("btn-cancel-reply").onclick = function () { setReply(null); };
    return el;
  }

  function mentionsEl() {
    var el = document.getElementById("mention-box");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mention-box";
    el.className = "mention-box hidden";
    document.getElementById("composer").parentNode.insertBefore(el, document.getElementById("composer"));
    return el;
  }

  function setReply(memberId, sender, preview) {
    bar();
    replyTarget = memberId ? { member_id: memberId, sender: sender } : null;
    if (!replyTarget) {
      bar().classList.add("hidden");
      return;
    }
    document.getElementById("reply-who").textContent = "Respondiendo a " + (sender || "agente");
    document.getElementById("reply-preview").textContent = String(preview || "").replace(/\s+/g, " ").slice(0, 80);
    bar().classList.remove("hidden");
    input.focus();
  }

  function idFromBubble(bubble) {
    if (!bubble) return "";
    if (bubble.getAttribute("data-member")) return bubble.getAttribute("data-member");
    var sender = bubble.getAttribute("data-sender");
    var hit = members().filter(function (m) { return m.name === sender; })[0];
    return hit ? hit.id : "";
  }

  function openMentions(filter) {
    var box = mentionsEl();
    var q = String(filter || "").toLowerCase();
    var list = members().filter(function (m) { return !q || m.name.toLowerCase().indexOf(q) >= 0; });
    if (!list.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.innerHTML = list.map(function (m) {
      return '<button type="button" class="mention-row" data-mention="' + escapeHtml(m.name) + '">' +
        (typeof buddySvg === "function" ? buddySvg(m, 24) : "") +
        '<span>@' + escapeHtml(m.name) + '</span></button>';
    }).join("");
    box.classList.remove("hidden");
  }

  function hideMentions() {
    var box = document.getElementById("mention-box");
    if (box) {
      box.classList.add("hidden");
      box.innerHTML = "";
    }
  }

  function insertMention(name) {
    var val = input.value;
    var at = val.lastIndexOf("@");
    input.value = (at >= 0 ? val.slice(0, at) : val) + "@" + name + " ";
    hideMentions();
    input.focus();
  }

  async function paintAdd() {
    var host = document.getElementById("add-member-list");
    if (!host || !current || current.type !== "group") return;
    var list = [];
    try { list = await (await fetch("/api/specialists")).json(); } catch (e) { list = specialists || []; }
    var inside = {};
    members().forEach(function (m) { inside[String(m.id)] = true; });
    var extras = (list || []).filter(function (s) { return s && s.id && !inside[String(s.id)]; });
    if (!extras.length) {
      host.innerHTML = '<p class="hint-inline">Todos tus agentes ya están en este grupo. Creá otro con + para sumarlo.</p>';
      return;
    }
    host.innerHTML = extras.map(function (s) {
      return '<button type="button" class="add-one" data-add="' + s.id + '">' +
        (typeof buddySvg === "function" ? buddySvg(s, 28) : "") +
        '<span>' + escapeHtml(s.name) + '</span></button>';
    }).join("");
  }

  var oldInfo = openGroupInfo;
  openGroupInfo = function () {
    oldInfo();
    paintAdd();
  };

  document.addEventListener("click", async function (e) {
    var add = e.target.closest("[data-add]");
    if (add && current && current.type === "group") {
      var res = await fetch("/api/groups/" + current.id + "/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: add.getAttribute("data-add") })
      });
      var payload = await res.json();
      if (!res.ok) return alert(payload.detail || "No se pudo agregar");
      var fresh = await refreshGroup(current.id);
      current = { type: "group", ...(fresh || payload) };
      document.getElementById("chat-title").textContent = current.members.length + " integrantes";
      document.getElementById("chat-dot").innerHTML = packSvg(current.members, 42);
      openGroupInfo();
      return;
    }
    var mention = e.target.closest("[data-mention]");
    if (mention) {
      insertMention(mention.getAttribute("data-mention"));
      return;
    }
    var reply = e.target.closest("[data-reply]");
    if (reply) {
      var bubble = reply.closest(".bubble.assistant");
      if (bubble) setReply(idFromBubble(bubble), bubble.getAttribute("data-sender"), bubble.textContent);
      return;
    }
    var atBtn = e.target.closest("#btn-at");
    if (atBtn) {
      if (input.value.slice(-1) !== "@") input.value += (input.value && !/\s$/.test(input.value) ? " @" : "@");
      openMentions("");
      input.focus();
    }
  });

  input.addEventListener("input", function () {
    if (!current || current.type !== "group") return hideMentions();
    var val = input.value;
    var at = val.lastIndexOf("@");
    if (at < 0) return hideMentions();
    var after = val.slice(at + 1);
    if (/\s/.test(after)) return hideMentions();
    openMentions(after);
  });

  var swipe = null;
  thread.addEventListener("touchstart", function (e) {
    var bubble = e.target.closest(".bubble.assistant.swipeable");
    if (!bubble || !current || current.type !== "group") return;
    var t = e.changedTouches[0];
    swipe = { bubble: bubble, x: t.clientX, y: t.clientY, dx: 0 };
  }, { passive: true });
  thread.addEventListener("touchmove", function (e) {
    if (!swipe) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - swipe.x;
    var dy = t.clientY - swipe.y;
    if (Math.abs(dy) > Math.abs(dx) + 8) {
      swipe.bubble.style.transform = "";
      swipe = null;
      return;
    }
    swipe.dx = dx;
    swipe.bubble.style.transform = "translateX(" + Math.max(0, Math.min(80, dx)) + "px)";
  }, { passive: true });
  thread.addEventListener("touchend", function () {
    if (!swipe) return;
    var bubble = swipe.bubble;
    var dx = swipe.dx;
    bubble.style.transform = "";
    swipe = null;
    if (dx > 44) setReply(idFromBubble(bubble), bubble.getAttribute("data-sender"), bubble.textContent);
  }, { passive: true });

  var form = document.getElementById("composer");
  form.addEventListener("submit", function () {
    hideMentions();
    if (replyTarget) form.dataset.replyTo = replyTarget.member_id;
    else delete form.dataset.replyTo;
    form.dataset.replyName = (replyTarget && replyTarget.sender) || "";
    setReply(null);
  }, true);

  var oldSubmit = form.onsubmit;
  form.onsubmit = async function (e) {
    e.preventDefault();
    if (!current) return;
    var message = input.value.trim();
    if (!message) return;
    input.value = "";
    hideMentions();
    var replyTo = form.dataset.replyTo || "";
    var replyName = form.dataset.replyName || "";
    delete form.dataset.replyTo;
    delete form.dataset.replyName;
    var url = current.type === "group" ? "/api/groups/" + current.id + "/chat" : "/api/specialists/" + current.id + "/chat";
    var body = { message: message };
    if (replyTo) body.reply_to = replyTo;
    thread.insertAdjacentHTML("beforeend", current.type === "group"
      ? window.groupBubble({ role: "user", content: message, reply_to_name: replyName })
      : '<div class="bubble user">' + escapeHtml(message) + '</div>');
    if (current.type === "group") {
      thread.insertAdjacentHTML("beforeend", '<div class="bubble assistant thinking" id="thinking"><div class="sender">Escribiendo…</div></div>');
    }
    thread.scrollTop = thread.scrollHeight;
    var sendBtn = form.querySelector("button[type=submit]");
    sendBtn.disabled = true;
    try {
      var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      var payload = await res.json();
      var thinking = document.getElementById("thinking");
      if (thinking) thinking.remove();
      if (!res.ok) {
        thread.insertAdjacentHTML("beforeend", '<div class="bubble assistant">Error: ' + escapeHtml(payload.detail || "no se pudo responder") + '</div>');
        return;
      }
      if (current.type === "group") {
        (payload.replies || []).forEach(function (item) {
          thread.insertAdjacentHTML("beforeend", window.groupBubble(item));
        });
        thread.scrollTop = thread.scrollHeight;
      } else {
        renderThread(payload.messages);
      }
    } finally {
      sendBtn.disabled = false;
      var t2 = document.getElementById("thinking");
      if (t2) t2.remove();
    }
  };

  bar();
  mentionsEl();
})();
