(function () {
  const addrEl = document.getElementById("pay-address");
  const msg = document.getElementById("pay-msg");
  const pending = document.getElementById("pending-box");
  let address = "";

  function show(text, ok) {
    msg.textContent = text;
    msg.classList.remove("hidden");
    msg.className = "msg " + (ok ? "ok" : "err");
  }

  function drawQr(text) {
    if (typeof qrcode !== "function") return;
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const canvas = document.getElementById("qr-canvas");
    const ctx = canvas.getContext("2d");
    const n = qr.getModuleCount();
    const size = canvas.width;
    const cell = size / n;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  async function loadConfig() {
    const res = await fetch("/api/billing/config", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      addrEl.textContent = "No se pudo cargar la dirección. Probá más tarde.";
      show(data.detail || "Error cargando pago", false);
      return;
    }
    address = data.usdt_address || "";
    addrEl.textContent = address || "(dirección no configurada)";
    if (data.amount_usdt) {
      const amount = document.querySelector(".pay-amount");
      if (amount) amount.textContent = data.amount_usdt + " USDT";
    }
    if (address) drawQr(address);
    if (data.payment_status === "pending") {
      pending.classList.remove("hidden");
    }
  }

  document.getElementById("btn-copy").onclick = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      show("Dirección copiada", true);
    } catch {
      show("No se pudo copiar. Seleccioná la dirección a mano.", false);
    }
  };

  document.getElementById("btn-paid").onclick = async () => {
    const res = await fetch("/api/billing/mark-paid", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      show(data.detail || "No se pudo registrar el aviso de pago", false);
      return;
    }
    pending.classList.remove("hidden");
    show("Aviso enviado. Queda en revisión manual.", true);
  };

  loadConfig();
})();
