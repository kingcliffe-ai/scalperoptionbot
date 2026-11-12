import OpenAI from 'openai';
import { analyzeDigits } from '@/lib/digit-signals';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Request origin rejected.' }, { status: 403, headers });
  }
  if (Number(request.headers.get('content-length')) > 4096) return Response.json({ error: 'Sample too large.' }, { status: 413, headers });
  try {
    const body = await request.text();
    if (body.length > 4096) return Response.json({ error: 'Sample too large.' }, { status: 413, headers });
    const { digits, tradeType } = JSON.parse(body);
    if (!Array.isArray(digits) || digits.length < 100 || digits.length > 200 || !digits.every(d => Number.isInteger(d) && d >= 0 && d <= 9) || !['matches-differs', 'over-under', 'even-odd'].includes(tradeType)) {
      return Response.json({ error: 'Provide 100–200 valid digits and a supported trade type.' }, { status: 400, headers });
    }
    const analysis = analyzeDigits(digits, tradeType);
    const result = await new OpenAI({ timeout: 15000, maxRetries: 0 }).chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 220,
      messages: [
        { role: 'system', content: 'You review historical digit statistics for a Deriv trading dashboard. Give a concise review in at most 3 sentences. These are random digits: historical imbalances cannot establish a predictive edge. Multiple candidates were searched, so sampling margins are descriptive, not significance tests. Never claim confidence, profitability, a guaranteed entry, or tell the user to buy. Explain whether to wait or observe based on supplied status and mention payout and break-even probability must be reviewed. Do not change the setup or invent data.' },
        { role: 'user', content: JSON.stringify(analysis) },
      ],
    });
    const review = result.choices[0]?.message.content;
    if (!review) throw new Error('Empty response');
    return Response.json({ review }, { headers });
  } catch {
    return Response.json({ error: 'AI review is unavailable. Live statistical analysis remains active; try again shortly.' }, { status: 503, headers });
  }
}
