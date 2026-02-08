<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# RedFlag

A client-side fraud detection app that combines real-time technical intelligence with AI analysis to identify phishing, scams, and malicious links.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env` file with the following keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   WHOIS_API_KEY=your_whoxy_api_key
   BROWSERLESS_TOKEN=your_browserless_token
   ```
3. Run the app:
   `npm run dev`

## Architecture

### Gemini LLM Calls

All LLM calls use **Google Gemini** (`@google/genai`) with structured JSON output. There are **3 separate Gemini functions** in `services/geminiService.ts`:

| # | Function | Model | Trigger | Input | Output |
|---|----------|-------|---------|-------|--------|
| 1 | `analyzeFraudContent` | `gemini-3-pro-preview` | User submits screenshot/text via **Scan** feature | Text and/or images (base64) | Risk score, fraud category, bilingual analysis |
| 2 | `analyzeUrlForensic` | `gemini-3-pro-preview` | User submits a URL via **Check Link** feature | URL + real technical intelligence data | Risk score, fraud category, link metadata, bilingual analysis |
| 3 | `checkPhishingFromScreenshot` | `gemini-3-pro-preview` | User scans a screenshot that contains a URL | Screenshot image (base64) | Extracts URL from image, then calls `analyzeUrlForensic` |

#### Call 1: `analyzeFraudContent` (Scan feature)
- **No technical intelligence** — purely AI-based analysis of text/images
- Detects fraud type (Job Scam, Investment Scam, Phishing, etc.)
- Generates bilingual output: native language + user's device language

#### Call 2: `analyzeUrlForensic` (Check Link feature)
- **Runs real technical checks first** via `linkIntelligence.ts` (DNS, GeoIP, RDAP, WHOIS, Safe Browsing, Homograph, Redirects)
- Feeds all verified intelligence data into the Gemini prompt including:
  - Server location, ISP, resolved IP
  - Domain age, registration date, registrar
  - WHOIS registrant details (org, name, address, email, phone)
  - Privacy protection status
  - Geo-mismatch alerts
  - Safe Browsing threats
  - Homograph/Punycode detection
  - Redirect chain
- Gemini analyzes the URL structure + real intelligence data together
- Real verified data is attached to the result separately from AI output (under `linkMetadata.verified`)

#### Call 3: `checkPhishingFromScreenshot` (Scan → URL detected)
- **Two-pass approach:**
  1. **Pass 1 (Vision):** Asks Gemini to extract any visible URL from the screenshot
  2. **Pass 2:** If a URL is found, calls `analyzeUrlForensic` with the extracted URL + screenshot context
  3. If no URL found, falls back to `analyzeFraudContent` for generic image analysis

### Technical Intelligence (`services/linkIntelligence.ts`)

Runs **7 parallel checks** via `Promise.allSettled` (no AI involved):

| Check | API | Purpose |
|-------|-----|---------|
| DNS Resolution | Google DNS-over-HTTPS | Resolve domain to IP |
| GeoIP Lookup | ip-api.com | Server country, city, ISP |
| RDAP Lookup | IANA RDAP + registrar referral | Domain age, registrar, registrant data |
| Homograph Detection | Pure JS | Punycode/Cyrillic character detection |
| Redirect Chain | fetch with manual redirect | Final URL, redirect count |
| Safe Browsing | Google Safe Browsing API | Known threats |
| WHOIS (fallback) | Whoxy API | Registrant data when RDAP has none |

Registrant data priority: **RDAP (free, follows registrar referral)** → **Whoxy (paid fallback)**
