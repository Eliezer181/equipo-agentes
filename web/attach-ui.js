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
  btn.textContent = "+";
  composer.insertBefore(btn, composer.querySelector("input"));
  composer.appendChild(file);
  btn.addEventListener("click", function () { file.click(); });
  file.addEventListener("change", async function () {
    var f = file.files && file.files[0];
    if (!f || !current || current.type !== "specialist") return;
    var fd = new FormData();
    fd.append("file", f, f.name || "foto.png");
    try {
      var res = await fetch("/api/specialists/" + current.id + "/uploads", { method: "POST", body: fd });
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || "no se pudo subir");
      window.__pendingShot = data.url;
      var old = document.getElementById("attach-chip");
      if (old) old.remove();
      var chip = document.createElement("div");
      chip.id = "attach-chip";
      chip.innerHTML = "Foto lista para enviar";
      composer.parentNode.insertBefore(chip, composer);
    } catch (err) {
      alert(err.message || "No se pudo adjuntar");
    }
    file.value = "";
  });
})();
