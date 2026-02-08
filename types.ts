
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
    domainAge: string | null;          // From RDAP
    registrationDate: string | null;   // ISO date from RDAP
    registrar: string | null;          // From RDAP
    serverCountry: string | null;      // From GeoIP (ip-api.com)
    serverCity: string | null;         // From GeoIP
    isp: string | null;               // From GeoIP
    resolvedIp: string | null;         // From DNS (dns.google)
    homographAttack: boolean;          // Punycode/Cyrillic detection
    safeBrowsingThreats: string[];     // From Google Safe Browsing
    finalUrl: string | null;           // After following redirects
    redirectCount: number;
    // Registrant (RDAP primary, Whoxy fallback)
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
  linkMetadata?: LinkMetadata;
}
