set -euo pipefail

if [[ ! -f "$MIGRATION_PATH" ]]; then
  echo "Migration file not found: $MIGRATION_PATH" >&2
  exit 1
fi

sql=$(cat "$MIGRATION_PATH")
payload=$(jq -n --arg sql "$sql" '{sql:$sql}')
response=$(curl -sS -f -X POST "${WORKER_URL%/}/api/parse" \
  -H "content-type: application/json" \
  --data "$payload")

echo "$response" | jq .

if [[ -z "${GITHUB_EVENT_PATH:-}" || -z "${GH_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || -z "${GITHUB_API_URL:-}" ]]; then
  exit 0
fi

pr=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH")
if [[ -z "$pr" ]]; then
  exit 0
fi

body=$(printf '### Lockstep\n`%s`\n\n```json\n%s\n```\n' "$MIGRATION_PATH" "$response")
jq -n --arg body "$body" '{body:$body}' | curl -sS -f -X POST \
  -H "authorization: Bearer $GH_TOKEN" \
  -H "accept: application/vnd.github+json" \
  -H "content-type: application/json" \
  --data @- \
  "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/issues/$pr/comments" \
  >/dev/null
