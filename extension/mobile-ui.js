// Nepras — Edge Android direct full-page action
(() => {
  try {
    const ua = String(navigator.userAgent || "");
    const params = new URLSearchParams(location.search);
    const isEdgeAndroid = /EdgA/i.test(ua);
    const isEdgeIOS = /EdgiOS/i.test(ua);
    const uaMobile = /Android|Mobile|iPhone|iPad|iPod|Kiwi|EdgA|EdgiOS/i.test(ua) || !!navigator.userAgentData?.mobile;
    const shortSide = Math.min(Number(screen?.width || 9999), Number(screen?.height || 9999));
    const coarse = !!window.matchMedia?.("(pointer: coarse)")?.matches;
    const touchMobile = Number(navigator.maxTouchPoints || 0) > 0 && (shortSide <= 1000 || coarse);

    if (uaMobile || touchMobile) {
      document.documentElement.classList.add("nepras-mobile");
      document.documentElement.setAttribute("data-nepras-device", "mobile");
    } else {
      document.documentElement.setAttribute("data-nepras-device", "desktop");
    }

    if (/EdgA|EdgiOS|Edg\//i.test(ua)) document.documentElement.classList.add("nepras-edge");

    const isFullMobilePage = params.get("mobileFull") === "1";
    if (isFullMobilePage) {
      document.documentElement.classList.add("nepras-mobile-full");
      document.documentElement.setAttribute("data-nepras-mobile-shell", "full");
      return;
    }

    // v1.0 RC12: On Edge Android the action popup is disabled dynamically
    // by background.js and tapping the extension icon opens the full-page shell
    // directly. This avoids leaving Edge's draggable bottom sheet on screen.
  } catch (_) {}
})();
