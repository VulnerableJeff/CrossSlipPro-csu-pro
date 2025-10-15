const file=document.getElementById('file');
const analyzeBtn=document.getElementById('analyzeBtn');
const status=document.getElementById('status');
const result=document.getElementById('result');

const TESS_OPTS={
  corePath:'./vendor/tesseract/tesseract-core.wasm.js',
  workerPath:'./vendor/tesseract/worker.min.js',
  langPath:'./vendor/tesseract/lang-data'
};

async function runOCR(files){
  status.textContent='Running OCR...';
  const chunks=[];
  for(const f of files){
    try{
      const {data}=await Tesseract.recognize(f,'eng',TESS_OPTS);
      chunks.push(data.text||'');
    }catch(e){
      console.error(e);
      status.textContent='OCR failed. Try text paste option.';
    }
  }
  return chunks.join('\n---\n');
}

analyzeBtn.addEventListener('click',async()=>{
  if(!file.files.length){status.textContent='Choose a file first.';return;}
  const text=await runOCR(file.files);
  result.textContent=text||'No text detected.';
  status.textContent='Done.';
});