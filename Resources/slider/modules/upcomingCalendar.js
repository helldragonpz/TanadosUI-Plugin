import { getConfig } from "./config.js";
import {
  fetchRuntimeConfig,
  getRuntimeConfigSnapshot,
  subscribeRuntimeConfig
} from "./runtimeConfig.js";

const MODAL_ID = "TanadosUI-upcoming-modal-root";
const HOME_SECTION_ID = "TanadosUI-upcoming-home-section";
const STYLE_ID = "TanadosUI-upcoming-style";
const NAV_BUTTON_CLASS = "TanadosUI-upcoming-nav-button";
const NAV_LINK_CLASS = "TanadosUI-nav-button";
const NAV_KIND_ATTR = "data-tanados-upcoming-nav-kind";
const HOME_TAB_ROUTE_RE = /^#\/(?:home|index)\?tab=/i;
const FEED_URL = "/TanadosUI/upcoming/feed";
const FEED_TTL_MS = 3 * 60 * 1000;
const ICON_PATH = "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 13H5V9h14ZM7 11h3v3H7Zm5 0h3v3h-3Z";

let feedCache = null;
let feedLoadedAt = 0;
let feedPromise = null;
let observer = null;
let refreshTimer = 0;

function cfg() {
  return getConfig?.() || {};
}

function labels() {
  return cfg()?.languageLabels || {};
}

function L(key, fallback) {
  const value = labels()?.[key];
  return (typeof value === "string" && value.trim()) ? value : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function isProbablyVisible(element) {
  if (!(element instanceof Element)) return false;
  if (element.closest?.("[hidden], .hide")) return false;

  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
  } catch {}

  const rect = typeof element.getBoundingClientRect === "function"
    ? element.getBoundingClientRect()
    : { width: 0, height: 0 };
  return rect.width > 0 || rect.height > 0 || element.offsetParent !== null;
}

function isHomeHash(hash = window.location.hash || "") {
  const clean = text(hash).toLowerCase();
  return clean === "" || clean === "#" || clean.startsWith("#/home") || clean.startsWith("#/index");
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${NAV_BUTTON_CLASS} {
      cursor: pointer;
    }
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 13000;
      display: none;
      align-items: stretch;
      justify-content: center;
      padding: 28px;
      background: rgba(6, 4, 12, 0.76);
      backdrop-filter: blur(12px);
    }
    #${MODAL_ID}.visible {
      display: flex;
    }
    #${MODAL_ID} .TanadosUIup-shell {
      width: min(1180px, 100%);
      max-height: 100%;
      overflow: hidden;
      border-radius: 28px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: linear-gradient(180deg, rgba(17, 11, 31, 0.98), rgba(11, 8, 22, 0.96));
      box-shadow: 0 34px 100px rgba(0, 0, 0, 0.56);
      color: #f7f4ff;
      display: flex;
      flex-direction: column;
    }
    #${MODAL_ID} .TanadosUIup-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      padding: 24px 26px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(135deg, rgba(111, 67, 243, 0.18), rgba(47, 107, 255, 0.08));
    }
    #${MODAL_ID} .TanadosUIup-title {
      margin: 0 0 6px;
      font-size: 1.45rem;
      font-weight: 800;
    }
    #${MODAL_ID} .TanadosUIup-subtitle {
      margin: 0;
      color: rgba(247, 244, 255, 0.72);
      line-height: 1.55;
    }
    #${MODAL_ID} .TanadosUIup-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    #${MODAL_ID} .TanadosUIup-btn {
      min-height: 40px;
      padding: 0.7rem 0.95rem;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(135deg, rgba(111, 67, 243, 0.92), rgba(47, 107, 255, 0.86));
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    #${MODAL_ID} .TanadosUIup-btn--ghost {
      background: rgba(255, 255, 255, 0.06);
    }
    #${MODAL_ID} .TanadosUIup-body {
      overflow: auto;
      padding: 18px 26px 26px;
    }
    #${MODAL_ID} .TanadosUIup-state,
    #${HOME_SECTION_ID} .TanadosUIup-state {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(247, 244, 255, 0.78);
    }
    #${MODAL_ID} .TanadosUIup-errors,
    #${HOME_SECTION_ID} .TanadosUIup-errors {
      margin: 0 0 18px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255, 205, 87, 0.1);
      border: 1px solid rgba(242, 198, 107, 0.18);
      color: #fbe8b0;
    }
    #${MODAL_ID} .TanadosUIup-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .TanadosUIup-card {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 14px;
      padding: 14px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.025));
      overflow: hidden;
    }
    .TanadosUIup-poster {
      width: 88px;
      aspect-ratio: 2 / 3;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.06);
      object-fit: cover;
    }
    .TanadosUIup-meta {
      display: grid;
      align-content: start;
      gap: 8px;
      min-width: 0;
    }
    .TanadosUIup-eyebrow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: rgba(247, 244, 255, 0.68);
      text-transform: uppercase;
    }
    .TanadosUIup-pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .TanadosUIup-card h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      color: #fff;
    }
    .TanadosUIup-sub {
      margin: 0;
      color: rgba(247, 244, 255, 0.72);
      font-size: 0.9rem;
    }
    .TanadosUIup-overview {
      margin: 0;
      color: rgba(247, 244, 255, 0.8);
      font-size: 0.88rem;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    #${HOME_SECTION_ID} {
      margin: 22px 0 10px;
    }
    #${HOME_SECTION_ID} .TanadosUIup-home-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 14px;
    }
    #${HOME_SECTION_ID} .TanadosUIup-home-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 800;
      color: #fff;
    }
    #${HOME_SECTION_ID} .TanadosUIup-home-subtitle {
      margin: 6px 0 0;
      color: rgba(247, 244, 255, 0.7);
      font-size: 0.92rem;
    }
    #${HOME_SECTION_ID} .TanadosUIup-row {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(280px, 320px);
      gap: 14px;
      overflow: auto hidden;
      padding-bottom: 8px;
    }
    #${HOME_SECTION_ID} .TanadosUIup-row .TanadosUIup-card {
      min-height: 168px;
    }
    @media (max-width: 767px) {
      #${MODAL_ID} {
        padding: 12px;
      }
      #${MODAL_ID} .TanadosUIup-head,
      #${MODAL_ID} .TanadosUIup-body {
        padding-inline: 16px;
      }
      #${MODAL_ID} .TanadosUIup-card {
        grid-template-columns: 74px minmax(0, 1fr);
      }
      .TanadosUIup-poster {
        width: 74px;
      }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNavLabel() {
  return L("calendarNavLabel", "Calendar");
}

function formatDate(value) {
  const raw = text(value);
  if (!raw) return "";

  try {
    const locale = cfg()?.dateLocale || labels()?.timeLocale || "bg-BG";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  } catch {
    return raw;
  }
}

function mapItemType(item) {
  const type = text(item?.type).toLowerCase();
  if (type === "movie") return L("upcomingTypeMovie", "Movie");
  if (type === "episode") return L("upcomingTypeEpisode", "Episode");
  if (type === "season") return L("upcomingTypeSeason", "Season");
  if (type === "series") return L("upcomingTypeSeries", "Series");
  return type || L("upcomingType", "Type");
}

function buildCardMarkup(item) {
  const title = escapeHtml(item?.title);
  const subtitle = escapeHtml(item?.subtitle || item?.seriesTitle || "");
  const overview = escapeHtml(item?.overview || "");
  const source = escapeHtml(item?.source || "");
  const date = escapeHtml(formatDate(item?.releaseDateUtc));
  const type = escapeHtml(mapItemType(item));
  const poster = escapeHtml(item?.posterUrl || "");
  const posterFallback = escapeHtml(item?.posterFallbackUrl || "");

  return `
    <article class="TanadosUIup-card">
      ${poster ? `<img class="TanadosUIup-poster" src="${poster}" alt="${title}" loading="lazy"${posterFallback ? ` data-fallback-src="${posterFallback}"` : ""}>` : `<div class="TanadosUIup-poster" aria-hidden="true"></div>`}
      <div class="TanadosUIup-meta">
        <div class="TanadosUIup-eyebrow">
          <span class="TanadosUIup-pill">${source}</span>
          <span class="TanadosUIup-pill">${type}</span>
          ${date ? `<span class="TanadosUIup-pill">${date}</span>` : ""}
        </div>
        <h4>${title}</h4>
        ${subtitle ? `<p class="TanadosUIup-sub">${subtitle}</p>` : ""}
        ${overview ? `<p class="TanadosUIup-overview">${overview}</p>` : ""}
      </div>
    </article>
  `;
}

function attachPosterFallbacks(root) {
  root?.querySelectorAll?.(".TanadosUIup-poster[data-fallback-src]").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.tanadosPosterFallbackBound === "1") return;

    img.dataset.tanadosPosterFallbackBound = "1";
    img.addEventListener("error", () => {
      const fallback = text(img.dataset.fallbackSrc);
      if (!fallback || img.dataset.tanadosPosterFallbackApplied === "1" || img.currentSrc === fallback) {
        return;
      }

      img.dataset.tanadosPosterFallbackApplied = "1";
      img.src = fallback;
    });
  });
}

async function fetchFeed({ force = false } = {}) {
  const now = Date.now();
  if (!force && feedCache && (now - feedLoadedAt) < FEED_TTL_MS) {
    return feedCache;
  }
  if (!force && feedPromise) return feedPromise;

  feedPromise = (async () => {
    const response = await fetch(FEED_URL, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Upcoming feed HTTP ${response.status}`);
    }

    const payload = await response.json();
    const normalized = {
      ok: payload?.ok !== false,
      enabled: payload?.enabled === true,
      items: Array.isArray(payload?.items) ? payload.items : [],
      errors: Array.isArray(payload?.errors) ? payload.errors : [],
      partial: payload?.partial === true
    };
    feedCache = normalized;
    feedLoadedAt = Date.now();
    return normalized;
  })();

  try {
    return await feedPromise;
  } finally {
    feedPromise = null;
  }
}

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.innerHTML = `
    <div class="TanadosUIup-shell" role="dialog" aria-modal="true" aria-labelledby="TanadosUIup-title">
      <div class="TanadosUIup-head">
        <div>
          <h2 id="TanadosUIup-title" class="TanadosUIup-title">${escapeHtml(L("upcomingTitle", "Upcoming Releases"))}</h2>
          <p class="TanadosUIup-subtitle">${escapeHtml(L("upcomingSubtitle", "New episodes and movies from Sonarr and Radarr are gathered here."))}</p>
        </div>
        <div class="TanadosUIup-actions">
          <button type="button" class="TanadosUIup-btn" data-action="refresh">${escapeHtml(L("upcomingRefresh", "Refresh"))}</button>
          <button type="button" class="TanadosUIup-btn TanadosUIup-btn--ghost" data-action="close">${escapeHtml(L("upcomingClose", "Close"))}</button>
        </div>
      </div>
      <div class="TanadosUIup-body">
        <div class="TanadosUIup-state">${escapeHtml(L("upcomingLoading", "Loading upcoming releases..."))}</div>
      </div>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeUpcomingModal();
    }
  });

  modal.querySelector('[data-action="close"]')?.addEventListener("click", () => closeUpcomingModal());
  modal.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
    void renderModalBody({ force: true });
  });

  document.body.appendChild(modal);
  return modal;
}

function closeUpcomingModal() {
  document.getElementById(MODAL_ID)?.classList.remove("visible");
}

function renderErrors(errors = []) {
  if (!errors.length) return "";
  const items = errors
    .map((error) => `<li><strong>${escapeHtml(error?.source || "Source")}:</strong> ${escapeHtml(error?.message || "")}</li>`)
    .join("");
  return `
    <div class="TanadosUIup-errors">
      <strong>${escapeHtml(L("upcomingErrorsTitle", "Source errors"))}</strong>
      <ul>${items}</ul>
    </div>
  `;
}

function renderFeedContent(feed) {
  if (!feed?.enabled) {
    return `<div class="TanadosUIup-state">${escapeHtml(L("upcomingDisabled", "Upcoming integration is not enabled yet."))}</div>`;
  }

  if (!feed.items.length) {
    return `
      ${feed.errors?.length ? renderErrors(feed.errors) : ""}
      <div class="TanadosUIup-state">${escapeHtml(L("upcomingEmpty", "No upcoming releases were found for the selected window."))}</div>
    `;
  }

  return `
    ${feed.partial ? `<div class="TanadosUIup-errors">${escapeHtml(L("upcomingPartial", "Some sources could not be loaded, but partial results are available."))}</div>` : ""}
    ${feed.errors?.length ? renderErrors(feed.errors) : ""}
    <div class="TanadosUIup-grid">
      ${feed.items.map((item) => buildCardMarkup(item)).join("")}
    </div>
  `;
}

async function renderModalBody({ force = false } = {}) {
  const modal = ensureModal();
  const body = modal.querySelector(".TanadosUIup-body");
  if (!body) return;

  body.innerHTML = `<div class="TanadosUIup-state">${escapeHtml(L("upcomingLoading", "Loading upcoming releases..."))}</div>`;

  try {
    const feed = await fetchFeed({ force });
    body.innerHTML = renderFeedContent(feed);
    attachPosterFallbacks(body);
  } catch (error) {
    body.innerHTML = `
      <div class="TanadosUIup-state">
        ${escapeHtml(L("upcomingFeedError", "The upcoming feed could not be loaded."))}
        <div style="margin-top:12px;">
          <button type="button" class="TanadosUIup-btn" data-action="retry-inline">${escapeHtml(L("upcomingRetry", "Try again"))}</button>
        </div>
      </div>
    `;
    body.querySelector('[data-action="retry-inline"]')?.addEventListener("click", () => {
      void renderModalBody({ force: true });
    });
    console.warn("Tanados upcoming feed failed:", error);
  }
}

export async function openUpcomingModal() {
  ensureStyles();
  ensureModal().classList.add("visible");
  await renderModalBody();
}

function getNavHref() {
  return text(window.location.hash).startsWith("#/index") ? "#/index?tab=calendar" : "#/home?tab=calendar";
}

function renderNavButtonMarkup(label) {
  const safeLabel = escapeHtml(label);
  return `
    <span class="TanadosUI-upcoming-nav-icon" aria-hidden="true">
      <svg class="TanadosUI-watchlist-nav-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path fill="currentColor" d="${ICON_PATH}"></path>
      </svg>
    </span>
    <span class="TanadosUI-watchlist-nav-label">${safeLabel}</span>
  `;
}

function isMuiHomeTabLink(link) {
  return HOME_TAB_ROUTE_RE.test(text(link?.getAttribute?.("href")));
}

function findMuiHomeTabsTargets() {
  const targets = [];
  const seen = new Set();
  const favoritesLinks = Array.from(
    document.querySelectorAll('a[href="#/home?tab=1"], a[href="#/index?tab=1"]')
  );

  for (const link of favoritesLinks) {
    const container = link.parentElement;
    if (!container || seen.has(container) || !isProbablyVisible(link) || !isProbablyVisible(container)) continue;
    seen.add(container);
    targets.push({ container, anchor: link });
  }

  if (targets.length) return targets;

  const links = Array.from(
    document.querySelectorAll('a[href^="#/home?tab="], a[href^="#/index?tab="]')
  ).filter(isMuiHomeTabLink);

  const grouped = new Map();
  links.forEach((link) => {
    const container = link.parentElement;
    if (!container) return;
    const list = grouped.get(container) || [];
    list.push(link);
    grouped.set(container, list);
  });

  for (const [container, group] of grouped.entries()) {
    if (group.length < 2 || seen.has(container)) continue;
    if (!isProbablyVisible(container) || !group.some((link) => isProbablyVisible(link))) continue;
    targets.push({ container, anchor: group[group.length - 1] });
  }

  return targets;
}

function shouldShowTopNav(runtime = getRuntimeConfigSnapshot()) {
  return runtime?.showUpcomingInTopNav !== false && runtime?.hasUpcomingIntegrations === true;
}

function createLegacyNavButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${NAV_BUTTON_CLASS} ${NAV_LINK_CLASS}`;
  button.setAttribute(NAV_KIND_ATTR, "legacy");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openUpcomingModal();
  });
  return button;
}

function createMuiNavButton() {
  const link = document.createElement("a");
  link.className = [
    NAV_BUTTON_CLASS,
    NAV_LINK_CLASS,
    "MuiButtonBase-root",
    "MuiButton-root",
    "MuiButton-text",
    "MuiButton-textInherit",
    "MuiButton-sizeMedium",
    "MuiButton-textSizeMedium",
    "MuiButton-colorInherit"
  ].join(" ");
  link.href = getNavHref();
  link.setAttribute(NAV_KIND_ATTR, "mui");
  link.setAttribute("aria-haspopup", "dialog");
  link.setAttribute("role", "button");
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openUpcomingModal();
  });
  return link;
}

function refreshNavButtons() {
  ensureStyles();
  const runtime = getRuntimeConfigSnapshot();
  const label = getNavLabel();
  const markup = renderNavButtonMarkup(label);

  if (!shouldShowTopNav(runtime)) {
    document.querySelectorAll(`.${NAV_BUTTON_CLASS}`).forEach((node) => node.remove());
    return;
  }

  const legacySliders = Array.from(document.querySelectorAll(".emby-tabs-slider")).filter(isProbablyVisible);
  legacySliders.forEach((slider) => {
    let button = slider.querySelector(`.${NAV_BUTTON_CLASS}[${NAV_KIND_ATTR}="legacy"]`);
    if (!button) {
      button = createLegacyNavButton();
      slider.appendChild(button);
    }
    button.innerHTML = markup;
    button.setAttribute("title", label);
    button.setAttribute("aria-label", label);
  });

  findMuiHomeTabsTargets().forEach(({ container, anchor }) => {
    let link = container.querySelector(`.${NAV_BUTTON_CLASS}[${NAV_KIND_ATTR}="mui"]`);
    if (!link) {
      link = createMuiNavButton();
      if (anchor?.parentElement === container && anchor.nextSibling) {
        container.insertBefore(link, anchor.nextSibling);
      } else {
        container.appendChild(link);
      }
    }
    link.innerHTML = markup;
    link.href = getNavHref();
    link.setAttribute("title", label);
    link.setAttribute("aria-label", label);
  });
}

function getHomeContainer() {
  const page =
    document.querySelector("#indexPage:not(.hide)") ||
    document.querySelector("#homePage:not(.hide)");
  if (!page) return null;
  return page.querySelector(".homeSectionsContainer") || page;
}

async function refreshHomeSection({ force = false } = {}) {
  const runtime = getRuntimeConfigSnapshot();
  const host = getHomeContainer();
  const existing = document.getElementById(HOME_SECTION_ID);

  if (!host || !isHomeHash() || runtime?.showUpcomingOnHome === false || runtime?.hasUpcomingIntegrations !== true) {
    existing?.remove();
    return;
  }

  let section = existing;
  if (!section) {
    section = document.createElement("section");
    section.id = HOME_SECTION_ID;
    section.className = "verticalSection section0";
    host.prepend(section);
  }

  section.innerHTML = `
    <div class="TanadosUIup-home-head">
      <div>
        <h3 class="TanadosUIup-home-title">${escapeHtml(L("upcomingHomeTitle", "Upcoming This Week"))}</h3>
        <p class="TanadosUIup-home-subtitle">${escapeHtml(L("upcomingHomeSubtitle", "A quick release overview from your automation services."))}</p>
      </div>
      <button type="button" class="TanadosUIup-btn">${escapeHtml(L("upcomingOpen", "Upcoming"))}</button>
    </div>
    <div class="TanadosUIup-state">${escapeHtml(L("upcomingLoading", "Loading upcoming releases..."))}</div>
  `;

  section.querySelector(".TanadosUIup-btn")?.addEventListener("click", () => {
    void openUpcomingModal();
  });

  try {
    const feed = await fetchFeed({ force });
    if (!feed.enabled) {
      section.querySelector(".TanadosUIup-state").outerHTML =
        `<div class="TanadosUIup-state">${escapeHtml(L("upcomingDisabled", "Upcoming integration is not enabled yet."))}</div>`;
      return;
    }

    if (!feed.items.length) {
      section.querySelector(".TanadosUIup-state").outerHTML =
        `<div class="TanadosUIup-state">${escapeHtml(L("upcomingEmpty", "No upcoming releases were found for the selected window."))}</div>`;
      return;
    }

    section.querySelector(".TanadosUIup-state")?.remove();
    const errorsMarkup = feed.errors?.length ? renderErrors(feed.errors) : "";
    section.insertAdjacentHTML("beforeend", `
      ${feed.partial ? `<div class="TanadosUIup-errors">${escapeHtml(L("upcomingPartial", "Some sources could not be loaded, but partial results are available."))}</div>` : ""}
      ${errorsMarkup}
      <div class="TanadosUIup-row">
        ${feed.items.slice(0, 8).map((item) => buildCardMarkup(item)).join("")}
      </div>
    `);
    attachPosterFallbacks(section);
  } catch (error) {
    section.querySelector(".TanadosUIup-state").innerHTML = `
      ${escapeHtml(L("upcomingFeedError", "The upcoming feed could not be loaded."))}
      <div style="margin-top:12px;">
        <button type="button" class="TanadosUIup-btn" data-action="retry-home">${escapeHtml(L("upcomingRetry", "Try again"))}</button>
      </div>
    `;
    section.querySelector('[data-action="retry-home"]')?.addEventListener("click", () => {
      void refreshHomeSection({ force: true });
    });
    console.warn("Tanados upcoming home feed failed:", error);
  }
}

export function refreshUpcomingUi({ force = false } = {}) {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshNavButtons();
    void refreshHomeSection({ force });
  }, 80);
}

function startObserver() {
  if (observer) return;
  const root = document.body || document.documentElement;
  if (!root) return;

  observer = new MutationObserver(() => refreshUpcomingUi());
  try {
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  } catch {}
}

export function initUpcomingCalendarUi() {
  ensureStyles();
  void fetchRuntimeConfig().then(() => refreshUpcomingUi()).catch(() => refreshUpcomingUi());
  refreshUpcomingUi();
  startObserver();

  window.addEventListener("hashchange", () => refreshUpcomingUi(), { passive: true });
  window.addEventListener("pageshow", () => refreshUpcomingUi(), { passive: true });
  window.addEventListener("focus", () => refreshUpcomingUi(), { passive: true });
  document.addEventListener("viewshow", () => refreshUpcomingUi(), { passive: true });
  document.addEventListener("viewshown", () => refreshUpcomingUi(), { passive: true });
  subscribeRuntimeConfig(() => refreshUpcomingUi({ force: true }));
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initUpcomingCalendarUi(), { once: true });
  } else {
    initUpcomingCalendarUi();
  }
}
