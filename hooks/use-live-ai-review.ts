'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { canReview, REVIEW_INTERVAL_MS } from '@/lib/agent-review-policy';
import type { TradeType } from '@/lib/types';

export interface AgentReview {
  market: string;
  risk: string;
}

export function useLiveAIReview(input: {
  enabled: boolean; automatic: boolean; connected: boolean; digits: number[];
  epoch: number; tradeType: TradeType;
}) {
  const latest = useRef(input);
  latest.current = input;
  const flight = useRef<AbortController | null>(null);
  const nextAt = useRef(0);
  const lastEpoch = useRef(0);
  const failures = useRef(0);
  const [now, setNow] = useState(Date.now());
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<{ review: AgentReview; epoch: number } | null>(null);

  const cancel = useCallback(() => {
    flight.current?.abort();
    flight.current = null;
    setBusy(false);
  }, []);

  const requestReview = useCallback(async () => {
    const current = latest.current;
    const started = Date.now();
    if (!canReview({ ...current, count: current.digits.length, visible: !document.hidden,
      now: started, nextReviewAt: nextAt.current, lastEpoch: lastEpoch.current, busy: !!flight.current })) return;
    const abort = new AbortController();
    flight.current = abort;
    nextAt.current = started + REVIEW_INTERVAL_MS;
    lastEpoch.current = current.epoch;
    setNow(started); setBusy(true); setError('');
    const timeout = setTimeout(() => abort.abort('timeout'), 20000);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/digit-signals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ digits: current.digits, tradeType: current.tradeType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'AI review unavailable.');
      if (!data.review || typeof data.review.market !== 'string' || typeof data.review.risk !== 'string') throw new Error('AI returned an incomplete review.');
      if (flight.current !== abort || abort.signal.aborted) return;
      failures.current = 0;
      setSnapshot({ review: data.review, epoch: current.epoch });
    } catch {
      if (flight.current !== abort) return;
      failures.current += 1;
      nextAt.current = Date.now() + Math.min(300000, REVIEW_INTERVAL_MS * 2 ** Math.min(failures.current, 4));
      setError('AI review unavailable. Statistical scanning continues; the agents retry after a cooldown.');
    } finally {
      clearTimeout(timeout);
      if (flight.current === abort) { flight.current = null; setBusy(false); setNow(Date.now()); }
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      setVisible(!document.hidden);
      if (document.hidden) cancel();
      setNow(Date.now());
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); cancel(); };
  }, [cancel]);

  useEffect(() => {
    if (!input.enabled || !input.connected || !visible) cancel();
  }, [input.enabled, input.connected, visible, cancel]);

  useEffect(() => {
    if (!input.enabled) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time - latest.current.epoch * 1000 >= 10000) cancel();
      if (latest.current.automatic) void requestReview();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [input.enabled, input.automatic, requestReview, cancel]);

  return { now, visible, busy, error, snapshot, nextReviewAt: nextAt.current, requestReview,
    canRequest: canReview({ ...input, count: input.digits.length, visible, now,
      nextReviewAt: nextAt.current, lastEpoch: lastEpoch.current, busy }) };
}
