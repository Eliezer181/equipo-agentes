function renderRich(text) {
  const src = String(text || "");
  const out = [];
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out.push(escapeHtml(src.slice(last, m.index)));
    if (m[2]) {
      out.push(`<img class="msg-img" alt="${escapeHtml(m[1])}" src="${escapeHtml(m[2])}">`);
    } else if (m[4]) {
      out.push(`<a class="msg-link" href="${escapeHtml(m[4])}" target="_blank" rel="noopener">${escapeHtml(m[3])}</a>`);
    } else {
      let url = m[5].replace(/[),.;]+$/, "");
      const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || /loremflickr|wikimedia|upload\.wikimedia|unsplash|imgur/i.test(url);
      out.push(isImg
        ? `<img class="msg-img" src="${escapeHtml(url)}" alt="">`
        : `<a class="msg-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
    }
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(src.slice(last)));
  return out.join("");
}

function groupBubble(m) {
  if (m.role === "user") {
    return `<div class="bubble user"><div class="sender user-sender">${escapeHtml(current.leader || "Líder")}</div>${renderRich(m.content)}</div>`;
  }
  const color = m.color || "#f97316";
  return `<div class="bubble assistant"><div class="sender" style="color:${color}">${escapeHtml(m.sender)}</div>${renderRich(m.content)}</div>`;
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

const _openGroupInfo = openGroupInfo;
openGroupInfo = function () {
  _openGroupInfo();
  if (!current || current.type !== "group") return;
  const box = document.getElementById("add-member-select");
  if (!box) return;
  const inside = new Set((current.members || []).map((m) => m.id));
  const extras = specialists.filter((s) => !s.archived && !inside.has(s.id));
  box.innerHTML = extras.length
    ? extras.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")
    : `<option value="">No hay más agentes</option>`;
  box.disabled = !extras.length;
};

const addBtn = document.getElementById("btn-add-member");
if (addBtn) {
  addBtn.onclick = async () => {
    if (!current || current.type !== "group") return;
    const sid = document.getElementById("add-member-select").value;
    if (!sid) return;
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
