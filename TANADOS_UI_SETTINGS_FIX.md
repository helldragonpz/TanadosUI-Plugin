# Tanados UI 2.8.1.1 settings fix

This source fixes the Jellyfin Web error:

```text
Failed to fetch dynamically imported module: /slider/modules/settingsPage.js
```

Root cause: the settings module loads the language index, and the previous source referenced `Resources/slider/language/bul_bg.js` even though only `bul.js` existed.

Changes:

- Added `Resources/slider/language/bul_bg.js` as a compatibility alias.
- Changed `Resources/slider/language/index.js` to import Bulgarian labels from `bul.js`.
- Bumped the plugin version to `2.8.1.1`.
- Changed the package script to generate Jellyfin's expected MD5 checksum and update `manifest.json`.
- Set the default preferred trailer language to `bg-BG`.

After installing the rebuilt plugin, restart Jellyfin and hard refresh the browser with `Ctrl + F5`. If the old error remains, clear cache for your Jellyfin IP/domain.
