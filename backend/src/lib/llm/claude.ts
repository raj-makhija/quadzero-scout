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

    // Attach an ephemeral cache_control breakpoint to the system prompt so the
    // large, stable system block is cached for ~5 min (Anthropic prompt caching).
    // Only applied when a non-empty system message is present; an empty/absent
    // system message is passed as a plain string with no cache_control.
    const systemText = systemMessage?.content || '';
    const system = systemText
      ? [{ type: 'text' as const, text: systemText, cache_control: { type: 'ephemeral' as const } }]
      : '';

    const response = await this.client.beta.promptCaching.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0,
      system,
      messages: conversationMessages,
    });

    // Extract text content from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Surface cache token counts so cache hit rate is observable.
    const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0;
    const cacheCreationInputTokens = response.usage.cache_creation_input_tokens ?? 0;
    if (cacheReadInputTokens > 0 || cacheCreationInputTokens > 0) {
      console.info(
        `[claude] prompt cache: read=${cacheReadInputTokens} creation=${cacheCreationInputTokens} ` +
          `input=${response.usage.input_tokens} output=${response.usage.output_tokens}`
      );
    }

    return {
      content: textContent.text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens,
        cacheCreationInputTokens,
      },
    };
  }
}
