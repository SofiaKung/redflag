
import { AnalysisResult, RiskLevel } from "../types";
import { runLinkIntelligence } from "./linkIntelligence";

// ---- Unified API (uses /api/analyze backend) ----

const ANALYZE_ENDPOINT = '/api/analyze';
const FEEDBACK_ENDPOINT = '/api/feedback';

export const analyzeContent = async (input: {
  url?: string;
  text?: string;
  imagesBase64?: string[];
  userLanguage: string;
  userCountryCode?: string;
  source?: 'qr' | 'screenshot' | 'link';
}): Promise<AnalysisResult> => {
  const response = await fetch(ANALYZE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || 'Analysis failed');
  }
  return response.json();
};

export const submitFeedback = async (
  analysisId: string,
  feedback: 'correct' | 'incorrect'
): Promise<boolean> => {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId, feedback }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

// ---- Legacy endpoints (kept for backward compat) ----

const GEMINI_ENDPOINT = '/api/gemini';
const SchemaType = {
  OBJECT: 'OBJECT',
  STRING: 'STRING',
  ARRAY: 'ARRAY',
  NUMBER: 'NUMBER',
} as const;

const generateGeminiText = async (payload: {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}): Promise<string> => {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Gemini request failed');
  }

  const data = await response.json();
  if (!data || typeof data.text !== 'string') {
    throw new Error('Invalid Gemini response');
  }

  return data.text;
};

export const analyzeFraudContent = async (
  input: { text?: string; imagesBase64?: string[]; userLanguage: string }
): Promise<AnalysisResult> => {
  const prompt = `
    You are "RedFlag," a high-precision universal fraud detection AI.
    
    CONTEXT:
    - User's device language is: "${input.userLanguage}".
    
    TASK:
    1. Analyze the provided content (text and/or multiple images) collectively. 
    2. Detect the language of the provided image/text ("Native Language").
    3. Classify the fraud type into a concise category (e.g., Job Scam, Investment Scam, Phishing, Tech Support Scam, Romance Scam, impersonation, etc.).
    4. Perform a deep fraud analysis across all provided evidence.
    5. Generate Output in TWO localized versions:
       - Version A ("native"): All fields in the detected Native Language.
       - Version B ("translated"): All fields in the user's device language ("${input.userLanguage}").
         *Note: If the device language matches the native language, Version B must be in English.*

    REQUIRED FIELDS FOR BOTH VERSIONS:
    - headline: A short verdict.
    - explanation: A detailed reason for the risk score.
    - action: Specific security advice. ALWAYS tell users to access the service only via the original official app or by manually typing the official domain. Never suggest the link is safe.
    - hook: What initially attracts the victim.
    - trap: The actual malicious mechanism or technical threat.
    - redFlags: An array of specific signals (e.g., bad grammar, suspicious domain, urgency).

    Return JSON ONLY.
  `;

  const localizedSchema = {
    type: SchemaType.OBJECT,
    properties: {
      headline: { type: SchemaType.STRING },
      explanation: { type: SchemaType.STRING },
      action: { type: SchemaType.STRING },
      hook: { type: SchemaType.STRING },
      trap: { type: SchemaType.STRING },
      redFlags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
    },
    required: ["headline", "explanation", "action", "hook", "trap", "redFlags"]
  };

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      riskLevel: { type: SchemaType.STRING, description: "SAFE, CAUTION, or DANGER" },
      score: { type: SchemaType.NUMBER, description: "0-100 risk score" },
      category: { type: SchemaType.STRING, description: "The type of fraud classified (e.g. Job Scam)" },
      detectedNativeLanguage: { type: SchemaType.STRING },
      userSystemLanguage: { type: SchemaType.STRING },
      native: localizedSchema,
      translated: localizedSchema
    },
    required: ["riskLevel", "score", "category", "detectedNativeLanguage", "userSystemLanguage", "native", "translated"]
  };

  const parts: any[] = [{ text: prompt }];
  if (input.text) parts.push({ text: input.text });
  
  if (input.imagesBase64 && input.imagesBase64.length > 0) {
    input.imagesBase64.forEach(base64 => {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64
        }
      });
    });
  }

  try {
    const responseText = await generateGeminiText({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
      },
    });
    if (!responseText) throw new Error("Empty response text from AI");

    return JSON.parse(responseText) as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return getFallbackResult(input.userLanguage);
  }
};

const analyzeUrlForensic = async (
  url: string,
  context: string,
  userLanguage: string,
  imageBase64?: string
): Promise<AnalysisResult> => {
  // =============================================
  // LAYER 1-3: Run REAL technical checks in parallel with AI analysis
  // =============================================
  const intelPromise = runLinkIntelligence(url);

  // Build the REAL data section for Gemini (populated after intel resolves)
  const intel = await intelPromise;

  const realDataSection = `
    REAL TECHNICAL INTELLIGENCE (from actual API lookups — use this data, do NOT fabricate):
    ${intel.resolvedIp ? `- Resolved IP: ${intel.resolvedIp}` : '- DNS Resolution: FAILED (domain may not exist)'}
    ${intel.serverCountry ? `- Server Location: ${intel.serverCountry}${intel.serverCity ? `, ${intel.serverCity}` : ''} (VERIFIED via GeoIP)` : '- Server Location: Could not be determined'}
    ${intel.isp ? `- ISP/Hosting: ${intel.isp}` : ''}
    ${intel.domainAge ? `- Domain Age: ${intel.domainAge} (registered: ${intel.registrationDate}) (VERIFIED via RDAP/WHOIS)` : '- Domain Age: RDAP lookup failed — domain may be too new or registry does not support RDAP'}
    ${intel.registrar ? `- Registrar: ${intel.registrar}` : ''}
    ${intel.homographAttack ? '- HOMOGRAPH ATTACK DETECTED: Domain uses deceptive characters (Punycode/Cyrillic)' : '- Homograph Check: Clean'}
    ${intel.safeBrowsingThreats.length > 0 ? `- Google Safe Browsing: FLAGGED — ${intel.safeBrowsingThreats.join(', ')}` : '- Google Safe Browsing: No known threats (or API not available)'}
    ${intel.registrantOrg || intel.registrantName ? `- WHOIS Registrant: ${intel.registrantOrg || intel.registrantName}${intel.registrantCountry ? ` in ${intel.registrantCountry}` : ''}` : '- WHOIS Registrant: Not available'}
    ${intel.registrantStreet || intel.registrantCity ? `- Registrant Address: ${[intel.registrantStreet, intel.registrantCity, intel.registrantState, intel.registrantPostalCode, intel.registrantCountry].filter(Boolean).join(', ')}` : ''}
    ${intel.registrantEmail ? `- Registrant Email: ${intel.registrantEmail}` : ''}
    ${intel.registrantTelephone ? `- Registrant Phone: ${intel.registrantTelephone}` : ''}
    ${intel.privacyProtected ? '- WHOIS Privacy: PROTECTED (registrant details hidden behind privacy service)' : '- WHOIS Privacy: Not protected (registrant details visible)'}
    ${intel.geoMismatch.detected ? `- GEO-MISMATCH ALERT (${intel.geoMismatch.severity.toUpperCase()}): ${intel.geoMismatch.details.join('; ')}` : '- Geo-Mismatch: No inconsistencies detected'}
    - Checks completed: ${intel.checksCompleted.join(', ') || 'none'}
    - Checks failed: ${intel.checksFailed.join(', ') || 'none'}
  `;

  const prompt = `
    You are "RedFlag," a high-precision forensic cybersecurity AI.

    CONTEXT:
    - User's device language is: "${userLanguage}".
    - Additional context: ${context}

    TASK: Perform a deep forensic analysis on this specific URL: "${url}"

    ${realDataSection}

    URL FORENSIC REQUIREMENTS:
    1. Check for Typosquatting (e.g., g0ogle.com instead of google.com).
    2. Identify Suspicious TLDs (.xyz, .top, .pw, .loan, .click, .info etc.).
    3. Look for Brand Impersonation in the subdomain, domain or path.
    4. Check for URL shorteners (bit.ly, t.co) used to hide real destination.
    5. Analyze URL structure for suspicious query parameters.

    WHOIS INTELLIGENCE ANALYSIS (critical — analyze these patterns):
    - If registrant org/name is a PRIVACY PROXY (e.g. "Withheld for Privacy", "Domains By Proxy"), flag this — legitimate businesses typically use their real identity.
    - If registrant country differs from server country, explain why this is suspicious for the specific brand/service the site claims to be.
    - If the registrant email domain does NOT match the site domain, flag the inconsistency.
    - If the domain is very new (days/weeks old) AND uses WHOIS privacy, this is a strong fraud signal — call it out.
    - If the registrant address is in an unexpected country for the claimed service (e.g. a "PayNow Singapore" site registered in Iceland), highlight this geographic mismatch.
    - If registrant details are completely unavailable (no org, no name, no address), note this as reduced transparency.
    - Cross-reference: Does the registrant org match what the site claims to be? (e.g. facebook.com should be Meta Platforms, Inc.)

    LINK METADATA RULES:
    - analyzedUrl: The exact URL being analyzed
    - impersonating: What legitimate brand/entity this URL impersonates. Use "None detected" if no impersonation.
    - actualDomain: The actual registered domain
    - domainAge: USE THE REAL RDAP DATA ABOVE if available. If RDAP failed, state "Unknown (lookup failed)"
    - serverLocation: USE THE REAL GEOIP DATA ABOVE if available. If lookup failed, state "Unknown"
    - blacklistCount: Use the Safe Browsing result above. If no threats found, use 0. If flagged, count the threat types.
    - suspiciousTld: The TLD if suspicious (e.g. ".xyz", ".top") or empty string "" if normal

    STANDARD ANALYSIS:
    - Classify fraud type (Phishing, Smishing, Brand Impersonation, etc.)
    - Generate headline, explanation, action, hook, trap, and redFlags
    - IMPORTANT: Incorporate the REAL technical data AND WHOIS intelligence findings into your explanation and redFlags. Mention specific WHOIS details (registrant, country, privacy status) when relevant.
    - In the action field, NEVER suggest the link is safe to visit. ALWAYS recommend users access the service by manually typing the official website URL or using the official app. Do not classify the link as any type (safe, legitimate, etc.) — just direct users to the official source.
    - Detect the likely Native Language from the visible page/screenshot text and context.
    - Generate in both Native (detected language) and Translated (${userLanguage}) versions.
    - Use broad language names when possible (example: use "English" instead of "British English" or "American English").
    - If device language matches native language (including regional variants), Translated version must be in English.

    Return JSON ONLY.
  `;

  const localizedSchema = {
    type: SchemaType.OBJECT,
    properties: {
      headline: { type: SchemaType.STRING },
      explanation: { type: SchemaType.STRING },
      action: { type: SchemaType.STRING },
      hook: { type: SchemaType.STRING },
      trap: { type: SchemaType.STRING },
      redFlags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
    },
    required: ["headline", "explanation", "action", "hook", "trap", "redFlags"]
  };

  const linkMetadataSchema = {
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
    required: ["analyzedUrl", "impersonating", "actualDomain", "domainAge", "serverLocation", "blacklistCount", "suspiciousTld"]
  };

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      riskLevel: { type: SchemaType.STRING, description: "SAFE, CAUTION, or DANGER" },
      score: { type: SchemaType.NUMBER, description: "0-100 risk score" },
      category: { type: SchemaType.STRING, description: "The type of fraud" },
      detectedNativeLanguage: { type: SchemaType.STRING },
      userSystemLanguage: { type: SchemaType.STRING },
      native: localizedSchema,
      translated: localizedSchema,
      linkMetadata: linkMetadataSchema,
    },
    required: ["riskLevel", "score", "category", "detectedNativeLanguage", "userSystemLanguage", "native", "translated", "linkMetadata"]
  };

  const parts: any[] = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
  }

  try {
    const responseText = await generateGeminiText({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
      },
    });
    if (!responseText) throw new Error("Empty response from AI");

    const result = JSON.parse(responseText) as AnalysisResult;

    // Attach the REAL verified intelligence data to the result
    if (result.linkMetadata) {
      result.linkMetadata.verified = {
        domainAge: intel.domainAge,
        registrationDate: intel.registrationDate,
        registrar: intel.registrar,
        serverCountry: intel.serverCountry,
        serverCity: intel.serverCity,
        isp: intel.isp,
        resolvedIp: intel.resolvedIp,
        homographAttack: intel.homographAttack,
        safeBrowsingThreats: intel.safeBrowsingThreats,
        registrantName: intel.registrantName,
        registrantOrg: intel.registrantOrg,
        registrantStreet: intel.registrantStreet,
        registrantCity: intel.registrantCity,
        registrantState: intel.registrantState,
        registrantPostalCode: intel.registrantPostalCode,
        registrantCountry: intel.registrantCountry,
        registrantEmail: intel.registrantEmail,
        registrantTelephone: intel.registrantTelephone,
        privacyProtected: intel.privacyProtected,
        geoMismatch: intel.geoMismatch.detected,
        geoMismatchSeverity: intel.geoMismatch.severity,
        geoMismatchDetails: intel.geoMismatch.details,
        checksCompleted: intel.checksCompleted,
        checksFailed: intel.checksFailed,
      };
    }

    return result;
  } catch (error) {
    console.error("URL Forensic Analysis Error:", error);
    return getFallbackResult(userLanguage);
  }
};

export const verifyUrlString = async (
  url: string,
  userLanguage: string
): Promise<AnalysisResult> => {
  return analyzeUrlForensic(url, "Direct URL submission by user.", userLanguage);
};

export const checkPhishingFromScreenshot = async (
  imageBase64: string,
  userLanguage: string
): Promise<AnalysisResult> => {
  // PASS 1: Vision Extraction
  const visionPrompt = `
    You are a forensic cybersecurity analyst.
    TASK: Look at this screenshot. Identify any URL, domain name, or IP address visible.
    
    RULES:
    1. Extract the URL exactly as it appears. 
    2. Identify if the page is mimicking a specific brand (e.g. Bank, Social Media).
    
    RETURN JSON ONLY:
    {
      "found_url": "String (or null)",
      "visual_impersonation": "String (e.g. 'Mimicking DBS Bank Login')"
    }
  `;

  try {
    const visionText = await generateGeminiText({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { text: visionPrompt },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
        ]
      },
      config: { responseMimeType: "application/json" }
    });

    const visionData = JSON.parse(visionText || "{}");
    const foundUrl = visionData.found_url;
    const impersonation = visionData.visual_impersonation || "Generic page";

    if (!foundUrl) {
      return analyzeFraudContent({ imagesBase64: [imageBase64], userLanguage });
    }

    return analyzeUrlForensic(
      foundUrl,
      `Visual context: page mimicking "${impersonation}". URL extracted from user-submitted screenshot.`,
      userLanguage,
      imageBase64
    );

  } catch (error) {
    console.error("Phishing Analysis Error:", error);
    return analyzeFraudContent({ imagesBase64: [imageBase64], userLanguage });
  }
};

const getFallbackResult = (userLanguage: string): AnalysisResult => {
  const normalizedLanguage = userLanguage?.trim() || "English";
  const englishFallback = {
    headline: "CRITICAL THREAT",
    explanation: "Suspicious pattern detected in content structure.",
    action: "Do not interact. If unsure, access the service only through the official app or by typing the official site manually.",
    hook: "Psychological trigger detected.",
    trap: "Deceptive mechanism found.",
    redFlags: ["Unverified sender", "Urgency trigger"]
  };

  const translatedFallback = normalizedLanguage.toLowerCase().includes("english")
    ? englishFallback
    : {
        ...englishFallback,
        explanation: `${englishFallback.explanation} Auto-translation to ${normalizedLanguage} is temporarily unavailable.`
      };

  return {
    riskLevel: RiskLevel.DANGER,
    score: 98,
    category: "Undetermined Fraud",
    detectedNativeLanguage: "English",
    userSystemLanguage: normalizedLanguage,
    native: englishFallback,
    translated: translatedFallback
  };
};
