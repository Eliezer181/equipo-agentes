(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  function splitWriteNodes() {
    var nodes = document.querySelectorAll("[data-write]");
    nodes.forEach(function (el) {
      if (el.getAttribute("data-write-ready") === "1") return;
      var raw = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      var mode = el.getAttribute("data-write-mode") || "words";
      var parts;
      if (mode === "chars") {
        parts = raw.split("");
      } else {
        parts = raw.split(/(\s+)/);
      }
      el.textContent = "";
      var i = 0;
      parts.forEach(function (part) {
        var span = document.createElement("span");
        var isSpace = !part.trim();
        span.className = isSpace ? "write-unit space" : "write-unit";
        span.textContent = isSpace ? "\u00a0" : part;
        span.style.setProperty("--i", String(i));
        el.appendChild(span);
        i += 1;
      });
      el.setAttribute("data-write-ready", "1");
      el.setAttribute("aria-label", raw);
    });
  }

  function startWriting(el) {
    if (!el || el.classList.contains("is-writing") || el.classList.contains("write-done")) return;
    var units = el.querySelectorAll(".write-unit");
    if (!units.length) {
      el.classList.add("is-writing", "write-done");
      return;
    }
    el.classList.add("is-writing", "write-cursor");
    var last = units.length - 1;
    var delay = last * 38 + 520;
    window.setTimeout(function () {
      el.classList.add("write-done");
      el.classList.remove("write-cursor");
    }, delay);
  }

  function initReveals() {
    splitWriteNodes();
    var nodes = document.querySelectorAll("[data-reveal], [data-write]");
    if (!nodes.length) return;

    function activate(el) {
      el.classList.add("is-in");
      if (el.hasAttribute("data-write")) startWriting(el);
      el.querySelectorAll("[data-write]").forEach(startWriting);
    }

    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(activate);
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          activate(entry.target);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.14 }
    );

    nodes.forEach(function (el) { io.observe(el); });

    window.requestAnimationFrame(function () {
      document.querySelectorAll(".hero [data-reveal], .hero [data-write]").forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92) activate(el);
      });
    });
  }

  function initProgress() {
    var bar = document.querySelector("[data-scroll-bar]");
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = Math.max(1, (doc.scrollHeight || 1) - window.innerHeight);
      var p = Math.max(0, Math.min(1, (window.scrollY || 0) / max));
      bar.style.width = (p * 100).toFixed(2) + "%";
    }
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function initSlideFeel() {
    if (reduceMotion) return;
    var lastY = window.scrollY || 0;
    var vel = 0;
    var ticking = false;
    window.addEventListener("scroll", function () {
      var y = window.scrollY || 0;
      vel = y - lastY;
      lastY = y;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var goingDown = vel > 0;
        document.body.classList.toggle("scrolling-down", goingDown);
        document.body.classList.toggle("scrolling-up", !goingDown && y > 8);
      });
    }, { passive: true });
  }

  function initParallax() {
    if (reduceMotion) return;
    var targets = document.querySelectorAll("[data-parallax]");
    if (!targets.length) return;

    var mx = 0, my = 0, sy = 0;
    var ticking = false;

    function apply() {
      ticking = false;
      var scrollNudge = Math.max(-18, Math.min(18, sy * 0.035));
      targets.forEach(function (el) {
        el.style.transform =
          "translate(" + mx * 10 + "px," + (my * 8 + scrollNudge) + "px)";
      });
    }

    function requestTick() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }

    var isNarrow = false;
    try {
      isNarrow = window.matchMedia("(max-width: 480px)").matches;
    } catch (_) {}

    if (!isNarrow) {
      window.addEventListener(
        "mousemove",
        function (e) {
          var cx = window.innerWidth / 2;
          var cy = window.innerHeight / 2;
          mx = (e.clientX - cx) / cx;
          my = (e.clientY - cy) / cy;
          requestTick();
        },
        { passive: true }
      );
    }

    window.addEventListener(
      "scroll",
      function () {
        sy = window.scrollY || 0;
        requestTick();
      },
      { passive: true }
    );
  }

  function initSceneScroll() {
    if (reduceMotion) return;
    var far = document.querySelector(".scene-layer--far");
    var mid = document.querySelector(".scene-layer--mid");
    if (!far && !mid) return;

    var isNarrow = false;
    try {
      isNarrow = window.matchMedia("(max-width: 480px)").matches;
    } catch (_) {}
    if (isNarrow) return;

    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var y = window.scrollY || 0;
          if (far) far.style.transform = "translate3d(0," + y * 0.14 + "px,-200px) scale(1.4)";
          if (mid) mid.style.transform = "translate3d(0," + y * 0.07 + "px,-80px) scale(1.15)";
        });
      },
      { passive: true }
    );
  }

  function initHeroVideo() {
    var video = document.getElementById("hero-video");
    if (!video) return;

    var stage = video.closest(".hero-logo-stage");

    function showLogoOnly() {
      video.classList.add("hidden");
      video.removeAttribute("autoplay");
      try { video.pause(); } catch (_) {}
      if (stage) stage.classList.remove("has-video");
    }

    function showVideo() {
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.classList.remove("hidden");
      if (stage) stage.classList.add("has-video");
      var p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () { showLogoOnly(); });
      }
    }

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.addEventListener("volumechange", function () {
      if (!video.muted || video.volume > 0) {
        video.muted = true;
        video.volume = 0;
      }
    });

    video.addEventListener("error", showLogoOnly);

    var src = "";
    var sourceEl = video.querySelector("source");
    if (sourceEl) src = sourceEl.getAttribute("src") || "";
    if (!src) src = video.getAttribute("src") || "";

    if (!src) {
      showLogoOnly();
      return;
    }

    var probed = false;
    function probe() {
      if (probed) return;
      probed = true;
      if (typeof fetch !== "function") {
        video.load();
        video.addEventListener("loadeddata", showVideo, { once: true });
        return;
      }
      fetch(src, { method: "HEAD", cache: "no-store" })
        .then(function (res) {
          if (res.ok) {
            video.load();
            showVideo();
          } else {
            showLogoOnly();
          }
        })
        .catch(function () {
          video.load();
          video.addEventListener("loadeddata", showVideo, { once: true });
          video.addEventListener("error", showLogoOnly, { once: true });
          setTimeout(function () {
            if (video.readyState < 2) showLogoOnly();
          }, 2500);
        });
    }

    showLogoOnly();
    probe();
  }

  function initLogos() {
    document.querySelectorAll(".logo-live img").forEach(function (img) {
      img.decoding = "async";
    });
  }

  function boot() {
    initLogos();
    initReveals();
    initProgress();
    initSlideFeel();
    initParallax();
    initSceneScroll();
    initHeroVideo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
