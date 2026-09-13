let replyTarget = null;

function renderRich(text) {
  const src = String(text || "");
  const out = [];
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out.push(escapeHtml(src.slice(last, m.index)));
    if (m[2]) out.push(`<img class="msg-img" alt="${escapeHtml(m[1])}" src="${escapeHtml(m[2])}">`);
    else if (m[4]) out.push(`<a class="msg-link" href="${escapeHtml(m[4])}" target="_blank" rel="noopener">${escapeHtml(m[3])}</a>`);
    else {
      const url = m[5].replace(/[),.;]+$/, "");
      const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || /loremflickr|wikimedia|upload\.wikimedia|unsplash|imgur/i.test(url);
      out.push(isImg
        ? `<img class="msg-img" src="${escapeHtml(url)}" alt="">`
        : `<a class="msg-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
    }
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(src.slice(last)));
  return out.join("").replace(/@([\wÁÉÍÓÚÜÑáéíóúüñ-]+)/g, '<span class="mention">@$1</span>');
}

function groupBubble(m) {
  const mid = m.member_id || "";
  const quote = m.reply_to_name ? `<div class="quote">↪ ${escapeHtml(m.reply_to_name)}</div>` : "";
  if (m.role === "user") {
    return `<div class="bubble user" data-sender="${escapeHtml(current.leader || "Líder")}">${quote}<div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${renderRich(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  return `<div class="bubble assistant swipeable" data-sender="${escapeHtml(m.sender || "")}" data-member="${escapeHtml(mid)}">${quote}<div class="sender" style="color:${color}">${escapeHtml(m.sender)}</div>${renderRich(m.content)}</div>`;
}

renderThread = function (messages) {
  if (!current) return;
  if (current.type === "group") {
    thread.innerHTML = (messages || []).map((m) => groupBubble(m)).join("");
  } else {
    thread.innerHTML = (messages || []).map((m) => `<div class="bubble ${m.role}">${renderRich(m.content)}</div>`).join("");
  }
  thread.scrollTop = thread.scrollHeight;
};

function setReplyTarget(memberId, sender, preview) {
  replyTarget = memberId ? { member_id: memberId, sender } : null;
  const bar = document.getElementById("reply-bar");
  if (!bar) return;
  if (!replyTarget) {
    bar.classList.add("hidden");
    return;
  }
  document.getElementById("reply-who").textContent = sender || "agente";
  document.getElementById("reply-preview").textContent = (preview || "").replace(/\s+/g, " ").slice(0, 80);
  bar.classList.remove("hidden");
  input.focus();
}

function fillAddSelect() {
  const box = document.getElementById("add-member-select");
  if (!box || !current || current.type !== "group") return;
  const inside = new Set((current.members || []).map((m) => m.id));
  const extras = (specialists || []).filter((s) => s && s.id && !inside.has(s.id));
  if (!extras.length) {
    box.innerHTML = `<option value="">No hay más agentes para sumar</option>`;
    box.disabled = true;
    return;
  }
  box.disabled = false;
  box.innerHTML = extras.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

const _openGroupInfo = openGroupInfo;
openGroupInfo = async function () {
  _openGroupInfo();
  try {
    specialists = await (await fetch("/api/specialists")).json();
  } catch (_) {}
  fillAddSelect();
};

const addBtn = document.getElementById("btn-add-member");
if (addBtn) {
  addBtn.onclick = async () => {
    if (!current || current.type !== "group") return;
    await openGroupInfo();
    const sid = document.getElementById("add-member-select").value;
    if (!sid) {
      alert("Creá otro agente con + si querés sumarlo. Los que ya están en el grupo no aparecen.");
      return;
    }
    const res = await fetch(`/api/groups/${current.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: sid }),
    });
    const payload = await res.json();
    if (!res.ok) return alert(payload.detail || "No se pudo agregar");
    const fresh = await refreshGroup(current.id);
    current = { type: "group", ...fresh };
    document.getElementById("chat-title").textContent = `${current.members.length} integrantes`;
    document.getElementById("chat-dot").innerHTML = packSvg(current.members, 42);
    openGroupInfo();
  };
}

const cancelReply = document.getElementById("btn-cancel-reply");
if (cancelReply) cancelReply.onclick = () => setReplyTarget(null);

let swipe = null;
thread.addEventListener("pointerdown", (e) => {
  if (!current || current.type !== "group") return;
  const bubble = e.target.closest(".bubble.assistant.swipeable");
  if (!bubble) return;
  swipe = { bubble, x: e.clientX, y: e.clientY, moved: false };
});
thread.addEventListener("pointermove", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
  if (Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
  swipe.moved = true;
  swipe.bubble.style.transform = `translateX(${Math.max(0, Math.min(72, dx))}px)`;
});
thread.addEventListener("pointerup", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const bubble = swipe.bubble;
  bubble.style.transform = "";
  const ready = swipe.moved && dx > 56;
  const sender = bubble.dataset.sender;
  const member = bubble.dataset.member;
  swipe = null;
  if (!ready) return;
  const mid = member || ((current.members || []).find((m) => m.name === sender) || {}).id;
  setReplyTarget(mid, sender, bubble.textContent);
});
thread.addEventListener("pointercancel", () => {
  if (swipe) swipe.bubble.style.transform = "";
  swipe = null;
});

const composer = document.getElementById("composer");
const prevSubmit = composer.onsubmit;
composer.onsubmit = async (e) => {
  e.preventDefault();
  if (!current) return;
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  const target = replyTarget;
  setReplyTarget(null);
  const url = current.type === "group"
    ? `/api/groups/${current.id}/chat`
    : `/api/specialists/${current.id}/chat`;
  const body = { message };
  if (current.type === "group" && target && target.member_id) body.reply_to = target.member_id;
  thread.insertAdjacentHTML("beforeend", current.type === "group"
    ? groupBubble({ role: "user", content: message, reply_to_name: target && target.sender })
    : `<div class="bubble user">${escapeHtml(message)}</div>`);
  if (current.type === "group") {
    const who = target ? target.sender : "El equipo";
    thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant thinking" id="thinking"><div class="sender">${escapeHtml(who)} está escribiendo…</div></div>`);
  }
  thread.scrollTop = thread.scrollHeight;
  const sendBtn = e.target.querySelector("button[type=submit]");
  sendBtn.disabled = true;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      thread.insertAdjacentHTML("beforeend", `<div class="bubble assistant">Error: ${escapeHtml(payload.detail || "no se pudo responder")}</div>`);
      return;
    }
    if (current.type === "group") {
      const thinking = document.getElementById("thinking");
      if (thinking) thinking.remove();
      for (const reply of payload.replies || []) {
        thread.insertAdjacentHTML("beforeend", groupBubble(reply));
        thread.scrollTop = thread.scrollHeight;
        await new Promise((r) => setTimeout(r, 160));
      }
    } else {
      renderThread(payload.messages);
    }
  } finally {
    sendBtn.disabled = false;
    const thinking = document.getElementById("thinking");
    if (thinking) thinking.remove();
  }
};
