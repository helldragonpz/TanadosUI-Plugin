using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Jellyfin.Plugin.TanadosUI.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.TanadosUI
{
    public sealed class TanadosUIServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection services, IServerApplicationHost applicationHost)
        {
            services.AddHttpClient();
            services.AddSingleton<TrailerAutomationService>();
            services.AddTransient<IStartupFilter, JMSStartupFilter>();
        }
    }
}
