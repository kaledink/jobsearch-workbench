#!/bin/sh
# 拼接源文件生成单页 index.html
cd "$(dirname "$0")/src"
cat a.js b.js c.js d.js > ../all.js && node --check ../all.js && { cat part1.html; echo '<script>'; cat ../all.js; echo '</script>'; } > ../index.html && rm ../all.js && echo built index.html
