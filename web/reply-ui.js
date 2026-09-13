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
    .bubble.assistant{position:relative;padding-right:34px}
    .reply-hit{position:absolute;right:6px;top:8px;width:26px;height:26px;border:0;border-radius:50%;background:#2c2c2e;color:#93c5fd;font-size:14px}
    .bubble.swipeable{transition:transform .12s ease;touch-action:pan-y}
    .quote{font-size:11px;color:#93c5fd;margin-bottom:4px}
    .mention{color:#93c5fd;font-weight:600}
    .mention-box{background:#161618;border-top:1px solid #1c1c1e;max-height:160px;overflow:auto;flex-shrink:0}
    .mention-box.hidden{display:none!important}
    .mention-box button,.add-chip{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:#f4f4f5;padding:10px 12px;text-align:left;font-size:15px}
    .add-member{display:flex;flex-direction:column;gap:4px}
    .add-chip{background:#1c1c1e;border-radius:10px}
  `;
  document.head.appendChild(css);
})();
