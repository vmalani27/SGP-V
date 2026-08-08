'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Osc52Extractor } from './osc52';
import '@xterm/xterm/css/xterm.css';

interface LabTerminalProps {
  wsUrl: string;
  wsToken: string;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export default function LabTerminal({
  wsUrl,
  wsToken,
  onDisconnect,
  onReconnect,
  className = '',
}: LabTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionGen = useRef(0);
  const lastDataAt = useRef(Date.now());
  const osc52Ref = useRef<Osc52Extractor | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const wsUrlRef = useRef(wsUrl);
  const wsTokenRef = useRef(wsToken);

  // Keep wsUrl/wsToken refs in sync
  useEffect(() => {
    wsUrlRef.current = wsUrl;
  }, [wsUrl]);

  useEffect(() => {
    wsTokenRef.current = wsToken;
  }, [wsToken]);

  const copyToClipboard = (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
  };

  if (!osc52Ref.current) {
    osc52Ref.current = new Osc52Extractor(copyToClipboard);
  }

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // clipboard unavailable
    }
    document.body.removeChild(ta);
  };

  const connect = useCallback(() => {
    cleanup();
    setState('connecting');

    connectionGen.current += 1;
    const gen = connectionGen.current;

    const ws = new WebSocket(wsUrlRef.current);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      lastDataAt.current = Date.now();
      // Auth handshake — token is sent as the first message, never in the URL.
      if (wsTokenRef.current) {
        ws.send(JSON.stringify({ type: 'auth', token: wsTokenRef.current }));
      }
      setState('connected');
      onReconnect?.();
    };

    ws.onmessage = (event) => {
      lastDataAt.current = Date.now();
      const term = termRef.current;
      if (!term) return;

      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf);
          term.write(bytes);
          // Scan for OSC 52 clipboard sequences. The decoded copy is only used
          // for detection; raw bytes go to xterm so UTF-8 split across frames
          // stays intact (xterm ignores OSC 52 sequences it doesn't handle).
          osc52Ref.current?.process(new TextDecoder().decode(bytes));
        });
      } else if (typeof event.data === 'string') {
        // Terminal output arrives as binary frames; text frames are control
        // messages (e.g. {"type":"pong"}). Never render control frames.
        try {
          const obj = JSON.parse(event.data);
          if (
            obj &&
            typeof obj === 'object' &&
            typeof obj.type === 'string' &&
            obj.type !== 'output'
          ) {
            return;
          }
        } catch {
          // not JSON — treat as output
        }
        term.write(event.data);
        osc52Ref.current?.process(event.data);
      }
    };

    ws.onclose = (event) => {
      if (event.code === 4001 || event.code === 4003) {
        setState('error');
        return;
      }

      if (gen !== connectionGen.current) return;

      setState('reconnecting');
      onDisconnect?.();

      const attempt = reconnectAttempt.current;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttempt.current = attempt + 1;

      reconnectTimer.current = setTimeout(() => {
        if (gen !== connectionGen.current) return;
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // onclose will handle reconnection
    };
  }, [cleanup, onDisconnect, onReconnect]);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Forward terminal input to WebSocket
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Fit is safe to call repeatedly; guard against zero-size throws.
    const safeFit = () => {
      try {
        fitAddon.fit();
      } catch {
        // container may not be laid out yet
      }
    };

    // Initial fit after layout + web font load (fonts change cell metrics,
    // so refitting once the IBM Plex Mono font arrives fills the full width).
    requestAnimationFrame(safeFit);
    const fontTimer = setTimeout(safeFit, 300);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(safeFit).catch(() => {});
    }

    // Handle resize — debounced via rAF, with window resize as a fallback.
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(safeFit);
    });
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', safeFit);

    return () => {
      cancelAnimationFrame(resizeRaf);
      clearTimeout(fontTimer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', safeFit);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Send resize events to backend (binary frame, matching receive_bytes)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onResize(({ cols, rows }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          new TextEncoder().encode(JSON.stringify({ type: 'resize', cols, rows }))
        );
      }
    });

    return () => disposable.dispose();
  }, [state]);

  // Re-fit and send the terminal size to the backend when WebSocket connects.
  // This guarantees the remote tmux is sized to the local terminal even when
  // the dimensions haven't changed since the previous connection. A second
  // send lands after tmux attach settles, so the remote window always matches.
  useEffect(() => {
    if (state !== 'connected') return;
    const sendSize = () => {
      const term = termRef.current;
      const ws = wsRef.current;
      if (term && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          new TextEncoder().encode(
            JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })
          )
        );
      }
    };
    requestAnimationFrame(() => {
      const fit = fitRef.current;
      if (fit) {
        try {
          fit.fit();
        } catch {
          // ignore — container may not be laid out yet
        }
      }
      sendSize();
    });
    const settleTimer = setTimeout(sendSize, 600);
    return () => clearTimeout(settleTimer);
  }, [state]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();
    return () => cleanup();
  }, [connect, cleanup]);

  // Keepalive + stall detection while connected.
  // - Ping every 15s so the backend/orchestrator idle watchdogs see traffic.
  // - If no data arrives for 45s the connection is wedged (or the server died
  //   silently); force a close so the onclose path reconnects with a fresh
  //   exec instead of freezing with no way to type.
  useEffect(() => {
    if (state !== 'connected') return;

    const pingTimer = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);

    const stallTimer = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (Date.now() - lastDataAt.current > 45000) {
          ws.close();
        }
      }
    }, 5000);

    return () => {
      clearInterval(pingTimer);
      clearInterval(stallTimer);
    };
  }, [state]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />

      {state !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
          <div className="text-center space-y-3">
            {state === 'connecting' && (
              <>
                <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-300 text-sm">Connecting to lab...</p>
              </>
            )}
            {state === 'reconnecting' && (
              <>
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-300 text-sm">
                  Reconnecting... (attempt {reconnectAttempt.current})
                </p>
                <p className="text-gray-500 text-xs">
                  Your tmux session is preserved. Scrollback will be restored.
                </p>
              </>
            )}
            {state === 'error' && (
              <>
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                  <span className="text-red-400 text-lg">!</span>
                </div>
                <p className="text-red-400 text-sm">Connection failed</p>
                <p className="text-gray-500 text-xs">Token may have expired. Refresh the page.</p>
              </>
            )}
            {state === 'disconnected' && (
              <>
                <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center mx-auto">
                  <span className="text-gray-400 text-lg">-</span>
                </div>
                <p className="text-gray-400 text-sm">Disconnected</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
