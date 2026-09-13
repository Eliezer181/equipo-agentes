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

function memberIdByName(name) {
  const n = String(name || "").toLowerCase();
  const hit = ((current && current.members) || []).find((m) => (m.name || "").toLowerCase() === n);
  return hit ? hit.id : "";
}

function groupBubble(m) {
  const mid = m.member_id || memberIdByName(m.sender);
  const quote = m.reply_to_name ? `<div class="quote">↪ ${escapeHtml(m.reply_to_name)}</div>` : "";
  if (m.role === "user") {
    return `<div class="bubble user">${quote}<div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${renderRich(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  return `<div class="bubble assistant swipeable" data-sender="${escapeHtml(m.sender || "")}" data-member="${escapeHtml(mid)}">${quote}<div class="sender" style="color:${color}">${escapeHtml(m.sender)}</div>${renderRich(m.content)}<button type="button" class="reply-hit" data-reply="1" aria-label="Responder">↪</button></div>`;
}

renderThread = function (messages) {
  if (!current) return;
  if (current.type === "group") {
    thread.innerHTML = (messages || []).map((item) => groupBubble(item)).join("");
  } else {
    thread.innerHTML = (messages || []).map((item) => `<div class="bubble ${item.role}">${renderRich(item.content)}</div>`).join("");
  }
  thread.scrollTop = thread.scrollHeight;
};

function ensureReplyBar() {
  if (document.getElementById("reply-bar")) return document.getElementById("reply-bar");
  const bar = document.createElement("div");
  bar.id = "reply-bar";
  bar.className = "reply-bar hidden";
  bar.innerHTML = '<div class="reply-copy"><b id="reply-who"></b><span id="reply-preview"></span></div><button type="button" id="btn-cancel-reply">x</button>';
  document.getElementById("composer").before(bar);
  document.getElementById("btn-cancel-reply").onclick = () => setReplyTarget(null);
  return bar;
}

function setReplyTarget(memberId, sender, preview) {
  ensureReplyBar();
  replyTarget = memberId ? { member_id: memberId, sender } : null;
  const bar = document.getElementById("reply-bar");
  if (!replyTarget) {
    bar.classList.add("hidden");
    return;
  }
  document.getElementById("reply-who").textContent = "Respondiendo a " + (sender || "agente");
  document.getElementById("reply-preview").textContent = String(preview || "").replace(/\s+/g, " ").slice(0, 80);
  bar.classList.remove("hidden");
  input.focus();
}

function pickReplyFromBubble(bubble) {
  if (!bubble) return;
  const sender = bubble.dataset.sender || "";
  const mid = bubble.dataset.member || memberIdByName(sender);
  if (!mid) return;
  setReplyTarget(mid, sender, bubble.innerText);
}

async function refreshAddList() {
  try {
    specialists = await (await fetch("/api/specialists")).json();
  } catch (_) {}
  const host = document.querySelector(".add-member") || document.getElementById("add-member-select")?.parentElement;
  if (!host || !current || current.type !== "group") return;
  const inside = new Set((current.members || []).map((m) => m.id));
  const extras = (Array.isArray(specialists) ? specialists : []).filter((s) => s && s.id && !inside.has(s.id));
  host.innerHTML = extras.length
    ? extras.map((s) => `<button type="button" class="add-chip" data-add="${s.id}">${buddySvg(s, 22)} ${escapeHtml(s.name)}</button>`).join("")
    : `<p class="hint-inline">No hay otros agentes. Creá uno con + y volvé acá.</p>`;
}

const _openGroupInfo = openGroupInfo;
openGroupInfo = async function () {
  _openGroupInfo();
  await refreshAddList();
};

document.getElementById("info-modal").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn || !current || current.type !== "group") return;
  const res = await fetch(`/api/groups/${current.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ member_id: btn.dataset.add }),
  });
  const payload = await res.json();
  if (!res.ok) return alert(payload.detail || "No se pudo agregar");
  const fresh = await refreshGroup(current.id);
  current = { type: "group", ...fresh };
  document.getElementById("chat-title").textContent = `${current.members.length} integrantes`;
  document.getElementById("chat-dot").innerHTML = packSvg(current.members, 42);
  openGroupInfo();
});

function mentionBox() {
  let box = document.getElementById("mention-box");
  if (box) return box;
  box = document.createElement("div");
  box.id = "mention-box";
  box.className = "mention-box hidden";
  document.getElementById("composer").before(box);
  box.addEventListener("click", (e) => {
    const row = e.target.closest("[data-mention]");
    if (!row) return;
    const name = row.dataset.mention;
    const cur = input.value;
    const at = cur.lastIndexOf("@");
    input.value = (at >= 0 ? cur.slice(0, at) : cur) + "@" + name + " ";
    box.classList.add("hidden");
    input.focus();
  });
  return box;
}

function showMentions() {
  const box = mentionBox();
  if (!current || current.type !== "group") {
    box.classList.add("hidden");
    return;
  }
  const val = input.value;
  const at = val.lastIndexOf("@");
  if (at < 0 || /\s/.test(val.slice(at))) {
    box.classList.add("hidden");
    return;
  }
  const q = val.slice(at + 1).toLowerCase();
  const people = (current.members || []).filter((m) => !q || (m.name || "").toLowerCase().includes(q));
  if (!people.length) {
    box.classList.add("hidden");
    return;
  }
  box.innerHTML = people.map((m) => `<button type="button" data-mention="${escapeHtml(m.name)}">${buddySvg(m, 22)} ${escapeHtml(m.name)}</button>`).join("");
  box.classList.remove("hidden");
}

input.addEventListener("input", showMentions);
input.addEventListener("focus", showMentions);
input.addEventListener("blur", () => setTimeout(() => mentionBox().classList.add("hidden"), 180));

thread.addEventListener("click", (e) => {
  const hit = e.target.closest(".reply-hit");
  if (!hit) return;
  e.preventDefault();
  e.stopPropagation();
  pickReplyFromBubble(hit.closest(".bubble"));
});

let swipe = null;
function onSwipeStart(x, y, bubble) {
  swipe = { bubble, x, y, dx: 0 };
}
function onSwipeMove(x, y) {
  if (!swipe) return;
  const dx = x - swipe.x;
  const dy = y - swipe.y;
  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
  if (Math.abs(dy) > Math.abs(dx) + 8) {
    swipe.bubble.style.transform = "";
    swipe = null;
    return;
  }
  swipe.dx = dx;
  swipe.bubble.style.transform = `translateX(${Math.max(0, Math.min(80, dx))}px)`;
}
function onSwipeEnd() {
  if (!swipe) return;
  const bubble = swipe.bubble;
  const dx = swipe.dx;
  bubble.style.transform = "";
  swipe = null;
  if (dx > 42) pickReplyFromBubble(bubble);
}

thread.addEventListener("touchstart", (e) => {
  if (!current || current.type !== "group") return;
  const bubble = e.target.closest(".bubble.assistant.swipeable");
  if (!bubble) return;
  const t = e.changedTouches[0];
  onSwipeStart(t.clientX, t.clientY, bubble);
}, { passive: true });
thread.addEventListener("touchmove", (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  onSwipeMove(t.clientX, t.clientY);
}, { passive: true });
thread.addEventListener("touchend", onSwipeEnd, { passive: true });
thread.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") return;
  if (!current || current.type !== "group") return;
  const bubble = e.target.closest(".bubble.assistant.swipeable");
  if (!bubble) return;
  onSwipeStart(e.clientX, e.clientY, bubble);
});
thread.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  onSwipeMove(e.clientX, e.clientY);
});
thread.addEventListener("pointerup", (e) => {
  if (e.pointerType === "touch") return;
  onSwipeEnd();
});

ensureReplyBar();

const composer = document.getElementById("composer");
composer.onsubmit = async (e) => {
  e.preventDefault();
  if (!current) return;
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  mentionBox().classList.add("hidden");
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
      for (const item of payload.replies || []) {
        thread.insertAdjacentHTML("beforeend", groupBubble(item));
        thread.scrollTop = thread.scrollHeight;
        await new Promise((r) => setTimeout(r, 140));
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
