#!/usr/bin/env bash
set -e
mkdir -p vendor/tesseract/lang-data
echo "[1/4] tesseract.min.js"
curl -L -o vendor/tesseract/tesseract.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js
echo "[2/4] worker.min.js"
curl -L -o vendor/tesseract/worker.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/worker.min.js
echo "[3/4] tesseract-core.wasm.js"
curl -L -o vendor/tesseract/tesseract-core.wasm.js \
  https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract-core.wasm.js
echo "[4/4] eng.traineddata.gz"
curl -L -o vendor/tesseract/lang-data/eng.traineddata.gz \
  https://raw.githubusercontent.com/naptha/tessdata/main/4.0.0_best/eng.traineddata.gz
echo "Done. git add/commit/push these files."

