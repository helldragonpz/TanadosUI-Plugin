using Microsoft.AspNetCore.Builder;

namespace Jellyfin.Plugin.TanadosUI
{
    public static class MiddlewareExtensions
    {
        public static IApplicationBuilder UseTanadosUI(this IApplicationBuilder app) => app;
    }
}
