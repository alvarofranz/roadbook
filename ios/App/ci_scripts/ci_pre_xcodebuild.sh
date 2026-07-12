#!/bin/sh
#
# ci_pre_xcodebuild.sh — Xcode Cloud runs this right before `xcodebuild`, after the clone and
# dependency resolution. It makes the release TAG the single source of truth for the version,
# exactly like the Android workflow derives versionName from its tag:
#
#   · MARKETING_VERSION      (CFBundleShortVersionString) ← the semver from the tag `ios-X.Y.Z`
#   · CURRENT_PROJECT_VERSION (CFBundleVersion / build)   ← Xcode Cloud's monotonic CI_BUILD_NUMBER
#
# The semver is the ONE human-facing version, identical on the web footer and the Android
# versionName. The build number only ever grows (CI_BUILD_NUMBER is per-workflow monotonic), and
# because each new semver is a fresh CFBundleVersion train, App Store Connect never rejects it.
#
# On a non-tag build (manual run, no CI_TAG) it leaves the committed version untouched.
set -eu

if [ -z "${CI_TAG:-}" ]; then
  echo "ci_pre_xcodebuild: no CI_TAG — leaving the committed version as-is"
  exit 0
fi

VERSION="${CI_TAG#ios-}"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) echo "ci_pre_xcodebuild: tag '$CI_TAG' is not ios-X.Y.Z — leaving the committed version as-is"; exit 0 ;;
esac

cd "$CI_PRIMARY_REPOSITORY_PATH/ios/App"
agvtool new-marketing-version "$VERSION"
agvtool new-version -all "${CI_BUILD_NUMBER:-1}"
echo "ci_pre_xcodebuild: MARKETING_VERSION=$VERSION  CFBundleVersion=${CI_BUILD_NUMBER:-1}  (from $CI_TAG)"
