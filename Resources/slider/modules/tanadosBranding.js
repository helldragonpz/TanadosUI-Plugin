import {
  fetchRuntimeConfig,
  getDefaultRuntimeConfig,
  getRuntimeConfigSnapshot,
  subscribeRuntimeConfig
} from "./runtimeConfig.js";
import { faIconHtml } from "./faIcons.js";
import { emitClientDiagnostic, isClientDiagnosticsVerboseEnabled } from "./clientDiagnostics.js";

const DEFAULTS = getDefaultRuntimeConfig();
const ROOT_ATTR = "data-tanados-ui-brand";
const OLD_BRAND_RE = /\b(?:jellyfin|jmsfusion|monwui|tanadosui)\b/ig;
const OLD_BRAND_TEST_RE = /\b(?:jellyfin|jmsfusion|monwui|tanadosui)\b/i;
const LOCAL_HEADER_LOGO_URL = new URL("../src/images/tanados-logo.png", import.meta.url).href;
const LOCAL_LOGIN_LOGO_URL = new URL("../src/images/tanados-logo.png", import.meta.url).href;
const LOCAL_FAVICON_URL = new URL("../src/images/tanados-favicon.png", import.meta.url).href;
const BRAND_SURFACE_SELECTOR = [
  ".pageTitleWithLogo",
  ".headerLogo",
  ".embyLogo",
  ".adminDrawerLogo",
  ".mainDrawerLogo",
  ".drawerLogo",
  ".skinHeader .headerLogo",
  ".skinHeader .pageTitleWithLogo",
  ".skinHeader .pageTitle"
].join(", ");
const BRAND_IMAGE_SELECTOR = [
  ".pageTitleWithLogo img",
  ".headerLogo img",
  ".embyLogo img",
  ".adminDrawerLogo img",
  ".mainDrawerLogo img",
  ".drawerLogo img",
  ".skinHeader .headerLogo img",
  ".skinHeader .pageTitleWithLogo img"
].join(", ");
const LOGIN_SURFACE_SELECTOR = [
  "#loginPage h1",
  ".loginDisclaimerContainer h1",
  ".splashLogo",
  "#jms-boot-splash-logo"
].join(", ");
const LOGIN_IMAGE_SELECTOR = [
  "#loginPage .imgLogoIcon img",
  "#loginPage img.headerLogo",
  "#loginPage img[alt*='logo' i]",
  ".loginDisclaimerContainer img",
  ".splashLogo img",
  "#jms-boot-splash-logo img"
].join(", ");
const TEXT_SELECTOR = [
  ".pageTitle",
  ".pageTitleWithLogo",
  "#loginPage .readOnlyContent h1",
  ".loginDisclaimerContainer h1",
  ".adminDrawerLogo + .listItemBody"
].join(", ");
const TOP_NAV_SELECTOR = [
  ".skinHeader .emby-tab-button",
  '.skinHeader a[href^="#/home?tab="]',
  '.skinHeader a[href^="#/index?tab="]'
].join(", ");
const DRAWER_NAV_SELECTOR = [
  ".mainDrawer .navMenuOption",
  ".mainDrawer .mainDrawerButton",
  ".mainDrawer .listItemButton",
  ".mainDrawer [role='menuitem']"
].join(", ");
const DRAWER_NATIVE_ICON_SELECTOR = [
  ":scope > .navMenuOptionIcon",
  ":scope > .listItemIcon",
  ":scope > .material-icons.navMenuOptionIcon",
  ":scope > .TanadosUI-drawer-icon",
  ":scope > .TanadosUI-shell-icon",
  ":scope > .fa-solid",
  ":scope > .fa-regular",
  ":scope > .fa-brands"
].join(", ");
const DRAWER_LABEL_SELECTOR = [
  ":scope > .TanadosUI-shell-label",
  ":scope > .navMenuOptionText",
  ":scope > .sectionName",
  ":scope > .listItemBodyText",
  ":scope > .btnText"
].join(", ");
const DRAWER_TOGGLE_SELECTOR = [
  ".mainDrawerButton",
  ".barsMenuButton",
  ".headerButtonLeft",
  ".headerButtonLeftPanel",
  "button[title='Menu']",
  "button[aria-label='Menu']",
  "button[title='Меню']",
  "button[aria-label='Меню']"
].join(", ");
const SHELL_ROLE_RULES = [
  { key: "calendar", icon: "fa-solid fa-calendar-days", href: ["tab=calendar"], text: ["calendar", "upcoming", "календар", "предстоящ"] },
  { key: "watchlist", icon: "fa-solid fa-bookmark", href: ["tab=watchlist"], text: ["watchlist", "списък"] },
  { key: "favorites", icon: "fa-solid fa-heart", href: ["tab=1", "/favorites"], text: ["favorite", "favourite", "любим"] },
  { key: "home", icon: "fa-solid fa-house", href: ["tab=0", "#/home", "#/index"], text: ["home", "начало"] },
  { key: "movies", icon: "fa-solid fa-film", href: ["/movies"], text: ["movie", "movies", "film", "films", "филм"] },
  { key: "series", icon: "fa-solid fa-tv", href: ["/tv", "/shows", "/series"], text: ["series", "shows", "tv", "сериал"] },
  { key: "music", icon: "fa-solid fa-compact-disc", href: ["/music", "/audio"], text: ["music", "audio", "музика"] },
  { key: "search", icon: "fa-solid fa-magnifying-glass", href: ["/search"], text: ["search", "търсене"] },
  { key: "users", icon: "fa-solid fa-users", href: ["/user", "/profile"], text: ["users", "user", "profile", "потреб"] },
  { key: "settings", icon: "fa-solid fa-sliders", href: ["/dashboard", "/plugins", "/configuration"], text: ["settings", "dashboard", "plugins", "admin", "настрой", "табло", "плъгин"] },
  { key: "collections", icon: "fa-solid fa-layer-group", href: ["/library", "/collection"], text: ["library", "collection", "folder", "колекц", "библиот"] },
  { key: "live", icon: "fa-solid fa-satellite-dish", href: ["/livetv", "/live"], text: ["live tv", "livetv", "телев"] }
];

let brandingObserver = null;
let applyTimer = 0;
let drawerDiagnosticTimer = 0;
let drawerToggleDiagnosticsBound = false;

function text(value) {
  return String(value ?? "").trim();
}

function currentRuntime() {
  return getRuntimeConfigSnapshot() || DEFAULTS;
}

function resolveHeaderLogoUrl(runtime = currentRuntime()) {
  return text(runtime.headerLogoUrl) || LOCAL_HEADER_LOGO_URL;
}

function resolveLoginLogoUrl(runtime = currentRuntime()) {
  return text(runtime.loginLogoUrl) || resolveHeaderLogoUrl(runtime) || LOCAL_LOGIN_LOGO_URL;
}

function resolveFaviconUrl(runtime = currentRuntime()) {
  return text(runtime.faviconUrl) || LOCAL_FAVICON_URL;
}

function resolveLoginBackgroundUrl(runtime = currentRuntime()) {
  return text(runtime.loginBackgroundUrl);
}

function applyRootRuntime(runtime = currentRuntime()) {
  const root = document.documentElement;
  if (!root) return;

  root.setAttribute(ROOT_ATTR, "1");
  root.setAttribute("data-tanados-header-logo", runtime.showHeaderLogo === false ? "0" : "1");
  root.setAttribute("data-tanados-header-logo-compact", runtime.useCompactHeaderLogo === true ? "1" : "0");
  root.setAttribute("data-tanados-show-native-home-tabs", runtime.showNativeHomeTabs === false ? "0" : "1");
  root.setAttribute("data-tanados-show-watchlist-top-nav", runtime.showWatchlistInTopNav === false ? "0" : "1");
  root.style.setProperty("--tanados-runtime-logo-url", `url("${resolveHeaderLogoUrl(runtime)}")`);
  root.style.setProperty("--tanados-runtime-login-logo-url", `url("${resolveLoginLogoUrl(runtime)}")`);
  root.style.setProperty("--tanados-runtime-favicon-url", `url("${resolveFaviconUrl(runtime)}")`);
  root.style.setProperty("--tanados-runtime-primary", text(runtime.primaryColor) || DEFAULTS.primaryColor);
  root.style.setProperty("--tanados-runtime-secondary", text(runtime.secondaryColor) || DEFAULTS.secondaryColor);
  root.style.setProperty("--tanados-runtime-accent", text(runtime.accentColor) || DEFAULTS.accentColor);
  root.style.setProperty("--tanados-runtime-app-name", `"${(text(runtime.appDisplayName) || DEFAULTS.appDisplayName).replace(/"/g, '\\"')}"`);

  const loginBackgroundUrl = resolveLoginBackgroundUrl(runtime);
  if (loginBackgroundUrl) {
    root.style.setProperty("--tanados-runtime-login-background-url", `url("${loginBackgroundUrl}")`);
  } else {
    root.style.removeProperty("--tanados-runtime-login-background-url");
  }
}

function ensureIconLink(rel, href) {
  let link = document.head?.querySelector(`link[rel="${rel}"]`);
  if (!link && document.head) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  if (!link) return;
  link.href = href;
  link.type = "image/png";
  link.setAttribute("data-tanados-brand", "true");
}

function applyFavicons(runtime = currentRuntime()) {
  const faviconUrl = resolveFaviconUrl(runtime);
  ensureIconLink("icon", faviconUrl);
  ensureIconLink("shortcut icon", faviconUrl);
  ensureIconLink("apple-touch-icon", faviconUrl);

  try {
    document.querySelectorAll("link[rel*='icon' i]").forEach((link) => {
      link.href = faviconUrl;
      link.type = "image/png";
      link.setAttribute("data-tanados-brand", "true");
    });
  } catch {}
}

function shouldRewriteText(value) {
  const clean = text(value);
  return !!clean && OLD_BRAND_TEST_RE.test(clean);
}

function rewriteTextValue(value, runtime = currentRuntime()) {
  const clean = text(value);
  if (!clean) return runtime.appDisplayName || DEFAULTS.appDisplayName;
  if (!shouldRewriteText(clean)) return clean;
  return clean.replace(OLD_BRAND_RE, runtime.appDisplayName || DEFAULTS.appDisplayName);
}

function replaceDocumentTitle(runtime = currentRuntime()) {
  try {
    const nextTitle = rewriteTextValue(document.title, runtime);
    document.title = nextTitle || runtime.appDisplayName || DEFAULTS.appDisplayName;
  } catch {}
}

function markBrandSurface(el, { logoUrl, showLogo = true, compact = false, appName } = {}) {
  if (!(el instanceof HTMLElement)) return;
  el.dataset.tanadosBrand = "surface";
  el.dataset.tanadosAppName = text(appName) || DEFAULTS.appDisplayName;
  el.dataset.tanadosLogoVisible = showLogo === false ? "0" : "1";
  el.dataset.tanadosLogoCompact = compact === true ? "1" : "0";
  if (logoUrl && showLogo !== false) {
    el.style.backgroundImage = `url("${logoUrl}")`;
  } else {
    el.style.removeProperty("background-image");
  }
  el.setAttribute("aria-label", el.dataset.tanadosAppName);
  el.setAttribute("title", el.dataset.tanadosAppName);
}

function brandImages(selector, logoUrl, appName) {
  document.querySelectorAll(selector).forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    img.dataset.tanadosBrand = "image";
    img.src = logoUrl;
    img.removeAttribute("srcset");
    img.alt = appName;
    img.title = appName;
    img.setAttribute("aria-label", appName);
  });
}

function applyHeaderBranding(runtime = currentRuntime()) {
  const appName = text(runtime.appDisplayName) || DEFAULTS.appDisplayName;
  const logoUrl = resolveHeaderLogoUrl(runtime);
  const showLogo = runtime.showHeaderLogo !== false;
  const compact = runtime.useCompactHeaderLogo === true;

  document.querySelectorAll(BRAND_SURFACE_SELECTOR).forEach((el) => {
    markBrandSurface(el, { logoUrl, showLogo, compact, appName });
    if (showLogo === false && shouldRewriteText(el.textContent)) {
      el.textContent = appName;
    } else if (shouldRewriteText(el.textContent)) {
      el.textContent = rewriteTextValue(el.textContent, runtime);
    }
  });

  brandImages(BRAND_IMAGE_SELECTOR, logoUrl, appName);
}

function applyLoginBranding(runtime = currentRuntime()) {
  const appName = text(runtime.appDisplayName) || DEFAULTS.appDisplayName;
  const logoUrl = resolveLoginLogoUrl(runtime);

  document.querySelectorAll(LOGIN_SURFACE_SELECTOR).forEach((el) => {
    markBrandSurface(el, {
      logoUrl,
      showLogo: true,
      compact: false,
      appName
    });
    if (shouldRewriteText(el.textContent)) {
      el.textContent = rewriteTextValue(el.textContent, runtime);
    }
  });

  brandImages(LOGIN_IMAGE_SELECTOR, logoUrl, appName);
}

function applyBrandText(runtime = currentRuntime()) {
  const appName = text(runtime.appDisplayName) || DEFAULTS.appDisplayName;

  document.querySelectorAll(TEXT_SELECTOR).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const current = text(el.textContent);
    if (!current) return;
    if (!shouldRewriteText(current)) return;
    el.textContent = rewriteTextValue(current, runtime) || appName;
  });
}

function getShellRole(el) {
  if (!(el instanceof HTMLElement)) return null;
  const href = text(el.getAttribute("href")).toLowerCase();
  const label = text(el.dataset.tanadosOriginalLabel || el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent).toLowerCase();

  for (const rule of SHELL_ROLE_RULES) {
    if (rule.href?.some((needle) => href.includes(needle))) return rule;
    if (rule.text?.some((needle) => label.includes(needle))) return rule;
  }

  return null;
}

function ensureOriginalLabel(el) {
  if (!(el instanceof HTMLElement)) return "";
  if (!text(el.dataset.tanadosOriginalLabel)) {
    el.dataset.tanadosOriginalLabel =
      text(el.getAttribute("aria-label")) ||
      text(el.getAttribute("title")) ||
      text(el.textContent);
  }
  return text(el.dataset.tanadosOriginalLabel);
}

function decorateTopNavTabs() {
  document.querySelectorAll(TOP_NAV_SELECTOR).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (/TanadosUI-(?:watchlist|upcoming|nav)-/.test(el.className)) return;

    const role = getShellRole(el);
    const label = ensureOriginalLabel(el);
    if (!role || !label) return;

    el.dataset.tanadosShellRole = role.key;

    const hasManagedMarkup =
      !!el.querySelector(":scope > .TanadosUI-shell-icon") ||
      !!el.querySelector(":scope > .TanadosUI-shell-label");
    const hasComplexChildren = Array.from(el.children).some((child) =>
      !(child instanceof HTMLElement) ||
      (!child.classList.contains("TanadosUI-shell-icon") && !child.classList.contains("TanadosUI-shell-label"))
    );
    if (hasComplexChildren && !hasManagedMarkup) return;

    let icon = el.querySelector(":scope > .TanadosUI-shell-icon");
    let labelEl = el.querySelector(":scope > .TanadosUI-shell-label");
    if (!icon || !labelEl) {
      el.replaceChildren();
      icon = document.createElement("span");
      icon.className = "TanadosUI-shell-icon";
      icon.setAttribute("aria-hidden", "true");
      labelEl = document.createElement("span");
      labelEl.className = "TanadosUI-shell-label";
      el.append(icon, labelEl);
    }

    icon.innerHTML = faIconHtml(role.icon, "TanadosUI-shell-icon-fa");
    labelEl.textContent = label;
  });
}

function decorateDrawerNavigation() {
  document.querySelectorAll(DRAWER_NAV_SELECTOR).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (/(?:logo|brand)/i.test(el.className)) return;

    const role = getShellRole(el);
    if (!role) return;

    el.dataset.tanadosShellRole = role.key;

    const label = ensureOriginalLabel(el);
    if (!label) return;

    const nativeIcon = el.querySelector(DRAWER_NATIVE_ICON_SELECTOR);
    if (nativeIcon instanceof HTMLElement) {
      nativeIcon.classList.add("TanadosUI-drawer-native-icon");
    }

    const existingLabel = el.querySelector(DRAWER_LABEL_SELECTOR);
    if (existingLabel instanceof HTMLElement) {
      existingLabel.classList.add("TanadosUI-shell-label");
    } else if (!el.children.length) {
      const labelEl = document.createElement("span");
      labelEl.className = "TanadosUI-shell-label";
      labelEl.textContent = label;
      el.replaceChildren(labelEl);
    } else if (!nativeIcon) {
      const textNodes = Array.from(el.childNodes).filter((node) => (
        node?.nodeType === Node.TEXT_NODE && text(node.textContent)
      ));
      if (textNodes.length && el.children.length === 0) {
        const labelEl = document.createElement("span");
        labelEl.className = "TanadosUI-shell-label";
        labelEl.textContent = label;
        el.replaceChildren(labelEl);
      }
    }

    if (nativeIcon) return;

    const icon = document.createElement("span");
    icon.className = "TanadosUI-drawer-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = faIconHtml(role.icon, "TanadosUI-shell-icon-fa");

    if (!el.children.length) {
      const labelEl = document.createElement("span");
      labelEl.className = "TanadosUI-shell-label";
      labelEl.textContent = label;
      el.replaceChildren(icon, labelEl);
      return;
    }

    el.insertBefore(icon, el.firstChild);
  });
}

function isElementVisible(el) {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect?.();
  if (!rect) return false;
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity || "1") > 0.01 &&
    rect.width > 8 &&
    rect.height > 8
  );
}

function collectDrawerSnapshot() {
  const drawer = document.querySelector(".mainDrawer");
  if (!(drawer instanceof HTMLElement)) {
    return null;
  }

  const navItems = Array.from(drawer.querySelectorAll(DRAWER_NAV_SELECTOR)).filter((el) => el instanceof HTMLElement);
  const labels = Array.from(drawer.querySelectorAll(".TanadosUI-shell-label, .navMenuOptionText, .sectionName, .listItemBodyText, .btnText"))
    .filter((el) => el instanceof HTMLElement);
  const icons = Array.from(drawer.querySelectorAll(".TanadosUI-drawer-icon, .TanadosUI-drawer-native-icon, .navMenuOptionIcon, .listItemIcon"))
    .filter((el) => el instanceof HTMLElement);
  const scrollContainer = drawer.querySelector(".mainDrawer-scrollContainer");
  const computed = getComputedStyle(drawer);
  const rect = drawer.getBoundingClientRect?.();
  const visibleNavItems = navItems.filter(isElementVisible);
  const visibleLabels = labels.filter((label) => isElementVisible(label) && text(label.textContent));
  const bodyClass = text(document.body?.className).slice(0, 240);
  const htmlClass = text(document.documentElement?.className).slice(0, 240);

  return {
    drawerClass: text(drawer.className).slice(0, 240),
    bodyClass,
    htmlClass,
    isOpenClass: drawer.classList.contains("drawer-open"),
    isDashboardDocument: /\bdashboardDocument\b/.test(bodyClass),
    position: computed.position,
    display: computed.display,
    visibility: computed.visibility,
    opacity: computed.opacity,
    transform: text(computed.transform).slice(0, 180),
    left: text(computed.left).slice(0, 64),
    right: text(computed.right).slice(0, 64),
    inlineLeft: text(drawer.style.left).slice(0, 64),
    inlineRight: text(drawer.style.right).slice(0, 64),
    inlineWidth: text(drawer.style.width).slice(0, 64),
    inlineTransform: text(drawer.style.transform).slice(0, 180),
    pointerEvents: computed.pointerEvents,
    width: Math.round(rect?.width || drawer.offsetWidth || 0),
    height: Math.round(rect?.height || drawer.offsetHeight || 0),
    navCount: navItems.length,
    visibleNavCount: visibleNavItems.length,
    labelCount: labels.length,
    visibleLabelCount: visibleLabels.length,
    iconCount: icons.length,
    scrollContainerCount: drawer.querySelectorAll(".mainDrawer-scrollContainer").length,
    scrollContainerChildren: scrollContainer?.childElementCount || 0,
    sampleLabels: visibleLabels.slice(0, 6).map((label) => text(label.textContent).slice(0, 48))
  };
}

function isDrawerSnapshotSuspicious(snapshot) {
  if (!snapshot) return false;
  if (snapshot.navCount <= 0) return true;

  const widthTooSmall = (snapshot.width || 0) < 96;
  const invisible = snapshot.display === "none" || snapshot.visibility === "hidden" || Number(snapshot.opacity || "1") <= 0.01;
  const noVisibleEntries = snapshot.visibleNavCount <= 0 || (snapshot.visibleLabelCount <= 0 && snapshot.iconCount <= 0);

  if (snapshot.isDashboardDocument) {
    return widthTooSmall || invisible || noVisibleEntries;
  }

  if (snapshot.isOpenClass) {
    return widthTooSmall || invisible || noVisibleEntries;
  }

  return false;
}

async function reportDrawerDiagnostics(reason = "apply", force = false) {
  const snapshot = collectDrawerSnapshot();
  if (!snapshot) return;

  const suspicious = isDrawerSnapshotSuspicious(snapshot);
  if (!suspicious && !force && !isClientDiagnosticsVerboseEnabled()) {
    return;
  }

  await emitClientDiagnostic({
    scope: "branding",
    event: suspicious ? "drawer-suspect" : "drawer-snapshot",
    level: suspicious ? "warning" : "info",
    message: suspicious ? "Drawer shell is present but its menu content looks unusable." : "Drawer shell diagnostic snapshot.",
    data: {
      reason,
      ...snapshot
    },
    force
  });
}

function queueDrawerDiagnostics(reason = "apply", delayMs = 160, force = false) {
  clearTimeout(drawerDiagnosticTimer);
  drawerDiagnosticTimer = window.setTimeout(() => {
    void reportDrawerDiagnostics(reason, force);
  }, delayMs);
}

function bindDrawerToggleDiagnostics() {
  if (drawerToggleDiagnosticsBound) return;
  drawerToggleDiagnosticsBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(DRAWER_TOGGLE_SELECTOR) : null;
    if (!(target instanceof HTMLElement)) return;

    window.setTimeout(() => {
      void reportDrawerDiagnostics("toggle-click", true);
    }, 90);
    window.setTimeout(() => {
      void reportDrawerDiagnostics("toggle-click-settled", true);
    }, 420);
  }, true);
}

function applyBranding(runtime = currentRuntime()) {
  applyRootRuntime(runtime);
  applyFavicons(runtime);
  replaceDocumentTitle(runtime);
  applyHeaderBranding(runtime);
  applyLoginBranding(runtime);
  applyBrandText(runtime);
  decorateTopNavTabs();
  decorateDrawerNavigation();
  queueDrawerDiagnostics("apply");
}

function queueApplyBranding(runtime = currentRuntime(), delayMs = 48) {
  clearTimeout(applyTimer);
  applyTimer = window.setTimeout(() => {
    applyBranding(runtime);
  }, delayMs);
}

function startObserver() {
  if (brandingObserver) {
    try {
      brandingObserver.disconnect();
    } catch {}
  }

  brandingObserver = new MutationObserver(() => {
    queueApplyBranding(currentRuntime(), 64);
  });

  try {
    brandingObserver.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "src", "srcset", "title", "aria-label"]
    });
  } catch {}
}

applyBranding(DEFAULTS);
void fetchRuntimeConfig({ force: true })
  .then((runtime) => {
    applyBranding(runtime);
  })
  .catch(() => {
    applyBranding(currentRuntime());
  });

subscribeRuntimeConfig((runtime) => {
  applyBranding(runtime);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => applyBranding(currentRuntime()), { once: true });
}

window.addEventListener("load", () => applyBranding(currentRuntime()), { once: true });
window.addEventListener("pageshow", () => applyBranding(currentRuntime()), { passive: true });
window.addEventListener("hashchange", () => {
  queueApplyBranding(currentRuntime());
  queueDrawerDiagnostics("hashchange");
}, { passive: true });
startObserver();
bindDrawerToggleDiagnostics();

window.TanadosUIBranding = {
  get runtime() {
    return currentRuntime();
  },
  apply() {
    applyBranding(currentRuntime());
  },
  inspectDrawer(force = true) {
    queueDrawerDiagnostics("manual", 16, force);
  },
  defaults: {
    headerLogoUrl: LOCAL_HEADER_LOGO_URL,
    loginLogoUrl: LOCAL_LOGIN_LOGO_URL,
    faviconUrl: LOCAL_FAVICON_URL
  }
};
