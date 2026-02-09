import { submitFeedback } from '../server/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const { analysisId, feedback } = body;

  if (typeof analysisId !== 'string' || !analysisId) {
    res.status(400).json({ error: 'analysisId is required' });
    return;
  }

  if (feedback !== 'correct' && feedback !== 'incorrect') {
    res.status(400).json({ error: 'feedback must be "correct" or "incorrect"' });
    return;
  }

  const ok = await submitFeedback(analysisId, feedback, process.env);
  if (ok) {
    res.status(200).json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to save feedback' });
  }
}
