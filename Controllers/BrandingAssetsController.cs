using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using IOFile = System.IO.File;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/branding-assets")]
[Route("Plugins/TanadosUI/branding-assets")]
public class BrandingAssetsController : ControllerBase
{
    private const long MaxImageBytes = 10 * 1024 * 1024;
    private static readonly string[] AllowedImageExtensions = { ".png", ".webp", ".svg", ".jpg", ".jpeg", ".gif", ".ico" };
    private readonly IUserManager _users;

    public BrandingAssetsController(IUserManager users)
    {
        _users = users;
    }

    public sealed class DeleteBrandingAssetRequest
    {
        public string? CurrentUrl { get; set; }
    }

    [HttpPost("{slot}")]
    public async Task<IActionResult> UploadAsset(string slot, [FromForm] IFormFile? file, [FromForm] string? currentUrl, CancellationToken cancellationToken)
    {
        var adminCheck = TryGetAdminUser();
        if (adminCheck.Result is not null)
        {
            return adminCheck.Result;
        }

        var cleanSlot = NormalizeSlot(slot);
        if (cleanSlot is null)
        {
            return BadRequest(new { ok = false, error = "Unsupported branding asset slot." });
        }

        if (file is null || file.Length <= 0)
        {
            return BadRequest(new { ok = false, error = "An image file is required." });
        }

        if (file.Length > MaxImageBytes)
        {
            return BadRequest(new { ok = false, error = "The uploaded image is too large. The maximum size is 10 MB." });
        }

        var extension = Path.GetExtension(file.FileName ?? string.Empty).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension) || !AllowedImageExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            return BadRequest(new { ok = false, error = "Only png, webp, svg, jpg, jpeg, gif, or ico images are supported." });
        }

        var plugin = TanadosUIPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
        var assetDirectory = plugin.GetStorageDirectory("branding-assets", cleanSlot);
        DeleteLocalAssetIfOwned(plugin, cleanSlot, currentUrl);

        var fileName = $"{cleanSlot}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(assetDirectory, fileName);

        await using (var targetStream = IOFile.Create(fullPath))
        {
            await file.CopyToAsync(targetStream, cancellationToken).ConfigureAwait(false);
        }

        var publicUrl = $"/TanadosUI/branding-assets/{cleanSlot}/{fileName}";
        NoCache();
        return Ok(new
        {
            ok = true,
            slot = cleanSlot,
            fileName,
            url = publicUrl
        });
    }

    [HttpPost("{slot}/delete")]
    public IActionResult DeleteAsset(string slot, [FromBody] DeleteBrandingAssetRequest? request)
    {
        var adminCheck = TryGetAdminUser();
        if (adminCheck.Result is not null)
        {
            return adminCheck.Result;
        }

        var cleanSlot = NormalizeSlot(slot);
        if (cleanSlot is null)
        {
            return BadRequest(new { ok = false, error = "Unsupported branding asset slot." });
        }

        var plugin = TanadosUIPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
        var deleted = DeleteLocalAssetIfOwned(plugin, cleanSlot, request?.CurrentUrl);
        NoCache();
        return Ok(new { ok = true, deleted });
    }

    [HttpGet("{slot}/{fileName}")]
    [HttpHead("{slot}/{fileName}")]
    public IActionResult GetAsset(string slot, string fileName)
    {
        var cleanSlot = NormalizeSlot(slot);
        if (cleanSlot is null)
        {
            return BadRequest("Unsupported branding asset slot.");
        }

        var cleanFileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(cleanFileName) || !string.Equals(cleanFileName, fileName, StringComparison.Ordinal))
        {
            return BadRequest("Invalid file name.");
        }

        var plugin = TanadosUIPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
        var fullPath = Path.Combine(plugin.GetStorageDirectory("branding-assets", cleanSlot), cleanFileName);
        if (!IOFile.Exists(fullPath))
        {
            return NotFound();
        }

        NoCache();
        return PhysicalFile(fullPath, GetImageMimeType(cleanFileName));
    }

    private static string? NormalizeSlot(string? slot)
    {
        var clean = string.IsNullOrWhiteSpace(slot)
            ? string.Empty
            : slot.Trim().ToLowerInvariant();

        return clean switch
        {
            "header-logo" => "header-logo",
            "login-logo" => "login-logo",
            "favicon" => "favicon",
            "login-background" => "login-background",
            _ => null
        };
    }

    private static bool DeleteLocalAssetIfOwned(TanadosUIPlugin plugin, string slot, string? currentUrl)
    {
        if (!TryResolveOwnedAssetPath(plugin, slot, currentUrl, out var fullPath))
        {
            return false;
        }

        try
        {
            if (IOFile.Exists(fullPath))
            {
                IOFile.Delete(fullPath);
                return true;
            }
        }
        catch
        {
        }

        return false;
    }

    private static bool TryResolveOwnedAssetPath(TanadosUIPlugin plugin, string slot, string? currentUrl, out string fullPath)
    {
        fullPath = string.Empty;
        var raw = (currentUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var routePath = raw;
        if (Uri.TryCreate(raw, UriKind.Absolute, out var absoluteUri))
        {
            routePath = absoluteUri.AbsolutePath;
        }

        routePath = routePath.Split('?', '#')[0].Replace('\\', '/');
        var tanadosPrefix = $"/TanadosUI/branding-assets/{slot}/";
        var pluginPrefix = $"/Plugins/TanadosUI/branding-assets/{slot}/";
        var fileName = routePath.StartsWith(tanadosPrefix, StringComparison.OrdinalIgnoreCase)
            ? routePath[tanadosPrefix.Length..]
            : routePath.StartsWith(pluginPrefix, StringComparison.OrdinalIgnoreCase)
                ? routePath[pluginPrefix.Length..]
                : string.Empty;

        fileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        fullPath = Path.Combine(plugin.GetStorageDirectory("branding-assets", slot), fileName);
        return true;
    }

    private static string GetImageMimeType(string fileName)
    {
        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".ico" => "image/x-icon",
            _ => "application/octet-stream"
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
}
