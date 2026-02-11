
# RedFlag

A fraud detection app that combines real-time technical intelligence with AI analysis to identify phishing, scams, and malicious links.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env` file with the following keys:
   ```
   GEMINI_API_KEY=your_gemini_api_key
   USE_AGENTIC_API=true
   # Optional override if you use a separate key for Safe Browsing
   SAFE_BROWSING_API_KEY=your_safe_browsing_api_key
   WHOIS_API_KEY=your_whoxy_api_key
   BROWSERLESS_TOKEN=your_browserless_token
   # Supabase (for analysis logging and feedback)
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   # Required in production: comma-separated allowlist
   ALLOWED_ORIGINS=https://yourapp.com
   # Optional per-route rate limits (per IP per minute)
   RATE_LIMIT_ANALYZE_PER_MIN=10
   RATE_LIMIT_GEMINI_PER_MIN=10
   RATE_LIMIT_LINK_INTEL_PER_MIN=30
   RATE_LIMIT_SCREENSHOT_PER_MIN=20
   ```
3. Run the app:
   `npm run dev`

## Architecture
https://redflag-bay.vercel.app/#/architecture
### Overview

```
┌─────────────┐     POST /api/analyze     ┌──────────────────────┐
│   Frontend   │ ──────────────────────── │  analyzeHandler.js   │
│  (React SPA) │                          │  ┌────────────────┐  │
│              │                          │  │ buildSystemPrompt  │
│ analyzeContent()                        │  │ + buildInputParts  │
│ → single fetch                          │  └────────┬───────┘  │
└─────────────┘                          │           │          │
                                          │     ┌─────▼─────┐   │
                                          │     │ runAgentic │   │
                                          │     └─────┬─────┘   │
                                          │           │          │
                                          │  ┌────────▼────────┐ │
                                          │  │  agentLoop.js   │ │
                                          │  │                 │ │
                                          │  │  Gemini ←→ Tools│ │
                                          │  │  (multi-turn)   │ │
                                          │  └────────┬────────┘ │
                                          │           │          │
                                          │  ┌────────▼────────┐ │
                                          │  │ Attach verified  │ │
                                          │  │ data from tools  │ │
                                          │  └────────┬────────┘ │
                                          │           │          │
                                          │  ┌────────▼────────┐ │
                                          │  │ Log to Supabase │ │
                                          │  │ (fire-and-forget)│ │
                                          │  └─────────────────┘ │
                                          └──────────────────────┘
```

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/analyze` | Primary endpoint — unified analysis for URLs, text, and screenshots |
| `POST /api/feedback` | User feedback on analysis accuracy (correct/incorrect) |
| `POST /api/gemini` | Legacy direct Gemini proxy (kept for backward compat) |
| `POST /api/link-intel-secrets` | Legacy secret-dependent link checks |
| `POST /api/screenshot` | Proxies screenshot requests to Browserless |

### Secret Handling

- All API keys (`GEMINI_API_KEY`, `WHOIS_API_KEY`, `BROWSERLESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) are read on the server path only.
- Frontend calls same-origin API routes — no keys are injected into the browser bundle.

### API Protection

- Per-IP in-memory rate limiting on all server routes.
- Origin validation enforced (`ALLOWED_ORIGINS` required in production; dev falls back to same-host derived origin).
- URL payloads validated to block SSRF targets (localhost, loopback/private IPs, private DNS resolutions).

### Gemini Interactions API (Agentic Loop)

All analysis goes through a **single unified endpoint** (`POST /api/analyze`) backed by the **Gemini Interactions API** agentic loop. The frontend sends one request regardless of input type (URL, text, or screenshot) and the server handles everything.

**Key files:**

| File | Role |
|------|------|
| `services/geminiService.ts` | Frontend — single `analyzeContent()` → `POST /api/analyze` |
| `server/analyzeHandler.js` | Server — builds prompt, dispatches to agentic or legacy path |
| `server/agentLoop.js` | Interactions API multi-turn loop (Gemini drives tool calls) |
| `server/tools/index.js` | Tool definitions + executor dispatch |
| `server/supabase.js` | Fire-and-forget logging of analyses and feedback |

**How the agentic loop works:**

1. Server builds system prompt and input parts from the user's request (URL, text, and/or base64 images)
2. Sends to Gemini Interactions API (`POST /v1beta/interactions`) with tool definitions
3. Gemini responds with `function_call` outputs (e.g., "call `dns_geoip` for this domain")
4. Server executes all requested tools in parallel
5. Server sends `function_result` back to Gemini using `previous_interaction_id`
6. Gemini may request more tools or produce a final `text` response (JSON analysis)
7. Server attaches verified data from tool results to the response under `linkMetadata.verified`
8. Response logged to Supabase (fire-and-forget with 2s timeout)

**Dual mode:** `USE_AGENTIC_API=true` uses the Interactions API. `USE_AGENTIC_API=false` falls back to a legacy `generateContent` path where the server runs tools directly before calling Gemini once.

**Critical Interactions API detail:** `store: true` is required in every request to get an `id` back, which is needed for `previous_interaction_id` in multi-turn function calling.

### Server-Side Tools (`server/tools/`)

Gemini decides which tools to call based on the input. All tools run server-side:

| Tool | API | Purpose |
|------|-----|---------|
| `dns_geoip` | Google DNS-over-HTTPS + ipwho.is | Resolve domain to IP, get server country/city/ISP |
| `rdap_lookup` | IANA RDAP + registrar referral (Whoxy fallback) | Domain age, registrar, registrant details, privacy detection |
| `safe_browsing` | Google Safe Browsing API | Check URL against known threat database |
| `check_homograph` | Pure JS | Detect Punycode, Cyrillic lookalikes, zero-width characters |

Registrant data priority: **RDAP (free, IANA standard)** → **Whoxy (paid fallback, `WHOIS_API_KEY`)**

### Safe Link Preview Backend

Link preview uses a same-origin backend endpoint at `/api/screenshot`:

- In local dev, Vite proxies `/api/screenshot` to Browserless.
- In production, `api/screenshot.js` (serverless handler) forwards requests to Browserless using `BROWSERLESS_TOKEN`.

### Supabase Logging

Every analysis is logged to Supabase (fire-and-forget, never blocks the API response):

- `scam_analyses` table stores: input type, URL, risk level, score, fraud category, scam language, scam origin, domain intelligence, and full result JSON
- Screenshots uploaded to Supabase Storage (`screenshots` bucket)
- User feedback (correct/incorrect) linked back to analysis via `analysisId`

### Localization: 4 Context Variables

RedFlag tracks 4 variables to produce accurate, localized scam analysis:

| # | Variable | Source | Purpose | Supabase Column |
|---|----------|--------|---------|-----------------|
| 1 | **User Device Language** | `navigator.language` (frontend) | Controls the app interface and Gemini's output language | `user_device_language` |
| 2 | **User Location** | IP geolocation (`userCountryCode`) | Passed to Gemini as context for local emergency numbers, brands, and regional scam patterns | `user_country_code` |
| 3 | **Scam Language** | Gemini detects from content | The language of the scam input (screenshot, text, URL) | `scam_language` |
| 4 | **Scam Origin** | Gemini detects from content (`scamCountryCode`) | Where the scam originates or targets, inferred from language, currency, phone numbers, brands | `scam_origin` |

**Key distinction: User Location != Scam Origin.** A user in Singapore can upload a Taiwanese scam screenshot. The user's location provides context (e.g., local police numbers), but the scam origin is detected independently from the content itself.

#### Fallback chain for Scam Origin

```
scam_origin = Gemini's scamCountryCode → userCountryCode → null
```

1. **Primary:** Gemini analyzes the content and returns `scamCountryCode` (e.g., `"TW"` for a LINE phishing scam in Traditional Chinese)
2. **Fallback:** If Gemini cannot determine the origin (returns empty string), falls back to the user's country code
3. **Null:** If neither is available

#### How language output works

Gemini produces dual-language analysis in every response:

- **`native`** — Analysis written in the scam's detected language (so the user can see the scam in its original context)
- **`translated`** — Analysis written in the user's device language (so the user can understand the findings)

Example: A user with device language `en-US` in Singapore uploads a Thai-language scam screenshot. Gemini returns:
- `scam_language`: Thai
- `scam_origin`: TH
- `native`: Analysis in Thai
- `translated`: Analysis in English
