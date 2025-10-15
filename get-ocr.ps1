New-Item -ItemType Directory -Force -Path vendor/tesseract/lang-data | Out-Null
Invoke-WebRequest -Uri https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/worker.min.js -OutFile vendor/tesseract/worker.min.js
Invoke-WebRequest -Uri https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract-core.wasm.js -OutFile vendor/tesseract/tesseract-core.wasm.js
Invoke-WebRequest -Uri https://raw.githubusercontent.com/naptha/tessdata/main/4.0.0_best/eng.traineddata.gz -OutFile vendor/tesseract/lang-data/eng.traineddata.gz
Write-Host "Done. Commit and push your changes."
