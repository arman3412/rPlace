import { useCallback, useEffect, useRef, useState } from 'react';
import { configured, readableError } from './config';
import { advance, snapshot, type Cursor, type Placement } from './sync';
export function useCanvas() {
  const [pixels, setPixels] = useState<Uint32Array>(() => new Uint32Array(10000).fill(0xffffff));
  const [recent, setRecent] = useState<Placement[]>([]);
  const [status, setStatus] = useState<'setup' | 'loading' | 'live' | 'reconnecting'>(
    configured ? 'loading' : 'setup',
  );
  const [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [block, setBlock] = useState<bigint>();
  const cursor = useRef<Cursor | undefined>(undefined);
  const reset = useRef(false);
  const refresh = useCallback(() => {
    reset.current = true;
  }, []);
  useEffect(() => {
    if (!configured) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        if (!cursor.current || reset.current) {
          reset.current = false;
          const state = await snapshot();
          if (stopped) return;
          setEpoch((n) => n + 1);
          cursor.current = state.cursor;
          setPixels(state.pixels);
          setRecent(state.recent);
          setBlock(state.cursor.number);
        } else {
          const state = await advance(cursor.current);
          if (stopped) return;
          if (state.reorg) {
            cursor.current = undefined;
            setStatus('reconnecting');
            setError('Chain reorganization detected. Rebuilding confirmed state.');
          } else {
            cursor.current = state.cursor;
            if (state.logs.length) {
              setPixels((previous) => {
                const next = previous.slice();
                for (const log of state.logs) next[log.pixelId] = log.color;
                return next;
              });
              setRecent((previous) => [...state.logs].reverse().concat(previous).slice(0, 40));
            }
            setBlock(state.cursor.number);
          }
        }
        if (cursor.current) {
          setStatus('live');
          setError('');
        }
      } catch (err) {
        if (!stopped) {
          setError(readableError(err));
          setStatus('reconnecting');
        }
      } finally {
        if (!stopped) timer = setTimeout(tick, 4000);
      }
    }
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return { pixels, recent, status, error, block, refresh, epoch };
}
