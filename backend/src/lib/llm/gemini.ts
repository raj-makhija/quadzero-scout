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

    // Disable thinking for Gemini 2.5 models — structured JSON extraction
    // doesn't benefit from chain-of-thought, and thinking tokens consume both
    // the maxOutputTokens budget and wall-clock time (40s+ vs ~10s without).
    // The SDK v0.24.x doesn't type thinkingConfig but the API accepts it.
    const result = await model.generateContent({
      contents,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(config.llm.geminiModel.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } as any : {}),
    });

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
}
