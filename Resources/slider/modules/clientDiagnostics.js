import { getRuntimeConfigSnapshot } from "./runtimeConfig.js";

const DIAGNOSTIC_URL = "/TanadosUI/client-diagnostics";
const DEBUG_STORAGE_KEY = "tanados_ui_debug";
const RECENT_EVENT_LIMIT = 120;
const DEDUPE_WINDOW_MS = 30_000;

const recentEvents = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function pruneRecentEvents(now = Date.now()) {
  for (const [key, timestamp] of recentEvents) {
    if ((now - timestamp) > DEDUPE_WINDOW_MS) {
      recentEvents.delete(key);
    }
  }

  while (recentEvents.size > RECENT_EVENT_LIMIT) {
    const firstKey = recentEvents.keys().next().value;
    recentEvents.delete(firstKey);
  }
}

function readSearchFlag(search = "") {
  try {
    const params = new URLSearchParams(search || "");
    return params.get("tanadosDebug") === "1" || params.get("tanadosUiDebug") === "1";
  } catch {
    return false;
  }
}

function readHashFlag(hash = "") {
  const raw = text(hash).replace(/^#/, "");
  if (!raw) return false;

  const queryIndex = raw.indexOf("?");
  if (queryIndex >= 0) {
    return readSearchFlag(raw.slice(queryIndex + 1));
  }

  return /(?:^|[?&])tanados(?:Ui)?Debug=1(?:&|$)/i.test(raw);
}

export function isClientDiagnosticsVerboseEnabled() {
  try {
    if (localStorage.getItem(DEBUG_STORAGE_KEY) === "1") {
      return true;
    }
  } catch {}

  return readSearchFlag(window.location?.search) || readHashFlag(window.location?.hash);
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

function normalizePrimitive(value, maxLength = 240) {
  if (value == null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  return text(value).slice(0, maxLength);
}

function normalizeData(value, depth = 0) {
  if (depth > 4) {
    return "[max-depth]";
  }

  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map((entry) => normalizeData(entry, depth + 1));
  }

  if (typeof value === "object") {
    const normalized = {};
    for (const [key, entry] of Object.entries(value).slice(0, 24)) {
      normalized[text(key).slice(0, 80)] = normalizeData(entry, depth + 1);
    }
    return normalized;
  }

  return normalizePrimitive(value);
}

function getRuntimeVersion() {
  try {
    return text(getRuntimeConfigSnapshot()?.version);
  } catch {
    return "";
  }
}

async function getAuthHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  const token = getTokenSafe();
  const userId = await getCurrentUserIdSafe();
  if (token) headers["X-Emby-Token"] = token;
  if (userId) headers["X-Emby-UserId"] = userId;

  return headers;
}

function buildEventKey(payload) {
  const fingerprint = JSON.stringify(payload?.data || {});
  return [
    text(payload?.scope),
    text(payload?.event),
    text(payload?.level),
    fingerprint.slice(0, 1200)
  ].join("|");
}

function shouldSend(level) {
  const cleanLevel = text(level).toLowerCase();
  return cleanLevel === "warning" || cleanLevel === "error" || isClientDiagnosticsVerboseEnabled();
}

export async function emitClientDiagnostic(payload = {}) {
  const level = text(payload.level).toLowerCase() || "info";
  if (!shouldSend(level)) {
    return false;
  }

  const body = {
    scope: text(payload.scope) || "ui",
    event: text(payload.event) || "unspecified",
    level,
    message: text(payload.message).slice(0, 256),
    href: text(payload.href || window.location?.href).slice(0, 512),
    hash: text(payload.hash || window.location?.hash).slice(0, 256),
    pageTitle: text(payload.pageTitle || document.title).slice(0, 180),
    runtimeVersion: text(payload.runtimeVersion || getRuntimeVersion()).slice(0, 64),
    userAgent: text(payload.userAgent || navigator.userAgent).slice(0, 220),
    debugEnabled: isClientDiagnosticsVerboseEnabled(),
    data: normalizeData(payload.data || {})
  };

  const key = buildEventKey(body);
  const now = Date.now();
  pruneRecentEvents(now);
  if (payload.force !== true) {
    const lastSent = recentEvents.get(key) || 0;
    if ((now - lastSent) < DEDUPE_WINDOW_MS) {
      return false;
    }
  }
  recentEvents.set(key, now);

  try {
    const headers = await getAuthHeaders();
    if (!headers["X-Emby-UserId"] || !headers["X-Emby-Token"]) {
      return false;
    }

    const response = await fetch(DIAGNOSTIC_URL, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Client diagnostics HTTP ${response.status}`);
    }

    if (isClientDiagnosticsVerboseEnabled()) {
      console.info("[TanadosUI][diag]", body);
    }
    return true;
  } catch (error) {
    if (isClientDiagnosticsVerboseEnabled()) {
      console.warn("[TanadosUI][diag] failed", error, body);
    }
    return false;
  }
}

function setVerboseEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {}
}

window.TanadosUIDiagnostics = Object.assign(window.TanadosUIDiagnostics || {}, {
  emit(payload) {
    return emitClientDiagnostic(payload);
  },
  enableVerbose() {
    setVerboseEnabled(true);
  },
  disableVerbose() {
    setVerboseEnabled(false);
  },
  isVerboseEnabled() {
    return isClientDiagnosticsVerboseEnabled();
  }
});
