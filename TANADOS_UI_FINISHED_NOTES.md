# Tanados UI finished rework

Version: `2.8.1.0`

## Added in this package

- Visible plugin name updated to `Tanados UI`.
- Automatic Jellyfin Web logo replacement was added.
- Tanados logo assets were optimized and embedded under `/slider/src/images/`.
- Plugin icon was converted to a square Tanados icon for the Jellyfin plugin catalog.
- Tanados purple/gold branding CSS was added to override the old green/teal accents.
- The injection block now loads:
  - `../slider/src/tanados-branding.css`
  - `../slider/modules/tanadosBranding.js`
- The physical `index.html` patch fallback block was updated too.
- Image MIME support was added to `SliderAssetsController` for PNG/JPG/WebP/GIF/ICO.
- Local build script and GitHub Actions workflow were added.

## Files to review/change if you want another logo later

- `img/icon.png` - square plugin icon.
- `img/tanados-logo.png` - wide source logo.
- `Resources/slider/src/images/tanados-logo.png` - web UI logo used by automatic branding.
- `Resources/slider/src/images/tanados-favicon.png` - favicon/apple-touch icon used by automatic branding.
- `Resources/slider/src/tanados-branding.css` - CSS theme/logo overrides.
- `Resources/slider/modules/tanadosBranding.js` - runtime logo/favicon/title replacement.

## Build the installable Jellyfin plugin ZIP

Install .NET SDK 9.0, then run:

```bash
./scripts/package-tanados-ui.sh 2.8.1.0
```

The script outputs:

```text
dist/TanadosUI-2.8.1.0-server.zip
dist/checksum-sha256.txt
```

It also updates `manifest.json` with the SHA256 checksum.

## Install/update in Jellyfin

1. Remove the old MonWUI/JMSFusion plugin if it is installed.
2. Install Tanados UI from your plugin repository or manually from the built server ZIP.
3. Restart Jellyfin.
4. Hard refresh the browser with `Ctrl + F5`.

## Important note

This rebrands Jellyfin Web loaded from your server. Native Jellyfin clients like Android TV, Roku, Swiftfin, and some mobile apps may not use server-side web CSS or favicon replacement.

## Output ZIP note

Font binary files are not included in the ZIP I generated for download. Keep the existing font files in your GitHub repo/source checkout if your FontAwesome icons need them.
