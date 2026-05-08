import { makeApiRequest, getSessionInfo } from "../../Plugins/TanadosUI/runtime/api.js";
import { createAudioLanguageBadges } from "./audioLanguageUtils.js";
import { fetchRuntimeConfig, getRuntimeConfigSnapshot, subscribeRuntimeConfig } from "./runtimeConfig.js";

const STYLE_ID = "tanados-audio-language-badges-style";
const BADGE_STRIP_CLASS = "TanadosUI-audio-card-badges";
const CARD_SELECTOR = [
  ".card[data-id]",
  ".cardBox[data-id]",
  "button.cardBox[data-id]",
  "a.card[data-id]"
].join(", ");

const itemCache = new Map();
const itemPromises = new Map();
let refreshTimer = 0;
let observer = null;

function text(value) {
  return String(value ?? "").trim();
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${BADGE_STRIP_CLASS} {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 4;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      pointer-events: none;
    }
    .${BADGE_STRIP_CLASS} .tanados-audio-flag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(6, 7, 13, 0.72);
      border: 1px solid rgba(242, 198, 107, 0.22);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      color: #fff;
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      backdrop-filter: blur(8px);
      text-shadow: none;
    }
  `;
  document.head.appendChild(style);
}

function getRuntimeOptions() {
  const runtime = getRuntimeConfigSnapshot();
  return {
    enabled: runtime?.enableAudioFlagsOnCards !== false,
    maxCount: Math.max(1, Number(runtime?.audioFlagMaxCount) || 2)
  };
}

function getItemId(card) {
  return text(
    card?.dataset?.id ||
    card?.getAttribute?.("data-id") ||
    card?.dataset?.itemid ||
    card?.dataset?.itemId
  );
}

function findCardHost(card) {
  const host = card?.querySelector?.(".cardScalable, .cardImageContainer, .cardPadder, .cardBox") || card;
  if (!(host instanceof HTMLElement)) return null;
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }
  return host;
}

function isLikelyMediaType(item) {
  const type = text(item?.Type).toLowerCase();
  return type === "movie" || type === "series" || type === "season" || type === "episode";
}

function isCardVisible(card) {
  if (!(card instanceof HTMLElement)) return false;
  const rect = card.getBoundingClientRect?.();
  if (!rect) return false;
  return rect.bottom >= -140 && rect.top <= (window.innerHeight || 0) + 140 && rect.width > 20 && rect.height > 20;
}

async function fetchItem(itemId) {
  if (!itemId) return null;
  if (itemCache.has(itemId)) return itemCache.get(itemId);
  if (itemPromises.has(itemId)) return itemPromises.get(itemId);

  const promise = (async () => {
    const session = getSessionInfo?.() || {};
    const userId = text(session.userId || window.ApiClient?.getCurrentUserId?.() || window.ApiClient?._currentUserId);
    if (!userId) return null;

    const item = await makeApiRequest(
      `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?Fields=MediaStreams,Type`
    ).catch(() => null);

    itemCache.set(itemId, item || null);
    itemPromises.delete(itemId);
    return item || null;
  })();

  itemPromises.set(itemId, promise);
  return promise;
}

function renderBadgeStrip(host, badges = []) {
  let strip = host.querySelector(`.${BADGE_STRIP_CLASS}`);
  if (!strip) {
    strip = document.createElement("div");
    strip.className = BADGE_STRIP_CLASS;
    host.appendChild(strip);
  }

  strip.replaceChildren(
    ...badges.map((badge) => {
      const chip = document.createElement("span");
      chip.className = "tanados-audio-flag";
      chip.textContent = badge.text;
      chip.title = badge.label || badge.code;
      return chip;
    })
  );
}

function removeBadgeStrip(host) {
  host?.querySelector?.(`.${BADGE_STRIP_CLASS}`)?.remove();
}

async function annotateCard(card) {
  const { enabled, maxCount } = getRuntimeOptions();
  const host = findCardHost(card);
  if (!host) return;

  if (!enabled) {
    removeBadgeStrip(host);
    return;
  }

  const itemId = getItemId(card);
  if (!itemId) return;

  const item = await fetchItem(itemId);
  if (!isLikelyMediaType(item)) {
    removeBadgeStrip(host);
    return;
  }

  const badges = createAudioLanguageBadges(item?.MediaStreams, { maxCount });
  if (!badges.length) {
    removeBadgeStrip(host);
    return;
  }

  renderBadgeStrip(host, badges);
}

async function refreshVisibleCards() {
  ensureStyles();

  const cards = Array.from(document.querySelectorAll(CARD_SELECTOR))
    .filter((card) => card instanceof HTMLElement && isCardVisible(card))
    .slice(0, 36);

  for (const card of cards) {
    try {
      await annotateCard(card);
    } catch {}
  }
}

export function refreshAudioLanguageBadges() {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void refreshVisibleCards();
  }, 80);
}

function startObserver() {
  if (observer) return;
  const root = document.body || document.documentElement;
  if (!root) return;

  observer = new MutationObserver(() => {
    refreshAudioLanguageBadges();
  });

  try {
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  } catch {}
}

export function initAudioLanguageBadges() {
  void fetchRuntimeConfig().catch(() => null);
  ensureStyles();
  refreshAudioLanguageBadges();
  startObserver();

  window.addEventListener("hashchange", refreshAudioLanguageBadges, { passive: true });
  window.addEventListener("pageshow", refreshAudioLanguageBadges, { passive: true });
  window.addEventListener("focus", refreshAudioLanguageBadges, { passive: true });
  document.addEventListener("viewshow", refreshAudioLanguageBadges, { passive: true });
  document.addEventListener("viewshown", refreshAudioLanguageBadges, { passive: true });
  window.addEventListener("scroll", refreshAudioLanguageBadges, { passive: true });
  subscribeRuntimeConfig(() => refreshAudioLanguageBadges());
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAudioLanguageBadges(), { once: true });
  } else {
    initAudioLanguageBadges();
  }
}
