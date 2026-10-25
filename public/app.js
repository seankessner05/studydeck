// StudyDeck front end: plain JS, no build step.
const $ = (id) => document.getElementById(id);
const state = { course: "all", courses: [], total: 0, source: "samples", demo: false, streak: 0, busy: false };

// One color per course, used for the sidebar dot and citation chips. Full class names so Tailwind keeps them.
const COLORS = {
  ECON300: { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30" },
  ECON301: { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30" },
  ECON196: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30" },
  MGMT220: { dot: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 hover:bg-fuchsia-100 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/30" },
  CLUB: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30" },
  EVENT: { dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 ring-teal-200 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30" },
  ATHLETICS: { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30" },
  unsorted: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600" },
  all: { dot: "bg-gradient-to-br from-indigo-500 to-fuchsia-500" },
};
const BAD_CHIP = "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30";

// Demo questions for the sample notes. The last one is deliberately not covered, to show "Not in your notes".
const TRY_ASKING = [
  { course: "ECON300", q: "How does a tax rate change the spending multiplier?" },
  { course: "ECON196", q: "Compare FIFO and LIFO when prices are rising." },
  { course: "ECON301", q: "Why does a monopoly create deadweight loss?" },
  { course: "all", q: "What do I have coming up this week across classes and clubs?" },
  { course: "ECON300", q: "What did we learn about the Solow growth model?" },
];

const EMPTY_LINES = [
  "Your notes are ready. Your brain might need coffee. ☕",
  "Ask me anything. If it's not in your notes, I'll say so. No bluffing.",
  "Midterm season? Let's turn your notes into answers.",
  "No hallucinations here, just your notes and receipts. 🧾",
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const color = (c) => COLORS[c] ?? COLORS.unsorted;
const courseName = (id) => (id === "all" ? "All courses" : state.courses.find((c) => c.id === id)?.name ?? id);

// Must match src/citations.ts (runs on escaped HTML, so quotes may appear as &quot;)
const CITE_RE = /\[([A-Za-z0-9]+) (\d{4}-\d{2}-\d{2}): ([^\]|]+?)(?:\s*\|\s*(?:&quot;|["“])([^\]]*?)(?:&quot;|["”]))?\s*\]/g;

/** Minimal markdown: headings, bullets, tables, blockquotes, bold, code. Input is escaped first. */
function renderMarkdown(src) {
  let html = "", list = false, table = null;
  const flushList = () => { if (list) { html += "</ul>"; list = false; } };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => inline(c.trim()));
    html += "<table><thead><tr>" + cells(head).map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + cells(r).map((c) => `<td>${c}</td>`).join("") + "</tr>").join("") + "</tbody></table>";
    table = null;
  };
  for (const line of esc(src).split("\n")) {
    if (/^\s*\|/.test(line)) { flushList(); (table ??= []).push(line); continue; }
    flushTable();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flushList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^&gt;\s?(.*)/))) { flushList(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else if (line.trim()) { flushList(); html += `<p>${inline(line)}</p>`; }
    else flushList();
  }
  flushList(); flushTable();
  return html;
}

/** Render an assistant answer: markdown + course-colored citation chips + honesty labels. */
function renderAnswer(text, msg) {
  const byLabel = Object.fromEntries((msg.notesUsed || []).map((n) => [n.label, n.id]));
  const byRaw = Object.fromEntries((msg.citations || []).map((c) => [c.raw, c]));
  let html = renderMarkdown(text).replace(CITE_RE, (raw, course, date, topic, quote) => {
    const label = `${course} ${date}: ${topic.trim()}`;
    const info = byRaw[raw.replace(/&quot;/g, '"')];
    const id = info?.noteId || byLabel[label] || "";
    const bad = info && info.status !== "ok";
    const why = bad ? (info.status === "unknown_note" ? "This citation doesn't match a note that was sent." : "Quote not found word-for-word in the note.") : "";
    const short = new Date(date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `<button type="button" class="cite mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-px align-[1px] text-[11px] font-semibold ring-1 ring-inset transition ${bad ? BAD_CHIP : color(course).chip}"
      data-id="${esc(id)}" data-quote="${quote ? esc(quote.replace(/&quot;/g, '"')) : ""}" data-label="${esc(label)}" data-why="${esc(why)}">${bad ? "⚠" : ""}<span class="font-mono">${esc(course)}</span><span class="font-normal opacity-75">${esc(short)}</span></button>`;
  });
  html = html.replace(/\(General knowledge\)/g, '<span class="rounded-md bg-amber-100 px-1.5 py-px text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">🌐 General knowledge</span>');
  html = html.replace(/Not in your notes\.?/g, (m) => `<span class="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">🔎 ${m}</span>`);
  return html;
}

function notesUsedLine(msg) {
  if (!msg.notesUsed) return "";
  const n = msg.notesUsed.length;
  const mode = msg.mode === "ranked" ? "best matches by keyword + recency" : "every note in scope";
  const list = msg.notesUsed.map((x) => `<li class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full ${color(x.label.split(" ")[0]).dot}"></span>${esc(x.label)}</li>`).join("");
  return `<details class="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
    <summary class="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">📎 Read ${n} note${n === 1 ? "" : "s"} (${mode})</summary>
    <ul class="mt-1.5 space-y-0.5 pl-1">${list || "<li>none</li>"}</ul></details>`;
}

function messageEl(msg) {
  const el = document.createElement("div");
  el.className = "fade-in";
  if (msg.role === "user") {
    el.innerHTML = `<div class="flex justify-end"><div class="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm md:max-w-[70%]">${esc(msg.text)}${msg.useGeneral ? '<div class="mt-1 text-[10px] font-medium text-indigo-200">🌐 general knowledge on</div>' : ""}</div></div>`;
  } else {
    el.innerHTML = `<div class="flex gap-3"><img src="/logo.svg" alt="" class="mt-1 hidden h-7 w-7 shrink-0 sm:block" />
      <div class="bubble min-w-0 max-w-full rounded-2xl rounded-tl-md border px-4 py-3 text-sm shadow-sm md:max-w-[80%]"><div class="md body"></div><div class="meta"></div></div></div>`;
    updateAssistant(el, msg);
  }
  return el;
}

function updateAssistant(el, msg, streaming = false) {
  const bubble = el.querySelector(".bubble");
  bubble.className = bubble.className.replace(/border-\S+|bg-\S+|dark:\S+/g, "").trim() + " " +
    (msg.error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
               : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900");
  const body = el.querySelector(".body");
  if (msg.error) body.innerHTML = `<p><b>😕 Hmm, that didn't work.</b></p><p>${esc(msg.text.replace(/^Error:\s*/, ""))}</p>`;
  else if (!msg.text) body.innerHTML = `<div class="flex items-center gap-2 text-slate-400"><span class="dots"><span></span><span></span><span></span></span>Reading ${msg.notesUsed ? msg.notesUsed.length + " notes" : "your notes"}…</div>`;
  else body.innerHTML = renderAnswer(msg.text, msg);
  body.classList.toggle("cursor", streaming && !!msg.text);
  el.querySelector(".meta").innerHTML = msg.error ? "" : notesUsedLine(msg);
}

const scrollDown = () => { const m = $("messages"); m.scrollTop = m.scrollHeight; };

function emptyState() {
  const line = EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)];
  const scope = state.course === "all" ? "all your courses" : `<b>${esc(state.course)}</b> · ${esc(courseName(state.course))}`;
  const count = state.course === "all" ? state.total : state.courses.find((c) => c.id === state.course)?.count ?? 0;
  $("messages").innerHTML = `<div class="empty fade-in mx-auto mt-[8vh] max-w-md text-center">
    <img src="/logo.svg" alt="" class="mx-auto h-14 w-14 drop-shadow-sm" />
    <h2 class="mt-4 text-xl font-bold tracking-tight">${line}</h2>
    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Searching ${scope} (${count} notes). Every answer cites the exact note it came from.</p>
    ${state.source === "samples" ? '<p class="mt-3 text-xs text-slate-400">Pick a question below to see it in action ↓</p>' : ""}
  </div>`;
}

function renderTryRow() {
  const show = state.source === "samples";
  $("tryRow").classList.toggle("hidden", !show);
  $("tryRow").classList.toggle("flex", show);
  $("tryRow").innerHTML = show ? `<span class="shrink-0 self-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Try asking</span>` +
    TRY_ASKING.map((t, i) => `<button type="button" data-try="${i}" class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10">${esc(t.q)}</button>`).join("") : "";
}

function renderStreak() {
  const s = state.streak;
  $("streak").innerHTML = s > 0
    ? `<div class="flex items-center gap-2"><span class="text-xl">🔥</span><div><b class="text-sm">${s}-day study streak</b><div class="opacity-75">${s >= 3 ? "You're on a roll. Keep it going!" : "Come back tomorrow to keep it alive."}</div></div></div>`
    : `<div class="flex items-center gap-2"><span class="text-xl grayscale">🔥</span><div><b class="text-sm">No streak yet</b><div class="opacity-75">Ask one question to light it up.</div></div></div>`;
}

function courseItem(id, name, count) {
  const active = state.course === id;
  return `<button data-course="${id}" class="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}">
    <span class="h-2 w-2 shrink-0 rounded-full ${color(id).dot}"></span>
    <span class="min-w-0 flex-1 truncate">${id === "all" ? "<b class='font-semibold'>All courses</b>" : `<span class="font-mono text-xs font-semibold">${id}</span> <span class="${active ? "" : "text-slate-500 dark:text-slate-400"}">${esc(name)}</span>`}</span>
    <span class="rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-indigo-100 dark:bg-indigo-500/20" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}">${count}</span></button>`;
}

function visibleCourses() {
  return [{ id: "all", name: "All courses", count: state.total }, ...state.courses.filter((c) => c.id !== "unsorted" || c.count > 0)];
}

async function refreshState() {
  const r = await fetch("/api/state").then((r) => r.json());
  Object.assign(state, { courses: r.courses, total: r.total, source: r.source, demo: r.demo, streak: r.streak });
  $("courses").innerHTML = visibleCourses().map((c) => courseItem(c.id, c.name, c.count)).join("");
  $("demo").checked = $("demoMobile").checked = state.demo;
  $("sourceBadge").classList.toggle("hidden", state.source !== "samples");
  $("sourceBadge").innerHTML = `<span class="sm:hidden">${state.demo ? "Demo" : "Samples"}</span><span class="hidden sm:inline">${state.demo ? "Demo mode · sample notes" : "Sample notes"}</span>`;
  const c = state.courses.find((x) => x.id === state.course);
  $("scopeTitle").textContent = state.course === "all" ? "All courses" : `${state.course} · ${c?.name ?? ""}`;
  $("scopeSub").textContent = `${state.course === "all" ? state.total : c?.count ?? 0} notes in scope`;
  $("scopeDot").className = `h-2.5 w-2.5 shrink-0 rounded-full ${color(state.course).dot}`;
  renderStreak();
  renderTryRow();
}

async function selectCourse(id) {
  state.course = id;
  await refreshState();
  const history = await fetch(`/api/chats/${encodeURIComponent(id)}`).then((r) => r.json());
  $("messages").innerHTML = "";
  if (!history.length) emptyState();
  history.forEach((m) => $("messages").appendChild(messageEl(m)));
  scrollDown();
}

function setBusy(b) {
  state.busy = b;
  $("send").disabled = b;
  $("sendLabel").innerHTML = b ? '<span class="dots"><span></span><span></span><span></span></span>' : "Ask";
}

async function ask(question) {
  if (state.busy) return;
  setBusy(true);
  $("messages").querySelector(".empty")?.remove();
  const useGeneral = $("general").checked;
  $("messages").appendChild(messageEl({ role: "user", text: question, useGeneral }));
  const msg = { role: "assistant", text: "" };
  const el = messageEl(msg);
  $("messages").appendChild(el);
  scrollDown();

  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course: state.course, question, useGeneral }) });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Server error (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = chunk.match(/^event: (\w+)/)?.[1];
        const data = JSON.parse(chunk.match(/\ndata: (.*)$/s)?.[1] ?? "null");
        if (ev === "meta") Object.assign(msg, data);
        if (ev === "delta") msg.text += data;
        if (ev === "done") Object.assign(msg, { text: data.text, citations: data.citations });
        if (ev === "error") Object.assign(msg, { text: data.message, error: true });
        updateAssistant(el, msg, ev === "delta" || ev === "meta");
        scrollDown();
      }
    }
  } catch (e) {
    Object.assign(msg, { error: true, text: /fetch|network/i.test(e.message) ? "Can't reach the StudyDeck server. Is it still running?" : e.message });
  }
  updateAssistant(el, msg, false);
  setBusy(false);
  refreshState();
  $("q").focus();
}

// ---- source panel + hover preview ----
const norm = (s) => s.toLowerCase().replace(/[*_`|>#]/g, " ").replace(/[^\p{L}\p{N}.%/+−=-]+/gu, " ").replace(/\s+/g, " ").trim();
const noteCache = new Map();
const getNote = (id) => {
  if (!noteCache.has(id)) {
    const [course, file] = id.split("/");
    noteCache.set(id, fetch(`/api/notes/${encodeURIComponent(course)}/${encodeURIComponent(file)}`).then((r) => (r.ok ? r.json() : null)));
  }
  return noteCache.get(id);
};

/** Find the block (paragraph, bullet, table cell) that contains the quote, else the one sharing the most words. */
function findPassage(root, quote) {
  const blocks = [...root.querySelectorAll("p, li, td, h1, h2, h3, blockquote")];
  const q = norm(quote);
  let best = blocks.find((b) => norm(b.textContent).includes(q));
  if (!best) {
    const words = new Set(q.split(" "));
    let top = 0;
    for (const b of blocks) {
      const s = norm(b.textContent).split(" ").filter((w) => words.has(w)).length;
      if (s > top) { top = s; best = b; }
    }
  }
  if (best?.tagName === "TD" && best.cellIndex > 0) return best; // keep the notes column
  return best;
}

async function openSource(id, quote) {
  const note = await getNote(id);
  if (!note) return;
  $("source").classList.remove("hidden");
  $("source").classList.add("flex", "slide-in");
  $("sourceTitle").textContent = note.label + (note.sample ? "  · sample" : "");
  $("sourceBody").innerHTML = renderMarkdown(note.body);
  $("sourceBody").scrollTop = 0;
  const best = quote && findPassage($("sourceBody"), quote);
  if (best) { best.classList.add("hl"); best.scrollIntoView({ block: "center", behavior: "smooth" }); }
}

function closeSource() {
  $("source").classList.add("hidden");
  $("source").classList.remove("flex");
}

let previewFor = null;
async function showPreview(chip) {
  previewFor = chip;
  const p = $("preview");
  const r = chip.getBoundingClientRect();
  const place = () => {
    p.style.left = Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + "px";
    p.style.top = (r.top > 140 ? r.top - p.offsetHeight - 8 : r.bottom + 8) + "px";
  };
  const head = `<div class="mb-1 font-semibold opacity-70">${esc(chip.dataset.label)}</div>`;
  p.innerHTML = chip.dataset.why ? head + `⚠ ${esc(chip.dataset.why)}` : head + "…";
  p.classList.remove("hidden");
  place();
  if (!chip.dataset.id || chip.dataset.why) return;
  const note = await getNote(chip.dataset.id);
  if (previewFor !== chip || !note) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = renderMarkdown(note.body);
  const passage = chip.dataset.quote ? findPassage(tmp, chip.dataset.quote) : null;
  const text = passage ? passage.textContent : note.body.slice(0, 200);
  p.innerHTML = head + `“${esc(text.length > 280 ? text.slice(0, 280) + "…" : text)}”<div class="mt-1.5 text-[10px] opacity-60">Click to open the note</div>`;
  place();
}
function hidePreview() { previewFor = null; $("preview").classList.add("hidden"); }

// ---- course picker (⌘K) ----
let pickerIndex = 0;
function renderPicker() {
  const f = $("pickerInput").value.toLowerCase();
  const items = visibleCourses().filter((c) => `${c.id} ${c.name}`.toLowerCase().includes(f));
  pickerIndex = Math.min(pickerIndex, Math.max(0, items.length - 1));
  $("pickerList").innerHTML = items.map((c, i) => `<button data-pick="${c.id}" class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === pickerIndex ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}">
      <span class="h-2 w-2 rounded-full ${color(c.id).dot}"></span><span class="flex-1">${c.id === "all" ? "All courses" : `<span class="font-mono text-xs font-semibold">${c.id}</span> ${esc(c.name)}`}</span><span class="text-xs text-slate-400">${c.count}</span></button>`).join("")
    || '<div class="px-3 py-6 text-center text-sm text-slate-400">No course matches. Did you mean ECON? 🤓</div>';
  return items;
}
function openPicker() {
  $("picker").classList.remove("hidden");
  $("picker").classList.add("flex");
  $("pickerInput").value = "";
  pickerIndex = Math.max(0, visibleCourses().findIndex((c) => c.id === state.course));
  renderPicker();
  $("pickerInput").focus();
}
function closePicker() { $("picker").classList.add("hidden"); $("picker").classList.remove("flex"); }
function pick(id) { closePicker(); if (id) selectCourse(id); }

// ---- events ----
$("courses").addEventListener("click", (e) => { const b = e.target.closest("[data-course]"); if (b) selectCourse(b.dataset.course); });
$("scopeBtn").addEventListener("click", () => { if (innerWidth < 768) openPicker(); });
$("form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) { $("q").value = ""; ask(q); } });
$("tryRow").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-try]");
  if (!b || state.busy) return;
  const t = TRY_ASKING[+b.dataset.try];
  if (t.course !== state.course) await selectCourse(t.course);
  ask(t.q);
});
$("messages").addEventListener("click", (e) => {
  const b = e.target.closest(".cite");
  if (!b) return;
  hidePreview();
  if (b.dataset.id) openSource(b.dataset.id, b.dataset.quote);
});
$("messages").addEventListener("mouseover", (e) => { const b = e.target.closest(".cite"); if (b && b !== previewFor) showPreview(b); });
$("messages").addEventListener("mouseout", (e) => { if (e.target.closest(".cite") && !e.relatedTarget?.closest?.(".cite")) hidePreview(); });
$("messages").addEventListener("scroll", hidePreview);
$("closeSource").addEventListener("click", closeSource);
$("clearBtn").addEventListener("click", async () => {
  if (!confirm(`Clear the chat for ${courseName(state.course)}?`)) return;
  await fetch(`/api/chats/${encodeURIComponent(state.course)}`, { method: "DELETE" });
  selectCourse(state.course);
});
for (const id of ["demo", "demoMobile"]) {
  $(id).addEventListener("change", async (e) => {
    await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demo: e.target.checked }) });
    noteCache.clear();
    closeSource();
    selectCourse(state.course);
  });
}
document.querySelectorAll(".theme-toggle").forEach((b) => b.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
}));
$("syncBtn").addEventListener("click", async () => {
  const s = $("syncStatus");
  $("syncBtn").disabled = true;
  $("syncBtn").innerHTML = '<span class="dots"><span></span><span></span><span></span></span> Syncing';
  s.classList.remove("hidden");
  s.textContent = "Pulling the last 14 days from Granola. This can take a minute or two…";
  try {
    const r = await fetch("/api/sync", { method: "POST" }).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    s.textContent = [r.added.length || r.moved.length ? `✅ Added ${r.added.length}, sorted ${r.moved.length}` : "✅ Already up to date",
      ...r.added.map((a) => `+ ${a.course}: ${a.title}`), ...r.moved.map((a) => `→ ${a.course}: ${a.title} (sorted)`), r.skipped.length ? `· ${r.skipped.length} skipped (already synced or empty)` : "",
      ...r.errors.map((e) => `⚠ ${e.title}: ${e.error}`)].filter(Boolean).join("\n");
    noteCache.clear();
    await selectCourse(state.course);
  } catch (e) {
    s.textContent = `😕 Sync didn't work: ${e.message}`;
  }
  $("syncBtn").disabled = false;
  $("syncBtn").textContent = "Sync from Granola";
});

$("pickerInput").addEventListener("input", () => { pickerIndex = 0; renderPicker(); });
$("pickerList").addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) pick(b.dataset.pick); });
$("picker").addEventListener("click", (e) => { if (e.target === $("picker")) closePicker(); });
document.addEventListener("keydown", (e) => {
  const pickerOpen = !$("picker").classList.contains("hidden");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pickerOpen ? closePicker() : openPicker(); return; }
  if (pickerOpen) {
    if (e.key === "Escape") closePicker();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); pickerIndex += e.key === "ArrowDown" ? 1 : -1; pickerIndex = Math.max(0, pickerIndex); renderPicker(); }
    if (e.key === "Enter") { e.preventDefault(); pick(renderPicker()[pickerIndex]?.id); }
    return;
  }
  if (e.key === "Escape") closeSource();
  if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); }
});

selectCourse("all").then(() => $("q").focus());
