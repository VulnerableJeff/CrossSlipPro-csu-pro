// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pct = x => `${(x*100).toFixed(1)}%`;

function americanToImplied(n){
  n = Number(String(n).replace(/\s+/g,''));
  if(!Number.isFinite(n) || n===0) return null;
  const A = Math.abs(n);
  const implied = n>0 ? 100/(A+100) : A/(A+100);
  const decimal = n>0 ? 1 + A/100 : 1 + 100/A;
  return { american:n, implied, decimal };
}
function product(arr){ return arr.reduce((a,b)=>a*b, arr.length?1:0); }
function devigTwoWay(a, b){
  const A = americanToImplied(a), B = americanToImplied(b);
  if(!A||!B) return null;
  const s = A.implied + B.implied;
  if(s<=0) return null;
  return { pA: A.implied/s, pB: B.implied/s };
}
function kelly(prob, decimal){
  const b = decimal - 1, p = prob, q = 1 - p;
  if(b<=0) return 0;
  return Math.max(0, Math.min(1, (b*p - q)/b));
}
function encodeShare(obj){
  const json = JSON.stringify(obj);
  const enc = btoa(unescape(encodeURIComponent(json)));
  return enc.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeShare(s){
  try{
    s = s.replace(/-/g,'+').replace(/_/g,'/'); const pad = s.length%4 ? '='.repeat(4-(s.length%4)) : '';
    return JSON.parse(decodeURIComponent(escape(atob(s+pad))));
  }catch{ return null; }
}

// ---------- State ----------
const state = {
  files: [], text: "",
  book: "", league: "", market: "", title: "",
  teams: [], odds: [], competitor: [],
  stake: 20, oddsKey: localStorage.getItem("CSP_ODDS_KEY") || ""
};
$("#oddsKey").value = state.oddsKey;

// ---------- Render ----------
function renderLists(){
  const render = (id, arr, placeholder) => {
    const ul = $(id); ul.innerHTML = "";
    arr.forEach((v,i)=>{
      const li = document.createElement("li");
      li.innerHTML = `<input class="input" value="${v}" placeholder="${placeholder}" />`;
      li.querySelector("input").addEventListener("input", e => { arr[i] = e.target.value; });
      ul.appendChild(li);
    });
  };
  render("#teams", state.teams, "Team or player");
  render("#odds", state.odds, "+145 / -110");
  render("#competitor", state.competitor, "Other book price");
}
function setParsed({book,league,market,teams,odds}){
  state.book = book || "Unknown";
  state.league = league || "Unknown";
  state.market = market || "Unknown";
  state.teams = teams || [];
  state.odds = odds || [];
  $("#book").value = state.book;
  $("#league").value = state.league;
  $("#market").value = state.market;
  $("#title").value = `${state.league} ${state.market}`.trim();
  state.title = $("#title").value;
  renderLists();
}

// ---------- OCR & Parsing ----------
async function runOCR(files){
  $("#status").textContent = "Running OCR…";
  const chunks = [];
  for(const f of files){
    const { data } = await Tesseract.recognize(f, "eng", {
      tessedit_char_whitelist: "+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/ ."
    });
    chunks.push(data.text || "");
  }
  $("#status").textContent = "OCR complete.";
  return chunks.join("\n---\n");
}
function detectBook(text){
  const marks = [
    ["FanDuel",/fanduel/i],["DraftKings",/draft\s?kings/i],["BetMGM",/bet\s?mgm/i],
    ["Caesars",/caesars/i],["Hard Rock",/hard\s?rock/i],["BetRivers",/betrivers/i],["PointsBet",/pointsbet/i]
  ];
  for(const [n,re] of marks){ if(re.test(text)) return n; }
  return "Unknown";
}
function parseSlip(text){
  // odds
  const odds = Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g)||[]).map(x=>x.replace(/\s+/g,'')))).slice(0,20);
  // props & totals
  const props = (text.match(/\b(Over|Under)\s?\d+(\.\d+)?/gi)||[]).slice(0,10);
  // leagues
  const league = /MLB/i.test(text)?"MLB":/NBA/i.test(text)?"NBA":/NFL|NCAAF/i.test(text)?"NFL":/NHL/i.test(text)?"NHL":/NCAAB/i.test(text)?"NCAAB":"Unknown";
  // market guess
  const market =
    /\bMoneyline\b|ML\b/i.test(text)?"Moneyline":
    /\bSpread\b|pts|point|handicap/i.test(text)?"Spread":
    /\bTotal\b|Over|Under/i.test(text)?"Total/Prop":
    props.length ? "Prop/Total" : "Unknown";
  // teams/players (simple proper nouns heuristic)
  const teams = Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)||[]))).slice(0,12);
  return { league, market, teams, odds };
}

// ---------- Insights / Math ----------
function analyze(){
  const legs = state.odds.map((o,i)=>{
    const you = americanToImplied(o);
    const comp = state.competitor[i] ? Number(state.competitor[i]) : null;
    let fair = null, edge = null;
    if(comp!==null && isFinite(comp)){
      const dv = devigTwoWay(Number(o), comp);
      if(dv){ fair = dv.pA; edge = fair - you.implied; }
    }
    return { who: state.teams[i] || `Leg ${i+1}`, ...you, fair, edge };
  }).filter(Boolean);

  const probs = legs.map(l => (l.fair ?? l.implied)).filter(Boolean);
  const pParlay = product(probs) || 0;
  const decParlay = legs.reduce((a,l)=>a*(l.decimal||1), legs.length?1:0);
  const stake = Number($("#stake").value || 0);
  const profit = stake * (decParlay - 1);
  const ev = pParlay*profit - (1-pParlay)*stake;
  const k = kelly(pParlay, decParlay);

  $("#pWin").textContent = pct(pParlay);
  $("#pDec").textContent = decParlay ? decParlay.toFixed(2) : "—";
  $("#pProfit").textContent = isFinite(profit) ? `$${profit.toFixed(2)}` : "—";
  $("#pEV").textContent = isFinite(ev) ? `$${ev.toFixed(2)}` : "—";
  $("#kellyHalf").value = `${((k/2)*100).toFixed(1)}%`;

  // AI-style tips
  const tips = [];
  legs.forEach(l=>{
    if(l.edge!==null){
      if(l.edge > 0.03) tips.push(`Value on ${l.who}: market-fair edge ${(l.edge*100).toFixed(1)}% ✅`);
      else if(l.edge < -0.03) tips.push(`Weak price on ${l.who}: negative edge ${(l.edge*100).toFixed(1)}% ❌`);
    }
  });
  if(decParlay>=2 && pParlay<0.5) tips.push("Risk/Reward: long odds with sub-50% win chance — consider smaller stake.");
  tips.push(ev>=0 ? `Positive EV overall: +$${ev.toFixed(2)} on $${stake}` : `Negative EV overall: -$${Math.abs(ev).toFixed(2)} — price shop or trim legs.`);

  // confidence
  let conf = Math.min(1, Math.max(0, (pParlay*0.6 + (legs.length? 0.4/legs.length : 0))));
  if(legs.some(l=>l.edge>0.05)) conf += 0.05;
  if(legs.some(l=>l.edge<-0.05)) conf -= 0.05;
  conf = Math.max(0, Math.min(1, conf));
  $("#confPct").textContent = pct(conf);
  $("#confBar").style.width = `${conf*100}%`;

  const ul = $("#insights"); ul.innerHTML = "";
  tips.slice(0,6).forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });

  return { legs, pParlay, decParlay, profit, ev, kellyHalf: k/2, conf };
}

// ---------- Live Market Lookup (The Odds API) ----------
async function fetchMarkets(){
  const key = state.oddsKey;
  if(!key){ $("#matchStatus").textContent = "Add your Odds API key in Settings."; return; }

  const sport = $("#sportKey").value.trim() || "basketball_nba";
  const region = $("#region").value.trim() || "us";
  const markets = $("#markets").value.trim() || "h2h,spreads,totals";

  $("#matchStatus").textContent = "Fetching markets…";
  try{
    const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?regions=${encodeURIComponent(region)}&markets=${encodeURIComponent(markets)}&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if(!res.ok){ throw new Error(`HTTP ${res.status}`); }
    const data = await res.json(); // array of events

    // naive matching: if any event title contains both team strings we have
    const teamsLower = state.teams.map(t=>t.toLowerCase());
    const candidates = data.filter(ev=>{
      const name = (ev.home_team + " " + ev.away_team).toLowerCase();
      return teamsLower.every(t => !t || name.includes(t));
    });

    const out = $("#marketOut"); out.innerHTML = "";
    const list = candidates.slice(0,3);
    if(list.length===0){ out.innerHTML = `<p class="muted sm">No clear match. Edit team names and try again.</p>`; $("#matchStatus").textContent=""; return; }

    list.forEach(ev=>{
      const card = document.createElement("div");
      card.className = "card mt";
      const when = ev.commence_time ? new Date(ev.commence_time).toLocaleString() : "TBD";
      card.innerHTML = `<b>${ev.home_team} vs ${ev.away_team}</b><br><span class="muted sm">${when}</span>`;
      // show a few book prices
      if(ev.bookmakers?.length){
        const bm = ev.bookmakers.slice(0,3).map(b => {
          const h2h = (b.markets||[]).find(m=>m.key==="h2h");
          const lines = h2h?.outcomes?.map(o=>`${o.name}: ${o.price>0?`+${o.price}`:o.price}`).join(" · ");
          return `<div class="muted sm">${b.title}: ${lines || "n/a"}</div>`;
        }).join("");
        card.insertAdjacentHTML("beforeend", `<div class="mt">${bm}</div>`);
      }
      out.appendChild(card);
    });
    $("#matchStatus").textContent = "Matched events shown below.";
  }catch(e){
    $("#matchStatus").textContent = `Fetch failed (${e.message}).`;
  }
}

// ---------- Share ----------
function genShare(){
  const payload = {
    title: $("#title").value.trim(),
    book: $("#book").value.trim(),
    league: $("#league").value.trim(),
    market: $("#market").value.trim(),
    teams: state.teams, odds: state.odds, competitor: state.competitor
  };
  const encoded = encodeShare(payload);
  const url = `${location.origin}${location.pathname}#${encoded}`;
  $("#shareOut").value = url;
}

// ---------- Restore ----------
(function restoreFromHash(){
  if(location.hash.length>1){
    const data = decodeShare(location.hash.slice(1));
    if(data){
      $("#book").value = state.book = data.book || "Unknown";
      $("#league").value = state.league = data.league || "Unknown";
      $("#market").value = state.market = data.market || "Unknown";
      $("#title").value = state.title = data.title || "";
      state.teams = data.teams || [];
      state.odds = data.odds || [];
      state.competitor = data.competitor || [];
      renderLists();
      analyze();
    }
  }
})();

// ---------- Events ----------
const drop = $("#drop"), file = $("#file"), pick = $("#pick"), thumbs = $("#thumbs");
pick.onclick = ()=> file.click();
file.onchange = e => handleFiles(e.target.files);
drop.ondragover = e => (e.preventDefault(), drop.classList.add("hover"));
drop.ondragleave = () => drop.classList.remove("hover");
drop.ondrop = e => { e.preventDefault(); drop.classList.remove("hover"); handleFiles(e.dataTransfer.files); };

function handleFiles(list){
  state.files = Array.from(list||[]);
  thumbs.innerHTML = "";
  state.files.forEach(f=>{
    const url = URL.createObjectURL(f);
    const img = document.createElement("img"); img.src = url; thumbs.appendChild(img);
  });
}

$("#analyzeBtn").onclick = async ()=>{
  if(!state.files.length){ $("#status").textContent = "Choose an image first."; return; }
  try{
    const text = await runOCR(state.files);
    state.text = text;
    const parsed = parseSlip(text);
    setParsed({ book: detectBook(text), ...parsed });
    analyze();
  }catch(e){
    $("#status").textContent = "OCR failed. You can fill fields manually.";
  }
};
$("#clearBtn").onclick = ()=>{
  state.files = []; thumbs.innerHTML = ""; state.text="";
  state.teams=[]; state.odds=[]; state.competitor=[];
  $("#status").textContent = ""; renderLists();
};

$("#book").oninput = e => state.book = e.target.value;
$("#league").oninput = e => state.league = e.target.value;
$("#market").oninput = e => state.market = e.target.value;
$("#title").oninput = e => state.title = e.target.value;

$("#addTeam").onclick = ()=>{ state.teams.push(""); renderLists(); };
$("#addOdds").onclick = ()=>{ state.odds.push("-110"); renderLists(); };
$("#addComp").onclick = ()=>{ state.competitor.push("-110"); renderLists(); };

$("#stake").oninput = ()=> analyze();
$("#shareBtn").onclick = ()=> genShare();
$("#modeBtn").onclick = ()=>{ document.body.classList.toggle("light"); };

$("#matchBtn").onclick = fetchMarkets;
$("#ppDate").textContent = new Date().toLocaleDateString();
$("#year").textContent = new Date().getFullYear();
$("#navHome").onclick = (e)=>{ e.preventDefault(); scrollTo({top:0,behavior:"smooth"}); };

// Settings
$("#settingsBtn").onclick = ()=> $("#settings").showModal();
$("#saveSettings").onclick = (e)=>{
  e.preventDefault();
  state.oddsKey = $("#oddsKey").value.trim();
  localStorage.setItem("CSP_ODDS_KEY", state.oddsKey || "");
  $("#settings").close();
};
