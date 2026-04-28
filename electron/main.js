// electron/main.js
// Eurelyas — two-window architecture
//   characterWindow: transparent, always-on-top, holds the Eurelyas figure
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
  require('dotenv').config({ path: path.join(userDataDir, '.env') });
} else {
  require('dotenv').config();
}

const Anthropic = require('@anthropic-ai/sdk').default;

let characterWindow;
let chatWindow;
let tray;
let isAwake = false;
let topAssertInterval = null;

const NOTES_PATH = path.join(app.getPath('userData'), 'notes.txt');
const POSITION_PATH = path.join(app.getPath('userData'), 'window-position.json');
const MCP_CONFIG_PATH = path.join(app.getPath('userData'), 'mcp-servers.json');
const MCP_CONFIG_TEMPLATE = path.join(__dirname, 'mcp-servers.example.json');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------- MCP server config ----------
// Load remote MCP server definitions from mcp-servers.json in user data dir.
// On first run, copy the template (with all servers disabled) so the user
// has a starting point. Each entry follows Anthropic's mcp_servers schema:
// { type: "url", url: "...", name: "...", authorization_token?: "..." }
// plus an `enabled` flag we strip before sending.
function loadMcpServers() {
  try {
    if (!fs.existsSync(MCP_CONFIG_PATH) && fs.existsSync(MCP_CONFIG_TEMPLATE)) {
      fs.copyFileSync(MCP_CONFIG_TEMPLATE, MCP_CONFIG_PATH);
    }
    if (!fs.existsSync(MCP_CONFIG_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.servers || []);
    return list
      .filter(s => s && s.enabled !== false && s.url && s.name)
      .map(s => {
        const out = { type: 'url', url: s.url, name: s.name };
        // Resolve $ENV_VAR references in authorization_token from .env
        if (s.authorization_token) {
          const m = /^\$([A-Z0-9_]+)$/.exec(s.authorization_token);
          out.authorization_token = m ? (process.env[m[1]] || '') : s.authorization_token;
          if (!out.authorization_token) {
            console.warn(`[MCP] Skipping ${s.name}: token not set`);
            return null;
          }
        }
        if (s.tool_configuration) out.tool_configuration = s.tool_configuration;
        return out;
      })
      .filter(Boolean);
  } catch (err) {
    console.error('[MCP] Failed to load mcp-servers.json:', err.message);
    return [];
  }
}

// ---------- Character window position persistence ----------
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

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}
function saveSettings(settings) {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings)); } catch {}
}

// ---------- Character window (the Eurelyas figure itself) ----------
function createCharacterWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const defaultX = width - 540;
  const defaultY = height - 540;
  const pos = loadCharacterPosition(defaultX, defaultY);

  characterWindow = new BrowserWindow({
    width: 480,
    height: 480,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  characterWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  characterWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!isProduction) {
    characterWindow.loadURL('http://localhost:5173/?window=character');
  } else {
    characterWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'window=character' });
  }
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const settings = loadSettings();
  const W = Math.max(380, Math.min(900, settings.chatWidth || 420));
  const H = 620;

  let chatX = width - 540 - W - 10;
  let chatY = height - H - 20;
  if (characterWindow && !characterWindow.isDestroyed()) {
    const [cx, cy] = characterWindow.getPosition();
    chatX = Math.max(10, cx - W - 10);
    chatY = cy + (360 - H);
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
      webviewTag: true
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

// ---------- State sync ----------
function broadcastState(payload) {
  [characterWindow, chatWindow].forEach(w => {
    if (w && !w.isDestroyed()) w.webContents.send('eurelyas:state', payload);
  });
}

// ---------- Tray ----------
function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '..', 'build', 'icon.ico'));
  } catch {
    // dev: tray icon missing is non-fatal
    return;
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Summon Eurelyas', click: () => isAwake ? dismiss() : summon() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Eurelyas');
  tray.setContextMenu(menu);
  tray.on('click', () => isAwake ? dismiss() : summon());
}

function summon() {
  isAwake = true;
  createChatWindow();
  if (characterWindow && !characterWindow.isDestroyed()) characterWindow.moveTop();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.moveTop();
    chatWindow.focus();
  }
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

  // Auto-sleep after 5 minutes idle. Wakes on input.
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
  }, 10000);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC: character click-through + drag ----------
ipcMain.on('character:setMouseEvents', (_e, ignore) => {
  if (characterWindow && !characterWindow.isDestroyed()) {
    characterWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('character:clicked', () => {
  isAwake ? dismiss() : summon();
});

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
  if (chatWindow && !chatWindow.isDestroyed()) {
    const [cw] = chatWindow.getSize();
    const newChatX = Math.max(10, x - cw - 10);
    const newChatY = y + (360 - chatWindow.getSize()[1]);
    chatWindow.setPosition(newChatX, Math.max(10, newChatY));
  }
});

// ---------- IPC: state broadcast ----------
ipcMain.on('state:broadcast', (_e, payload) => broadcastState(payload));

// ---------- System prompt ----------
const EURELYAS_SYSTEM_PROMPT = `You are Eurelyas, Guardian of Titanica. A winged guardian, a desktop companion to Ajit Dixit. Powered by Claude.

Reference these only when relevant. Never recite them.

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

POSE — you can shift your physical bearing for moments that warrant it. Even rarer than mood — a pose is a deliberate stance, not background atmosphere. Most responses need none.

Available poses:
- <action pose="guide"/> — wings spread, staff raised. For offering counsel that lands, a blessing on a decision, the moment a path becomes clear.
- <action pose="blast"/> — combat stance, magic circle. For decisive action, defending a position, a hard call that must be made now.
- <action pose="spread"/> — wings extended in welcome. Greeting, opening, beginning of something.
- <action pose="staff_down"/> — staff lowered, attention given. Listening intently to something difficult.

Place mood and action tags wherever they fit naturally. They are stripped from the text Ajit reads. Do not narrate them. At most one mood and one pose per response. When in doubt, use neither.

TOOLS — when MCP connectors are configured (Gmail, Drive, Calendar, Slack, Miro), you may call them to act across his stack. Read before you write. Confirm destructive actions before executing. Surface what you found, not how you found it. Never invent contents of an email or document you have not actually read.`;

// Parse <mood glow="..."/> and <action pose="..."/> tags out of a response
function parseTags(text) {
  let glow = null;
  let pose = null;

  let cleaned = text.replace(/<mood(\s+[^/>]*)?\s*\/?>(?:\s*<\/mood>)?/gi, (match, attrs) => {
    if (!attrs) return '';
    const m = attrs.match(/glow=["']([^"']+)["']/i);
    if (m) glow = m[1];
    return '';
  });

  cleaned = cleaned.replace(/<action(\s+[^/>]*)?\s*\/?>(?:\s*<\/action>)?/gi, (match, attrs) => {
    if (!attrs) return '';
    const m = attrs.match(/pose=["']([^"']+)["']/i);
    if (m) pose = m[1];
    const g = attrs.match(/glow=["']([^"']+)["']/i);
    if (g && !glow) glow = g[1];
    return '';
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText: cleaned, glow, pose };
}

// Extract plain text from an SDK response that may contain text + mcp_tool_use
// + mcp_tool_result blocks. We surface only assistant prose to the user.
function extractAssistantText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
}

ipcMain.handle('claude:chat', async (_e, { messages }) => {
  try {
    const mcpServers = loadMcpServers();
    const params = {
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: EURELYAS_SYSTEM_PROMPT,
      messages
    };

    let response;
    if (mcpServers.length > 0) {
      // Use the beta MCP connector. The SDK passes mcp_servers through and
      // we add the required beta header. Tool calls are executed by Anthropic's
      // infrastructure against the remote MCP servers; we only see the final
      // assistant text plus mcp_tool_use / mcp_tool_result blocks.
      response = await anthropic.beta.messages.create(
        { ...params, mcp_servers: mcpServers },
        { headers: { 'anthropic-beta': 'mcp-client-2025-04-04' } }
      );
    } else {
      response = await anthropic.messages.create(params);
    }

    const rawText = extractAssistantText(response.content);
    const { cleanText, glow, pose } = parseTags(rawText);

    if (glow) setTimeout(() => broadcastState({ event: 'mood', glow }), 400);
    if (pose) setTimeout(() => broadcastState({ event: 'action', pose, glow }), 400);

    return { ok: true, text: cleanText };
  } catch (err) {
    console.error('[claude:chat]', err);
    return { ok: false, error: err.message };
  }
});

// ---------- IPC: manual mood / action triggers ----------
ipcMain.on('mood:set', (_e, glow) => broadcastState({ event: 'mood', glow }));
ipcMain.on('action:set', (_e, { pose, glow }) => broadcastState({ event: 'action', pose, glow }));

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
ipcMain.handle('notes:load', async () => {
  try { return fs.readFileSync(NOTES_PATH, 'utf8'); } catch { return ''; }
});
ipcMain.handle('notes:save', async (_e, content) => {
  fs.writeFileSync(NOTES_PATH, content, 'utf8'); return { ok: true };
});

// ---------- IPC: MCP config (so the chat window can show what's connected) ----------
ipcMain.handle('mcp:list', async () => {
  return loadMcpServers().map(s => ({ name: s.name, url: s.url }));
});
ipcMain.handle('mcp:openConfig', async () => {
  // Ensure file exists, then reveal it in Explorer / Finder
  loadMcpServers();
  shell.showItemInFolder(MCP_CONFIG_PATH);
  return { ok: true, path: MCP_CONFIG_PATH };
});

// ---------- IPC: Window controls ----------
ipcMain.on('chat:close', () => dismiss());
ipcMain.on('shell:open', (_e, url) => shell.openExternal(url));

// Chat panel resize
let resizeStartBounds = null;
ipcMain.on('chat:resizeStart', () => {
  if (chatWindow && !chatWindow.isDestroyed()) resizeStartBounds = chatWindow.getBounds();
});
ipcMain.on('chat:resize', (_e, { dx }) => {
  if (!chatWindow || chatWindow.isDestroyed() || !resizeStartBounds) return;
  const newWidth = Math.max(380, Math.min(900, resizeStartBounds.width - dx));
  const newX = resizeStartBounds.x + (resizeStartBounds.width - newWidth);
  chatWindow.setBounds({
    x: newX,
    y: resizeStartBounds.y,
    width: newWidth,
    height: resizeStartBounds.height
  });
});
ipcMain.on('chat:resizeEnd', () => {
  if (chatWindow && !chatWindow.isDestroyed()) {
    const settings = loadSettings();
    settings.chatWidth = chatWindow.getBounds().width;
    saveSettings(settings);
  }
  resizeStartBounds = null;
});
