# Product Requirements Document: RedFlag

**Version:** 1.1 (Updated from codebase audit)
**Status:** In Development (Hackathon MVP)
**Tech Stack:** React 19 + Vite, Tailwind CSS (CDN), Google Gemini AI, Framer Motion
**Last Updated:** 2026-02-07

---

## 1. Executive Summary

**Product Name:** RedFlag
**Tagline:** "Fraud has no language barrier. Neither do we."

**Problem:** Fraud (Phishing, QR scams, Pig-butchering) is rampant in Taiwan and Singapore. Victims often fail to recognize threats due to language barriers, urgency, or cultural nuances (e.g., specific local government impersonations).

**Solution:** A mobile-first AI Sentinel that uses Multimodal Analysis (Vision + Text) to detect scams. It features "Native-First Threat Resolution", automatically translating the threat analysis into the user's system language, protecting vulnerable groups like the elderly and migrant workers.

---

## 2. Key Features (MVP)

### 2.1. Native-First Threat Resolution (The "Killer Feature")

**Problem:** A user speaks Malay but receives a scam in English or Chinese. They cannot read the warning signs.

**Solution:**
- **Auto-Detect:** App detects the user's browser language via `navigator.language` (e.g., `ms-MY`).
- **Context:** Gemini detects the scam's language (e.g., `zh-TW`).
- **Output:** Gemini generates the explanation in both the content's native language AND the user's system language.
- **UI:** User can toggle between "Translated View" and "Original Source" when languages differ. Uses `Intl.DisplayNames` for readable language labels.

**Status:** Fully Implemented

### 2.2. Live QR Code Check

**Mechanism:** Uses `@yudiel/react-qr-scanner` with a custom camera overlay ("Tactical HUD").

**Security:** Decodes the QR string without opening the browser.

**Analysis:** Sends the raw URL to Gemini to check for:
- Typosquatting (e.g., `dbs-secure.xyz`).
- Suspicious TLDs (`.xyz`, `.top`, `.pw`, `.loan`).
- Brand impersonation.
- URL shortener abuse.
- Contextual mismatch (e.g., a government QR code leading to a `.com` site).

**Status:** Fully Implemented (`components/QrScanner.tsx`)

### 2.3. Analyze Screenshot (Multimodal)

**Input:** User uploads 1-10 screenshots (WhatsApp, Line, SMS, Email).

**AI Processing:** Google Gemini (via `@google/genai` SDK).

**Logic:**
1. Converts images to base64 on the client.
2. Gemini extracts text via internal OCR.
3. Analyzes visual hierarchy (e.g., "Is this mimicking a bank login?").
4. Detects urgency cues ("Act now or account locked").
5. Returns a structured analysis (The Hook, The Trap, Red Flags).

**Status:** Fully Implemented (`components/EvidenceModal.tsx`, `services/geminiService.ts`)

### 2.4. Verify Link / Suspicious URL Screenshot

**Input:** User uploads a screenshot containing a suspicious URL.

**Processing (Two-Pass):**
1. **Pass 1 - Vision Extraction:** Gemini Vision identifies URLs and brand impersonation attempts in the screenshot.
2. **Pass 2 - URL Forensics:** Deep analysis of extracted URL for typosquatting, TLD risk, brand matching, and redirect patterns.

**Security:** No SSRF risk — the app is entirely client-side. URLs are analyzed by AI string inspection only; they are never fetched.

**Status:** Fully Implemented (logic in `services/geminiService.ts`). Note: `components/UrlVerifier.tsx` is an empty stub — the URL verification flow currently uses `EvidenceModal` for input.

---

## 3. Technical Architecture

### 3.1. Frontend (The "Body")

| Aspect | Detail |
|--------|--------|
| **Framework** | React 19.2.4 + Vite 6.2.0 (SPA) |
| **Styling** | Tailwind CSS (CDN) + Framer Motion 12.33 |
| **Icons** | Lucide React 0.563 |
| **Fonts** | Inter (UI) + JetBrains Mono (technical readout) |
| **QR Scanning** | @yudiel/react-qr-scanner 2.1.0 |
| **Design System** | "Clinical Futurism" — White, Glassmorphism, Slate-900, Neon Red / Electric Blue |

**Key Components:**

| Component | File | Purpose |
|-----------|------|---------|
| App | `App.tsx` | Main state machine (IDLE → ANALYZING → RESULT), routing between features |
| Aperture | `components/Aperture.tsx` | Animated circular progress ring with threat level coloring |
| QrScanner | `components/QrScanner.tsx` | Fullscreen camera interface with tactical HUD overlay |
| EvidenceModal | `components/EvidenceModal.tsx` | Modal for uploading 1-10 screenshots with grid preview |
| UrlVerifier | `components/UrlVerifier.tsx` | (Empty stub — to be implemented or removed) |

### 3.2. Backend / AI Engine (The "Brain")

| Aspect | Detail |
|--------|--------|
| **Infrastructure** | Client-side only (no backend server) |
| **AI Engine** | Google Gemini via `@google/genai` SDK |
| **API Key** | Injected via Vite `define` plugin from `GEMINI_API_KEY` env var |

**Service Functions (`services/geminiService.ts`):**

| Function | Input | Output |
|----------|-------|--------|
| `analyzeFraudContent` | Text + base64 images (1-10) + user language | `AnalysisResult` |
| `verifyUrlString` | URL string + user language | `AnalysisResult` |
| `checkPhishingFromScreenshot` | Base64 screenshot + user language | `AnalysisResult` (two-pass) |

**Protocol:**
- Input: Base64 Image or Text String + `userLanguage` (from `navigator.language`).
- Output: Strict JSON Schema (enforced via Gemini's `responseMimeType: "application/json"` + `responseSchema`).

---

## 4. Data Model

### AnalysisResult

```typescript
interface AnalysisResult {
  riskLevel: "SAFE" | "CAUTION" | "DANGER"
  score: number          // 0-100 risk percentage
  category: string       // Fraud type (Job Scam, Phishing, Investment Scam, etc.)
  detectedNativeLanguage: string
  userSystemLanguage: string
  native: LocalizedAnalysis    // Analysis in the scam's language
  translated: LocalizedAnalysis // Analysis in the user's language
}

interface LocalizedAnalysis {
  headline: string       // Short verdict
  explanation: string    // Detailed reasoning
  action: string         // What the user should do
  hook: string           // What attracts victims
  trap: string           // Technical mechanism of the scam
  redFlags: string[]     // Specific warning signals
}
```

**Fraud Categories Detected:**
- Job Scams
- Investment Scams
- Phishing
- Tech Support Scams
- Romance Scams
- Impersonation
- Undetermined Fraud (fallback)

---

## 5. User Experience (UX) Flow

### 5.1. The "Home" State (IDLE)

- **Header:** "Is this a Scam?"
- **Subheader:** "Use AI to verify potential scams in images, QR codes, and links instantly."
- **Action Grid (3 Cards):**
  1. **Scan QR Code:** "Reveal the hidden destination..."
  2. **Analyze Screenshot:** "Upload chats (WhatsApp/Line)..."
  3. **Verify Link:** "Paste a suspicious URL..."

### 5.2. The "Analysis" State (ANALYZING)

- **Animation:** Central Aperture ring spins with animated segments.
- **Status Text:** Cycles through analysis phases (extracting, checking, translating).

### 5.3. The "Result" State (RESULT)

- **Visual:** Large Aperture ring colored by risk (Green = Safe, Amber = Caution, Red = Danger).
- **Score:** Numeric risk percentage (0-100).
- **Verdict:** Category + headline (e.g., "High Risk: Impersonation Detected").
- **Detail Cards:** Hook, Trap, Red Flags, Explanation, Recommended Action.
- **Language Toggle:** Button to switch between native language and translated analysis (shown only when languages differ).
- **Back Button:** Returns to IDLE state for new analysis.

---

## 6. Security & Safety Guidelines

| Concern | Mitigation |
|---------|------------|
| **SSRF** | Not applicable — no server. URLs are analyzed by AI string inspection only. |
| **API Key Exposure** | Key injected at build time via Vite `define`. Not bundled in client code in production builds when configured correctly. |
| **Privacy** | Images are converted to base64 and sent to Google Gemini API. Not stored permanently. |
| **Hallucination Control** | Prompts explicitly instruct Gemini: "If safe, say safe." Structured JSON schema constrains output. |
| **QR Safety** | QR codes are decoded to strings only — never opened in a browser. |

---

## 7. Development Status

| Phase | Task | Status |
|-------|------|--------|
| Phase 1 | Project Setup: React + Vite, Tailwind CDN, Gemini API Key | Done |
| Phase 2 | UI Construction: Home Page, Action Cards, Glassmorphism, Aperture | Done |
| Phase 3 | The Brain: `geminiService.ts` with Gemini Prompt Engineering (JSON mode) | Done |
| Phase 4 | Feature: Screenshots — EvidenceModal with multi-image upload | Done |
| Phase 5 | Feature: QR Scan — QrScanner with tactical HUD overlay | Done |
| Phase 6 | Feature: Language Awareness — `navigator.language` detection + toggle | Done |
| Phase 7 | Polish: Framer Motion animations, loading states, risk coloring | Done |
| Phase 8 | Feature: UrlVerifier component (dedicated text URL input) | Pending |

---

## 8. Gemini Prompts (Reference)

**System Instruction Pattern:**
> "You are RedFlag, an automated fraud detection system. Your goal is to protect the user by analyzing multimodal inputs. You must adapt your output language to the user's system language settings (userLanguage), even if the evidence is in a different language. Always return valid JSON."

**Key Prompt Features:**
- Enforced JSON output via `responseMimeType: "application/json"` and `responseSchema`.
- Two-language output (native + translated) in every response.
- Fraud category classification with confidence scoring.
- "The Story" format: Hook → Trap → Red Flags.

---

## 9. Success Metrics (For Judges)

| Metric | Target |
|--------|--------|
| **Speed** | Analysis completes in under 3 seconds |
| **Accuracy** | Correctly identifies fake login screenshots vs real ones |
| **Adaptability** | Live translation of scam warnings across languages |
| **Safety** | Detects malicious QR codes without executing them |

---

## 10. Quick Start

```bash
# Install dependencies
npm install

# Run development server (provide your Gemini API key)
GEMINI_API_KEY=your_key_here npm run dev

# Opens at http://localhost:3000
```

**Prerequisites:** Node.js, a valid Google Gemini API key.