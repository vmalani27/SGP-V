'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface LabTerminalProps {
  wsUrl: string;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export default function LabTerminal({
  wsUrl,
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
  const [state, setState] = useState<ConnectionState>('connecting');
  const wsUrlRef = useRef(wsUrl);

  // Keep wsUrl ref in sync
  useEffect(() => {
    wsUrlRef.current = wsUrl;
  }, [wsUrl]);

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

  const connect = useCallback(() => {
    cleanup();
    setState('connecting');

    connectionGen.current += 1;
    const gen = connectionGen.current;

    const ws = new WebSocket(wsUrlRef.current);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setState('connected');
      onReconnect?.();
    };

    ws.onmessage = (event) => {
      const term = termRef.current;
      if (!term) return;

      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          term.write(new Uint8Array(buf));
        });
      } else {
        term.write(event.data);
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

    // Initial fit
    requestAnimationFrame(() => fitAddon.fit());

    // Forward terminal input to WebSocket
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Send resize events to backend
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const disposable = term.onResize(({ cols, rows }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    return () => disposable.dispose();
  }, [state]);

  // Re-fit and send initial terminal size when WebSocket connects
  useEffect(() => {
    if (state !== 'connected') return;
    requestAnimationFrame(() => {
      const fit = fitRef.current;
      if (fit) fit.fit();
    });
  }, [state]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();
    return () => cleanup();
  }, [connect, cleanup]);

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
