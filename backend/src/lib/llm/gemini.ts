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

    const result = await model.generateContent({ contents });

    const response = result.response;

    const candidate = response.candidates?.[0];
    const content = response.text();

    // Gemini 2.0 Flash with JSON response format sometimes reports
    // finishReason=MAX_TOKENS while returning usable content well under the
    // budget. Only treat it as fatal when there is no content to return;
    // otherwise let the caller decide whether the payload is parseable.
    if (!content) {
      if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
        const used = response.usageMetadata?.candidatesTokenCount || 0;
        throw new Error(
          `Gemini response truncated at ${used} output tokens (maxOutputTokens: ${options?.maxTokens || 4096}) with no content. Increase the token budget.`
        );
      }
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

}
