#!/usr/bin/env bash
# Phase 0 spike — confirms Social Planner API shapes before implementation.
#
#   GHL_API_TOKEN=pit-xxx GHL_LOCATION_ID=xxx bash scripts/spike-social.sh
#   ACCOUNT_ID=<id> ... bash scripts/spike-social.sh --create-draft
#
# The default run is READ-ONLY. --create-draft writes one draft post to the live
# Social Planner and prints its id plus the command to delete it.
set -uo pipefail

if [ -f .dev.vars ]; then
  # shellcheck disable=SC1091
  set -a; . ./.dev.vars; set +a
fi

: "${GHL_API_TOKEN:?set GHL_API_TOKEN (inline or in .dev.vars)}"
: "${GHL_LOCATION_ID:?set GHL_LOCATION_ID (inline or in .dev.vars)}"

BASE="https://services.leadconnectorhq.com"
OUT="tests/fixtures/social"
mkdir -p "$OUT"

CREATE_DRAFT=0
[ "${1:-}" = "--create-draft" ] && CREATE_DRAFT=1

call() {
  local label="$1" method="$2" path="$3" version="$4" body="${5:-}" save="${6:-}"
  echo "=== $label — $method $path (Version: $version)"
  local tmp status
  tmp="$(mktemp)"
  if [ -n "$body" ]; then
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $GHL_API_TOKEN" -H "Version: $version" \
      -H "Accept: application/json" -H "Content-Type: application/json" -d "$body")"
  else
    status="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $GHL_API_TOKEN" -H "Version: $version" \
      -H "Accept: application/json")"
  fi
  echo "HTTP $status"
  python3 -m json.tool < "$tmp" 2>/dev/null | head -60 || head -c 2000 "$tmp"
  if [ -n "$save" ] && [ "$status" = "200" ]; then
    cp "$tmp" "$OUT/$save"; echo "--> saved $OUT/$save"
  fi
  rm -f "$tmp"; echo
}

echo "### Unknowns 1, 2, 5 — auth, accounts endpoint, version header"
for V in 2021-07-28 2021-04-15; do
  call "accounts" GET "/social-media-posting/$GHL_LOCATION_ID/accounts" "$V" "" "accounts.json"
done

echo "### Unknown 5 — list posts shape"
call "list posts" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
  '{"type":"recent","accountIds":[],"skip":0,"limit":5}' "list-posts.json"

if [ "$CREATE_DRAFT" = "1" ]; then
  : "${ACCOUNT_ID:?set ACCOUNT_ID to a facebook or linkedin id from the accounts response}"
  echo "### Unknowns 3, 4 — external media URL + draft creation (WRITES to the live account)"
  call "create draft" POST "/social-media-posting/$GHL_LOCATION_ID/posts" "2021-07-28" \
    "{\"accountIds\":[\"$ACCOUNT_ID\"],\"type\":\"post\",\"status\":\"draft\",\"summary\":\"phase 0 spike — safe to delete\",\"media\":[{\"url\":\"https://picsum.photos/1080\"}]}" \
    "create-post.json"
  echo "Delete it with:"
  echo "  curl -X DELETE \"$BASE/social-media-posting/$GHL_LOCATION_ID/posts/<postId>\" -H \"Authorization: Bearer \$GHL_API_TOKEN\" -H \"Version: 2021-07-28\""
else
  echo "### Skipped draft creation. Re-run with --create-draft and ACCOUNT_ID=<id> for unknowns 3 and 4."
fi
