#!/bin/bash
# Installs Hemulky and clears macOS quarantine so Gatekeeper won't trash it.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC=""

if [ -d "$DIR/HemulkyReminder.app" ]; then
  APP_SRC="$DIR/HemulkyReminder.app"
elif [ -d "/Volumes/HemulkyReminder/HemulkyReminder.app" ]; then
  APP_SRC="/Volumes/HemulkyReminder/HemulkyReminder.app"
elif [ -d "/Volumes/HemulkyReminder 1.0.0-arm64/HemulkyReminder.app" ]; then
  APP_SRC="/Volumes/HemulkyReminder 1.0.0-arm64/HemulkyReminder.app"
else
  # Find mounted DMG volume with the app
  for vol in /Volumes/*; do
    if [ -d "$vol/HemulkyReminder.app" ]; then
      APP_SRC="$vol/HemulkyReminder.app"
      break
    fi
  done
fi

if [ -z "$APP_SRC" ] || [ ! -d "$APP_SRC" ]; then
  osascript -e 'display dialog "HemulkyReminder.app not found.\n\n1. Open the HemulkyReminder.dmg\n2. Keep that window open\n3. Run this Install script again\n\nOr put HemulkyReminder.app next to this script." buttons {"OK"} default button 1 with title "Hemulky Installer"'
  exit 1
fi

DEST="/Applications/HemulkyReminder.app"
echo "Installing from: $APP_SRC"
rm -rf "$DEST"
cp -R "$APP_SRC" "$DEST"

# Remove quarantine / Gatekeeper download flags (stops "malware" trash dialog)
xattr -cr "$DEST" || true

# Ad-hoc sign so macOS treats it as a local app
codesign --force --deep --sign - "$DEST" 2>/dev/null || true

open "$DEST"

osascript -e 'display notification "Look for Hemulky in the menu bar (top right)." with title "Hemulky installed"'
echo "Done. Hemulky should appear in your menu bar."
