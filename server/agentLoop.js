/**
 * Gemini Interactions API agentic loop.
 *
 * Sends input to Gemini → receives function_call outputs → executes tools →
 * sends function_result back → repeats until Gemini produces a text response.
 */

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_TURNS = 5;

async function callInteractionsAPI(body, apiKey) {
  const response = await fetch(INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Interactions API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

/**
 * Run the agentic loop.
 *
 * @param {object} options
 * @param {string} options.model - Gemini model name
 * @param {string} options.systemInstruction - System prompt
 * @param {Array} options.input - Initial input parts (text, images)
 * @param {Array} options.tools - Tool definitions
 * @param {Function} options.toolExecutor - async (name, args) => result
 * @param {string} options.apiKey - Gemini API key
 * @returns {Promise<{text: string, toolResults: object}>}
 */
export async function runAgentLoop({
  model,
  systemInstruction,
  input,
  tools,
  toolExecutor,
  apiKey,
}) {
  let interactionId = null;
  const toolResults = {};
  let currentInput = input;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const requestBody = {
      model,
      input: currentInput,
      tools,
      system_instruction: systemInstruction,
      store: true,
    };

    if (interactionId) {
      requestBody.previous_interaction_id = interactionId;
    }

    const response = await callInteractionsAPI(requestBody, apiKey);
    interactionId = response.id;

    const outputs = response.outputs || [];
    const functionCalls = outputs.filter((o) => o.type === 'function_call');

    if (functionCalls.length === 0) {
      // Model produced final text response
      const textOutput = outputs.find((o) => o.type === 'text');
      return {
        text: textOutput?.text || '',
        toolResults,
      };
    }

    // Execute all function calls in parallel
    const results = await Promise.all(
      functionCalls.map(async (call) => {
        const result = await toolExecutor(call.name, call.arguments);
        toolResults[call.name] = result;
        return {
          type: 'function_result',
          name: call.name,
          call_id: call.id,
          result: typeof result === 'string' ? result : JSON.stringify(result),
        };
      })
    );

    currentInput = results;
  }

  throw new Error('Agent loop exceeded maximum turns');
}
