#!/usr/bin/env bash
# Phase 0 for social metrics — answers, against the live API, how much the
# Social Planner can report before any tool is built.
#
#   GHL_API_TOKEN=pit-xxx GHL_LOCATION_ID=xxx bash scripts/probe-stats.sh
#   (or put both in .dev.vars)
#
# READ-ONLY: the statistics call and posts/list are both POSTs, but neither
# creates or changes anything. Raw responses land in the gitignored
# tests/fixtures/social/ so no real identifiers reach the repo.
#
# Questions it answers:
#   S1  Does the token carry socialplanner/statistics.readonly?
#   S2  How far back does /statistics go (30d, 90d, 1y, 2y), and how is it grouped?
#   S3  Do published posts carry per-post `insights`, and for which platforms?
#   S4  Does posts/list include posts made outside GHL (source "native")?
#   S5  Are the documented `fromDate`, `toDate` and `accounts` list fields accepted?
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

# Sends one request, saves the body to $OUT/$name, and prints the status.
call() {
  local name="$1" method="$2" path="$3" body="${4:-}"
  local status
  status="$(curl -sS -o "$OUT/$name" -w '%{http_code}' -X "$method" "$BASE$path" \
    -H "Authorization: Bearer $GHL_API_TOKEN" -H "Version: 2021-07-28" \
    -H "Accept: application/json" -H "Content-Type: application/json" \
    ${body:+-d "$body"})"
  echo "$status"
}

iso_days_ago() { python3 -c "import datetime,sys;d=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=int(sys.argv[1]));print(d.strftime('%Y-%m-%dT00:00:00.000Z'))" "$1"; }

LIST_PATH="/social-media-posting/$GHL_LOCATION_ID/posts/list"

echo "### S3/S4 — published posts and their insights"
status="$(call list-published.json POST "$LIST_PATH" '{"type":"published","skip":"0","limit":"100"}')"
echo "posts/list type=published -> HTTP $status"
python3 - "$OUT/list-published.json" <<'PY'
import json, sys, collections
data = json.load(open(sys.argv[1]))
posts = (data.get("results") or {}).get("posts") or []
print(f"  {len(posts)} published posts returned, count={(data.get('results') or {}).get('count')}")
by_source = collections.Counter(p.get("source") for p in posts)
print(f"  sources: {dict(by_source)}")
with_ins = [p for p in posts if isinstance(p.get("insights"), dict)]
print(f"  posts with insights: {len(with_ins)}/{len(posts)}")
keys = collections.Counter(k for p in with_ins for k in p["insights"])
print(f"  insight keys seen: {dict(keys)}")
for p in posts[:8]:
    print(f"   - {p.get('publishedAt','?')[:10]} platform={p.get('platform')} type={p.get('type')} "
          f"source={p.get('source')} insights={p.get('insights')} link={'yes' if p.get('previewLink') else 'no'}")
dates = sorted(p.get("publishedAt") or "" for p in posts if p.get("publishedAt"))
if dates:
    print(f"  oldest published: {dates[0][:10]}  newest: {dates[-1][:10]}")
PY
echo

echo "### S5 — documented list filters"
FROM="$(iso_days_ago 365)"; TO="$(iso_days_ago 0)"
status="$(call list-dated.json POST "$LIST_PATH" "{\"type\":\"published\",\"skip\":\"0\",\"limit\":\"10\",\"fromDate\":\"$FROM\",\"toDate\":\"$TO\"}")"
echo "posts/list with fromDate/toDate -> HTTP $status"; [ "${status:0:1}" = "2" ] || head -c 400 "$OUT/list-dated.json"; echo

# Account ids: from SOCIAL_ACCOUNT_IDS, else harvested from every post we can see.
status="$(call list-all.json POST "$LIST_PATH" '{"skip":"0","limit":"100"}')"
if [ -n "${SOCIAL_ACCOUNT_IDS:-}" ]; then
  IDS_JSON="$(python3 -c 'import json,os;print(json.dumps(os.environ["SOCIAL_ACCOUNT_IDS"].split(",")))')"
else
  IDS_JSON="$(python3 - "$OUT/list-all.json" "$OUT/list-published.json" <<'PY'
import json, sys
ids = set()
for path in sys.argv[1:]:
    try:
        for p in (json.load(open(path)).get("results") or {}).get("posts") or []:
            ids.update(p.get("accountIds") or [])
    except Exception:
        pass
print(json.dumps(sorted(ids)))
PY
)"
fi
echo "account ids found: $(python3 -c 'import json,sys;print(len(json.loads(sys.argv[1])))' "$IDS_JSON")"

FIRST_ID="$(python3 -c 'import json,sys;l=json.loads(sys.argv[1]);print(l[0] if l else "")' "$IDS_JSON")"
if [ -n "$FIRST_ID" ]; then
  status="$(call list-accounts.json POST "$LIST_PATH" "{\"skip\":\"0\",\"limit\":\"10\",\"accounts\":\"$FIRST_ID\"}")"
  echo "posts/list with accounts filter -> HTTP $status"; [ "${status:0:1}" = "2" ] || head -c 400 "$OUT/list-accounts.json"; echo
fi
echo

echo "### S1/S2 — /statistics access and lookback"
STATS_PATH="/social-media-posting/statistics?locationId=$GHL_LOCATION_ID"
status="$(call stats-default.json POST "$STATS_PATH" "{\"profileIds\":$IDS_JSON}")"
echo "default (last 7 days) -> HTTP $status"
if [ "${status:0:1}" != "2" ]; then
  head -c 600 "$OUT/stats-default.json"; echo
  echo "Stopping: no statistics access. If this is 401, add socialplanner/statistics.readonly to the private integration."
  exit 0
fi

for DAYS in 30 90 365 730; do
  FROM="$(iso_days_ago "$DAYS")"; TO="$(iso_days_ago 1)"
  status="$(call "stats-${DAYS}d.json" POST "$STATS_PATH" \
    "{\"profileIds\":$IDS_JSON,\"currentRange\":{\"startDate\":\"$FROM\",\"endDate\":\"$TO\"}}")"
  echo "${DAYS}d -> HTTP $status"
  python3 - "$OUT/stats-${DAYS}d.json" <<'PY'
import json, sys
try:
    r = json.load(open(sys.argv[1])).get("results") or {}
except Exception as e:
    print(f"  unreadable: {e}"); sys.exit()
days = r.get("dayRange") or []
print(f"  grouping={r.get('grouping')} buckets={len(days)} first={days[:1]} last={days[-1:]}")
print(f"  totals={r.get('totals')}")
pt = r.get("platformTotals") or {}
for metric in ("followers", "impressions", "likes"):
    print(f"  {metric} by platform: { {k: v.get('total') for k, v in (pt.get(metric) or {}).items()} }")
PY
done

echo
echo "Raw responses: $OUT/ (gitignored)"
