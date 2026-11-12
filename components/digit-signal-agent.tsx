'use client';

import { useMemo, useState } from 'react';
import { useLiveAIReview } from '@/hooks/use-live-ai-review';
import { FEED_MAX_AGE_MS } from '@/lib/agent-review-policy';
import { Activity, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzeDigits } from '@/lib/digit-signals';
import { getLastDigit } from '@/lib/digit-stats';
import type { ContractMode, TradeType } from '@/lib/types';

export function DigitSignalAgent({ prices, pipSize, tradeType, connected, epoch, onApply, accountType, marketName, proposal }: {
  prices: number[]; pipSize: number; tradeType: TradeType; connected: boolean;
  accountType: 'demo' | 'real' | null; marketName: string;
  proposal: { askPrice: number; payout: number } | null;
  epoch: number; onApply: (mode: ContractMode, digit: number) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [applied, setApplied] = useState(false);
  const digits = useMemo(() => prices.slice(-200).map(p => getLastDigit(p, pipSize)), [prices, pipSize]);
  const signal = useMemo(() => analyzeDigits(digits, tradeType), [digits, tradeType]);
  const { now, visible, busy, error, snapshot, nextReviewAt, requestReview, canRequest } = useLiveAIReview({
    enabled, automatic, connected, digits, epoch, tradeType,
  });
  const age = now - epoch * 1000;
  const fresh = connected && epoch > 0 && age >= -2000 && age < FEED_MAX_AGE_MS;
  const ready = enabled && visible && fresh && signal.count >= 100;
  const breakEven = proposal && proposal.payout > 0 && proposal.askPrice > 0
    ? proposal.askPrice / proposal.payout * 100 : null;
  return (
    <section aria-label="Fast Catch AI signal agent" className="mx-auto mt-4 w-[calc(100%-1.5rem)] max-w-[992px] shrink-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h2 className="font-semibold">Fast Catch <span className="font-normal text-muted-foreground">/ AI signals</span></h2></div>
        <Button size="sm" variant={enabled ? 'secondary' : 'outline'} aria-pressed={enabled} onClick={() => setEnabled(v => !v)}>{enabled ? 'Pause scanner' : 'Start scanner'}</Button>
      </div>
      {!enabled ? <p className="mt-3 text-sm text-muted-foreground">Start a live analysis session for demo or real trading. AI reviews refresh automatically while this tab is visible; every purchase needs your approval.</p> : <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{marketName} · {accountType ? `${accountType === 'demo' ? 'Demo' : 'Real'} account` : 'Public feed · Sign in to trade'} · Manual purchases</span>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={automatic} onChange={e => setAutomatic(e.target.checked)} />Automatic AI reviews · every 30s</label>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm">
          <strong>{!visible ? 'PAUSED · Tab hidden' : !fresh ? 'WAIT · No fresh feed' : signal.status === 'warming' ? 'WARMING UP' : signal.status === 'observe' ? 'OBSERVE · Window agreement' : 'WAIT · No clear imbalance'}</strong>
          <span>{signal.count}/200 ticks</span>
          <span>Updated each tick</span>
        </div>
        {signal.count >= 100 && <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto]">
          <div><p className="font-medium">Observed setup: {signal.mode.replace('DIGIT', '')}{!['DIGITEVEN', 'DIGITODD'].includes(signal.mode) && ` ${signal.digit}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">Historical hit rate {(signal.rate * 100).toFixed(1)}% · Last 50 {(signal.recentRate * 100).toFixed(1)}% · Uniform baseline {(signal.baseline * 100).toFixed(0)}%</p></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!canRequest} onClick={requestReview}><Sparkles />{busy ? 'Reviewing…' : now < nextReviewAt ? `Review in ${Math.ceil((nextReviewAt - now) / 1000)}s` : 'Review now'}</Button>
            <Button size="sm" disabled={!ready || signal.status !== 'observe'} onClick={() => { const age = Date.now() - epoch * 1000; if (connected && !document.hidden && age >= -2000 && age < FEED_MAX_AGE_MS) { onApply(signal.mode, signal.digit); setApplied(true); } }}>Load setup</Button>
          </div>
        </div>}
        {signal.count < 100 && <p className="mt-3 text-sm text-muted-foreground">Collecting at least 100 ticks before evaluating setups.</p>}
        {busy && <p role="status" className="mt-3 animate-pulse text-sm text-muted-foreground">AI is reviewing this market snapshot…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {snapshot && <div className="mt-3 divide-y rounded-lg border bg-muted/40 text-sm">
          <p className="p-3 text-xs text-muted-foreground">AI snapshot · {new Date(snapshot.epoch * 1000).toLocaleTimeString()} · {epoch !== snapshot.epoch || !fresh ? 'Historical review; newer or stale feed.' : 'Latest reviewed tick'}</p>
          <div className="p-3"><h3 className="mb-1 font-medium">Market analyst</h3><p>{snapshot.review.market}</p></div>
          <div className="p-3"><h3 className="mb-1 font-medium">Risk reviewer</h3><p>{snapshot.review.risk}</p></div>
        </div>}
        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          <p>Selected trade proposal: {breakEven !== null ? `${breakEven.toFixed(2)}% break-even win probability (stake ÷ payout).` : 'Waiting for a live quote.'} This quote belongs to your current controls, not an unloaded setup.</p>
          {applied && <p role="status" className="mt-2 text-foreground">Setup loaded. Review the refreshed quote, stake and duration, then use your existing Buy button to approve the purchase.</p>}
          {automatic && <p className="mt-2">Reviews run while this page is open, use AI credits, and wait for new ticks between requests.</p>}
        </div>
      </>}
      <p className="mt-3 text-xs text-muted-foreground">Digit outcomes are random. Historical rates are not win probabilities. Review the live payout and stake before buying. Loading a setup does not place a trade.</p>
    </section>
  );
}
