import OpenAI from 'openai';
import { BaseLLMProvider, LLMMessage, LLMResponse, LLMOptions } from './base.js';
import { config } from '../config.js';

export class OpenRouterProvider extends BaseLLMProvider {
  readonly name = 'openrouter';
  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.llm.openrouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': config.llm.openrouterReferer,
        'X-Title': 'Quadzero Scout',
      },
    });
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: config.llm.openrouterModel,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenRouter response');
    }

    return {
      content,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
