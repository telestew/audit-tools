// Desmos AI Chat - Content Script
// Injected on https://www.desmos.com/calculator*

if (document.getElementById('desmos-ai-chat-toggle')) throw new Error('already loaded');

const PLUGIN_ID = 'desmos-ai-chat';
const LS_KEY = 'desmos_ai_conversations';

let _cfg = (typeof pluginSettings !== 'undefined' && pluginSettings) ? pluginSettings : {};
if (!Object.keys(_cfg).length) {
  try {
    const r = await chrome.storage.local.get('pluginSettings');
    _cfg = r.pluginSettings || {};
  } catch (e) {}
}
const API_BASE = (_cfg.apiEndpoint || 'http://localhost:8000').replace(/\/+$/, '');
const MODEL = _cfg.modelName;

const SYSTEM_PROMPT = `You are a helpful math assistant integrated into the Desmos graphing calculator. You can provide mathematical explanations and also generate pasteable Desmos calculator expressions.

When the user asks for calculator content (expressions, functions, sliders, tables, etc.), you MUST provide them inside a special XML tag so the interface can render a clickable copy button. The tag format is:

<desmos-copy label="Short description of what this pastes">
[...array of Desmos expression JSON objects...]
</desmos-copy>

The JSON inside the tag must be a valid JSON array of Desmos expression objects. The supported object types are:

1. folder - Groups expressions together:
   {"type":"folder","id":"UNIQUE_ID","title":"Folder Title"}

2. expression - A mathematical expression:
   {"type":"expression","id":"UNIQUE_ID","folderId":"PARENT_FOLDER_ID","color":"#hex","latex":"LATEX_STRING"}
   Optional fields: "hidden":true, "slider":{"hardMin":true,"hardMax":true,"min":"0","max":"20","step":"1"}

3. text - A text/note block:
   {"type":"text","id":"UNIQUE_ID","folderId":"PARENT_FOLDER_ID","text":"Description text"}

IMPORTANT RULES FOR LATEX in JSON strings:
- Use double backslashes for LaTeX commands: \\\\frac, \\\\sum, \\\\left, \\\\right, \\\\operatorname, etc.
- Subscripts: f_{name}
- Function arguments: \\\\left( and \\\\right)
- Lists: \\\\left[ and \\\\right]
- Summation: \\\\sum_{n=0}^{N}
- Products: \\\\prod_{n=1}^{N}
- Piecewise: \\\\left\\\\{cond1: val1, cond2: val2\\\\right\\\\}
- For loops: \\\\operatorname{for}
- Multi-letter names: \\\\operatorname{name}
- Available colors: #c74440 (red), #2d70b3 (blue), #348543 (green), #6042a6 (purple), #000000 (black), #fa7e19 (orange)

Example:
<desmos-copy label="Taylor series for e^x">
[{"type":"folder","id":"2780","title":"Taylor Series for e^x"},{"type":"expression","id":"2781","folderId":"2780","color":"#2d70b3","latex":"e_{xp}\\\\left(x\\\\right)=\\\\sum_{n=0}^{N}\\\\frac{x^{n}}{n!}"},{"type":"expression","id":"2782","folderId":"2780","color":"#348543","latex":"N=8","hidden":true,"slider":{"hardMin":true,"hardMax":true,"min":"0","max":"20","step":"1"}}]
</desmos-copy>

Always generate unique IDs (random 4-digit numbers). Always wrap related expressions in a folder. Provide sliders for adjustable parameters. Use standard Markdown for explanatory text outside desmos-copy tags. Use $...$ for inline math.

IMPORTANT: The user will see a button labeled with your description. When they click it, the expressions are added directly to their calculator via the Desmos API. They do NOT need to copy/paste — clicking the button is all that's needed.`;

const USER_SUFFIX = '\n\n[Reminder: When providing Desmos calculator content, wrap it in <desmos-copy label="description">JSON_ARRAY</desmos-copy> tags. The JSON must be a valid array of Desmos expression objects with properly escaped LaTeX. The user clicks the button to add expressions directly to the calculator — no copy/paste needed.]';

// --- Helpers ---

function loadConvs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch (e) { return []; }
}

function saveConvs(c) {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

function gid() {
  return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function escH(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- CSS ---

const sty = document.createElement('style');
sty.id = 'dai-styles';
sty.textContent = `
#desmos-ai-chat-toggle {
  position: fixed; bottom: 20px; right: 20px; z-index: 99999;
  width: 48px; height: 48px; border-radius: 50%; border: none;
  background: #2d70b3; color: #fff; font-size: 24px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center;
}
#desmos-ai-chat-toggle:hover { background: #1a5c9e; }

#dai-panel {
  position: fixed; bottom: 76px; right: 20px; z-index: 99999;
  width: 420px; height: 560px; border-radius: 12px; overflow: hidden;
  background: #1e1e1e; color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-shadow: 0 4px 24px rgba(0,0,0,.5); display: none; flex-direction: column; font-size: 14px;
}
#dai-panel.open { display: flex; }
#dai-panel * { box-sizing: border-box; }

.dai-hdr {
  display: flex; align-items: center; padding: 10px 14px;
  background: #2d70b3; color: #fff; flex-shrink: 0;
}
.dai-hdr-t { flex: 1; font-weight: 600; font-size: 15px; }
.dai-hdr button {
  background: none; border: none; color: #fff; cursor: pointer;
  font-size: 18px; padding: 4px 8px; border-radius: 4px;
}
.dai-hdr button:hover { background: rgba(255,255,255,.2); }

.dai-sb { display: none; flex-direction: column; width: 100%; flex: 1; overflow: hidden; }
.dai-sb.open { display: flex; }
.dai-sb-hdr {
  padding: 10px 14px; background: #252525;
  border-bottom: 1px solid #333; display: flex; align-items: center;
}
.dai-sb-hdr span { flex: 1; font-weight: 600; }
.dai-sb-list { flex: 1; overflow-y: auto; padding: 6px; }
.dai-sb-item {
  padding: 10px 12px; border-radius: 6px; cursor: pointer;
  margin-bottom: 4px; display: flex; align-items: center;
}
.dai-sb-item:hover { background: #333; }
.dai-sb-item .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dai-sb-item .d {
  opacity: 0; border: none; background: none; color: #f66;
  cursor: pointer; font-size: 16px; padding: 2px 6px;
}
.dai-sb-item:hover .d { opacity: 1; }

.dai-cv { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.dai-msgs { flex: 1; overflow-y: auto; padding: 12px; }

.dai-m { margin-bottom: 12px; line-height: 1.5; }
.dai-m.user { text-align: right; }
.dai-m .bbl {
  display: inline-block; max-width: 85%; padding: 8px 12px;
  border-radius: 10px; text-align: left; word-wrap: break-word;
}
.dai-m.user .bbl {
  background: #2d70b3; color: #fff;
  border-bottom-right-radius: 2px; white-space: pre-wrap;
}
.dai-m.assistant .bbl {
  background: #2a2a2a; color: #e0e0e0; border-bottom-left-radius: 2px;
}
.dai-m.assistant .bbl p { margin: 4px 0; }
.dai-m.assistant .bbl code {
  background: #383838; padding: 1px 4px; border-radius: 3px; font-size: 13px;
}
.dai-m.assistant .bbl pre {
  background: #1a1a1a; padding: 8px; border-radius: 6px; overflow-x: auto;
}
.dai-m.assistant .bbl pre code { background: none; padding: 0; }

.dai-cpbtn {
  display: flex; align-items: center; gap: 6px;
  margin: 8px 0; padding: 8px 16px;
  border: 1px solid #2d70b3; border-radius: 6px;
  background: #1a3a5c; color: #7fb8f0;
  cursor: pointer; font-size: 13px; font-weight: 500;
}
.dai-cpbtn:hover { background: #234b73; }
.dai-cpbtn.copied { border-color: #348543; color: #6fcf7f; background: #1a3c25; }
.dai-cpbtn .ico { font-size: 16px; }

.dai-inr {
  display: flex; padding: 10px; border-top: 1px solid #333;
  background: #252525; flex-shrink: 0;
}
.dai-inr textarea {
  flex: 1; resize: none; border: 1px solid #444; border-radius: 8px;
  padding: 8px 10px; font-size: 14px; font-family: inherit;
  background: #1e1e1e; color: #e0e0e0; outline: none;
  min-height: 40px; max-height: 120px;
}
.dai-inr textarea:focus { border-color: #2d70b3; }
.dai-inr button {
  margin-left: 8px; padding: 8px 14px; border: none; border-radius: 8px;
  background: #2d70b3; color: #fff; cursor: pointer; font-size: 14px;
}
.dai-inr button:hover { background: #1a5c9e; }
.dai-inr button:disabled { opacity: .5; cursor: default; }

.dai-typing { padding: 4px 12px; color: #888; font-style: italic; font-size: 13px; }

.dai-newbtn {
  margin: 8px; padding: 10px; border: 1px dashed #555; border-radius: 8px;
  background: none; color: #aaa; cursor: pointer; text-align: center; font-size: 13px;
}
.dai-newbtn:hover { border-color: #2d70b3; color: #7fb8f0; }
`;
document.head.appendChild(sty);

// --- Toggle Button ---

const tog = document.createElement('button');
tog.id = 'desmos-ai-chat-toggle';
tog.textContent = '\uD83E\uDD16';
tog.title = 'AI Chat';
document.body.appendChild(tog);

// --- Panel ---

const pan = document.createElement('div');
pan.id = 'dai-panel';
pan.innerHTML = `
<div class="dai-hdr">
  <button class="dai-menu" title="Conversations">\u2630</button>
  <span class="dai-hdr-t">AI Chat</span>
  <button class="dai-cls" title="Close">\u2715</button>
</div>
<div class="dai-sb">
  <div class="dai-sb-hdr"><span>Conversations</span></div>
  <button class="dai-newbtn">+ New Conversation</button>
  <div class="dai-sb-list"></div>
</div>
<div class="dai-cv">
  <div class="dai-msgs"></div>
  <div class="dai-inr">
    <textarea rows="1" placeholder="Ask about math or request expressions..."></textarea>
    <button class="dai-send">Send</button>
  </div>
</div>
`;
document.body.appendChild(pan);

const menuBtn = pan.querySelector('.dai-menu');
const clsBtn = pan.querySelector('.dai-cls');
const sb = pan.querySelector('.dai-sb');
const sbList = pan.querySelector('.dai-sb-list');
const newBtn = pan.querySelector('.dai-newbtn');
const cv = pan.querySelector('.dai-cv');
const msgs = pan.querySelector('.dai-msgs');
const ta = pan.querySelector('textarea');
const sendBtn = pan.querySelector('.dai-send');

let convs = loadConvs();
let curId = null;
let streaming = false;

// --- Toggle & Navigation ---

tog.onclick = () => {
  pan.classList.toggle('open');
  if (pan.classList.contains('open') && !curId) {
    if (convs.length) openConv(convs[0].id);
    else newConv();
  }
};

clsBtn.onclick = () => pan.classList.remove('open');

menuBtn.onclick = () => {
  sb.classList.toggle('open');
  if (sb.classList.contains('open')) renderSB();
};

// --- Sidebar ---

function renderSB() {
  sbList.innerHTML = '';
  convs.forEach(c => {
    const d = document.createElement('div');
    d.className = 'dai-sb-item';
    const fm = c.messages.find(m => m.role === 'user');
    const t = c.title || (fm ? fm.content.slice(0, 40) + '...' : 'New conversation');
    d.innerHTML = '<span class="t">' + escH(t) + '</span><button class="d" title="Delete">\u2715</button>';
    d.querySelector('.t').onclick = () => {
      openConv(c.id);
      sb.classList.remove('open');
    };
    d.querySelector('.d').onclick = (e) => {
      e.stopPropagation();
      convs = convs.filter(x => x.id !== c.id);
      saveConvs(convs);
      if (curId === c.id) {
        curId = null;
        msgs.innerHTML = '';
        if (convs.length) openConv(convs[0].id);
        else newConv();
      }
      renderSB();
    };
    sbList.appendChild(d);
  });
}

newBtn.onclick = () => {
  newConv();
  sb.classList.remove('open');
};

// --- Conversation Management ---

function newConv() {
  const c = { id: gid(), title: '', messages: [], created: Date.now() };
  convs.unshift(c);
  saveConvs(convs);
  openConv(c.id);
}

function openConv(id) {
  curId = id;
  renderMsgs();
}

function getCur() {
  return convs.find(c => c.id === curId);
}

// --- Message Rendering ---

function renderMsgs() {
  const c = getCur();
  msgs.innerHTML = '';
  if (!c) return;
  c.messages.forEach(m => {
    if (m.role === 'user' || m.role === 'assistant') {
      addBubble(m.role, m.content);
    }
  });
  msgs.scrollTop = msgs.scrollHeight;
}

function addBubble(role, content) {
  const d = document.createElement('div');
  d.className = 'dai-m ' + role;
  const b = document.createElement('div');
  b.className = 'bbl';
  if (role === 'assistant') {
    b.innerHTML = renderAC(content);
  } else {
    b.textContent = content;
  }
  d.appendChild(b);
  msgs.appendChild(d);
  bindCopyBtns(d);
}

function bindCopyBtns(el) {
  el.querySelectorAll('.dai-cpbtn').forEach(btn => {
    btn.onclick = () => {
      const j = btn.getAttribute('data-dj');
      try {
        const expr = JSON.parse(j);
        if (!Array.isArray(expr)) throw new Error('Not an array');
        // Use Desmos Calc API to inject expressions directly
        const s = Calc.getState();
        for (let i = 0; i < expr.length; i++) {
          s.expressions.list.push(expr[i]);
        }
        Calc.setState(s);
      } catch (e) {
        console.error('Failed to add to calculator:', e);
        alert('Failed to add expressions: ' + e.message);
        return;
      }
      btn.classList.add('copied');
      const lb = btn.querySelector('.lb');
      const ot = lb.textContent;
      lb.textContent = 'Added to calculator!';
      setTimeout(() => {
        btn.classList.remove('copied');
        lb.textContent = ot;
      }, 2500);
    };
  });
}

// --- Assistant Content Parsing ---

function renderAC(content) {
  const parts = [];
  const rx = /<desmos-copy\s+label="([^"]*)">([\s\S]*?)<\/desmos-copy>/g;
  let li = 0, m;
  while ((m = rx.exec(content)) !== null) {
    if (m.index > li) parts.push({ t: 't', v: content.slice(li, m.index) });
    parts.push({ t: 'd', label: m[1], json: m[2].trim() });
    li = m.index + m[0].length;
  }
  if (li < content.length) parts.push({ t: 't', v: content.slice(li) });

  // Build a document fragment so we can use DOM API for data attributes
  const container = document.createElement('div');
  parts.forEach(p => {
    if (p.t === 'd') {
      const btn = document.createElement('button');
      btn.className = 'dai-cpbtn';
      btn.setAttribute('data-dj', p.json); // DOM API handles quoting correctly
      btn.innerHTML = '<span class="ico">➕</span><span class="lb">' + escH(p.label) + '</span>';
      container.appendChild(btn);
    } else {
      const span = document.createElement('span');
      span.innerHTML = fmtTxt(p.v);
      container.appendChild(span);
    }
  });
  return container.innerHTML;
}

function fmtTxt(text) {
  let s = escH(text);
  // code blocks
  s = s.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // inline math
  s = s.replace(/\$([^$]+)\$/g, '<em style="font-family:serif;">$1</em>');
  // paragraphs
  s = s.replace(/\n\n+/g, '</p><p>');
  s = s.replace(/\n/g, '<br>');
  return '<p>' + s + '</p>';
}

// --- Bridge fetch (MAIN world -> ISOLATED world -> background) ---

function bridgeFetch(url, options) {
  return new Promise((resolve, reject) => {
    const id = 'dai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    function handler(evt) {
      if (evt.data?.type === 'dai-fetch-response' && evt.data.id === id) {
        window.removeEventListener('message', handler);
        const r = evt.data.response;
        if (!r || r.error) reject(new Error(r?.error || 'No response from bridge'));
        else resolve(r.body);
      }
    }
    window.addEventListener('message', handler);
    // Timeout after 120s
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Bridge fetch timeout'));
    }, 120000);
    window.postMessage({
      type: 'dai-fetch-stream',
      id: id,
      url: url,
      options: options
    }, '*');
  });
}

// --- Send Message ---

async function doSend() {
  const text = ta.value.trim();
  if (!text || streaming) return;

  const conv = getCur();
  if (!conv) return;

  if (!conv.title) conv.title = text.slice(0, 50);

  conv.messages.push({ role: 'user', content: text });
  saveConvs(convs);
  addBubble('user', text);

  ta.value = '';
  ta.style.height = 'auto';
  msgs.scrollTop = msgs.scrollHeight;

  streaming = true;
  sendBtn.disabled = true;

  // Typing indicator
  const typ = document.createElement('div');
  typ.className = 'dai-typing';
  typ.textContent = 'Thinking...';
  msgs.appendChild(typ);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const apiMsgs = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conv.messages.map((m, i, a) => {
        if (m.role === 'user' && i === a.length - 1) {
          return { role: 'user', content: m.content + USER_SUFFIX };
        }
        return { role: m.role, content: m.content };
      })
    ];

    // Use bridge to avoid CORS - sends non-streaming request through background
    const bodyText = await bridgeFetch(API_BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: apiMsgs, stream: false })
    });

    typ.remove();

    // Parse the full response (non-streaming since we proxy through background)
    const result = JSON.parse(bodyText);
    const ac = result.choices?.[0]?.message?.content || '';

    const ad = document.createElement('div');
    ad.className = 'dai-m assistant';
    const ab = document.createElement('div');
    ab.className = 'bbl';
    ab.innerHTML = renderAC(ac);
    ad.appendChild(ab);
    msgs.appendChild(ad);
    msgs.scrollTop = msgs.scrollHeight;

    bindCopyBtns(ad);
    conv.messages.push({ role: 'assistant', content: ac });
    saveConvs(convs);

  } catch (err) {
    typ.remove();
    const ed = document.createElement('div');
    ed.className = 'dai-m assistant';
    ed.innerHTML = '<div class="bbl" style="color:#f66;">Error: ' + escH(err.message) + '</div>';
    msgs.appendChild(ed);
  } finally {
    streaming = false;
    sendBtn.disabled = false;
  }
}

// --- Event Bindings ---

sendBtn.onclick = doSend;

ta.onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSend();
  }
};

ta.oninput = () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
};
