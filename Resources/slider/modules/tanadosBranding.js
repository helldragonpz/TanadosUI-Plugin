const BRAND_NAME = "Tanados UI";
const LOGO_URL = new URL("../src/images/tanados-logo.png", import.meta.url).href;
const FAVICON_URL = new URL("../src/images/tanados-favicon.png", import.meta.url).href;
const ROOT_ATTR = "data-tanados-ui-brand";

function markRoot() {
  try {
    document.documentElement?.setAttribute(ROOT_ATTR, "1");
    document.documentElement?.style?.setProperty("--tanados-runtime-logo-url", `url("${LOGO_URL}")`);
  } catch {}
}

function isJellyfinText(value) {
  return /jellyfin/i.test(String(value || ""));
}

function isLogoHint(value) {
  return /(jellyfin|logo|splash|brand|headerlogo|pagetitlewithlogo|embylogo)/i.test(String(value || ""));
}

function replaceDocumentTitle() {
  try {
    if (isJellyfinText(document.title)) {
      document.title = document.title.replace(/jellyfin/ig, BRAND_NAME);
    }
    if (!document.title || document.title.trim().toLowerCase() === "jellyfin") {
      document.title = BRAND_NAME;
    }
  } catch {}
}

function ensureIconLink(rel, href) {
  try {
    const selector = `link[rel="${rel}"]`;
    let link = document.head?.querySelector(selector);
    if (!link && document.head) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    if (link) {
      link.href = href;
      link.type = "image/png";
      link.setAttribute("data-tanados-brand", "true");
    }
  } catch {}
}

function replaceFavicons() {
  ensureIconLink("icon", FAVICON_URL);
  ensureIconLink("shortcut icon", FAVICON_URL);
  ensureIconLink("apple-touch-icon", FAVICON_URL);
  try {
    document.querySelectorAll("link[rel*='icon' i]").forEach((link) => {
      link.href = FAVICON_URL;
      link.type = "image/png";
      link.setAttribute("data-tanados-brand", "true");
    });
  } catch {}
}

function replaceImage(img) {
  try {
    if (!img || img.dataset?.tanadosLogo === "true") return;
    const hint = [
      img.alt,
      img.title,
      img.getAttribute("aria-label"),
      img.className,
      img.id,
      img.src,
      img.currentSrc
    ].join(" ");
    if (!isLogoHint(hint)) return;
    img.dataset.tanadosLogo = "true";
    img.src = LOGO_URL;
    img.removeAttribute("srcset");
    img.alt = BRAND_NAME;
    img.title = BRAND_NAME;
    img.setAttribute("aria-label", BRAND_NAME);
  } catch {}
}

function replaceBackgroundLogo(el) {
  try {
    if (!el || el.dataset?.tanadosLogo === "true") return;
    const hint = [el.className, el.id, el.getAttribute("aria-label"), el.getAttribute("title")].join(" ");
    if (!isLogoHint(hint)) return;
    el.dataset.tanadosLogo = "true";
    el.setAttribute("aria-label", BRAND_NAME);
    el.setAttribute("title", BRAND_NAME);
    el.style.backgroundImage = `url("${LOGO_URL}")`;
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundSize = "contain";
    if (el.textContent && isJellyfinText(el.textContent)) {
      el.textContent = BRAND_NAME;
    }
  } catch {}
}

function replaceTextNodes() {
  try {
    const candidates = document.querySelectorAll(".pageTitle, .pageTitleWithLogo, .loginDisclaimerContainer h1, h1, h2, title");
    candidates.forEach((el) => {
      if (!el || el.dataset?.tanadosText === "true") return;
      if (isJellyfinText(el.textContent)) {
        el.textContent = el.textContent.replace(/jellyfin/ig, BRAND_NAME);
        el.dataset.tanadosText = "true";
      }
    });
  } catch {}
}

function replaceLogos() {
  markRoot();
  replaceDocumentTitle();
  replaceFavicons();
  try {
    document.querySelectorAll("img, picture img, .imgLogoIcon").forEach(replaceImage);
    document.querySelectorAll([
      ".pageTitleWithLogo",
      ".headerLogo",
      ".embyLogo",
      ".adminDrawerLogo",
      ".splashLogo",
      "#jms-boot-splash-logo",
      "[class*='Logo']",
      "[class*='logo']",
      "[id*='Logo']",
      "[id*='logo']"
    ].join(",")).forEach(replaceBackgroundLogo);
  } catch {}
  replaceTextNodes();
}

let observer;
function startObserver() {
  try {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      window.clearTimeout(startObserver._timer);
      startObserver._timer = window.setTimeout(replaceLogos, 60);
    });
    observer.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "class", "style", "alt", "title", "aria-label"]
    });
  } catch {}
}

replaceLogos();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", replaceLogos, { once: true });
}
window.addEventListener("load", replaceLogos, { once: true });
window.setTimeout(replaceLogos, 500);
window.setTimeout(replaceLogos, 1500);
window.setTimeout(replaceLogos, 4000);
startObserver();

window.TanadosUIBranding = {
  logoUrl: LOGO_URL,
  faviconUrl: FAVICON_URL,
  apply: replaceLogos
};
