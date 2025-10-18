CrossSlipPro — Dark Mode + Spinner + Offline OCR
===================================================

This package includes a clean dark UI, loading spinner, and scripts to fetch
the three OCR files for local (offline) use.

Quick start (Termux/Linux/macOS)
--------------------------------
1) Upload all files to your GitHub repo root.
2) Run:
   bash get-ocr.sh
3) Commit & push.

Windows PowerShell
------------------
powershell -ExecutionPolicy Bypass -File .\get-ocr.ps1

Local OCR files downloaded to:
- vendor/tesseract/worker.min.js
- vendor/tesseract/tesseract-core.wasm.js
- vendor/tesseract/lang-data/eng.traineddata.gz

The app will try local files first; if missing it will automatically try CDNs.
