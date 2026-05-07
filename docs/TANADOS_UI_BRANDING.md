# Tanados UI automatic branding

This build adds automatic Jellyfin Web branding through the Tanados UI injection block.

## What is automatic

- Jellyfin Web header/logo elements are replaced with the Tanados logo.
- Login/splash logo is replaced with the Tanados logo.
- Browser title is changed from Jellyfin to Tanados UI when Jellyfin appears in the title.
- Favicon/apple touch icon are pointed at the Tanados icon.
- The original green/teal accents are overridden with Tanados purple/gold accents.

## Files added

- `Resources/slider/src/tanados-branding.css`
- `Resources/slider/modules/tanadosBranding.js`
- `Resources/slider/src/images/tanados-logo.png`
- `Resources/slider/src/images/tanados-favicon.png`
- `img/icon.png`
- `img/icon-square.png`
- `img/tanados-logo.png`
- `img/icon-original-wide.png`

## Important limitation

This rebrands Jellyfin Web loaded from your server. Native Jellyfin apps such as Android TV, Roku, Swiftfin, and some mobile clients have their own UI and may not use server-side web CSS or favicon changes.

## Install/update

After installing or updating the plugin, restart Jellyfin and hard refresh the browser with `Ctrl + F5`.
