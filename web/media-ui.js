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
    return `<div class="bubble user">${quote}<div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${renderRich(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  const sender = m.sender || "";
  return `<div class="bubble assistant swipeable" data-sender="${escapeHtml(sender)}" data-member="${escapeHtml(mid)}">
    <button type="button" class="reply-hit" data-reply="1" aria-label="Responder">↩</button>
    ${quote}<div class="sender" style="color:${color}">${escapeHtml(sender)}</div>${renderRich(m.content)}
  </div>`;
}

renderThread = function (messages) {
  if (!current) return;
  if (current.type === "group") {
    thread.innerHTML = (messages || []).map((x) => groupBubble(x)).join("");
  } else {
    thread.innerHTML = (messages || []).map((x) => `<div class="bubble ${x.role}">${renderRich(x.content)}</div>`).join("");
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

function memberIdOf(bubble) {
  if (!bubble || !current || current.type !== "group") return "";
  if (bubble.dataset.member) return bubble.dataset.member;
  const sender = bubble.dataset.sender;
  const hit = (current.members || []).find((m) => m.name === sender);
  return hit ? hit.id : "";
}

function startReplyFrom(bubble) {
  const mid = memberIdOf(bubble);
  if (!mid) return;
  setReplyTarget(mid, bubble.dataset.sender, bubble.textContent);
}

thread.addEventListener("click", (e) => {
  const hit = e.target.closest("[data-reply]");
  if (!hit) return;
  e.preventDefault();
  e.stopPropagation();
  const bubble = hit.closest(".bubble.assistant");
  if (bubble) startReplyFrom(bubble);
});

let swipe = null;
function onSwipeStart(x, y, bubble) {
  swipe = { bubble, x, y, dx: 0 };
}
function onSwipeMove(x, y) {
  if (!swipe) return;
  const dx = x - swipe.x;
  const dy = y - swipe.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  if (Math.abs(dy) > Math.abs(dx) + 6) {
    swipe.bubble.style.transform = "";
    swipe = null;
    return;
  }
  swipe.dx = dx;
  swipe.bubble.style.transform = `translateX(${Math.max(0, Math.min(84, dx))}px)`;
}
function onSwipeEnd() {
  if (!swipe) return;
  const bubble = swipe.bubble;
  const dx = swipe.dx;
  bubble.style.transform = "";
  swipe = null;
  if (dx > 48) startReplyFrom(bubble);
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
thread.addEventListener("touchcancel", () => {
  if (swipe) swipe.bubble.style.transform = "";
  swipe = null;
}, { passive: true });

async function paintAddList() {
  const host = document.getElementById("add-member-list") || document.querySelector(".add-member");
  if (!host || !current || current.type !== "group") return;
  let list = specialists;
  try {
    list = await (await fetch("/api/specialists")).json();
    specialists = list;
  } catch (_) {}
  const inside = new Set((current.members || []).map((m) => String(m.id)));
  const extras = (list || []).filter((s) => s && s.id && !inside.has(String(s.id)));
  if (!extras.length) {
    host.innerHTML = `<p class="hint-inline">No hay agentes afuera de este grupo. Creá uno con + y volvé acá.</p>`;
    return;
  }
  host.innerHTML = extras.map((s) => `
    <button type="button" class="add-one" data-add="${s.id}">
      ${buddySvg(s, 28)}
      <span>${escapeHtml(s.name)}</span>
    </button>`).join("");
}

const _openGroupInfo = openGroupInfo;
openGroupInfo = async function () {
  _openGroupInfo();
  await paintAddList();
};

document.addEventListener("click", async (e) => {
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
  current = { type: "group", ...(fresh || payload) };
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
  return box;
}

function hideMentions() {
  mentionBox().classList.add("hidden");
  mentionBox().innerHTML = "";
}

function showMentions(filter) {
  if (!current || current.type !== "group") return hideMentions();
  const q = (filter || "").toLowerCase();
  const members = (current.members || []).filter((m) => !q || m.name.toLowerCase().includes(q));
  const box = mentionBox();
  if (!members.length) return hideMentions();
  box.innerHTML = members.map((m) => `
    <button type="button" class="mention-row" data-mention="${escapeHtml(m.name)}">
      ${buddySvg(m, 24)} <span>@${escapeHtml(m.name)}</span>
    </button>`).join("");
  box.classList.remove("hidden");
}

input.addEventListener("input", () => {
  if (!current || current.type !== "group") return hideMentions();
  const val = input.value;
  const at = val.lastIndexOf("@");
  if (at < 0) return hideMentions();
  const after = val.slice(at + 1);
  if (/\s/.test(after)) return hideMentions();
  showMentions(after);
});

document.addEventListener("click", (e) => {
  const row = e.target.closest("[data-mention]");
  if (!row) return;
  const name = row.dataset.mention;
  const val = input.value;
  const at = val.lastIndexOf("@");
  input.value = (at >= 0 ? val.slice(0, at) : val) + "@" + name + " ";
  hideMentions();
  input.focus();
});

ensureReplyBar();

const composer = document.getElementById("composer");
composer.onsubmit = async (e) => {
  e.preventDefault();
  hideMentions();
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
    const who = target ? target.sender : (message.includes("@") ? "Mención" : "El equipo");
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
        await new Promise((r) => setTimeout(r, 120));
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
