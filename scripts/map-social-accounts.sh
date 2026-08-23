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

# Account ids are read from the gitignored spike fixtures, or from
# SOCIAL_ACCOUNT_IDS (comma-separated) — never hardcoded, so this file carries
# no one's account identifiers into a public repo.
if [ -n "${SOCIAL_ACCOUNT_IDS:-}" ]; then
  IFS=',' read -r -a ACCOUNTS <<< "$SOCIAL_ACCOUNT_IDS"
else
  mapfile -t ACCOUNTS < <(python3 -c '
import glob, json
ids = set()
for path in glob.glob("tests/fixtures/social/list-posts*.json"):
    try:
        data = json.load(open(path))
    except Exception:
        continue
    for post in (data.get("results") or {}).get("posts") or []:
        ids.update(post.get("accountIds") or [])
print("\n".join(sorted(ids)))
')
fi

if [ "${#ACCOUNTS[@]}" -eq 0 ]; then
  echo "No account ids found. Run scripts/spike-social.sh first, or set SOCIAL_ACCOUNT_IDS." >&2
  exit 1
fi

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
