(function () {
  var sheet = document.querySelector("#info-modal .sheet");
  if (!sheet) return;
  if (!document.getElementById("info-x")) {
    var x = document.createElement("button");
    x.type = "button";
    x.id = "info-x";
    x.setAttribute("aria-label", "Volver");
    x.textContent = "\u00d7";
    sheet.appendChild(x);
    x.addEventListener("click", function () {
      var modal = document.getElementById("info-modal");
      if (modal) modal.classList.add("hidden");
    });
  }
})();
