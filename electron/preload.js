// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eurelyas', {
  // Claude
  chat: (payload) => ipcRenderer.invoke('claude:chat', payload),

  // Shell
  shell: (cmd) => ipcRenderer.invoke('shell:exec', cmd),

  // Web search
  searchClarify: (query) => ipcRenderer.invoke('search:clarify', query),
  searchWeb: (query) => ipcRenderer.invoke('search:web', query),
  readerFetch: (url) => ipcRenderer.invoke('reader:fetch', url),

  // Mood triggers (manual)
  setMood: (glow) => ipcRenderer.send('mood:set', glow),

  // Notes
  loadNotes: () => ipcRenderer.invoke('notes:load'),
  saveNotes: (content) => ipcRenderer.invoke('notes:save', content),

  // Character window: click-through control + dragging
  setMouseEvents: (ignore) => ipcRenderer.send('character:setMouseEvents', ignore),
  characterClicked: () => ipcRenderer.send('character:clicked'),
  dragStart: () => ipcRenderer.send('character:dragStart'),
  dragMove: () => ipcRenderer.send('character:dragMove'),
  dragEnd: () => ipcRenderer.send('character:dragEnd'),

  // Chat window broadcasts state (thinking/speaking) to character
  broadcastState: (payload) => ipcRenderer.send('state:broadcast', payload),

  // Chat window
  closeChat: () => ipcRenderer.send('chat:close'),

  // Chat panel resize from left edge
  chatResizeStart: () => ipcRenderer.send('chat:resizeStart'),
  chatResize: (dx) => ipcRenderer.send('chat:resize', { dx }),
  chatResizeEnd: () => ipcRenderer.send('chat:resizeEnd'),

  // Open URL externally
  openExternal: (url) => ipcRenderer.send('shell:open', url),

  // State sync between windows (summoned, dismissed, thinking, etc.)
  onState: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on('eurelyas:state', listener);
    return () => ipcRenderer.removeListener('eurelyas:state', listener);
  },

  // External
  openExternal: (url) => ipcRenderer.send('shell:open', url)
});
