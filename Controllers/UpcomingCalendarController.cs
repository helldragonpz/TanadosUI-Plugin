using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/upcoming")]
[Route("Plugins/TanadosUI/upcoming")]
public class UpcomingCalendarController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<UpcomingCalendarController> _logger;
    private readonly IUserManager _users;

    public UpcomingCalendarController(
        IHttpClientFactory httpClientFactory,
        ILogger<UpcomingCalendarController> logger,
        IUserManager users)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _users = users;
    }

    private sealed record UpcomingFeedItem(
        string Id,
        string Source,
        string Type,
        string Title,
        string Subtitle,
        string Overview,
        string ReleaseDateUtc,
        string PosterUrl,
        string PosterFallbackUrl,
        string SeriesTitle);

    private sealed record SourceError(string Source, string Message);
    public sealed record UpcomingSourceTestRequest(string Source, string Url, string ApiKey, int? Days);

    [HttpGet("feed")]
    public async Task<IActionResult> GetFeed(CancellationToken cancellationToken)
    {
        var cfg = TanadosUIPlugin.Instance?.Configuration
                  ?? throw new InvalidOperationException("Plugin not available.");
        var days = Math.Clamp(cfg.UpcomingDays, 1, 90);

        var items = new List<UpcomingFeedItem>();
        var errors = new List<SourceError>();
        var enabledSources = 0;

        if (cfg.EnableSonarrIntegration)
        {
            enabledSources++;
            try
            {
                items.AddRange(await FetchSonarrItemsAsync(cfg.SonarrUrl, cfg.SonarrApiKey, days, cancellationToken).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                errors.Add(new SourceError("Sonarr", CleanErrorMessage(ex.Message, "Unable to load upcoming episodes from Sonarr.")));
            }
        }

        if (cfg.EnableRadarrIntegration)
        {
            enabledSources++;
            try
            {
                items.AddRange(await FetchRadarrItemsAsync(cfg.RadarrUrl, cfg.RadarrApiKey, days, cancellationToken).ConfigureAwait(false));
            }
            catch (Exception ex)
            {
                errors.Add(new SourceError("Radarr", CleanErrorMessage(ex.Message, "Unable to load upcoming movies from Radarr.")));
            }
        }

        NoCache();
        return Ok(new
        {
            ok = true,
            enabled = enabledSources > 0,
            items = items
                .OrderBy(item => item.ReleaseDateUtc, StringComparer.OrdinalIgnoreCase)
                .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            errors,
            partial = errors.Count > 0,
            generatedAtUtc = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture)
        });
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestSource([FromBody] UpcomingSourceTestRequest? request, CancellationToken cancellationToken)
    {
        if (!TryGetAdminUser(out var errorResult))
        {
            return errorResult!;
        }

        var source = NormalizeSource(request?.Source);
        if (string.IsNullOrWhiteSpace(source))
        {
            return BadRequest(new { ok = false, error = "A supported source is required." });
        }

        var url = NormalizeServerUrl(request?.Url);
        var apiKey = NormalizeSecret(request?.ApiKey);
        var days = Math.Clamp(request?.Days ?? 14, 1, 90);

        try
        {
            var items = source == "sonarr"
                ? await FetchSonarrItemsAsync(url, apiKey, days, cancellationToken).ConfigureAwait(false)
                : await FetchRadarrItemsAsync(url, apiKey, days, cancellationToken).ConfigureAwait(false);

            NoCache();
            return Ok(new
            {
                ok = true,
                reachable = true,
                source = FormatSourceName(source),
                itemCount = items.Count,
                posterCount = items.Count(item => !string.IsNullOrWhiteSpace(item.PosterUrl)),
                sampleItems = items
                    .OrderBy(item => item.ReleaseDateUtc, StringComparer.OrdinalIgnoreCase)
                    .ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase)
                    .Take(3)
                    .Select(item => new
                    {
                        item.Title,
                        item.Subtitle,
                        item.Type,
                        item.ReleaseDateUtc,
                        hasPoster = !string.IsNullOrWhiteSpace(item.PosterUrl)
                    })
                    .ToList(),
                warning = items.Count == 0
                    ? $"{FormatSourceName(source)} responded successfully but returned no items for the selected date window."
                    : string.Empty
            });
        }
        catch (Exception ex)
        {
            NoCache();
            return Ok(new
            {
                ok = false,
                reachable = false,
                source = FormatSourceName(source),
                itemCount = 0,
                posterCount = 0,
                sampleItems = Array.Empty<object>(),
                error = CleanErrorMessage(ex.Message, $"Unable to connect to {FormatSourceName(source)}.")
            });
        }
    }

    [HttpGet("poster")]
    public async Task<IActionResult> GetPoster([FromQuery] string? source, [FromQuery] string? url, CancellationToken cancellationToken)
    {
        var cfg = TanadosUIPlugin.Instance?.Configuration
                  ?? throw new InvalidOperationException("Plugin not available.");
        var normalizedSource = NormalizeSource(source);
        var rawUrl = (url ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedSource) || string.IsNullOrWhiteSpace(rawUrl))
        {
            return NotFound();
        }

        var sourceBaseUrl = normalizedSource == "sonarr" ? NormalizeServerUrl(cfg.SonarrUrl) : NormalizeServerUrl(cfg.RadarrUrl);
        var sourceApiKey = normalizedSource == "sonarr" ? NormalizeSecret(cfg.SonarrApiKey) : NormalizeSecret(cfg.RadarrApiKey);
        var targetUrl = ResolvePosterRequestUrl(sourceBaseUrl, rawUrl);
        if (string.IsNullOrWhiteSpace(targetUrl))
        {
            return NotFound();
        }

        try
        {
            using var requestMessage = new HttpRequestMessage(HttpMethod.Get, targetUrl);
            requestMessage.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("image/*"));
            if (ShouldForwardApiKey(targetUrl, sourceBaseUrl) && !string.IsNullOrWhiteSpace(sourceApiKey))
            {
                requestMessage.Headers.Add("X-Api-Key", sourceApiKey);
            }

            using var response = await SendAsync(requestMessage, cancellationToken).ConfigureAwait(false);
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            var contentType = response.Content.Headers.ContentType?.ToString();
            NoCache();
            return File(bytes, string.IsNullOrWhiteSpace(contentType) ? "image/jpeg" : contentType);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "[TanadosUI] Upcoming poster proxy failed. source={Source} requestedUrl={RequestedUrl} resolvedUrl={ResolvedUrl}",
                normalizedSource,
                rawUrl,
                targetUrl);
            return NotFound();
        }
    }

    private async Task<List<UpcomingFeedItem>> FetchSonarrItemsAsync(string? baseUrl, string? apiKey, int days, CancellationToken cancellationToken)
    {
        var url = NormalizeServerUrl(baseUrl);
        var key = NormalizeSecret(apiKey);
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("Sonarr is enabled but the URL or API key is missing.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{url}/api/v3/calendar?start={DateTime.UtcNow:yyyy-MM-dd}&end={DateTime.UtcNow.AddDays(days):yyyy-MM-dd}&includeSeries=true");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.Add("X-Api-Key", key);

        using var response = await SendAsync(request, cancellationToken).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var items = new List<UpcomingFeedItem>();
        foreach (var element in document.RootElement.EnumerateArray())
        {
            var series = TryGetProperty(element, "series");
            var seriesTitle = GetString(series, "title");
            var episodeTitle = GetString(element, "title");
            var releaseDateUtc = PickDateString(element, "airDateUtc", "airDate");
            if (string.IsNullOrWhiteSpace(releaseDateUtc)) continue;
            var (posterCandidateUrl, posterFallbackUrl) = GetPosterCandidateUrls(series);

            var seasonNumber = GetInt(element, "seasonNumber");
            var episodeNumber = GetInt(element, "episodeNumber");
            var subtitleParts = new List<string>();
            if (seasonNumber > 0)
            {
                var code = $"S{seasonNumber:00}";
                if (episodeNumber > 0) code += $"E{episodeNumber:00}";
                subtitleParts.Add(code);
            }
            if (!string.IsNullOrWhiteSpace(episodeTitle))
            {
                subtitleParts.Add(episodeTitle);
            }

            items.Add(new UpcomingFeedItem(
                Id: $"sonarr:{GetInt(element, "id")}",
                Source: "Sonarr",
                Type: "episode",
                Title: string.IsNullOrWhiteSpace(seriesTitle) ? episodeTitle : seriesTitle,
                Subtitle: string.Join(" • ", subtitleParts.Where(part => !string.IsNullOrWhiteSpace(part))),
                Overview: GetString(element, "overview"),
                ReleaseDateUtc: releaseDateUtc,
                PosterUrl: !string.IsNullOrWhiteSpace(posterCandidateUrl)
                    ? BuildPosterProxyUrl("sonarr", posterCandidateUrl)
                    : posterFallbackUrl,
                PosterFallbackUrl: posterFallbackUrl,
                SeriesTitle: seriesTitle
            ));
        }

        return items;
    }

    private async Task<List<UpcomingFeedItem>> FetchRadarrItemsAsync(string? baseUrl, string? apiKey, int days, CancellationToken cancellationToken)
    {
        var url = NormalizeServerUrl(baseUrl);
        var key = NormalizeSecret(apiKey);
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException("Radarr is enabled but the URL or API key is missing.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{url}/api/v3/calendar?start={DateTime.UtcNow:yyyy-MM-dd}&end={DateTime.UtcNow.AddDays(days):yyyy-MM-dd}");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.Add("X-Api-Key", key);

        using var response = await SendAsync(request, cancellationToken).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var items = new List<UpcomingFeedItem>();
        foreach (var element in document.RootElement.EnumerateArray())
        {
            var title = GetString(element, "title");
            var releaseDateUtc = PickDateString(element, "physicalRelease", "digitalRelease", "inCinemas", "premiereDate");
            if (string.IsNullOrWhiteSpace(releaseDateUtc) || string.IsNullOrWhiteSpace(title)) continue;
            var (posterCandidateUrl, posterFallbackUrl) = GetPosterCandidateUrls(element);

            items.Add(new UpcomingFeedItem(
                Id: $"radarr:{GetInt(element, "id")}",
                Source: "Radarr",
                Type: "movie",
                Title: title,
                Subtitle: GetString(element, "year"),
                Overview: GetString(element, "overview"),
                ReleaseDateUtc: releaseDateUtc,
                PosterUrl: !string.IsNullOrWhiteSpace(posterCandidateUrl)
                    ? BuildPosterProxyUrl("radarr", posterCandidateUrl)
                    : posterFallbackUrl,
                PosterFallbackUrl: posterFallbackUrl,
                SeriesTitle: string.Empty
            ));
        }

        return items;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(15);
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var message = $"HTTP {(int)response.StatusCode}";
            try
            {
                var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    message = raw.Length > 320 ? raw[..320] : raw;
                }
            }
            catch
            {
            }

            response.Dispose();
            throw new InvalidOperationException(message);
        }

        return response;
    }

    private static string NormalizeServerUrl(string? value)
    {
        return (value ?? string.Empty).Trim().TrimEnd('/');
    }

    private static string NormalizeSecret(string? value)
    {
        return (value ?? string.Empty).Trim();
    }

    private static string CleanErrorMessage(string? message, string fallback)
    {
        var clean = (message ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(clean) ? fallback : clean;
    }

    private static JsonElement TryGetProperty(JsonElement element, string name)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value)
            ? value
            : default;
    }

    private static string GetString(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.ToString(),
            _ => string.Empty
        };
    }

    private static int GetInt(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value))
        {
            return 0;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
        {
            return number;
        }

        var raw = value.ToString();
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
    }

    private static string PickDateString(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            var raw = GetString(element, name);
            if (string.IsNullOrWhiteSpace(raw)) continue;

            if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed))
            {
                return parsed.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
            }
        }

        return string.Empty;
    }

    private static (string PreferredUrl, string FallbackUrl) GetPosterCandidateUrls(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("images", out var images) || images.ValueKind != JsonValueKind.Array)
        {
            return (string.Empty, string.Empty);
        }

        var localUrl = string.Empty;
        var remoteUrl = string.Empty;
        foreach (var image in images.EnumerateArray())
        {
            var coverType = GetString(image, "coverType");
            if (!string.Equals(coverType, "poster", StringComparison.OrdinalIgnoreCase)) continue;

            if (string.IsNullOrWhiteSpace(localUrl))
            {
                localUrl = GetString(image, "url");
            }

            if (string.IsNullOrWhiteSpace(remoteUrl))
            {
                remoteUrl = GetString(image, "remoteUrl");
            }

            if (!string.IsNullOrWhiteSpace(localUrl) && !string.IsNullOrWhiteSpace(remoteUrl))
            {
                break;
            }
        }

        if (!string.IsNullOrWhiteSpace(localUrl))
        {
            return (localUrl, ResolveRemotePosterUrl(remoteUrl));
        }

        if (!string.IsNullOrWhiteSpace(remoteUrl))
        {
            return (string.Empty, ResolveRemotePosterUrl(remoteUrl));
        }

        return (string.Empty, string.Empty);
    }

    private static string ResolveRemotePosterUrl(string candidateUrl)
    {
        var raw = (candidateUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        return Uri.TryCreate(raw, UriKind.Absolute, out _)
            ? raw
            : string.Empty;
    }

    private static string BuildPosterProxyUrl(string source, string candidateUrl)
    {
        var normalizedSource = NormalizeSource(source);
        var raw = (candidateUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedSource) || string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        return $"/TanadosUI/upcoming/poster?source={Uri.EscapeDataString(normalizedSource)}&url={Uri.EscapeDataString(raw)}";
    }

    private static string ResolvePosterRequestUrl(string baseUrl, string candidateUrl)
    {
        var raw = (candidateUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return Uri.TryCreate(raw, UriKind.Absolute, out var absoluteWithoutBase)
                ? absoluteWithoutBase.ToString()
                : string.Empty;
        }

        if (Uri.TryCreate(raw, UriKind.Absolute, out var absolute))
        {
            raw = string.Concat(absolute.AbsolutePath, absolute.Query);
        }

        if (raw.StartsWith("//", StringComparison.Ordinal))
        {
            return $"{baseUri.Scheme}:{raw}";
        }

        var basePath = baseUri.AbsolutePath.TrimEnd('/');
        var authority = baseUri.GetLeftPart(UriPartial.Authority);
        var rootedBase = string.IsNullOrWhiteSpace(basePath) || basePath == "/"
            ? authority
            : authority + basePath;

        if (raw.StartsWith("/", StringComparison.Ordinal))
        {
            if (!string.IsNullOrWhiteSpace(basePath) &&
                basePath != "/" &&
                (raw.Equals(basePath, StringComparison.OrdinalIgnoreCase) ||
                 raw.StartsWith(basePath + "/", StringComparison.OrdinalIgnoreCase)))
            {
                return authority + raw;
            }

            return rootedBase + raw;
        }

        return new Uri(new Uri(rootedBase.TrimEnd('/') + "/"), raw).ToString();
    }

    private static bool ShouldForwardApiKey(string targetUrl, string sourceBaseUrl)
    {
        if (!Uri.TryCreate(targetUrl, UriKind.Absolute, out var targetUri))
        {
            return false;
        }

        if (!Uri.TryCreate(sourceBaseUrl, UriKind.Absolute, out var sourceUri))
        {
            return false;
        }

        return string.Equals(targetUri.Scheme, sourceUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(targetUri.Host, sourceUri.Host, StringComparison.OrdinalIgnoreCase) &&
               targetUri.Port == sourceUri.Port;
    }

    private bool TryGetAdminUser(out IActionResult? errorResult)
    {
        errorResult = null;
        if (!TryGetRequestUserId(out var userId))
        {
            errorResult = Unauthorized(new { ok = false, error = "X-Emby-UserId is required." });
            return false;
        }

        var user = _users.GetUserById(userId);
        if (user is null)
        {
            errorResult = Unauthorized(new { ok = false, error = "User not found." });
            return false;
        }

        if (!IsAdminUser(user))
        {
            errorResult = StatusCode(403, new { ok = false, error = "This action is only available to admin users." });
            return false;
        }

        return true;
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

    private bool TryGetRequestUserId(out Guid userId)
    {
        var userIdHeader =
            Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
            Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();
        return Guid.TryParse(userIdHeader, out userId) && userId != Guid.Empty;
    }

    private static string NormalizeSource(string? value)
    {
        var raw = (value ?? string.Empty).Trim().ToLowerInvariant();
        return raw switch
        {
            "sonarr" => "sonarr",
            "radarr" => "radarr",
            _ => string.Empty
        };
    }

    private static string FormatSourceName(string source)
    {
        return NormalizeSource(source) switch
        {
            "sonarr" => "Sonarr",
            "radarr" => "Radarr",
            _ => "Source"
        };
    }

    private void NoCache()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
    }
}
