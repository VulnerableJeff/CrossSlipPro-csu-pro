const $ = s => document.querySelector(s);
const product = arr => arr.reduce((a,b)=>a*b, arr.length?1:0);

function americanToImplied(n){
  n = Number(String(n).replace(/\s+/g,""));
  if(!Number.isFinite(n) || n===0) return null;
  const A = Math.abs(n);
  const implied = n>0 ? 100/(A+100) : A/(A+100);
  const decimal = n>0 ? 1 + A/100 : 1 + 100/A;
  return {american:n, implied, decimal};
}
function parseSlipText(text){
  const odds = Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g)||[]).map(s=>s.replace(/\s+/g,"")))).slice(0,12);
  const teams = Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)||[]))).slice(0,odds.length);
  return { odds, teams };
}

const SOURCES=[
  {name:"local", corePath:"./vendor/tesseract/tesseract-core.wasm.js", workerPath:"./vendor/tesseract/worker.min.js", langPath:"./vendor/tesseract/lang-data"},
  {name:"cdnjs", corePath:"https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract-core.wasm.js", workerPath:"https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/worker.min.js", langPath:"https://raw.githubusercontent.com/naptha/tessdata/main/4.0.0_best"},
  {name:"jsdelivr", corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js", workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js", langPath:"https://tessdata.projectnaptha.com/5"},
  {name:"unpkg", corePath:"https://unpkg.com/tesseract.js-core@5.1.0/tesseract-core.wasm.js", workerPath:"https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js", langPath:"https://tessdata.projectnaptha.com/5"}
];

async function headOK(url){
  try{ const r=await fetch(url,{method:"HEAD",cache:"no-store"}); return r.ok; }catch{ return false; }
}
async function chooseSource(){
  for(const s of SOURCES){
    const okW = await headOK(s.workerPath);
    const okC = await headOK(s.corePath);
    const okL = await headOK(`${s.langPath}/eng.traineddata.gz`);
    if(okW && okC && okL) return s;
  }
  return SOURCES[1];
}

function showLoader(on=true){
  const el=$("#loader");
  if(!el) return;
  if(on){ el.classList.remove("hidden"); el.setAttribute("aria-hidden","false"); }
  else  { el.classList.add("hidden"); el.setAttribute("aria-hidden","true"); }
}

async function runOCR(files){
  const status=$("#status"), diag=$("#diag");
  status.textContent="Running OCR…"; showLoader(true); diag.classList.add("hidden");
  const src = await chooseSource();
  if(src.name!=="local"){
    diag.classList.remove("hidden");
    diag.innerHTML=`Using <b>${src.name}</b> (local files not found).`;
  }
  const opts={ corePath:src.corePath, workerPath:src.workerPath, langPath:src.langPath, logger:m=>console.debug("[tesseract]",m) };
  const chunks=[];
  try{
    for(const f of files){ const {data}=await Tesseract.recognize(f,"eng",opts); chunks.push(data.text||""); }
  }catch(e){ console.error(e); status.textContent="OCR failed. Use “Paste text instead”."; showLoader(false); throw e; }
  status.textContent="OCR complete."; showLoader(false);
  return chunks.join("\\n---\\n");
}

function analyze(text){
  const stake = Number($("#stake").value || 20);
  const parsed = parseSlipText(text||"");
  const legs = parsed.odds.map(o=>americanToImplied(o)).filter(Boolean);
  const probs = legs.map(l=>l.implied);
  const p = product(probs)||0;
  const dec = legs.reduce((a,l)=>a*(l.decimal||1),1);
  const profit = stake*(dec-1);
  const ev = p*profit - (1-p)*stake;

  $("#kWin").textContent = `${(p*100).toFixed(1)}%`;
  $("#kProfit").textContent = Number.isFinite(profit)?`$${profit.toFixed(2)}`:"—";
  $("#kEV").textContent = Number.isFinite(ev)?`$${ev.toFixed(2)}`:"—";
  const conf = Math.min(1, Math.max(0, p*0.8)); $("#conf").textContent = `${(conf*100).toFixed(1)}%`; $("#bar").style.width = `${conf*100}%`;

  const insights=[];
  if(dec>=2 && p<0.5) insights.push("Long odds with sub-50% chance — consider smaller stake.");
  insights.push(ev>=0?`Positive EV overall: +$${ev.toFixed(2)}`:`Negative EV overall: -$${Math.abs(ev).toFixed(2)}`);
  $("#insights").innerHTML = insights.map(t=>`<li>${t}</li>`).join("");

  $("#resultCard").hidden=false;
  $("#resultCard").scrollIntoView({behavior:"smooth"});
}

// File handling
const drop=$("#drop"), picker=$("#file"), pickBtn=$("#pick"), thumbs=$("#thumbs");
pickBtn.addEventListener("click", ()=>picker.click());
picker.addEventListener("change", e=>handleFiles(e.target.files));
drop.addEventListener("dragover", e=>{e.preventDefault();});
drop.addEventListener("drop", e=>{e.preventDefault(); handleFiles(e.dataTransfer.files);});
function handleFiles(list){
  const files=Array.from(list||[]); window._files=files; thumbs.innerHTML="";
  files.forEach(f=>{ const url=URL.createObjectURL(f); const img=document.createElement("img"); img.src=url; thumbs.appendChild(img); });
}

// Buttons
$("#analyze").addEventListener("click", async ()=>{
  const status=$("#status"); const files=window._files||[];
  if(!files.length){ status.textContent="Choose an image first."; return; }
  try{
    const text=await runOCR(files);
    window._recognizedText=text; status.textContent="Done ✔";
    analyze(text);
  }catch(_e){}
});
$("#usePasted").addEventListener("click", e=>{
  e.preventDefault();
  const txt=($("#pasteText").value||"").trim();
  const status=$("#status"); if(!txt){ status.textContent="Paste text first."; return; }
  window._recognizedText=txt; status.textContent="Parsed ✔"; analyze(txt);
});
$("#clear").addEventListener("click", ()=>{
  thumbs.innerHTML=""; $("#status").textContent=""; $("#resultCard").hidden=true;
  window._files=[]; window._recognizedText="";
});

$("#year").textContent = new Date().getFullYear();
