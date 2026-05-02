// src/chat/ChatWindow.jsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, StickyNote, Terminal, Sparkles, Search as SearchIcon, Wind, ChevronDown, X, Minus, ChevronRight, Loader2 } from 'lucide-react';
import { PALETTE } from '../shared/palette.js';
import Ledger from './Ledger.jsx';
import Search from './Search.jsx';

export default function ChatWindow() {
  const [mode, setMode] = useState('chat');
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Eurelyas stands with you, Ajit.' }
  ]);
  const [input, setInput] = useState('');
  const [notes, setNotes] = useState('');
  const [shellLog, setShellLog] = useState([]);
  const [shellInput, setShellInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [working, setWorking] = useState(false);
  const [liveToolCalls, setLiveToolCalls] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    window.eurelyas?.loadNotes().then(setNotes);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => window.eurelyas?.saveNotes(notes), 500);
    return () => clearTimeout(t);
  }, [notes]);

  useEffect(() => {
    if (!window.eurelyas) return;
    const unsub = window.eurelyas.onState(({ event, tool }) => {
      if (event === 'working') setWorking(true);
      if (event === 'tool_call' && tool) {
        setLiveToolCalls(prev => [...prev, { ...tool }]);
      }
      if (event === 'tool_result' && tool) {
        setLiveToolCalls(prev => prev.map(tc => tc.id === tool.id ? { ...tool } : tc));
      }
      // Clear working when speaking or summoned (conversation done)
      if (event === 'speaking' || event === 'summoned') setWorking(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking, working, liveToolCalls]);

  const handleSend = async () => {
    if (!input.trim() || thinking) return;
    const newMsgs = [...messages.filter(m => m.role !== 'system' && m.role !== 'error').map(m => ({ role: m.role, content: m.content })), { role: 'user', content: input }];
    setMessages(m => [...m, { role: 'user', content: input }]);
    setInput('');
    setThinking(true);
    setWorking(false);
    setLiveToolCalls([]);
    window.eurelyas.broadcastState?.({ event: 'thinking' });
    try {
      const result = await window.eurelyas.chat({ messages: newMsgs });
      setThinking(false);
      setWorking(false);
      if (result.ok) {
        window.eurelyas.broadcastState?.({ event: 'speaking' });
        setMessages(m => [...m, {
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls && result.toolCalls.length > 0 ? result.toolCalls : undefined
        }]);
        setLiveToolCalls([]);
        setTimeout(() => window.eurelyas.broadcastState?.({ event: 'summoned' }), 1200);
      } else {
        window.eurelyas.broadcastState?.({ event: 'summoned' });
        setMessages(m => [...m, { role: 'error', content: `Error: ${result.error}` }]);
        setLiveToolCalls([]);
      }
    } catch (err) {
      setThinking(false);
      setWorking(false);
      setLiveToolCalls([]);
      window.eurelyas.broadcastState?.({ event: 'summoned' });
      setMessages(m => [...m, { role: 'error', content: `Error: ${err.message || err}` }]);
    }
  };

  const handleShell = async () => {
    if (!shellInput.trim()) return;
    const cmd = shellInput;
    setShellInput('');
    setShellLog(l => [...l, { cmd, out: '...', running: true }]);
    const r = await window.eurelyas.shell(cmd);
    setShellLog(l => {
      const copy = [...l];
      copy[copy.length - 1] = { cmd, out: r.ok ? r.output : r.error, err: !r.ok };
      return copy;
    });
  };

  const panelStyle = {
    background: PALETTE.panelBg,
    borderColor: PALETTE.panelBorder,
    backdropFilter: 'blur(12px)',
    color: PALETTE.panelText
  };

  const goldGradient = `linear-gradient(135deg, ${PALETTE.goldLight} 0%, ${PALETTE.goldMid} 100%)`;

  return (
    <div
      className="drag w-screen h-screen rounded-2xl overflow-hidden border shadow-2xl flex flex-col relative"
      style={panelStyle}
    >
      {/* Resize handle - drag the left edge to resize the panel */}
      <ResizeHandle />

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: PALETTE.panelBorder }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: PALETTE.goldGlow, boxShadow: `0 0 10px ${PALETTE.goldGlow}` }}
          />
          <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'Cinzel, Georgia, serif', color: PALETTE.panelText }}>
            Eurelyas
          </span>
          <span className="text-[10px] tracking-widest uppercase" style={{ color: PALETTE.panelDim }}>
            Guardian
          </span>
        </div>
        <div className="no-drag flex items-center gap-1">
          <MoodMenu />
          <button onClick={() => window.eurelyas.closeChat()} className="p-1 transition hover:text-red-300" style={{ color: PALETTE.panelDim }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-drag flex border-b" style={{ borderColor: PALETTE.panelBorder }}>
        {[
          { id: 'chat', label: 'Counsel', icon: Sparkles },
          { id: 'search', label: 'Seek', icon: SearchIcon },
          { id: 'notes', label: 'Ledger', icon: StickyNote },
          { id: 'shell', label: 'Command', icon: Terminal }
        ].map(t => {
          const Icon = t.icon;
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-[10px] tracking-[0.25em] uppercase transition relative"
              style={{ color: active ? PALETTE.goldLight : PALETTE.panelDim }}
            >
              <Icon size={11} />
              {t.label}
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0"
                  style={{ height: 2, background: goldGradient }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="no-drag flex-1 flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          {mode === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[85%]">
                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {m.toolCalls.map(tc => <ToolCallBlock key={tc.id} tool={tc} />)}
                        </div>
                      )}
                      <div
                        className="px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap"
                        style={
                          m.role === 'user'
                            ? { background: 'rgba(201,169,97,0.12)', border: `1px solid ${PALETTE.goldMid}40`, color: PALETTE.goldLight }
                            : m.role === 'system'
                            ? { background: 'rgba(184,201,222,0.06)', border: `1px solid ${PALETTE.panelBorder}`, color: PALETTE.panelDim, fontStyle: 'italic' }
                            : m.role === 'error'
                            ? { background: 'rgba(180,60,60,0.15)', border: '1px solid rgba(220,80,80,0.3)', color: '#f4b4b4' }
                            : { background: 'rgba(184,201,222,0.08)', border: `1px solid ${PALETTE.panelBorder}`, color: PALETTE.panelText }
                        }
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                ))}
                {thinking && !working && (
                  <div className="flex gap-1.5 px-3 py-2">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: PALETTE.goldGlow, boxShadow: `0 0 6px ${PALETTE.goldGlow}` }}
                        animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                )}
                {working && (
                  <div className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs" style={{ color: PALETTE.energyWarm }}>
                      <motion.div
                        className="w-2 h-2 rounded-full"
                        style={{ background: PALETTE.energyWarm, boxShadow: `0 0 8px ${PALETTE.energyWarm}` }}
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      />
                      <span className="tracking-[0.15em] uppercase" style={{ fontFamily: 'Cinzel, Georgia, serif' }}>
                        Working
                      </span>
                      {liveToolCalls.length > 0 && (
                        <span style={{ color: PALETTE.panelDim }}>
                          {liveToolCalls[liveToolCalls.length - 1].name.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {liveToolCalls.map(tc => <ToolCallBlock key={tc.id} tool={tc} />)}
                  </div>
                )}
              </div>
              <div className="p-3 border-t flex gap-2" style={{ borderColor: PALETTE.panelBorder }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Speak, Ajit…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    background: 'rgba(184,201,222,0.06)',
                    border: `1px solid ${PALETTE.panelBorder}`,
                    color: PALETTE.panelText
                  }}
                />
                <button
                  onClick={handleSend}
                  className="px-3 rounded-lg transition hover:brightness-110"
                  style={{ background: goldGradient, color: '#2a1f0a' }}
                >
                  <Send size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {mode === 'search' && (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
              <Search />
            </motion.div>
          )}

          {mode === 'notes' && (
            <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
              <Ledger value={notes} onChange={setNotes} />
            </motion.div>
          )}

          {mode === 'shell' && (
            <motion.div key="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs space-y-2" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {shellLog.length === 0 && (
                  <div className="italic" style={{ color: PALETTE.panelDim }}>The command line awaits.</div>
                )}
                {shellLog.map((l, i) => (
                  <div key={i}>
                    <div style={{ color: PALETTE.goldLight }}>&gt; {l.cmd}</div>
                    <div className="pl-3 whitespace-pre-wrap" style={{ color: l.err ? '#f4b4b4' : PALETTE.panelText }}>{l.out}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t flex gap-2 items-center" style={{ borderColor: PALETTE.panelBorder }}>
                <span className="font-mono text-sm" style={{ color: PALETTE.goldLight }}>&gt;</span>
                <input
                  value={shellInput}
                  onChange={e => setShellInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleShell()}
                  placeholder="dir, git status, npm install…"
                  className="flex-1 bg-transparent text-sm focus:outline-none font-mono"
                  style={{ color: PALETTE.panelText }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t flex items-center justify-between text-[9px] uppercase tracking-[0.2em]"
           style={{ borderColor: PALETTE.panelBorder, color: PALETTE.panelDim }}>
        <span>Claude Sonnet 4</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#86efac', boxShadow: '0 0 6px #86efac' }} />
          bound
        </span>
      </div>
    </div>
  );
}

// Collapsible inline block showing a tool call: name, input summary, status, output
function ToolCallBlock({ tool }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    tool.status === 'running' ? PALETTE.energyWarm
    : tool.status === 'error' ? '#f4b4b4'
    : PALETTE.panelDim;

  const inputSummary = tool.input
    ? Object.values(tool.input).join(' ').slice(0, 60) + (Object.values(tool.input).join(' ').length > 60 ? '...' : '')
    : '';

  const resultPreview = tool.result
    ? tool.result.slice(0, 500) + (tool.result.length > 500 ? '\n...' : '')
    : '';

  return (
    <div
      className="rounded text-[11px] font-mono overflow-hidden"
      style={{ background: 'rgba(184,201,222,0.05)', border: `1px solid ${PALETTE.panelBorder}` }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left"
        style={{ color: PALETTE.panelText, background: 'transparent', border: 'none' }}
      >
        <ChevronRight
          size={10}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            flexShrink: 0,
            color: PALETTE.panelDim
          }}
        />
        {tool.status === 'running' && (
          <Loader2 size={10} style={{ color: PALETTE.energyWarm, animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        )}
        <span style={{ color: statusColor }}>
          {tool.name.replace(/_/g, ' ')}
        </span>
        <span style={{ color: PALETTE.panelDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {inputSummary}
        </span>
      </button>
      {expanded && resultPreview && (
        <div
          className="px-2 pb-1.5 whitespace-pre-wrap break-all"
          style={{ color: tool.status === 'error' ? '#f4b4b4' : PALETTE.panelDim, borderTop: `1px solid ${PALETTE.panelBorder}` }}
        >
          {resultPreview}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Manual mood trigger menu
// Drag handle on the left edge - drag horizontally to resize the panel.
// Sends mouse delta to main process which updates the window bounds.
function ResizeHandle() {
  const startXRef = useRef(0);
  const draggingRef = useRef(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    startXRef.current = e.screenX;
    window.eurelyas?.chatResizeStart();

    const handleMove = (ev) => {
      if (!draggingRef.current) return;
      const dx = ev.screenX - startXRef.current;
      window.eurelyas?.chatResize(dx);
    };
    const handleUp = () => {
      draggingRef.current = false;
      window.eurelyas?.chatResizeEnd();
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return <div className="resize-w" onMouseDown={handleMouseDown} title="Drag to resize" />;
}

function MoodMenu() {
  const [open, setOpen] = useState(false);

  const moods = [
    { label: 'Default', glow: 'default' },
    { label: 'Warm',    glow: 'warm' },
    { label: 'Cool',    glow: 'cool' },
    { label: 'Crimson', glow: 'crimson' },
    { label: 'Serene',  glow: 'serene' },
    { label: 'Intense', glow: 'intense' }
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 transition flex items-center gap-1"
        style={{ color: open ? PALETTE.goldLight : PALETTE.panelDim }}
        title="Mood"
      >
        <Wind size={13} />
        <ChevronDown size={10} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-50"
            style={{
              background: PALETTE.panelBg,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${PALETTE.panelBorder}`,
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}
          >
            <div className="px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] border-b"
                 style={{ color: PALETTE.panelDim, borderColor: PALETTE.panelBorder }}>
              Mood
            </div>
            {moods.map((m, i) => (
              <button key={i}
                onClick={() => {
                  window.eurelyas?.setMood(m.glow);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs transition"
                style={{ color: PALETTE.panelText, background: 'transparent', border: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,169,97,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {m.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
