// GitHub Models call wrapper (free inference gateway, available inside
// GitHub Actions via GITHUB_TOKEN with `permissions: models: read`).
// https://models.github.ai/inference/chat/completions

const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4.1-mini";

export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class SchemaValidationError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = "SchemaValidationError";
    this.raw = raw;
  }
}

/**
 * Call GitHub Models chat completions and parse a JSON object response.
 * @param {object} params
 * @param {string} params.token GITHUB_TOKEN
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @returns {Promise<object>} parsed JSON object from the model
 */
export async function callGithubModelsJson({ token, systemPrompt, userPrompt }) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (response.status === 429) {
    throw new RateLimitError("GitHub Models rate limit reached (429)");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub Models HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new SchemaValidationError("No content in GitHub Models response", json);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new SchemaValidationError(`Response was not valid JSON: ${err.message}`, content);
  }
  return parsed;
}

/**
 * Validate a plain object against a simple schema: a map of field name to
 * one of "string", "number", "boolean", "array", "string|null", "number|null",
 * "boolean|null", "array|null". Throws SchemaValidationError on mismatch.
 * @param {object} data
 * @param {Record<string, string>} schema
 */
export function validateSchema(data, schema) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SchemaValidationError("Expected a JSON object", data);
  }
  for (const [field, type] of Object.entries(schema)) {
    const allowsNull = type.endsWith("|null");
    const baseType = allowsNull ? type.slice(0, -"|null".length) : type;
    const value = data[field];

    if (value === null || value === undefined) {
      if (allowsNull) continue;
      throw new SchemaValidationError(`Field "${field}" must not be null`, data);
    }

    const actual = Array.isArray(value) ? "array" : typeof value;
    if (actual !== baseType) {
      throw new SchemaValidationError(
        `Field "${field}" expected ${baseType}, got ${actual}`,
        data
      );
    }
  }
  return true;
}
