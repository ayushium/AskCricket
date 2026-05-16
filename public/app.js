// Sorted longest-first so multi-word names (e.g. "V Kohli") match before single-word substrings
const KNOWN_PLAYERS = [
  "V Kohli","JJ Bumrah","Rashid Khan","MS Dhoni","RG Sharma","RD Gaikwad",
  "SA Yadav","HH Pandya","GJ Maxwell","F du Plessis","TM Head","YBK Jaiswal",
  "Shubman Gill","DA Warner","H Klaasen","SP Narine","AD Russell","RA Jadeja",
  "R Ashwin","JC Buttler","SV Samson","YS Chahal","TA Boult","K Rabada",
  "MA Starc","PJ Cummins","Arshdeep Singh","Mohammed Siraj","Kuldeep Yadav",
  "Avesh Khan","DL Chahar","LS Livingstone","Tilak Varma","KD Karthik",
].sort((a, b) => b.length - a.length);

const STAT_CARDS = [
  { label: "Matches",    value: "145",    icon: "🏟️",  border: "border-blue-200",    num: "text-blue-600"    },
  { label: "Deliveries", value: "34,388", icon: "🏏",  border: "border-emerald-200", num: "text-emerald-600" },
  { label: "Players",    value: "222",    icon: "👤",  border: "border-violet-200",  num: "text-violet-600"  },
  { label: "Teams",      value: "10",     icon: "🏆",  border: "border-amber-200",   num: "text-amber-600"   },
  { label: "Wickets",    value: "1,756",  icon: "🎯",  border: "border-rose-200",    num: "text-rose-600"    },
  { label: "Venues",     value: "14",     icon: "📍",  border: "border-teal-200",    num: "text-teal-600"    },
];

const form        = document.getElementById("ask-form");
const input       = document.getElementById("q");
const chatHistory = document.getElementById("chat-history");
const trace       = document.getElementById("trace");
const dashboard   = document.getElementById("stats-dashboard");
const submitBtn   = document.getElementById("submit-btn");
const clearBtn    = document.getElementById("clear-btn");

let isAsking     = false;
let activeSource = null;

(function initDashboard() {
  const grid = document.getElementById("stat-cards");
  STAT_CARDS.forEach((card, i) => {
    const el = document.createElement("div");
    el.className = `count-up flex items-center gap-2.5 bg-white border ${card.border} rounded-xl px-4 py-2.5 cursor-default shadow-sm`;
    el.style.animationDelay = `${i * 60}ms`;
    el.innerHTML = `
      <span class="text-base">${card.icon}</span>
      <span class="font-bold ${card.num} text-base">${escHtml(card.value)}</span>
      <span class="text-xs text-gray-500">${escHtml(card.label)}</span>
    `;
    grid.appendChild(el);
  });
})();

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (q && !isAsking) ask(q);
});

clearBtn.addEventListener("click", () => {
  chatHistory.querySelectorAll(".chat-bubble").forEach(el => el.remove());
  dashboard.classList.remove("hidden");
  trace.innerHTML = "";
});

document.querySelectorAll(".suggestion").forEach(btn =>
  btn.addEventListener("click", () => { input.value = btn.querySelector("span:nth-child(2)").textContent.trim(); form.requestSubmit(); })
);

function ask(q) {
  isAsking = true;
  submitBtn.disabled = true;
  dashboard.classList.add("hidden");

  appendUserBubble(q);
  input.value = "";
  trace.innerHTML = "";
  addChip("🤔", "Thinking…", true);

  const { setFinalAnswer, setError } = appendAssistantBubble();

  if (activeSource) activeSource.close();
  const es = new EventSource(`/api/ask?q=${encodeURIComponent(q)}`);
  activeSource = es;

  es.addEventListener("tool_call", (e) => {
    const data = JSON.parse(e.data);
    addChip("🔧", `${data.name}(${prettyArgs(data.args)})`);
  });

  es.addEventListener("final", (e) => {
    const { payload } = JSON.parse(e.data);
    addChip("✍️", "Writing insight…");
    setTimeout(() => {
      setFinalAnswer(payload);
      trace.innerHTML = "";
      isAsking = false;
      submitBtn.disabled = false;
      scrollBottom();
    }, 300);
    es.close();
    activeSource = null;
  });

  es.addEventListener("error", () => {
    setError("Something went wrong — please try again.");
    trace.innerHTML = "";
    isAsking = false;
    submitBtn.disabled = false;
    es.close();
    activeSource = null;
  });
}

function appendUserBubble(q) {
  const el = document.createElement("div");
  el.className = "chat-bubble fade-up flex justify-end";
  el.innerHTML = `
    <div class="max-w-xs lg:max-w-md bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
      ${escHtml(q)}
    </div>
  `;
  chatHistory.appendChild(el);
  scrollBottom();
}

function appendAssistantBubble() {
  const wrap = document.createElement("div");
  wrap.className = "chat-bubble fade-up flex gap-3 items-start";
  wrap.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm text-sm">🏏</div>
    <div class="flex-1 min-w-0">
      <div class="bubble-body">
        <div class="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-400 text-sm shadow-sm">
          <span class="dot">•</span><span class="dot">•</span><span class="dot">•</span>
        </div>
      </div>
    </div>
  `;
  chatHistory.appendChild(wrap);
  scrollBottom();

  const bodyEl = wrap.querySelector(".bubble-body");

  return {
    setFinalAnswer(payload) {
      bodyEl.innerHTML = buildAnswerCard(payload);
      wireCard(bodyEl, payload);
    },
    setError(msg) {
      bodyEl.innerHTML = `<p class="text-red-500 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">${escHtml(msg)}</p>`;
    },
  };
}

function buildAnswerCard(p) {
  return `
    <div class="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div class="px-5 pt-5 pb-3 border-b border-gray-100">
        <p class="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Insight</p>
        <h2 class="font-bold text-gray-900 text-base leading-snug">${escHtml(p.headline || "")}</h2>
      </div>
      <div class="px-5 py-4 space-y-4">
        <p class="text-gray-600 text-sm leading-relaxed">${linkifyPlayers(escHtml(p.insight || ""))}</p>
        <div class="chart-slot"></div>
        ${p.sources ? `
          <div class="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            <span>📚</span><span>${escHtml(p.sources)}</span>
          </div>` : ""}
      </div>
      ${buildFollowups(p.followups || [])}
    </div>
  `;
}

function buildFollowups(followups) {
  if (!followups.length) return "";
  return `
    <div class="border-t border-gray-100 px-5 py-3">
      <p class="text-xs font-medium text-gray-400 mb-2">Ask next</p>
      <div class="flex flex-wrap gap-2">
        ${followups.map(f => `
          <button class="followup text-xs px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100
                         border border-emerald-200 text-emerald-700 transition-colors">
            ${escHtml(f)}
          </button>`).join("")}
      </div>
    </div>
  `;
}

function wireCard(container, payload) {
  container.querySelectorAll(".followup").forEach(btn =>
    btn.addEventListener("click", () => { input.value = btn.textContent.trim(); form.requestSubmit(); })
  );
  container.querySelectorAll(".player-link").forEach(link =>
    link.addEventListener("click", () => {
      input.value = `How did ${link.dataset.player} perform in IPL 2024?`;
      form.requestSubmit();
    })
  );
  const slot = container.querySelector(".chart-slot");
  if (slot && payload?.chart?.type !== "none" && payload?.chart?.values?.length) {
    renderChart(payload.chart, slot);
  }
}

function linkifyPlayers(html) {
  KNOWN_PLAYERS.forEach(player => {
    const esc = player.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(`\\b(${esc})\\b`, "g"),
      `<span class="player-link" data-player="${escHtml(player)}">$1</span>`
    );
  });
  return html;
}

function renderChart({ type, labels, values, unit }, container) {
  const W = 340, H = 130, PX = 24, PY = 16;
  const innerW = W - PX * 2, innerH = H - PY * 2;
  const max = Math.max(...values, 1);
  const color = "#059669";
  let svg = "";

  if (type === "bar") {
    const gap  = innerW / values.length;
    const barW = Math.max(6, gap - 12);
    svg = values.map((v, i) => {
      const x = PX + i * gap + (gap - barW) / 2;
      const h = Math.max(4, (v / max) * innerH);
      const y = PY + innerH - h;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${color}" opacity="0.8"/>
        <text x="${x + barW/2}" y="${y - 5}" font-size="10" fill="#6b7280" text-anchor="middle">${v}</text>
        <text x="${x + barW/2}" y="${H - 2}" font-size="9"  fill="#9ca3af" text-anchor="middle">${(labels[i]||"").slice(0,9)}</text>
      `;
    }).join("");
  } else if (type === "line") {
    const pts = values.map((v, i) => {
      const x = PX + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = PY + innerH - (v / max) * innerH;
      return `${x},${y}`;
    }).join(" ");
    const dots = values.map((v, i) => {
      const x = PX + (i / Math.max(values.length - 1, 1)) * innerW;
      const y = PY + innerH - (v / max) * innerH;
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}" stroke="white" stroke-width="1.5"/>
              <text x="${x}" y="${y - 9}" font-size="10" fill="#6b7280" text-anchor="middle">${v}</text>`;
    }).join("");
    svg = `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts}"/>${dots}`;
  }

  container.innerHTML = `
    <div class="bg-gray-50 rounded-xl p-3 border border-gray-100">
      ${unit ? `<p class="text-xs text-gray-400 mb-2">${escHtml(unit)}</p>` : ""}
      <svg viewBox="0 0 ${W} ${H}" class="w-full max-w-sm">${svg}</svg>
    </div>
  `;
}

function addChip(icon, text, isLoading = false) {
  const span = document.createElement("span");
  span.className = "chip-enter flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-500 shadow-sm";
  span.innerHTML = isLoading
    ? `${escHtml(icon)} ${escHtml(text)}<span class="dot ml-0.5">•</span><span class="dot">•</span><span class="dot">•</span>`
    : `${escHtml(icon)} ${escHtml(text)}`;
  trace.appendChild(span);
}

function prettyArgs(args) {
  return Object.entries(args).slice(0, 2).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(", ");
}

function scrollBottom() {
  setTimeout(() => chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: "smooth" }), 60);
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
