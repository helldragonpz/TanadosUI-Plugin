#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-2.9.0.2}"
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
[ -f img/tanados-logo.png ] && cp img/tanados-logo.png "$PACKAGE_DIR/tanados-logo.png"

(
  cd "$DIST_DIR/package"
  zip -qr "$ZIP_PATH" "Tanados UI_$VERSION"
)

if command -v md5sum >/dev/null 2>&1; then
  MD5="$(md5sum "$ZIP_PATH" | awk '{print $1}')"
elif command -v md5 >/dev/null 2>&1; then
  MD5="$(md5 -q "$ZIP_PATH")"
else
  echo "md5sum/md5 was not found; cannot calculate Jellyfin repository checksum." >&2
  exit 1
fi

printf '%s\n' "$MD5" > "$DIST_DIR/checksum-md5.txt"

python3 - <<PY
import json, datetime
from pathlib import Path
manifest_path = Path('manifest.json')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
version = '$VERSION'
md5 = '$MD5'
repo = '$REPO_SLUG'
release_url = f'https://github.com/{repo}/releases/download/{version}/TanadosUI-{version}-server.zip'
manifest[0]['versions'][0]['version'] = version
manifest[0]['versions'][0]['sourceUrl'] = release_url
manifest[0]['versions'][0]['checksum'] = md5
manifest[0]['versions'][0]['timestamp'] = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
PY

echo "Built: $ZIP_PATH"
echo "MD5: $MD5"
echo "manifest.json was updated with the Jellyfin MD5 checksum and release URL."
