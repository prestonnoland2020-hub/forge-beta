#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

export_file=""
import_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      if [[ $# -lt 2 ]]; then
        echo "--file needs the path to one athlete export."
        exit 1
      fi
      export_file="$2"
      shift 2
      ;;
    *)
      import_args+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$export_file" ]]; then
  mapfile_supported=false
  if help mapfile >/dev/null 2>&1; then
    mapfile_supported=true
  fi

  if [[ "$mapfile_supported" == true ]]; then
    mapfile -t export_candidates < <(find /Users/mac/Downloads /Users/mac/Desktop -maxdepth 1 -type f \( -iname 'forge-*-legacy-*.txt' -o -iname 'forge-*-legacy-*.json' \) -print 2>/dev/null | sort)
  else
    export_candidates=()
    while IFS= read -r candidate; do
      export_candidates+=("$candidate")
    done < <(find /Users/mac/Downloads /Users/mac/Desktop -maxdepth 1 -type f \( -iname 'forge-*-legacy-*.txt' -o -iname 'forge-*-legacy-*.json' \) -print 2>/dev/null | sort)
  fi

  if [[ ${#export_candidates[@]} -eq 0 ]]; then
    echo "No Forge athlete export was found in Downloads or on the Desktop."
    echo "Download one export, or rerun with --file /absolute/path/to/export.json."
    exit 1
  fi

  if [[ ${#export_candidates[@]} -gt 1 ]]; then
    echo "More than one athlete export was found. Nothing was selected automatically:"
    printf '  %s\n' "${export_candidates[@]}"
    echo "Rerun with --file and the exact export you want to import."
    exit 1
  fi

  export_file="${export_candidates[0]}"
fi

if [[ ! -f "$export_file" ]]; then
  echo "Export file not found: $export_file"
  exit 1
fi

export_file="$(cd "$(dirname "$export_file")" && pwd)/$(basename "$export_file")"

supabase_url="$(sed -n 's/^VITE_SUPABASE_URL=//p' .env | head -1)"
if [[ -z "$supabase_url" ]]; then
  echo "The Supabase URL is missing from .env."
  exit 1
fi

athlete_name="$(node -e "const fs=require('fs'); const raw=fs.readFileSync(process.argv[1],'utf8'); const data=JSON.parse(raw); process.stdout.write(String(data.person || 'Unknown athlete'));" "$export_file" 2>/dev/null || true)"
if [[ -z "$athlete_name" || "$athlete_name" == "Unknown athlete" ]]; then
  echo "This file does not contain a valid athlete name. Nothing was imported."
  exit 1
fi

echo "Export found: $(basename "$export_file")"
echo "Athlete in export: $athlete_name"
read -r -p "Paste $athlete_name's Supabase User UID, then press Return: " owner_uid
read -r -s -p "Paste the Supabase service_role secret, then press Return: " service_key
echo

if [[ -z "$owner_uid" || -z "$service_key" ]]; then
  echo "UID and service-role secret are required. Nothing was imported."
  exit 1
fi

if [[ ! "$owner_uid" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
  echo "That does not look like a Supabase user UUID. Nothing was imported."
  exit 1
fi

commit_mode=false
for arg in "${import_args[@]}"; do
  if [[ "$arg" == "--commit" ]]; then
    commit_mode=true
    break
  fi
done

if [[ "$commit_mode" == true ]]; then
  read -r -p "Type IMPORT $athlete_name to write this export to that account: " confirmation
  if [[ "$confirmation" != "IMPORT $athlete_name" ]]; then
    echo "Confirmation did not match. Nothing was imported."
    exit 1
  fi
fi

SUPABASE_URL="$supabase_url" \
SUPABASE_SERVICE_ROLE_KEY="$service_key" \
node migration/import-legacy.mjs --file "$export_file" --owner "$owner_uid" "${import_args[@]}"

unset service_key SUPABASE_SERVICE_ROLE_KEY
