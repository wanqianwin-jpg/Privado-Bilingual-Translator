#!/bin/bash
# pack.sh — 打包 Chrome 扩展，生成干净的 zip 供 CWS 上传
# 用法: bash scripts/pack.sh

set -e

OUT="privado-bilingual-translator.zip"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

# 删掉旧包
rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  icons/ \
  background/ \
  content/ \
  popup/ \
  options/ \
  _locales/ \
  -x "*.DS_Store" \
  -x "*__MACOSX*"

SIZE=$(du -sh "$OUT" | cut -f1)
echo ""
echo "✓ 打包完成: $OUT ($SIZE)"
echo ""
echo "上传地址: https://chrome.google.com/webstore/devconsole"
