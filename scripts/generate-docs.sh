#!/usr/bin/env bash
set -euo pipefail

echo "Generating TypeDoc API documentation..."
npx typedoc --entryPoints src --entryPointStrategy expand --out docs-api

echo "Building Starlight documentation site..."
cd docs && npm run build

echo "Documentation generated successfully!"
echo "  TypeDoc: ./docs-api/"
echo "  Starlight: ./docs/dist/"
