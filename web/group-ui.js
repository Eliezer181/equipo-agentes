(function () {
  let replyTarget = null;
  function members() {
    return (current && current.type === "group" && current.members) || [];
  }
  function rich(text) {
    const src = String(text || "");
    const out = [];
    const re = /!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)\s]+)\)|\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)|(https?:\/\/[^\s<]+)/g;
    let last = 0, m;
    while ((m = re.exec(src))) {
      out.push(escapeHtml(src.slice(last, m.index)));
      if (m[2]) out.push('<img class="msg-img" alt="' + escapeHtml(m[1]) + '" src="' + escapeHtml(m[2]) + '">');
      else if (m[4]) {
        const isFile = /\/download(\?|$)/i.test(m[4]) || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip)(\?|$)/i.test(m[4]);
        out.push(isFile ? window.fileCardHTML(m[3], m[4]) : '<a class="msg-link" href="' + escapeHtml(m[4]) + '" target="_blank" rel="noopener">' + escapeHtml(m[3]) + '</a>');
      }
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
    const quote = m.reply_to_name ? '<div class="quote">↩ ' + escapeHtml(m.reply_to_name) + '</div>' : "";
    if (m.role === "user") {
      return '<div class="bubble user swipeable" data-sender="' + escapeHtml((current && current.leader) || "vos") + '">' + quote + '<div class="sender user-sender">' + escapeHtml((current && current.leader) || "Líder") + '</div>' + rich(m.content) + '</div>';
    }
    const color = m.color || "#f97316";
    const sender = m.sender || "";
    const mid = m.member_id || "";
    return '<div class="bubble assistant swipeable" data-sender="' + escapeHtml(sender) + '" data-member="' + escapeHtml(mid) + '">' +
      quote + '<div class="sender" style="color:' + color + '">' + escapeHtml(sender) + '</div>' + rich(m.content) + '</div>';
  };
  renderThread = function (messages) {
    if (!current) return;
    if (current.type === "group") {
      thread.innerHTML = (messages || []).map(window.groupBubble).join("");
    } else {
      thread.innerHTML = (messages || []).map(function (x) {
        const who = x.role === "user" ? "vos" : (current.name || "agente");
        return '<div class="bubble ' + x.role + ' swipeable" data-sender="' + escapeHtml(who) + '" data-member="' + escapeHtml(current.id || "") + '">' + rich(x.content) + '</div>';
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
    var quote = String(preview || "").replace(/\s+/g, " ").trim();
    replyTarget = (memberId || sender) ? { member_id: memberId || "", sender: sender || "", quote: quote } : null;
    if (!replyTarget) { bar().classList.add("hidden"); return; }
    document.getElementById("reply-who").textContent = "Respondiendo a " + (sender || "ese mensaje");
    document.getElementById("reply-preview").textContent = quote.slice(0, 80);
    bar().classList.remove("hidden");
    input.focus();
  }
  function idFromBubble(bubble) {
    if (!bubble) return "";
    if (bubble.getAttribute("data-member")) return bubble.getAttribute("data-member");
    var sender = bubble.getAttribute("data-sender");
    var hit = members().filter(function (m) { return m.name === sender; })[0];
    if (hit) return hit.id;
    if (current && current.type === "specialist") return current.id || "";
    return "";
  }
  function hideMentions() {
    var box = document.getElementById("mention-box");
    if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
  }
  var swipe = null;
  thread.addEventListener("touchstart", function (e) {
    var bubble = e.target.closest(".bubble.swipeable");
    if (!bubble || !current) return;
    var tch = e.changedTouches[0];
    swipe = { bubble: bubble, x: tch.clientX, y: tch.clientY, dx: 0 };
  }, { passive: true });
  thread.addEventListener("touchmove", function (e) {
    if (!swipe) return;
    var tch = e.changedTouches[0];
    var dx = tch.clientX - swipe.x;
    var dy = tch.clientY - swipe.y;
    if (Math.abs(dy) > Math.abs(dx) + 6) {
      swipe.bubble.style.transform = "";
      swipe = null;
      return;
    }
    swipe.dx = dx;
    swipe.bubble.style.transition = "none";
    swipe.bubble.style.transform = "translateX(" + Math.max(-72, Math.min(0, dx)) + "px)";
  }, { passive: true });
  function endSwipe() {
    if (!swipe) return;
    var bubble = swipe.bubble;
    var dx = swipe.dx || 0;
    swipe = null;
    bubble.style.transition = "transform .18s ease";
    bubble.style.transform = "";
    if (dx < -42) {
      var preview = (bubble.innerText || "").replace(/\s+/g, " ").trim();
      setReply(idFromBubble(bubble), bubble.getAttribute("data-sender"), preview);
    }
  }
  thread.addEventListener("touchend", endSwipe, { passive: true });
  thread.addEventListener("touchcancel", endSwipe, { passive: true });
  var form = document.getElementById("composer");
  form.addEventListener("submit", function () {
    hideMentions();
    if (replyTarget) {
      form.dataset.replyTo = replyTarget.member_id || "";
      form.dataset.replyName = replyTarget.sender || "";
      form.dataset.replyQuote = replyTarget.quote || "";
    } else {
      delete form.dataset.replyTo;
      delete form.dataset.replyName;
      delete form.dataset.replyQuote;
    }
    setReply(null);
  }, true);
  bar();
  mentionsEl();
})();
