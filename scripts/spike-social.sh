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
  # GHL answers POST /posts/list with 201, not 200 — saving only on 200 silently
  # skipped the fixture and the account-id harvest that reads it.
  if [ -n "$save" ] && [ "${status:0:1}" = "2" ]; then
    cp "$tmp" "$OUT/$save"; echo "--> saved $OUT/$save"
  fi
  rm -f "$tmp"; echo
}

echo "### Unknowns 1, 2, 5 — auth, accounts endpoint, version header"
for V in 2021-07-28 2021-04-15; do
  call "accounts" GET "/social-media-posting/$GHL_LOCATION_ID/accounts" "$V" "" "accounts.json"
done

# Contract confirmed by the 2026-08-21 422: skip/limit are NUMBER STRINGS and
# accountIds is rejected outright. Existing posts carry their accountIds, which
# is how account ids are obtained while the accounts endpoint is scope-blocked.
#
# GHL validates with NestJS class-validator (the 422 said "must be a number
# string"), so an invalid enum value makes it enumerate the valid ones. Cheaper
# than guessing which `type` exposes drafts.
echo '### Discovering the valid values for the type field'
call "type enum probe" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
  '{"type":"__invalid__","skip":"0","limit":"5"}'

echo "### Unknown 5 — list posts across every plausible type (also: harvest account ids)"
for T in recent scheduled draft published all; do
  call "list posts type=$T" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
    "{\"type\":\"$T\",\"skip\":\"0\",\"limit\":\"20\"}" "list-posts-$T.json"
done

# Unknown properties are rejected outright ("property accountIds should not
# exist"), so every filter field the implementation wants to send must be
# proven accepted rather than assumed.
echo '### Which filter fields does posts/list actually accept?'
call "probe status field" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
  '{"status":"draft","skip":"0","limit":"5"}'
call "probe date window" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
  '{"type":"all","fromDate":"2026-08-01T00:00:00Z","toDate":"2026-08-31T00:00:00Z","skip":"0","limit":"5"}'

echo "### list posts with no type at all"
call "list posts no type" POST "/social-media-posting/$GHL_LOCATION_ID/posts/list" "2021-07-28" \
  '{"skip":"0","limit":"20"}' "list-posts-notype.json"

echo "### Account ids seen across every list response"
python3 -c 'import glob, json, sys
rows = set()
for path in glob.glob(sys.argv[1] + "/list-posts*.json"):
    try:
        data = json.load(open(path))
    except Exception:
        continue
    posts = data.get("posts") or (data.get("results") or {}).get("posts") or []
    for p in posts:
        for a in (p.get("accountIds") or []):
            rows.add((a, p.get("platform", "?")))
print(json.dumps([{"id": i, "platform": pl} for i, pl in sorted(rows)], indent=2) if rows
      else "No accountIds found in any list response.\nIf you have NOT created a draft in the Social Planner UI yet, do that first.\nIf you HAVE, check the type enum probe above for the value that exposes drafts.")' "$OUT" || true

if [ "$CREATE_DRAFT" = "1" ]; then
  : "${ACCOUNT_ID:?set ACCOUNT_ID to an account id from the list-posts harvest above}"
  # Create rejects a post without one: "userId must be a string / should not be
  # empty". Any GHL user id in the location works; the harvested posts carry one
  # in createdBy if GHL_USER_ID is not to hand.
  : "${GHL_USER_ID:?set GHL_USER_ID (a GHL user id — see createdBy on any harvested post)}"
  echo "### Unknowns 3, 4 — external media URL + draft creation (WRITES to the live account)"
  call "create draft" POST "/social-media-posting/$GHL_LOCATION_ID/posts" "2021-07-28" \
    "{\"accountIds\":[\"$ACCOUNT_ID\"],\"userId\":\"$GHL_USER_ID\",\"type\":\"post\",\"status\":\"draft\",\"summary\":\"phase 0 spike — safe to delete\",\"media\":[{\"url\":\"https://picsum.photos/1080\"}]}" \
    "create-post.json"
  echo "Delete it with:"
  echo "  curl -X DELETE \"$BASE/social-media-posting/$GHL_LOCATION_ID/posts/<postId>\" -H \"Authorization: Bearer \$GHL_API_TOKEN\" -H \"Version: 2021-07-28\""
else
  echo "### Skipped draft creation. Re-run with --create-draft and ACCOUNT_ID=<id> for unknowns 3 and 4."
fi
