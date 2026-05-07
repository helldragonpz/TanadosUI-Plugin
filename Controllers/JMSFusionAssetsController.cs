using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using IOFile = System.IO.File;

namespace Jellyfin.Plugin.TanadosUI.Controllers
{
    [ApiController]
    [Route("Plugins/TanadosUI/assets")]
    public class TanadosUIAssetsController : ControllerBase
    {
        private readonly ILogger<TanadosUIAssetsController> _logger;
        public TanadosUIAssetsController(ILogger<TanadosUIAssetsController> logger) => _logger = logger;

        [HttpGet("UiJs")]
        public IActionResult GetUiJs() => ServeEmbeddedJavascript("assets:ui-js", "ui.js", "UiJs error");

        [HttpGet("WebSettingsJs")]
        public IActionResult GetWebSettingsJs() => ServeEmbeddedJavascript("assets:web-settings-js", "settings.js", "WebSettingsJs error");

        private IActionResult ServeEmbeddedJavascript(string cacheKey, string fileName, string errorLogMessage)
        {
            try
            {
                if (AssetVersioning.TryHandleConditionalGet(HttpContext, cacheKey))
                {
                    return StatusCode(304);
                }

                var asm = typeof(TanadosUIPlugin).Assembly;
                var ns = typeof(TanadosUIPlugin).Namespace;
                var resName = $"{ns}.Web.{fileName}";

                using var stream = asm.GetManifestResourceStream(resName);
                if (stream == null) return NotFound();

                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                return File(ms.ToArray(), "application/javascript; charset=utf-8");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, errorLogMessage);
                return StatusCode(500, "Internal server error");
            }
        }
    }
}
