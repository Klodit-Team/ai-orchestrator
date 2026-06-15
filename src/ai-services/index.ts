import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import express from 'express';
import { buildOcrRouter } from './ocr';
import { buildNlpRouter } from './nlp';
import { buildAnomalyRouter } from './anomaly';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('[ai-services] GEMINI_API_KEY is required. Set it in ai-orchestrator/.env');
  process.exit(1);
}

const PORT = Number(process.env.AI_SERVICES_PORT ?? 4010);
const app = express();

app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'al-mizan-ai-services', port: PORT }),
);

app.use('/ocr', buildOcrRouter(API_KEY));
app.use('/nlp', buildNlpRouter(API_KEY));
app.use('/anomaly', buildAnomalyRouter(API_KEY));

app.listen(PORT, () => {
  console.log(`\n[ai-services] Running on http://localhost:${PORT}`);
  console.log(`  OCR      → http://localhost:${PORT}/ocr`);
  console.log(`  NLP      → http://localhost:${PORT}/nlp`);
  console.log(`  Anomaly  → http://localhost:${PORT}/anomaly\n`);
});
