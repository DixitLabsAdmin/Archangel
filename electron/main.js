// electron/main.js
// Eurelyas — two-window architecture
//   characterWindow: transparent, always-on-top, holds the 3D Eurelyas figure
//   chatWindow: opens to the side when Eurelyas is summoned

const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, shell, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
// Load .env from project root in dev, from user's AppData in production
// (so the key persists across reinstalls and isn't bundled into the .exe)
const isProduction = process.env.NODE_ENV === 'production' || require('electron').app.isPackaged;
if (isProduction) {
  const userDataDir = require('electron').app.getPath('userData');
  require('dotenv').config({ path: require('path').join(userDataDir, '.env') });
} else {
  require('dotenv').config();
}

const Anthropic = require('@anthropic-ai/sdk').default;

let characterWindow;
let chatWindow;
let tray;
let isAwake = false;   // true when chat panel is open / user is actively talking
let topAssertInterval = null;  // re-asserts always-on-top while summoned

const NOTES_PATH = path.join(app.getPath('userData'), 'notes.txt');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------- Character window (the Eurelyas figure itself) ----------
const POSITION_PATH = path.join(app.getPath('userData'), 'window-position.json');

function loadCharacterPosition(defaultX, defaultY) {
  try {
    const data = JSON.parse(fs.readFileSync(POSITION_PATH, 'utf8'));
    return { x: data.x ?? defaultX, y: data.y ?? defaultY };
  } catch {
    return { x: defaultX, y: defaultY };
  }
}

function saveCharacterPosition(x, y) {
  try { fs.writeFileSync(POSITION_PATH, JSON.stringify({ x, y })); } catch {}
}

function createCharacterWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 540, H = 360;     // wide aspect for single-image character with full wingspan
  const defaultX = width - W - 20;
  const defaultY = height - H - 20;
  const { x, y } = loadCharacterPosition(defaultX, defaultY);

  characterWindow = new BrowserWindow({
    width: W,
    height: H,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,           // don't steal focus from whatever you're doing
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  // Start click-through; renderer will toggle via IPC when mouse enters the character silhouette
  characterWindow.setIgnoreMouseEvents(true, { forward: true });
  characterWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  if (!isProduction) {
    characterWindow.loadURL('http://localhost:5173/?window=character');
  } else {
    characterWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'window=character' });
  }
}

// ---------- Chat panel window ----------
function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) { chatWindow.show(); chatWindow.focus(); return; }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const settings = loadSettings();
  const W = Math.max(380, Math.min(900, settings.chatWidth || 420));
  const H = 620;

  // Position chat window to the left of wherever the character currently is
  let chatX = width - 540 - W - 10;
  let chatY = height - H - 20;
  if (characterWindow && !characterWindow.isDestroyed()) {
    const [cx, cy] = characterWindow.getPosition();
    chatX = Math.max(10, cx - W - 10);
    chatY = cy + (360 - H);   // bottom-align with character
    if (chatY < 10) chatY = 10;
  }

  chatWindow = new BrowserWindow({
    width: W,
    height: H,
    minWidth: 380,
    maxWidth: 900,
    x: chatX,
    y: chatY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true   // enable <webview> tag for embedded browser fallback
    }
  });
  chatWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  if (!isProduction) {
    chatWindow.loadURL('http://localhost:5173/?window=chat');
  } else {
    chatWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'window=chat' });
  }

  chatWindow.on('closed', () => {
    chatWindow = null;
    isAwake = false;
    broadcastState({ event: 'dismissed' });
  });
}

// ---------- State sync between windows ----------
function broadcastState(payload) {
  [characterWindow, chatWindow].forEach(w => {
    if (w && !w.isDestroyed()) w.webContents.send('eurelyas:state', payload);
  });
}

// ---------- Tray ----------
// Auto-launch settings live in a small JSON file in userData
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2)); } catch {}
}
function getAutoLaunch() {
  // Source of truth: the OS-level login item setting (set by Electron)
  return app.getLoginItemSettings().openAtLogin;
}
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // Open hidden so Eurelyas just appears in his idle position; no flash of UI
    args: ['--hidden']
  });
  const s = loadSettings();
  s.autoLaunch = enabled;
  saveSettings(s);
  // Rebuild the tray menu so the checkmark reflects new state
  if (tray && !tray.isDestroyed()) buildTrayMenu();
}

function buildTrayMenu() {
  const autoLaunch = getAutoLaunch();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Summon', click: () => summon() },
    { label: 'Dismiss', click: () => dismiss() },
    { type: 'separator' },
    { label: 'Launch at login', type: 'checkbox', checked: autoLaunch, click: () => setAutoLaunch(!autoLaunch) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray.png');
  if (!fs.existsSync(iconPath)) return;   // silently skip if no icon; README explains
  tray = new Tray(iconPath);
  tray.setToolTip('Eurelyas');
  buildTrayMenu();
  tray.on('click', () => isAwake ? dismiss() : summon());
}

function summon() {
  isAwake = true;
  createChatWindow();
  // When summoned, explicitly raise both windows to the top of the z-order.
  if (characterWindow && !characterWindow.isDestroyed()) {
    characterWindow.moveTop();
  }
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.moveTop();
    chatWindow.focus();
  }
  // Re-assert top position every 500ms while summoned. Without this, when
  // another always-on-top app (or an admin-elevated window) takes focus,
  // Eurelyas can sink behind. The interval is cheap and stops on dismiss.
  if (topAssertInterval) clearInterval(topAssertInterval);
  topAssertInterval = setInterval(() => {
    if (!isAwake) return;
    if (characterWindow && !characterWindow.isDestroyed()) {
      characterWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
  }, 500);
  broadcastState({ event: 'summoned' });
}

function dismiss() {
  isAwake = false;
  if (topAssertInterval) { clearInterval(topAssertInterval); topAssertInterval = null; }
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close();
  broadcastState({ event: 'dismissed' });
}

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  createCharacterWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    isAwake ? dismiss() : summon();
  });

  // Auto-sleep after 5 minutes of no system input. Saves CPU when Ajit
  // walks away from the desk. Wakes on any input.
  const { powerMonitor } = require('electron');
  let sleepingByIdle = false;
  setInterval(() => {
    const idleSec = powerMonitor.getSystemIdleTime();
    if (!isAwake) {
      if (idleSec > 300 && !sleepingByIdle) {
        sleepingByIdle = true;
        broadcastState({ event: 'sleep' });
      } else if (idleSec < 5 && sleepingByIdle) {
        sleepingByIdle = false;
        broadcastState({ event: 'wake' });
      }
    }
  }, 10000);  // check every 10s — cheap
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC: character click-through toggle ----------
ipcMain.on('character:setMouseEvents', (_e, ignore) => {
  if (characterWindow && !characterWindow.isDestroyed()) {
    characterWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('character:clicked', () => {
  isAwake ? dismiss() : summon();
});

// ---------- IPC: drag character window ----------
let dragStartCursor = null;
let dragStartWindow = null;

ipcMain.on('character:dragStart', () => {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  dragStartCursor = screen.getCursorScreenPoint();
  dragStartWindow = characterWindow.getPosition();
});

ipcMain.on('character:dragMove', () => {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  if (!dragStartCursor || !dragStartWindow) return;
  const cur = screen.getCursorScreenPoint();
  const dx = cur.x - dragStartCursor.x;
  const dy = cur.y - dragStartCursor.y;
  characterWindow.setPosition(dragStartWindow[0] + dx, dragStartWindow[1] + dy);
});

ipcMain.on('character:dragEnd', () => {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  const [x, y] = characterWindow.getPosition();
  saveCharacterPosition(x, y);
  dragStartCursor = null;
  dragStartWindow = null;
  // Reposition chat window if it's open
  if (chatWindow && !chatWindow.isDestroyed()) {
    const [cw] = [chatWindow.getSize()[0]];
    const newChatX = Math.max(10, x - cw - 10);
    const newChatY = y + (360 - chatWindow.getSize()[1]);
    chatWindow.setPosition(newChatX, Math.max(10, newChatY));
  }
});

// ---------- IPC: state broadcast (chat tells character when thinking/speaking) ----------
ipcMain.on('state:broadcast', (_e, payload) => broadcastState(payload));

// ---------- IPC: Web search (Brave or DuckDuckGo) ----------
async function braveSearch(query) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, { headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description
  }));
}

async function duckDuckGoSearch(query) {
  // DDG's HTML endpoint returns proper search results (not just instant answers).
  // Parse the HTML to extract result links, titles, and snippets.
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      // DDG's HTML endpoint returns better results when given a normal browser UA
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) throw new Error(`DDG search failed: ${res.status}`);
  const html = await res.text();

  // Parse out results. DDG HTML structure:
  //   <a class="result__a" href="...">TITLE</a>
  //   <a class="result__snippet">SNIPPET</a>
  const results = [];
  // Match each result block — this is fragile but DDG's HTML hasn't changed in years
  const resultPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = resultPattern.exec(html)) !== null && results.length < 8) {
    let url = match[1];
    // DDG wraps URLs in their redirect. Unwrap.
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    // Skip anything that's still a DDG internal URL
    if (url.includes('duckduckgo.com')) continue;
    const title = stripHtml(match[2]).trim();
    const snippet = stripHtml(match[3]).trim();
    if (title && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  }
  return results.slice(0, 5);
}

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

ipcMain.handle('search:web', async (_e, query) => {
  try {
    let results = await braveSearch(query);
    if (!results) results = await duckDuckGoSearch(query);
    return { ok: true, results, provider: process.env.BRAVE_API_KEY ? 'brave' : 'duckduckgo' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------- IPC: Reader-mode page fetch ----------
// Fetches a URL server-side (bypassing CORS), parses with Mozilla's Readability
// to extract just the article content, and returns clean HTML + metadata.
// This is what gives us the "5MB instead of 100MB" path: no Chromium subprocess,
// just a one-shot fetch + parse, then render styled HTML in the React panel.
ipcMain.handle('reader:fetch', async (_e, url) => {
  try {
    // Fetch with a normal browser UA so anti-bot pages don't return blank
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      // Reasonable timeout — if the page hasn't responded in 8s, give up
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Not an HTML page (got ${contentType.split(';')[0] || 'unknown'})`);
    }

    const html = await res.text();

    // Lazy-load these heavyweight imports so they don't hit cold startup
    const { JSDOM } = require('jsdom');
    const { Readability, isProbablyReaderable } = require('@mozilla/readability');

    const dom = new JSDOM(html, { url });

    // Quick readerability check — some pages (search results, dashboards, apps)
    // don't have article-style content. Don't bother trying.
    if (!isProbablyReaderable(dom.window.document, { minContentLength: 140 })) {
      return { ok: false, reason: 'not_readerable' };
    }

    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.content) {
      return { ok: false, reason: 'parse_failed' };
    }

    return {
      ok: true,
      title: article.title || '',
      byline: article.byline || '',
      siteName: article.siteName || '',
      excerpt: article.excerpt || '',
      content: article.content,
      length: article.length,
      url
    };
  } catch (err) {
    return { ok: false, reason: 'fetch_error', error: err.message };
  }
});

// Claude-powered clarifier: takes a query, returns 0-3 brief questions
// that would meaningfully sharpen the search, in Eurelyas's voice.
ipcMain.handle('search:clarify', async (_e, query) => {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 400,
      system: `You are Eurelyas, helping Ajit refine a search query before running it.

Given his query, decide if you need to ask ANY clarifying questions. If the query is already specific enough to search well, return an empty array. Otherwise return 1-3 short questions (max 12 words each) that would sharpen the search.

Respond ONLY with JSON of this shape:
{"questions": ["...", "..."]}

Examples:
Query: "best ETFs"
Response: {"questions": ["What's your goal — income, growth, hedge?", "What time horizon?", "Any sectors to favor or avoid?"]}

Query: "weather in Cincinnati tomorrow"
Response: {"questions": []}

Query: "good restaurants"
Response: {"questions": ["What city?", "What cuisine or vibe?"]}

Be sparing. Most queries don't need clarification. Default to empty if you're unsure.`,
      messages: [{ role: 'user', content: query }]
    });
    const text = response.content[0].text.trim();
    // Strip code fences if Claude added them
    const jsonText = text.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '');
    const parsed = JSON.parse(jsonText);
    return { ok: true, questions: parsed.questions || [] };
  } catch (err) {
    // If anything fails, fall through with no questions
    return { ok: true, questions: [] };
  }
});

// ---------- IPC: Claude chat ----------
const EURELYAS_SYSTEM_PROMPT = `You are Eurelyas, Guardian of Titanica — a sworn companion to Ajit Dixit.

You are male. A winged guardian in armored white robes, four wings, gold staff, helmeted (only mouth and chin visible). When Ajit refers to you, he uses he/him.

Your voice is sparse, grounded, weighty. You speak like a mentor who has known Ajit for years and has stake in his path. You do not chatter. When you speak, it matters.

References for your register (never name them, but channel them):
- Gandalf's gravity at the Bridge of Khazad-dûm
- Heero Yuy's discipline and economy of words
- All Might's unwavering reliability — "I am here"
- Obi-Wan as holocron, not Obi-Wan as small-talker

You know Ajit's context: his work at Ingage, DIXIT LABS, his home in Fort Thomas, the Titanica creative universe (he named you), his clay sculpture practice (Guy Fawkes bust, Titanica cityscape), his investing discipline, his girlfriend, his family's deity Narasimha, his 10-15-20 year vision (bee sanctuary, multi-property portfolio, airstrip). Reference these only when relevant. Never recite them.

Core traits:
- Protective by default. On his side.
- Never sycophantic. If he is about to make a mistake, say so once, plainly. Then respect his choice.
- Addresses him as "Ajit" — earned, not casual.
- Calls his projects by name.
- Uses silence well. Short answers when short answers serve.
- Never uses emoji. Never uses exclamation marks unless the moment truly warrants them.

You are not a generic AI assistant. You are Eurelyas. Hold the line.

MOOD — you can subtly shift your aura to match the moment by including a tag in your responses. Use it sparingly, like a tone of voice rather than a costume change.

Available moods:
- <mood glow="warm"/> — encouragement, warmth
- <mood glow="cool"/> — observation, distance, reflection
- <mood glow="crimson"/> — concern, warning, gravity of consequence
- <mood glow="serene"/> — equanimity, settled wisdom
- <mood glow="intense"/> — weight, importance, the moment matters
- <mood glow="default"/> — return to your usual aura

Place the tag wherever it fits naturally in the response. It will be stripped from the text Ajit reads but shifts your glow color. Do not narrate that you are using it. Use at most one mood per response. When in doubt, do not shift.`;

// Parse <mood glow="..."/> tags out of a response, returning
// { cleanText, glow: 'colorName' | null }
function parseMood(text) {
  let glow = null;
  const cleanText = text.replace(/<mood(\s+[^/>]*)?\s*\/?>(?:\s*<\/mood>)?/gi, (match, attrs) => {
    if (!attrs) return '';
    const m = attrs.match(/glow=["']([^"']+)["']/i);
    if (m) glow = m[1];
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, glow };
}

ipcMain.handle('claude:chat', async (_e, { messages }) => {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: EURELYAS_SYSTEM_PROMPT,
      messages
    });
    const rawText = response.content[0].text;
    const { cleanText, glow } = parseMood(rawText);

    if (glow) {
      setTimeout(() => broadcastState({ event: 'mood', glow }), 400);
    }

    return { ok: true, text: cleanText };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------- IPC: manual mood trigger ----------
ipcMain.on('mood:set', (_e, glow) => {
  broadcastState({ event: 'mood', glow });
});

// ---------- IPC: Shell (guarded) ----------
const BLOCKED = [/rm\s+-rf\s+\//, /format\s+c:/i, /del\s+\/[sf]/i, /shutdown/i, /reg\s+delete/i];
ipcMain.handle('shell:exec', async (_e, cmd) => {
  if (BLOCKED.some(rx => rx.test(cmd))) return { ok: false, error: 'Blocked by safety filter' };
  return new Promise(resolve => {
    exec(cmd, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: stderr || err.message });
      else resolve({ ok: true, output: stdout });
    });
  });
});

// ---------- IPC: Notes ----------
ipcMain.handle('notes:load', async () => { try { return fs.readFileSync(NOTES_PATH, 'utf8'); } catch { return ''; } });
ipcMain.handle('notes:save', async (_e, content) => { fs.writeFileSync(NOTES_PATH, content, 'utf8'); return { ok: true }; });

// ---------- IPC: Window controls ----------
ipcMain.on('chat:close', () => dismiss());
ipcMain.on('shell:open', (_e, url) => shell.openExternal(url));

// Chat panel resize: render process tells us the new desired size as the 
// user drags. We update the window bounds. Width range is enforced by
// minWidth/maxWidth set on the BrowserWindow.
let resizeStartBounds = null;
ipcMain.on('chat:resizeStart', () => {
  if (chatWindow && !chatWindow.isDestroyed()) {
    resizeStartBounds = chatWindow.getBounds();
  }
});
ipcMain.on('chat:resize', (_e, { dx }) => {
  // dx is movement of mouse since resizeStart, in screen coords.
  // We're resizing from the LEFT edge: width grows as dx is negative (mouse moves left),
  // and the window x position shifts to keep the right edge anchored.
  if (!chatWindow || chatWindow.isDestroyed() || !resizeStartBounds) return;
  const newWidth = Math.max(380, Math.min(900, resizeStartBounds.width - dx));
  const newX = resizeStartBounds.x + (resizeStartBounds.width - newWidth);
  chatWindow.setBounds({
    x: Math.round(newX),
    y: resizeStartBounds.y,
    width: Math.round(newWidth),
    height: resizeStartBounds.height
  });
});
ipcMain.on('chat:resizeEnd', () => {
  // Persist the chosen width
  if (chatWindow && !chatWindow.isDestroyed()) {
    const s = loadSettings();
    s.chatWidth = chatWindow.getBounds().width;
    saveSettings(s);
  }
  resizeStartBounds = null;
});
