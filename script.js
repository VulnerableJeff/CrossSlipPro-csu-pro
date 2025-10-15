// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const pct = x => `${(Math.max(0,Math.min(1,x))*100).toFixed(1)}%`;
const currency = x => Number.isFinite(+x) ? `$${(+x).toFixed(2)}` : "—";
const product = arr => arr.reduce((a,b)=>a*b, arr.length?1:0);

// ---------- odds math ----------
function americanToImplied(n){
  n = Number(String(n).replace(/\s+/g,""));
  if(!Number.isFinite(n) || n===0) return null;
  const A = Math.abs(n);
  const implied = n>0 ? 100/(A+100) : A/(A+100);
  const decimal = n>0 ? 1 + A/100 : 1 + 100/A;
  return {american:n, implied, decimal};
}
function devigTwoWay(a,b){
  const A = americanToImplied(a), B = americanToImplied(b);
  if(!A||!B) return null; const s=A.implied+B.implied; if(s<=0) return null;
  return {pA:A.implied/s, pB:B.implied/s};
}
function kelly(prob, dec){ const b=dec-1, p=prob, q=1-prob; if(b<=0) return 0; return Math.max(0,Math.min(1,(b*p-q)/b)); }

// ---------- state ----------
const S = { files:[], text:"", odds:[], teams:[], competitor:[] };

// ---------- super simple parsing ----------
function parseSlipText(text){
  const odds = Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g)||[]).map(s=>s.replace(/\s+/g,"")))).slice(0,12);
  const teams = Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)||[]))).slice(0,odds.length);
  return { odds, teams };
}

// ---------- OCR config (self-host first, then CDN) ----------
const LOCAL = {
  corePath:  "./vendor/tesseract/tesseract-core.wasm.js",
  workerPath:"./vendor/tesseract/worker.min.js",
  langPath:  "./vendor/tesseract/lang-data",
  logger: m => console.debug("[tesseract]", m)
};
const CDN = {
  corePath:  "https://unpkg.com/tesseract.js-core@5.0.0/dist/tesseract-core.wasm.js",
  workerPath:"https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js",
  langPath:  "https://tessdata.projectnaptha.com/5",
  logger: m => console.debug("[tesseract]", m)
};

async function fileExists(url){
  try{
    const r = await fetch(url, { method:"HEAD", cache:"no-store" });
    return r.ok;
  }catch{ return false; }
}

async function runOCR(files){
  const status = $("#status"), diag=$("#diag");
  status.textContent = "Running OCR…";
  diag.classList.add("hidden");
  const chunks = [];

  // check local first
  const localOk = await Promise.all([
    fileExists(LOCAL.workerPath),
    fileExists(LOCAL.corePath),
    fileExists(`${LOCAL.langPath}/eng.traineddata.gz`)
  ]);

  const useLocal = localOk.every(Boolean);
  const OPTS = useLocal ? LOCAL : CDN;

  if(!useLocal){
    diag.classList.remove("hidden");
    diag.innerHTML = `
      <b>OCR notice:</b> Using CDN because local files missing.<br>
      Missing locally:
      <ul>
        ${!localOk[0] ? "<li>vendor/tesseract/worker.min.js</li>" : ""}
        ${!localOk[1] ? "<li>vendor/tesseract/tesseract-core.wasm.js</li>" : ""}
        ${!localOk[2] ? "<li>vendor/tesseract/lang-data/eng.traineddata.gz</li>" : ""}
      </ul>`;
  }

  try{
    for(const f of files){
      const { data } = await Tesseract.recognize(f, "eng", OPTS);
      chunks.push(data.text || "");
    }
  }catch(err){
    console.error("OCR failed:", err);
    status.textContent = "OCR failed. Use “Paste text instead”.";
    throw err;
  }

  status.textContent = "OCR complete.";
  return chunks.join("\n---\n");
}

// ---------- analysis ----------
function analyze(){
  const stake = Number($("#stake").value || 0);
  const legs = S.odds.map((o,i)=>{
    const you = americanToImplied(o);
    if(!you) return null;
    const comp = S.competitor[i] ? Number(S.competitor[i]) : null;
    let fair = null, edge = null;
    if(Number.isFinite(comp)){ const dv = devigTwoWay(Number(o), comp); if(dv){ fair=dv.pA; edge=fair-you.implied; } }
    return { who:S.teams[i] || `Leg ${i+1}`, ...you, fair, edge };
  }).filter(Boolean);

  const probs = legs.map(l => (l.fair ?? l.implied)).filter(Boolean);
  const p = product(probs) || 0;
  const dec = legs.reduce((a,l)=>a*(l.decimal||1),1);
  const profit = stake*(dec-1);
  const ev = p*profit - (1-p)*stake;

  $("#kWin").textContent = pct(p);
  $("#kProfit").textContent = currency(profit);
  $("#kEV").textContent = currency(ev);

  let conf = Math.min(1, Math.max(0, p*0.7 + Math.min(0.3, legs.filter(l=>l.edge>0).length*0.05)));
  $("#conf").textContent = pct(conf);
  $("#bar").style.width = `${conf*100}%`;

  const tips = [];
  legs.forEach(l => {
    if(l.edge !== null){
      if(l.edge > 0.03) tips.push(`Value on ${l.who}: ${(l.edge*100).toFixed(1)}% ✅`);
      else if(l.edge < -0.03) tips.push(`Weak price on ${l.who}: ${(l.edge*100).toFixed(1)}% ❌`);
    }
  });
  if(dec >= 2 && p < 0.5) tips.push("Long odds with sub-50% win chance — consider smaller stake.");
  tips.push(ev >= 0 ? `Positive EV overall: +${currency(ev)} on ${currency(stake)}` : `Negative EV overall: -${currency(Math.abs(ev))} — price shop or trim legs.`);
  $("#insights").innerHTML = tips.slice(0,4).map(t=>`<li>${t}</li>`).join("");

  $("#resultCard").hidden = false;
  $("#resultCard").scrollIntoView({behavior:"smooth", block:"start"});
}

// ---------- file handlers ----------
const drop = $("#drop"), picker = $("#file"), pickBtn = $("#pick"), thumbs = $("#thumbs");
pickBtn.addEventListener("click", ()=>picker.click());
picker.addEventListener("change", e => handleFiles(e.target.files));

drop.addEventListener("dragover", e=>{e.preventDefault();});
drop.addEventListener("drop", e=>{e.preventDefault(); handleFiles(e.dataTransfer.files);});

function handleFiles(list){
  S.files = Array.from(list||[]);
  thumbs.innerHTML = "";
  S.files.forEach(f => {
    const url = URL.createObjectURL(f);
    const img = document.createElement("img");
    img.src = url; thumbs.appendChild(img);
  });
}

// ---------- buttons ----------
$("#analyze").addEventListener("click", async ()=>{
  const status = $("#status");
  if(!S.files.length){ status.textContent="Choose an image first."; return; }
  try{
    const text = await runOCR(S.files);
    const parsed = parseSlipText(text);
    S.text = text; S.odds = parsed.odds; S.teams = parsed.teams;
    if(!S.odds.length){ status.textContent="OCR finished, but no odds found. Paste manually."; return; }
    status.textContent = "Done ✔"; analyze();
  }catch(_e){ /* message already shown */ }
});

$("#usePasted").addEventListener("click",(e)=>{
  e.preventDefault();
  const txt = ($("#pasteText").value || "").trim();
  const status = $("#status");
  if(!txt){ status.textContent="Paste text first."; return; }
  const parsed = parseSlipText(txt);
  S.text = txt; S.odds = parsed.odds; S.teams = parsed.teams;
  if(!S.odds.length){ status.textContent="No odds detected. Include +145 / -110 etc."; return; }
  status.textContent = "Parsed ✔"; analyze();
});

$("#clear").addEventListener("click", ()=>{
  S.files=[]; S.text=""; S.odds=[]; S.teams=[]; S.competitor=[];
  thumbs.innerHTML=""; $("#status").textContent="";
  $("#resultCard").hidden = true;
});

// misc
$("#year").textContent = new Date().getFullYear();
