(function () {
  var composer = document.getElementById("composer");
  if (!composer) return;
  var file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.hidden = true;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btn-attach";
  btn.title = "Adjuntar imagen";
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  var input = composer.querySelector("#input");
  var row = composer.querySelector(".c-row") || (input && input.parentNode);
  if (row && input) row.insertBefore(btn, input);
  var send = composer.querySelector("button[type=submit]");
  if (row && send && send.parentNode !== row) row.appendChild(send);
  document.body.appendChild(file);

  function compress(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, img.width * scale);
        canvas.height = Math.max(1, img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  btn.addEventListener("click", function () { file.click(); });
  file.addEventListener("change", async function () {
    var f = file.files && file.files[0];
    if (!f || !current || current.type !== "specialist") return;
    try {
      var dataUrl = await compress(f);
      var res = await fetch("/api/specialists/" + current.id + "/computer/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "upload.png", body: dataUrl }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || "no se pudo subir");
      window.__pendingShot = data.url || ("/api/specialists/" + current.id + "/browser/shot/upload.png");
      var old = document.getElementById("attach-chip");
      if (old) old.remove();
      var chip = document.createElement("div");
      chip.id = "attach-chip";
      chip.textContent = "Foto lista para enviar";
      composer.parentNode.insertBefore(chip, composer);
    } catch (err) {
      alert(err.message || "No se pudo adjuntar");
    }
    file.value = "";
  });
})();
