// StudyDeck front end: plain JS, no build step.
const $ = (id) => document.getElementById(id);
const state = { course: "all", courses: [], total: 0, busy: false };

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");

// Must match src/citations.ts
const CITE_RE = /\[([A-Za-z0-9]+) (\d{4}-\d{2}-\d{2}): ([^\]|]+?)(?:\s*\|\s*(?:&quot;|["“])([^\]]*?)(?:&quot;|["”]))?\s*\]/g;

/** Minimal markdown: headings, bullets, tables, blockquotes, bold. Input is escaped first. */
function renderMarkdown(src) {
  const lines = esc(src).split("\n");
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
  for (const line of lines) {
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

/** Render an assistant answer: markdown + clickable citation chips + general-knowledge labels. */
function renderAnswer(text, msg) {
  const byLabel = Object.fromEntries((msg.notesUsed || []).map((n) => [n.label, n.id]));
  const statusByRaw = Object.fromEntries((msg.citations || []).map((c) => [c.raw, c]));
  let html = renderMarkdown(text);
  html = html.replace(CITE_RE, (raw, course, date, topic, quote) => {
    const label = `${course} ${date}: ${topic.trim()}`;
    const decoded = raw.replace(/&quot;/g, '"');
    const info = statusByRaw[decoded];
    const id = info?.noteId || byLabel[label];
    const bad = info && info.status !== "ok";
    const title = bad ? (info.status === "unknown_note" ? "Could not match this citation to a note that was sent" : "Quote not found verbatim in the note") : "Open source note";
    const cls = bad ? "bg-red-50 text-red-700 border-red-200" : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100";
    return `<button class="cite mx-0.5 inline-flex items-center rounded border px-1.5 py-0 text-[11px] font-medium align-baseline ${cls}" title="${esc(title)}"
      data-id="${id ? esc(id) : ""}" data-quote="${quote ? esc(quote.replace(/&quot;/g, '"')) : ""}">${bad ? "⚠ " : ""}${esc(label)}</button>`;
  });
  html = html.replace(/\(General knowledge\)/g, '<span class="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">General knowledge</span>');
  html = html.replace(/Not in your notes\.?/g, (m) => `<span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700">${m}</span>`);
  return html;
}

function notesUsedLine(msg) {
  if (!msg.notesUsed) return "";
  const n = msg.notesUsed.length;
  const mode = msg.mode === "ranked" ? "top matches by keyword + recency" : "all notes in scope";
  const list = msg.notesUsed.map((x) => esc(x.label)).join("<br>");
  return `<details class="mt-2 text-xs text-slate-500"><summary class="cursor-pointer select-none">Used ${n} note${n === 1 ? "" : "s"} (${mode})</summary><div class="mt-1 pl-3">${list || "none"}</div></details>`;
}

function messageEl(msg) {
  const el = document.createElement("div");
  if (msg.role === "user") {
    el.className = "flex justify-end";
    el.innerHTML = `<div class="max-w-[75%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">${esc(msg.text)}${msg.useGeneral ? '<div class="mt-1 text-[10px] text-indigo-200">general knowledge on</div>' : ""}</div>`;
  } else {
    el.className = "flex";
    el.innerHTML = `<div class="max-w-[85%] rounded-2xl rounded-bl-sm border px-4 py-3 text-sm ${msg.error ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white"}">
      <div class="md body"></div><div class="meta"></div></div>`;
    updateAssistant(el, msg);
  }
  return el;
}

function updateAssistant(el, msg, streaming = false) {
  const body = el.querySelector(".body");
  body.innerHTML = msg.text ? renderAnswer(msg.text, msg) : '<span class="text-slate-400">Reading your notes…</span>';
  body.classList.toggle("cursor", streaming);
  el.querySelector(".meta").innerHTML = notesUsedLine(msg);
}

const scrollDown = () => { const m = $("messages"); m.scrollTop = m.scrollHeight; };

function emptyState() {
  const c = state.course === "all" ? "all your courses" : state.course;
  $("messages").innerHTML = `<div class="mx-auto mt-16 max-w-md text-center text-sm text-slate-500">
    <div class="text-3xl mb-2">📚</div>Ask anything about <b>${esc(c)}</b>.<br>
    Every answer cites your notes, and if your notes don't cover it you'll get <b>“Not in your notes”</b>.</div>`;
}

async function loadCourses() {
  const r = await fetch("/api/courses").then((r) => r.json());
  state.courses = r.courses; state.total = r.total;
  const item = (id, name, count) => `<button data-course="${id}" class="course w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left ${state.course === id ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-100"}">
      <span class="truncate">${id === "all" ? "All courses" : `<span class="font-mono text-xs">${id}</span> <span class="text-slate-500">${esc(name)}</span>`}</span>
      <span class="ml-2 rounded-full bg-slate-100 px-2 text-xs text-slate-600">${count}</span></button>`;
  $("courses").innerHTML = item("all", "All courses", r.total) +
    r.courses.filter((c) => c.id !== "unsorted" || c.count > 0).map((c) => item(c.id, c.name, c.count)).join("");
}

async function selectCourse(id) {
  state.course = id;
  const c = state.courses.find((x) => x.id === id);
  $("scopeTitle").textContent = id === "all" ? "All courses" : `${id} · ${c?.name ?? ""}`;
  $("scopeSub").textContent = `${id === "all" ? state.total : c?.count ?? 0} notes in scope`;
  await loadCourses();
  const history = await fetch(`/api/chats/${encodeURIComponent(id)}`).then((r) => r.json());
  $("messages").innerHTML = "";
  if (!history.length) emptyState();
  history.forEach((m) => $("messages").appendChild(messageEl(m)));
  scrollDown();
}

async function ask(question) {
  if (state.busy) return;
  state.busy = true; $("send").disabled = true;
  if ($("messages").querySelector(".mt-16")) $("messages").innerHTML = "";
  const useGeneral = $("general").checked;
  $("messages").appendChild(messageEl({ role: "user", text: question, useGeneral }));
  const msg = { role: "assistant", text: "" };
  const el = messageEl(msg);
  $("messages").appendChild(el);
  updateAssistant(el, msg, true);
  scrollDown();

  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course: state.course, question, useGeneral }) });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = chunk.match(/^event: (\w+)/)?.[1]; const data = JSON.parse(chunk.match(/\ndata: (.*)$/s)?.[1] ?? "null");
        if (ev === "meta") Object.assign(msg, data);
        if (ev === "delta") msg.text += data;
        if (ev === "done") { msg.text = data.text; msg.citations = data.citations; }
        if (ev === "error") { msg.text = `Error: ${data.message}`; msg.error = true; }
        updateAssistant(el, msg, ev !== "done" && ev !== "error");
        scrollDown();
      }
    }
  } catch (e) {
    msg.text = `Error: ${e.message}`; msg.error = true;
  }
  updateAssistant(el, msg, false);
  if (msg.error) el.firstElementChild.className = "max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";
  state.busy = false; $("send").disabled = false; $("q").focus();
}

// ---- source panel ----
const norm = (s) => s.toLowerCase().replace(/[*_`|>#]/g, " ").replace(/[^\p{L}\p{N}.%/+−=-]+/gu, " ").replace(/\s+/g, " ").trim();

async function openSource(id, quote) {
  const [course, file] = id.split("/");
  const note = await fetch(`/api/notes/${encodeURIComponent(course)}/${encodeURIComponent(file)}`).then((r) => r.json());
  $("source").classList.remove("hidden"); $("source").classList.add("flex");
  $("sourceTitle").textContent = note.label + (note.sample ? "  (sample)" : "");
  $("sourceBody").innerHTML = renderMarkdown(note.body);
  if (!quote) return;
  const q = norm(quote);
  const blocks = [...$("sourceBody").querySelectorAll("p, li, td, h1, h2, h3, blockquote")];
  let best = blocks.find((b) => norm(b.textContent).includes(q));
  if (!best) { // fall back to the block sharing the most words with the quote
    const words = new Set(q.split(" "));
    let top = 0;
    for (const b of blocks) { const s = norm(b.textContent).split(" ").filter((w) => words.has(w)).length; if (s > top) { top = s; best = b; } }
  }
  if (best) { best.classList.add("hl"); best.scrollIntoView({ block: "center", behavior: "smooth" }); }
}

// ---- events ----
$("courses").addEventListener("click", (e) => { const b = e.target.closest("[data-course]"); if (b) selectCourse(b.dataset.course); });
$("form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) { $("q").value = ""; ask(q); } });
$("messages").addEventListener("click", (e) => {
  const b = e.target.closest(".cite"); if (!b) return;
  if (!b.dataset.id) return alert("This citation does not match any note that was sent to Claude.");
  openSource(b.dataset.id, b.dataset.quote);
});
$("closeSource").addEventListener("click", () => { $("source").classList.add("hidden"); $("source").classList.remove("flex"); });
$("clearBtn").addEventListener("click", async () => {
  if (!confirm(`Clear chat history for ${state.course === "all" ? "All courses" : state.course}?`)) return;
  await fetch(`/api/chats/${encodeURIComponent(state.course)}`, { method: "DELETE" });
  selectCourse(state.course);
});
$("syncBtn").addEventListener("click", async () => {
  $("syncBtn").disabled = true; $("syncStatus").textContent = "Syncing the last 14 days from Granola… this can take a few minutes.";
  try {
    const r = await fetch("/api/sync", { method: "POST" }).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    $("syncStatus").textContent = [`Added ${r.added.length} · skipped ${r.skipped.length} · errors ${r.errors.length}`,
      ...r.added.map((a) => `+ ${a.course}: ${a.title}`), ...r.errors.map((e) => `! ${e.title}: ${e.error}`)].join("\n");
    await selectCourse(state.course);
  } catch (e) { $("syncStatus").textContent = `Sync failed: ${e.message}`; }
  $("syncBtn").disabled = false;
});

selectCourse("all");
