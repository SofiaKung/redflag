
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
  sslCertificate: string;
  blacklistCount: number;
  suspiciousTld: string;
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
