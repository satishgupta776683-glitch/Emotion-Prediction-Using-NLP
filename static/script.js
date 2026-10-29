const $ = id => document.getElementById(id);
const EMO = {
  sadness:  ["😢", "#5b9bf0", "Something here feels heavy."],
  joy:      ["😄", "#f5b50a", "This one is full of good energy."],
  love:     ["❤️", "#ec5f9e", "Warm, close and caring."],
  anger:    ["😡", "#e5484d", "There is real frustration in this."],
  fear:     ["😨", "#8b7cf6", "A sense of worry or unease."],
  surprise: ["😲", "#1fb5a3", "Something unexpected happened."]
};
const EXAMPLES = [
  "I finally got the job I wanted!",
  "I miss how things used to be.",
  "Someone broke into my car last night.",
  "I can't believe you remembered my birthday!"
];
const input = $("input"), btn = $("go"), errBox = $("err");
let history = [];
try { history = JSON.parse(localStorage.getItem("emo_hist") || "[]"); } catch (e) {}

// example chips
EXAMPLES.forEach(t => {
  const b = document.createElement("button");
  b.textContent = t.split(" ").slice(0, 3).join(" ") + "…";
  b.title = t;
  b.onclick = () => { input.value = t; count(); input.focus(); };
  $("chips").appendChild(b);
});

// glow follows the cursor
addEventListener("pointermove", e => {
  const s = $("glow").style;
  s.setProperty("--x", e.clientX + "px");
  s.setProperty("--y", e.clientY + "px");
});

function count() { $("count").textContent = input.value.length + "/1000"; }
input.addEventListener("input", count);
input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze(); });
btn.onclick = analyze;

async function analyze() {
  const text = input.value.trim();
  if (!text) { errBox.textContent = "Write a sentence first."; input.focus(); return; }
  errBox.textContent = "";
  btn.classList.add("load");
  try {
    const r = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The server could not read that input.");
    show(data);
    remember(data);
  } catch (e) {
    errBox.textContent = e.message === "Failed to fetch" ? "Cannot reach the server. Check that the API is running." : e.message;
  } finally { btn.classList.remove("load"); }
}

function show(d) {
  const [emoji, color, line] = EMO[d.predicted_emotion] || ["🙂", "#8b7cf6", ""];
  document.documentElement.style.setProperty("--accent", color);
  const res = $("result");
  res.hidden = false;
  res.classList.remove("in"); void res.offsetWidth; res.classList.add("in");
  $("emoji").textContent = emoji;
  $("emo").textContent = d.predicted_emotion;
  $("quote").textContent = line;

  const pct = d.confidence * 100;
  $("arc").style.strokeDashoffset = 264;
  requestAnimationFrame(() => requestAnimationFrame(() => $("arc").style.strokeDashoffset = 264 * (1 - d.confidence)));
  const t0 = performance.now();
  (function tick(t) {
    const p = Math.min((t - t0) / 1100, 1);
    $("pct").textContent = Math.round(pct * (1 - Math.pow(1 - p, 3))) + "%";
    if (p < 1) requestAnimationFrame(tick);
  })(t0);

  const bars = $("bars");
  bars.innerHTML = "";
  Object.entries(d.all_probabilities).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
    const row = document.createElement("div");
    row.className = "bar" + (i === 0 ? " top1" : "");
    row.style.setProperty("--c", (EMO[k] || [])[1] || color);
    row.innerHTML = `<span>${k}</span><i><u></u></i><em>${(v * 100).toFixed(1)}%</em>`;
    bars.appendChild(row);
    setTimeout(() => row.querySelector("u").style.width = Math.max(v * 100, 1) + "%", 120 + i * 90);
  });
  res.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function remember(d) {
  history = [{ text: d.text, data: d }, ...history.filter(h => h.text !== d.text)].slice(0, 5);
  try { localStorage.setItem("emo_hist", JSON.stringify(history)); } catch (e) {}
  renderHist();
}

function renderHist() {
  $("hist").hidden = !history.length;
  const list = $("list");
  list.innerHTML = "";
  history.forEach(h => {
    const b = document.createElement("button");
    const em = (EMO[h.data.predicted_emotion] || ["🙂"])[0];
    b.innerHTML = `<b>${em}</b><span></span><small>${(h.data.confidence * 100).toFixed(0)}%</small>`;
    b.querySelector("span").textContent = h.text;
    b.onclick = () => { input.value = h.text; count(); show(h.data); };
    list.appendChild(b);
  });
}
renderHist();
