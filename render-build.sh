#!/usr/bin/env bash
# exit on error
set -o errexit

STORAGE_DIR=/opt/render/project/.render

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Checking for Chrome..."
if [[ ! -d "$STORAGE_DIR/chrome" ]]; then
  echo "...Downloading Chrome"
  mkdir -p "$STORAGE_DIR/chrome"
  cd "$STORAGE_DIR/chrome"
  wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  dpkg -x ./google-chrome-stable_current_amd64.deb "$STORAGE_DIR/chrome"
  rm ./google-chrome-stable_current_amd64.deb
  cd -
else
  echo "...Using Chrome from cache"
fi