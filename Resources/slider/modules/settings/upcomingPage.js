import { fetchRuntimeConfigAdmin, getDefaultRuntimeConfig } from "../runtimeConfig.js";

function createHint(text) {
  const hint = document.createElement("div");
  hint.className = "description-text";
  hint.textContent = text;
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

function setFieldValue(root, selector, value) {
  const field = root.querySelector(selector);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = value === true;
    return;
  }
  field.value = value == null ? "" : String(value);
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

  const radarrEnabled = createCheckboxField("EnableRadarrIntegration", labels.enableRadarrIntegration || "Enable Radarr integration");
  const radarrUrl = createTextField("RadarrUrl", labels.radarrUrl || "Radarr URL", "https://radarr.example.com");
  const radarrApiKey = createTextField("RadarrApiKey", labels.radarrApiKey || "Radarr API key", "", "password");

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
    radarrEnabled.wrap,
    radarrUrl.wrap,
    radarrApiKey.wrap,
    upcomingDays.wrap,
    showHome.wrap,
    showTopNav.wrap,
    createHint(
      labels.calendarSettingsHint ||
      "Use the full base URL for Sonarr and Radarr, for example https://media.example.com/sonarr. Calendar requests are proxied through Jellyfin so the API keys stay server-side."
    ),
    flagsTitle,
    flagsIntro,
    flagsOnCards.wrap,
    flagsOnDetails.wrap,
    maxFlags.wrap
  );

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
    });

  return panel;
}
