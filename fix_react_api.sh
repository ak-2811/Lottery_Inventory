#!/bin/bash
# fix_react_api.sh
# Replaces all hardcoded localhost API URLs with the production domain
# Run this BEFORE npm run build

set -e

REACT_DIR="/var/www/Lottery_Inventory/lottery-sste_main"
OLD_URL="http://127.0.0.1:8000/api"
NEW_URL="https://lottery.bright-core-solutions.com/api"

echo "🔧 Fixing hardcoded API URLs in React source..."

# Replace in all .jsx, .js, .ts, .tsx files
find "$REACT_DIR/src" -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" \) | while read file; do
    if grep -q "$OLD_URL" "$file"; then
        sed -i "s|$OLD_URL|$NEW_URL|g" "$file"
        echo "  ✅ Fixed: $file"
    fi
done

echo "✅ All API URLs updated to: $NEW_URL"