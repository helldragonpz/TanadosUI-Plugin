using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/upcoming")]
[Route("Plugins/TanadosUI/upcoming")]
public class UpcomingCalendarController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IHttpClientFactory _httpClientFactory;

    public UpcomingCalendarController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
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
        string SeriesTitle);

    private sealed record SourceError(string Source, string Message);

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
                PosterUrl: GetPosterUrl(series),
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

            items.Add(new UpcomingFeedItem(
                Id: $"radarr:{GetInt(element, "id")}",
                Source: "Radarr",
                Type: "movie",
                Title: title,
                Subtitle: GetString(element, "year"),
                Overview: GetString(element, "overview"),
                ReleaseDateUtc: releaseDateUtc,
                PosterUrl: GetPosterUrl(element),
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

    private static string GetPosterUrl(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("images", out var images) || images.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        foreach (var image in images.EnumerateArray())
        {
            var coverType = GetString(image, "coverType");
            if (!string.Equals(coverType, "poster", StringComparison.OrdinalIgnoreCase)) continue;

            var remoteUrl = GetString(image, "remoteUrl");
            if (!string.IsNullOrWhiteSpace(remoteUrl)) return remoteUrl;

            var url = GetString(image, "url");
            if (!string.IsNullOrWhiteSpace(url)) return url;
        }

        return string.Empty;
    }

    private void NoCache()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
    }
}
