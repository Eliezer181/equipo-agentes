(function () {
  const path = location.pathname.replace(/\/$/, "") || "/";
  const isLogin = path.endsWith("/login");
  const regCard = document.getElementById("register-card");
  const loginCard = document.getElementById("login-card");
  if (isLogin) {
    regCard.classList.add("hidden");
    loginCard.classList.remove("hidden");
  }

  function show(el, text, ok) {
    el.textContent = text;
    el.classList.remove("hidden");
    el.className = "msg " + (ok ? "ok" : "err");
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  const regForm = document.getElementById("register-form");
  if (regForm) {
    regForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(regForm);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");
      const password2 = String(fd.get("password2") || "");
      const msg = document.getElementById("reg-msg");
      if (password !== password2) {
        show(msg, "Las contraseñas no coinciden", false);
        return;
      }
      const { res, data } = await post("/api/auth/register", { email, password });
      if (!res.ok) {
        show(msg, data.detail || "No se pudo registrar", false);
        return;
      }
      show(msg, "Cuenta creada. Entrando…", true);
      location.href = "/";
    };
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");
      const msg = document.getElementById("login-msg");
      const { res, data } = await post("/api/auth/login", { email, password });
      if (!res.ok) {
        show(msg, data.detail || "Email o contraseña incorrectos", false);
        return;
      }
      location.href = "/";
    };
  }
})();
