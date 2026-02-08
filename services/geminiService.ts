
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, RiskLevel } from "../types";
import { runLinkIntelligence, RealLinkIntelligence } from "./linkIntelligence";

export const analyzeFraudContent = async (
  input: { text?: string; imagesBase64?: string[]; userLanguage: string }
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
    - action: Specific security advice.
    - hook: What initially attracts the victim.
    - trap: The actual malicious mechanism or technical threat.
    - redFlags: An array of specific signals (e.g., bad grammar, suspicious domain, urgency).

    Return JSON ONLY.
  `;

  const localizedSchema = {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      explanation: { type: Type.STRING },
      action: { type: Type.STRING },
      hook: { type: Type.STRING },
      trap: { type: Type.STRING },
      redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["headline", "explanation", "action", "hook", "trap", "redFlags"]
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      riskLevel: { type: Type.STRING, description: "SAFE, CAUTION, or DANGER" },
      score: { type: Type.NUMBER, description: "0-100 risk score" },
      category: { type: Type.STRING, description: "The type of fraud classified (e.g. Job Scam)" },
      detectedNativeLanguage: { type: Type.STRING },
      userSystemLanguage: { type: Type.STRING },
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
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
      },
    });

    const responseText = response.text;
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    ${intel.redirectCount > 0 ? `- Redirect detected: Final URL is ${intel.finalUrl}` : '- No redirects detected'}
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
    5. Analyze URL structure for redirect patterns or suspicious query parameters.

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
    - Generate in both Native (English technical) and Translated (${userLanguage}) versions
    - If device language matches native language, Translated version must be in English

    Return JSON ONLY.
  `;

  const localizedSchema = {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      explanation: { type: Type.STRING },
      action: { type: Type.STRING },
      hook: { type: Type.STRING },
      trap: { type: Type.STRING },
      redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["headline", "explanation", "action", "hook", "trap", "redFlags"]
  };

  const linkMetadataSchema = {
    type: Type.OBJECT,
    properties: {
      analyzedUrl: { type: Type.STRING },
      impersonating: { type: Type.STRING },
      actualDomain: { type: Type.STRING },
      domainAge: { type: Type.STRING },
      serverLocation: { type: Type.STRING },
      blacklistCount: { type: Type.NUMBER },
      suspiciousTld: { type: Type.STRING },
    },
    required: ["analyzedUrl", "impersonating", "actualDomain", "domainAge", "serverLocation", "blacklistCount", "suspiciousTld"]
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      riskLevel: { type: Type.STRING, description: "SAFE, CAUTION, or DANGER" },
      score: { type: Type.NUMBER, description: "0-100 risk score" },
      category: { type: Type.STRING, description: "The type of fraud" },
      detectedNativeLanguage: { type: Type.STRING },
      userSystemLanguage: { type: Type.STRING },
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
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
      },
    });

    const responseText = response.text;
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
        finalUrl: intel.finalUrl,
        redirectCount: intel.redirectCount,
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
    const visionResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          { text: visionPrompt },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
        ]
      },
      config: { responseMimeType: "application/json" }
    });

    const visionData = JSON.parse(visionResponse.text || "{}");
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
    action: "Do not interact. Report immediately.",
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
