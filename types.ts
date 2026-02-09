
export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT'
}

export enum RiskLevel {
  SAFE = 'SAFE',
  CAUTION = 'CAUTION',
  DANGER = 'DANGER'
}

export interface LocalizedAnalysis {
  headline: string;
  explanation: string;
  action: string;
  hook: string;
  trap: string;
  redFlags: string[];
}

export interface LinkMetadata {
  analyzedUrl: string;
  impersonating: string;
  actualDomain: string;
  domainAge: string;
  serverLocation: string;
  blacklistCount: number;
  suspiciousTld: string;

  // Real verified data from actual API lookups
  verified?: {
    domainAge: string | null;          // From Whoxy WHOIS
    registrationDate: string | null;   // ISO date from Whoxy
    registrar: string | null;          // From Whoxy
    serverCountry: string | null;      // From GeoIP (ipwho.is)
    serverCity: string | null;         // From GeoIP
    isp: string | null;               // From GeoIP
    resolvedIp: string | null;         // From DNS (dns.google)
    homographAttack: boolean;          // Punycode/Cyrillic detection
    safeBrowsingThreats: string[];     // From Google Safe Browsing
    // Registrant (from Whoxy WHOIS)
    registrantName: string | null;
    registrantOrg: string | null;
    registrantStreet: string | null;
    registrantCity: string | null;
    registrantState: string | null;
    registrantPostalCode: string | null;
    registrantCountry: string | null;
    registrantEmail: string | null;
    registrantTelephone: string | null;
    privacyProtected: boolean;
    // Geo-Mismatch Detection
    geoMismatch: boolean;
    geoMismatchSeverity: 'high' | 'medium' | 'low' | 'none';
    geoMismatchDetails: string[];
    checksCompleted: string[];         // Which checks succeeded
    checksFailed: string[];            // Which checks failed
  };
}

export interface AnalysisResult {
  riskLevel: RiskLevel;
  score: number;
  category: string;
  detectedNativeLanguage: string;
  userSystemLanguage: string;
  native: LocalizedAnalysis;
  translated: LocalizedAnalysis;
  scannedText?: string;
  linkMetadata?: LinkMetadata;
  analysisId?: string | null;
  apiMode?: string;
  responseTimeMs?: number;
}
