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
    const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();

    try {
      return JSON.parse(jsonString) as T;
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${content.substring(0, 200)}...`);
    }
  }
}
