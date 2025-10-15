// --- tiny helpers ---
const $ = s => document.querySelector(s);
const product = a => a.reduce((x,y)=>x*y, a.length?1:0);
const pct = x => `${(Math.max(0,Math.min(1,x))*100).toFixed(1)}%`;
const money = x => (Number.isFinite(+x) ? `$${(+x).toFixed(2)}` : "—");

// --- odds math ---
function americanToImplied(n){
  n = Number(String(n).replace(/\s+/g,""));
  if(!Number.isFinite(n) || n===0) return null;
  const A = Math.abs(n);
  return {
    american: n,
    implied:  n>0 ? 100/(A+100) : A/(A+100),
    decimal:  n>0 ? 1 + A/100   : 1 + 100/A
  };
}

// --- lightweight text parse (pull odds; rough teams) ---
function parseSlipText(text){
  const odds = Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g)||[]).map(s=>s.replace(/\s+/g,"")))).slice(0,12);
  const teams = Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)||[]))).slice(0,odds.length);
  return {odds, teams};
}

// --- show/hide loader (never leave it on if anything fails) ---
function showLoader(on=true){
  const el=$("#loader"); if(!el) return;
  if(on){ el.classList.remove("hidden"); el.setAttribute("aria-hidden","false"); }
  else  { el.classList.add("hidden");   el.setAttribute("aria-hidden","true"); }
}

// --- resilient HEAD with timeout (so we don't hang) ---
function headOK(url, timeoutMs=2500){
  return new Promise((resolve)=>{
    let done=false;
    const timer=setTimeout(()=>{ if(!done){ done=true; resolve(false); } }, timeoutMs);
    fetch(url, {method:"HEAD", cache:"no-store"}).then(r=>{
      if(!done){ done=true; clearTimeout(timer); resolve(!!r.ok); }
    }).catch(()=>{ if(!done){ done=true; clearTimeout(timer); resolve(false); } });
  });
}

// --- sources to try (order matters). Local first, then CDNs. ---
const SOURCES = [
  { name:"local",
    corePath:"./vendor/tesseract/tesseract-core.wasm.js",
    workerPath:"./vendor/tesseract/worker.min.js",
    langPath:"./vendor/tesseract/lang-data" },
  { name:"cdnjs",
    corePath:"https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract-core.wasm.js",
    workerPath:"https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/worker.min.js",
    langPath:"https://raw.githubusercontent.com/naptha/tessdata/main/4.0.0_best" },
  { name:"jsdelivr",
    corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js",
    workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js",
    langPath:"https://tessdata.projectnaptha.com/5" },
  { name:"unpkg",
    corePath:"https://unpkg.com/tesseract.js-core@5.1.0/tesseract-core.wasm.js",
    workerPath:"https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js",
    langPath:"https://tessdata.projectnaptha.com/5" },
];

// --- pick a source fast (parallel check with overall cap) ---
async function chooseSource(){
  // Check each source in parallel with small per-request timeouts
  const checks = await Promise.all(SOURCES.map(async s=>{
    const [w,c,l] = await Promise.all([
      headOK(s.workerPath, 2000),
      headOK(s.corePath,   2000),
      headOK(`${s.langPath}/eng.traineddata.gz`, 2000)
    ]).catch(()=>[false,false,false]);
    return {s, ok: w && c && l};
  }));

  // Prefer first OK in our priority list
  const found = checks.find(x=>x.ok);
  if(found) return found.s;

  // If none responded to HEAD (some CDNs block HEAD), default to cdnjs
  return SOURCES[1];
}

// --- OCR runner with bulletproof cleanup ---
async function runOCR(files){
  const status=$("#status"), diag=$("#diag");
  status.textContent="Running OCR…";
  showLoader(true);
  diag.classList.add("hidden");

  let src = null;
  try {
    src = await chooseSource();
    if(src.name!=="local"){
      diag.classList.remove("hidden");
      diag.innerHTML=`Using <b>${src.name}</b> (local OCR files not found or blocked).`;
    }

    const opts = {
      corePath:  src.corePath,
      workerPath:src.workerPath,
      langPath:  src.langPath,
      logger: m => console.debug("[tesseract]", m)
    };

    const chunks=[];
    for(const f of files){
      const { data } = await Tesseract.recognize(f, "eng", opts);
      chunks.push(data.text || "");
    }
    status.textContent="OCR complete.";
    return chunks.join("\n---\n");
  } catch (err){
    console.error("OCR error:", err);
    status.textContent="OCR failed. Use “Paste text instead”.";
    throw err;
  } finally {
    // ALWAYS hide loader so the UI never gets stuck
    showLoader(false);
  }
}

// --- analysis ---
function analyze(text){
  const {odds} = parseSlipText(text||"");
  const legs = odds.map(americanToImplied).filter(Boolean);
  const stake = Number($("#stake").value || 20);
  const p = product(legs.map(l=>l.implied)) || 0;
  const dec = legs.reduce((a,l)=>a*(l.decimal||1),1);
  const profit = stake*(dec-1);
  const ev = p*profit - (1-p)*stake;
  const conf = Math.min(1, Math.max(0, p*0.8));

  $("#kWin").textContent = pct(p);
  $("#kProfit").textContent = money(profit);
  $("#kEV").textContent = money(ev);
  $("#conf").textContent = pct(conf);
  $("#bar").style.width = `${conf*100}%`;

  const tips=[];
  if(dec>=2 && p<0.5) tips.push("Long odds with sub-50% chance — consider smaller stake.");
  tips.push(ev>=0 ? `Positive EV overall: +${money(ev)}` : `Negative EV overall: -${money(Math.abs(ev))}`);
  $("#insights").innerHTML = tips.map(t=>`<li>${t}</li>`).join("");

  $("#resultCard").hidden=false;
  $("#resultCard").scrollIntoView({behavior:"smooth"});
}

// --- file handling ---
const drop=$("#drop"), picker=$("#file"), pickBtn=$("#pick"), thumbs=$("#thumbs");
pickBtn.addEventListener("click", ()=>picker.click());
picker.addEventListener("change", e=>handleFiles(e.target.files));
drop.addEventListener("dragover", e=>{e.preventDefault();});
drop.addEventListener("drop", e=>{e.preventDefault(); handleFiles(e.dataTransfer.files);});
function handleFiles(list){
  const files=Array.from(list||[]);
  window._files = files;
  thumbs.innerHTML="";
  files.forEach(f=>{ const url=URL.createObjectURL(f); const img=document.createElement("img"); img.src=url; thumbs.appendChild(img); });
}

// --- actions ---
$("#analyze").addEventListener("click", async ()=>{
  const status=$("#status");
  const files=window._files||[];
  if(!files.length){ status.textContent="Choose an image first."; return; }
  try{
    const text = await runOCR(files);
    window._recognizedText = text;
    status.textContent = "Done ✔";
    analyze(text);
  }catch(_e){ /* message already shown by runOCR */ }
});

$("#usePasted").addEventListener("click", e=>{
  e.preventDefault();
  const txt = ($("#pasteText").value||"").trim();
  const status=$("#status");
  if(!txt){ status.textContent="Paste text first."; return; }
  window._recognizedText = txt;
  status.textContent = "Parsed ✔";
  analyze(txt);
});

$("#clear").addEventListener("click", ()=>{
  window._files=[]; window._recognizedText="";
  thumbs.innerHTML=""; $("#status").textContent="";
  $("#resultCard").hidden=true;
});

$("#year").textContent = new Date().getFullYear();
