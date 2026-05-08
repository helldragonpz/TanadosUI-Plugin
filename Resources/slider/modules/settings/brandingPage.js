import { fetchRuntimeConfigAdmin, getDefaultRuntimeConfig } from "../runtimeConfig.js";

function createFieldWrap(className = "fsetting-item") {
  const wrap = document.createElement("div");
  wrap.className = className;
  return wrap;
}

function createHint(text) {
  const hint = document.createElement("div");
  hint.className = "description-text";
  hint.textContent = text;
  return hint;
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
  wrap.className = "setting-item";

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

export function createBrandingPanel(config, labels) {
  const panel = document.createElement("div");
  panel.id = "branding-panel";
  panel.className = "settings-panel";

  const title = document.createElement("h3");
  title.textContent = labels.brandingSettingsTab || "Tanados UI Branding";

  const intro = createHint(
    labels.brandingSettingsDescription ||
    "Configure the visible Tanados UI name, logos, favicon, login background, and primary theme colors."
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

  const displayName = createTextField(
    "AppDisplayName",
    labels.appDisplayName || "App display name",
    defaults.appDisplayName
  );
  const headerLogo = createTextField(
    "HeaderLogoUrl",
    labels.headerLogoUrl || "Header logo URL",
    "/Plugins/TanadosUI/assets/slider/src/images/tanados-logo.png"
  );
  const loginLogo = createTextField(
    "LoginLogoUrl",
    labels.loginLogoUrl || "Login logo URL",
    "/Plugins/TanadosUI/assets/slider/src/images/tanados-logo.png"
  );
  const favicon = createTextField(
    "FaviconUrl",
    labels.faviconUrl || "Favicon URL",
    "/Plugins/TanadosUI/assets/slider/src/images/tanados-favicon.png"
  );
  const loginBackground = createTextField(
    "LoginBackgroundUrl",
    labels.loginBackgroundUrl || "Login background image URL",
    "https://..."
  );
  const primaryColor = createTextField("PrimaryColor", labels.primaryColor || "Primary color", "#6f43f3", "color");
  const secondaryColor = createTextField("SecondaryColor", labels.secondaryColor || "Secondary color", "#2f6bff", "color");
  const accentColor = createTextField("AccentColor", labels.accentColor || "Accent / glow color", "#f2c66b", "color");
  const showHeaderLogo = createCheckboxField("ShowHeaderLogo", labels.showHeaderLogo || "Show logo in header");
  const compactHeaderLogo = createCheckboxField("UseCompactHeaderLogo", labels.useCompactHeaderLogo || "Use compact header logo");

  panel.append(
    displayName.wrap,
    headerLogo.wrap,
    loginLogo.wrap,
    favicon.wrap,
    loginBackground.wrap,
    primaryColor.wrap,
    secondaryColor.wrap,
    accentColor.wrap,
    showHeaderLogo.wrap,
    compactHeaderLogo.wrap,
    createHint(
      labels.brandingSettingsHint ||
      "Leave URL fields empty to use the bundled Tanados assets. Remote URLs should be stable and directly reachable by the browser."
    )
  );

  void fetchRuntimeConfigAdmin()
    .then((runtime) => {
      setFieldValue(panel, '[name="AppDisplayName"]', runtime.appDisplayName);
      setFieldValue(panel, '[name="HeaderLogoUrl"]', runtime.headerLogoUrl);
      setFieldValue(panel, '[name="LoginLogoUrl"]', runtime.loginLogoUrl);
      setFieldValue(panel, '[name="FaviconUrl"]', runtime.faviconUrl);
      setFieldValue(panel, '[name="LoginBackgroundUrl"]', runtime.loginBackgroundUrl);
      setFieldValue(panel, '[name="PrimaryColor"]', runtime.primaryColor);
      setFieldValue(panel, '[name="SecondaryColor"]', runtime.secondaryColor);
      setFieldValue(panel, '[name="AccentColor"]', runtime.accentColor);
      setFieldValue(panel, '[name="ShowHeaderLogo"]', runtime.showHeaderLogo);
      setFieldValue(panel, '[name="UseCompactHeaderLogo"]', runtime.useCompactHeaderLogo);
    })
    .catch(() => {
      setFieldValue(panel, '[name="AppDisplayName"]', defaults.appDisplayName);
      setFieldValue(panel, '[name="PrimaryColor"]', defaults.primaryColor);
      setFieldValue(panel, '[name="SecondaryColor"]', defaults.secondaryColor);
      setFieldValue(panel, '[name="AccentColor"]', defaults.accentColor);
      setFieldValue(panel, '[name="ShowHeaderLogo"]', defaults.showHeaderLogo);
      setFieldValue(panel, '[name="UseCompactHeaderLogo"]', defaults.useCompactHeaderLogo);
    });

  return panel;
}
