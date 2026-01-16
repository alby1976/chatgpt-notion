const DEFAULT_WEBHOOK = "https://hook.us2.make.com/469gkeogly4da1um5vpf5yl80937n4ie";
const STORAGE_KEY = "makeWebhook";

const webhookInput = document.getElementById("webhook");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");

function clean(text) {
  return (text || "")
    .replace(/\u200B/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function simpleFingerprint(s) {
  // light-weight hash (not crypto, but stable)
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0); // unsigned
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function isValidWebhook(url) {
  try {
    const u = new URL(url);
    return u.hostname.startsWith("hook.") && u.pathname.length > 1;
  } catch {
    return false;
  }
}

function getWebhookFromInput() {
  return webhookInput.value.trim();
}

function saveWebhook(url) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: url }, () => resolve());
  });
}

function loadWebhook() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res[STORAGE_KEY] || ""));
  });
}

(async function init() {
  const saved = await loadWebhook();
  webhookInput.value = saved || DEFAULT_WEBHOOK;
})();

saveBtn.addEventListener("click", async () => {
  const webhook = getWebhookFromInput();
  if (!isValidWebhook(webhook)) {
    setStatus("❌ Invalid webhook URL.\nExample: https://hook.us2.make.com/xxxx");
    return;
  }
  await saveWebhook(webhook);
  setStatus("✅ Webhook saved.");
});

testBtn.addEventListener("click", async () => {
  const webhook = getWebhookFromInput();
  if (!isValidWebhook(webhook)) {
    setStatus("❌ Invalid webhook URL.\nExample: https://hook.us2.make.com/xxxx");
    return;
  }
  await saveWebhook(webhook);

  setStatus("Testing webhook (ping)…");

  try {
    const payload = {
      ping: true,
      source: "ChatGPT Extension",
      sent_at: new Date().toISOString(),
      note: "Ping test from extension"
    };

    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      setStatus(`❌ Test failed: ${r.status}\n${t}`);
      return;
    }

    setStatus("✅ Test success! (Make received ping; should log it)");
  } catch (e) {
    setStatus("❌ Network error during test:\n" + String(e));
  }
});

sendBtn.addEventListener("click", async () => {
  const webhook = getWebhookFromInput();
  if (!isValidWebhook(webhook)) {
    setStatus("❌ Invalid webhook URL.\nExample: https://hook.us2.make.com/xxxx");
    return;
  }
  await saveWebhook(webhook);

  setStatus("Collecting conversation…");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("❌ No active tab found.");
    return;
  }
  if (!tab.url?.startsWith("https://chatgpt.com/")) {
    setStatus("❌ Open a ChatGPT conversation tab first.");
    return;
  }


  // Helper: send message to content script
  const collectChat = () =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: "COLLECT_CHAT_V2" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });

  // Helper: inject content script into current tab (if needed)
  const injectContentScript = () =>
    new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });

  let response;
  try {
    // First try (fast path)
    response = await collectChat();
  } catch (err) {
    // If content script isn't present, inject then retry
    const msg = String(err?.message || err);

    // This text is the usual indicator that there is no listener
    const looksLikeNoReceiver =
      msg.includes("Receiving end does not exist") ||
      msg.includes("Could not establish connection") ||
      msg.includes("No receiving end");

    if (!looksLikeNoReceiver) {
      setStatus("❌ Could not read the page.\n" + msg);
      return;
    }

    setStatus("Content script missing — injecting…");

    try {
      await injectContentScript();
      // Retry after injection
      response = await collectChat();
    } catch (err2) {
      setStatus("❌ Could not inject/read the page.\n" + String(err2?.message || err2));
      return;
    }
  }

  if (!response?.ok) {
    setStatus("❌ Failed to collect chat.\n" + (response?.error || ""));
    return;
  }

  setStatus("Sending to Make…");

  try {
    // Build a stable fingerprint so Make/Notion can dedupe + merge records
	const firstTurns = (response.messages || [])
      .slice(0, 6) // first 6 turns (stable identity)
      .map(m => `${m.role}:${clean(m.text)}`)
      .join("\n");
	if (!firstTurns) {
	  setStatus("❌ Conversation not fully loaded yet. Scroll a bit and try again.");
	  return;
	}
  
    const base =
	  clean(response.project || "") + "\n" +
	  clean(response.title || "") + "\n" +
	  firstTurns;
    const fingerprint = simpleFingerprint(clean(base));	
    const payload = {
      ping: false,
	  fingerprint, 
      source: "ChatGPT",
      sent_at: new Date().toISOString(),
      
      // identity + routing
      title: response.title || "ChatGPT Conversation",
      project: response.project || "General",
      chat_url: response.chat_url || "",
      share_url: response.share_url || "",

      // summary + message model (for append-new-messages)
      summary: (response.full_text || "").slice(0, 800),
      message_count: response.message_count || 0,
      last_message_index: response.last_message_index ?? 0,
      messages: response.messages || [],

      // optional full text (handy for debugging / fallback)
      conversation_text: response.full_text || ""
    };

    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      setStatus(`❌ Make webhook error: ${r.status}\n${t}`);
      return;
    }

    setStatus("✅ Sent! Make should update Notion + append NEW messages only.");
  } catch (e) {
    setStatus("❌ Network error:\n" + String(e));
  }
});
