using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TanadosUI.Controllers;

[ApiController]
[Route("TanadosUI/ping")]
[Route("Plugins/TanadosUI/ping")]
public class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Ping()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        Response.Headers["X-TanadosUI-Version"] = AssetVersioning.AssetVersion;
        return NoContent();
    }
}
