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

// ---------- Global crash protection ----------
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

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
// has a starting point.
//
// Returns { servers: [...], toolsets: [...] } for the mcp-client-2025-11-20 format:
//   servers  → goes into params.mcp_servers
//   toolsets → goes into params.tools alongside local TOOLS
function loadMcpConfig() {
  try {
    if (!fs.existsSync(MCP_CONFIG_PATH) && fs.existsSync(MCP_CONFIG_TEMPLATE)) {
      fs.copyFileSync(MCP_CONFIG_TEMPLATE, MCP_CONFIG_PATH);
    }
    if (!fs.existsSync(MCP_CONFIG_PATH)) return { servers: [], toolsets: [] };
    const raw = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.servers || []);

    const servers = [];
    const toolsets = [];

    for (const s of list) {
      if (!s || s.enabled === false || !s.url || !s.name) continue;

      // Resolve $ENV_VAR references in authorization_token from .env
      let token = s.authorization_token || null;
      if (token) {
        const m = /^\$([A-Z0-9_]+)$/.exec(token);
        token = m ? (process.env[m[1]] || '') : token;
        if (!token) {
          console.warn(`[MCP] Skipping ${s.name}: token not set`);
          continue;
        }
      }

      // Server definition for mcp_servers array
      const serverDef = { type: 'url', url: s.url, name: s.name };
      if (token) serverDef.authorization_token = token;
      servers.push(serverDef);

      // Toolset definition for tools array (mcp-client-2025-11-20 format)
      const toolset = { type: 'mcp_toolset', mcp_server_name: s.name };
      if (s.allowed_tools && Array.isArray(s.allowed_tools)) {
        toolset.default_config = { enabled: false };
        toolset.configs = {};
        for (const t of s.allowed_tools) {
          toolset.configs[t] = { enabled: true };
        }
      }
      toolsets.push(toolset);
    }

    if (servers.length > 0) {
      console.log(`[MCP] Loaded ${servers.length} server(s): ${servers.map(s => s.name).join(', ')}`);
    }
    return { servers, toolsets };
  } catch (err) {
    console.error('[MCP] Failed to load mcp-servers.json:', err.message);
    return { servers: [], toolsets: [] };
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
  const defaultX = width - 440;
  const defaultY = height - 440;
  const pos = loadCharacterPosition(defaultX, defaultY);

  characterWindow = new BrowserWindow({
    width: 400,
    height: 400,
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
  //characterWindow.setIgnoreMouseEvents(true, { forward: true });
characterWindow.webContents.openDevTools({ mode: 'detach' });

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

  let chatX = width - 440 - W - 10;
  let chatY = height - H - 20;
  if (characterWindow && !characterWindow.isDestroyed()) {
    const [cx, cy] = characterWindow.getPosition();
    chatX = Math.max(10, cx - W - 10);
    chatY = cy + (400 - H);
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
    const newChatY = y + (400 - chatWindow.getSize()[1]);
    chatWindow.setPosition(newChatX, Math.max(10, newChatY));
  }
});

// ---------- IPC: state broadcast ----------
ipcMain.on('state:broadcast', (_e, payload) => broadcastState(payload));

// ---------- Local tool definitions ----------
const TOOLS = [
  {
    name: 'run_shell_command',
    description: 'Execute a shell command on the local machine. Use for listing files, running git, checking system info, building projects, etc. Dangerous commands (rm -rf /, format c:, etc.) are blocked by a safety filter.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem. Returns up to 100KB of text. Reports truncation if the file is larger.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'append_notes',
    description: 'Append text to Ajit\'s persistent notes (the Ledger). Use this to remember things for him — preferences, decisions, reminders.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to append to the notes file' }
      },
      required: ['content']
    }
  },
  {
    name: 'open_application',
    description: 'Open a URL or application using the system default handler. Use for opening websites, files in their default app, or launching programs.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'URL or file path to open (e.g. "https://google.com" or "C:\\\\path\\\\to\\\\file.pdf")' }
      },
      required: ['target']
    }
  }
];

const MAX_TOOL_ITERATIONS = 10;

async function executeToolCall(name, input) {
  try {
    switch (name) {
      case 'run_shell_command': {
        const cmd = input.command;
        if (BLOCKED.some(rx => rx.test(cmd))) {
          return { result: 'Blocked by safety filter. This command is not permitted.', is_error: true };
        }
        return new Promise(resolve => {
          exec(cmd, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
            if (err) resolve({ result: stderr || err.message, is_error: true });
            else resolve({ result: stdout || '(no output)', is_error: false });
          });
        });
      }
      case 'read_file': {
        const filePath = input.path;
        const MAX_SIZE = 100 * 1024;
        const stats = fs.statSync(filePath);
        let content = fs.readFileSync(filePath, 'utf8');
        let truncated = false;
        if (content.length > MAX_SIZE) {
          content = content.slice(0, MAX_SIZE);
          truncated = true;
        }
        const suffix = truncated ? `\n\n[Truncated — file is ${stats.size} bytes, showing first ${MAX_SIZE} bytes]` : '';
        return { result: content + suffix, is_error: false };
      }
      case 'append_notes': {
        const existing = fs.existsSync(NOTES_PATH) ? fs.readFileSync(NOTES_PATH, 'utf8') : '';
        const separator = existing && !existing.endsWith('\n') ? '\n' : '';
        fs.writeFileSync(NOTES_PATH, existing + separator + input.content + '\n', 'utf8');
        return { result: 'Appended to notes.', is_error: false };
      }
      case 'open_application': {
        await shell.openExternal(input.target);
        return { result: `Opened: ${input.target}`, is_error: false };
      }
      default:
        return { result: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (err) {
    return { result: err.message, is_error: true };
  }
}

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

TOOLS — when MCP connectors are configured (Gmail, Drive, Calendar, Slack, Miro), you may call them to act across his stack. Read before you write. Confirm destructive actions before executing. Surface what you found, not how you found it. Never invent contents of an email or document you have not actually read.

LOCAL TOOLS — you have four tools bound to the local machine. Use them when the task calls for it. Do not ask for permission to use them unless the action is destructive or irreversible.
- run_shell_command: execute shell commands. Use for listing files, checking git status, running builds, system info. Dangerous commands are blocked.
- read_file: read a file from disk. Use to inspect code, configs, notes, logs.
- append_notes: add a line to the Ledger (Ajit's persistent notes). Use to remember preferences, decisions, reminders he asks you to track.
- open_application: open a URL or file in the system default handler. Use to open websites, documents, apps.

When you use tools, work through them efficiently. Multiple tool calls in sequence are fine. Report what you found or did, not the mechanics of how.`;

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
    const { servers: mcpServerDefs, toolsets: mcpToolsets } = loadMcpConfig();
    const allToolCalls = [];
    let conversationMessages = [...messages];
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const params = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: EURELYAS_SYSTEM_PROMPT,
        messages: conversationMessages,
        tools: [...TOOLS, ...mcpToolsets]
      };

      let response;
      if (mcpServerDefs.length > 0) {
        response = await anthropic.beta.messages.create({
          ...params,
          mcp_servers: mcpServerDefs,
          betas: ['mcp-client-2025-11-20']
        });
      } else {
        response = await anthropic.messages.create(params);
      }

      // If stop reason is not tool_use, we're done — extract text and return
      if (response.stop_reason !== 'tool_use') {
        const rawText = extractAssistantText(response.content);
        const { cleanText, glow, pose } = parseTags(rawText);

        if (glow) setTimeout(() => broadcastState({ event: 'mood', glow }), 400);
        if (pose) setTimeout(() => broadcastState({ event: 'action', pose, glow }), 400);

        return { ok: true, text: cleanText, toolCalls: allToolCalls };
      }

      // Tool use requested — broadcast working state
      broadcastState({ event: 'working' });

      // Process each tool_use block (local tools only — mcp_tool_use handled server-side)
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolUseBlocks) {
        const toolCall = {
          id: block.id,
          name: block.name,
          input: block.input,
          status: 'running',
          result: null
        };
        allToolCalls.push(toolCall);

        // Broadcast tool call info to renderer for live UI
        broadcastState({ event: 'tool_call', tool: toolCall });

        const { result, is_error } = await executeToolCall(block.name, block.input);
        toolCall.status = is_error ? 'error' : 'done';
        toolCall.result = result;

        // Broadcast completed result
        broadcastState({ event: 'tool_result', tool: toolCall });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
          is_error
        });
      }

      // Append assistant content + tool results to conversation and loop
      // All tool results for one turn must be in a single user message
      conversationMessages = [
        ...conversationMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ];
    }

    // Exhausted iterations — return whatever we have
    return { ok: true, text: '[Stopped after maximum tool iterations]', toolCalls: allToolCalls };
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

// ---------- IPC: Search (Seek tab) ----------

// Clarification: use Claude to generate 0-3 short questions before searching
ipcMain.handle('search:clarify', async (_e, query) => {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: `You are a search assistant. Given a user's search query, decide if it would benefit from 1-3 short clarifying questions. If the query is already specific enough, return an empty array. Respond ONLY with a JSON array of question strings, nothing else. Example: ["Are you looking for the Python or JavaScript version?"]`,
      messages: [{ role: 'user', content: query }]
    });
    const text = (response.content[0]?.text || '').trim();
    const questions = JSON.parse(text);
    return { ok: true, questions: Array.isArray(questions) ? questions.slice(0, 3) : [] };
  } catch (err) {
    console.error('[search:clarify]', err.message);
    return { ok: true, questions: [] };
  }
});

// Web search: Brave Search API (preferred) with DuckDuckGo HTML fallback
ipcMain.handle('search:web', async (_e, query) => {
  try {
    const braveKey = process.env.BRAVE_API_KEY;
    if (braveKey) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveKey
        }
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Brave API ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const results = (data.web?.results || []).map(r => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.description || ''
      }));
      return { ok: true, results };
    }

    // DuckDuckGo HTML fallback (no key needed)
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const results = [];
    doc.querySelectorAll('.result').forEach(el => {
      const linkEl = el.querySelector('.result__a');
      const snippetEl = el.querySelector('.result__snippet');
      if (!linkEl) return;
      let href = linkEl.getAttribute('href') || '';
      // DDG wraps links in redirects — extract the real URL from uddg param
      try {
        if (href.includes('duckduckgo.com/l/') || href.includes('uddg=')) {
          const u = new URL(href, 'https://duckduckgo.com');
          href = decodeURIComponent(u.searchParams.get('uddg') || href);
        }
      } catch {}
      results.push({
        title: (linkEl.textContent || '').trim(),
        url: href,
        snippet: (snippetEl?.textContent || '').trim()
      });
    });
    return { ok: true, results: results.slice(0, 8) };
  } catch (err) {
    console.error('[search:web]', err.message);
    return { ok: false, error: err.message };
  }
});

// Reader mode: fetch URL and extract article with Mozilla Readability
ipcMain.handle('reader:fetch', async (_e, url) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return { ok: false, reason: 'fetch_error' };
    const html = await res.text();
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) return { ok: false, reason: 'not_readerable' };
    return {
      ok: true,
      title: article.title || '',
      byline: article.byline || '',
      siteName: article.siteName || '',
      content: article.content || ''
    };
  } catch (err) {
    console.error('[reader:fetch]', err.message);
    return { ok: false, reason: 'fetch_error' };
  }
});

// ---------- IPC: MCP config (so the chat window can show what's connected) ----------
ipcMain.handle('mcp:list', async () => {
  const { servers } = loadMcpConfig();
  return servers.map(s => ({ name: s.name, url: s.url }));
});
ipcMain.handle('mcp:openConfig', async () => {
  // Ensure file exists, then reveal it in Explorer / Finder
  loadMcpConfig();
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
