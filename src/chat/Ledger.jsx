// src/chat/Ledger.jsx
// Markdown-aware editor with a small formatting toolbar.
// Stores plain markdown to disk (portable, future-proof).

import React, { useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, CheckSquare, Eye, EyeOff } from 'lucide-react';
import { PALETTE } from '../shared/palette.js';

export default function Ledger({ value, onChange }) {
  const textareaRef = useRef(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Wrap selection or insert at cursor
  const wrap = (before, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newValue);
    // Reposition cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
    });
  };

  // Prefix the current line(s) with given marker (for lists, headings)
  const prefixLines = (marker) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selection = value.slice(start, end);
    const after = value.slice(end);

    // Find line starts in selection
    const lineStart = before.lastIndexOf('\n') + 1;
    const linesText = value.slice(lineStart, end);
    const newLinesText = linesText
      .split('\n')
      .map((line, i) => {
        // For ordered lists, number them
        if (marker === '1. ') return `${i + 1}. ${line}`;
        return marker + line;
      })
      .join('\n');

    const newValue = value.slice(0, lineStart) + newLinesText + after;
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + newLinesText.length;
    });
  };

  // Keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); wrap('**'); }
      else if (e.key === 'i') { e.preventDefault(); wrap('*'); }
      else if (e.key === '/' && e.shiftKey) { e.preventDefault(); setPreviewMode(p => !p); }
    }
    // Auto-continue lists
    if (e.key === 'Enter' && !e.shiftKey) {
      const ta = e.target;
      const pos = ta.selectionStart;
      const before = value.slice(0, pos);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);
      // Bullet list
      const bulletMatch = currentLine.match(/^(\s*)([-*]) (.*)$/);
      if (bulletMatch) {
        if (bulletMatch[3].trim() === '') {
          // Empty bullet — exit the list
          e.preventDefault();
          const newValue = value.slice(0, lineStart) + value.slice(pos);
          onChange(newValue);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          });
          return;
        }
        e.preventDefault();
        const insert = `\n${bulletMatch[1]}${bulletMatch[2]} `;
        const newValue = value.slice(0, pos) + insert + value.slice(pos);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + insert.length;
        });
      }
      // Numbered list
      const numMatch = currentLine.match(/^(\s*)(\d+)\. (.*)$/);
      if (numMatch) {
        if (numMatch[3].trim() === '') {
          e.preventDefault();
          const newValue = value.slice(0, lineStart) + value.slice(pos);
          onChange(newValue);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          });
          return;
        }
        e.preventDefault();
        const nextNum = parseInt(numMatch[2], 10) + 1;
        const insert = `\n${numMatch[1]}${nextNum}. `;
        const newValue = value.slice(0, pos) + insert + value.slice(pos);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + insert.length;
        });
      }
      // Checkbox list
      const checkMatch = currentLine.match(/^(\s*)- \[[ x]\] (.*)$/);
      if (checkMatch) {
        if (checkMatch[2].trim() === '') {
          e.preventDefault();
          const newValue = value.slice(0, lineStart) + value.slice(pos);
          onChange(newValue);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = lineStart;
          });
          return;
        }
        e.preventDefault();
        const insert = `\n${checkMatch[1]}- [ ] `;
        const newValue = value.slice(0, pos) + insert + value.slice(pos);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = pos + insert.length;
        });
      }
    }
  };

  const tools = [
    { icon: Heading1,    title: 'Heading 1',    onClick: () => prefixLines('# ') },
    { icon: Heading2,    title: 'Heading 2',    onClick: () => prefixLines('## ') },
    { icon: Bold,        title: 'Bold (Ctrl+B)', onClick: () => wrap('**') },
    { icon: Italic,      title: 'Italic (Ctrl+I)', onClick: () => wrap('*') },
    { icon: List,        title: 'Bulleted list', onClick: () => prefixLines('- ') },
    { icon: ListOrdered, title: 'Numbered list', onClick: () => prefixLines('1. ') },
    { icon: CheckSquare, title: 'Checkbox',      onClick: () => prefixLines('- [ ] ') }
  ];

  const previewIcon = previewMode ? EyeOff : Eye;
  const PreviewIcon = previewIcon;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: PALETTE.panelBorder }}>
        {tools.map((t, i) => {
          const Icon = t.icon;
          return (
            <button
              key={i}
              onClick={t.onClick}
              title={t.title}
              className="p-1.5 rounded transition"
              style={{ color: PALETTE.panelDim }}
              onMouseEnter={e => e.currentTarget.style.color = PALETTE.goldLight}
              onMouseLeave={e => e.currentTarget.style.color = PALETTE.panelDim}
            >
              <Icon size={13} />
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => setPreviewMode(p => !p)}
          title={previewMode ? 'Edit mode' : 'Preview mode (Ctrl+Shift+/)'}
          className="p-1.5 rounded transition"
          style={{ color: previewMode ? PALETTE.goldLight : PALETTE.panelDim }}
        >
          <PreviewIcon size={13} />
        </button>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 p-3 min-h-0">
        {previewMode ? (
          <div
            className="w-full h-full overflow-y-auto rounded-lg p-4 text-sm"
            style={{
              background: 'rgba(184,201,222,0.04)',
              border: `1px solid ${PALETTE.panelBorder}`,
              color: PALETTE.panelText,
              lineHeight: 1.7
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="The ledger — markdown supported. Try Ctrl+B, Ctrl+I, or the toolbar."
            className="w-full h-full rounded-lg p-4 text-sm focus:outline-none resize-none"
            style={{
              background: 'rgba(184,201,222,0.04)',
              border: `1px solid ${PALETTE.panelBorder}`,
              color: PALETTE.panelText,
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.7
            }}
          />
        )}
      </div>
    </div>
  );
}

// Minimal markdown renderer — sufficient for the ledger use case.
// Handles: headings, bold, italic, bulleted/numbered lists, checkboxes, blockquotes.
function renderMarkdown(md) {
  if (!md) return '<em style="opacity:0.5">Nothing yet.</em>';
  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const html = [];
  let inUl = false, inOl = false;

  const closeLists = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // Headings
    let m;
    if ((m = line.match(/^### (.*)$/))) { closeLists(); html.push(`<h3 style="font-family:'Cinzel',serif;letter-spacing:0.1em;color:#E8C87A;margin:0.8em 0 0.3em;">${escapeHtml(m[1])}</h3>`); continue; }
    if ((m = line.match(/^## (.*)$/)))  { closeLists(); html.push(`<h2 style="font-family:'Cinzel',serif;letter-spacing:0.12em;color:#E8C87A;margin:0.9em 0 0.4em;font-size:1.15em;">${escapeHtml(m[1])}</h2>`); continue; }
    if ((m = line.match(/^# (.*)$/)))   { closeLists(); html.push(`<h1 style="font-family:'Cinzel',serif;letter-spacing:0.15em;color:#FFE9A8;margin:1em 0 0.5em;font-size:1.3em;">${escapeHtml(m[1])}</h1>`); continue; }

    // Checkbox list
    if ((m = line.match(/^(\s*)- \[([ x])\] (.*)$/))) {
      if (!inUl) { closeLists(); html.push('<ul style="padding-left:1.2em;margin:0.3em 0;list-style:none;">'); inUl = true; }
      const checked = m[2] === 'x';
      const inline = renderInline(escapeHtml(m[3]));
      html.push(`<li style="margin:0.15em 0;"><span style="display:inline-block;width:1em;color:${checked ? '#86efac' : '#8B9AAE'};">${checked ? '☑' : '☐'}</span> ${checked ? `<span style="opacity:0.6;text-decoration:line-through;">${inline}</span>` : inline}</li>`);
      continue;
    }

    // Bulleted list
    if ((m = line.match(/^(\s*)[-*] (.*)$/))) {
      if (!inUl) { closeLists(); html.push('<ul style="padding-left:1.4em;margin:0.3em 0;">'); inUl = true; }
      html.push(`<li style="margin:0.15em 0;">${renderInline(escapeHtml(m[2]))}</li>`);
      continue;
    }

    // Numbered list
    if ((m = line.match(/^(\s*)\d+\. (.*)$/))) {
      if (!inOl) { closeLists(); html.push('<ol style="padding-left:1.6em;margin:0.3em 0;">'); inOl = true; }
      html.push(`<li style="margin:0.15em 0;">${renderInline(escapeHtml(m[2]))}</li>`);
      continue;
    }

    // Blockquote
    if ((m = line.match(/^> (.*)$/))) {
      closeLists();
      html.push(`<blockquote style="border-left:2px solid #C9A961;padding-left:0.8em;color:#B8C9DE;font-style:italic;margin:0.4em 0;">${renderInline(escapeHtml(m[1]))}</blockquote>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeLists();
      html.push('<br/>');
      continue;
    }

    // Paragraph
    closeLists();
    html.push(`<p style="margin:0.4em 0;">${renderInline(escapeHtml(line))}</p>`);
  }
  closeLists();
  return html.join('');
}

function renderInline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#FFE9A8;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(201,169,97,0.15);padding:0.1em 0.4em;border-radius:3px;font-family:ui-monospace,monospace;font-size:0.92em;">$1</code>');
}
