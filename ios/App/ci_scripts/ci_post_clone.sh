#!/bin/sh
#
# ci_post_clone.sh — Xcode Cloud runs this right after cloning, before it
# resolves Swift packages. A clean clone has NONE of the generated pieces the
# app bundle needs, so this script rebuilds them exactly like a local
# `npm run sync` does:
#   - public/assets/js/native.bundle.js   (the esbuild native bridge)
#   - ios/App/App/public                  (the Capacitor webroot, copied from public/)
#   - public/assets/js/config.js          (client config — gitignored)
#   - public/assets/fontawesome/          (FontAwesome Pro — licensed, never in
#                                          this public repo)
#
# No secrets and no workflow environment variables: config.js and the
# FontAwesome files are public client assets by design (every rdbk.app visitor
# downloads them), so they are fetched straight from the live site. That also
# keeps the bundled app in sync with what production serves.
set -eu

REPO="$CI_PRIMARY_REPOSITORY_PATH"
SITE="https://rdbk.app"

# --- Node 22 (Capacitor 8 needs >=22; node@22 is keg-only, hence the PATH) ---
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
echo "ci_post_clone: node $(node --version), npm $(npm --version)"

cd "$REPO"
npm ci

# --- client config (public by design) ---
curl -fsSL "$SITE/assets/js/config.js" -o public/assets/js/config.js
echo "ci_post_clone: fetched config.js"

# --- FontAwesome Pro: mirror the CSS plus every webfont it references ---
FA="public/assets/fontawesome"
mkdir -p "$FA/css" "$FA/webfonts"
curl -fsSL "$SITE/assets/fontawesome/css/all.min.css" -o "$FA/css/all.min.css"
fonts=$(grep -oE 'webfonts/[A-Za-z0-9.-]*\.(woff2|ttf)' "$FA/css/all.min.css" | sort -u)
if [ -z "$fonts" ]; then
  echo "ci_post_clone: ERROR — no FontAwesome webfont references found in CSS" >&2
  exit 1
fi
for font in $fonts; do
  curl -fsSL "$SITE/assets/fontawesome/$font" -o "$FA/$font"
done
echo "ci_post_clone: fetched fontawesome ($(ls "$FA/webfonts" | wc -l | tr -d ' ') webfonts)"

# --- native bridge + webroot into the iOS project ---
npm run build:native
npx cap sync ios
echo "ci_post_clone: cap sync done — webroot at ios/App/App/public"
