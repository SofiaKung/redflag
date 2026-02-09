/**
 * Tool definitions (Gemini Interactions API format) and executor dispatch.
 */

import { dnsGeoip } from './dnsGeoip.js';
import { rdapLookup } from './rdapLookup.js';
import { safeBrowsing } from './safeBrowsing.js';
import { checkHomograph } from './checkHomograph.js';

// ---- Gemini Interactions API tool definitions ----

export const toolDefinitions = [
  {
    type: 'function',
    name: 'dns_geoip',
    description:
      'Resolve a domain name to its IP address via DNS, then look up the server\'s geographic location (country, city) and hosting provider (ISP). Use this to determine where a website is physically hosted.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name to resolve (e.g. "example.com")',
        },
      },
      required: ['domain'],
    },
  },
  {
    type: 'function',
    name: 'rdap_lookup',
    description:
      'Look up domain registration data via RDAP (with WHOIS fallback). Returns: registration date, domain age, registrar name, registrant organization/name, registrant address and country, registrant email and phone, and whether WHOIS privacy protection is enabled. Use this to check domain age, ownership, and detect privacy proxies.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The registrable domain to look up (e.g. "example.com", not "www.example.com")',
        },
      },
      required: ['domain'],
    },
  },
  {
    type: 'function',
    name: 'safe_browsing',
    description:
      'Check a URL against Google Safe Browsing database for known malware, social engineering, unwanted software, and potentially harmful applications. Returns threat types if any are found.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to check (e.g. "https://example.com/page")',
        },
      },
      required: ['url'],
    },
  },
  {
    type: 'function',
    name: 'check_homograph',
    description:
      'Detect homograph attacks in a hostname: Punycode encoding (xn-- prefix), Cyrillic lookalike characters, zero-width invisible characters, and mixed-script content. These are techniques used to make malicious domains look like legitimate ones.',
    parameters: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The hostname to check (e.g. "xn--80ak6aa92e.com")',
        },
      },
      required: ['hostname'],
    },
  },
];

// ---- Tool executor ----

const toolFunctions = {
  dns_geoip: dnsGeoip,
  rdap_lookup: rdapLookup,
  safe_browsing: safeBrowsing,
  check_homograph: checkHomograph,
};

/**
 * Execute a tool by name.
 * @param {string} name - Tool name
 * @param {object} args - Tool arguments
 * @param {object} env - Environment variables (for API keys)
 * @returns {Promise<object>} Tool result
 */
export async function executeTool(name, args, env) {
  const fn = toolFunctions[name];
  if (!fn) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await fn(args, env);
  } catch (err) {
    return { error: err?.message || `Tool ${name} failed` };
  }
}
