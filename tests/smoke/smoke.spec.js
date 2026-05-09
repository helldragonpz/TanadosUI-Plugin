const { test, expect } = require("@playwright/test");
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXx8AAAAASUVORK5CYII=", "base64");

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
  showNativeHomeTabs: true,
  showWatchlistInTopNav: true,
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
  version: "2.9.0.9"
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
      posterUrl: "/TanadosUI/upcoming/poster?source=radarr&url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Foriginal%2Fsmoke-poster.jpg&mode=direct"
    },
    {
      title: "The Example Episode",
      subtitle: "Series S01E02",
      overview: "A smoke-test episode entry.",
      source: "Sonarr",
      type: "Episode",
      releaseDateUtc: "2026-05-13T00:00:00Z",
      posterUrl: "/TanadosUI/upcoming/poster?source=sonarr&url=%2FMediaCover%2F2%2Fposter.jpg%3FlastWrite%3D2"
    }
  ]
};

const homeViews = {
  Items: [
    {
      Id: "movies-lib-1",
      Name: "Movies",
      CollectionType: "movies"
    },
    {
      Id: "tv-lib-1",
      Name: "Series",
      CollectionType: "tvshows"
    }
  ]
};

const recentMovieItems = {
  Items: [
    {
      Id: "movie-1",
      Name: "Smoke Movie One",
      Type: "Movie",
      ProductionYear: 2024,
      RunTimeTicks: 72000000000,
      OfficialRating: "PG-13",
      CommunityRating: 8.2,
      Genres: ["Action", "Sci-Fi"],
      ImageTags: { Primary: "primary-1", Backdrop: "backdrop-1" }
    },
    {
      Id: "movie-2",
      Name: "Smoke Movie Two",
      Type: "Movie",
      ProductionYear: 2023,
      RunTimeTicks: 69000000000,
      OfficialRating: "PG",
      CommunityRating: 7.6,
      Genres: ["Adventure"],
      ImageTags: { Primary: "primary-2", Backdrop: "backdrop-2" }
    },
    {
      Id: "movie-3",
      Name: "Smoke Movie Three",
      Type: "Movie",
      ProductionYear: 2022,
      RunTimeTicks: 65000000000,
      OfficialRating: "R",
      CommunityRating: 7.1,
      Genres: ["Thriller"],
      ImageTags: { Primary: "primary-3", Backdrop: "backdrop-3" }
    }
  ]
};

const audioItemDetails = {
  "movie-1": {
    Id: "movie-1",
    Name: "Smoke Movie One",
    Type: "Movie",
    MediaSources: [
      {
        MediaStreams: [
          { Type: "Audio", Language: "bg", IsDefault: true },
          { Type: "Audio", Language: "en" }
        ]
      }
    ]
  },
  "movie-2": {
    Id: "movie-2",
    Name: "Smoke Movie Two",
    Type: "Movie",
    MediaStreams: [
      { Type: "Audio", Language: "en", IsDefault: true }
    ]
  },
  "movie-3": {
    Id: "movie-3",
    Name: "Smoke Movie Three",
    Type: "Movie",
    MediaStreams: [
      { Type: "Audio", Language: "ru", IsDefault: true }
    ]
  },
  "series-1": {
    Id: "series-1",
    Name: "Smoke Series One",
    Type: "Series",
    MediaStreams: []
  },
  "episode-series-1": {
    Id: "episode-series-1",
    Name: "Smoke Series One Episode One",
    Type: "Episode",
    MediaSources: [
      {
        MediaStreams: [
          { Type: "Audio", Language: "en", IsDefault: true },
          { Type: "Audio", Language: "ja" }
        ]
      }
    ]
  }
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

async function installApiRoutes(page, { isAdmin = true, runtimeOverride = {}, adminRuntimeOverride = {} } = {}) {
  const publicRuntime = { ...runtimeConfig, ...runtimeOverride };
  const adminRuntime = { ...adminRuntimeConfig, ...runtimeOverride, ...adminRuntimeOverride };
  await stubJson(page, "**/TanadosUI/runtime-config", publicRuntime);
  await stubJson(page, "**/Plugins/TanadosUI/runtime-config", publicRuntime);
  await stubJson(page, "**/TanadosUI/runtime-config/admin", adminRuntime);
  await stubJson(page, "**/Plugins/TanadosUI/runtime-config/admin", adminRuntime);
  await stubJson(page, "**/TanadosUI/upcoming/feed", upcomingFeed);
  await page.route("**/TanadosUI/upcoming/poster**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: tinyPng
    });
  });
  await page.route("**/TanadosUI/upcoming/test", async (route) => {
    const body = route.request().postDataJSON?.() || {};
    const source = String(body.source || "").toLowerCase();
    const sourceName = source === "radarr" ? "Radarr" : "Sonarr";
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        reachable: true,
        source: sourceName,
        itemCount: source === "radarr" ? 1 : 2,
        posterCount: source === "radarr" ? 1 : 2,
        sampleItems: [
          {
            title: source === "radarr" ? "The Example Movie" : "The Example Episode",
            subtitle: source === "radarr" ? "Radarr release" : "Series S01E02",
            type: source === "radarr" ? "Movie" : "Episode",
            releaseDateUtc: "2026-05-12T00:00:00Z",
            hasPoster: true
          }
        ],
        warning: ""
      })
    });
  });
  await stubJson(page, "**/TanadosUI/config", trailerConfig);
  await stubJson(page, "**/TanadosUI/trailers/status", { ok: true, running: false });
  await stubJson(page, "**/TanadosUI/lyrics/status", { ok: true, running: false });
  await stubJson(page, "**/TanadosUI/parental-pin/settings", {
    isEnabled: false,
    settings: {}
  });
  await stubJson(page, "**/Users/Me", createApiUser(isAdmin));
}

async function installRecentRowsRoutes(page) {
  await stubJson(page, "**/Users/user-1/Views", homeViews);
  await page.route("**/Items/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const itemId = pathname.split("/").pop();
    const payload = audioItemDetails[itemId];

    if (!payload) {
      await route.fulfill({
        status: 404,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ Message: "Not found" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload)
    });
  });
  await page.route("**/Users/user-1/Items/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const itemId = pathname.split("/").pop();
    const payload = audioItemDetails[itemId];

    if (!payload) {
      await route.fulfill({
        status: 404,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ Message: "Not found" })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(payload)
    });
  });
  await page.route("**/Users/user-1/Items?**", async (route) => {
    const url = new URL(route.request().url());
    const itemTypes = url.searchParams.get("IncludeItemTypes") || "";
    const parentId = url.searchParams.get("ParentId") || "";
    const ids = (url.searchParams.get("Ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (parentId === "series-1" && itemTypes === "Episode") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          Items: [audioItemDetails["episode-series-1"]]
        })
      });
      return;
    }

    if (ids.length) {
      const selected = recentMovieItems.Items.filter((item) => ids.includes(item.Id));
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ Items: selected })
      });
      return;
    }

    if (itemTypes === "Movie") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(recentMovieItems)
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ Items: [] })
    });
  });
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
  await expect(page.locator(".mainDrawerLogo")).toHaveAttribute("data-tanados-brand", "surface");
  await expect(page.locator("head link[rel='icon']")).toHaveAttribute("data-tanados-brand", "true");
  await expect(page.locator("#loginPage h1")).toContainText("Tanados UI");
  await expect(page.locator(".headerLogo")).toHaveCount(1);
  await expect(page.locator(".mainDrawer .navMenuOptionText")).toHaveCount(4);
  await expect(page.locator(".mainDrawer .navMenuOptionText").first()).toBeVisible();
  await expect(page.locator(".mainDrawer .navMenuOptionIcon")).toHaveCount(4);
  await expect(page.locator(".mainDrawer .TanadosUI-drawer-icon")).toHaveCount(0);
  await expect(page.locator(".emby-tabs-slider .TanadosUI-shell-icon")).toHaveCount(2);
  await expect(page.locator(".mainDrawer")).toHaveJSProperty("className", "mainDrawer touch-menu-la");
  await expect(page.locator(".mainDrawer")).toHaveCSS("position", "fixed");

  expect(pageErrors).toEqual([]);
});

test("settings wrapper mounts the embedded Tanados settings shell", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page, { isAdmin: true });
  await installApiRoutes(page, { isAdmin: true });

  await page.goto("/tests/smoke/fixtures/settings-shell.html");

  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/slider/src/settings.css";
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Failed to load settings.css"));
      document.head.appendChild(link);
    });
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
  await expect(page.locator('#branding-panel [name="ShowNativeHomeTabs"]')).toBeVisible();
  await expect(page.locator('#branding-panel [name="ShowWatchlistInTopNav"]')).toBeVisible();

  await page.locator(".settings-tab[data-tab='upcoming']").click();
  await expect(page.locator('#upcoming-panel [name="SonarrUrl"]')).toHaveValue("https://sonarr.example.com");
  await expect(page.locator('#upcoming-panel button[data-source="sonarr"]')).toBeVisible();
  await expect(page.locator('#upcoming-panel button[data-source="radarr"]')).toBeVisible();
  await page.locator('#upcoming-panel button[data-source="sonarr"]').click();
  await expect(page.locator('#upcoming-panel .tanados-inline-status[data-source="sonarr"]')).toHaveClass(/tanados-inline-status--success/);
  await expect(page.locator('#upcoming-panel .tanados-inline-status[data-source="sonarr"]')).toContainText("Sonarr");

  const tabContentOverflow = await page.locator(".settings-tab-content").evaluate((el) => getComputedStyle(el).overflowY);
  const tabsOverflow = await page.locator(".settings-tabs").evaluate((el) => getComputedStyle(el).overflowY);
  expect(tabContentOverflow).toBe("auto");
  expect(tabsOverflow).toBe("auto");

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

  const posterRequestPromise = page.waitForRequest((request) => (
    request.url().includes("/TanadosUI/upcoming/poster") &&
    request.url().includes("api_key=smoke-token")
  ));
  await page.evaluate(async () => {
    await import("/slider/modules/upcomingCalendar.js");
  });
  const posterRequest = await posterRequestPromise;

  await expect(page.locator(".emby-tabs-slider .TanadosUI-upcoming-nav-button")).toBeVisible();
  await expect(page.locator(".mui-tabs-shell .TanadosUI-upcoming-nav-button")).toBeVisible();
  await expect(page.locator("#TanadosUI-upcoming-home-section")).toBeVisible();
  await expect(page.locator("#TanadosUI-upcoming-home-section .TanadosUIup-card")).toHaveCount(2);
  expect(posterRequest.url()).toContain("api_key=smoke-token");
  expect(posterRequest.url()).toContain("mode=direct");

  expect(pageErrors).toEqual([]);
});

test("runtime shell toggles can hide native tabs and watchlist shortcuts", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page);
  await installApiRoutes(page, {
    runtimeOverride: {
      showNativeHomeTabs: false,
      showWatchlistInTopNav: false,
      showUpcomingInTopNav: true
    }
  });

  await page.goto("/tests/smoke/fixtures/injection-shell.html");
  await page.evaluate(() => {
    window.location.hash = "#/home?tab=0";
  });

  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/slider/src/tanados-branding.css";
      link.onload = () => resolve();
      link.onerror = () => reject(new Error("Failed to load tanados-branding.css"));
      document.head.appendChild(link);
    });
    await import("/slider/modules/tanadosBranding.js");
    await import("/slider/modules/watchlist.js");
    await import("/slider/modules/upcomingCalendar.js");
  });

  await expect(page.locator(".emby-tabs-slider .emby-tab-button").first()).toBeHidden();
  await expect(page.locator(".mui-tabs-shell a[href='#/home?tab=0']")).toBeHidden();
  await expect(page.locator(".TanadosUI-watchlist-nav-button").first()).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-tanados-show-native-home-tabs", "0");
  await expect(page.locator("html")).toHaveAttribute("data-tanados-show-watchlist-top-nav", "0");

  expect(pageErrors).toEqual([]);
});

test("recent movie rows inject home library cards on home views", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page);
  await installApiRoutes(page);
  await installRecentRowsRoutes(page);

  await page.addInitScript(() => {
    localStorage.setItem("enableHomeSectionsMaster", "true");
    localStorage.setItem("enableRecentRows", "true");
    localStorage.setItem("enableRecentMoviesRow", "true");
    localStorage.setItem("enableRecentSeriesRow", "false");
    localStorage.setItem("enableRecentEpisodesRow", "false");
    localStorage.setItem("enableRecentMusicRow", "false");
    localStorage.setItem("enableRecentMusicTracksRow", "false");
    localStorage.setItem("enableContinueMovies", "false");
    localStorage.setItem("enableContinueSeries", "false");
    localStorage.setItem("enableNextUpRow", "false");
    localStorage.setItem("enableTop10MoviesRow", "false");
    localStorage.setItem("enableTop10SeriesRow", "false");
    localStorage.setItem("enableTmdbTopMoviesRow", "false");
    localStorage.setItem("showRecentRowsHeroCards", "false");
    localStorage.setItem("showRecentMoviesHeroCards", "false");
    localStorage.setItem("recentRowsSplitMovieLibs", "false");
    localStorage.setItem("currentUserId", "user-1");
  });

  await page.goto("/tests/smoke/fixtures/injection-shell.html");
  await page.evaluate(() => {
    window.location.hash = "#/home?tab=0";
  });

  await page.evaluate(async () => {
    const mod = await import("/slider/modules/recentRows.js");
    await mod.mountRecentRowsLazy({ force: true });
  });

  const section = page.locator('[id^="recent-rows--"]');
  await expect(section).toHaveCount(1);
  await expect(section.locator(".personal-recs-card")).toHaveCount(3);
  await expect(section.locator('[data-item-id="movie-1"]')).toBeVisible();
  await expect(section.locator('[data-item-id="movie-2"]')).toBeVisible();
  await expect(section.locator('[data-item-id="movie-3"]')).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("audio language badges appear on cards and native details pages", async ({ page }) => {
  const pageErrors = trackPageErrors(page);
  await installBrowserStubs(page);
  await installApiRoutes(page);
  await installRecentRowsRoutes(page);

  await page.addInitScript(() => {
    localStorage.setItem("enableHomeSectionsMaster", "true");
    localStorage.setItem("enableRecentRows", "true");
    localStorage.setItem("enableRecentMoviesRow", "true");
    localStorage.setItem("enableRecentSeriesRow", "false");
    localStorage.setItem("enableRecentEpisodesRow", "false");
    localStorage.setItem("enableRecentMusicRow", "false");
    localStorage.setItem("enableRecentMusicTracksRow", "false");
    localStorage.setItem("enableContinueMovies", "false");
    localStorage.setItem("enableContinueSeries", "false");
    localStorage.setItem("enableNextUpRow", "false");
    localStorage.setItem("enableTop10MoviesRow", "false");
    localStorage.setItem("enableTop10SeriesRow", "false");
    localStorage.setItem("enableTmdbTopMoviesRow", "false");
    localStorage.setItem("showRecentRowsHeroCards", "false");
    localStorage.setItem("showRecentMoviesHeroCards", "false");
    localStorage.setItem("recentRowsSplitMovieLibs", "false");
    localStorage.setItem("currentUserId", "user-1");
  });

  await page.goto("/tests/smoke/fixtures/injection-shell.html");
  await page.evaluate(() => {
    window.location.hash = "#/home?tab=0";
  });

  await page.evaluate(async () => {
    const rows = await import("/slider/modules/recentRows.js");
    await rows.mountRecentRowsLazy({ force: true });
    await import("/slider/modules/audioLanguageBadges.js");
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <a class="card" data-item-id="series-1" href="#/details?id=series-1" style="display:block;width:220px;height:330px;">
          <div class="cardBox" style="width:100%;height:100%;">
            <div class="cardImageContainer" style="width:100%;height:100%;"></div>
          </div>
        </a>
      `
    );
    window.dispatchEvent(new Event("scroll"));
  });

  await expect(page.locator('[data-item-id="movie-1"] .TanadosUI-audio-card-badges')).toContainText("BG");
  await expect(page.locator('[data-item-id="movie-1"] .TanadosUI-audio-card-badges')).toContainText("EN");
  await expect(page.locator('[data-item-id="series-1"] .TanadosUI-audio-card-badges')).toContainText("EN");

  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div id="itemDetailPage" class="itemDetailPage">
          <div class="detailPagePrimaryContainer">
            <div class="detailPagePrimaryContent">
              <h1 class="itemName">Smoke Movie One</h1>
            </div>
          </div>
        </div>
      `
    );
    window.location.hash = "#/details?id=movie-1";
    window.dispatchEvent(new Event("hashchange"));
  });

  await expect(page.locator("#itemDetailPage .TanadosUI-audio-detail-badges")).toContainText("BG");
  await expect(page.locator("#itemDetailPage .TanadosUI-audio-detail-badges")).toContainText("EN");

  expect(pageErrors).toEqual([]);
});
