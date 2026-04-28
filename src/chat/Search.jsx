// src/chat/Search.jsx
//
// Eurelyas's Seek tab.
//
// Strategy: reader-mode-first.
//   1. User types query
//   2. Claude returns 0-3 clarifying questions (in Eurelyas's voice)
//   3. We search and show top 5 results
//   4. Tapping a result fetches the page server-side, runs Mozilla Readability
//      to extract just the article content, renders it as styled HTML inline.
//      ~5MB memory cost, ~300-500ms latency, beautiful for reading.
//   5. If reader fails (interactive site, paywall, JS-heavy app), or user
//      explicitly clicks "View full page", we spin up a <webview> instead.
//
// This means 95% of reading happens in the lightweight path; webview only
// fires when actually needed.

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search as SearchIcon, ExternalLink, ArrowRight, X, ArrowLeft,
  Smartphone, Monitor, Globe, RefreshCw, BookOpen, Layers
} from 'lucide-react';
import { PALETTE } from '../shared/palette.js';

const STAGES = {
  IDLE: 'idle',
  CLARIFYING: 'clarifying',
  SEARCHING: 'searching',
  RESULTS: 'results',
  READER_LOADING: 'reader_loading',
  READER: 'reader',
  WEBVIEW: 'webview',
  ERROR: 'error'
};

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export default function Search() {
  const [stage, setStage] = useState(STAGES.IDLE);
  const [query, setQuery] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  // Reader state
  const [article, setArticle] = useState(null);
  const [readerFailReason, setReaderFailReason] = useState('');

  // Webview state (only spun up when reader fails or user requests)
  const [webviewUrl, setWebviewUrl] = useState('');
  const [uaMode, setUaMode] = useState('mobile');
  const webviewRef = useRef(null);

  const handleStart = async () => {
    if (!query.trim()) return;
    setStage(STAGES.CLARIFYING);
    const r = await window.eurelyas.searchClarify(query);
    if (r.ok && r.questions.length > 0) {
      setQuestions(r.questions);
      setAnswers({});
    } else {
      runSearch(query);
    }
  };

  const handleSkipQuestions = () => runSearch(query);

  const handleSubmitAnswers = () => {
    const enrichedParts = [query];
    questions.forEach((q, i) => {
      const a = (answers[i] || '').trim();
      if (a) enrichedParts.push(a);
    });
    runSearch(enrichedParts.join(' '));
  };

  const runSearch = async (finalQuery) => {
    setStage(STAGES.SEARCHING);
    const r = await window.eurelyas.searchWeb(finalQuery);
    if (r.ok) {
      setResults(r.results || []);
      setStage(STAGES.RESULTS);
    } else {
      setError(r.error || 'Search failed');
      setStage(STAGES.ERROR);
    }
  };

  const reset = () => {
    setStage(STAGES.IDLE);
    setQuery('');
    setQuestions([]);
    setAnswers({});
    setResults([]);
    setError('');
    setArticle(null);
    setReaderFailReason('');
    setWebviewUrl('');
  };

  // Open a result: try reader mode first
  const openInReader = async (url) => {
    setStage(STAGES.READER_LOADING);
    setArticle(null);
    setReaderFailReason('');
    const r = await window.eurelyas.readerFetch(url);
    if (r.ok) {
      setArticle({ ...r, url });
      setStage(STAGES.READER);
    } else {
      // Reader failed — show a brief explanation with options
      setReaderFailReason(r.reason || 'unknown');
      setArticle({ url, title: '', failedReason: r.reason });
      setStage(STAGES.READER);  // still show the reader view to display the failure UI
    }
  };

  // Spin up the heavy webview path when user explicitly requests it
  const openInWebview = (url) => {
    setWebviewUrl(url);
    setStage(STAGES.WEBVIEW);
  };

  const goBackToResults = () => {
    setStage(STAGES.RESULTS);
    setArticle(null);
    setWebviewUrl('');
    setReaderFailReason('');
  };

  const refreshWebview = () => {
    if (webviewRef.current) {
      try { webviewRef.current.reload(); } catch {}
    }
  };

  const openExternal = (url) => {
    window.eurelyas?.openExternal(url);
  };

  // When UA mode changes mid-browse, reload webview with new UA
  useEffect(() => {
    if (stage === STAGES.WEBVIEW && webviewRef.current) {
      try {
        webviewRef.current.setUserAgent(uaMode === 'mobile' ? MOBILE_UA : '');
        webviewRef.current.reload();
      } catch {}
    }
  }, [uaMode, stage]);

  const goldGradient = `linear-gradient(135deg, ${PALETTE.goldLight} 0%, ${PALETTE.goldMid} 100%)`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AnimatePresence mode="wait">
        {stage === STAGES.IDLE && <IdleStage query={query} setQuery={setQuery} onStart={handleStart} goldGradient={goldGradient} />}
        {stage === STAGES.CLARIFYING && questions.length > 0 && (
          <ClarifyingStage
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            onSubmit={handleSubmitAnswers}
            onSkip={handleSkipQuestions}
            goldGradient={goldGradient}
          />
        )}
        {stage === STAGES.SEARCHING && <SearchingStage />}
        {stage === STAGES.RESULTS && (
          <ResultsStage results={results} onOpen={openInReader} onReset={reset} />
        )}
        {stage === STAGES.READER_LOADING && <ReaderLoadingStage onCancel={goBackToResults} />}
        {stage === STAGES.READER && article && (
          <ReaderStage
            article={article}
            failReason={readerFailReason}
            onBack={goBackToResults}
            onOpenWebview={() => openInWebview(article.url)}
            onOpenExternal={() => openExternal(article.url)}
          />
        )}
        {stage === STAGES.WEBVIEW && (
          <WebviewStage
            url={webviewUrl}
            uaMode={uaMode}
            setUaMode={setUaMode}
            webviewRef={webviewRef}
            onBack={goBackToResults}
            onRefresh={refreshWebview}
            onOpenExternal={() => openExternal(webviewUrl)}
          />
        )}
        {stage === STAGES.ERROR && (
          <ErrorStage error={error} onReset={reset} />
        )}
      </AnimatePresence>
    </div>
  );
}

// === Stage components ===

function IdleStage({ query, setQuery, onStart, goldGradient }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-4 gap-3">
      <div className="text-xs uppercase tracking-[0.25em]" style={{ color: PALETTE.panelDim }}>
        What do you seek?
      </div>
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onStart()}
        placeholder="A question, a name, a topic…"
        className="rounded-lg px-3 py-2.5 text-sm focus:outline-none"
        style={{
          background: 'rgba(184,201,222,0.06)',
          border: `1px solid ${PALETTE.panelBorder}`,
          color: PALETTE.panelText
        }}
      />
      <button
        onClick={onStart}
        disabled={!query.trim()}
        className="rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] transition self-start"
        style={{
          background: query.trim() ? goldGradient : 'rgba(184,201,222,0.06)',
          color: query.trim() ? '#2a1f0a' : PALETTE.panelDim,
          opacity: query.trim() ? 1 : 0.5,
          cursor: query.trim() ? 'pointer' : 'not-allowed',
          border: 'none'
        }}
      >
        Begin
      </button>
      <div className="text-[10px] italic mt-auto" style={{ color: PALETTE.panelDim }}>
        Eurelyas may ask a question or two before searching.
      </div>
    </motion.div>
  );
}

function ClarifyingStage({ questions, answers, setAnswers, onSubmit, onSkip, goldGradient }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
      <div className="text-xs uppercase tracking-[0.25em] mb-2" style={{ color: PALETTE.goldLight }}>
        Eurelyas asks
      </div>
      {questions.map((q, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="text-sm" style={{ color: PALETTE.panelText, fontFamily: "'Cormorant Garamond', serif" }}>
            {q}
          </div>
          <input
            value={answers[i] || ''}
            onChange={e => setAnswers({ ...answers, [i]: e.target.value })}
            placeholder="Your answer (optional)"
            className="rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
            style={{
              background: 'rgba(184,201,222,0.05)',
              border: `1px solid ${PALETTE.panelBorder}`,
              color: PALETTE.panelText
            }}
          />
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <button
          onClick={onSubmit}
          className="flex-1 rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] transition flex items-center justify-center gap-2"
          style={{ background: goldGradient, color: '#2a1f0a', border: 'none' }}
        >
          Search <ArrowRight size={12} />
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] transition"
          style={{
            background: 'rgba(184,201,222,0.06)',
            border: `1px solid ${PALETTE.panelBorder}`,
            color: PALETTE.panelDim
          }}
        >
          Skip
        </button>
      </div>
    </motion.div>
  );
}

function SearchingStage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div key={i}
            className="w-2 h-2 rounded-full"
            style={{ background: PALETTE.goldGlow, boxShadow: `0 0 8px ${PALETTE.goldGlow}` }}
            animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
          />
        ))}
      </div>
      <div className="text-xs uppercase tracking-[0.25em]" style={{ color: PALETTE.panelDim }}>
        Searching
      </div>
    </motion.div>
  );
}

function ResultsStage({ results, onOpen, onReset }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: PALETTE.panelBorder }}>
        <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: PALETTE.panelDim }}>
          {results.length} results
        </div>
        <button
          onClick={onReset}
          className="text-[10px] uppercase tracking-[0.2em] transition"
          style={{ color: PALETTE.goldLight, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          New search
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {results.length === 0 && (
          <div className="text-sm italic px-2 py-4" style={{ color: PALETTE.panelDim }}>
            No results found.
          </div>
        )}
        {results.map((r, i) => (
          <div
            key={i}
            onClick={() => onOpen(r.url)}
            className="rounded-lg px-3 py-2.5 cursor-pointer transition"
            style={{
              background: 'rgba(184,201,222,0.04)',
              border: `1px solid ${PALETTE.panelBorder}`
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(201,169,97,0.08)';
              e.currentTarget.style.borderColor = `${PALETTE.goldMid}55`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(184,201,222,0.04)';
              e.currentTarget.style.borderColor = PALETTE.panelBorder;
            }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug" style={{ color: PALETTE.panelText }}>
                  {r.title}
                </div>
                <div className="text-[10px] mt-0.5 truncate" style={{ color: PALETTE.goldLight }}>
                  {r.url}
                </div>
                {r.snippet && (
                  <div className="text-xs mt-1 leading-relaxed" style={{ color: PALETTE.panelDim }}>
                    {r.snippet}
                  </div>
                )}
              </div>
              <BookOpen size={11} style={{ color: PALETTE.panelDim, flexShrink: 0, marginTop: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ReaderLoadingStage({ onCancel }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <BookOpen size={20} style={{ color: PALETTE.goldLight }} />
      <div className="text-xs uppercase tracking-[0.25em]" style={{ color: PALETTE.panelDim }}>
        Reading
      </div>
      <button
        onClick={onCancel}
        className="text-[10px] uppercase tracking-[0.2em] mt-2"
        style={{ color: PALETTE.panelDim, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Cancel
      </button>
    </motion.div>
  );
}

function ReaderStage({ article, failReason, onBack, onOpenWebview, onOpenExternal }) {
  // Failure state: reader couldn't extract a clean article
  if (failReason) {
    const reasonText = {
      'not_readerable':  "This page isn't an article — it's likely interactive content (search results, app, dashboard).",
      'parse_failed':    "I couldn't extract clean content from this page.",
      'fetch_error':     "I couldn't load that page (network error or the site refused the request)."
    }[failReason] || "I couldn't read that page.";

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex-1 flex flex-col min-h-0">
        <ReaderToolbar onBack={onBack} url={article.url} onOpenExternal={onOpenExternal} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <BookOpen size={22} style={{ color: PALETTE.panelDim }} />
          <div className="text-sm" style={{ color: PALETTE.panelText, fontFamily: "'Cormorant Garamond', serif" }}>
            {reasonText}
          </div>
          <div className="flex flex-col gap-2 w-full max-w-[260px] mt-3">
            <button
              onClick={onOpenWebview}
              className="rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition"
              style={{
                background: 'rgba(201,169,97,0.15)',
                border: `1px solid ${PALETTE.goldMid}55`,
                color: PALETTE.goldLight
              }}
            >
              <Layers size={11} /> Open full page
            </button>
            <button
              onClick={onOpenExternal}
              className="rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition"
              style={{
                background: 'rgba(184,201,222,0.06)',
                border: `1px solid ${PALETTE.panelBorder}`,
                color: PALETTE.panelDim
              }}
            >
              <ExternalLink size={11} /> Open in browser
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Normal reader view
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col min-h-0">
      <ReaderToolbar
        onBack={onBack}
        url={article.url}
        onOpenWebview={onOpenWebview}
        onOpenExternal={onOpenExternal}
      />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {article.title && (
          <h1 style={{
            fontFamily: 'Cinzel, Georgia, serif',
            color: PALETTE.goldLight,
            fontSize: '1.25em',
            letterSpacing: '0.05em',
            marginBottom: '0.4em',
            lineHeight: 1.3
          }}>
            {article.title}
          </h1>
        )}
        {(article.byline || article.siteName) && (
          <div className="text-[10px] uppercase tracking-[0.2em] mb-4 flex gap-2" style={{ color: PALETTE.panelDim }}>
            {article.byline && <span>{article.byline}</span>}
            {article.byline && article.siteName && <span>·</span>}
            {article.siteName && <span>{article.siteName}</span>}
          </div>
        )}
        <ReaderContent html={article.content} />
      </div>
    </motion.div>
  );
}

function ReaderToolbar({ onBack, url, onOpenWebview, onOpenExternal }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: PALETTE.panelBorder }}>
      <button
        onClick={onBack}
        title="Back to results"
        className="p-1.5 rounded transition"
        style={{ color: PALETTE.panelDim }}
        onMouseEnter={e => e.currentTarget.style.color = PALETTE.goldLight}
        onMouseLeave={e => e.currentTarget.style.color = PALETTE.panelDim}
      >
        <ArrowLeft size={13} />
      </button>
      <div className="flex-1 text-[10px] truncate px-2" style={{ color: PALETTE.panelDim }}>
        {url}
      </div>
      {onOpenWebview && (
        <button
          onClick={onOpenWebview}
          title="View full page (heavier)"
          className="p-1.5 rounded transition"
          style={{ color: PALETTE.panelDim }}
          onMouseEnter={e => e.currentTarget.style.color = PALETTE.goldLight}
          onMouseLeave={e => e.currentTarget.style.color = PALETTE.panelDim}
        >
          <Layers size={11} />
        </button>
      )}
      {onOpenExternal && (
        <button
          onClick={onOpenExternal}
          title="Open in default browser"
          className="p-1.5 rounded transition"
          style={{ color: PALETTE.panelDim }}
          onMouseEnter={e => e.currentTarget.style.color = PALETTE.goldLight}
          onMouseLeave={e => e.currentTarget.style.color = PALETTE.panelDim}
        >
          <ExternalLink size={11} />
        </button>
      )}
    </div>
  );
}

// Renders the cleaned article HTML with Eurelyas-themed typography.
// Uses dangerouslySetInnerHTML — Readability already sanitizes, but we add
// a small CSS reset so links, images, and lists look right inside the panel.
function ReaderContent({ html }) {
  const containerStyle = `
    .reader-body { color: ${PALETTE.panelText}; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 14px; line-height: 1.7; }
    .reader-body h1, .reader-body h2, .reader-body h3, .reader-body h4 { font-family: 'Cinzel', serif; color: ${PALETTE.goldLight}; letter-spacing: 0.03em; margin: 1em 0 0.4em; line-height: 1.3; }
    .reader-body h1 { font-size: 1.2em; }
    .reader-body h2 { font-size: 1.1em; }
    .reader-body h3 { font-size: 1em; }
    .reader-body p { margin: 0.7em 0; }
    .reader-body a { color: ${PALETTE.goldLight}; text-decoration: underline; text-decoration-color: ${PALETTE.goldMid}55; text-underline-offset: 2px; }
    .reader-body a:hover { color: ${PALETTE.goldMid}; }
    .reader-body img { max-width: 100%; height: auto; border-radius: 6px; margin: 0.8em 0; }
    .reader-body figure { margin: 1em 0; }
    .reader-body figcaption { font-size: 0.85em; color: ${PALETTE.panelDim}; font-style: italic; text-align: center; margin-top: 0.3em; }
    .reader-body blockquote { border-left: 2px solid ${PALETTE.goldMid}; padding-left: 0.9em; color: ${PALETTE.panelDim}; font-style: italic; margin: 0.8em 0; }
    .reader-body ul, .reader-body ol { padding-left: 1.4em; margin: 0.6em 0; }
    .reader-body li { margin: 0.3em 0; }
    .reader-body code { background: rgba(201,169,97,0.12); padding: 0.1em 0.4em; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.92em; }
    .reader-body pre { background: rgba(184,201,222,0.05); padding: 0.8em; border-radius: 6px; overflow-x: auto; font-size: 0.88em; }
    .reader-body pre code { background: none; padding: 0; }
    .reader-body hr { border: none; border-top: 1px solid ${PALETTE.panelBorder}; margin: 1.2em 0; }
    .reader-body table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 0.92em; }
    .reader-body th, .reader-body td { border: 1px solid ${PALETTE.panelBorder}; padding: 0.4em 0.6em; }
    .reader-body th { background: rgba(201,169,97,0.08); }
  `;
  return (
    <>
      <style>{containerStyle}</style>
      <div className="reader-body" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

function WebviewStage({ url, uaMode, setUaMode, webviewRef, onBack, onRefresh, onOpenExternal }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: PALETTE.panelBorder }}>
        <button onClick={onBack} title="Back to results" className="p-1.5 rounded transition" style={{ color: PALETTE.panelDim }}>
          <ArrowLeft size={13} />
        </button>
        <button onClick={onRefresh} title="Reload" className="p-1.5 rounded transition" style={{ color: PALETTE.panelDim }}>
          <RefreshCw size={11} />
        </button>
        <div className="flex-1 text-[10px] truncate px-2" style={{ color: PALETTE.panelDim }}>{url}</div>
        <button
          onClick={() => setUaMode(uaMode === 'mobile' ? 'desktop' : 'mobile')}
          title={uaMode === 'mobile' ? 'Switch to desktop view' : 'Switch to mobile view'}
          className="p-1.5 rounded transition"
          style={{ color: uaMode === 'mobile' ? PALETTE.goldLight : PALETTE.panelDim }}
        >
          {uaMode === 'mobile' ? <Smartphone size={12} /> : <Monitor size={12} />}
        </button>
        <button onClick={onOpenExternal} title="Open in default browser" className="p-1.5 rounded transition" style={{ color: PALETTE.panelDim }}>
          <ExternalLink size={11} />
        </button>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        <webview
          ref={webviewRef}
          src={url}
          useragent={uaMode === 'mobile' ? MOBILE_UA : undefined}
          style={{ width: '100%', height: '100%', display: 'flex', background: 'white' }}
          allowpopups="true"
        />
      </div>
    </motion.div>
  );
}

function ErrorStage({ error, onReset }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <X size={28} style={{ color: '#f4b4b4' }} />
      <div className="text-sm text-center" style={{ color: '#f4b4b4' }}>
        {error}
      </div>
      <div className="text-[10px] text-center max-w-xs" style={{ color: PALETTE.panelDim }}>
        If using Brave, check that BRAVE_API_KEY is set in your .env. The DuckDuckGo fallback runs without a key.
      </div>
      <button
        onClick={onReset}
        className="rounded-lg px-3 py-2 text-xs uppercase tracking-[0.2em] mt-2"
        style={{
          background: 'rgba(184,201,222,0.06)',
          border: `1px solid ${PALETTE.panelBorder}`,
          color: PALETTE.panelText
        }}
      >
        Try again
      </button>
    </motion.div>
  );
}
