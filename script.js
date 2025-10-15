/* =========================
   CrossSlipPro — script.js
   ========================= */

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pct = x => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%`;
const currency = x => (Number.isFinite(+x) ? `$${(+x).toFixed(2)}` : "—");
const shortOdds = o => {
  const n = Number(String(o).trim());
  return Number.isFinite(n) ? (n > 0 ? `+${n}` : `${n}`) : "—";
};

function americanToImplied(n) {
  n = Number(String(n).replace(/\s+/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const A = Math.abs(n);
  const implied = n > 0 ? 100 / (A + 100) : A / (A + 100);
  const decimal = n > 0 ? 1 + A / 100 : 1 + 100 / A;
  return { american: n, implied, decimal };
}
function product(arr) { return arr.reduce((a, b) => a * b, arr.length ? 1 : 0); }
function devigTwoWay(a, b) {
  const A = americanToImplied(a), B = americanToImplied(b);
  if (!A || !B) return null;
  const s = A.implied + B.implied;
  if (s <= 0) return null;
  return { pA: A.implied / s, pB: B.implied / s };
}
function kelly(prob, decimal) {
  const b = decimal - 1, p = prob, q = 1 - p;
  if (b <= 0) return 0;
  return Math.max(0, Math.min(1, (b * p - q) / b));
}
function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const enc = btoa(unescape(encodeURIComponent(json)));
  return enc.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}
function decodeShare(s) {
  try {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
    return JSON.parse(decodeURIComponent(escape(atob(s + pad))));
  } catch { return null; }
}
function escapeHtml(s){ return String(s||"").replace(/[&<>"]/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;", '"':"&quot;" }[m])); }

/* ---------- State ---------- */
const state = {
  files: [], text: "",
  book: "", league: "", market: "", title: "",
  teams: [], odds: [], competitor: [],
  oddsKey: localStorage.getItem("CSP_ODDS_KEY") || ""
};

/* ---------- Render lists & parsed ---------- */
function renderLists() {
  const render = (id, arr, placeholder) => {
    const ul = $(id); if (!ul) return;
    ul.innerHTML = "";
    arr.forEach((v, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<input class="input" value="${escapeHtml(v)}" placeholder="${placeholder}" />`;
      li.querySelector("input").addEventListener("input", e => { arr[i] = e.target.value; });
      ul.appendChild(li);
    });
  };
  render("#teams", state.teams, "Team or player");
  render("#odds", state.odds, "+145 / -110");
  render("#competitor", state.competitor, "Other book price");
}

function setParsed({ book, league, market, teams, odds }) {
  state.book   = book   || "Unknown";
  state.league = league || "Unknown";
  state.market = market || "Unknown";
  state.teams  = teams  || [];
  state.odds   = odds   || [];
  $("#book").value   = state.book;
  $("#league").value = state.league;
  $("#market").value = state.market;
  $("#title").value  = `${state.league} ${state.market}`.trim();
  state.title = $("#title").value;
  renderLists();
}

/* ---------- OCR & Parsing ---------- */
async function runOCR(files) {
  $("#status").textContent = "Running OCR…";
  const chunks = [];
  for (const f of files) {
    const { data } = await Tesseract.recognize(f, "eng", {
      tessedit_char_whitelist: "+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/ ."
    });
    chunks.push(data.text || "");
  }
  $("#status").textContent = "OCR complete.";
  return chunks.join("\n---\n");
}
function detectBook(text) {
  const marks = [
    ["FanDuel", /fanduel/i], ["DraftKings", /draft\s?kings/i], ["BetMGM", /bet\s?mgm/i],
    ["Caesars", /caesars/i], ["Hard Rock", /hard\s?rock/i], ["BetRivers", /betrivers/i], ["PointsBet", /pointsbet/i]
  ];
  for (const [n, re] of marks) { if (re.test(text)) return n; }
  return "Unknown";
}
function parseSlip(text) {
  const odds = Array.from(new Set((text.match(/[+\-]\s?\d{2,4}/g) || [])
    .map(x => x.replace(/\s+/g, "")))).slice(0, 20);
  const props = (text.match(/\b(Over|Under)\s?\d+(\.\d+)?/gi) || []).slice(0, 10);
  const league =
    /MLB/i.test(text) ? "MLB" :
    /NBA/i.test(text) ? "NBA" :
    /NFL|NCAAF/i.test(text) ? "NFL" :
    /NHL/i.test(text) ? "NHL" :
    /NCAAB/i.test(text) ? "NCAAB" : "Unknown";
  const market =
    /\bMoneyline\b|ML\b/i.test(text) ? "Moneyline" :
    /\bSpread\b|pts|point|handicap/i.test(text) ? "Spread" :
    /\bTotal\b|Over|Under/i.test(text) ? "Total/Prop" :
    (props.length ? "Prop/Total" : "Unknown");
  const teams = Array.from(new Set((text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g) || []))).slice(0, 12);
  return { league, market, teams, odds };
}

/* ---------- Analysis (robust) ---------- */
function analyze() {
  const stake = Number($("#stake")?.value || 0);

  // Build legs safely
  const legs = (state.odds || []).map((o, i) => {
    const you = americanToImplied(o);
    if (!you) return null;
    const comp = state.competitor?.[i] ? Number(state.competitor[i]) : null;
    let fair = null, edge = null;
    if (Number.isFinite(comp)) {
      const dv = devigTwoWay(Number(o), comp);
      if (dv) { fair = dv.pA; edge = fair - you.implied; }
    }
    return { who: state.teams?.[i] || `Leg ${i + 1}`, ...you, fair, edge };
  }).filter(Boolean);

  // No valid legs → reset UI gently
  if (!legs.length) {
    setTotalsUI({ pParlay: 0, decParlay: 0, profit: NaN, ev: NaN, k: 0 });
    $("#confPct").textContent = "—";
    $("#confBar").style.width = "0%";
    $("#insights").innerHTML = "<li>Add at least one odds value to compute probabilities.</li>";
    return;
  }

  // Parlay metrics (use fair if available)
  const probs = legs.map(l => (l.fair ?? l.implied)).filter(Boolean);
  const pParlay = product(probs) || 0;
  const decParlay = legs.reduce((a, l) => a * (l.decimal || 1), legs.length ? 1 : 0);
  const profit = stake * (decParlay - 1);
  const ev = pParlay * profit - (1 - pParlay) * stake;
  const k = kelly(pParlay, decParlay);

  setTotalsUI({ pParlay, decParlay, profit, ev, k });

  // Insights (calmer)
  const tips = [];
  legs.forEach(l => {
    if (l.edge !== null) {
      if (l.edge > 0.03) tips.push(`Value on ${l.who}: edge ${(l.edge * 100).toFixed(1)}% ✅`);
      else if (l.edge < -0.03) tips.push(`Weak price on ${l.who}: edge ${(l.edge * 100).toFixed(1)}% ❌`);
    }
  });
  if (decParlay >= 2 && pParlay < 0.5) tips.push("Risk/Reward: long odds with sub-50% win chance — consider smaller stake.");
  tips.push(ev >= 0 ? `Positive EV overall: +${currency(ev)} on ${currency(stake)}` : `Negative EV overall: -${currency(Math.abs(ev))} — price shop or trim legs.`);

  // Confidence (smoother)
  let conf = Math.min(1, Math.max(0, (pParlay * 0.7 + Math.min(0.3, legs.filter(l => l.edge > 0).length * 0.05))));
  $("#confPct").textContent = pct(conf);
  $("#confBar").style.width = `${conf * 100}%`;

  const ul = $("#insights"); ul.innerHTML = "";
  tips.slice(0, 4).forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });

  return { legs, pParlay, decParlay, profit, ev, kellyHalf: k / 2, conf };
}

function setTotalsUI({ pParlay, decParlay, profit, ev, k }) {
  $("#pWin").textContent    = pParlay ? pct(pParlay) : "—";
  $("#pDec").textContent    = decParlay ? decParlay.toFixed(2) : "—";
  $("#pProfit").textContent = Number.isFinite(profit) ? currency(profit) : "—";
  $("#pEV").textContent     = Number.isFinite(ev) ? currency(ev) : "—";
  $("#kellyHalf").value     = `${((k / 2) * 100).toFixed(1)}%`;
}

/* ---------- Live Market Lookup (The Odds API) ---------- */
async function fetchMarkets() {
  const key = state.oddsKey;
  if (!key) { $("#matchStatus").textContent = "Add your Odds API key in Settings."; return; }

  const sport   = $("#sportKey")?.value.trim() || "basketball_nba";
  const region  = $("#region")?.value.trim() || "us";
  const markets = $("#markets")?.value.trim() || "h2h,spreads,totals";

  $("#matchStatus").textContent = "Fetching markets…";
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?regions=${encodeURIComponent(region)}&markets=${encodeURIComponent(markets)}&oddsFormat=american&apiKey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const teamsLower = state.teams.map(t => (t || "").toLowerCase()).filter(Boolean);
    const candidates = data.filter(ev => {
      const name = ((ev.home_team || "") + " " + (ev.away_team || "")).toLowerCase();
      return teamsLower.every(t => name.includes(t));
    });

    const out = $("#marketOut"); out.innerHTML = "";
    const list = candidates.slice(0, 3);
    if (!list.length) { out.innerHTML = `<p class="muted sm">No clear match. Edit team names and try again.</p>`; $("#matchStatus").textContent = ""; return; }

    list.forEach(ev => {
      const card = document.createElement("div");
      card.className = "card mt";
      const when = ev.commence_time ? new Date(ev.commence_time).toLocaleString() : "TBD";
      card.innerHTML = `<b>${escapeHtml(ev.home_team)} vs ${escapeHtml(ev.away_team)}</b><br><span class="muted sm">${when}</span>`;
      if (ev.bookmakers?.length) {
        const bm = ev.bookmakers.slice(0, 3).map(b => {
          const h2h = (b.markets || []).find(m => m.key === "h2h");
          const lines = h2h?.outcomes?.map(o => `${escapeHtml(o.name)}: ${shortOdds(o.price)}`).join(" · ");
          return `<div class="muted sm">${escapeHtml(b.title)}: ${lines || "n/a"}</div>`;
        }).join("");
        card.insertAdjacentHTML("beforeend", `<div class="mt">${bm}</div>`);
      }
      out.appendChild(card);
    });
    $("#matchStatus").textContent = "Matched events shown below.";
  } catch (e) {
    $("#matchStatus").textContent = `Fetch failed (${e.message}).`;
  }
}

/* ---------- Share link ---------- */
function genShare() {
  const payload = {
    title: ($("#title").value || "").trim(),
    book: ($("#book").value || "").trim(),
    league: ($("#league").value || "").trim(),
    market: ($("#market").value || "").trim(),
    teams: state.teams, odds: state.odds, competitor: state.competitor
  };
  const encoded = encodeShare(payload);
  const url = `${location.origin}${location.pathname}#${encoded}`;
  $("#shareOut").value = url;
}

/* ---------- Restore from hash ---------- */
(function restoreFromHash(){
  if (location.hash.length > 1) {
    const data = decodeShare(location.hash.slice(1));
    if (data) {
      $("#book").value   = state.book   = data.book   || "Unknown";
      $("#league").value = state.league = data.league || "Unknown";
      $("#market").value = state.market = data.market || "Unknown";
      $("#title").value  = state.title  = data.title  || "";
      state.teams = data.teams || [];
      state.odds  = data.odds  || [];
      state.competitor = data.competitor || [];
      renderLists();
      analyze();
    }
  }
})();

/* ---------- File handling ---------- */
const drop   = $("#drop"), file = $("#file"), pick = $("#pick"), thumbs = $("#thumbs");
if (pick && file) pick.onclick = () => file.click();
if (file) file.onchange = e => handleFiles(e.target.files);
if (drop){
  drop.ondragover  = e => (e.preventDefault(), drop.classList.add("hover"));
  drop.ondragleave = () => drop.classList.remove("hover");
  drop.ondrop      = e => { e.preventDefault(); drop.classList.remove("hover"); handleFiles(e.dataTransfer.files); };
}
function handleFiles(list) {
  state.files = Array.from(list || []);
  if (!thumbs) return;
  thumbs.innerHTML = "";
  state.files.forEach(f => {
    const url = URL.createObjectURL(f);
    const img = document.createElement("img");
    img.src = url; thumbs.appendChild(img);
  });
}

/* ---------- Share Image (html2canvas) ---------- */
let shareBlob = null, shareUrl = "";
function buildShareData(){
  const res = analyze(); // refresh metrics
  const legs = (state.odds || []).map((o,i)=>({
    who: state.teams?.[i] || `Leg ${i+1}`,
    odds: shortOdds(o),
    comp: state.competitor?.[i] ? shortOdds(state.competitor[i]) : "—"
  }));
  return {
    title: ($("#title").value || `${state.league} ${state.market}`).trim(),
    book: state.book || "Unknown",
    league: state.league || "Unknown",
    market: state.market || "Unknown",
    legs,
    kpis: {
      pWin: $("#pWin").textContent,
      pDec: $("#pDec").textContent,
      pProfit: $("#pProfit").textContent,
      pEV: $("#pEV").textContent,
      confPct: $("#confPct").textContent
    },
    conf: Number(($("#confPct").textContent || "0%").replace("%","")) / 100
  };
}
function renderShareCardDOM(data){
  const el = $("#shareCard");
  el.innerHTML = `
    <div class="sc-left">
      <div>
        <div class="sc-title">${escapeHtml(data.title)}</div>
        <div class="sc-meta">${escapeHtml(data.book)} · ${escapeHtml(data.league)} · ${escapeHtml(data.market)} · ${data.legs.length} leg(s)</div>
        <div class="sc-legs">
          ${data.legs.slice(0,6).map(l=>`
            <div class="leg">
              <div>${escapeHtml(l.who)}</div>
              <div>${l.odds}${l.comp !== "—" ? ` <span style="color:#98a2b3">/ ${l.comp}</span>` : ""}</div>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="sc-footer">
        <span class="sc-badge">Powered by CSU Predicts</span>
        <span>· Not betting advice</span>
      </div>
    </div>
    <div class="sc-right">
      <div class="sc-kpi"><div class="label">Win chance</div><div class="value">${data.kpis.pWin}</div></div>
      <div class="sc-kpi"><div class="label">Expected value</div><div class="value">${data.kpis.pEV}</div></div>
      <div class="sc-kpi"><div class="label">Decimal · Profit</div><div class="value">${data.kpis.pDec} · ${data.kpis.pProfit}</div></div>
      <div class="sc-kpi">
        <div class="label">Confidence</div>
        <div class="sc-meter"><div style="width:${(data.conf*100).toFixed(0)}%"></div></div>
        <div style="margin-top:6px">${data.kpis.confPct}</div>
      </div>
    </div>
  `;
  return el;
}
async function generateShareImage(){
  const genBtn = $("#genImgBtn"), cpyBtn = $("#copyImgBtn"), dlBtn = $("#downloadImgBtn");
  [genBtn, cpyBtn, dlBtn].forEach(b => b && (b.disabled = true));
  try {
    const data = buildShareData();
    const root = renderShareCardDOM(data);
    const canvas = await html2canvas(root, { backgroundColor: null, scale: 2, logging: false });
    await new Promise(res => {
      canvas.toBlob(b => {
        if (shareUrl) URL.revokeObjectURL(shareUrl);
        shareBlob = b;
        shareUrl = URL.createObjectURL(b);
        $("#shareImg").src = shareUrl;
        res();
      }, "image/png", 0.96);
    });
  } finally {
    if (cpyBtn) cpyBtn.disabled = !shareBlob;
    if (dlBtn)  dlBtn.disabled  = !shareBlob;
    if (genBtn) genBtn.disabled = false;
  }
}
async function copyShareImage(){
  try{
    if (!shareBlob) return;
    if (navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([ new ClipboardItem({ "image/png": shareBlob }) ]);
      alert("Image copied to clipboard ✅");
    } else {
      alert("Clipboard image not supported here. Use Download instead.");
    }
  }catch(e){ alert("Copy failed: " + e.message); }
}
function downloadShareImage(){
  if (!shareBlob) return;
  const a = document.createElement("a");
  a.href = shareUrl; a.download = "crossslippro-share.png";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Events & wiring ---------- */
$("#book")?.addEventListener("input",  e => state.book   = e.target.value);
$("#league")?.addEventListener("input",e => state.league = e.target.value);
$("#market")?.addEventListener("input",e => state.market = e.target.value);
$("#title")?.addEventListener("input", e => state.title  = e.target.value);

$("#addTeam")?.addEventListener("click", () => { state.teams.push(""); renderLists(); });
$("#addOdds")?.addEventListener("click", () => { state.odds.push("-110"); renderLists(); });
$("#addComp")?.addEventListener("click", () => { state.competitor.push("-110"); renderLists(); });

$("#stake")?.addEventListener("input", () => analyze());
$("#shareBtn")?.addEventListener("click", () => genShare());
$("#modeBtn")?.addEventListener("click", () => document.body.classList.toggle("light"));
$("#matchBtn")?.addEventListener("click", () => fetchMarkets());

$("#genImgBtn")?.addEventListener("click", () => generateShareImage());
$("#copyImgBtn")?.addEventListener("click", () => copyShareImage());
$("#downloadImgBtn")?.addEventListener("click", () => downloadShareImage());

$("#settingsBtn")?.addEventListener("click", () => $("#settings").showModal());
$("#saveSettings")?.addEventListener("click", (e) => {
  e.preventDefault();
  const key = $("#oddsKey").value.trim();
  state.oddsKey = key;
  localStorage.setItem("CSP_ODDS_KEY", key || "");
  $("#settings").close();
});

$("#ppDate") && ($("#ppDate").textContent = new Date().toLocaleDateString());
$("#year") && ($("#year").textContent = new Date().getFullYear());
$("#navHome")?.addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); });

/* ---------- Analyze button (robust) ---------- */
$("#analyzeBtn")?.addEventListener("click", async () => {
  if (!state.files.length) { $("#status").textContent = "Choose an image first."; return; }
  try {
    const text = await runOCR(state.files);
    state.text = text;
    const parsed = parseSlip(text);
    setParsed({ book: detectBook(text), ...parsed });
    if (!state.odds.length) {
      $("#status").textContent = "OCR finished. Add at least one odds value (e.g., -110, +145) to compute EV.";
      return;
    }
    analyze();
    $("#status").textContent = "Parsed. Review and adjust, then share.";
  } catch (e) {
    $("#status").textContent = "OCR failed. You can fill fields manually.";
  }
});

/* ---------- Clear flow ---------- */
$("#clearBtn")?.addEventListener("click", () => {
  state.files = []; if (thumbs) thumbs.innerHTML = ""; state.text = "";
  state.teams = []; state.odds = []; state.competitor = [];
  $("#status").textContent = ""; renderLists();
});
// ----- Simple / Pro mode -----
document.body.classList.add("simple");
$("#simpleModeBtn")?.addEventListener("click", ()=>{
  document.body.classList.add("simple");
  $("#simpleModeBtn").classList.replace("ghost","primary");
  $("#proModeBtn").classList.replace("primary","ghost");
  scrollTo({top:0,behavior:"smooth"});
});
$("#proModeBtn")?.addEventListener("click", ()=>{
  document.body.classList.remove("simple");
  $("#simpleModeBtn").classList.replace("primary","ghost");
  $("#proModeBtn").classList.replace("ghost","primary");
});

// After successful analyze → focus Summary card
function scrollToSummary(){
  const el = document.getElementById("card-summary");
  if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
}

// Hook into your analyze success path:
const _oldAnalyzeClick = $("#analyzeBtn")?.onclick;
if (_oldAnalyzeClick) {
  $("#analyzeBtn").onclick = async () => {
    await _oldAnalyzeClick();
    // if numbers are populated, jump to summary
    if (document.getElementById("pWin")?.textContent !== "—") scrollToSummary();
  };
     }
