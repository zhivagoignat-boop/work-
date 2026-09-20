#!/usr/bin/env bash
# Собирает папку dist/ — то, что нужно выложить в интернет для Telegram Mini App.
# Личные данные (reports/, docs/) в неё НЕ попадают.
#
#   bash scripts/build-miniapp.sh
#   -> dist/  (перетащить на app.netlify.com/drop или залить на любой HTTPS-хостинг)

set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/assets

cp index.html sw.js manifest.webmanifest dist/
cp -r assets/. dist/assets/

# на всякий случай: ничего личного
rm -rf dist/reports dist/docs

for f in dist/assets/js/*.js dist/sw.js; do
  node --check "$f" >/dev/null || { echo "Ошибка синтаксиса в $f"; exit 1; }
done

echo "Готово. Папка dist/ собрана:"
find dist -type f | sort | sed 's/^/  /'
echo
echo "Размер: $(du -sh dist | cut -f1)"
echo "Дальше: перетащи папку dist на https://app.netlify.com/drop — получишь HTTPS-адрес для Telegram."
