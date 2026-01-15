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
  const messages = [];

  if (roleNodes.length) {
    roleNodes.forEach((node, idx) => {
      const role = node.getAttribute("data-message-author-role") || "unknown";
      const content =
        node.querySelector(".markdown") ||
        node.querySelector('[data-testid="message-text"]') ||
        node;

      const text = clean(content.innerText);
      if (text.includes("Regenerate") && text.includes("Copy")) return;
      if (text) {
        messages.push({
          index: idx,
          role,
          text
        });
      }
    });
    if (messages.length < 2) {
      const turns = main.querySelectorAll('[data-testid="conversation-turn"]');
      turns.forEach((turn, idx) => {
        const text = clean(turn.innerText);
        if (text.includes("Regenerate") && text.includes("Copy")) return;
        if (text) messages.push({ index: idx, role: "unknown", text });
      });
    }
  } else {
    // Fallback: try article blocks
    const articles = Array.from(main.querySelectorAll("article"));
    let idx = 0;
    for (const a of articles) {
      const text = clean(a.innerText);
      if (text.includes("Regenerate") && text.includes("Copy")) continue ;
      if (!text) continue;
      messages.push({ index: idx++, role: "unknown", text });
    }
  }

  return messages;
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
    const messages = extractMessages();
    const full_text = buildFullText(messages);

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
      message_count: messages.length,
      last_message_index: messages.length ? (messages.length - 1) : 0,
      messages,
      full_text
    };

    sendResponse(payload);
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }
});
