import { Router, Request, Response } from 'express';
import { generateJson } from './gemini';

export function buildAnomalyRouter(apiKey: string): Router {
  const router = Router();

  const SYS = 'You are a fraud detection expert specializing in Algerian public procurement anomalies. Analyze objectively and return valid JSON as specified.';

  router.post('/detect-collusion', async (req: Request, res: Response) => {
    try {
      const { bids } = req.body as { bids: Record<string, unknown>[] };
      if (!Array.isArray(bids) || bids.length < 2) {
        return res.json({ flags: [], summary: 'Not enough bids to analyze.' });
      }
      const result = await generateJson(apiKey, SYS,
        `Analyze these bids for collusion signals: identical pricing structures, complementary bids, bid rotation, cover pricing, or any abnormal coordination patterns.\n\nBids:\n${JSON.stringify(bids, null, 2).slice(0, 5_000)}\n\nReturn JSON: {"flags": [{"soumissionId": "...", "confidence": 0.0-1.0, "detail": "..."}], "summary": "..."}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/detect-price-pattern', async (req: Request, res: Response) => {
    try {
      const { bids } = req.body as { bids: Record<string, unknown>[] };
      if (!Array.isArray(bids) || bids.length < 2) {
        return res.json({ flags: [], statistics: { mean: 0, stdDev: 0, outlierCount: 0 } });
      }
      const result = await generateJson(apiKey, SYS,
        `Detect anomalous pricing patterns: statistical outliers, suspiciously round numbers, bids just below procurement thresholds, or unrealistic pricing.\n\nBids:\n${JSON.stringify(bids, null, 2).slice(0, 5_000)}\n\nReturn JSON: {"flags": [{"soumissionId": "...", "confidence": 0.0-1.0, "detail": "..."}], "statistics": {"mean": 0, "stdDev": 0, "outlierCount": 0}}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/detect-saucissonnage', async (req: Request, res: Response) => {
    try {
      const { aoSet } = req.body as { aoSet: Record<string, unknown>[] };
      if (!Array.isArray(aoSet) || aoSet.length < 2) {
        return res.json({ flags: [], suspectedSplitting: false, explanation: 'Not enough AOs to analyze.' });
      }
      const result = await generateJson(apiKey, SYS,
        `Detect "saucissonnage" (artificial contract splitting) where a buyer splits a large contract into smaller ones to circumvent Algerian procurement thresholds (Article 12, DP 15-247).\n\nAppels d'offres:\n${JSON.stringify(aoSet, null, 2).slice(0, 5_000)}\n\nReturn JSON: {"flags": [{"soumissionId": "...", "confidence": 0.0-1.0, "detail": "..."}], "suspectedSplitting": false, "explanation": "..."}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
