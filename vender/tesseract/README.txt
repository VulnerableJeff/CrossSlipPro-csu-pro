Self-hosted Tesseract files (optional)
------------------------------------------------

If you want fully self-hosted OCR (no CDN), put these files here:

- vendor/tesseract/worker.min.js
  from: https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js

- vendor/tesseract/tesseract-core.wasm.js
  from: https://unpkg.com/tesseract.js-core@5.0.0/dist/tesseract-core.wasm.js

- vendor/tesseract/lang-data/eng.traineddata.gz
  from: https://tessdata.projectnaptha.com/5/eng.traineddata.gz

The app will try local files first. If missing, it falls back to CDN automatically.
