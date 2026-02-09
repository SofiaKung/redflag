/**
 * Unified analysis handler.
 *
 * Accepts any input type (URL, text, images) and produces an AnalysisResult.
 * Supports dual mode:
 *   USE_AGENTIC_API=true  → Gemini Interactions API with function calling
 *   USE_AGENTIC_API=false → Legacy: parallel tool execution + single generateContent call
 */

import { runAgentLoop } from './agentLoop.js';
import { toolDefinitions, executeTool } from './tools/index.js';
import { getRegistrableDomain, formatDomainAge } from './tools/rdapLookup.js';
import { runGeminiGenerate } from './geminiProxy.js';
import { logError } from './supabase.js';

// ---- Language Helpers ----

/** Convert ISO 639-1 / BCP 47 code to English name for prompt readability. */
function langName(code) {
  if (!code) return 'English';
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; }
  catch { return code; }
}

/** Safety net: normalise a value to an ISO-ish code if Gemini returns a full name. */
function normalizeToIsoCode(val) {
  if (!val || typeof val !== 'string') return 'en';
  const trimmed = val.trim();
  // Already looks like an ISO/BCP 47 code (e.g. "en", "zh-TW")
  if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(trimmed)) return trimmed;
  // Fallback map for common full names Gemini might still return
  const nameToCode = {
    english: 'en', chinese: 'zh', mandarin: 'zh', thai: 'th',
    vietnamese: 'vi', spanish: 'es', portuguese: 'pt',
    indonesian: 'id', malay: 'ms', japanese: 'ja', korean: 'ko',
    french: 'fr', german: 'de', arabic: 'ar', hindi: 'hi',
    russian: 'ru', italian: 'it', 'simplified chinese': 'zh-CN',
    'traditional chinese': 'zh-TW', 'mandarin chinese': 'zh',
  };
  return nameToCode[trimmed.toLowerCase()] || trimmed.toLowerCase().slice(0, 2);
}

// ---- System Prompt ----

function buildSystemPrompt(userLanguage, userCountryCode) {
  const userLangName = langName(userLanguage);
  const locationContext = userCountryCode
    ? `\nUSER CONTEXT:\n- Device language: ${userLangName} (${userLanguage})\n- User location: "${userCountryCode}" (use this for local context — reference local emergency numbers, local brands, and regional scam patterns relevant to this country)\n`
    : '';

  return `You are "RedFlag," a high-precision forensic cybersecurity AI that detects scams, phishing, and fraud.
${locationContext}
CAPABILITIES:
You have access to real-time security tools. Use them to gather intelligence when you encounter URLs or domain names.

TOOL USAGE GUIDELINES:
- If the user provides a URL: Extract the domain and call dns_geoip, rdap_lookup, safe_browsing, and check_homograph to investigate it.
- If the user provides a screenshot: Examine it visually. If you can identify a URL or domain in the image, extract it and call the tools to investigate.
- If the user provides text: Read it for fraud signals. If you find any URLs or domains embedded in the text, extract them and call the tools.
- For obviously safe, well-known domains (google.com, facebook.com, amazon.com), you may skip some checks if confident.
- Call multiple tools in parallel when possible for efficiency.

WHOIS INTELLIGENCE ANALYSIS (when tool results are available):
- If registrant org/name is a PRIVACY PROXY (e.g. "Withheld for Privacy", "Domains By Proxy"), flag this — legitimate businesses typically use their real identity.
- If registrant country differs from server country, explain why this is suspicious for the specific brand/service.
- If the registrant email domain does NOT match the site domain, flag the inconsistency.
- If the domain is very new (days/weeks old) AND uses WHOIS privacy, this is a strong fraud signal.
- If registrant details are completely unavailable, note this as reduced transparency.
- Cross-reference: Does the registrant org match what the site claims to be?

ANALYSIS REQUIREMENTS:
1. Classify the content into a concise fraud category (Phishing, Job Scam, Investment Scam, Romance Scam, Brand Impersonation, Tech Support Scam, etc.).
2. Assign a risk score (0-100) and risk level (SAFE, CAUTION, or DANGER).
3. Detect the native language of the content being analyzed.
4. Generate TWO localized versions of your analysis:
   - "native": In the detected native language of the content
   - "translated": In the user's device language, ${userLangName} (${userLanguage})
   - If the native language matches the device language (including regional variants like zh-TW vs zh-CN), "translated" must be in English.

REQUIRED FIELDS FOR EACH LOCALIZED VERSION:
- headline: Short verdict (2-5 words)
- explanation: Detailed reasoning for the risk score. Incorporate WHOIS and technical findings when available.
- action: Specific security advice. ALWAYS recommend users access the service via the official app or by manually typing the official domain. NEVER suggest a link is safe.
- hook: What initially attracts the victim
- trap: The actual malicious mechanism
- redFlags: Array of specific signals (suspicious domain, bad grammar, urgency, etc.)

LINK METADATA (only when a URL was analyzed):
Include a "linkMetadata" object with:
- analyzedUrl: The exact URL analyzed
- impersonating: Brand being impersonated, or "None detected"
- actualDomain: The registered domain
- domainAge: Use REAL tool data if available, else "Unknown (lookup failed)"
- serverLocation: Use REAL tool data if available, else "Unknown"
- blacklistCount: Number of Safe Browsing threat types found (0 if clean)
- suspiciousTld: The TLD if suspicious (.xyz, .top, .pw, .loan, .click) or ""

OUTPUT FORMAT:
CRITICAL: Your final response MUST be a raw JSON object — no prose, no explanation, no markdown, no code fences. Start with { and end with }. Do NOT write any text before or after the JSON.
IMPORTANT: "detectedNativeLanguage" and "userSystemLanguage" MUST be BCP 47 / ISO 639-1 language codes (e.g. "en", "th", "zh", "zh-TW", "vi", "es", "pt", "id"). Do NOT use full language names.
Return this exact structure:
{
  "riskLevel": "SAFE" | "CAUTION" | "DANGER",
  "score": <number 0-100>,
  "category": "<fraud category string>",
  "detectedNativeLanguage": "<BCP 47 language code, e.g. 'en', 'th', 'zh', 'zh-TW', 'vi'>",
  "userSystemLanguage": "${userLanguage}",
  "native": { "headline", "explanation", "action", "hook", "trap", "redFlags": [] },
  "translated": { "headline", "explanation", "action", "hook", "trap", "redFlags": [] },
  "linkMetadata": { ... }, // only if URL was analyzed
  "scannedText": "<the raw text you extracted/read from the screenshot or image. If the input was a URL, put the URL here. If no text could be extracted, use empty string.>",
  "scamCountryCode": "<ISO 3166-1 alpha-2 country code of where the scam originates or targets, inferred from language, currency, phone numbers, brands, or other clues in the content. Examples: 'TW' for Taiwan scams, 'TH' for Thai scams, 'US' for US-targeting scams. Use empty string if unable to determine.>"
}
Every field is required. "score" MUST be a number.`;
}

// ---- Response Schema ----

const localizedSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    explanation: { type: 'string' },
    action: { type: 'string' },
    hook: { type: 'string' },
    trap: { type: 'string' },
    redFlags: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'explanation', 'action', 'hook', 'trap', 'redFlags'],
};

const linkMetadataSchema = {
  type: 'object',
  properties: {
    analyzedUrl: { type: 'string' },
    impersonating: { type: 'string' },
    actualDomain: { type: 'string' },
    domainAge: { type: 'string' },
    serverLocation: { type: 'string' },
    blacklistCount: { type: 'number' },
    suspiciousTld: { type: 'string' },
  },
  required: ['analyzedUrl', 'impersonating', 'actualDomain', 'domainAge', 'serverLocation', 'blacklistCount', 'suspiciousTld'],
};

const responseSchema = {
  type: 'object',
  properties: {
    riskLevel: { type: 'string', description: 'SAFE, CAUTION, or DANGER' },
    score: { type: 'number', description: '0-100 risk score' },
    category: { type: 'string' },
    detectedNativeLanguage: { type: 'string' },
    userSystemLanguage: { type: 'string' },
    native: localizedSchema,
    translated: localizedSchema,
    linkMetadata: linkMetadataSchema,
    scannedText: { type: 'string', description: 'Raw text extracted from the screenshot/image, or the submitted URL/text' },
    scamCountryCode: { type: 'string', description: 'ISO 3166-1 alpha-2 country code of where the scam originates/targets' },
  },
  required: ['riskLevel', 'score', 'category', 'detectedNativeLanguage', 'userSystemLanguage', 'native', 'translated', 'scannedText', 'scamCountryCode'],
};

// ---- Build Verified Data from Tool Results ----

function buildVerifiedFromToolResults(toolResults) {
  const dns = toolResults.dns_geoip;
  const rdap = toolResults.rdap_lookup;
  const sb = toolResults.safe_browsing;
  const hg = toolResults.check_homograph;

  if (!dns && !rdap && !sb && !hg) return undefined;

  const checksCompleted = [];
  const checksFailed = [];

  if (dns?.success) {
    checksCompleted.push('dns');
    if (dns.country) checksCompleted.push('geoip');
    else checksFailed.push('geoip');
  } else if (dns) {
    checksFailed.push('dns');
  }

  if (rdap) {
    if (rdap.source?.includes('rdap')) checksCompleted.push('rdap');
    if (rdap.registrantOrg || rdap.registrantName) checksCompleted.push('whois');
    if (!rdap.source) checksFailed.push('rdap');
  }

  if (sb?.success) checksCompleted.push('safe_browsing');
  else if (sb) checksFailed.push('safe_browsing');

  if (hg) checksCompleted.push('homograph');

  // Geo-mismatch detection
  const serverCountry = dns?.country || null;
  const registrantCountry = rdap?.registrantCountry || null;
  const geoMismatchDetails = [];
  let geoMismatchSeverity = 'none';

  if (registrantCountry && serverCountry) {
    const regNorm = registrantCountry.toLowerCase().trim();
    const srvNorm = serverCountry.toLowerCase().trim();
    if (regNorm !== srvNorm && regNorm.length > 0 && srvNorm.length > 0) {
      geoMismatchDetails.push(`Registrant in ${registrantCountry}, but server hosted in ${serverCountry}`);
      geoMismatchSeverity = 'medium';
    }
  }

  if (rdap?.privacyProtected && rdap?.domainAge) {
    const isNew = rdap.domainAge.includes('hour') || rdap.domainAge.includes('day') || rdap.domainAge.includes('week');
    if (isNew) {
      geoMismatchDetails.push(`WHOIS privacy-protected on a very new domain (${rdap.domainAge} old)`);
      geoMismatchSeverity = geoMismatchSeverity === 'medium' ? 'high' : 'medium';
    }
  }

  if (geoMismatchDetails.length >= 2 && geoMismatchSeverity === 'medium') {
    geoMismatchSeverity = 'high';
  }

  return {
    domainAge: rdap?.domainAge || null,
    registrationDate: rdap?.registrationDate || null,
    registrar: rdap?.registrar || null,
    serverCountry: dns?.country || null,
    serverCity: dns?.city || null,
    isp: dns?.isp || null,
    resolvedIp: dns?.ip || null,
    homographAttack: hg?.isHomograph || false,
    safeBrowsingThreats: sb?.threats || [],
    registrantName: rdap?.registrantName || null,
    registrantOrg: rdap?.registrantOrg || null,
    registrantStreet: rdap?.registrantStreet || null,
    registrantCity: rdap?.registrantCity || null,
    registrantState: rdap?.registrantState || null,
    registrantPostalCode: rdap?.registrantPostalCode || null,
    registrantCountry: rdap?.registrantCountry || null,
    registrantEmail: rdap?.registrantEmail || null,
    registrantTelephone: rdap?.registrantTelephone || null,
    privacyProtected: rdap?.privacyProtected || false,
    geoMismatch: geoMismatchDetails.length > 0,
    geoMismatchSeverity,
    geoMismatchDetails,
    checksCompleted,
    checksFailed,
  };
}

// ---- Build Input Parts ----

function buildInputParts({ url, text, imagesBase64 }) {
  const parts = [];

  if (url) {
    parts.push({ type: 'text', text: `Analyze this URL for potential fraud or phishing: ${url}` });
  } else if (text) {
    parts.push({ type: 'text', text: `Analyze this content for potential fraud or scam:\n\n${text}` });
  }

  if (imagesBase64 && imagesBase64.length > 0) {
    if (!url && !text) {
      parts.push({ type: 'text', text: 'Analyze this screenshot for potential fraud, phishing, or scam content. If you can identify any URLs or domains in the image, extract them and use the available tools to investigate.' });
    }
    for (const base64 of imagesBase64) {
      parts.push({
        type: 'image',
        data: base64,
        mime_type: 'image/jpeg',
      });
    }
  }

  return parts;
}

// ---- Agentic Path ----

async function runAgentic({ url, text, imagesBase64, userLanguage, userCountryCode, env }) {
  const model = 'gemini-3-pro-preview';
  const apiKey = env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Server is missing GEMINI_API_KEY');

  const systemInstruction = buildSystemPrompt(userLanguage, userCountryCode);
  const input = buildInputParts({ url, text, imagesBase64 });

  const { text: responseText, toolResults } = await runAgentLoop({
    model,
    systemInstruction,
    input,
    tools: toolDefinitions,
    toolExecutor: (name, args) => executeTool(name, args, env),
    apiKey,
  });

  if (!responseText) throw new Error('Empty response from Gemini');

  console.log('[agentic] Raw response (first 500 chars):', responseText.slice(0, 500));
  console.log('[agentic] Tool results keys:', Object.keys(toolResults));

  // Extract JSON from response — model may wrap in code fences or prose
  let cleaned = responseText.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // If response doesn't start with {, try to find JSON object in the text
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }
  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (parseErr) {
    const err = new Error(`Failed to parse Gemini response as JSON: ${parseErr.message}`);
    err.rawResponse = responseText.slice(0, 2000);
    throw err;
  }

  // Ensure required fields have correct types (no schema enforcement in Interactions API)
  if (typeof result.score !== 'number') {
    result.score = typeof result.score === 'string' ? parseInt(result.score, 10) || 0 : 0;
  }
  if (!result.riskLevel) {
    result.riskLevel = result.score >= 70 ? 'DANGER' : result.score >= 30 ? 'CAUTION' : 'SAFE';
  }

  // Normalise language fields to ISO codes (safety net if Gemini returns full names)
  result.detectedNativeLanguage = normalizeToIsoCode(result.detectedNativeLanguage);
  result.userSystemLanguage = normalizeToIsoCode(result.userSystemLanguage);

  // Attach server-side verified data
  const verified = buildVerifiedFromToolResults(toolResults);
  if (verified && result.linkMetadata) {
    result.linkMetadata.verified = verified;
  } else if (verified) {
    // Model didn't produce linkMetadata but tools ran — create it
    result.linkMetadata = {
      analyzedUrl: url || '',
      impersonating: 'Unknown',
      actualDomain: url ? getRegistrableDomain(new URL(url.startsWith('http') ? url : `https://${url}`).hostname) : '',
      domainAge: verified.domainAge || 'Unknown',
      serverLocation: verified.serverCountry || 'Unknown',
      blacklistCount: verified.safeBrowsingThreats?.length || 0,
      suspiciousTld: '',
      verified,
    };
  }

  return result;
}

// ---- Legacy Path (fallback) ----

async function runLegacy({ url, text, imagesBase64, userLanguage, userCountryCode, env }) {
  const apiKey = env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Server is missing GEMINI_API_KEY');

  let intel = null;
  let hostname = '';
  let registrableDomain = '';

  // Run tools directly if we have a URL
  if (url) {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    try {
      const parsed = new URL(normalizedUrl);
      hostname = parsed.hostname;
      registrableDomain = getRegistrableDomain(hostname);
    } catch {
      // Invalid URL, skip tools
    }

    if (registrableDomain) {
      const [dnsResult, rdapResult, sbResult, hgResult] = await Promise.allSettled([
        executeTool('dns_geoip', { domain: hostname }, env),
        executeTool('rdap_lookup', { domain: registrableDomain }, env),
        executeTool('safe_browsing', { url: normalizedUrl }, env),
        executeTool('check_homograph', { hostname }, env),
      ]);

      intel = {
        dns_geoip: dnsResult.status === 'fulfilled' ? dnsResult.value : null,
        rdap_lookup: rdapResult.status === 'fulfilled' ? rdapResult.value : null,
        safe_browsing: sbResult.status === 'fulfilled' ? sbResult.value : null,
        check_homograph: hgResult.status === 'fulfilled' ? hgResult.value : null,
      };
    }
  }

  // Build prompt with real data
  const systemPrompt = buildSystemPrompt(userLanguage, userCountryCode);
  let userContent = '';

  if (url) {
    userContent = `Analyze this URL for potential fraud or phishing: ${url}`;
    if (intel) {
      const dns = intel.dns_geoip;
      const rdap = intel.rdap_lookup;
      const sb = intel.safe_browsing;
      const hg = intel.check_homograph;

      userContent += `\n\nREAL TECHNICAL INTELLIGENCE (from actual API lookups — use this data, do NOT fabricate):`;
      userContent += dns?.ip ? `\n- Resolved IP: ${dns.ip}` : '\n- DNS Resolution: FAILED';
      userContent += dns?.country ? `\n- Server Location: ${dns.country}${dns.city ? `, ${dns.city}` : ''} (VERIFIED)` : '';
      userContent += dns?.isp ? `\n- ISP/Hosting: ${dns.isp}` : '';
      userContent += rdap?.domainAge ? `\n- Domain Age: ${rdap.domainAge} (registered: ${rdap.registrationDate}) (VERIFIED)` : '\n- Domain Age: Lookup failed';
      userContent += rdap?.registrar ? `\n- Registrar: ${rdap.registrar}` : '';
      userContent += hg?.isHomograph ? '\n- HOMOGRAPH ATTACK DETECTED' : '\n- Homograph Check: Clean';
      userContent += sb?.threats?.length > 0 ? `\n- Safe Browsing: FLAGGED — ${sb.threats.join(', ')}` : '\n- Safe Browsing: No known threats';
      userContent += rdap?.registrantOrg || rdap?.registrantName ? `\n- Registrant: ${rdap.registrantOrg || rdap.registrantName}${rdap.registrantCountry ? ` in ${rdap.registrantCountry}` : ''}` : '';
      userContent += rdap?.registrantEmail ? `\n- Registrant Email: ${rdap.registrantEmail}` : '';
      userContent += rdap?.privacyProtected ? '\n- WHOIS Privacy: PROTECTED' : '';
    }
  } else if (text) {
    userContent = `Analyze this content for potential fraud or scam:\n\n${text}`;
  } else {
    userContent = 'Analyze this screenshot for potential fraud, phishing, or scam content.';
  }

  const parts = [{ text: `${systemPrompt}\n\n${userContent}` }];

  if (imagesBase64 && imagesBase64.length > 0) {
    for (const base64 of imagesBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
    }
  }

  const SchemaType = { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' };

  const legacyLocalizedSchema = {
    type: SchemaType.OBJECT,
    properties: {
      headline: { type: SchemaType.STRING },
      explanation: { type: SchemaType.STRING },
      action: { type: SchemaType.STRING },
      hook: { type: SchemaType.STRING },
      trap: { type: SchemaType.STRING },
      redFlags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    },
    required: ['headline', 'explanation', 'action', 'hook', 'trap', 'redFlags'],
  };

  const legacyLinkMetadataSchema = {
    type: SchemaType.OBJECT,
    properties: {
      analyzedUrl: { type: SchemaType.STRING },
      impersonating: { type: SchemaType.STRING },
      actualDomain: { type: SchemaType.STRING },
      domainAge: { type: SchemaType.STRING },
      serverLocation: { type: SchemaType.STRING },
      blacklistCount: { type: SchemaType.NUMBER },
      suspiciousTld: { type: SchemaType.STRING },
    },
    required: ['analyzedUrl', 'impersonating', 'actualDomain', 'domainAge', 'serverLocation', 'blacklistCount', 'suspiciousTld'],
  };

  const legacyResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      riskLevel: { type: SchemaType.STRING, description: 'SAFE, CAUTION, or DANGER' },
      score: { type: SchemaType.NUMBER, description: '0-100 risk score' },
      category: { type: SchemaType.STRING },
      detectedNativeLanguage: { type: SchemaType.STRING },
      userSystemLanguage: { type: SchemaType.STRING },
      native: legacyLocalizedSchema,
      translated: legacyLocalizedSchema,
      linkMetadata: legacyLinkMetadataSchema,
      scannedText: { type: SchemaType.STRING, description: 'Raw text extracted from the screenshot/image, or the submitted URL/text' },
      scamCountryCode: { type: SchemaType.STRING, description: 'ISO 3166-1 alpha-2 country code of where the scam originates/targets' },
    },
    required: ['riskLevel', 'score', 'category', 'detectedNativeLanguage', 'userSystemLanguage', 'native', 'translated', 'scannedText', 'scamCountryCode'],
  };

  const responseText = await runGeminiGenerate({
    apiKey,
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: legacyResponseSchema,
    },
  });

  if (!responseText) throw new Error('Empty response from Gemini');

  const result = JSON.parse(responseText);

  // Attach verified data from tool results
  if (intel) {
    const verified = buildVerifiedFromToolResults(intel);
    if (verified) {
      if (result.linkMetadata) {
        result.linkMetadata.verified = verified;
      } else {
        result.linkMetadata = {
          analyzedUrl: url || '',
          impersonating: 'Unknown',
          actualDomain: registrableDomain,
          domainAge: verified.domainAge || 'Unknown',
          serverLocation: verified.serverCountry || 'Unknown',
          blacklistCount: verified.safeBrowsingThreats?.length || 0,
          suspiciousTld: '',
          verified,
        };
      }
    }
  }

  // Normalise language fields to ISO codes (safety net if Gemini returns full names)
  result.detectedNativeLanguage = normalizeToIsoCode(result.detectedNativeLanguage);
  result.userSystemLanguage = normalizeToIsoCode(result.userSystemLanguage);

  return result;
}

// ---- Main Export ----

/**
 * Analyze content for fraud/phishing.
 *
 * @param {object} options
 * @param {string} [options.url] - URL to analyze
 * @param {string} [options.text] - Text content to analyze
 * @param {string[]} [options.imagesBase64] - Base64-encoded images
 * @param {string} options.userLanguage - User's device language
 * @param {object} env - Environment variables
 * @returns {Promise<object>} AnalysisResult
 */
export async function analyzeContent({ url, text, imagesBase64, userLanguage, userCountryCode, env }) {
  const useAgentic = env.USE_AGENTIC_API === 'true';
  const startTime = Date.now();
  const mode = useAgentic ? 'agentic' : 'legacy';

  try {
    let result;
    if (useAgentic) {
      result = await runAgentic({ url, text, imagesBase64, userLanguage, userCountryCode, env });
    } else {
      result = await runLegacy({ url, text, imagesBase64, userLanguage, userCountryCode, env });
    }
    const responseTimeMs = Date.now() - startTime;
    return { result, mode, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Fire-and-forget: log error to Supabase
    logError({
      error: message,
      rawResponse: error?.rawResponse,
      url,
      inputType: url ? 'url' : imagesBase64?.length ? 'screenshot' : 'text',
      apiMode: mode,
      responseTimeMs,
    }, env).catch(() => {});
    throw error;
  }
}
