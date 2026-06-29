# Store assets (Google Play + Apple App Store)

Everything needed for the store listings of the native apps. Shared by **both**
platforms — these are listing/marketing assets, not shipped to the web, so they live
here at the repo root (not under `public/`).

## Contents

| File | Use |
|------|-----|
| `icon-512-play.png` | **Google Play** app icon — 512×512, 32-bit PNG (alpha OK). |
| `icon-1024-appstore.png` | **Apple App Store** app icon — 1024×1024, **no alpha** (Apple rejects transparency). |
| `feature-graphic-1024x500.png` | **Google Play** feature graphic (required) — 1024×500. Not used by Apple. |
| `listing.md` | Title, subtitle, short + full description, keywords & promo text in EN/ES/IT/DE/FR. |
| `screenshots/android/` | Drop your Play phone screenshots here. |
| `screenshots/ios/` | Drop your App Store iPhone screenshots here. |

The icon is generated from the brand source `assets/logo.png` (1024, the orange
mountain/tyre mark), the same source used for the in-app launcher icon and splash.

## Screenshot specs

Capture them yourself from the mobile web view of the tools (Reader · Tripmaster ·
Recorder), or on a device.

**Google Play — phone**
- 2 to 8 images, PNG or JPEG, ≤ 8 MB each.
- Aspect ratio **16:9 or 9:16**; each side 320–3840 px.
- Recommended: **1080×1920** (portrait).

**Apple App Store — iPhone**
- Required size **6.7"**: **1290×2796** (portrait). A 6.7" set also covers smaller iPhones.
- 1 to 10 images, PNG or JPEG (no transparency).

> Note: Play (max 9:16 = 1.78) and the iPhone 6.7" (2.17) use **different aspect ratios**,
> so the same file can't be native-perfect for both — export a 1080×1920 set for Play and a
> 1290×2796 set for iOS.

## Regenerating the icons / feature graphic

Icons + splash for the app itself (not these store files) come from `assets/logo.png`:

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#C46633' --iconBackgroundColorDark '#C46633' \
  --splashBackgroundColor '#0e1116' --splashBackgroundColorDark '#0e1116'
```

Brand colour: **`#C46633`** (orange) · app background: **`#0e1116`** (dark).
