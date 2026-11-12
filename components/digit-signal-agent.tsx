'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzeDigits } from '@/lib/digit-signals';
import { getLastDigit } from '@/lib/digit-stats';
import type { ContractMode, TradeType } from '@/lib/types';

export function DigitSignalAgent({ prices, pipSize, tradeType, connected, epoch, onApply }: {
  prices: number[]; pipSize: number; tradeType: TradeType; connected: boolean;
  epoch: number; onApply: (mode: ContractMode, digit: number) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  const digits = useMemo(() => prices.slice(-200).map(p => getLastDigit(p, pipSize)), [prices, pipSize]);
  const signal = useMemo(() => analyzeDigits(digits, tradeType), [digits, tradeType]);
  const fresh = connected && epoch > 0 && now - epoch * 1000 < 10000;
  const ready = enabled && fresh && signal.count >= 100;
  async function requestReview() {
    if (!ready || busy || Date.now() < cooldown) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(''); setReview('');
    setCooldown(Date.now() + 30000);
    setReviewEpoch(epoch);
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/digit-signals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digits, tradeType }), signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI review unavailable.');
      setReview(data.review);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'AI review unavailable.');
      else setError('AI review timed out. Try again shortly.');
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  return (
    <section aria-label="Fast Catch AI signal agent" className="mx-auto mt-4 w-[calc(100%-1.5rem)] max-w-[992px] shrink-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h2 className="font-semibold">Fast Catch <span className="font-normal text-muted-foreground">/ AI signals</span></h2></div>
        <Button size="sm" variant={enabled ? 'secondary' : 'outline'} aria-pressed={enabled} onClick={() => { setEnabled(v => !v); setNow(Date.now()); }}>{enabled ? 'Pause scanner' : 'Start scanner'}</Button>
      </div>
      {!enabled ? <p className="mt-3 text-sm text-muted-foreground">Analyze the latest 200 Deriv ticks in real time. Review digit setups and load one into your trade controls.</p> : <>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm">
          <strong>{!fresh ? 'WAIT · No fresh feed' : signal.status === 'warming' ? 'WARMING UP' : signal.status === 'observe' ? 'OBSERVE · Window agreement' : 'WAIT · No clear imbalance'}</strong>
          <span>{signal.count}/200 ticks</span>
          <span>Updated each tick</span>
        </div>
        {signal.count >= 100 && <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto]">
          <div><p className="font-medium">Observed setup: {signal.mode.replace('DIGIT', '')}{!['DIGITEVEN', 'DIGITODD'].includes(signal.mode) && ` ${signal.digit}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">Historical hit rate {(signal.rate * 100).toFixed(1)}% · Last 50 {(signal.recentRate * 100).toFixed(1)}% · Uniform baseline {(signal.baseline * 100).toFixed(0)}%</p></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!ready || busy || now < cooldown} onClick={requestReview}><Sparkles />{busy ? 'Reviewing…' : now < cooldown ? 'Review cooldown' : 'AI review'}</Button>
            <Button size="sm" disabled={!ready || signal.status !== 'observe'} onClick={() => { if (connected && Date.now() - epoch * 1000 < 10000) onApply(signal.mode, signal.digit); }}>Load setup</Button>
          </div>
        </div>}
        {signal.count < 100 && <p className="mt-3 text-sm text-muted-foreground">Collecting at least 100 ticks before evaluating setups.</p>}
        {busy && <p role="status" className="mt-3 animate-pulse text-sm text-muted-foreground">AI is reviewing this market snapshot…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {review && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">AI snapshot · {new Date(reviewEpoch * 1000).toLocaleTimeString()} · {epoch !== reviewEpoch ? 'New ticks have arrived; review is historical.' : 'Current snapshot'}</p>{review}</div>}
      </>}
      <p className="mt-3 text-xs text-muted-foreground">Digit outcomes are random. Historical rates are not win probabilities. Review the live payout and stake before buying. Loading a setup does not place a trade.</p>
    </section>
  );
}
