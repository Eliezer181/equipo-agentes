(function () {
  "use strict";

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  /* ——— Scroll reveals ——— */
  function initReveals() {
    var nodes = document.querySelectorAll("[data-reveal]");
    if (!nodes.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    nodes.forEach(function (el) { io.observe(el); });
  }

  /* ——— Parallax (mouse + scroll) on hero logo ——— */
  function initParallax() {
    if (reduceMotion) return;
    var targets = document.querySelectorAll("[data-parallax]");
    if (!targets.length) return;

    var mx = 0, my = 0, sy = 0;
    var ticking = false;

    function apply() {
      ticking = false;
      var scrollNudge = Math.max(-12, Math.min(12, sy * 0.02));
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

    // Skip heavy mouse parallax on small screens
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

  /* ——— Scene layers light scroll parallax ——— */
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
          if (far) far.style.transform = "translate3d(0," + y * 0.12 + "px,-200px) scale(1.4)";
          if (mid) mid.style.transform = "translate3d(0," + y * 0.06 + "px,-80px) scale(1.15)";
        });
      },
      { passive: true }
    );
  }

  /* ——— Video guard: muted-only, hide on 404 / error ——— */
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

    // Never play with sound
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
    video.addEventListener("emptied", function () {
      // source failed after load attempt
    });

    // Probe whether the file exists without relying on autoplay alone
    var src = "";
    var sourceEl = video.querySelector("source");
    if (sourceEl) src = sourceEl.getAttribute("src") || "";
    if (!src) src = video.getAttribute("src") || "";

    if (!src) {
      showLogoOnly();
      return;
    }

    // HEAD/GET probe — if 404, keep logo
    var probed = false;
    function probe() {
      if (probed) return;
      probed = true;
      if (typeof fetch !== "function") {
        // Fallback: let the video element try; on error hide
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
          // CORS or network — try playing; error handler covers 404-ish failures
          video.load();
          video.addEventListener("loadeddata", showVideo, { once: true });
          video.addEventListener("error", showLogoOnly, { once: true });
          // Timeout: if nothing loads, keep logo
          setTimeout(function () {
            if (video.readyState < 2) showLogoOnly();
          }, 2500);
        });
    }

    // Start hidden until probe succeeds
    showLogoOnly();
    probe();
  }

  /* ——— Soft nav logo blink already CSS; ensure images decode ——— */
  function initLogos() {
    document.querySelectorAll(".logo-live img").forEach(function (img) {
      img.decoding = "async";
    });
  }

  function boot() {
    initLogos();
    initReveals();
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
