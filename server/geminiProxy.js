const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function extractResponseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

export async function runGeminiGenerate({ apiKey, model, contents, config }) {
  if (!apiKey) throw new Error('Missing Gemini API key');
  if (!model || typeof model !== 'string') throw new Error('Invalid model');

  const requestBody = { contents };
  if (config && typeof config === 'object') {
    const generationConfig = {};
    if (typeof config.responseMimeType === 'string') {
      generationConfig.responseMimeType = config.responseMimeType;
    }
    if (config.responseSchema && typeof config.responseSchema === 'object') {
      generationConfig.responseSchema = config.responseSchema;
    }
    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Gemini request failed');
  }

  const data = await response.json();
  return extractResponseText(data);
}
