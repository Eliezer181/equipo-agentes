function paintPalette() {
  const box = document.getElementById("color-palette");
  const input = document.getElementById("color-input");
  if (!box || !input || typeof nextFreeColor !== "function") return;
  const pick = nextFreeColor((specialists || []).map((s) => s.color));
  input.value = pick;
  box.innerHTML = PALETTE.map((c) =>
    `<button type="button" data-color="${c}" style="background:${c}" class="${c.toLowerCase() === pick.toLowerCase() ? "on" : ""}"></button>`
  ).join("");
}

document.getElementById("color-palette").onclick = (e) => {
  const b = e.target.closest("[data-color]");
  if (!b) return;
  document.getElementById("color-input").value = b.dataset.color;
  document.querySelectorAll("#color-palette button").forEach((x) => x.classList.toggle("on", x === b));
};

const addBtn = document.getElementById("btn-add");
const oldAdd = addBtn.onclick;
addBtn.onclick = () => {
  paintPalette();
  if (oldAdd) oldAdd();
  else modal.classList.remove("hidden");
};

const createForm = document.getElementById("create");
const oldSubmit = createForm.onsubmit;
createForm.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const created = await (await fetch("/api/specialists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })).json();
  modal.classList.add("hidden");
  e.target.reset();
  await loadList();
  openChat(created.id);
};
