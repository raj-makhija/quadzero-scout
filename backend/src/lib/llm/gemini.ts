import { GoogleGenerativeAI, Content, FinishReason } from '@google/generative-ai';
import { BaseLLMProvider, LLMMessage, LLMResponse, LLMOptions } from './base.js';
import { config } from '../config.js';

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor() {
    super();
    this.client = new GoogleGenerativeAI(config.llm.geminiApiKey);
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    // Convert messages to Gemini format
    // Gemini uses a different format: system instruction + contents
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    // Build system instruction in the correct format
    const systemInstruction = systemMessage
      ? { role: 'user' as const, parts: [{ text: systemMessage.content }] }
      : undefined;

    const model = this.client.getGenerativeModel({
      model: config.llm.geminiModel,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0,
        responseMimeType: options?.responseFormat === 'text' ? 'text/plain' : 'application/json',
      },
    });

    const contents: Content[] = otherMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result = await this.generateWithRetry(() => model.generateContent({ contents }));

    const response = result.response;

    // Check for truncation due to maxOutputTokens
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
      const used = response.usageMetadata?.candidatesTokenCount || 0;
      throw new Error(
        `Gemini response truncated at ${used} output tokens (maxOutputTokens: ${options?.maxTokens || 4096}). Increase the token budget.`
      );
    }

    const content = response.text();

    if (!content) {
      throw new Error('No content in Gemini response');
    }

    // Gemini provides token counts in usageMetadata
    const usageMetadata = response.usageMetadata;

    return {
      content,
      usage: usageMetadata
        ? {
            inputTokens: usageMetadata.promptTokenCount || 0,
            outputTokens: usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }

  private async generateWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
    const delaysMs = [2000, 8000, 32000];
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err;
        const jitter = Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delaysMs[attempt] + jitter));
      }
    }
    throw lastErr;
  }
}

export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as any)?.status ?? (err as any)?.statusCode;
  return status === 429 || /\b429\b|rate.?limit|resource exhausted|too many requests|quota/i.test(message);
}
