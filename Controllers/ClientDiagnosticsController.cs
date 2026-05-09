using System;
using System.Linq;
using System.Text.Json;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/client-diagnostics")]
[Route("Plugins/TanadosUI/client-diagnostics")]
public class ClientDiagnosticsController : ControllerBase
{
    private const int MaxTextLength = 512;
    private const int MaxJsonLength = 4096;

    private readonly ILogger<ClientDiagnosticsController> _logger;
    private readonly IUserManager _users;

    public ClientDiagnosticsController(
        ILogger<ClientDiagnosticsController> logger,
        IUserManager users)
    {
        _logger = logger;
        _users = users;
    }

    public sealed class ClientDiagnosticRequest
    {
        public string? Scope { get; set; }
        public string? Event { get; set; }
        public string? Level { get; set; }
        public string? Message { get; set; }
        public string? Href { get; set; }
        public string? Hash { get; set; }
        public string? PageTitle { get; set; }
        public string? RuntimeVersion { get; set; }
        public string? UserAgent { get; set; }
        public bool? DebugEnabled { get; set; }
        public JsonElement? Data { get; set; }
    }

    [HttpPost]
    public IActionResult LogClientDiagnostic([FromBody] ClientDiagnosticRequest? request)
    {
        var userCheck = TryGetRequestUser();
        if (userCheck.Result is not null)
        {
            return userCheck.Result;
        }

        var token = Request.Headers["X-Emby-Token"].FirstOrDefault() ??
                    Request.Headers["X-MediaBrowser-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token))
        {
            return Unauthorized(new { ok = false, error = "X-Emby-Token is required." });
        }

        var payload = request ?? new ClientDiagnosticRequest();
        var scope = NormalizeToken(payload.Scope, "unknown-scope", 64);
        var eventName = NormalizeToken(payload.Event, "unknown-event", 96);
        var level = NormalizeLevel(payload.Level);
        var message = NormalizeText(payload.Message, 256);
        var href = NormalizeText(payload.Href, MaxTextLength);
        var hash = NormalizeText(payload.Hash, 256);
        var pageTitle = NormalizeText(payload.PageTitle, 180);
        var runtimeVersion = NormalizeText(payload.RuntimeVersion, 64);
        var userAgent = NormalizeText(payload.UserAgent, 220);
        var dataJson = NormalizeJson(payload.Data, MaxJsonLength);
        var remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
        var userName = NormalizeText(
            userCheck.User?.Username ??
            userCheck.User?.Id.ToString(),
            128);

        var logTemplate =
            "[TanadosUI][ClientDiag] level={Level} scope={Scope} event={Event} userId={UserId} user={User} debug={DebugEnabled} runtime={RuntimeVersion} href={Href} hash={Hash} title={PageTitle} ip={RemoteIp} ua={UserAgent} message={Message} data={Data}";

        switch (level)
        {
            case "error":
                _logger.LogError(
                    logTemplate,
                    level,
                    scope,
                    eventName,
                    userCheck.UserId,
                    userName,
                    payload.DebugEnabled == true,
                    runtimeVersion,
                    href,
                    hash,
                    pageTitle,
                    remoteIp,
                    userAgent,
                    message,
                    dataJson);
                break;
            case "warning":
                _logger.LogWarning(
                    logTemplate,
                    level,
                    scope,
                    eventName,
                    userCheck.UserId,
                    userName,
                    payload.DebugEnabled == true,
                    runtimeVersion,
                    href,
                    hash,
                    pageTitle,
                    remoteIp,
                    userAgent,
                    message,
                    dataJson);
                break;
            default:
                _logger.LogInformation(
                    logTemplate,
                    level,
                    scope,
                    eventName,
                    userCheck.UserId,
                    userName,
                    payload.DebugEnabled == true,
                    runtimeVersion,
                    href,
                    hash,
                    pageTitle,
                    remoteIp,
                    userAgent,
                    message,
                    dataJson);
                break;
        }

        return Ok(new { ok = true });
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

    private static string NormalizeLevel(string? level)
    {
        return (level ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "warn" => "warning",
            "warning" => "warning",
            "error" => "error",
            _ => "info"
        };
    }

    private static string NormalizeText(string? value, int maxLength)
    {
        var clean = (value ?? string.Empty).Trim();
        if (clean.Length <= maxLength)
        {
            return clean;
        }

        return clean[..maxLength];
    }

    private static string NormalizeToken(string? value, string fallback, int maxLength)
    {
        var clean = NormalizeText(value, maxLength);
        if (string.IsNullOrWhiteSpace(clean))
        {
            return fallback;
        }

        return clean;
    }

    private static string NormalizeJson(JsonElement? value, int maxLength)
    {
        if (value is null)
        {
            return string.Empty;
        }

        var raw = value.Value.GetRawText();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        raw = raw.Trim();
        if (raw.Length <= maxLength)
        {
            return raw;
        }

        return raw[..maxLength];
    }
}
