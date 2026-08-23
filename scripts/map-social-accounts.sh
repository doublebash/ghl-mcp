#!/usr/bin/env bash
# Determines which platform each connected account belongs to, without the UI.
#
# The accounts endpoint needs socialplanner/account.readonly, which private
# integrations are not offered. The per-platform OAuth endpoints are covered by
# socialplanner/oauth.readonly, which this token does have — so probing each
# account id against each platform maps them by response code.
#
#   GHL_API_TOKEN=pit-xxx GHL_LOCATION_ID=xxx bash scripts/map-social-accounts.sh
#
# Read-only: GETs only, nothing is created or modified.
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

# Account ids harvested from the posts/list sweep. Replace if yours differ.
ACCOUNTS=(
  "672026bf28227a4ad848c4c9_${GHL_LOCATION_ID}_110529568590140_page"
  "672026dafe29d73d8756928c_${GHL_LOCATION_ID}_17841456206520676"
  "6760e2080c50c90d8156bf54_${GHL_LOCATION_ID}_0005lhkjde6208eDRzn0iXr3IbEZ6JSu3Nd_profile"
  "6760e225ec34a09b7bbe13c3_${GHL_LOCATION_ID}_UCUUuWuvLIuWlmoztI1CdzBg_profile"
  "69aa04c797a83e5e07284156_${GHL_LOCATION_ID}_YruoyrmwoK_profile"
)

PLATFORMS=(facebook instagram linkedin tiktok youtube)

probe() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' -X GET "$url" \
    -H "Authorization: Bearer $GHL_API_TOKEN" \
    -H "Version: 2021-07-28" \
    -H "Accept: application/json"
}

echo "### Probing per-platform OAuth endpoints for each account"
echo "### A 2xx means that account exists on that platform. 401 = scope refused,"
echo "### 404 = wrong platform for this id. Anything else is noted as-is."
echo

for acct in "${ACCOUNTS[@]}"; do
  # The leading segment is GHL's own object id for the connection; the endpoints
  # may want that rather than the full composite, so both are tried.
  short="${acct%%_*}"
  echo "=== $acct"
  for plat in "${PLATFORMS[@]}"; do
    full_code="$(probe "$BASE/social-media-posting/oauth/$GHL_LOCATION_ID/$plat/accounts/$acct")"
    short_code="$(probe "$BASE/social-media-posting/oauth/$GHL_LOCATION_ID/$plat/accounts/$short")"
    printf '  %-10s full=%s short=%s\n' "$plat" "$full_code" "$short_code"
  done
  echo
done

echo "### Full body for any combination that returned 200 above:"
for acct in "${ACCOUNTS[@]}"; do
  short="${acct%%_*}"
  for plat in "${PLATFORMS[@]}"; do
    for id in "$acct" "$short"; do
      url="$BASE/social-media-posting/oauth/$GHL_LOCATION_ID/$plat/accounts/$id"
      code="$(probe "$url")"
      if [ "${code:0:1}" = "2" ]; then
        echo "--- $plat / $id"
        curl -sS -X GET "$url" -H "Authorization: Bearer $GHL_API_TOKEN" \
          -H "Version: 2021-07-28" -H "Accept: application/json" | head -c 1500
        echo
      fi
    done
  done
done
