import { fetchRuntimeConfigAdmin, getDefaultRuntimeConfig } from "../runtimeConfig.js";
import { showNotification } from "../player/ui/notification.js";

const BRANDING_UPLOAD_BASE = "/TanadosUI/branding-assets";

function text(value) {
  return String(value ?? "").trim();
}

function createFieldWrap(className = "fsetting-item") {
  const wrap = document.createElement("div");
  wrap.className = className;
  return wrap;
}

function createHint(value) {
  const hint = document.createElement("div");
  hint.className = "description-text";
  hint.textContent = value;
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

function emitFieldUpdate(field) {
  try {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {}
}

function setFieldValue(root, selector, value) {
  const field = root.querySelector(selector);
  if (!field) return;
  if (field.type === "checkbox") {
    field.checked = value === true;
    emitFieldUpdate(field);
    return;
  }
  field.value = value == null ? "" : String(value);
  emitFieldUpdate(field);
}

async function getAuthHeaders({ includeJson = false } = {}) {
  const headers = { Accept: "application/json" };
  if (includeJson) headers["Content-Type"] = "application/json";

  try {
    const token = window.ApiClient?.accessToken?.() || window.ApiClient?._accessToken || "";
    const userId =
      window.ApiClient?.getCurrentUserId?.() ||
      window.ApiClient?._currentUserId ||
      (await window.ApiClient?.getCurrentUser?.())?.Id ||
      "";

    if (token) headers["X-Emby-Token"] = String(token);
    if (userId) {
      headers["X-Emby-UserId"] = String(userId);
      headers["X-MediaBrowser-UserId"] = String(userId);
    }
  } catch {}

  try {
    const authHeader = String(
      (typeof getAuthHeader === "function" ? getAuthHeader() : "") || ""
    ).trim();
    if (authHeader) headers.Authorization = authHeader;
  } catch {}

  return headers;
}

async function uploadBrandingAsset(slot, file, currentUrl = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (text(currentUrl)) {
    formData.append("currentUrl", text(currentUrl));
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${BRANDING_UPLOAD_BASE}/${slot}`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = text(payload?.error) || `Branding asset upload HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function deleteBrandingAsset(slot, currentUrl = "") {
  const headers = await getAuthHeaders({ includeJson: true });
  const response = await fetch(`${BRANDING_UPLOAD_BASE}/${slot}/delete`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ currentUrl: text(currentUrl) })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = text(payload?.error) || `Branding asset delete HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function createActionButton(labelText, tone = "primary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = tone === "secondary" ? "btn reset-btn" : "btn";
  button.textContent = labelText;
  return button;
}

function createAssetField({
  slot,
  name,
  labelText,
  placeholder = "",
  previewKind = "logo",
  accept = ".png,.webp,.svg,.jpg,.jpeg,.gif,.ico",
  labels
}) {
  const wrap = createFieldWrap("fsetting-item tanados-branding-asset-field");

  const label = document.createElement("label");
  label.htmlFor = name;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.id = name;
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = "off";

  const actions = document.createElement("div");
  actions.className = "tanados-branding-upload-row";

  const uploadButton = createActionButton(labels.brandingUploadAsset || "Upload asset");
  const bundledButton = createActionButton(labels.brandingUseBundledAsset || "Use bundled asset", "secondary");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = accept;
  fileInput.className = "tanados-branding-file-input";
  fileInput.setAttribute("aria-hidden", "true");
  fileInput.tabIndex = -1;

  const status = document.createElement("div");
  status.className = "tanados-branding-upload-status";

  const preview = document.createElement("div");
  preview.className = "tanados-branding-preview";

  const previewLabel = document.createElement("div");
  previewLabel.className = "tanados-branding-preview-label";
  previewLabel.textContent = labels.brandingPreviewLabel || "Preview";

  const previewBox = document.createElement("div");
  previewBox.className = "tanados-branding-preview-box";
  if (previewKind === "background") {
    previewBox.classList.add("tanados-branding-preview-box--wide");
  }
  if (previewKind === "favicon") {
    previewBox.classList.add("tanados-branding-preview-box--favicon");
  }

  const previewMeta = document.createElement("div");
  previewMeta.className = "tanados-branding-preview-meta";

  function setStatus(message = "", tone = "") {
    status.textContent = message;
    if (tone) {
      status.dataset.tone = tone;
    } else {
      delete status.dataset.tone;
    }
  }

  function refreshPreview() {
    const value = text(input.value);
    previewBox.replaceChildren();

    if (!value) {
      const empty = document.createElement("div");
      empty.className = "tanados-branding-preview-empty";
      empty.textContent = labels.brandingBundledPreview || "Bundled Tanados asset will be used.";
      previewBox.appendChild(empty);
      previewMeta.textContent = labels.brandingSaveHint || "Save or Apply after changing branding asset fields.";
      return;
    }

    const image = document.createElement("img");
    image.alt = labelText;
    image.loading = "lazy";
    image.src = value;
    image.addEventListener("error", () => {
      previewBox.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "tanados-branding-preview-empty";
      empty.textContent = labels.brandingPreviewUnavailable || "The uploaded or remote image could not be previewed here.";
      previewBox.appendChild(empty);
    }, { once: true });
    previewBox.appendChild(image);
    previewMeta.textContent = value;
  }

  uploadButton.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const previousLabel = uploadButton.textContent;
    uploadButton.disabled = true;
    bundledButton.disabled = true;
    uploadButton.textContent = labels.brandingUploading || "Uploading...";
    setStatus(labels.brandingUploading || "Uploading...", "");

    try {
      const payload = await uploadBrandingAsset(slot, file, input.value);
      input.value = text(payload?.url);
      emitFieldUpdate(input);
      refreshPreview();
      setStatus(labels.brandingUploadReady || "Upload complete. Save or Apply to persist this asset.", "success");
      showNotification(
        `<i class="fas fa-image" style="margin-right:8px;"></i> ${labels.brandingUploadReady || "Upload complete. Save or Apply to persist this asset."}`,
        3200,
        "success"
      );
    } catch (error) {
      const message = text(error?.message) || (labels.brandingUploadFailed || "Branding asset upload failed.");
      setStatus(message, "error");
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i> ${message}`,
        4200,
        "error"
      );
    } finally {
      fileInput.value = "";
      uploadButton.disabled = false;
      bundledButton.disabled = false;
      uploadButton.textContent = previousLabel || (labels.brandingUploadAsset || "Upload asset");
    }
  });

  bundledButton.addEventListener("click", async () => {
    const currentUrl = text(input.value);
    uploadButton.disabled = true;
    bundledButton.disabled = true;
    setStatus("", "");

    try {
      if (currentUrl) {
        await deleteBrandingAsset(slot, currentUrl).catch(() => null);
      }
      input.value = "";
      emitFieldUpdate(input);
      refreshPreview();
      setStatus(labels.brandingUsingBundled || "Bundled Tanados asset will be used after Save or Apply.", "success");
    } finally {
      uploadButton.disabled = false;
      bundledButton.disabled = false;
    }
  });

  input.addEventListener("input", refreshPreview);
  input.addEventListener("change", refreshPreview);

  actions.append(uploadButton, bundledButton, fileInput);
  preview.append(previewLabel, previewBox, previewMeta);
  wrap.append(label, input, actions, preview, status);
  refreshPreview();

  return { wrap, input, refreshPreview };
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

  const headerLogo = createAssetField({
    slot: "header-logo",
    name: "HeaderLogoUrl",
    labelText: labels.headerLogoUrl || "Header logo URL",
    placeholder: "/Plugins/TanadosUI/assets/slider/src/images/tanados-logo.png",
    previewKind: "logo",
    accept: ".png,.webp,.svg,.jpg,.jpeg,.gif",
    labels
  });

  const loginLogo = createAssetField({
    slot: "login-logo",
    name: "LoginLogoUrl",
    labelText: labels.loginLogoUrl || "Login logo URL",
    placeholder: "/Plugins/TanadosUI/assets/slider/src/images/tanados-logo.png",
    previewKind: "logo",
    accept: ".png,.webp,.svg,.jpg,.jpeg,.gif",
    labels
  });

  const favicon = createAssetField({
    slot: "favicon",
    name: "FaviconUrl",
    labelText: labels.faviconUrl || "Favicon URL",
    placeholder: "/Plugins/TanadosUI/assets/slider/src/images/tanados-favicon.png",
    previewKind: "favicon",
    accept: ".png,.webp,.svg,.ico",
    labels
  });

  const loginBackground = createAssetField({
    slot: "login-background",
    name: "LoginBackgroundUrl",
    labelText: labels.loginBackgroundUrl || "Login background image URL",
    placeholder: "",
    previewKind: "background",
    accept: ".png,.webp,.jpg,.jpeg,.gif",
    labels
  });

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
      labels.brandingUploadHint ||
      "Upload PNG, WebP, JPG, SVG, GIF, or ICO assets here, or paste a direct URL manually. Save or Apply after changing asset fields."
    ),
    createHint(
      labels.brandingSettingsHint ||
      "Leave the URL fields empty to use the bundled Tanados assets."
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
