function chunkText(text, maxChars = 1800) {
  const s = clean(text);
  if (!s) return [];

  // Prefer splitting on paragraph breaks first
  const paras = s.split(/\n\s*\n/);

  const chunks = [];
  let buf = "";

  const pushBuf = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const p of paras) {
    const para = p.trim();
    if (!para) continue;

    // If a single paragraph is too big, split it hard
    if (para.length > maxChars) {
      pushBuf();
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }

    // Try to pack paragraphs into maxChars
    if (!buf) {
      buf = para;
    } else if ((buf.length + 2 + para.length) <= maxChars) {
      buf += "\n\n" + para;
    } else {
      pushBuf();
      buf = para;
    }
  }

  pushBuf();
  return chunks;
}

function clean(text) {
  return (text || "")
    .replace(/\u200B/g, "")        // zero-width space
    .replace(/\r\n/g, "\n")        // normalize Windows newlines
    .replace(/[ \t]+\n/g, "\n")    // trim trailing spaces before newline (safer)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTitleGuess() {
  const t = document.title || "";
  if (t && !t.toLowerCase().includes("chatgpt")) return t;
  return "ChatGPT Conversation";
}

function getChatUrl() {
  return location.href;
}

function getShareUrl() {
  if (location.pathname.startsWith("/share/")) return location.href;
  const a = Array.from(document.querySelectorAll("a[href*='/share/']")).find(Boolean);
  return a?.href || "";
}

// Best-effort project detection.
// ChatGPT changes UI often, so we try multiple hints.
function detectProjectName() {
  // 1) Try any obvious "Project" label in UI
  const candidates = Array.from(document.querySelectorAll("header, nav, main"))
    .flatMap((root) => Array.from(root.querySelectorAll("a, button, div, span")))
    .map((el) => (el.innerText || "").trim())
    .filter((t) => t && t.length <= 60);

  // Common project names show up as a small label near top/side.
  // We'll pick the first thing that looks like a project tag.
  const blacklist = new Set([
    "ChatGPT", "Search", "New chat", "Settings", "Help", "Upgrade",
    "Share", "Copy", "Edit", "Regenerate", "Stop generating"
  ]);

  // Heuristic: find a short tag-like string that isn't generic
  for (const t of candidates) {
    const low = t.toLowerCase();
    if (blacklist.has(t)) continue;
    if (low.includes("chatgpt")) continue;
    if (t.length < 3) continue;

    // If page title includes "Project" or you are in a project workspace,
    // usually a tag appears like "HowTos" etc. Your screenshot had "HowTos".
    if (/^[A-Za-z0-9 _-]{3,30}$/.test(t)) {
      // Avoid grabbing random button text
      if (["Table", "By Project", "By Status"].includes(t)) continue;
      return t;
    }
  }

  // 2) Fallback: use hostname path hint
  return "General";
}

function extractMessages() {
  const main = document.querySelector("main") || document.body;

  const roleNodes = main.querySelectorAll("[data-message-author-role]");
  const raw_messages = [];

  if (roleNodes.length) {
    let msgIndex = 0;
    roleNodes.forEach((node) => {
      const role = node.getAttribute("data-message-author-role") || "unknown";
      const text = clean(node.innerText);
      if (!text) return;

      raw_messages.push({
        msg_index: msgIndex++,
        role,
        text
      });
    });
  } else {
    // fallback if roleNodes not present
    const articles = Array.from(main.querySelectorAll("article"));
    let msgIndex = 0;

    for (const a of articles) {
      const text = clean(a.innerText);
      if (!text) continue;

      raw_messages.push({
        msg_index: msgIndex++,
        role: "unknown",
        text
      });
    }
  }

  // Expand to chunked messages for Notion-safe append
  const messages = [];
  for (const m of raw_messages) {
    const chunks = chunkText(m.text, 1800); // tweak 1500–2000 if you want
    const chunkCount = Math.max(1, chunks.length);

    if (!chunks.length) continue;

    chunks.forEach((chunkText, chunkIndex) => {
      messages.push({
        msg_index: m.msg_index,           // ✅ stable index for append-new-messages logic
        chunk_index: chunkIndex,          // ✅ ordering within a message
        chunk_count: chunkCount,          // ✅ optional formatting
        role: m.role,
        text: chunkText
      });
    });
  }

  return { raw_messages, messages };
}

function buildFullText(messages) {
  return clean(
    messages
      .map((m) => `${(m.role || "unknown").toUpperCase()}:\n${m.text}`)
      .join("\n\n---\n\n")
  );
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "COLLECT_CHAT_V2") return;

  try {
    const {raw_messages, messages} = extractMessages();
    const full_text = buildFullText(raw_messages.map(m => ({
      index: m.msg_index,
      role: m.role,
      text: m.text
    })));

    if (!full_text) {
      sendResponse({
        ok: false,
        error: "No conversation text found. Open a chat conversation and scroll a bit, then try again."
      });
      return;
    }

    const payload = {
      ok: true,
      title: getTitleGuess(),
      project: detectProjectName(),
      chat_url: getChatUrl(),
      share_url: getShareUrl(),
      message_count: raw_messages.length,
      last_message_index: raw_messages.length ? (raw_messages.length - 1) : 0,
      block_count: messages.length, // total chunk blocks to append
      messages,
      full_text
    };

    sendResponse(payload);
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
});
