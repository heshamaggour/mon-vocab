import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "french-vocab-bank";
const CONFIG_KEY = "french-vocab-config";
const SUBJECTS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];
const TENSES_A1 = ["présent", "passé composé", "futur proche"];

// ── helpers ──────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function strictMatch(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
function looseMatch(a, b) {
  const n = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z ]/g,"").trim();
  return n(a) === n(b);
}

// ── storage (localStorage) ───────────────────────────────────────────
function loadData(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { console.error(e); }
}

// ── API helpers ──────────────────────────────────────────────────────
function getConfig() { return loadData(CONFIG_KEY, { proxyUrl: "" }); }

async function callAPI(system, userMsg, maxTokens = 4000) {
  const { proxyUrl } = getConfig();
  if (!proxyUrl) throw new Error("No proxy URL configured — go to Settings.");
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
const raw = data.content?.find(b => b.type === "text")?.text || "";
return raw.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
}

async function extractLesson(text) {
  const sys = `You are a French teaching assistant. Extract ALL vocabulary, verbs, grammar rules, and exercises from the user's A1 French lesson notes.

Return ONLY valid JSON (no markdown, no backticks):
{
  "vocabulary": [
    {"french":"word","english":"translation","type":"noun|verb|adjective|adverb|phrase|preposition","gender":"m|f|null","example":"example sentence"}
  ],
  "verbs": [
    {"infinitive":"verb","english":"translation","group":"1st|2nd|3rd|irregular",
     "conjugations":{"présent":{"je":"","tu":"","il/elle":"","nous":"","vous":"","ils/elles":""},
                     "passé composé":{"je":"","tu":"","il/elle":"","nous":"","vous":"","ils/elles":""},
                     "futur proche":{"je":"","tu":"","il/elle":"","nous":"","vous":"","ils/elles":""}}}
  ],
  "grammar": [
    {"rule":"short title","explanation":"clear explanation for A1 learner","examples":["ex1","ex2"]}
  ],
  "exercises": [
    {"instruction":"what to do","items":[
      {"prompt":"sentence with blank or question","answer":"correct answer","hint":"optional hint"}
    ]}
  ]
}

Be thorough. Extract every word, rule, and exercise. For verbs provide all 3 tenses. For exercises, preserve the original French prompts and correct answers exactly. Gender is "m"/"f" for nouns, null otherwise.`;
  const raw = await callAPI(sys, text);
  return JSON.parse(raw);
}

async function generateExercises(vocab, verbs, grammar) {
  const context = JSON.stringify({ vocabulary: vocab.slice(-40), verbs: verbs.slice(-20), grammar: grammar.slice(-10) });
  const sys = `You are a French A1 tutor. Given the student's current vocabulary, verbs, and grammar rules, generate fresh exercises. Mix types: conjugation fill-in, sentence completion, translation (EN to FR), group identification, short answer.

Return ONLY valid JSON (no markdown, no backticks):
{"exercises":[{"instruction":"exercise type description","items":[{"prompt":"question or sentence with ___","answer":"correct answer","hint":"optional hint"}]}]}

Generate 3-4 exercises with 5-8 items each. Use ONLY vocabulary and verbs the student has already learned.`;
  const raw = await callAPI(sys, `Student's current bank:\n${context}`);
  return JSON.parse(raw);
}

async function getPronunciation(word) {
  const sys = `You are a French pronunciation coach for A1 learners. Given a French word or phrase, provide pronunciation help.

Return ONLY valid JSON (no markdown, no backticks):
{"ipa":"IPA transcription","approx":"approximate pronunciation for English speaker","tips":"1-2 specific tips about tricky sounds, liaisons, or silent letters","similar":"a similar-sounding English word if helpful, or null"}`;
  const raw = await callAPI(sys, word, 500);
  return JSON.parse(raw);
}

// ── speech synthesis ─────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR"; u.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.find(v => v.lang.startsWith("fr"));
  if (fr) u.voice = fr;
  window.speechSynthesis.speak(u);
}

// ── docx reading ─────────────────────────────────────────────────────
async function readDocx(file) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// ── colour tokens ────────────────────────────────────────────────────
const C = {
  bg:"#f6f5f1", card:"#fff", border:"#e2e0d8", accent:"#2856a3",
  accent2:"#1a6b47", red:"#c44", amber:"#d4850a", text:"#1a1a2e",
  muted:"#888", light:"#f0efe8", badge:"#e8eef8",
};

// ── styles ───────────────────────────────────────────────────────────
const s = {
  shell: { fontFamily:"'DM Sans','Avenir',system-ui,sans-serif", maxWidth:560, margin:"0 auto", minHeight:"100vh", color:C.text, background:C.bg },
  header: { padding:"28px 20px 8px", textAlign:"center" },
  title: { fontSize:28, fontWeight:700, margin:0, letterSpacing:"-0.02em" },
  titleFr: { fontStyle:"italic", color:C.accent, fontWeight:400 },
  subtitle: { margin:"4px 0 0", fontSize:13, color:C.muted, fontWeight:400 },

  tabs: { display:"flex", gap:1, padding:"0 8px", borderBottom:`1px solid ${C.border}`, overflowX:"auto", background:C.bg },
  tab: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"10px 4px 8px", fontSize:10, fontWeight:500, color:"#aaa", background:"none", border:"none", borderBottom:"2px solid transparent", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.15s" },
  tabActive: { color:C.accent, borderBottomColor:C.accent },
  tabIcon: { fontSize:15 },
  badge: { fontSize:9, background:C.badge, color:C.accent, borderRadius:8, padding:"1px 6px", fontWeight:600 },

  panel: { padding:"20px 16px" },
  hint: { fontSize:13, color:C.muted, margin:"0 0 12px", lineHeight:1.5 },
  empty: { fontSize:14, color:"#bbb", textAlign:"center", padding:"40px 0" },

  textarea: { width:"100%", padding:14, fontSize:14, fontFamily:"'DM Sans',system-ui,sans-serif", border:`1.5px solid ${C.border}`, borderRadius:10, resize:"vertical", outline:"none", lineHeight:1.6, boxSizing:"border-box", background:"#fafaf7" },
  error: { color:C.red, fontSize:13, margin:"8px 0" },

  btn: { display:"block", width:"100%", padding:"12px 20px", fontSize:14, fontWeight:600, fontFamily:"inherit", color:"#fff", background:C.accent, border:"none", borderRadius:10, cursor:"pointer", marginTop:12, transition:"all 0.15s" },
  btnSm: { display:"inline-block", width:"auto", padding:"8px 16px", fontSize:13, fontWeight:600, fontFamily:"inherit", color:"#fff", background:C.accent, border:"none", borderRadius:8, cursor:"pointer", transition:"all 0.15s" },
  btnOutline: { display:"inline-block", width:"auto", padding:"8px 16px", fontSize:13, fontWeight:600, fontFamily:"inherit", color:C.accent, background:"none", border:`1.5px solid ${C.border}`, borderRadius:8, cursor:"pointer", transition:"all 0.15s" },
  btnDisabled: { opacity:0.5, cursor:"not-allowed" },
  btnGreen: { background:C.accent2 },
  btnRed: { background:"#fff", color:C.red, border:`1.5px solid #e8c8c8` },

  topRow: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 },
  progress: { fontSize:12, color:C.muted, fontWeight:500 },

  card: { background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:"32px 24px 24px", textAlign:"center", cursor:"pointer", minHeight:150, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" },
  cardFront: { fontSize:26, fontWeight:600, margin:0 },
  cardType: { fontSize:11, color:"#bbb", marginTop:6, fontWeight:500 },
  cardBack: { marginTop:20, paddingTop:16, borderTop:`1px solid ${C.light}`, width:"100%" },
  cardAnswer: { fontSize:20, color:C.accent, margin:0, fontWeight:500 },
  cardExample: { fontSize:13, color:C.muted, fontStyle:"italic", marginTop:8 },
  tapHint: { fontSize:11, color:"#ccc", marginTop:16 },
  cardActions: { display:"flex", gap:10, marginTop:16 },

  scoreCard: { textAlign:"center", padding:"40px 0" },
  scoreTitle: { fontSize:20, fontWeight:600, margin:0 },
  scoreRow: { fontSize:16, marginTop:12 },

  conjugateHeader: { textAlign:"center", marginBottom:20 },
  verbInfinitive: { fontSize:28, fontWeight:700, margin:0 },
  verbEnglish: { fontSize:13, color:C.muted, margin:"4px 0 12px" },
  tenseRow: { display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap" },
  tenseBtn: { fontSize:12, padding:"5px 12px", borderRadius:6, border:`1.5px solid ${C.border}`, background:C.card, color:"#666", cursor:"pointer", fontFamily:"inherit", fontWeight:500 },
  tenseBtnActive: { background:C.accent, color:"#fff", borderColor:C.accent },
  conjGrid: { display:"flex", flexDirection:"column", gap:8, marginBottom:16 },
  conjRow: { display:"flex", alignItems:"center", gap:10 },
  conjSubj: { width:80, fontSize:14, fontWeight:500, textAlign:"right", color:"#555", flexShrink:0 },
  conjInput: { flex:1, padding:"8px 12px", fontSize:14, fontFamily:"inherit", border:`1.5px solid ${C.border}`, borderRadius:8, outline:"none" },
  inputCorrect: { borderColor:C.accent2, background:"#e8f5e9" },
  inputLoose: { borderColor:C.amber, background:"#fef9e7" },
  inputWrong: { borderColor:C.red, background:"#fdecea" },
  correction: { fontSize:12, color:C.accent, fontWeight:500, flexShrink:0 },
  tick: { fontSize:16, color:C.accent2 },
  accentWarn: { fontSize:10, color:C.amber, fontWeight:600 },

  exSection: { marginBottom:24 },
  exInstruction: { fontSize:14, fontWeight:600, color:C.text, margin:"0 0 12px", lineHeight:1.5, background:C.light, padding:"10px 14px", borderRadius:8 },
  exItem: { display:"flex", gap:8, alignItems:"center", marginBottom:8, flexWrap:"wrap" },
  exPrompt: { fontSize:14, color:"#444", flex:1, minWidth:180, lineHeight:1.5 },
  exInput: { padding:"7px 12px", fontSize:14, fontFamily:"inherit", border:`1.5px solid ${C.border}`, borderRadius:8, outline:"none", width:160, boxSizing:"border-box" },
  exResult: { fontSize:12, fontWeight:600 },

  pronCard: { background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:"24px 20px", marginTop:12 },
  pronWord: { fontSize:24, fontWeight:700, margin:0, display:"flex", alignItems:"center", gap:12 },
  pronPlay: { fontSize:18, cursor:"pointer", background:C.badge, border:"none", borderRadius:"50%", width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" },
  pronIpa: { fontSize:18, color:C.accent, margin:"8px 0 4px", fontFamily:"'Courier New',monospace" },
  pronApprox: { fontSize:14, color:C.muted, margin:"4px 0" },
  pronTips: { fontSize:14, color:"#444", margin:"10px 0 0", lineHeight:1.6, background:C.light, padding:"10px 14px", borderRadius:8 },

  filterRow: { display:"flex", gap:4, flexWrap:"wrap" },
  filterBtn: { fontSize:11, padding:"4px 10px", borderRadius:6, border:`1.5px solid ${C.border}`, background:C.card, color:"#777", cursor:"pointer", fontFamily:"inherit", fontWeight:500, textTransform:"capitalize" },
  filterBtnActive: { background:C.text, color:"#fff", borderColor:C.text },
  bankList: { display:"flex", flexDirection:"column", gap:1 },
  bankRow: { display:"flex", alignItems:"center", gap:8, padding:"8px 4px", borderBottom:`1px solid ${C.light}`, fontSize:14 },
  bankFr: { fontWeight:600, color:C.text, minWidth:100 },
  bankType: { fontSize:10, color:"#bbb", fontWeight:500, flexShrink:0 },
  bankEn: { color:"#666", marginLeft:"auto" },
  bankPlay: { fontSize:13, cursor:"pointer", background:"none", border:"none", padding:2, color:C.accent },
  grammarList: { display:"flex", flexDirection:"column", gap:12 },
  grammarCard: { padding:"14px 16px", background:C.light, borderRadius:10, border:`1px solid ${C.border}` },
  grammarRule: { fontSize:15, fontWeight:600, margin:0 },
  grammarExpl: { fontSize:13, color:"#555", margin:"6px 0 4px", lineHeight:1.5 },
  grammarEx: { fontSize:13, color:C.accent, fontStyle:"italic", margin:"2px 0" },

  dropZone: { border:`2px dashed ${C.border}`, borderRadius:12, padding:"28px 20px", textAlign:"center", cursor:"pointer", background:C.light, transition:"all 0.2s", marginBottom:12 },
  dropZoneActive: { borderColor:C.accent, background:C.badge },
  dropLabel: { fontSize:14, color:C.muted, margin:0 },
  fileName: { fontSize:13, color:C.accent, fontWeight:600, marginTop:8 },
  importToast: { margin:"0 16px 8px", padding:"10px 14px", fontSize:13, color:"#2d6a3e", background:"#e8f5e9", borderRadius:8, textAlign:"center" },

  subTabs: { display:"flex", gap:8, marginBottom:16 },
  subTab: { fontSize:13, fontWeight:600, padding:"6px 14px", borderRadius:8, border:`1.5px solid ${C.border}`, background:C.card, color:C.muted, cursor:"pointer", fontFamily:"inherit" },
  subTabActive: { background:C.accent, color:"#fff", borderColor:C.accent },

  // settings
  settingsCard: { background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:"20px", marginBottom:16 },
  settingsLabel: { fontSize:13, fontWeight:600, color:C.text, marginBottom:6, display:"block" },
  settingsInput: { width:"100%", padding:"10px 12px", fontSize:13, fontFamily:"'DM Sans',system-ui,sans-serif", border:`1.5px solid ${C.border}`, borderRadius:8, outline:"none", boxSizing:"border-box" },
  settingsHint: { fontSize:12, color:C.muted, margin:"6px 0 0", lineHeight:1.5 },
  settingsSaved: { fontSize:12, color:C.accent2, fontWeight:600, marginTop:6 },
};

// ══════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function Tabs({ active, onChange, counts }) {
  const tabs = [
    { id:"import", label:"Import", icon:"↓" },
    { id:"flashcards", label:"Cards", icon:"▢" },
    { id:"conjugate", label:"Conjugate", icon:"✎" },
    { id:"exercises", label:"Exercises", icon:"◈" },
    { id:"pronounce", label:"Pronounce", icon:"♪" },
    { id:"bank", label:"Bank", icon:"◉" },
    { id:"settings", label:"Settings", icon:"⚙" },
  ];
  return (
    <div style={s.tabs}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ ...s.tab, ...(active===t.id ? s.tabActive : {}) }}>
          <span style={s.tabIcon}>{t.icon}</span>
          <span>{t.label}</span>
          {counts[t.id] ? <span style={s.badge}>{counts[t.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────
function SettingsTab() {
  const [config, setConfig] = useState(() => getConfig());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveData(CONFIG_KEY, config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={s.panel}>
      <div style={s.settingsCard}>
        <label style={s.settingsLabel}>Cloudflare Worker proxy URL</label>
        <input value={config.proxyUrl} onChange={e => setConfig(c => ({...c, proxyUrl: e.target.value}))}
          style={s.settingsInput} placeholder="https://mon-vocab-proxy.YOUR-SUBDOMAIN.workers.dev" />
        <p style={s.settingsHint}>
          This is the URL of your Cloudflare Worker that proxies requests to the Anthropic API. See the README for setup instructions.
        </p>
        {saved && <p style={s.settingsSaved}>✓ Saved</p>}
      </div>
      <button style={s.btn} onClick={handleSave}>Save settings</button>
    </div>
  );
}

// ── Import ───────────────────────────────────────────────────────────
function ImportTab({ onExtracted, loading, setLoading }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef();

  const processFile = async (file) => {
    if (!file) return;
    setFileName(file.name); setError("");
    try {
      setText(file.name.endsWith(".docx") ? await readDocx(file) : await file.text());
    } catch { setError("Couldn't read that file — try pasting instead."); }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); };

  const handleExtract = async () => {
    if (!text.trim()) return;
    setLoading(true); setError("");
    try {
      const result = await extractLesson(text.trim());
      onExtracted(result); setText(""); setFileName("");
    } catch (e) {
      setError(e.message?.includes("proxy") ? "Set your proxy URL in Settings first." : "Extraction failed — check your text and try again.");
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div style={s.panel}>
      <div style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
        <p style={s.dropLabel}>{dragging ? "Drop it here" : "Drop a .docx or .txt file, or click to browse"}</p>
        {fileName && <p style={s.fileName}>{fileName}</p>}
        <input ref={fileRef} type="file" accept=".docx,.txt,.md" style={{ display:"none" }} onChange={e => processFile(e.target.files[0])} />
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Or paste your lesson notes here…" style={s.textarea} rows={8} />
      {error && <p style={s.error}>{error}</p>}
      <button onClick={handleExtract} disabled={loading || !text.trim()} style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}>
        {loading ? "Extracting…" : "Extract vocabulary & grammar"}
      </button>
    </div>
  );
}

// ── Cards (flip + written) ───────────────────────────────────────────
function FlashcardTab({ vocab }) {
  const [mode, setMode] = useState("flip");
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState("fr-en");
  const [score, setScore] = useState({ correct:0, wrong:0 });
  const [userAns, setUserAns] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef();

  const resetDeck = useCallback(() => {
    if (vocab.length) { setDeck(shuffle(vocab)); setIdx(0); setFlipped(false); setUserAns(""); setSubmitted(false); setScore({ correct:0, wrong:0 }); }
  }, [vocab]);

  useEffect(() => { resetDeck(); }, [resetDeck, direction, mode]);

  if (!vocab.length) return <div style={s.panel}><p style={s.empty}>No vocabulary yet — import a lesson first.</p></div>;

  const card = deck[idx];
  if (!card) return (
    <div style={s.panel}><div style={s.scoreCard}>
      <p style={s.scoreTitle}>Session complete</p>
      <p style={s.scoreRow}><span style={{color:C.accent2}}>✓ {score.correct}</span><span style={{marginLeft:24,color:C.red}}>✗ {score.wrong}</span></p>
      <button style={s.btn} onClick={resetDeck}>Restart</button>
    </div></div>
  );

  const prompt = direction === "fr-en" ? card.french : card.english;
  const answer = direction === "fr-en" ? card.english : card.french;

  const handleWrittenSubmit = () => { if (!userAns.trim()) return; setSubmitted(true); if (direction === "fr-en") speak(card.french); };
  const handleWrittenNext = () => {
    const isRight = strictMatch(userAns, answer) || looseMatch(userAns, answer);
    setScore(p => ({ correct:p.correct+(isRight?1:0), wrong:p.wrong+(isRight?0:1) }));
    setUserAns(""); setSubmitted(false); setIdx(i => i+1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const flipAdvance = (known) => { setScore(p => ({ correct:p.correct+(known?1:0), wrong:p.wrong+(known?0:1) })); setFlipped(false); setIdx(i => i+1); };

  const isExact = submitted && strictMatch(userAns, answer);
  const isLoose = submitted && !isExact && looseMatch(userAns, answer);
  const isWrong = submitted && !isExact && !isLoose;

  return (
    <div style={s.panel}>
      <div style={s.topRow}>
        <div style={s.subTabs}>
          <button style={{ ...s.subTab, ...(mode==="flip"?s.subTabActive:{}) }} onClick={() => setMode("flip")}>Flip</button>
          <button style={{ ...s.subTab, ...(mode==="written"?s.subTabActive:{}) }} onClick={() => setMode("written")}>Written</button>
        </div>
        <button style={s.btnOutline} onClick={() => setDirection(d => d==="fr-en"?"en-fr":"fr-en")}>{direction==="fr-en"?"FR → EN":"EN → FR"}</button>
      </div>
      <div style={{ textAlign:"center", marginBottom:12 }}>
        <span style={s.progress}>{idx+1} / {deck.length}</span>
        <span style={{ ...s.progress, marginLeft:16 }}>✓ {score.correct}  ✗ {score.wrong}</span>
      </div>

      {mode === "flip" ? (
        <>
          <div style={s.card} onClick={() => { if (!flipped) { setFlipped(true); speak(card.french); } }}>
            <p style={s.cardFront}>{prompt}</p>
            {card.type && <span style={s.cardType}>{card.type}{card.gender?` (${card.gender})`:""}</span>}
            {flipped ? (<div style={s.cardBack}><p style={s.cardAnswer}>{answer}</p>{card.example && <p style={s.cardExample}>{card.example}</p>}</div>) : <p style={s.tapHint}>tap to reveal</p>}
          </div>
          {flipped && (<div style={s.cardActions}>
            <button style={{ ...s.btnSm, ...s.btnRed, flex:1 }} onClick={() => flipAdvance(false)}>↻ Review</button>
            <button style={{ ...s.btnSm, ...s.btnGreen, flex:1 }} onClick={() => flipAdvance(true)}>✓ Got it</button>
          </div>)}
        </>
      ) : (
        <>
          <div style={s.card}>
            <p style={s.cardFront}>{prompt}</p>
            {card.type && <span style={s.cardType}>{card.type}{card.gender?` (${card.gender})`:""}</span>}
            <div style={{ marginTop:20, width:"100%" }}>
              <input ref={inputRef} value={userAns} onChange={e => setUserAns(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") { submitted ? handleWrittenNext() : handleWrittenSubmit(); } }}
                disabled={submitted}
                placeholder={direction==="fr-en" ? "Type the English…" : "Tapez en français…"}
                style={{ ...s.conjInput, width:"100%", textAlign:"center", fontSize:18, padding:"10px 14px", boxSizing:"border-box",
                  ...(isExact?s.inputCorrect:{}), ...(isLoose?s.inputLoose:{}), ...(isWrong?s.inputWrong:{}) }}
                autoFocus />
              {submitted && (<div style={{ marginTop:12 }}>
                {isExact && <p style={{ color:C.accent2, fontWeight:600, fontSize:16, margin:0 }}>✓ Correct</p>}
                {isLoose && <p style={{ color:C.amber, fontWeight:600, fontSize:16, margin:0 }}>~ Right word, watch the accents → {answer}</p>}
                {isWrong && <p style={{ color:C.red, fontWeight:600, fontSize:16, margin:0 }}>✗ {answer}</p>}
                {card.example && <p style={s.cardExample}>{card.example}</p>}
              </div>)}
            </div>
          </div>
          <div style={{ marginTop:12 }}>
            {!submitted ? <button style={s.btn} onClick={handleWrittenSubmit}>Check</button>
              : <button style={s.btn} onClick={handleWrittenNext}>Next →</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Conjugate ────────────────────────────────────────────────────────
function ConjugateTab({ verbs }) {
  const [verbIdx, setVerbIdx] = useState(0);
  const [tense, setTense] = useState("présent");
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const inputRefs = useRef({});
  useEffect(() => { setAnswers({}); setChecked(false); }, [verbIdx, tense]);
  if (!verbs.length) return <div style={s.panel}><p style={s.empty}>No verbs yet — import a lesson first.</p></div>;
  const verb = verbs[verbIdx]; const conj = verb.conjugations?.[tense] || {};
  const nextVerb = () => setVerbIdx(i => (i+1) % verbs.length);
  return (
    <div style={s.panel}>
      <div style={s.topRow}><span style={s.progress}>Verb {verbIdx+1} / {verbs.length}</span><button style={s.btnOutline} onClick={nextVerb}>Next →</button></div>
      <div style={s.conjugateHeader}>
        <p style={s.verbInfinitive}>{verb.infinitive}</p>
        <p style={s.verbEnglish}>{verb.english} · {verb.group}</p>
        <div style={s.tenseRow}>{TENSES_A1.map(t => (<button key={t} onClick={() => setTense(t)} style={{ ...s.tenseBtn, ...(tense===t ? s.tenseBtnActive : {}) }}>{t}</button>))}</div>
      </div>
      <div style={s.conjGrid}>
        {SUBJECTS.map((subj, si) => {
          const correct = conj[subj]||""; const ua = answers[subj]||"";
          const ok = checked && strictMatch(ua,correct); const loose = checked && !ok && looseMatch(ua,correct); const wrong = checked && !ok && !loose && ua.trim();
          return (<div key={subj} style={s.conjRow}>
            <span style={s.conjSubj}>{subj}</span>
            <input ref={el=>inputRefs.current[subj]=el} value={ua} onChange={e=>setAnswers(a=>({...a,[subj]:e.target.value}))} disabled={checked}
              style={{ ...s.conjInput, ...(ok?s.inputCorrect:{}), ...(loose?s.inputLoose:{}), ...(wrong?s.inputWrong:{}) }} placeholder="…"
              onKeyDown={e=>{if(e.key==="Enter"){const nxt=SUBJECTS[si+1]; nxt?inputRefs.current[nxt]?.focus():setChecked(true);}}} />
            {checked&&(wrong||loose)&&<span style={s.correction}>{correct}</span>}
            {ok&&<span style={s.tick}>✓</span>}{loose&&<span style={s.accentWarn}>accents!</span>}
          </div>);
        })}
      </div>
      {!checked?<button style={s.btn} onClick={()=>setChecked(true)}>Check</button>:<button style={s.btn} onClick={nextVerb}>Next verb →</button>}
    </div>
  );
}

// ── Exercises ────────────────────────────────────────────────────────
function ExercisesTab({ exercises, vocab, verbs, grammar }) {
  const [mode, setMode] = useState("tutor");
  const [genExercises, setGenExercises] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const activeExercises = mode === "tutor" ? exercises : genExercises;
  const handleGenerate = async () => {
    setGenLoading(true);
    try { const r = await generateExercises(vocab,verbs,grammar); setGenExercises(r.exercises||[]); setAnswers({}); setChecked(false); } catch(e){console.error(e);}
    setGenLoading(false);
  };
  const noBank = !vocab.length && !verbs.length;
  return (
    <div style={s.panel}>
      <div style={s.subTabs}>
        <button style={{...s.subTab,...(mode==="tutor"?s.subTabActive:{})}} onClick={()=>{setMode("tutor");setAnswers({});setChecked(false);}}>From lessons</button>
        <button style={{...s.subTab,...(mode==="generate"?s.subTabActive:{})}} onClick={()=>{setMode("generate");setAnswers({});setChecked(false);}}>Generate new</button>
      </div>
      {mode==="generate"&&(<div style={{marginBottom:16}}>
        {noBank?<p style={s.hint}>Import some lessons first.</p>:
        <button style={{...s.btnSm,...(genLoading?s.btnDisabled:{})}} onClick={handleGenerate} disabled={genLoading}>{genLoading?"Generating…":"Generate exercises from my bank"}</button>}
      </div>)}
      {!activeExercises.length ? <p style={s.empty}>{mode==="tutor"?"No exercises extracted yet.":"Hit the button above."}</p> : (<>
        {activeExercises.map((ex,ei)=>(<div key={ei} style={s.exSection}><p style={s.exInstruction}>{ex.instruction}</p>
          {ex.items.map((item,ii)=>{const key=`${ei}-${ii}`;const ua=answers[key]||"";const ok=checked&&strictMatch(ua,item.answer);const loose=checked&&!ok&&looseMatch(ua,item.answer);const wrong=checked&&!ok&&!loose&&ua.trim();
          return(<div key={ii} style={s.exItem}><span style={s.exPrompt}>{ii+1}. {item.prompt}</span>
            <input value={ua} onChange={e=>setAnswers(a=>({...a,[key]:e.target.value}))} disabled={checked}
              style={{...s.exInput,...(ok?s.inputCorrect:{}),...(loose?s.inputLoose:{}),...(wrong?s.inputWrong:{})}} placeholder={item.hint||"…"} />
            {ok&&<span style={{...s.exResult,color:C.accent2}}>✓</span>}{loose&&<span style={{...s.exResult,color:C.amber}}>~accents</span>}
            {wrong&&<span style={{...s.exResult,color:C.red}}>✗ {item.answer}</span>}{checked&&!ua.trim()&&<span style={{...s.exResult,color:C.muted}}>{item.answer}</span>}
          </div>);})}
        </div>))}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          {!checked?<button style={s.btn} onClick={()=>setChecked(true)}>Check all</button>:<button style={s.btn} onClick={()=>{setAnswers({});setChecked(false);}}>Try again</button>}
        </div>
      </>)}
    </div>
  );
}

// ── Pronounce ────────────────────────────────────────────────────────
function PronounceTab({ vocab, verbs }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeWord, setActiveWord] = useState("");
  const allWords = [...new Set([...vocab.map(v=>v.french),...verbs.map(v=>v.infinitive)])];
  const suggestions = query.trim() ? allWords.filter(w=>w.toLowerCase().startsWith(query.toLowerCase())).slice(0,8) : shuffle(allWords).slice(0,8);
  const lookup = async(word)=>{setActiveWord(word);setQuery(word);setLoading(true);speak(word);try{setResult(await getPronunciation(word));}catch(e){console.error(e);}setLoading(false);};
  if(!allWords.length) return <div style={s.panel}><p style={s.empty}>Import some lessons first.</p></div>;
  return (
    <div style={s.panel}>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&query.trim()&&lookup(query.trim())}
          style={{...s.conjInput,flex:1}} placeholder="Type a French word…" />
        <button style={{...s.btnSm,...(loading?s.btnDisabled:{})}} onClick={()=>query.trim()&&lookup(query.trim())} disabled={loading}>{loading?"…":"Look up"}</button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
        {suggestions.map((w,i)=>(<button key={w+i} style={s.btnOutline} onClick={()=>lookup(w)}>{w}</button>))}
      </div>
      {result&&activeWord&&(<div style={s.pronCard}>
        <p style={s.pronWord}>{activeWord}<button style={s.pronPlay} onClick={()=>speak(activeWord)}>🔊</button></p>
        <p style={s.pronIpa}>/{result.ipa}/</p><p style={s.pronApprox}>≈ {result.approx}</p>
        {result.similar&&<p style={{fontSize:13,color:C.muted,margin:"4px 0"}}>Sounds like: "{result.similar}"</p>}
        <p style={s.pronTips}>{result.tips}</p>
      </div>)}
    </div>
  );
}

// ── Bank ─────────────────────────────────────────────────────────────
function BankTab({ vocab, verbs, grammar, onClear }) {
  const [filter, setFilter] = useState("all");
  return (
    <div style={s.panel}>
      <div style={s.topRow}><div style={s.filterRow}>
        {["all","noun","verb","adjective","phrase","grammar"].map(f=>(<button key={f} onClick={()=>setFilter(f)} style={{...s.filterBtn,...(filter===f?s.filterBtnActive:{})}}>{f}</button>))}
      </div></div>
      {filter==="grammar"?(grammar.length?(<div style={s.grammarList}>{grammar.map((g,i)=>(<div key={i} style={s.grammarCard}><p style={s.grammarRule}>{g.rule}</p><p style={s.grammarExpl}>{g.explanation}</p>{g.examples?.map((ex,j)=><p key={j} style={s.grammarEx}>→ {ex}</p>)}</div>))}</div>):<p style={s.empty}>No grammar rules yet.</p>):(
        <div style={s.bankList}>
          {(filter==="all"?vocab:vocab.filter(v=>v.type===filter)).map((v,i)=>(<div key={i} style={s.bankRow}>
            <button style={s.bankPlay} onClick={()=>speak(v.french)}>🔊</button>
            <span style={s.bankFr}>{v.french}</span><span style={s.bankType}>{v.type}{v.gender?` (${v.gender})`:""}</span><span style={s.bankEn}>{v.english}</span>
          </div>))}
          {filter!=="all"&&vocab.filter(v=>v.type===filter).length===0&&<p style={s.empty}>No {filter}s yet.</p>}
        </div>
      )}
      {(vocab.length>0||grammar.length>0)&&(<div style={{marginTop:24,textAlign:"right"}}>
        <button style={{...s.btnOutline,color:C.red,borderColor:"#e8c8c8"}} onClick={()=>{if(window.confirm("Clear entire word bank?"))onClear();}}>Clear bank</button>
      </div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("import");
  const [vocab, setVocab] = useState([]);
  const [verbs, setVerbs] = useState([]);
  const [grammar, setGrammar] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastImport, setLastImport] = useState(null);

  useEffect(() => {
    const d = loadData(STORAGE_KEY, {});
    setVocab(d.vocabulary||[]); setVerbs(d.verbs||[]); setGrammar(d.grammar||[]); setExercises(d.exercises||[]);
    window.speechSynthesis?.getVoices();
    // redirect to settings if no proxy configured
    const cfg = getConfig();
    if (!cfg.proxyUrl) setTab("settings");
  }, []);

  const persist = useCallback((v,vb,g,ex) => saveData(STORAGE_KEY, {vocabulary:v,verbs:vb,grammar:g,exercises:ex}), []);

  const handleExtracted = (result) => {
    const nv=[...vocab],nvb=[...verbs],ng=[...grammar],ne=[...exercises];
    (result.vocabulary||[]).forEach(v=>{if(!nv.some(x=>x.french.toLowerCase()===v.french.toLowerCase()))nv.push(v);});
    (result.verbs||[]).forEach(v=>{if(!nvb.some(x=>x.infinitive.toLowerCase()===v.infinitive.toLowerCase()))nvb.push(v);});
    (result.grammar||[]).forEach(g=>{if(!ng.some(x=>x.rule.toLowerCase()===g.rule.toLowerCase()))ng.push(g);});
    (result.exercises||[]).forEach(e=>ne.push(e));
    setVocab(nv); setVerbs(nvb); setGrammar(ng); setExercises(ne);
    persist(nv,nvb,ng,ne);
    setLastImport({vocab:(result.vocabulary||[]).length,verbs:(result.verbs||[]).length,grammar:(result.grammar||[]).length,exercises:(result.exercises||[]).length});
    setTab("flashcards");
  };

  const handleClear = () => { setVocab([]); setVerbs([]); setGrammar([]); setExercises([]); persist([],[],[],[]); setLastImport(null); };
  const counts = { bank:vocab.length||null, conjugate:verbs.length||null, exercises:exercises.length||null };

  return (
    <div style={s.shell}>
      <header style={s.header}>
        <h1 style={s.title}><span style={s.titleFr}>mon</span> vocab</h1>
        <p style={s.subtitle}>{vocab.length} words · {verbs.length} verbs · {grammar.length} rules</p>
      </header>
      <Tabs active={tab} onChange={setTab} counts={counts} />
      {lastImport && tab==="flashcards" && (
        <div style={s.importToast}>Added {lastImport.vocab} words, {lastImport.verbs} verbs, {lastImport.grammar} rules, {lastImport.exercises} exercises</div>
      )}
      {tab==="import" && <ImportTab onExtracted={handleExtracted} loading={loading} setLoading={setLoading} />}
      {tab==="flashcards" && <FlashcardTab vocab={vocab} />}
      {tab==="conjugate" && <ConjugateTab verbs={verbs} />}
      {tab==="exercises" && <ExercisesTab exercises={exercises} vocab={vocab} verbs={verbs} grammar={grammar} />}
      {tab==="pronounce" && <PronounceTab vocab={vocab} verbs={verbs} />}
      {tab==="bank" && <BankTab vocab={vocab} verbs={verbs} grammar={grammar} onClear={handleClear} />}
      {tab==="settings" && <SettingsTab />}
    </div>
  );
}
