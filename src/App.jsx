
import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * SlipScan – GitHub Pages FIX
 * - Uses import.meta.env.BASE_URL for correct paths under /<repo>/
 * - Logo & Home link honor BASE
 */
const BASE = (typeof import !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : "/";
const PUBLIC_LOGO = BASE + "slipscan-logo.png"; // put file in /public

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const bytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const americanToProb = (odds) => (odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100));
const ODDS_RE = /([+\-]\s?\d{2,4})/;
const LS_KEY = "slipscan_results_v1";

async function tryOCR(fileOrBlob) {
  try {
    const mod = await import("tesseract.js");
    const Tesseract = mod.default || mod;
    const { data } = await Tesseract.recognize(fileOrBlob, "eng");
    return data?.text || "";
  } catch {
    return "";
  }
}

function parseImpliedFromText(text) {
  const m = text.match(ODDS_RE);
  if (!m) return null;
  const num = Number(m[0].replace(/\s/g, ""));
  if (Number.isNaN(num)) return null;
  return americanToProb(num);
}

function adjustProb(base, aWin = 0.5, bWin = 0.5, aMargin = 0, bMargin = 0, aInj = 0, bInj = 0) {
  if (base == null) return null;
  const formDelta = (aWin - bWin) * 0.10;
  const marginDelta = Math.max(-0.04, Math.min(0.04, (aMargin - bMargin) * 0.003));
  const injuryDelta = -0.01 * (aInj - bInj);
  return clamp01(base + formDelta + marginDelta + injuryDelta);
}

const Ring = ({ value = 0, size = 64, stroke = 8, color = "#22c55e" }) => {
  const pct = clamp01(value);
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} aria-label="confidence" style={{display:'block'}}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#e5e7eb" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={(1 - pct) * c} transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{fontWeight:800,fontSize:12,fill:'#0f172a'}}>{Math.round(pct*100)}%</text>
    </svg>
  );
};

export default function App() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState({});
  const [imgUrl, setImgUrl] = useState("");
  const [logoOk, setLogoOk] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setResults(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(results)); } catch {}
  }, [results]);

  const onFiles = useCallback(async (incoming) => {
    const list = Array.from(incoming || []).slice(0, 8);
    if (list.length === 0) return;
    setFiles((prev) => [...prev, ...list]);
    for (const f of list) await analyzeOne(f);
  }, []);

  async function analyzeOne(file) {
    const text = await tryOCR(file);
    const base = parseImpliedFromText(text) ?? 0.56;
    setResults((r) => {
      const cur = r[file.name] || { aWin:.5,bWin:.5,aFor:0,aAg:0,bFor:0,bAg:0,aInj:0,bInj:0 };
      const model = adjustProb(base, cur.aWin, cur.bWin, cur.aFor-cur.aAg, cur.bFor-cur.bAg, cur.aInj, cur.bInj);
      return { ...r, [file.name]: { ...cur, base, model } };
    });
  }

  const onDrop = (e) => { e.preventDefault(); onFiles(e.dataTransfer?.files); };

  async function addFromUrl() {
    if (!imgUrl) return;
    try {
      const res = await fetch(imgUrl, { mode: "cors" });
      const blob = await res.blob();
      const f = new File([blob], imgUrl.split("/").pop() || "slip.png");
      await onFiles([f]);
      setImgUrl("");
    } catch { alert("Could not fetch that image."); }
  }

  function updateField(name, field, value) {
    setResults((r) => {
      const cur = r[name]; if (!cur) return r;
      const next = { ...cur, [field]: value };
      const model = adjustProb(next.base ?? 0.56, next.aWin, next.bWin, next.aFor-next.aAg, next.bFor-next.bAg, next.aInj, next.bInj);
      return { ...r, [name]: { ...next, model } };
    });
  }

  return (
    <div style={styles.root}>
      <style>{iosCss}</style>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <a href={BASE} style={styles.logoLink}>
            {logoOk ? (
              <img src={PUBLIC_LOGO} alt="SlipScan Logo" style={styles.logoImg} onError={() => setLogoOk(false)} />
            ) : (
              <div style={styles.logoFallback} aria-label="logo fallback">🎯</div>
            )}
          </a>
          <a href={BASE} style={{ textDecoration:'none' }}>
            <div style={styles.brand}>SLIP<span style={styles.brandAccent}>SCAN</span></div>
          </a>
          <div style={styles.headerRight}>
            <span style={styles.headerText}>AI Edge Analyzer</span>
          </div>
        </div>
        <div style={styles.gradientBar}></div>
      </header>

      <main style={styles.main}>
        <section style={styles.panel} onDragOver={(e)=>e.preventDefault()} onDrop={onDrop}>
          <div style={styles.h6}>Add slips</div>
          <div style={styles.dropZone}>
            <div style={styles.icon}>⬆️</div>
            <div style={styles.h7}>Drop screenshots</div>
            <div style={styles.dim}>or</div>
            <button className="primary" onClick={()=>inputRef.current?.click()}>Browse</button>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{display:'none'}} onChange={(e)=>onFiles(e.target.files)} />
          </div>
          <div style={{display:'flex', gap:8, marginTop:10, flexWrap:'wrap'}}>
            <input value={imgUrl} onChange={(e)=>setImgUrl(e.target.value)} placeholder="https://example.com/slip.png" style={styles.input} />
            <button className="ghost" onClick={addFromUrl}>Add URL</button>
          </div>
          <div style={styles.note}>Tip: the image host must allow CORS for in-browser OCR.</div>
        </section>
      </main>

      <footer style={styles.foot}>© 2025 SlipScan • Not betting advice</footer>
    </div>
  );
}

const styles = {
  root: { minHeight:'100dvh', background:'linear-gradient(180deg,#f8fafc,#ffffff)', color:'#0f172a', fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif" },
  header: { position:'sticky', top:0, zIndex:10, backdropFilter:'blur(12px)', background:'rgba(255,255,255,0.8)', borderBottom:'1px solid rgba(0,0,0,0.05)' },
  headerContent: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 18px' },
  logoLink: { display:'flex', alignItems:'center', textDecoration:'none' },
  gradientBar: { height:3, background:'linear-gradient(90deg,#ec4899,#db2777,#22c55e,#0ea5e9)' },
  logoImg: { height:40, width:'auto', borderRadius:8 },
  logoFallback: { height:40, width:40, borderRadius:8, display:'grid', placeItems:'center', background:'#ffe4e6' },
  brand: { fontWeight:900, fontSize:22, letterSpacing:1, textTransform:'uppercase', background:'linear-gradient(90deg,#ec4899,#db2777)', WebkitBackgroundClip:'text', color:'transparent' },
  headerRight: { fontSize:14, color:'#64748b' },
  headerText: { fontWeight:600 },
  main: { padding:18, display:'grid', gap:14, gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))' },
  panel: { border:'1px solid rgba(0,0,0,0.06)', background:'rgba(255,255,255,0.6)', backdropFilter:'blur(12px)', borderRadius:16, padding:14 },
  dropZone: { display:'grid', placeItems:'center', textAlign:'center', border:'2px dashed rgba(56,189,248,0.5)', borderRadius:16, padding:24, background:'#fff' },
  icon: { height:44, width:44, borderRadius:999, background:'#eff6ff', display:'grid', placeItems:'center', marginBottom:10, fontSize:22 },
  h7: { fontWeight:700 },
  h6: { fontWeight:800, fontSize:14, marginBottom:8 },
  dim: { color:'#64748b', fontSize:12 },
  note: { color:'#64748b', fontSize:12, marginTop:6 },
  input: { flex:1, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8 },
  foot: { textAlign:'center', padding:'12px 0 18px', color:'#94a3b8', fontSize:12 }
};

const iosCss = `
  .primary { border:none; padding:10px 14px; border-radius:999px; background:#2563eb; color:#fff; font-weight:600; }
  .ghost { border:1px solid #e2e8f0; background:#fff; padding:10px 12px; border-radius:10px; }
`;
