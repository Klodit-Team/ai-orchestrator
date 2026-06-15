import { Router, Request, Response } from 'express';
import { generateJson } from './gemini';

export function buildNlpRouter(apiKey: string): Router {
  const router = Router();

  const SYS = 'You are an NLP engine specialized in Algerian public procurement documents (governed by Décret Présidentiel n°15-247). Always return valid JSON exactly as specified.';

  router.post('/classify-document', async (req: Request, res: Response) => {
    try {
      const { text, categories } = req.body as { text: string; categories?: string[] };
      const cats = categories ?? ['AO', 'SOUMISSION', 'CONTRAT', 'FACTURE', 'CAHIER_DES_CHARGES', 'RAPPORT', 'AUTRE'];
      const result = await generateJson(apiKey, SYS,
        `Classify this document into one of: ${JSON.stringify(cats)}\n\nText:\n${text.slice(0, 3_000)}\n\nReturn JSON: {"category": "...", "confidence": 0.0-1.0, "reason": "..."}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/check-completeness', async (req: Request, res: Response) => {
    try {
      const { text, requiredFields } = req.body as { text: string; requiredFields: string[] };
      const result = await generateJson(apiKey, SYS,
        `Check whether the following required fields are present and contain actual values in the document text.\nRequired fields: ${JSON.stringify(requiredFields)}\n\nDocument text:\n${text.slice(0, 4_000)}\n\nReturn JSON: {"present": ["field1"], "missing": ["field2"], "isComplete": true|false}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/check-expiry-dates', async (req: Request, res: Response) => {
    try {
      const { text, alertThresholdDays } = req.body as { text: string; alertThresholdDays?: number };
      const threshold = alertThresholdDays ?? 30;
      const today = new Date().toISOString().split('T')[0];
      const result = await generateJson(apiKey, SYS,
        `Today is ${today}. Find all dates in this document. Flag any that are already expired or expiring within ${threshold} days.\n\nText:\n${text.slice(0, 4_000)}\n\nReturn JSON: {"dates": [{"value": "YYYY-MM-DD", "label": "description", "daysLeft": 0, "expired": false}], "hasExpired": false, "hasNearExpiry": false}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/detect-discriminatory-clauses', async (req: Request, res: Response) => {
    try {
      const { text } = req.body as { text: string };
      const result = await generateJson(apiKey, SYS,
        `Analyze this procurement document text for discriminatory, exclusionary, or anti-competitive clauses that would violate Algerian public procurement regulations.\n\nText:\n${text.slice(0, 4_000)}\n\nReturn JSON: {"hasBias": true|false, "clauses": ["exact clause text"], "explanation": "...", "severity": "HIGH|MEDIUM|LOW|NONE"}`,
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
