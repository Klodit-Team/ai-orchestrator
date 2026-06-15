import { Router, Request, Response } from 'express';
import axios from 'axios';
import pdfParse from 'pdf-parse';
import { generateJson, generateJsonWithVision } from './gemini';

async function fetchBuffer(fileUrl: string): Promise<Buffer> {
  const res = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 20_000 });
  return Buffer.from(res.data as ArrayBuffer);
}

function guessMime(url: string): string {
  if (/\.png$/i.test(url)) return 'image/png';
  if (/\.gif$/i.test(url)) return 'image/gif';
  if (/\.webp$/i.test(url)) return 'image/webp';
  return 'image/jpeg';
}

export function buildOcrRouter(apiKey: string): Router {
  const router = Router();

  const OCR_SYS = 'You are a precise OCR engine for official Algerian procurement documents. Extract text faithfully.';

  router.post('/extract-text', async (req: Request, res: Response) => {
    try {
      const { fileUrl } = req.body as { fileUrl?: string };
      if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required' });

      const buf = await fetchBuffer(fileUrl);

      // Fast path: native PDF text extraction — zero API cost
      try {
        const pdf = await pdfParse(buf);
        if (pdf.text.trim().length > 20) {
          return res.json({ text: pdf.text.trim(), confidence: 0.97, method: 'pdf-parse' });
        }
      } catch {}

      // Scanned PDF or image: Gemini Vision
      const result = await generateJsonWithVision(
        apiKey, OCR_SYS,
        'Extract ALL text from this document verbatim, preserving structure. Return JSON: {"text": "...", "confidence": 0.0-1.0}',
        buf.toString('base64'), guessMime(fileUrl),
      ) as Record<string, unknown>;

      res.json({ text: result.text ?? '', confidence: result.confidence ?? 0.85, method: 'gemini-vision' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/extract-fields', async (req: Request, res: Response) => {
    try {
      const { fileUrl, schema } = req.body as { fileUrl?: string; schema?: Record<string, unknown> };
      if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required' });

      const buf = await fetchBuffer(fileUrl);
      let text = '';

      try {
        const pdf = await pdfParse(buf);
        text = pdf.text.trim();
      } catch {
        const raw = await generateJsonWithVision(
          apiKey, OCR_SYS,
          'Extract all text verbatim. Return JSON: {"text": "..."}',
          buf.toString('base64'), guessMime(fileUrl),
        ) as Record<string, unknown>;
        text = String(raw.text ?? '');
      }

      const fields = await generateJson(
        apiKey,
        'You are a document field extractor for official procurement documents.',
        `Extract the following fields from the document text.\nRequired fields schema: ${JSON.stringify(schema ?? {})}\n\nDocument text:\n${text.slice(0, 4_000)}\n\nReturn a JSON object mapping each field name to its extracted value (null if not found).`,
      );

      res.json({ fields, text });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/detect-signature', async (req: Request, res: Response) => {
    try {
      const { fileUrl } = req.body as { fileUrl?: string };
      if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required' });

      const buf = await fetchBuffer(fileUrl);
      const result = await generateJsonWithVision(
        apiKey,
        'You are a document analysis expert.',
        'Does this document contain a handwritten signature, wet stamp, or digital signature? Return JSON: {"hasSignature": true|false, "confidence": 0.0-1.0, "detail": "..."}',
        buf.toString('base64'), guessMime(fileUrl),
      );

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
}
