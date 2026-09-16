(function () {
  var root = document.documentElement;
  function apply(x, y) {
    var gx = Math.max(-28, Math.min(28, x));
    var gy = Math.max(-22, Math.min(22, y));
    root.style.setProperty("--gx", gx + "px");
    root.style.setProperty("--gy", gy + "px");
    root.style.setProperty("--ga", (210 + gx * 2.2) + "deg");
  }
  window.addEventListener("pointermove", function (e) {
    apply((e.clientX / innerWidth - 0.5) * 48, (e.clientY / innerHeight - 0.5) * 36);
  }, { passive: true });
  function onOrient(e) {
    apply((e.gamma || 0) * 0.9, ((e.beta || 0) - 45) * 0.45);
  }
  function enable() {
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission().then(function (s) {
        if (s === "granted") window.addEventListener("deviceorientation", onOrient);
      }).catch(function () {});
    } else {
      window.addEventListener("deviceorientation", onOrient);
    }
  }
  document.addEventListener("pointerdown", enable, { once: true });
})();
