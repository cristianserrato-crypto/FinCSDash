#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/project_inventory_and_organize.sh [options]

Options:
  --remote USER@HOST          SSH target, for example cristians@192.168.1.49.
  --remote-path PATH          Path to copy from the remote server.
  --source PATH               Local source folder to scan instead of pulling SSH.
  --backup-dir PATH           Where remote copy will be stored. Default: ./server-backups/<timestamp>.
  --organized-dir PATH        Destination for organized projects. Default: ./organized-projects.
  --mode copy|move|symlink    Organization action. Default: copy.
  --execute                   Apply organization. Without this, only writes inventory and plan.
  --include-heavy             Include dependency/build folders such as node_modules and vendor.
  --help                      Show this help.

Examples:
  scripts/project_inventory_and_organize.sh \
    --remote cristians@192.168.1.49 \
    --remote-path /home/cristians/fincsdash-backend-deploy

  scripts/project_inventory_and_organize.sh \
    --source ./server-backups/latest/fincsdash-backend-deploy \
    --organized-dir ./organized-projects \
    --execute
USAGE
}

timestamp="$(date +%Y%m%d-%H%M%S)"
remote=""
remote_path=""
source_path=""
backup_dir="./server-backups/${timestamp}"
organized_dir="./organized-projects"
mode="copy"
execute="false"
include_heavy="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      remote="${2:?Missing value for --remote}"
      shift 2
      ;;
    --remote-path)
      remote_path="${2:?Missing value for --remote-path}"
      shift 2
      ;;
    --source)
      source_path="${2:?Missing value for --source}"
      shift 2
      ;;
    --backup-dir)
      backup_dir="${2:?Missing value for --backup-dir}"
      shift 2
      ;;
    --organized-dir)
      organized_dir="${2:?Missing value for --organized-dir}"
      shift 2
      ;;
    --mode)
      mode="${2:?Missing value for --mode}"
      shift 2
      ;;
    --execute)
      execute="true"
      shift
      ;;
    --include-heavy)
      include_heavy="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$mode" != "copy" && "$mode" != "move" && "$mode" != "symlink" ]]; then
  echo "--mode must be copy, move, or symlink" >&2
  exit 2
fi

if [[ -z "$source_path" && -z "$remote" ]]; then
  echo "Provide either --source or --remote." >&2
  exit 2
fi

if [[ -n "$remote" && -z "$remote_path" ]]; then
  echo "Provide --remote-path when using --remote." >&2
  exit 2
fi

exclude_args=()
if [[ "$include_heavy" != "true" ]]; then
  exclude_args=(
    --exclude ".git/"
    --exclude "node_modules/"
    --exclude "vendor/"
    --exclude "__pycache__/"
    --exclude ".venv/"
    --exclude "venv/"
    --exclude "dist/"
    --exclude "build/"
    --exclude ".next/"
    --exclude ".cache/"
  )
fi

if [[ -n "$remote" ]]; then
  command -v rsync >/dev/null 2>&1 || { echo "rsync is required." >&2; exit 1; }
  mkdir -p "$backup_dir"
  source_name="$(basename "$remote_path")"
  source_path="${backup_dir}/${source_name}"
  echo "Copying ${remote}:${remote_path}/ -> ${source_path}/"
  rsync -aH --info=progress2 "${exclude_args[@]}" "${remote}:${remote_path}/" "${source_path}/"
fi

if [[ ! -d "$source_path" ]]; then
  echo "Source folder does not exist: $source_path" >&2
  exit 1
fi

mkdir -p "$organized_dir"
inventory="${organized_dir}/project-inventory-${timestamp}.csv"
plan="${organized_dir}/organization-plan-${timestamp}.sh"

category_for() {
  local dir="$1"
  if [[ -f "$dir/package.json" ]]; then
    echo "node-web"
  elif [[ -f "$dir/pyproject.toml" || -f "$dir/requirements.txt" || -f "$dir/app.py" || -f "$dir/manage.py" ]]; then
    echo "python"
  elif [[ -f "$dir/composer.json" ]]; then
    echo "php"
  elif [[ -f "$dir/go.mod" ]]; then
    echo "go"
  elif [[ -f "$dir/Cargo.toml" ]]; then
    echo "rust"
  elif [[ -f "$dir/docker-compose.yml" || -f "$dir/docker-compose.yaml" || -f "$dir/Dockerfile" ]]; then
    echo "docker"
  elif [[ -f "$dir/index.html" ]]; then
    echo "static-web"
  else
    echo "uncategorized"
  fi
}

has_project_marker() {
  local dir="$1"
  [[ -d "$dir/.git" ||
     -f "$dir/package.json" ||
     -f "$dir/pyproject.toml" ||
     -f "$dir/requirements.txt" ||
     -f "$dir/app.py" ||
     -f "$dir/manage.py" ||
     -f "$dir/composer.json" ||
     -f "$dir/go.mod" ||
     -f "$dir/Cargo.toml" ||
     -f "$dir/docker-compose.yml" ||
     -f "$dir/docker-compose.yaml" ||
     -f "$dir/Dockerfile" ||
     -f "$dir/index.html" ]]
}

safe_name() {
  basename "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-'
}

printf 'category,name,path\n' > "$inventory"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
} > "$plan"

mapfile -d '' candidates < <(
  find "$source_path" \
    \( -name .git -o -name node_modules -o -name vendor -o -name __pycache__ -o -name .venv -o -name venv \) -prune \
    -o -type d -print0
)

found=0
for dir in "${candidates[@]}"; do
  if ! has_project_marker "$dir"; then
    continue
  fi

  category="$(category_for "$dir")"
  name="$(safe_name "$dir")"
  target="${organized_dir}/${category}/${name}"
  printf '%s,%s,%s\n' "$category" "$name" "$dir" >> "$inventory"
  mkdir -p "${organized_dir}/${category}"

  case "$mode" in
    copy)
      printf 'mkdir -p %q\nrsync -a --delete %q/ %q/\n' "$(dirname "$target")" "$dir" "$target" >> "$plan"
      ;;
    move)
      printf 'mkdir -p %q\nmv %q %q\n' "$(dirname "$target")" "$dir" "$target" >> "$plan"
      ;;
    symlink)
      printf 'mkdir -p %q\nln -sfn %q %q\n' "$(dirname "$target")" "$dir" "$target" >> "$plan"
      ;;
  esac
  found=$((found + 1))
done

chmod +x "$plan"

echo "Inventory written: $inventory"
echo "Plan written:      $plan"
echo "Projects found:   $found"

if [[ "$execute" == "true" ]]; then
  echo "Applying organization plan with mode: $mode"
  bash "$plan"
else
  echo "Dry run only. Review the plan, then rerun with --execute to apply it."
fi
