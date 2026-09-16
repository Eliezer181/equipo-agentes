(function () {
  function nice(raw) {
    if (raw == null) return "no se pudo responder";
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) {
      return raw.map(function (x) { return (x && (x.msg || x.message)) || JSON.stringify(x); }).join("; ");
    }
    if (typeof raw === "object") {
      if (typeof raw.message === "string") return raw.message;
      if (typeof raw.detail === "string") return raw.detail;
      try { return JSON.stringify(raw); } catch (e) { return "no se pudo responder"; }
    }
    return String(raw);
  }
  var proto = Element.prototype;
  var orig = proto.insertAdjacentHTML;
  proto.insertAdjacentHTML = function (pos, html) {
    if (typeof html === "string" && html.indexOf("Error: [object Object]") !== -1) {
      html = html.replace("Error: [object Object]", "Error: el modelo no pudo completar. Probá de nuevo.");
    }
    return orig.call(this, pos, html);
  };
  window.__glouErr = nice;
})();
