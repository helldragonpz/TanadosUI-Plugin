const { test, expect } = require("@playwright/test");

const runtimeConfig = {
  appDisplayName: "Tanados UI",
  headerLogoUrl: "/slider/src/images/tanados-logo.png",
  loginLogoUrl: "/slider/src/images/tanados-logo.png",
  faviconUrl: "/slider/src/images/tanados-favicon.png",
  loginBackgroundUrl: "",
  primaryColor: "#6f43f3",
  secondaryColor: "#2f6bff",
  accentColor: "#f2c66b",
  showHeaderLogo: true,
  useCompactHeaderLogo: false,
  enableSonarrIntegration: true,
  sonarrUrl: "",
  sonarrApiKey: "",
  enableRadarrIntegration: true,
  radarrUrl: "",
  radarrApiKey: "",
  hasUpcomingIntegrations: true,
  upcomingDays: 14,
  showUpcomingOnHome: true,
  showUpcomingInTopNav: true,
  enableAudioFlagsOnCards: true,
  enableAudioFlagsOnDetails: true,
  audioFlagMaxCount: 2,
  preferredLang: "bg-BG",
  fallbackLang: "en-US",
  version: "2.9.0.1"
};

const adminRuntimeConfig = {
  ...runtimeConfig,
  sonarrUrl: "https://sonarr.example.com",
  sonarrApiKey: "sonarr-key",
  radarrUrl: "https://radarr.example.com",
  radarrApiKey: "radarr-key"
};

const trailerConfig = {
  cfg: {
    allowScriptExecution: true,
    enableTrailerDownloader: false,
    enableTrailerUrlNfo: false,
    jfBase: "http://127.0.0.1:4173",
    preferredLang: "bg-BG",
    fallbackLang: "en-US",
    maxConcurrentDownloads: 1,
    trailerMinResolution: 720,
    trailerMaxResolution: 1080,
    overwritePolicy: "skip",
    enableThemeLink: 0,
    themeLinkMode: "symlink"
  }
};

const upcomingFeed = {
  enabled: true,
  partial: false,
  errors: [],
  items: [
    {
      title: "The Example Movie",
      subtitle: "Radarr release",
      overview: "A smoke-test movie entry.",
      source: "Radarr",
      type: "Movie",
      releaseDateUtc: "2026-05-12T00:00:00Z",
      posterUrl: "/slider/src/images/tanados-favicon.png"
    },
    {
      title: "The Example Episode",
      subtitle: "Series S01E02",
      overview: "A smoke-test episode entry.",
      source: "Sonarr",
      type: "Episode",
      releaseDateUtc: "2026-05-13T00:00:00Z",
      posterUrl: "/slider/src/images/tanados-favicon.png"
    }
  ]
};

function createApiUser(isAdmin = true) {
  return {
    Id: "user-1",
    Name: "Smoke Admin",
    Policy: {
      IsAdministrator: isAdmin
    }
  };
}

async function installBrowserStubs(page, { isAdmin = true } = {}) {
  await page.addInitScript(({ admin }) => {
    const user = {
      Id: "user-1",
      Name: "Smoke Admin",
      Policy: {
        IsAdministrator: admin
      }
    };

    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("defaultLanguage", "bul");
    localStorage.setItem("currentUserIsAdmin", admin ? "true" : "false");
    localStorage.setItem("enableParentalPinModule", "false");
    localStorage.setItem("forceGlobalUserSettings", "false");
    localStorage.setItem("showSettingsLink", "true");
    localStorage.setItem("jf_serverAddress", window.location.origin);

    window.ApiClient = {
      _currentUser: user,
      _currentUserId: user.Id,
      _deviceId: "device-1",
      _serverInfo: {
        AccessToken: "smoke-token",
        UserId: user.Id,
        Id: "11111111-1111-1111-1111-111111111111",
        SystemId: "11111111-1111-1111-1111-111111111111",
        LocalAddress: window.location.origin,
        ManualAddress: window.location.origin
      },
      accessToken() {
        return "smoke-token";
      },
      async getCurrentUser() {
        return this._currentUser;
      },
      getCurrentUserId() {
        return user.Id;
      },
      serverAddress() {
        return window.location.origin;
      },
      deviceId() {
        return "device-1";
      }
    };

    window.getAuthHeader = () => 'MediaBrowser Token="smoke-token"';
    window.requestIdleCallback = window.requestIdleCallback || ((cb) => window.setTimeout(() => cb({
      didTimeout: false,
      timeRemaining: () => 16
    }), 0));
    window.cancelIdleCallback = window.cancelIdleCallback || ((id) => window.clearTimeout(id));
    window.matchMedia = window.matchMedia || ((query) => ({
      matches: /prefers-reduced-motion/.test(query) ? false : /pointer:\s*coarse|max-width:\s*768px|max-width:\s*900px/.test(query) ? false : false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; }
    }));

    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    }
  }, { admin: isAdmin });
}

async function stubJson(page, pattern, payload, status = 200) {
  await page.route(pattern, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload)
    });
  });
}

async function installApiRoutes(page, { isAdmin = true } = {}) {
  await stubJson(page, "**/TanadosUI/runtime-config", runtimeConfig);
  await stubJson(page, "**/Plugins/TanadosUI/runtime-config", runtimeConfig);
  await stubJson(page, "**/TanadosUI/runtime-config/admin", adminRuntimeConfig);
  await stubJson(page, "**/Plugins/TanadosUI/runtime-config/admin", adminRuntimeConfig);
  await stubJson(page, "**/TanadosUI/upcoming/feed", upcomingFeed);
  await stubJson(page, "**/TanadosUI/config", trailerConfig);
  await stubJson(page, "**/TanadosUI/trailers/status", { ok: true, running: false });
  await stubJson(page, "**/TanadosUI/lyrics/status", { ok: true, running: false });
  await stubJson(page, "**/TanadosUI/parental-pin/settings", {
    isEnabled: false,
    settings: {}
  });
  await stubJson(page, "**/Users/Me", createApiUser(isAdmin));
}

function trackPageErrors(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });
  return pageErrors;
}

test("login branding injection rewrites app surfaces without duplicating logos", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page);
  await installApiRoutes(page);

  await page.goto("/tests/smoke/fixtures/injection-shell.html");
  await page.evaluate(() => {
    window.location.hash = "#/home";
  });

  await page.evaluate(async () => {
    await import("/slider/modules/tanadosBranding.js");
  });

  await expect(page.locator("html")).toHaveAttribute("data-tanados-ui-brand", "1");
  await expect(page).toHaveTitle("Tanados UI");
  await expect(page.locator("#loginPage h1")).toHaveAttribute("data-tanados-brand", "surface");
  await expect(page.locator(".headerLogo")).toHaveAttribute("data-tanados-brand", "surface");
  await expect(page.locator("head link[rel='icon']")).toHaveAttribute("data-tanados-brand", "true");
  await expect(page.locator("#loginPage h1")).toContainText("Tanados UI");
  await expect(page.locator(".headerLogo")).toHaveCount(1);

  expect(pageErrors).toEqual([]);
});

test("settings wrapper mounts the embedded Tanados settings shell", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page, { isAdmin: true });
  await installApiRoutes(page, { isAdmin: true });

  await page.goto("/tests/smoke/fixtures/settings-shell.html");

  await page.evaluate(async () => {
    const mod = await import("/Plugins/TanadosUI/assets/WebSettingsJs");
    await mod.mountTanadosUISettingsPage(document.getElementById("host"), {
      defaultTab: "branding",
      force: true
    });
  });

  await expect(page.locator("#host #settings-modal")).toBeVisible();
  await expect(page.locator(".settings-tab[data-tab='branding']")).toBeVisible();
  await expect(page.locator(".settings-tab[data-tab='upcoming']")).toBeVisible();
  await expect(page.locator("#branding-panel")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("upcoming calendar injects top-nav and home section on home views", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page);
  await installApiRoutes(page);

  await page.goto("/tests/smoke/fixtures/injection-shell.html");
  await page.evaluate(() => {
    window.location.hash = "#/home?tab=0";
  });

  await page.evaluate(async () => {
    await import("/slider/modules/upcomingCalendar.js");
  });

  await expect(page.locator(".emby-tabs-slider .TanadosUI-upcoming-nav-button")).toBeVisible();
  await expect(page.locator(".mui-tabs-shell .TanadosUI-upcoming-nav-button")).toBeVisible();
  await expect(page.locator("#TanadosUI-upcoming-home-section")).toBeVisible();
  await expect(page.locator("#TanadosUI-upcoming-home-section .TanadosUIup-card")).toHaveCount(2);

  expect(pageErrors).toEqual([]);
});
