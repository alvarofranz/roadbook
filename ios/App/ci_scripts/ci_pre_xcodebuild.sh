#!/bin/sh
#
# ci_pre_xcodebuild.sh — Xcode Cloud runs this after resolving packages and
# right before `xcodebuild`. It stamps a fresh, always-increasing build number
# so every cloud build is a valid new TestFlight build with zero manual bumps.
#
# Format: <YYYYMMDD>.<HHMMSS> (e.g. 20260703.143022). Each component stays well
# under App Store's per-field limit, and it is always greater than the previous
# build (time only moves forward). Info.plist reads $(CURRENT_PROJECT_VERSION),
# so stamping the project file is enough.
set -eu

BUILD="$(date +%Y%m%d).$(date +%H%M%S)"
PBX="$CI_PRIMARY_REPOSITORY_PATH/ios/App/App.xcodeproj/project.pbxproj"

# BSD sed (Xcode Cloud runs on macOS): set CURRENT_PROJECT_VERSION everywhere.
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${BUILD};/g" "$PBX"

echo "ci_pre_xcodebuild: stamped build number ${BUILD}"
grep -m1 "CURRENT_PROJECT_VERSION" "$PBX"
