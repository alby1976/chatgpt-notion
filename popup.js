const DEFAULT_WEBHOOK = "https://hook.us2.make.com/469gkeogly4da1um5vpf5yl80937n4ie";
const STORAGE_KEY = "makeWebhook";

const webhookInput = document.getElementById("webhook");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");

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

  chrome.tabs.sendMessage(tab.id, { type: "COLLECT_CHAT_V2" }, async (response) => {
    if (chrome.runtime.lastError) {
      setStatus("❌ Could not read the page.\n" + chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      setStatus("❌ Failed to collect chat.\n" + (response?.error || ""));
      return;
    }

    setStatus("Sending to Make…");

    try {
      const payload = {
        ping: false,
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
        last_message_index: response.last_message_index || 0,
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
});
