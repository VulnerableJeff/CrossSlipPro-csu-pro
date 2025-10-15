// Helpers
const $ = s => document.querySelector(s);
const pct = x => `${(Math.max(0, Math.min(1, x))*100).toFixed(1)}%`;
const currency = x => (Number.isFinite(+x) ? `$${(+x).toFixed(2)}` : "—");
const escapeHtml = s => String(s||"").replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));

// Odds math
function americanToImplied(n){
  n = Number(String(n).replace(/\s+/g,""));
  if(!Number.isFinite(n) || n===0) return null;
  const A = Math.abs(n);
  const implied = n>0 ? 100/(A+100) : A/(A+100);
  const decimal = n>0 ? 1 + A/100 : 1 + 100/A;
  return {american:n, implied, decimal};
}
const product = arr => arr.reduce((a,b)=>a*b, arr.length?1:0);
function devigTwoWay(a,b){
  const A = americanToImplied(a), B = americanToImplied(b);
  if(!A||!B) return null; const s=A.implied+B.implied; if(s<=0) return null;
  return {pA:A.implied/s, pB:B.implied/s};
}
function kelly(prob, decimal){ const b=decimal-1, p=prob, q=1-prob; if(b<=0) return 0; return Math.max(0, Math.min(1, (b*p - q)/b)); }

// State
const state = { files:[], text:"", book:"", league:"", market:"", title:"", teams:[], odds:[], competitor:[] };

// UI: Simple/Pro
document.body.classList.add("simple");
$("#simpleModeBtn")?.addEventListener("click", ()=>{ document.body.classList.add("simple"); $("#simpleModeBtn").classList.replace("ghost","primary"); $("#proModeBtn").classList.replace("primary","ghost"); });
$("#proModeBtn")?.addEventListener("click", ()=>{ document.body.classList.remove("simple"); $("#simpleModeBtn").classList.replace("primary","ghost"); $("#proModeBtn").classList.replace("ghost","primary"); });

// Reveal helper
function showSummary(){ const el=$("#card-summary"); if(el){ el.classList.add("show"); el.scrollIntoView({behavior:"smooth", block:"start"}); } }

// Parse slip (very lightweight)
function detectBook(text){
  const marks=[["FanDuel",/fanduel/i],["DraftKings",/draft\s?kings/i],["BetMGM",/bet\s?mgm/i],["Caesars",/caesars/i],["Hard Rock",/hard\s?rock/i],["BetRivers",/betrivers/i],["PointsBet",/pointsbet/i]];
  for(const [n,re] of marks){ if(re.test(text)) return n; } return "Unknown";
}
function parseSlip(text){
  const odds=Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g)||[]).map(x=>x.replace(/\s+/g,"")))).slice(0,20);
  const league=/MLB/i.test(text)?"MLB":/NBA/i.test(text)?"NBA":/NFL|NCAAF/i.test(text)?"NFL":/NHL/i.test(text)?"NHL":/NCAAB/i.test(text)?"NCAAB":"Unknown";
  const market=/\bMoneyline\b|ML\b/i.test(text)?"Moneyline":/\bSpread\b|pts|point|handicap/i.test(text)?"Spread":/\bTotal\b|Over|Under/i.test(text)?"Total/Prop":"Unknown";
  const teams=Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)||[]))).slice(0,12);
  return {league, market, teams, odds};
}

// Render minimal lists (Pro)
function renderLists(){
  const render=(id,arr,ph)=>{ const ul=$(id); if(!ul) return; ul.innerHTML=""; arr.forEach((v,i)=>{ const li=document.createElement("li"); li.innerHTML=`<input class="input" value="${escapeHtml(v)}" placeholder="${ph}">`; li.querySelector("input").addEventListener("input",e=>arr[i]=e.target.value); ul.appendChild(li); }); };
  render("#teams", state.teams, "Team or player");
  render("#odds", state.odds, "+145 / -110");
  render("#competitor", state.competitor, "Other book price");
}
function setParsed({book,league,market,teams,odds}){
  state.book=book||"Unknown"; state.league=league||"Unknown"; state.market=market||"Unknown";
  state.teams=teams||[]; state.odds=odds||[];
  renderLists();
}

// Analysis
function setTotalsUI({ pParlay, decParlay, profit, ev, k }){
  $("#pWin").textContent    = pParlay ? pct(pParlay) : "—";
  $("#pProfit").textContent = Number.isFinite(profit) ? `$${profit.toFixed(2)}` : "—";
  $("#pEV").textContent     = Number.isFinite(ev) ? `$${ev.toFixed(2)}` : "—";
}
function analyze(){
  const stake = Number($("#stake")?.value || 0);
  const legs = (state.odds||[]).map((o,i)=>{
    const you=americanToImplied(o); if(!you) return null;
    const comp = state.competitor?.[i] ? Number(state.competitor[i]) : null;
    let fair=null, edge=null;
    if(Number.isFinite(comp)){ const dv=devigTwoWay(Number(o),comp); if(dv){ fair=dv.pA; edge=fair-you.implied; } }
    return { who: state.teams?.[i] || `Leg ${i+1}`, ...you, fair, edge };
  }).filter(Boolean);

  if(!legs.length){
    setTotalsUI({pParlay:0, decParlay:0, profit:NaN, ev:NaN, k:0});
    $("#confPct").textContent="—"; $("#confBar").style.width="0%";
    $("#insights").innerHTML="<li>Add at least one odds value to compute probabilities.</li>";
    return;
  }

  const probs=legs.map(l=>(l.fair ?? l.implied)).filter(Boolean);
  const pParlay=product(probs) || 0;
  const decParlay=legs.reduce((a,l)=>a*(l.decimal||1),1);
  const profit=stake*(decParlay-1);
  const ev=pParlay*profit - (1-pParlay)*stake;
  const k=kelly(pParlay,decParlay);
  setTotalsUI({pParlay,decParlay,profit,ev,k});

  let conf=Math.min(1, Math.max(0, (pParlay*0.7 + Math.min(0.3, legs.filter(l=>l.edge>0).length*0.05))));
  $("#confPct").textContent=pct(conf);
  const bar=$("#confBar");
  bar.style.width=`${conf*100}%`;
  bar.className=""; bar.id="confBar";
  if(conf<0.40) bar.classList.add("conf-low"); else if(conf<0.70) bar.classList.add("conf-med"); else bar.classList.add("conf-high");
  if(conf>=0.80) bar.classList.add("conf-anim");

  const tips=[];
  legs.forEach(l=>{ if(l.edge!==null){ if(l.edge>0.03) tips.push(`Value on ${l.who}: edge ${(l.edge*100).toFixed(1)}% ✅`); else if(l.edge<-0.03) tips.push(`Weak price on ${l.who}: edge ${(l.edge*100).toFixed(1)}% ❌`); }});
  if(decParlay>=2 && pParlay<0.5) tips.push("Long odds with sub-50% win chance — consider smaller stake.");
  tips.push(ev>=0 ? `Positive EV overall: +$${ev.toFixed(2)} on $${stake}` : `Negative EV overall: -$${Math.abs(ev).toFixed(2)} — price shop or trim legs.`);
  const ul=$("#insights"); ul.innerHTML=""; tips.slice(0,4).forEach(t=>{ const li=document.createElement("li"); li.textContent=t; ul.appendChild(li); });
}

// OCR (local first, then CDN fallback)
const LOCAL_TESS = {
  corePath:  "./vendor/tesseract/tesseract-core.wasm.js",
  workerPath:"./vendor/tesseract/worker.min.js",
  langPath:  "./vendor/tesseract/lang-data",
  tessedit_char_whitelist: "+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/ .",
  logger: m => console.debug("[tesseract]", m)
};
const CDN_TESS = {
  corePath:  "https://unpkg.com/tesseract.js-core@5.0.0/dist/tesseract-core.wasm.js",
  workerPath:"https://unpkg.com/tesseract.js@5.1.0/dist/worker.min.js",
  langPath:  "https://tessdata.projectnaptha.com/5",
  tessedit_char_whitelist: "+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/ .",
  logger: m => console.debug("[tesseract]", m)
};

async function runOCR(files){
  const status=$("#status");
  status.textContent="Running OCR…";
  const chunks=[];
  const tryOpts = async (opts) => {
    for(const f of files){
      const {data}=await Tesseract.recognize(f,"eng",opts);
      chunks.push(data.text||"");
    }
  };
  try {
    // try local vendor first
    await tryOpts(LOCAL_TESS);
  } catch(e1){
    console.warn("Local OCR failed, falling back to CDN:", e1);
    try{
      await tryOpts(CDN_TESS);
    }catch(e2){
      console.error("CDN OCR failed", e2);
      status.textContent="OCR failed. Use 'Paste text instead'.";
      throw e2;
    }
  }
  status.textContent="OCR complete.";
  return chunks.join("\\n---\\n");
}

// File handling
const drop=$("#drop"), file=$("#file"), pick=$("#pick"), thumbs=$("#thumbs");
pick && (pick.onclick=()=>file.click());
file && (file.onchange=e=>handleFiles(e.target.files));
if(drop){
  drop.ondragover=e=>{e.preventDefault(); drop.classList.add("hover");};
  drop.ondragleave=()=>drop.classList.remove("hover");
  drop.ondrop=e=>{e.preventDefault(); drop.classList.remove("hover"); handleFiles(e.dataTransfer.files);};
}
function handleFiles(list){
  state.files=Array.from(list||[]);
  if(!thumbs) return; thumbs.innerHTML="";
  state.files.forEach(f=>{ const url=URL.createObjectURL(f); const img=document.createElement("img"); img.src=url; thumbs.appendChild(img); });
}

// Analyze click
$("#analyzeBtn")?.addEventListener("click", async ()=>{
  const out=$("#status");
  if(!state.files.length){ out.textContent="Choose an image first."; return; }
  try{
    const text=await runOCR(state.files);
    state.text=text;
    const parsed=parseSlip(text);
    setParsed({book:detectBook(text), ...parsed});
    if(!state.odds.length){ out.textContent="OCR finished. No odds detected — add manually in Pro mode."; showSummary(); return; }
    analyze(); out.textContent="Done ✔"; showSummary();
  }catch(e){ /* status already set */ }
});

// Paste-text fallback
$("#usePasted")?.addEventListener("click", e=>{
  e.preventDefault();
  const txt = ($("#pasteText")?.value || "").trim();
  const out=$("#status");
  if(!txt){ out.textContent="Paste text first."; return; }
  state.text=txt;
  const parsed=parseSlip(txt);
  setParsed({book:detectBook(txt), ...parsed});
  if(!state.odds.length){ out.textContent="Text loaded. Add at least one odds value (e.g., -110, +145)."; showSummary(); return; }
  analyze(); out.textContent="Parsed ✔"; showSummary();
});

// Clear
$("#clearBtn")?.addEventListener("click", ()=>{
  state.files=[]; if(thumbs) thumbs.innerHTML="";
  state.text=""; state.teams=[]; state.odds=[]; state.competitor=[];
  $("#status").textContent=""; $("#pWin").textContent="—"; $("#pEV").textContent="—"; $("#pProfit").textContent="—";
  $("#confPct").textContent="—"; $("#confBar").style.width="0%"; $("#insights").innerHTML="";
});

// year
$("#year") && ($("#year").textContent=new Date().getFullYear());
