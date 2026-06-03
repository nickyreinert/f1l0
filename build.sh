#!/bin/bash
# Inject Firebase config from environment variables into index.html

INDEX_FILE="htdocs/index.html"

if [ -z "$FIREBASE_API_KEY" ]; then
  echo "Warning: FIREBASE_API_KEY not set, using defaults"
else
  sed -i.bak "s|window.__FIREBASE_API_KEY__|'$FIREBASE_API_KEY'|g" "$INDEX_FILE"
  sed -i.bak "s|window.__FIREBASE_AUTH_DOMAIN__|'$FIREBASE_AUTH_DOMAIN'|g" "$INDEX_FILE"
  sed -i.bak "s|window.__FIREBASE_PROJECT_ID__|'$FIREBASE_PROJECT_ID'|g" "$INDEX_FILE"
  sed -i.bak "s|window.__FIREBASE_STORAGE_BUCKET__|'$FIREBASE_STORAGE_BUCKET'|g" "$INDEX_FILE"
  sed -i.bak "s|window.__FIREBASE_MESSAGING_SENDER_ID__|'$FIREBASE_MESSAGING_SENDER_ID'|g" "$INDEX_FILE"
  sed -i.bak "s|window.__FIREBASE_APP_ID__|'$FIREBASE_APP_ID'|g" "$INDEX_FILE"
  rm -f "$INDEX_FILE.bak"
fi

echo "Build complete"
