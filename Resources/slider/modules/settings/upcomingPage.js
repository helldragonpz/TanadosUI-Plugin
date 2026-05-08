import { fetchRuntimeConfigAdmin, getDefaultRuntimeConfig } from "../runtimeConfig.js";

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createHint(textValue, className = "description-text") {
  const hint = document.createElement("div");
  hint.className = className;
  hint.textContent = textValue;
  return hint;
}

function createFieldWrap(className = "fsetting-item") {
  const wrap = document.createElement("div");
  wrap.className = className;
  return wrap;
}

function createTextField(name, labelText, placeholder = "", type = "text") {
  const wrap = createFieldWrap();
  const label = document.createElement("label");
  label.htmlFor = name;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = type;
  input.id = name;
  input.name = name;
  input.placeholder = placeholder;

  wrap.append(label, input);
  return { wrap, input };
}

function createCheckboxField(name, labelText) {
  const wrap = document.createElement("div");
  wrap.className = "setting-item setting-item--checkbox";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = name;
  input.name = name;

  const label = document.createElement("label");
  label.htmlFor = name;
  label.textContent = labelText;

  wrap.append(input, label);
  return { wrap, input };
}

function createActionRow() {
  const row = document.createElement("div");
  row.className = "tanados-inline-actions";
  return row;
}

function createActionButton(textValue, source) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "raised button-alt tanados-inline-button";
  button.dataset.source = source;
  button.textContent = textValue;
  return button;
}

function createStatusBox(source) {
  const box = document.createElement("div");
  box.className = "tanados-inline-status tanados-inline-status--idle";
  box.dataset.source = source;
  box.hidden = true;
  return box;
}

function setStatusBox(box, tone, html) {
  if (!box) return;
  box.hidden = false;
  box.className = `tanados-inline-status tanados-inline-status--${tone || "info"}`;
  box.innerHTML = html;
}

function clearStatusBox(box) {
  if (!box) return;
  box.hidden = true;
  box.className = "tanados-inline-status tanados-inline-status--idle";
  box.textContent = "";
}

function setFieldValue(root, selector, value) {
  const field = root.querySelector(selector);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = value === true;
    return;
  }
  field.value = value == null ? "" : String(value);
}

async function getAuthHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  try {
    const token = window.ApiClient?.accessToken?.() || window.ApiClient?._accessToken || "";
    if (token) headers["X-Emby-Token"] = token;
  } catch {}

  try {
    const userId = window.ApiClient?.getCurrentUserId?.() || window.ApiClient?._currentUserId || "";
    if (userId) headers["X-Emby-UserId"] = userId;
  } catch {}

  try {
    const authHeader = String(
      (typeof getAuthHeader === "function" ? getAuthHeader() : "") || ""
    ).trim();
    if (authHeader) headers.Authorization = authHeader;
  } catch {}

  return headers;
}

async function runSourceTest({ source, url, apiKey, days }) {
  const headers = await getAuthHeaders();
  const response = await fetch("/TanadosUI/upcoming/test", {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      source,
      url,
      apiKey,
      days
    })
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    const message = text(payload?.error) || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload || {};
}

function buildTestResultHtml(payload, labels, fallbackName) {
  const sourceName = text(payload?.source) || fallbackName;
  const itemCount = Math.max(0, Number(payload?.itemCount) || 0);
  const posterCount = Math.max(0, Number(payload?.posterCount) || 0);
  const warning = text(payload?.warning);
  const samples = Array.isArray(payload?.sampleItems) ? payload.sampleItems : [];

  const summary = payload?.ok !== false
    ? `${labels.calendarConnectionSuccess || "Connection successful."} ${escapeHtml(sourceName)}.`
    : `${labels.calendarConnectionFailed || "Connection failed."} ${escapeHtml(sourceName)}.`;

  const meta = `
    <div class="tanados-inline-status__meta">
      <span>${escapeHtml(labels.calendarConnectionItems || "Items")}: <strong>${itemCount}</strong></span>
      <span>${escapeHtml(labels.calendarConnectionPosters || "Posters")}: <strong>${posterCount}</strong></span>
    </div>
  `;

  const samplesHtml = samples.length
    ? `
      <div class="tanados-inline-status__samples">
        <strong>${escapeHtml(labels.calendarConnectionSamples || "Sample items")}</strong>
        <ul>
          ${samples.map((item) => {
            const title = escapeHtml(item?.Title || item?.title || "");
            const subtitle = escapeHtml(item?.Subtitle || item?.subtitle || "");
            const date = escapeHtml(item?.ReleaseDateUtc || item?.releaseDateUtc || "");
            const parts = [subtitle, date].filter(Boolean).join(" • ");
            return `<li>${title}${parts ? ` <span>${parts}</span>` : ""}</li>`;
          }).join("")}
        </ul>
      </div>
    `
    : "";

  const warningHtml = warning
    ? `<div class="tanados-inline-status__warning">${escapeHtml(warning)}</div>`
    : "";

  return `
    <div class="tanados-inline-status__summary">${summary}</div>
    ${meta}
    ${warningHtml}
    ${samplesHtml}
  `;
}

function wireTestButton({
  button,
  statusBox,
  labels,
  source,
  fallbackName,
  urlInput,
  apiKeyInput,
  daysInput
}) {
  if (!button || !statusBox) return;

  const idleLabel = button.textContent || labels.calendarTestConnection || "Test connection";

  button.addEventListener("click", async () => {
    const url = text(urlInput?.value);
    const apiKey = text(apiKeyInput?.value);
    const days = Math.max(1, Math.min(90, Number(daysInput?.value) || 14));

    if (!url || !apiKey) {
      setStatusBox(
        statusBox,
        "warning",
        escapeHtml(labels.calendarConnectionMissingFields || "Enter the URL and API key before testing.")
      );
      return;
    }

    button.disabled = true;
    button.textContent = labels.calendarTestingConnection || "Testing...";
    setStatusBox(
      statusBox,
      "info",
      escapeHtml(labels.calendarTestingConnection || "Testing...")
    );

    try {
      const payload = await runSourceTest({ source, url, apiKey, days });
      const tone = payload?.ok === false
        ? "error"
        : payload?.itemCount > 0
          ? "success"
          : "warning";
      setStatusBox(statusBox, tone, buildTestResultHtml(payload, labels, fallbackName));
    } catch (error) {
      setStatusBox(
        statusBox,
        "error",
        escapeHtml(text(error?.message) || labels.calendarConnectionFailed || "Connection failed.")
      );
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });
}

export function createUpcomingPanel(config, labels) {
  const panel = document.createElement("div");
  panel.id = "upcoming-panel";
  panel.className = "settings-panel";

  const title = document.createElement("h3");
  title.textContent = labels.calendarSettingsTab || "Upcoming Calendar";

  const intro = createHint(
    labels.calendarSettingsDescription ||
    "Configure Sonarr and Radarr integration for the Tanados upcoming releases view and audio language badges."
  );

  panel.append(title, intro);

  if (config?.currentUserIsAdmin !== true) {
    panel.appendChild(createHint(
      labels.settingsReadOnly ||
      "This section is only editable by server administrators."
    ));
    return panel;
  }

  const defaults = getDefaultRuntimeConfig();

  const sonarrEnabled = createCheckboxField("EnableSonarrIntegration", labels.enableSonarrIntegration || "Enable Sonarr integration");
  const sonarrUrl = createTextField("SonarrUrl", labels.sonarrUrl || "Sonarr URL", "https://sonarr.example.com");
  const sonarrApiKey = createTextField("SonarrApiKey", labels.sonarrApiKey || "Sonarr API key", "", "password");
  const sonarrActions = createActionRow();
  const sonarrTestButton = createActionButton(labels.calendarTestSonarr || labels.calendarTestConnection || "Test Sonarr", "sonarr");
  const sonarrStatus = createStatusBox("sonarr");
  sonarrActions.append(sonarrTestButton, sonarrStatus);

  const radarrEnabled = createCheckboxField("EnableRadarrIntegration", labels.enableRadarrIntegration || "Enable Radarr integration");
  const radarrUrl = createTextField("RadarrUrl", labels.radarrUrl || "Radarr URL", "https://radarr.example.com");
  const radarrApiKey = createTextField("RadarrApiKey", labels.radarrApiKey || "Radarr API key", "", "password");
  const radarrActions = createActionRow();
  const radarrTestButton = createActionButton(labels.calendarTestRadarr || labels.calendarTestConnection || "Test Radarr", "radarr");
  const radarrStatus = createStatusBox("radarr");
  radarrActions.append(radarrTestButton, radarrStatus);

  const upcomingDays = createTextField("UpcomingDays", labels.upcomingDays || "Upcoming days to show", "14", "number");
  upcomingDays.input.min = "1";
  upcomingDays.input.max = "90";

  const showHome = createCheckboxField("ShowUpcomingOnHome", labels.showUpcomingOnHome || "Show upcoming section on home page");
  const showTopNav = createCheckboxField("ShowUpcomingInTopNav", labels.showUpcomingInTopNav || "Show Calendar in the top navigation");

  const flagsTitle = document.createElement("h3");
  flagsTitle.textContent = labels.audioFlagsSection || "Audio Language Badges";

  const flagsIntro = createHint(
    labels.audioFlagsDescription ||
    "Audio badges use Jellyfin media stream metadata. If a language does not have a mapped flag, its language code is shown instead."
  );

  const flagsOnCards = createCheckboxField("EnableAudioFlagsOnCards", labels.enableAudioFlagsOnCards || "Show audio badges on cards");
  const flagsOnDetails = createCheckboxField("EnableAudioFlagsOnDetails", labels.enableAudioFlagsOnDetails || "Show audio badges in details view");
  const maxFlags = createTextField("AudioFlagMaxCount", labels.audioFlagMaxCount || "Maximum badges to show", "2", "number");
  maxFlags.input.min = "1";
  maxFlags.input.max = "6";

  panel.append(
    sonarrEnabled.wrap,
    sonarrUrl.wrap,
    sonarrApiKey.wrap,
    sonarrActions,
    radarrEnabled.wrap,
    radarrUrl.wrap,
    radarrApiKey.wrap,
    radarrActions,
    upcomingDays.wrap,
    showHome.wrap,
    showTopNav.wrap,
    createHint(
      labels.calendarSettingsHint ||
      "Use the full base URL for Sonarr and Radarr, for example https://media.example.com/sonarr. Calendar requests are proxied through Jellyfin so the API keys stay server-side."
    ),
    createHint(
      labels.calendarStackHint ||
      "Bazarr and Boxarr can share the same reverse proxy stack, but Tanados UI only needs Sonarr and Radarr credentials here."
    ),
    flagsTitle,
    flagsIntro,
    flagsOnCards.wrap,
    flagsOnDetails.wrap,
    maxFlags.wrap
  );

  wireTestButton({
    button: sonarrTestButton,
    statusBox: sonarrStatus,
    labels,
    source: "sonarr",
    fallbackName: "Sonarr",
    urlInput: sonarrUrl.input,
    apiKeyInput: sonarrApiKey.input,
    daysInput: upcomingDays.input
  });

  wireTestButton({
    button: radarrTestButton,
    statusBox: radarrStatus,
    labels,
    source: "radarr",
    fallbackName: "Radarr",
    urlInput: radarrUrl.input,
    apiKeyInput: radarrApiKey.input,
    daysInput: upcomingDays.input
  });

  void fetchRuntimeConfigAdmin()
    .then((runtime) => {
      setFieldValue(panel, '[name="EnableSonarrIntegration"]', runtime.enableSonarrIntegration);
      setFieldValue(panel, '[name="SonarrUrl"]', runtime.sonarrUrl);
      setFieldValue(panel, '[name="SonarrApiKey"]', runtime.sonarrApiKey);
      setFieldValue(panel, '[name="EnableRadarrIntegration"]', runtime.enableRadarrIntegration);
      setFieldValue(panel, '[name="RadarrUrl"]', runtime.radarrUrl);
      setFieldValue(panel, '[name="RadarrApiKey"]', runtime.radarrApiKey);
      setFieldValue(panel, '[name="UpcomingDays"]', runtime.upcomingDays);
      setFieldValue(panel, '[name="ShowUpcomingOnHome"]', runtime.showUpcomingOnHome);
      setFieldValue(panel, '[name="ShowUpcomingInTopNav"]', runtime.showUpcomingInTopNav);
      setFieldValue(panel, '[name="EnableAudioFlagsOnCards"]', runtime.enableAudioFlagsOnCards);
      setFieldValue(panel, '[name="EnableAudioFlagsOnDetails"]', runtime.enableAudioFlagsOnDetails);
      setFieldValue(panel, '[name="AudioFlagMaxCount"]', runtime.audioFlagMaxCount);
    })
    .catch(() => {
      setFieldValue(panel, '[name="UpcomingDays"]', defaults.upcomingDays);
      setFieldValue(panel, '[name="ShowUpcomingOnHome"]', defaults.showUpcomingOnHome);
      setFieldValue(panel, '[name="ShowUpcomingInTopNav"]', defaults.showUpcomingInTopNav);
      setFieldValue(panel, '[name="EnableAudioFlagsOnCards"]', defaults.enableAudioFlagsOnCards);
      setFieldValue(panel, '[name="EnableAudioFlagsOnDetails"]', defaults.enableAudioFlagsOnDetails);
      setFieldValue(panel, '[name="AudioFlagMaxCount"]', defaults.audioFlagMaxCount);
      clearStatusBox(sonarrStatus);
      clearStatusBox(radarrStatus);
    });

  return panel;
}
