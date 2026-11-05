#!/bin/bash
# PostToolUse hook: formats a frontend file with Prettier right after Claude edits it.
#
# Claude Code passes the tool call as JSON on stdin; the edited file is in
# .tool_input.file_path. Only files under client/src are formatted, using the
# Prettier version and config (.prettierrc.json) from the client package.
# The hook never fails the tool call: errors are swallowed and it exits 0.

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

CLIENT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/client"

case "$FILE" in
  "$CLIENT_DIR"/src/*.vue|"$CLIENT_DIR"/src/*.js|"$CLIENT_DIR"/src/*.css) ;;
  *) exit 0 ;;
esac

[ -f "$FILE" ] || exit 0

# --no-install: use the project's Prettier, never download one on the fly.
cd "$CLIENT_DIR" && npx --no-install prettier --write "$FILE" >/dev/null 2>&1
exit 0
