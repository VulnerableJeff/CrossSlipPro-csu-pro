#!/usr/bin/env bash
set -e
mkdir -p vendor/tesseract/lang-data
echo "Downloading Tesseract worker/core/lang to vendor/tesseract ..."
curl -L -o vendor/tesseract/worker.min.js https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/worker.min.js
curl -L -o vendor/tesseract/tesseract-core.wasm.js https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract-core.wasm.js
curl -L -o vendor/tesseract/lang-data/eng.traineddata.gz https://raw.githubusercontent.com/naptha/tessdata/main/4.0.0_best/eng.traineddata.gz
echo "Done. Commit and push your changes."
