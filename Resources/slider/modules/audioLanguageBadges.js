import {
  AUTH_PROFILE_CHANGED_EVENT,
  USERDATA_CHANGED_EVENT,
  makeApiRequest,
  getSessionInfo
} from "../../Plugins/TanadosUI/runtime/api.js";
import { createAudioLanguageBadges } from "./audioLanguageUtils.js";
import { fetchRuntimeConfig, getRuntimeConfigSnapshot, subscribeRuntimeConfig } from "./runtimeConfig.js";
import { emitClientDiagnostic, isClientDiagnosticsVerboseEnabled } from "./clientDiagnostics.js";

const STYLE_ID = "tanados-audio-language-badges-style";
const CARD_BADGE_CLASS = "TanadosUI-audio-card-badges";
const DETAIL_BADGE_CLASS = "TanadosUI-audio-detail-badges";
const CARD_SCOPE_SELECTOR = [
  ".card[data-id]",
  ".card[data-item-id]",
  ".card[data-itemid]",
  ".cardBox[data-id]",
  ".cardBox[data-item-id]",
  ".cardBox[data-itemid]",
  ".cardScalable[data-id]",
  ".cardScalable[data-item-id]",
  ".cardScalable[data-itemid]",
  ".itemAction[data-id]",
  ".itemAction[data-item-id]",
  ".itemAction[data-itemid]",
  ".personal-recs-card[data-item-id]",
  ".personal-recs-card[data-itemid]",
  ".dir-row-hero[data-item-id]",
  ".dir-row-hero[data-itemid]",
  "a[href*='#/details?id=']",
  "button[data-id]",
  "button[data-item-id]",
  "button[data-itemid]",
  "[data-item-id]",
  "[data-itemid]"
].join(", ");
const CARD_HOST_SELECTOR = ".cardImageContainer, .cardOverlayContainer, .cardPadder, .cardScalable, .cardBox";

const itemCache = new Map();
const itemPromises = new Map();
const episodeCache = new Map();
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
    .${CARD_BADGE_CLASS} {
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
    .${CARD_BADGE_CLASS} .tanados-audio-flag,
    .${DETAIL_BADGE_CLASS} .tanados-audio-flag {
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
    .${DETAIL_BADGE_CLASS} {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 0;
    }
  `;
  document.head.appendChild(style);
}

function getRuntimeOptions() {
  const runtime = getRuntimeConfigSnapshot();
  return {
    cardsEnabled: runtime?.enableAudioFlagsOnCards !== false,
    detailsEnabled: runtime?.enableAudioFlagsOnDetails !== false,
    maxCount: Math.max(1, Number(runtime?.audioFlagMaxCount) || 2)
  };
}

function parseDetailsIdFromHref(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/[?#&]id=([^&]+)/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getCurrentUserId() {
  return text(
    getSessionInfo?.()?.userId ||
    window.ApiClient?.getCurrentUserId?.() ||
    window.ApiClient?._currentUserId
  );
}

function createRefreshStats(mode = "cards") {
  return {
    mode,
    userIdPresent: !!getCurrentUserId(),
    visibleCardCount: 0,
    annotatedCardCount: 0,
    renderedCardCount: 0,
    noBadgeCount: 0,
    noMediaCount: 0,
    missingItemIdCount: 0,
    fetchFailureCount: 0,
    seriesFallbackCount: 0,
    seriesFallbackMissCount: 0,
    detailItemId: "",
    detailRendered: false,
    detailFetchFailed: false,
    detailNoBadges: false,
    sampleItemIds: []
  };
}

function pushSampleItemId(stats, itemId) {
  if (!stats || !itemId) return;
  if (stats.sampleItemIds.includes(itemId)) return;
  if (stats.sampleItemIds.length >= 6) return;
  stats.sampleItemIds.push(itemId);
}

function extractMediaStreams(item) {
  if (Array.isArray(item?.MediaStreams) && item.MediaStreams.length) {
    return item.MediaStreams;
  }

  if (Array.isArray(item?.MediaSources)) {
    const streams = item.MediaSources.flatMap((source) => Array.isArray(source?.MediaStreams) ? source.MediaStreams : []);
    if (streams.length) return streams;
  }

  return [];
}

function getItemType(item) {
  return text(item?.Type).toLowerCase();
}

function isSeriesLikeType(item) {
  const type = getItemType(item);
  return type === "series" || type === "season";
}

async function fetchFirstEpisodeForParent(parentId, stats = null) {
  const key = text(parentId);
  const userId = getCurrentUserId();
  if (!key || !userId) return null;
  if (episodeCache.has(key)) return episodeCache.get(key);

  const payload = await makeApiRequest(
    `/Users/${encodeURIComponent(userId)}/Items?ParentId=${encodeURIComponent(key)}&IncludeItemTypes=Episode&Recursive=true&SortBy=SortName&SortOrder=Ascending&Limit=1&Fields=MediaStreams,MediaSources,Type`
  ).catch((error) => {
    stats && (stats.fetchFailureCount += 1);
    void emitClientDiagnostic({
      scope: "audio-flags",
      event: "episode-fallback-fetch-failed",
      level: "warning",
      message: "Failed to fetch a representative episode for an audio badge fallback.",
      data: {
        parentId: key,
        status: Number(error?.status) || 0,
        error: text(error?.message).slice(0, 180)
      }
    });
    return null;
  });

  const episode = Array.isArray(payload?.Items) ? payload.Items[0] || null : null;
  if (episode) {
    episodeCache.set(key, episode);
    stats && (stats.seriesFallbackCount += 1);
  } else {
    episodeCache.delete(key);
    stats && (stats.seriesFallbackMissCount += 1);
  }
  return episode;
}

async function resolveAudioSourceItem(item, stats = null) {
  if (!item) return null;
  if (extractMediaStreams(item).length > 0) return item;
  if (!isSeriesLikeType(item)) return item;

  const episode = await fetchFirstEpisodeForParent(item.Id, stats);
  return episode || item;
}

function getItemId(target) {
  const direct = text(
    target?.dataset?.itemId ||
    target?.dataset?.itemid ||
    target?.dataset?.id ||
    target?.getAttribute?.("data-item-id") ||
    target?.getAttribute?.("data-itemid") ||
    target?.getAttribute?.("data-id")
  );
  if (direct) return direct;

  const carrier = target?.closest?.("[data-item-id], [data-itemid], [data-id]");
  const carrierId = text(
    carrier?.dataset?.itemId ||
    carrier?.dataset?.itemid ||
    carrier?.dataset?.id ||
    carrier?.getAttribute?.("data-item-id") ||
    carrier?.getAttribute?.("data-itemid") ||
    carrier?.getAttribute?.("data-id")
  );
  if (carrierId) return carrierId;

  const link = target?.closest?.("a[href*='id=']");
  return parseDetailsIdFromHref(link?.getAttribute?.("href"));
}

function getCardScope(target) {
  if (!(target instanceof HTMLElement)) return null;
  if (target.matches?.(CARD_SCOPE_SELECTOR)) return target;

  const scoped =
    target.closest?.(".personal-recs-card, .dir-row-hero, .cardContent, .cardScalable, .cardBox, .card, .itemAction") ||
    target.closest?.("[data-id], [data-item-id], [data-itemid]");
  return scoped instanceof HTMLElement ? scoped : target;
}

function getCardHost(target) {
  const scope = getCardScope(target);
  if (!scope) return null;

  const direct = scope.matches?.(CARD_HOST_SELECTOR) ? scope : null;
  const host =
    scope.querySelector?.(".cardImageContainer") ||
    scope.querySelector?.(".cardOverlayContainer") ||
    scope.querySelector?.(".cardPadder") ||
    scope.querySelector?.(".cardScalable") ||
    scope.querySelector?.(".cardBox") ||
    direct ||
    (scope.matches?.(".personal-recs-card, .dir-row-hero, .card, .cardBox, .cardScalable, .itemAction") ? scope : null);

  if (!(host instanceof HTMLElement)) return null;
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }
  return host;
}

function isLikelyMediaType(item) {
  const type = text(item?.Type).toLowerCase();
  return (
    type === "movie" ||
    type === "series" ||
    type === "season" ||
    type === "episode" ||
    type === "video" ||
    type === "musicvideo" ||
    type === "trailer" ||
    extractMediaStreams(item).length > 0
  );
}

function isCardVisible(card) {
  if (!(card instanceof HTMLElement)) return false;
  const rect = card.getBoundingClientRect?.();
  if (!rect) return false;
  return rect.bottom >= -140 && rect.top <= (window.innerHeight || 0) + 140 && rect.width > 20 && rect.height > 20;
}

async function fetchItem(itemId, stats = null) {
  if (!itemId) return null;
  if (itemCache.has(itemId)) return itemCache.get(itemId);
  if (itemPromises.has(itemId)) return itemPromises.get(itemId);

  const promise = (async () => {
    let fetchError = null;
    let item = await makeApiRequest(
      `/Items/${encodeURIComponent(itemId)}?Fields=MediaStreams,MediaSources,Type`
    ).catch((error) => {
      fetchError = error;
      return null;
    });

    if ((!item || !extractMediaStreams(item).length) && getCurrentUserId()) {
      const userId = getCurrentUserId();
      item = await makeApiRequest(
        `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?Fields=MediaStreams,MediaSources,Type`
      ).catch((error) => {
        fetchError = fetchError || error;
        return item;
      });
    }

    if (item) {
      itemCache.set(itemId, item);
    } else {
      itemCache.delete(itemId);
      if (stats) {
        stats.fetchFailureCount += 1;
        pushSampleItemId(stats, itemId);
      }
      if (fetchError) {
        void emitClientDiagnostic({
          scope: "audio-flags",
          event: "item-fetch-failed",
          level: "warning",
          message: "Audio badge item fetch returned no usable payload.",
          data: {
            itemId,
            status: Number(fetchError?.status) || 0,
            error: text(fetchError?.message).slice(0, 180),
            userIdPresent: !!getCurrentUserId()
          }
        });
      }
    }
    itemPromises.delete(itemId);
    return item || null;
  })();

  itemPromises.set(itemId, promise);
  return promise;
}

function renderBadgeStrip(host, badges = [], className = CARD_BADGE_CLASS) {
  let strip = host.querySelector(`.${className}`);
  if (!strip) {
    strip = document.createElement("div");
    strip.className = className;
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

function removeBadgeStrip(host, className = CARD_BADGE_CLASS) {
  host?.querySelector?.(`.${className}`)?.remove();
}

function collectCardScopes(root = document) {
  const cards = new Set();

  const push = (node) => {
    const scope = getCardScope(node);
    if (scope instanceof HTMLElement) cards.add(scope);
  };

  if (root instanceof HTMLElement && root.matches?.(CARD_SCOPE_SELECTOR)) {
    push(root);
  }

  try {
    const nodes = root.querySelectorAll?.(CARD_SCOPE_SELECTOR) || [];
    nodes.forEach(push);
  } catch {}

  return Array.from(cards);
}

async function annotateCard(card, stats = null) {
  const { cardsEnabled, maxCount } = getRuntimeOptions();
  const host = getCardHost(card);
  if (!host) return;

  if (!cardsEnabled) {
    removeBadgeStrip(host);
    return;
  }

  const itemId = getItemId(card);
  if (!itemId) {
    stats && (stats.missingItemIdCount += 1);
    removeBadgeStrip(host);
    return;
  }

  stats && (stats.annotatedCardCount += 1);
  pushSampleItemId(stats, itemId);

  const item = await fetchItem(itemId, stats);
  const audioSource = await resolveAudioSourceItem(item, stats);
  if (!isLikelyMediaType(audioSource)) {
    stats && (stats.noMediaCount += 1);
    removeBadgeStrip(host);
    return;
  }

  const badges = createAudioLanguageBadges(extractMediaStreams(audioSource), { maxCount });
  if (!badges.length) {
    stats && (stats.noBadgeCount += 1);
    removeBadgeStrip(host);
    return;
  }

  stats && (stats.renderedCardCount += 1);
  renderBadgeStrip(host, badges);
}

function getVisibleDetailPage() {
  return document.querySelector(
    "#itemDetailPage:not(.hide), .itemDetailPage:not(.hide), .detailPage:not(.hide), [data-role='page']:not(.hide) .detailPage"
  );
}

function getDetailItemId() {
  const fromHash = parseDetailsIdFromHref(window.location.hash || "");
  if (fromHash) return fromHash;

  const page = getVisibleDetailPage();
  return getItemId(page);
}

function getDetailBadgeAnchor(page) {
  if (!(page instanceof HTMLElement)) return null;
  return page.querySelector(
    ".detailPagePrimaryContent .itemName, .detailPagePrimaryContent h1, .detailPagePrimaryContainer .itemName, .detailPagePrimaryContainer h1, h1.itemName"
  );
}

async function refreshVisibleCards() {
  ensureStyles();
  const stats = createRefreshStats("cards");

  const cards = collectCardScopes(document)
    .filter((card) => isCardVisible(card))
    .slice(0, 64);
  stats.visibleCardCount = cards.length;

  await Promise.allSettled(cards.map((card) => annotateCard(card, stats)));
  return stats;
}

async function refreshDetailBadges() {
  ensureStyles();
  const stats = createRefreshStats("detail");

  const { detailsEnabled, maxCount } = getRuntimeOptions();
  const page = getVisibleDetailPage();
  if (!(page instanceof HTMLElement)) return stats;

  const title = getDetailBadgeAnchor(page);
  const parent = title?.parentElement || page;
  if (!detailsEnabled) {
    removeBadgeStrip(parent, DETAIL_BADGE_CLASS);
    return stats;
  }

  const itemId = getDetailItemId();
  stats.detailItemId = itemId;
  if (!itemId) {
    removeBadgeStrip(parent, DETAIL_BADGE_CLASS);
    return stats;
  }

  const item = await fetchItem(itemId, stats);
  const audioSource = await resolveAudioSourceItem(item, stats);
  if (!isLikelyMediaType(audioSource)) {
    stats.detailFetchFailed = !item;
    removeBadgeStrip(parent, DETAIL_BADGE_CLASS);
    return stats;
  }

  const badges = createAudioLanguageBadges(extractMediaStreams(audioSource), { maxCount });
  if (!badges.length) {
    stats.detailNoBadges = true;
    removeBadgeStrip(parent, DETAIL_BADGE_CLASS);
    return stats;
  }

  if (!(title instanceof HTMLElement) || !(parent instanceof HTMLElement)) {
    return stats;
  }

  let strip = parent.querySelector(`.${DETAIL_BADGE_CLASS}`);
  if (!strip) {
    strip = document.createElement("div");
    strip.className = DETAIL_BADGE_CLASS;
    title.insertAdjacentElement("afterend", strip);
  }
  renderBadgeStrip(parent, badges, DETAIL_BADGE_CLASS);
  stats.detailRendered = true;
  return stats;
}

async function maybeReportAudioDiagnostics(cardStats, detailStats) {
  const verbose = isClientDiagnosticsVerboseEnabled();
  const suspiciousCards =
    cardStats.visibleCardCount > 0 &&
    cardStats.renderedCardCount === 0 &&
    (
      cardStats.fetchFailureCount > 0 ||
      cardStats.seriesFallbackCount > 0 ||
      !cardStats.userIdPresent
    );
  const suspiciousDetail =
    !!detailStats.detailItemId &&
    !detailStats.detailRendered &&
    (detailStats.detailFetchFailed || detailStats.fetchFailureCount > 0);

  if (!suspiciousCards && !suspiciousDetail && !verbose) {
    return;
  }

  await emitClientDiagnostic({
    scope: "audio-flags",
    event: suspiciousCards || suspiciousDetail ? "badge-refresh-suspect" : "badge-refresh-summary",
    level: suspiciousCards || suspiciousDetail ? "warning" : "info",
    message: suspiciousCards || suspiciousDetail
      ? "Audio badge refresh finished without visible output on a page that should have been eligible."
      : "Audio badge refresh summary.",
    data: {
      cards: cardStats,
      detail: detailStats
    }
  });
}

export function refreshAudioLanguageBadges() {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void (async () => {
      const [cardStats, detailStats] = await Promise.all([
        refreshVisibleCards(),
        refreshDetailBadges()
      ]);
      await maybeReportAudioDiagnostics(cardStats, detailStats);
    })();
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
  document.addEventListener(AUTH_PROFILE_CHANGED_EVENT, () => {
    itemCache.clear();
    itemPromises.clear();
    episodeCache.clear();
    refreshAudioLanguageBadges();
  }, true);
  document.addEventListener(USERDATA_CHANGED_EVENT, () => {
    itemPromises.clear();
    episodeCache.clear();
    refreshAudioLanguageBadges();
  }, true);
  subscribeRuntimeConfig(() => refreshAudioLanguageBadges());
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAudioLanguageBadges(), { once: true });
  } else {
    initAudioLanguageBadges();
  }
}
