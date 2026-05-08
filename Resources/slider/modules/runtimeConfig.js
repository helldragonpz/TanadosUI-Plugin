const PUBLIC_RUNTIME_URL = "/TanadosUI/runtime-config";
const ADMIN_RUNTIME_URL = "/TanadosUI/runtime-config/admin";
const RUNTIME_CONFIG_EVENT = "tanados:runtime-config-updated";
const CACHE_TTL_MS = 30_000;

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  appDisplayName: "Tanados UI",
  headerLogoUrl: "",
  loginLogoUrl: "",
  faviconUrl: "",
  loginBackgroundUrl: "",
  primaryColor: "#6f43f3",
  secondaryColor: "#2f6bff",
  accentColor: "#f2c66b",
  showHeaderLogo: true,
  useCompactHeaderLogo: false,
  enableSonarrIntegration: false,
  sonarrUrl: "",
  sonarrApiKey: "",
  enableRadarrIntegration: false,
  radarrUrl: "",
  radarrApiKey: "",
  hasUpcomingIntegrations: false,
  upcomingDays: 14,
  showUpcomingOnHome: true,
  showUpcomingInTopNav: true,
  enableAudioFlagsOnCards: true,
  enableAudioFlagsOnDetails: true,
  audioFlagMaxCount: 2,
  preferredLang: "bg-BG",
  fallbackLang: "en-US",
  version: ""
});

let publicCache = null;
let publicLoadedAt = 0;
let publicPromise = null;
let adminCache = null;
let adminLoadedAt = 0;
let adminPromise = null;

function text(value) {
  return String(value ?? "").trim();
}

function getTokenSafe() {
  try {
    return window.ApiClient?.accessToken?.() || window.ApiClient?._accessToken || "";
  } catch {
    return "";
  }
}

async function getCurrentUserIdSafe() {
  try {
    const liveId = window.ApiClient?.getCurrentUserId?.() || window.ApiClient?._currentUserId || "";
    if (liveId) return String(liveId);
  } catch {}

  try {
    const user = await window.ApiClient?.getCurrentUser?.();
    return String(user?.Id || "");
  } catch {
    return "";
  }
}

async function getAuthHeaders({ includeJson = false } = {}) {
  const headers = { Accept: "application/json" };
  if (includeJson) headers["Content-Type"] = "application/json";

  const token = getTokenSafe();
  const userId = await getCurrentUserIdSafe();
  if (token) headers["X-Emby-Token"] = token;
  if (userId) headers["X-Emby-UserId"] = userId;

  try {
    const authHeader = String(
      (typeof getAuthHeader === "function" ? getAuthHeader() : "") || ""
    ).trim();
    if (authHeader) headers.Authorization = authHeader;
  } catch {}

  return headers;
}

function normalizeColor(value, fallback) {
  const clean = text(value);
  if (!clean) return fallback;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean) ? clean : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === false) return value;
  return fallback;
}

function normalizeNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeRuntimePayload(payload = {}, { includeSecrets = false } = {}) {
  const raw = (payload && typeof payload === "object") ? payload : {};
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    appDisplayName: text(raw.appDisplayName) || DEFAULT_RUNTIME_CONFIG.appDisplayName,
    headerLogoUrl: text(raw.headerLogoUrl),
    loginLogoUrl: text(raw.loginLogoUrl),
    faviconUrl: text(raw.faviconUrl),
    loginBackgroundUrl: text(raw.loginBackgroundUrl),
    primaryColor: normalizeColor(raw.primaryColor, DEFAULT_RUNTIME_CONFIG.primaryColor),
    secondaryColor: normalizeColor(raw.secondaryColor, DEFAULT_RUNTIME_CONFIG.secondaryColor),
    accentColor: normalizeColor(raw.accentColor, DEFAULT_RUNTIME_CONFIG.accentColor),
    showHeaderLogo: normalizeBoolean(raw.showHeaderLogo, DEFAULT_RUNTIME_CONFIG.showHeaderLogo),
    useCompactHeaderLogo: normalizeBoolean(raw.useCompactHeaderLogo, DEFAULT_RUNTIME_CONFIG.useCompactHeaderLogo),
    enableSonarrIntegration: normalizeBoolean(raw.enableSonarrIntegration, DEFAULT_RUNTIME_CONFIG.enableSonarrIntegration),
    sonarrUrl: includeSecrets ? text(raw.sonarrUrl) : "",
    sonarrApiKey: includeSecrets ? text(raw.sonarrApiKey) : "",
    enableRadarrIntegration: normalizeBoolean(raw.enableRadarrIntegration, DEFAULT_RUNTIME_CONFIG.enableRadarrIntegration),
    radarrUrl: includeSecrets ? text(raw.radarrUrl) : "",
    radarrApiKey: includeSecrets ? text(raw.radarrApiKey) : "",
    hasUpcomingIntegrations: normalizeBoolean(
      raw.hasUpcomingIntegrations,
      normalizeBoolean(raw.enableSonarrIntegration, false) || normalizeBoolean(raw.enableRadarrIntegration, false)
    ),
    upcomingDays: normalizeNumber(raw.upcomingDays, DEFAULT_RUNTIME_CONFIG.upcomingDays, 1, 90),
    showUpcomingOnHome: normalizeBoolean(raw.showUpcomingOnHome, DEFAULT_RUNTIME_CONFIG.showUpcomingOnHome),
    showUpcomingInTopNav: normalizeBoolean(raw.showUpcomingInTopNav, DEFAULT_RUNTIME_CONFIG.showUpcomingInTopNav),
    enableAudioFlagsOnCards: normalizeBoolean(raw.enableAudioFlagsOnCards, DEFAULT_RUNTIME_CONFIG.enableAudioFlagsOnCards),
    enableAudioFlagsOnDetails: normalizeBoolean(raw.enableAudioFlagsOnDetails, DEFAULT_RUNTIME_CONFIG.enableAudioFlagsOnDetails),
    audioFlagMaxCount: normalizeNumber(raw.audioFlagMaxCount, DEFAULT_RUNTIME_CONFIG.audioFlagMaxCount, 1, 6),
    preferredLang: text(raw.preferredLang) || DEFAULT_RUNTIME_CONFIG.preferredLang,
    fallbackLang: text(raw.fallbackLang) || DEFAULT_RUNTIME_CONFIG.fallbackLang,
    version: text(raw.version)
  };
}

function setWindowSnapshot(kind, payload) {
  try {
    const key = kind === "admin" ? "__TANADOS_RUNTIME_ADMIN_CONFIG__" : "__TANADOS_RUNTIME_CONFIG__";
    window[key] = payload;
  } catch {}
}

function dispatchRuntimeConfigUpdate(detail) {
  try {
    window.dispatchEvent(new CustomEvent(RUNTIME_CONFIG_EVENT, { detail }));
  } catch {}
}

async function fetchRuntimeConfigInternal(url, { force = false, includeSecrets = false, cacheKind = "public" } = {}) {
  const cache = cacheKind === "admin" ? adminCache : publicCache;
  const loadedAt = cacheKind === "admin" ? adminLoadedAt : publicLoadedAt;
  const inFlight = cacheKind === "admin" ? adminPromise : publicPromise;
  const now = Date.now();

  if (!force && cache && (now - loadedAt) < CACHE_TTL_MS) {
    return cache;
  }
  if (!force && inFlight) return inFlight;

  const promise = (async () => {
    const headers = await getAuthHeaders();
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers
    });
    if (!response.ok) {
      throw new Error(`Runtime config HTTP ${response.status}`);
    }
    const normalized = normalizeRuntimePayload(await response.json(), { includeSecrets });
    if (cacheKind === "admin") {
      adminCache = normalized;
      adminLoadedAt = Date.now();
    } else {
      publicCache = normalized;
      publicLoadedAt = Date.now();
    }
    setWindowSnapshot(cacheKind, normalized);
    dispatchRuntimeConfigUpdate({ kind: cacheKind, runtimeConfig: normalized });
    return normalized;
  })();

  if (cacheKind === "admin") adminPromise = promise;
  else publicPromise = promise;

  try {
    return await promise;
  } finally {
    if (cacheKind === "admin") adminPromise = null;
    else publicPromise = null;
  }
}

export function getRuntimeConfigSnapshot() {
  return publicCache || window.__TANADOS_RUNTIME_CONFIG__ || DEFAULT_RUNTIME_CONFIG;
}

export function getAdminRuntimeConfigSnapshot() {
  return adminCache || window.__TANADOS_RUNTIME_ADMIN_CONFIG__ || null;
}

export function getDefaultRuntimeConfig() {
  return DEFAULT_RUNTIME_CONFIG;
}

export async function fetchRuntimeConfig(options = {}) {
  return fetchRuntimeConfigInternal(PUBLIC_RUNTIME_URL, {
    ...options,
    includeSecrets: false,
    cacheKind: "public"
  });
}

export async function fetchRuntimeConfigAdmin(options = {}) {
  return fetchRuntimeConfigInternal(ADMIN_RUNTIME_URL, {
    ...options,
    includeSecrets: true,
    cacheKind: "admin"
  });
}

export async function updateRuntimeConfigAdmin(patch = {}) {
  const headers = await getAuthHeaders({ includeJson: true });
  const response = await fetch(ADMIN_RUNTIME_URL, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(patch || {})
  });
  if (!response.ok) {
    let message = `Runtime config HTTP ${response.status}`;
    try {
      const raw = await response.text();
      if (raw) message = raw;
    } catch {}
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({}));
  const runtime = normalizeRuntimePayload(data?.runtime || data, { includeSecrets: true });
  adminCache = runtime;
  adminLoadedAt = Date.now();
  setWindowSnapshot("admin", runtime);

  const publicRuntime = normalizeRuntimePayload(runtime, { includeSecrets: false });
  publicCache = publicRuntime;
  publicLoadedAt = Date.now();
  setWindowSnapshot("public", publicRuntime);
  dispatchRuntimeConfigUpdate({ kind: "admin", runtimeConfig: runtime });
  dispatchRuntimeConfigUpdate({ kind: "public", runtimeConfig: publicRuntime });

  return runtime;
}

export function subscribeRuntimeConfig(listener) {
  if (typeof listener !== "function") return () => {};

  const wrapped = (event) => {
    try {
      listener(event?.detail?.runtimeConfig || getRuntimeConfigSnapshot(), event);
    } catch {}
  };

  window.addEventListener(RUNTIME_CONFIG_EVENT, wrapped);
  return () => window.removeEventListener(RUNTIME_CONFIG_EVENT, wrapped);
}
