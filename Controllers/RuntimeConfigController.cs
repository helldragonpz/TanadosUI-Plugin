using System;
using System.Linq;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/runtime-config")]
[Route("Plugins/TanadosUI/runtime-config")]
public class RuntimeConfigController : ControllerBase
{
    private readonly IUserManager _users;

    public RuntimeConfigController(IUserManager users)
    {
        _users = users;
    }

    public sealed class RuntimeConfigUpdateRequest
    {
        public string? AppDisplayName { get; set; }
        public string? HeaderLogoUrl { get; set; }
        public string? LoginLogoUrl { get; set; }
        public string? FaviconUrl { get; set; }
        public string? LoginBackgroundUrl { get; set; }
        public string? PrimaryColor { get; set; }
        public string? SecondaryColor { get; set; }
        public string? AccentColor { get; set; }
        public bool? ShowHeaderLogo { get; set; }
        public bool? UseCompactHeaderLogo { get; set; }
        public bool? EnableSonarrIntegration { get; set; }
        public string? SonarrUrl { get; set; }
        public string? SonarrApiKey { get; set; }
        public bool? EnableRadarrIntegration { get; set; }
        public string? RadarrUrl { get; set; }
        public string? RadarrApiKey { get; set; }
        public int? UpcomingDays { get; set; }
        public bool? ShowUpcomingOnHome { get; set; }
        public bool? ShowUpcomingInTopNav { get; set; }
        public bool? EnableAudioFlagsOnCards { get; set; }
        public bool? EnableAudioFlagsOnDetails { get; set; }
        public int? AudioFlagMaxCount { get; set; }
    }

    [HttpGet]
    public IActionResult GetPublicRuntimeConfig()
    {
        var cfg = TanadosUIPlugin.Instance?.Configuration
                  ?? throw new InvalidOperationException("Plugin not available.");
        NoCache();
        return Ok(BuildPublicPayload(cfg));
    }

    [HttpGet("admin")]
    public IActionResult GetAdminRuntimeConfig()
    {
        var adminCheck = TryGetAdminUser();
        if (adminCheck.Result is not null)
        {
            return adminCheck.Result;
        }

        var cfg = TanadosUIPlugin.Instance?.Configuration
                  ?? throw new InvalidOperationException("Plugin not available.");
        NoCache();
        return Ok(BuildAdminPayload(cfg));
    }

    [HttpPost("admin")]
    public IActionResult UpdateAdminRuntimeConfig([FromBody] RuntimeConfigUpdateRequest? request)
    {
        var adminCheck = TryGetAdminUser();
        if (adminCheck.Result is not null)
        {
            return adminCheck.Result;
        }

        var plugin = TanadosUIPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
        var cfg = plugin.Configuration;
        var incoming = request ?? new RuntimeConfigUpdateRequest();

        if (incoming.AppDisplayName is not null) cfg.AppDisplayName = NormalizeDisplayName(incoming.AppDisplayName);
        if (incoming.HeaderLogoUrl is not null) cfg.HeaderLogoUrl = NormalizeAssetUrl(incoming.HeaderLogoUrl);
        if (incoming.LoginLogoUrl is not null) cfg.LoginLogoUrl = NormalizeAssetUrl(incoming.LoginLogoUrl);
        if (incoming.FaviconUrl is not null) cfg.FaviconUrl = NormalizeAssetUrl(incoming.FaviconUrl);
        if (incoming.LoginBackgroundUrl is not null) cfg.LoginBackgroundUrl = NormalizeAssetUrl(incoming.LoginBackgroundUrl);
        if (incoming.PrimaryColor is not null) cfg.PrimaryColor = NormalizeColor(incoming.PrimaryColor, cfg.PrimaryColor, "#6f43f3");
        if (incoming.SecondaryColor is not null) cfg.SecondaryColor = NormalizeColor(incoming.SecondaryColor, cfg.SecondaryColor, "#2f6bff");
        if (incoming.AccentColor is not null) cfg.AccentColor = NormalizeColor(incoming.AccentColor, cfg.AccentColor, "#f2c66b");
        if (incoming.ShowHeaderLogo.HasValue) cfg.ShowHeaderLogo = incoming.ShowHeaderLogo.Value;
        if (incoming.UseCompactHeaderLogo.HasValue) cfg.UseCompactHeaderLogo = incoming.UseCompactHeaderLogo.Value;
        if (incoming.EnableSonarrIntegration.HasValue) cfg.EnableSonarrIntegration = incoming.EnableSonarrIntegration.Value;
        if (incoming.SonarrUrl is not null) cfg.SonarrUrl = NormalizeServerUrl(incoming.SonarrUrl);
        if (incoming.SonarrApiKey is not null) cfg.SonarrApiKey = NormalizeSecret(incoming.SonarrApiKey);
        if (incoming.EnableRadarrIntegration.HasValue) cfg.EnableRadarrIntegration = incoming.EnableRadarrIntegration.Value;
        if (incoming.RadarrUrl is not null) cfg.RadarrUrl = NormalizeServerUrl(incoming.RadarrUrl);
        if (incoming.RadarrApiKey is not null) cfg.RadarrApiKey = NormalizeSecret(incoming.RadarrApiKey);
        if (incoming.UpcomingDays.HasValue) cfg.UpcomingDays = Math.Clamp(incoming.UpcomingDays.Value, 1, 90);
        if (incoming.ShowUpcomingOnHome.HasValue) cfg.ShowUpcomingOnHome = incoming.ShowUpcomingOnHome.Value;
        if (incoming.ShowUpcomingInTopNav.HasValue) cfg.ShowUpcomingInTopNav = incoming.ShowUpcomingInTopNav.Value;
        if (incoming.EnableAudioFlagsOnCards.HasValue) cfg.EnableAudioFlagsOnCards = incoming.EnableAudioFlagsOnCards.Value;
        if (incoming.EnableAudioFlagsOnDetails.HasValue) cfg.EnableAudioFlagsOnDetails = incoming.EnableAudioFlagsOnDetails.Value;
        if (incoming.AudioFlagMaxCount.HasValue) cfg.AudioFlagMaxCount = Math.Clamp(incoming.AudioFlagMaxCount.Value, 1, 6);

        plugin.UpdateConfiguration(cfg);
        NoCache();
        return Ok(new
        {
            ok = true,
            runtime = BuildAdminPayload(cfg)
        });
    }

    private static object BuildPublicPayload(TanadosUIConfiguration cfg)
    {
        return new
        {
            appDisplayName = NormalizeDisplayName(cfg.AppDisplayName),
            headerLogoUrl = NormalizeAssetUrl(cfg.HeaderLogoUrl),
            loginLogoUrl = NormalizeAssetUrl(cfg.LoginLogoUrl),
            faviconUrl = NormalizeAssetUrl(cfg.FaviconUrl),
            loginBackgroundUrl = NormalizeAssetUrl(cfg.LoginBackgroundUrl),
            primaryColor = NormalizeColor(cfg.PrimaryColor, "#6f43f3", "#6f43f3"),
            secondaryColor = NormalizeColor(cfg.SecondaryColor, "#2f6bff", "#2f6bff"),
            accentColor = NormalizeColor(cfg.AccentColor, "#f2c66b", "#f2c66b"),
            showHeaderLogo = cfg.ShowHeaderLogo,
            useCompactHeaderLogo = cfg.UseCompactHeaderLogo,
            enableSonarrIntegration = cfg.EnableSonarrIntegration,
            enableRadarrIntegration = cfg.EnableRadarrIntegration,
            hasUpcomingIntegrations = cfg.EnableSonarrIntegration || cfg.EnableRadarrIntegration,
            upcomingDays = Math.Clamp(cfg.UpcomingDays, 1, 90),
            showUpcomingOnHome = cfg.ShowUpcomingOnHome,
            showUpcomingInTopNav = cfg.ShowUpcomingInTopNav,
            enableAudioFlagsOnCards = cfg.EnableAudioFlagsOnCards,
            enableAudioFlagsOnDetails = cfg.EnableAudioFlagsOnDetails,
            audioFlagMaxCount = Math.Clamp(cfg.AudioFlagMaxCount, 1, 6),
            preferredLang = string.IsNullOrWhiteSpace(cfg.PreferredLang) ? "bg-BG" : cfg.PreferredLang,
            fallbackLang = string.IsNullOrWhiteSpace(cfg.FallbackLang) ? "en-US" : cfg.FallbackLang,
            version = typeof(TanadosUIPlugin).Assembly.GetName().Version?.ToString() ?? string.Empty
        };
    }

    private static object BuildAdminPayload(TanadosUIConfiguration cfg)
    {
        return new
        {
            appDisplayName = NormalizeDisplayName(cfg.AppDisplayName),
            headerLogoUrl = NormalizeAssetUrl(cfg.HeaderLogoUrl),
            loginLogoUrl = NormalizeAssetUrl(cfg.LoginLogoUrl),
            faviconUrl = NormalizeAssetUrl(cfg.FaviconUrl),
            loginBackgroundUrl = NormalizeAssetUrl(cfg.LoginBackgroundUrl),
            primaryColor = NormalizeColor(cfg.PrimaryColor, "#6f43f3", "#6f43f3"),
            secondaryColor = NormalizeColor(cfg.SecondaryColor, "#2f6bff", "#2f6bff"),
            accentColor = NormalizeColor(cfg.AccentColor, "#f2c66b", "#f2c66b"),
            showHeaderLogo = cfg.ShowHeaderLogo,
            useCompactHeaderLogo = cfg.UseCompactHeaderLogo,
            enableSonarrIntegration = cfg.EnableSonarrIntegration,
            sonarrUrl = NormalizeServerUrl(cfg.SonarrUrl),
            sonarrApiKey = NormalizeSecret(cfg.SonarrApiKey),
            enableRadarrIntegration = cfg.EnableRadarrIntegration,
            radarrUrl = NormalizeServerUrl(cfg.RadarrUrl),
            radarrApiKey = NormalizeSecret(cfg.RadarrApiKey),
            upcomingDays = Math.Clamp(cfg.UpcomingDays, 1, 90),
            showUpcomingOnHome = cfg.ShowUpcomingOnHome,
            showUpcomingInTopNav = cfg.ShowUpcomingInTopNav,
            enableAudioFlagsOnCards = cfg.EnableAudioFlagsOnCards,
            enableAudioFlagsOnDetails = cfg.EnableAudioFlagsOnDetails,
            audioFlagMaxCount = Math.Clamp(cfg.AudioFlagMaxCount, 1, 6)
        };
    }

    private void NoCache()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
    }

    private (User? User, Guid UserId, IActionResult? Result) TryGetAdminUser()
    {
        var userCheck = TryGetRequestUser();
        if (userCheck.Result is not null)
        {
            return userCheck;
        }

        if (!IsAdminUser(userCheck.User))
        {
            return (null, Guid.Empty, StatusCode(403, new { ok = false, error = "This action is only available to admin users." }));
        }

        return userCheck;
    }

    private (User? User, Guid UserId, IActionResult? Result) TryGetRequestUser()
    {
        if (!TryGetRequestUserId(out var userId))
        {
            return (null, Guid.Empty, Unauthorized(new { ok = false, error = "X-Emby-UserId is required." }));
        }

        var user = _users.GetUserById(userId);
        if (user is null)
        {
            return (null, Guid.Empty, Unauthorized(new { ok = false, error = "User not found." }));
        }

        return (user, userId, null);
    }

    private bool TryGetRequestUserId(out Guid userId)
    {
        var userIdHeader =
            Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
            Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();

        return Guid.TryParse(userIdHeader, out userId) && userId != Guid.Empty;
    }

    private static bool IsAdminUser(User? user)
    {
        if (user is null)
        {
            return false;
        }

        return user.Permissions.Any(permission =>
            permission.Kind == PermissionKind.IsAdministrator && permission.Value);
    }

    private static string NormalizeDisplayName(string? value)
    {
        var clean = string.Join(" ", (value ?? string.Empty)
            .Trim()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrWhiteSpace(clean) ? "Tanados UI" : clean;
    }

    private static string NormalizeAssetUrl(string? value)
    {
        var clean = (value ?? string.Empty).Trim();
        return clean.Length > 2048 ? clean[..2048] : clean;
    }

    private static string NormalizeServerUrl(string? value)
    {
        var clean = NormalizeAssetUrl(value).TrimEnd('/');
        return clean;
    }

    private static string NormalizeSecret(string? value)
    {
        return NormalizeAssetUrl(value);
    }

    private static string NormalizeColor(string? value, string current, string fallback)
    {
        var clean = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(clean))
        {
            return string.IsNullOrWhiteSpace(current) ? fallback : current;
        }

        if (clean[0] != '#')
        {
            clean = $"#{clean}";
        }

        if (clean.Length == 4 || clean.Length == 7 || clean.Length == 9)
        {
            return clean;
        }

        return string.IsNullOrWhiteSpace(current) ? fallback : current;
    }
}
