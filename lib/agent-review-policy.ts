export const REVIEW_INTERVAL_MS = 30000;
export const FEED_MAX_AGE_MS = 10000;

export function canReview({ enabled, connected, visible, count, epoch, now, nextReviewAt, lastEpoch, busy }: {
  enabled: boolean; connected: boolean; visible: boolean; count: number; epoch: number;
  now: number; nextReviewAt: number; lastEpoch: number; busy: boolean;
}) {
  const age = now - epoch * 1000;
  return enabled && connected && visible && count >= 100 && epoch > 0 && age >= -2000 && age < FEED_MAX_AGE_MS && now >= nextReviewAt && epoch > lastEpoch && !busy;
}
