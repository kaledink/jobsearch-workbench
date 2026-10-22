#!/bin/sh
# 拼接源文件生成单页 index.html
cd "$(dirname "$0")/src"
set -eu
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cat a.js b.js c.js standalone.js github.js d.js > "$tmp"
node --check --input-type=commonjs < "$tmp"
{ cat part1.html; echo '<script>'; cat "$tmp"; echo '</script>'; } > ../index.html
echo built index.html
