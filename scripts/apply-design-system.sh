#!/bin/bash

# Batch update script to replace common class patterns with Gradient Futuristic styles

echo "🚀 Applying Gradient Futuristic design system..."

# Pages to update
PAGES=(
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/transactions/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/upload/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/accounts/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/review/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/settings/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/tagging/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/reconciliation/page.tsx"
  "/Users/roylevierez/.gemini/antigravity/playground/orbital-nadir/app/login/page.tsx"
)

for page in "${PAGES[@]}"; do
  if [ -f "$page" ]; then
    echo "  ✨ Updating: $page"
    
    # Replace common patterns
    sed -i '' 's/className="card /className="holo-card /g' "$page"
    sed -i '' 's/text-white"/text-[var(--text-bright)]"/g' "$page"
    sed -i '' 's/text-slate-/text-[var(--text-muted)] /g' "$page"
    sed -i '' 's/text-muted"/text-[var(--text-muted)]"/g' "$page"
    sed -i '' 's/border-white\/5/border-[var(--border-glass)]/g' "$page"
    sed -i '' 's/bg-white\/5/bg-[var(--bg-card)]/g' "$page"
    
  fi
done

echo "✅ Design system applied!"
