(function () {
  if (document.getElementById("reply-style")) return;
  const css = document.createElement("style");
  css.id = "reply-style";
  css.textContent = `
    .reply-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#121214;border-top:1px solid #1c1c1e;flex-shrink:0}
    .reply-bar.hidden{display:none!important}
    .reply-copy{min-width:0;flex:1}
    .reply-copy b{display:block;font-size:12px;color:#93c5fd}
    .reply-copy span{display:block;font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bubble.swipeable{transition:transform .12s ease}
    .quote{font-size:11px;color:#93c5fd;margin-bottom:4px}
    .mention{color:#93c5fd;font-weight:600}
  `;
  document.head.appendChild(css);
  const composer = document.getElementById("composer");
  if (!composer || document.getElementById("reply-bar")) return;
  const bar = document.createElement("div");
  bar.id = "reply-bar";
  bar.className = "reply-bar hidden";
  bar.innerHTML = '<div class="reply-copy"><b id="reply-who"></b><span id="reply-preview"></span></div><button type="button" id="btn-cancel-reply" class="ghost">x</button>';
  composer.before(bar);
  document.getElementById("btn-cancel-reply").onclick = () => setReplyTarget(null);
})();
