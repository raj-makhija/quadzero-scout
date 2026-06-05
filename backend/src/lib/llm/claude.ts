import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, LLMMessage, LLMResponse, LLMOptions } from './base.js';
import { config } from '../config.js';

export class ClaudeProvider extends BaseLLMProvider {
  readonly name = 'claude';
  private client: Anthropic;

  constructor() {
    super();
    this.client = new Anthropic({
      apiKey: config.llm.anthropicApiKey,
    });
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0,
      system: systemMessage?.content || '',
      messages: conversationMessages,
    });

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return {
      content: textContent.text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
