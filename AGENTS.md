# Repository Guidelines

## Project Structure & Module Organization
`JMSFusion.csproj` is the single .NET 9 Jellyfin plugin project. C# server code lives at the repo root plus `Controllers/`, `Core/`, `Hosting/`, and `Infrastructure/`. Embedded web assets are split between `Web/` for configuration pages, `RuntimeModules/` for injected runtime helpers, and `Resources/slider/` for the main Tanados UI modules, styles, language files, and images. Packaging metadata lives in `meta.json` and `manifest.json`; release automation is under `scripts/` and `.github/workflows/`.

## Build, Test, and Development Commands
Use `dotnet build JMSFusion.csproj` for a fast compile check. Use `dotnet publish JMSFusion.csproj -c Release` to produce the plugin assembly with embedded assets. Run `./scripts/package-tanados-ui.sh 2.9.0.2` to build the installable server zip in `dist/` and refresh `manifest.json` with the MD5 checksum. Run `bash ./update_meta.sh 2.9.0.2` only when you need to refresh `meta.json` timestamps or versioned icon paths without packaging.

## Coding Style & Naming Conventions
Follow the existing split style: 4-space indentation in C# and 2-space indentation in web assets. Keep C# file names and types in PascalCase, for example `ConfigController.cs`; keep JavaScript exports in camelCase and match existing module names such as `settingsPage.js` or `playerUI.js`. Prefer focused controllers and feature-based modules instead of large cross-cutting edits. There is no repo-local formatter config, so keep diffs small and match surrounding code exactly.

## Testing Guidelines
There is no dedicated test project in this repository today. Before opening a PR, run `dotnet build` and, for release work, `./scripts/package-tanados-ui.sh <version>`. Validate UI changes manually in a Jellyfin instance: confirm asset injection, settings pages, and any touched home/player flows. Include clear reproduction steps for bug fixes.

## Commit & Pull Request Guidelines
Recent history uses short, direct subjects such as `fix checksum`, `Update manifest.json`, and `Fixing error on new settings`. Keep commit messages imperative, scoped to one change, and separate packaging/version bumps from feature work when possible. PRs should describe the affected Jellyfin surfaces, list manual verification, link any related issue, and include screenshots or short recordings for visual changes.

## Security & Configuration Tips
Do not commit real API keys, tokens, or user-specific Jellyfin settings. Treat `manifest.json` and `meta.json` as release artifacts: update them through the scripts whenever possible instead of hand-editing checksums or versioned paths.
