import type { ContractMode, TradeType } from './types';

export function analyzeDigits(digits: number[], tradeType: TradeType) {
  const sample = digits.slice(-200);
  const modes: ContractMode[] = tradeType === 'matches-differs' ? ['DIGITMATCH', 'DIGITDIFF'] : tradeType === 'over-under' ? ['DIGITOVER', 'DIGITUNDER'] : ['DIGITEVEN', 'DIGITODD'];
  const candidates = modes.flatMap(mode => {
    const barriers = mode === 'DIGITEVEN' || mode === 'DIGITODD' ? [0] : Array.from({ length: 10 }, (_, i) => i).filter(i => mode === 'DIGITOVER' ? i < 9 : mode === 'DIGITUNDER' ? i > 0 : true);
    return barriers.map(digit => {
      const wins = (d: number) => mode === 'DIGITMATCH' ? d === digit : mode === 'DIGITDIFF' ? d !== digit : mode === 'DIGITOVER' ? d > digit : mode === 'DIGITUNDER' ? d < digit : mode === 'DIGITEVEN' ? d % 2 === 0 : d % 2 === 1;
      const baseline = Array.from({ length: 10 }, (_, i) => i).filter(wins).length / 10;
      const rate = sample.length ? sample.filter(wins).length / sample.length : baseline;
      const recent = sample.slice(-50);
      const recentRate = recent.length ? recent.filter(wins).length / recent.length : baseline;
      // Require agreement across windows and a conservative sampling margin.
      const margin = 1.96 * Math.sqrt(baseline * (1 - baseline) / Math.max(1, sample.length));
      return { mode, digit, rate, baseline, recentRate, excess: Math.min(rate, recentRate) - baseline, margin };
    });
  });
  candidates.sort((a, b) => b.excess - a.excess);
  const best = candidates[0];
  return { ...best, count: sample.length, status: sample.length < 100 ? 'warming' : best.excess > best.margin ? 'observe' : 'wait' };
}
