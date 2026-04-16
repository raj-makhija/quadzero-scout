export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export abstract class BaseLLMProvider {
  abstract readonly name: string;

  abstract complete(
    messages: LLMMessage[],
    options?: LLMOptions
  ): Promise<LLMResponse>;

  async completeWithRetry(
    messages: LLMMessage[],
    options?: LLMOptions,
    maxRetries: number = 3
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.complete(messages, options);
      } catch (error) {
        lastError = error as Error;
        console.error(`LLM attempt ${attempt} failed:`, error);

        // Don't retry truncation errors — a larger token budget is needed,
        // retrying at the same limit will produce the same result.
        if (lastError.message.includes('response truncated')) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('LLM request failed after retries');
  }

  parseJsonResponse<T>(content: string): T {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();

    // If no closing fence was found (truncated response), strip opening fence manually
    if (!jsonMatch && jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```(?:json)?\s*/, '');
    }

    try {
      return JSON.parse(jsonString) as T;
    } catch {
      // Attempt to repair truncated JSON by closing open brackets/braces
      const repaired = this.repairTruncatedJson(jsonString);
      if (repaired) {
        try {
          console.warn('parseJsonResponse: repaired truncated JSON successfully');
          return JSON.parse(repaired) as T;
        } catch {
          // Repair didn't produce valid JSON either
        }
      }
      throw new Error(`Failed to parse LLM response as JSON: ${content.substring(0, 500)}...`);
    }
  }

  /**
   * Attempts to repair JSON truncated mid-stream by closing open structures.
   * Handles truncation inside strings, arrays, and objects.
   */
  private repairTruncatedJson(json: string): string | null {
    if (!json || json.length < 2) return null;

    // Trim trailing comma or colon (incomplete key-value pair)
    let trimmed = json.replace(/,\s*$/, '').replace(/:\s*$/, ': null');

    // If truncated inside a string value, close the string
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; }
    }
    if (inString) {
      trimmed += '"';
    }

    // Close open brackets/braces
    const stack: string[] = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') stack.push(ch);
      if (ch === '}' || ch === ']') stack.pop();
    }

    // Close in reverse order
    while (stack.length > 0) {
      const opener = stack.pop()!;
      // Trim trailing comma before closing
      trimmed = trimmed.replace(/,\s*$/, '');
      trimmed += opener === '{' ? '}' : ']';
    }

    return trimmed;
  }
}
