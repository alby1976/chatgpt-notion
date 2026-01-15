\# ChatGPT → Make → Notion (Latest)



A Chrome extension that \*\*captures full ChatGPT conversations\*\* and sends them to \*\*Make.com\*\*, where they are:

\- logged safely (ping tests),

\- stored in a \*\*Notion database\*\*,

\- \*\*deduplicated\*\* by chat URL,

\- \*\*incrementally updated\*\* (only new messages are appended),

\- and automatically categorized by project.



Built for long-term knowledge capture, not copy-paste chaos.



---



\## ✨ Features



\- ✅ Capture \*\*entire ChatGPT conversations\*\*

\- ✅ Editable Make.com webhook (saved locally)

\- ✅ \*\*Test ping\*\* → routed to a log (never touches Notion)

\- ✅ \*\*Real chat\*\* → stored in a Notion database

\- ✅ Duplicate detection (same Chat URL = update, not duplicate)

\- ✅ Append \*\*only new messages\*\* on re-send

\- ✅ Auto-update Status when content changes

\- ✅ Automatic project detection (best-effort from ChatGPT UI)

\- ✅ Safe for long conversations (message-by-message append)



---



\## 🧠 Architecture (High Level)

```text

Chrome Extension  
↓
Make.com Webhook
↓
Router
├─ Ping → Log
└─ Real Chat → Notion
├─ Find existing row by Chat URL
├─ Create if missing
├─ Append ONLY new messages
└─ Update status + counters

```





---



\## 📁 Folder Structure



```text

chatgpt-to-make-notion/

├── manifest.json

├── popup.html

├── popup.js

├── content.js

└── README.md

```



---



\## 🛠 Installation (Chrome)



1\. Open Chrome and go to:

```text

chrome://extensions

```

2\. Enable \*\*Developer mode\*\* (top right)

3\. Click \*\*Load unpacked\*\*

4\. Select the folder:

```text

chatgpt-to-make-notion/

```



5\. The extension icon will appear in your toolbar



---



\## 🔗 Webhook Setup



1\. Create a \*\*Make.com Custom Webhook\*\*

2\. Copy the webhook URL

3\. Open the extension popup

4\. Paste the webhook URL

5\. Click \*\*Save webhook\*\*

6\. Click \*\*Test (ping)\*\*  

→ You should see a ping arrive in Make



> Ping tests are routed to logs only and \*\*never touch Notion\*\*



---



\## 📓 Notion Database Requirements



Your Notion database must contain these properties:



| Property Name | Type |

|-------------|------|

| Conversation Title | Title |

| Project | Select |

| Status | Select |

| Summary | Text |

| Chat URL | URL |

| Share URL | URL |

| Message Count | Number |

| Last Message Index | Number |



> The \*\*full conversation is stored in the page body\*\*, not in a property.



---



\## 🚦 How Status Works



\- New conversation → Status = `New`

\- Appended or updated conversation → Status = `Final` (or `Updated`)



You can rename statuses — Make just sets whatever value you choose.



---



\## 🧪 Test vs Real Send



\### Test (Ping)

\- Sends:

```json

{ "ping": true }

```





