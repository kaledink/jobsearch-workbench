#!/bin/sh
# 拼接源文件生成单页 index.html
cd "$(dirname "$0")/src"
set -eu
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cat a.js > "$tmp"
printf '\nconst PRIORITY_COMPANIES = ' >> "$tmp"
node -e 'const r=require("../../recruitment/priority_companies.json"); if(r.length!==100 || r.some((g,i)=>g.number!==i+1)) throw Error("Invalid priority-company numbering"); process.stdout.write(JSON.stringify(r));' >> "$tmp"
printf ';\n' >> "$tmp"
cat priority.js b.js c.js standalone.js github.js d.js >> "$tmp"
node --check --input-type=commonjs < "$tmp"
{ cat part1.html; echo '<script>'; cat "$tmp"; echo '</script>'; } > ../index.html
echo built index.html
