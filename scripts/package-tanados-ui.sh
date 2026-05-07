#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-2.8.1.0}"
REPO_SLUG="${REPO_SLUG:-helldragonpz/TanadosUI-Plugin}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PUBLISH_DIR="$DIST_DIR/publish"
PACKAGE_DIR="$DIST_DIR/package/Tanados UI_$VERSION"
ZIP_NAME="TanadosUI-$VERSION-server.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

cd "$ROOT_DIR"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet was not found. Install .NET SDK 9.0, then run this script again." >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$PUBLISH_DIR" "$PACKAGE_DIR"

bash ./update_meta.sh "$VERSION"

dotnet publish JMSFusion.csproj \
  --configuration Release \
  --output "$PUBLISH_DIR" \
  /p:Version="$VERSION" \
  /p:AssemblyVersion="$VERSION" \
  /p:FileVersion="$VERSION"

cp "$PUBLISH_DIR"/Jellyfin.Plugin.TanadosUI.dll "$PACKAGE_DIR/"
[ -f "$PUBLISH_DIR/Jellyfin.Plugin.TanadosUI.pdb" ] && cp "$PUBLISH_DIR/Jellyfin.Plugin.TanadosUI.pdb" "$PACKAGE_DIR/"
cp meta.json "$PACKAGE_DIR/"
cp img/icon.png "$PACKAGE_DIR/icon.png"

(
  cd "$DIST_DIR/package"
  zip -qr "$ZIP_PATH" "Tanados UI_$VERSION"
)

if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$ZIP_PATH" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
else
  echo "sha256sum/shasum was not found; cannot calculate checksum." >&2
  exit 1
fi

echo "$SHA256" > "$DIST_DIR/checksum-sha256.txt"

python3 - <<PY
import json, datetime
from pathlib import Path
manifest_path = Path('manifest.json')
manifest = json.loads(manifest_path.read_text())
version = '$VERSION'
sha256 = '$SHA256'
repo = '$REPO_SLUG'
release_url = f'https://github.com/{repo}/releases/download/{version}/TanadosUI-{version}-server.zip'
manifest[0]['versions'][0]['version'] = version
manifest[0]['versions'][0]['sourceUrl'] = release_url
manifest[0]['versions'][0]['checksum'] = sha256
manifest[0]['versions'][0]['timestamp'] = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
PY

echo "Built: $ZIP_PATH"
echo "SHA256: $SHA256"
echo "manifest.json was updated with the checksum and release URL."
