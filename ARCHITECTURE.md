# RedFlag Technical Architecture

Last updated: 2026-02-08

## Overview

RedFlag is a scam/phishing detection app that analyzes URLs, screenshots, and text/images.
It combines real API-based intelligence checks with Gemini AI analysis to produce a risk score.

---

## Three Analysis Features

| Feature | Input | Intelligence Checks | Gemini Call | Result Page |
|---------|-------|---------------------|-------------|-------------|
| **URL Submission** | URL string | DNS, GeoIP, RDAP, Homograph, Safe Browsing, Whoxy (fallback) | `analyzeUrlForensic` | LinkResultPage |
| **Screenshot/QR Scan** | Image/QR code | Extracts URL via QR decode, then same as URL Submission | `checkPhishingFromScreenshot` | ScanResultPage |
| **Text/Image Paste** | Text or image | None (pure AI) | `analyzeFraudContent` | Generic result |

---

## Intelligence Pipeline (`services/linkIntelligence.ts`)

All checks run in parallel via `Promise.allSettled`:

```
Client Browser
  |
  +---> [1] DNS (dns.google)          -- resolves domain to IP
  +---> [2] RDAP (IANA bootstrap)     -- domain age, registrar, registrant data
  +---> [3] Homograph check (local)   -- punycode/cyrillic/zero-width detection
  +---> [4] Backend /api/link-intel-secrets
  |         +---> Safe Browsing API   -- threat matching (requires API key)
  |         +---> Whoxy WHOIS API     -- fallback for domain age/registrar
  |
  +---> [5] GeoIP (ipwho.is)          -- server country/city/ISP (after DNS)
```

### Check Details

| # | Check | Runs On | API | Cost | CORS | Notes |
|---|-------|---------|-----|------|------|-------|
| 1 | DNS Resolution | Client | `dns.google/resolve` | Free | Yes | Returns resolved IP |
| 2 | RDAP | Client | IANA bootstrap + registry/registrar RDAP | Free | Yes | Primary source for registrant data. Does referral chain: bootstrap → registry → registrar |
| 3 | Homograph | Client | None (pure JS) | Free | N/A | Detects punycode, cyrillic, zero-width chars, mixed scripts |
| 4a | Safe Browsing | Backend | `safebrowsing.googleapis.com/v4` | Free (quota) | No | Checks malware, social engineering, unwanted software |
| 4b | Whoxy WHOIS | Backend | `api.whoxy.com` | $2/1000 | Yes* | Fallback for domain age/registrar when RDAP fails |
| 5 | GeoIP | Client | `ipwho.is` | Free | Yes | Depends on DNS result. Returns country, city, ISP |

*Whoxy is CORS-friendly but runs on backend because it shares the endpoint with Safe Browsing.

### Data Priority: RDAP Primary, Whoxy Fallback

```
Registrant data:  RDAP → if empty → Whoxy
Registrar name:   RDAP → if empty → Whoxy
Domain age:       RDAP → if empty → Whoxy (create_date)
```

RDAP is preferred because:
- Free (no API key needed)
- Does full registrar referral (gets registrant data Whoxy misses for some TLDs like .help)
- Returns structured JSON (vCard format)

Whoxy limitation: Only queries registry WHOIS, doesn't follow registrar referral. Returns empty registrant for Namecheap .help domains.

### Geo-Mismatch Detection

Post-processing step that cross-references:
- Server country (GeoIP) vs registrant country (RDAP/Whoxy)
- Registrant email domain vs analyzed domain
- Privacy-protected + new domain = suspicious

Produces severity: none → low → medium → high

---

## Backend Endpoints

### `/api/gemini` → `server/geminiProxy.js`

Thin proxy to Google Gemini API. Adds API key server-side.

- **Method**: POST
- **Key**: `GEMINI_API_KEY`
- **External API**: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Features**: Origin validation, rate limiting
- **Model**: `gemini-2.5-pro-preview-05-06`

### `/api/link-intel-secrets` → `server/linkIntelSecrets.js`

Runs secret-key checks that can't be done from the browser.

- **Method**: POST
- **Body**: `{ url, domain }`
- **Keys**: `SAFE_BROWSING_API_KEY` (fallback: `GEMINI_API_KEY`), `WHOIS_API_KEY`
- **Returns**: `{ safeBrowsingThreats: string[], whois: WhoisResult | null }`

---

## Client Services

### `services/geminiService.ts`

Three analysis functions, all call `/api/gemini`:

| Function | Input | Uses Intelligence? | Notes |
|----------|-------|--------------------|-------|
| `analyzeUrlForensic(url)` | URL string | Yes — calls `runLinkIntelligence()` first | Feeds real data into Gemini prompt |
| `checkPhishingFromScreenshot(images, url?)` | Base64 images + optional URL | Yes if URL provided | Vision + forensic pipeline |
| `analyzeFraudContent(text, images?)` | Text/images | No | Pure AI analysis, no real data |

### `services/linkIntelligence.ts`

Exports:
- `runLinkIntelligence(url)` → `RealLinkIntelligence` — main orchestrator
- `getRegistrableDomain(hostname)` → string — extracts registrable domain
- `GeoMismatch`, `RealLinkIntelligence` interfaces

---

## Type System (`types.ts`)

```typescript
AnalysisResult
  ├── riskLevel: SAFE | CAUTION | DANGER
  ├── score: 0-100
  ├── category: string
  ├── native: LocalizedAnalysis      // In detected language
  ├── translated: LocalizedAnalysis  // In user's system language
  └── linkMetadata?: LinkMetadata
        ├── analyzedUrl, impersonating, actualDomain, domainAge, etc. (AI-generated)
        └── verified?: {              // Real API data
              domainAge, registrationDate, registrar,
              serverCountry, serverCity, isp, resolvedIp,
              homographAttack, safeBrowsingThreats,
              registrantName, registrantOrg, registrantStreet,
              registrantCity, registrantState, registrantPostalCode,
              registrantCountry, registrantEmail, registrantTelephone,
              privacyProtected,
              geoMismatch, geoMismatchSeverity, geoMismatchDetails,
              checksCompleted, checksFailed
            }
```

---

## UI Components

| Component | Purpose |
|-----------|---------|
| `LinkResultPage` | URL analysis results — Aperture score, URL autopsy, Digital Fingerprint (2x3 grid), geo-mismatch alert |
| `ScanResultPage` | Screenshot/QR results |
| `Aperture` | Animated score ring visualization |
| `ThreatStoryAndFeedback` | Hook/trap/infrastructure clues display |

### Digital Fingerprint Grid (2x3)

| Domain Age | Registrar |
|------------|-----------|
| Hosted In | Registrant |
| Contact Email | Contact Phone |

---

## Environment Variables

| Key | Service | Required |
|-----|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API | Yes |
| `SAFE_BROWSING_API_KEY` | Google Safe Browsing v4 | Yes (falls back to GEMINI_API_KEY) |
| `WHOIS_API_KEY` | Whoxy WHOIS API | Optional (Whoxy is fallback only) |
| `BROWSERLESS_TOKEN` | Browserless (unused currently) | No |

---

## API Call Summary Per Feature

### URL Submission (worst case: 6 network calls)
1. `dns.google/resolve` — DNS resolution
2. `data.iana.org/rdap/dns.json` — RDAP bootstrap (cached after first call)
3. `{registry}/domain/{domain}` — Registry RDAP
4. `{registrar-rdap}/domain/{domain}` — Registrar RDAP referral (if needed)
5. `/api/link-intel-secrets` → Safe Browsing + Whoxy
6. `ipwho.is/{ip}` — GeoIP (after DNS resolves)
7. Gemini API — AI analysis with real data

### Screenshot/QR Scan
1. QR decode (local) or Gemini vision call
2. Same as URL Submission if URL extracted

### Text/Image Paste
1. Gemini API only — no intelligence checks

---

## Migration Notes for Gemini Interactive API

When converting to agentic architecture:

### Tools to Expose
| Tool | Current Location | Move To |
|------|-----------------|---------|
| `dns_geoip` | Client (`resolveDNS` + `lookupGeoIP`) | Backend tool |
| `rdap_lookup` | Client (`rdapLookup`) | Backend tool |
| `safe_browsing` | Backend (`checkSafeBrowsing`) | Backend tool |
| `check_homograph` | Client (`checkHomograph`) | Backend tool |

### Key Changes
1. **Single endpoint** `/api/analyze` replaces both `/api/gemini` and `/api/link-intel-secrets`
2. **Agentic loop on backend**: Gemini calls tools → backend executes → sends results back → Gemini reasons
3. **Client becomes trivial**: One `analyzeContent()` call, no client-side intelligence
4. **Feature 3 gains real data**: Gemini can extract URLs from pasted text and call tools
5. **Selective checking**: Gemini skips unnecessary checks (e.g., google.com doesn't need WHOIS)

### What Gets Removed (Client-Side)
- `services/linkIntelligence.ts` — tools move to backend
- Three separate functions in `geminiService.ts` → one unified call
- Client-side routing between features → model decides

### What Gets Added (Backend)
- `api/analyze.js` — new agentic endpoint with multi-turn loop
- `server/tools/*.js` — individual tool functions
- Timeout/max-turns guard for the agentic loop

### WHOIS Strategy
- **RDAP** remains primary (free, structured, does full referral)
- **Whoxy** can be dropped or kept as cheap fallback for domain age
- No need for other WHOIS providers — RDAP covers what they offer
