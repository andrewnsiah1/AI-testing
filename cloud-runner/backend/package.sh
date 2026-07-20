#!/bin/bash
# Package the backend Lambda for deployment (no Docker needed).
# Run this before `cdk deploy`.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR/package"

echo "📦 Packaging Lambda function..."

# Clean previous build
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Install dependencies into package directory
pip3 install -r "$SCRIPT_DIR/requirements.txt" \
  --target "$PACKAGE_DIR" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --quiet 2>/dev/null || \
pip3 install -r "$SCRIPT_DIR/requirements.txt" \
  --target "$PACKAGE_DIR" \
  --quiet

# Copy application code
cp -r "$SCRIPT_DIR/app" "$PACKAGE_DIR/app"

echo "✅ Package ready at: $PACKAGE_DIR"
echo "   Run 'cdk deploy' from the infra/ directory now."
