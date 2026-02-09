import { useState } from "react";

// ---- Phase & Node Data ----

const phases = [
  {
    id: "client_request",
    label: "Phase 1",
    title: "Client Request",
    trigger: "User submits URL, text, or screenshot",
    color: "#3B82F6",
    accent: "#DBEAFE",
    nodes: [
      {
        id: "app_router",
        type: "trigger",
        label: "App.tsx — 3-Way Router",
        detail:
          "Routes based on input type:\n• URL → verifyUrlString()\n• Screenshot → checkPhishingFromScreenshot()\n• Text → analyzeFraudContent()\n\nAll three delegate to analyzeContent() via backward-compat aliases.",
      },
      {
        id: "gemini_service",
        type: "action",
        label: "geminiService.ts — POST /api/analyze",
        detail:
          "Single analyzeContent() function.\nSends { url?, text?, imagesBase64?, userLanguage } to backend.\nHandles errors with getFallbackResult().",
      },
    ],
    issues: [],
  },
  {
    id: "server_entry",
    label: "Phase 2",
    title: "Server Entry & Validation",
    trigger: "POST /api/analyze hits Vercel serverless or Vite dev server",
    color: "#10B981",
    accent: "#D1FAE5",
    nodes: [
      {
        id: "api_analyze",
        type: "trigger",
        label: "api/analyze.js — Serverless Entry",
        detail:
          "• Origin check (isRequestOriginAllowed)\n• Rate limiting (routeKey: 'analyze')\n• Payload validation (url | text | imagesBase64)\n• userLanguage required\n• 25MB body limit for base64 images",
      },
      {
        id: "analyze_handler",
        type: "logic",
        label: "analyzeHandler.js — Dual Mode Router",
        detail:
          "Checks env.USE_AGENTIC_API:\n• 'true' → runAgentic() — Interactions API\n• 'false' → runLegacy() — generateContent\n\nIf agentic fails, auto-fallback to legacy.",
      },
    ],
    issues: [],
  },
  {
    id: "agentic_turn0",
    label: "Phase 3",
    title: "Agentic Loop — Turn 0 (Initial)",
    trigger: "USE_AGENTIC_API=true",
    color: "#8B5CF6",
    accent: "#EDE9FE",
    nodes: [
      {
        id: "build_prompt",
        type: "logic",
        label: "Build System Prompt + Input",
        detail:
          "buildSystemPrompt(userLanguage):\n• RedFlag persona & capabilities\n• Tool usage guidelines\n• WHOIS intelligence analysis rules\n• Output JSON schema specification\n\nbuildInputParts():\n• URL → 'Analyze this URL...'\n• Text → 'Analyze this content...'\n• Images → inline base64 parts",
      },
      {
        id: "interactions_api_t0",
        type: "ai",
        label: "POST /v1beta/interactions",
        detail:
          "Request body:\n{\n  model: 'gemini-3-pro-preview',\n  input: [text/image parts],\n  tools: [4 tool definitions],\n  system_instruction: '...',\n  store: true  // CRITICAL for interaction ID\n}\n\nResponse: outputs[] with function_call items\nStatus: 'requires_action'",
      },
    ],
    issues: [
      {
        severity: "note",
        text: "store: true is REQUIRED to get interaction ID back. store: false breaks multi-turn.",
      },
    ],
  },
  {
    id: "tool_execution",
    label: "Phase 4",
    title: "Parallel Tool Execution",
    trigger: "Gemini returns function_call outputs",
    color: "#F59E0B",
    accent: "#FEF3C7",
    nodes: [
      {
        id: "dns_geoip",
        type: "action",
        label: "dns_geoip — DNS + GeoIP",
        detail:
          "1. dns.google/resolve?name={domain}\n2. ipwho.is/{ip}\n\nReturns: { ip, country, city, isp, success }",
      },
      {
        id: "rdap_lookup",
        type: "action",
        label: "rdap_lookup — RDAP + Whoxy Fallback",
        detail:
          "1. IANA bootstrap → data.iana.org/rdap/dns.json\n2. Registry RDAP query\n3. Registrar referral (follow links)\n4. vCard parsing → registrant details\n5. Privacy proxy detection\n6. Whoxy fallback if RDAP fails\n\nReturns: { registrationDate, domainAge, registrar,\n  registrantOrg, registrantEmail, ... }",
      },
      {
        id: "safe_browsing",
        type: "action",
        label: "safe_browsing — Google Safe Browsing v4",
        detail:
          "POST safebrowsing.googleapis.com/v4/threatMatches:find\nChecks: MALWARE, SOCIAL_ENGINEERING,\n  UNWANTED_SOFTWARE, THREAT_TYPE_UNSPECIFIED\n\nReturns: { threats: [...], clean: bool, success: bool }",
      },
      {
        id: "check_homograph",
        type: "action",
        label: "check_homograph — Homograph Detection",
        detail:
          "Pure JavaScript checks:\n• Punycode (xn-- prefix)\n• Cyrillic characters\n• Zero-width characters\n• Mixed-script detection\n\nReturns: { isHomograph, hasPunycode, details }",
      },
    ],
    issues: [
      {
        severity: "note",
        text: "All 4 tools executed in parallel via Promise.all() for speed.",
      },
    ],
  },
  {
    id: "agentic_turn1",
    label: "Phase 5",
    title: "Agentic Loop — Turn 1+ (Results)",
    trigger: "Tool results ready → send back to Gemini",
    color: "#8B5CF6",
    accent: "#EDE9FE",
    nodes: [
      {
        id: "function_results",
        type: "data",
        label: "Build function_result Array",
        detail:
          "For each tool call:\n{\n  type: 'function_result',\n  name: call.name,\n  call_id: call.id,\n  result: JSON.stringify(toolOutput)\n}",
      },
      {
        id: "interactions_api_t1",
        type: "ai",
        label: "POST /v1beta/interactions (Turn 1)",
        detail:
          "Request body:\n{\n  model: 'gemini-3-pro-preview',\n  input: [function_result items],\n  previous_interaction_id: response.id,\n  tools: [...],\n  system_instruction: '...',\n  store: true\n}\n\nResponse: outputs[] with type: 'text'\nStatus: 'completed'",
      },
    ],
    issues: [
      {
        severity: "note",
        text: "previous_interaction_id chains the conversation. tools + system_instruction re-sent every turn.",
      },
      {
        severity: "note",
        text: "Max 5 turns. If model requests more tools, loop continues.",
      },
    ],
  },
  {
    id: "response_build",
    label: "Phase 6",
    title: "Response Building",
    trigger: "Gemini returns final text (JSON analysis)",
    color: "#10B981",
    accent: "#D1FAE5",
    nodes: [
      {
        id: "parse_json",
        type: "logic",
        label: "Parse & Validate JSON",
        detail:
          "1. Strip markdown code fences if present\n2. JSON.parse the response text\n3. Ensure score is a number (fallback: 0)\n4. Ensure riskLevel exists (derive from score)",
      },
      {
        id: "verified_data",
        type: "data",
        label: "Build Verified Data (Server-Side)",
        detail:
          "buildVerifiedFromToolResults():\n• Aggregates real data from all 4 tools\n• Computes checksCompleted / checksFailed\n• Detects geo-mismatch (server vs registrant country)\n• Detects new domain + privacy = high risk\n\nAttached as linkMetadata.verified — NOT from model output.",
      },
      {
        id: "client_response",
        type: "action",
        label: "Return AnalysisResult to Client",
        detail:
          "Full response includes:\n• riskLevel, score, category\n• native + translated analysis\n• linkMetadata with verified server-side data\n• checksCompleted for UI badges",
      },
    ],
    issues: [],
  },
  {
    id: "legacy_fallback",
    label: "Fallback",
    title: "Legacy Path (Fallback)",
    trigger: "USE_AGENTIC_API=false OR agentic path throws error",
    color: "#EF4444",
    accent: "#FEE2E2",
    nodes: [
      {
        id: "legacy_tools",
        type: "action",
        label: "Parallel Tool Execution (Direct)",
        detail:
          "If URL provided:\n• Extract hostname + registrable domain\n• Promise.allSettled([dns, rdap, sb, homograph])\n• Build intel summary string for prompt",
      },
      {
        id: "legacy_generate",
        type: "ai",
        label: "generateContent (Single Call)",
        detail:
          "POST /v1beta/models/{model}:generateContent\n• System prompt + user content + tool data in one call\n• Uses responseSchema for structured output\n• No multi-turn — one shot\n\nSame verified data attachment afterwards.",
      },
    ],
    issues: [
      {
        severity: "note",
        text: "Legacy path still works independently. Agentic auto-falls back here on any error.",
      },
    ],
  },
];

// ---- Styling ----

const typeStyles: Record<string, { bg: string; icon: string }> = {
  trigger: { bg: "#6366F1", icon: "\u26A1" },
  action: { bg: "#8B5CF6", icon: "\u2699\uFE0F" },
  data: { bg: "#0EA5E9", icon: "\uD83D\uDCBE" },
  logic: { bg: "#F97316", icon: "\uD83D\uDD00" },
  ai: { bg: "#EC4899", icon: "\uD83E\uDDE0" },
  wait: { bg: "#EF4444", icon: "\u23F8" },
};

const severityStyles: Record<
  string,
  { bg: string; border: string; label: string; color: string }
> = {
  fix: { bg: "#FEE2E2", border: "#EF4444", label: "FIX", color: "#991B1B" },
  change: {
    bg: "#FEF3C7",
    border: "#F59E0B",
    label: "CHANGE",
    color: "#92400E",
  },
  new: { bg: "#DBEAFE", border: "#3B82F6", label: "NEW", color: "#1E40AF" },
  note: { bg: "#F3F4F6", border: "#9CA3AF", label: "NOTE", color: "#4B5563" },
};

// ---- Components ----

function NodeCard({
  node,
  isSelected,
  onClick,
}: {
  node: (typeof phases)[0]["nodes"][0];
  isSelected: boolean;
  onClick: () => void;
}) {
  const style = typeStyles[node.type] || typeStyles.action;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: isSelected
          ? `2px solid ${style.bg}`
          : "1px solid #E5E7EB",
        background: isSelected ? `${style.bg}11` : "#FFFFFF",
        cursor: "pointer",
        minWidth: 200,
        flex: "1 1 200px",
        transition: "all 0.15s ease",
      }}
    >
      <span
        style={{
          background: style.bg,
          color: "#fff",
          borderRadius: 4,
          padding: "1px 6px",
          fontSize: 11,
          fontWeight: 600,
          display: "inline-block",
        }}
      >
        {style.icon} {node.type.toUpperCase()}
      </span>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: "#1F2937" }}>
        {node.label}
      </div>
      {isSelected && (
        <div
          style={{
            fontSize: 11,
            color: "#6B7280",
            marginTop: 6,
            whiteSpace: "pre-line",
            borderTop: "1px solid #E5E7EB",
            paddingTop: 6,
            lineHeight: 1.5,
          }}
        >
          {node.detail}
        </div>
      )}
    </div>
  );
}

function PhaseCard({
  phase,
  selectedNode,
  onSelectNode,
}: {
  phase: (typeof phases)[0];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
} & { key?: string }) {
  return (
    <div
      style={{
        background: phase.accent,
        borderRadius: 12,
        border: `1px solid ${phase.color}33`,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: phase.color,
          color: "#fff",
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{phase.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 8 }}>
            {phase.title}
          </span>
        </div>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{phase.trigger}</span>
      </div>

      {/* Nodes */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {phase.nodes.map((node, i) => (
          <div key={node.id} style={{ display: "flex", alignItems: "flex-start", flex: "1 1 200px" }}>
            <NodeCard
              node={node}
              isSelected={selectedNode === node.id}
              onClick={() =>
                onSelectNode(selectedNode === node.id ? null : node.id)
              }
            />
            {i < phase.nodes.length - 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 4px",
                  color: phase.color,
                  fontSize: 18,
                  fontWeight: 700,
                  alignSelf: "center",
                  flexShrink: 0,
                }}
              >
                →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Issues */}
      {phase.issues.length > 0 && (
        <div style={{ padding: "0 12px 12px" }}>
          {phase.issues.map((issue, i) => {
            const s = severityStyles[issue.severity] || severityStyles.note;
            return (
              <div
                key={i}
                style={{
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  color: s.color,
                  marginTop: 4,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700 }}>{s.label}</span>
                {issue.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Data Flow Summary ----

const flowSteps = [
  { label: "Client", color: "#3B82F6" },
  { label: "/api/analyze", color: "#10B981" },
  { label: "Interactions API", color: "#8B5CF6" },
  { label: "4 Tools (parallel)", color: "#F59E0B" },
  { label: "Interactions API", color: "#8B5CF6" },
  { label: "Verified Data", color: "#10B981" },
  { label: "AnalysisResult", color: "#3B82F6" },
];

// ---- Fraud Detection Business Logic ----

const fraudSignals = [
  {
    id: "whois_intel",
    title: "WHOIS Intelligence",
    color: "#8B5CF6",
    signals: [
      {
        name: "Privacy Proxy Detection",
        risk: "high",
        description:
          'Registrant org matches known proxies ("Withheld for Privacy", "Domains By Proxy", etc.). Legitimate businesses typically register under their real identity.',
      },
      {
        name: "Geo-Mismatch",
        risk: "high",
        description:
          "Registrant country differs from server hosting country. E.g. a Singapore bank hosted in the US with a Panama registrant. Severity escalates when combined with other signals.",
      },
      {
        name: "New Domain + Privacy",
        risk: "critical",
        description:
          "Domain registered hours/days/weeks ago AND uses WHOIS privacy. This combination is the strongest fraud signal — legitimate sites don't hide behind privacy proxies when brand new.",
      },
      {
        name: "Email Mismatch",
        risk: "medium",
        description:
          "Registrant email domain doesn't match the site domain. E.g. site is 'mybank.com' but registrant email is 'john@gmail.com'.",
      },
      {
        name: "Org vs Brand Cross-Reference",
        risk: "medium",
        description:
          "Does the registrant org match what the site claims to be? E.g. 'PayNow' site owned by 'Privacy ehf' instead of a bank.",
      },
    ],
  },
  {
    id: "technical_intel",
    title: "Technical Intelligence",
    color: "#F59E0B",
    signals: [
      {
        name: "Safe Browsing Blacklist",
        risk: "critical",
        description:
          "Google Safe Browsing flags the URL for MALWARE, SOCIAL_ENGINEERING, or UNWANTED_SOFTWARE. This is a confirmed threat from Google's global database.",
      },
      {
        name: "Homograph Attack",
        risk: "critical",
        description:
          "Domain uses Punycode (xn--), Cyrillic characters, zero-width characters, or mixed-script encoding to impersonate a legitimate domain visually.",
      },
      {
        name: "Suspicious TLD",
        risk: "medium",
        description:
          'Cheap/disposable TLDs frequently used by scammers: .xyz, .top, .pw, .loan, .click, .help. Legitimate brands typically use .com, .org, or country-code TLDs.',
      },
      {
        name: "Domain Age",
        risk: "medium",
        description:
          "Domains registered very recently (hours to weeks) are far more likely to be malicious. Most phishing domains are used within days of registration.",
      },
    ],
  },
  {
    id: "content_signals",
    title: "Content Analysis (Gemini Reasoning)",
    color: "#EC4899",
    signals: [
      {
        name: "Urgency & Threats",
        risk: "high",
        description:
          '"Act now!", "Your account will be locked", "Limited time offer". Creates panic to bypass rational thinking.',
      },
      {
        name: "Credential Harvesting",
        risk: "critical",
        description:
          "Requests for passwords, SSN, bank details, OTPs, or personal identification. No legitimate service asks for these via links.",
      },
      {
        name: "Brand Impersonation",
        risk: "high",
        description:
          'Visual or textual mimicry of known brands (Amazon, PayPal, banks). Detected via domain analysis + content inspection. Model identifies the impersonated brand.',
      },
      {
        name: "Grammar & Language",
        risk: "low",
        description:
          "Poor grammar, unusual phrasing, or machine-translation artifacts. A secondary signal — modern phishing often has good grammar.",
      },
      {
        name: "Unsolicited Prize/Reward",
        risk: "high",
        description:
          '"Congratulations, you won!", "Claim your gift card". Classic social engineering hook. Gemini flags these patterns in text/screenshots.',
      },
    ],
  },
];

const riskColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: "#FEE2E2", text: "#991B1B" },
  high: { bg: "#FEF3C7", text: "#92400E" },
  medium: { bg: "#DBEAFE", text: "#1E40AF" },
  low: { bg: "#F3F4F6", text: "#4B5563" },
};

const scoringTiers = [
  { range: "0-20", level: "SAFE", color: "#10B981", description: "Well-known domain, all checks pass, legitimate registrant, no threats" },
  { range: "21-49", level: "CAUTION", color: "#F59E0B", description: "Some suspicious signals but inconclusive — new domain, privacy proxy, unusual TLD" },
  { range: "50-100", level: "DANGER", color: "#EF4444", description: "Strong fraud indicators — blacklisted, homograph, fake brand, credential harvesting" },
];

function FraudDetectionLogic() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showScoring, setShowScoring] = useState(false);
  const [showGeminiFlow, setShowGeminiFlow] = useState(false);

  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      {/* Section Header */}
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#1F2937",
          margin: "0 0 12px",
          paddingBottom: 8,
          borderBottom: "2px solid #E5E7EB",
        }}
      >
        Fraud Detection Business Logic
      </h2>

      {/* Gemini Reasoning Flow */}
      <div
        style={{
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => setShowGeminiFlow(!showGeminiFlow)}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: "#EDE9FE",
            border: "none",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "#5B21B6",
          }}
        >
          How Gemini Reasons Inside the Interactions API
          <span>{showGeminiFlow ? "\u25BC" : "\u25B6"}</span>
        </button>
        {showGeminiFlow && (
          <div style={{ padding: 16, fontSize: 12, lineHeight: 1.7, color: "#4B5563" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {[
                { step: "1", label: "Receive Input", desc: "URL, text, or screenshot arrives", color: "#3B82F6" },
                { step: "2", label: "Decide Tools", desc: "Gemini picks which tools to call based on input type", color: "#8B5CF6" },
                { step: "3", label: "Analyze Results", desc: "Cross-references all tool outputs for fraud patterns", color: "#F59E0B" },
                { step: "4", label: "Score & Classify", desc: "Assigns risk score, category, and generates bilingual report", color: "#EF4444" },
              ].map((s) => (
                <div
                  key={s.step}
                  style={{
                    flex: "1 1 180px",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `2px solid ${s.color}`,
                    background: `${s.color}08`,
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      background: s.color,
                      color: "#fff",
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: "20px",
                      marginRight: 6,
                    }}
                  >
                    {s.step}
                  </div>
                  <strong style={{ fontSize: 12 }}>{s.label}</strong>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ margin: "0 0 8px" }}>
              <strong>Key insight:</strong> Gemini doesn't just summarize tool results. It
              performs <em>cross-referential reasoning</em>:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                <strong>URL input:</strong> Calls all 4 tools in parallel, then correlates
                domain age + privacy proxy + geo-mismatch + blacklist status into a holistic
                risk assessment.
              </li>
              <li>
                <strong>Text input:</strong> Reads the text for fraud patterns first. If it
                finds an embedded URL, it extracts it and calls tools in a follow-up turn —
                something the legacy path can't do.
              </li>
              <li>
                <strong>Screenshot input:</strong> Uses vision to identify text/URLs in the
                image, then optionally calls tools if domains are visible.
              </li>
              <li>
                <strong>Multi-turn capability:</strong> If the first tool results reveal
                something unexpected, Gemini can request additional investigation (up to 5
                turns).
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Signal Categories */}
      {fraudSignals.map((category) => (
        <div
          key={category.id}
          style={{
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            overflow: "hidden",
            marginBottom: 8,
          }}
        >
          <button
            onClick={() =>
              setExpandedCategory(
                expandedCategory === category.id ? null : category.id
              )
            }
            style={{
              width: "100%",
              padding: "8px 16px",
              background: "#FFFFFF",
              border: "none",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              fontWeight: 600,
              color: "#1F2937",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: category.color,
                  display: "inline-block",
                }}
              />
              {category.title}
              <span
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  fontWeight: 400,
                }}
              >
                ({category.signals.length} signals)
              </span>
            </span>
            <span>
              {expandedCategory === category.id ? "\u25BC" : "\u25B6"}
            </span>
          </button>
          {expandedCategory === category.id && (
            <div style={{ padding: "4px 12px 12px" }}>
              {category.signals.map((signal, i) => {
                const rc = riskColors[signal.risk];
                return (
                  <div
                    key={i}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #E5E7EB",
                      marginTop: 6,
                      background: "#FAFAFA",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          background: rc.bg,
                          color: rc.text,
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {signal.risk}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1F2937",
                        }}
                      >
                        {signal.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6B7280",
                        lineHeight: 1.5,
                      }}
                    >
                      {signal.description}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Scoring Tiers */}
      <div
        style={{
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          overflow: "hidden",
          marginTop: 12,
        }}
      >
        <button
          onClick={() => setShowScoring(!showScoring)}
          style={{
            width: "100%",
            padding: "8px 16px",
            background: "#FFFFFF",
            border: "none",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "#1F2937",
          }}
        >
          Risk Scoring & Output
          <span>{showScoring ? "\u25BC" : "\u25B6"}</span>
        </button>
        {showScoring && (
          <div style={{ padding: "8px 12px 12px" }}>
            {/* Scoring tiers */}
            {scoringTiers.map((tier) => (
              <div
                key={tier.range}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #E5E7EB",
                  marginTop: 6,
                  background: "#FAFAFA",
                }}
              >
                <span
                  style={{
                    background: tier.color,
                    color: "#fff",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    minWidth: 60,
                    textAlign: "center",
                  }}
                >
                  {tier.level}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#374151",
                    minWidth: 40,
                  }}
                >
                  {tier.range}
                </span>
                <span style={{ fontSize: 11, color: "#6B7280" }}>
                  {tier.description}
                </span>
              </div>
            ))}

            {/* Output structure */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 6,
                background: "#1F2937",
                color: "#E5E7EB",
                fontSize: 11,
                fontFamily: "monospace",
                lineHeight: 1.6,
                whiteSpace: "pre",
                overflow: "auto",
              }}
            >
{`AnalysisResult {
  riskLevel   → SAFE | CAUTION | DANGER
  score       → 0-100 (Gemini assigns, server validates type)
  category    → "Phishing", "Brand Impersonation", "Job Scam"...
  native      → { headline, explanation, action, hook, trap, redFlags[] }
  translated  → Same structure in user's device language
  linkMetadata → {
    analyzedUrl, impersonating, actualDomain, domainAge,
    serverLocation, blacklistCount, suspiciousTld,
    verified: {   ← SERVER-SIDE (not from model)
      domainAge, registrar, registrantOrg, serverCountry,
      safeBrowsingThreats[], homographAttack, privacyProtected,
      geoMismatch, geoMismatchSeverity, checksCompleted[]
    }
  }
}`}
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#6B7280",
                lineHeight: 1.5,
              }}
            >
              <strong>Dual output strategy:</strong> Gemini produces the reasoning
              (explanation, redFlags, risk score). The server independently builds{" "}
              <code
                style={{
                  background: "#F3F4F6",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                verified
              </code>{" "}
              from raw tool results — ensuring data shown in the UI (domain age,
              registrar, server location) comes from actual API responses, not model
              hallucination.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function ArchitectureDiagram() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showDecisions, setShowDecisions] = useState(false);

  return (
    <div
      style={{
        fontFamily:
          '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif',
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        color: "#1F2937",
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          RedFlag — Gemini Interactions API Architecture
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
          Agentic loop with dual-mode fallback. Click any node for details.
        </p>
      </div>

      {/* Data Flow Summary */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
          marginBottom: 20,
          padding: "10px 14px",
          background: "#F9FAFB",
          borderRadius: 8,
          border: "1px solid #E5E7EB",
        }}
      >
        <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 4 }}>
          FLOW:
        </span>
        {flowSteps.map((step, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                background: step.color,
                color: "#fff",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {step.label}
            </span>
            {i < flowSteps.length - 1 && (
              <span style={{ color: "#9CA3AF", fontSize: 12 }}>→</span>
            )}
          </span>
        ))}
      </div>

      {/* Phases */}
      {phases.map((phase) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      ))}

      {/* Fraud Detection Business Logic */}
      <FraudDetectionLogic />

      {/* Architecture Decisions */}
      <div
        style={{
          marginTop: 24,
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setShowDecisions(!showDecisions)}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: "#F9FAFB",
            border: "none",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "#1F2937",
          }}
        >
          Architecture Decisions
          <span>{showDecisions ? "▼" : "▶"}</span>
        </button>
        {showDecisions && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              lineHeight: 1.7,
              color: "#4B5563",
            }}
          >
            <p>
              <strong>Why Interactions API over generateContent?</strong>
              <br />
              Gemini drives the tool-calling loop — it decides which tools to call and when,
              rather than us pre-calling all tools. This enables smarter analysis:
              for text inputs, Gemini can extract URLs and then investigate them.
            </p>
            <p>
              <strong>Why store: true?</strong>
              <br />
              The REST API only returns an interaction ID when store=true.
              Without it, previous_interaction_id cannot be used, breaking multi-turn
              function calling entirely.
            </p>
            <p>
              <strong>Why dual mode with fallback?</strong>
              <br />
              The Interactions API is in Beta. If it fails (rate limits, API changes),
              the legacy generateContent path kicks in automatically. Both produce
              identical AnalysisResult shapes.
            </p>
            <p>
              <strong>Why verified data is built server-side?</strong>
              <br />
              The model reasons about tool results, but the actual values in
              linkMetadata.verified come directly from tool execution output —
              not from Gemini's JSON response. This ensures data fidelity.
            </p>
            <p>
              <strong>Why no response_schema on Interactions API?</strong>
              <br />
              The Interactions API doesn't support response_mime_type or response_schema
              in generation_config. We rely on the system prompt + post-parse validation instead.
            </p>
          </div>
        )}
      </div>

      {/* File Reference */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "#F9FAFB",
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          fontSize: 11,
          color: "#6B7280",
        }}
      >
        <strong style={{ color: "#1F2937" }}>Files:</strong>{" "}
        server/agentLoop.js · server/analyzeHandler.js · server/tools/*.js ·
        api/analyze.js · services/geminiService.ts · vite.config.ts
      </div>
    </div>
  );
}
