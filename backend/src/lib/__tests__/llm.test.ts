import { describe, it, expect, vi } from 'vitest';
import { BaseLLMProvider } from '../llm/base.js';
import type { LLMMessage, LLMResponse, LLMOptions } from '../llm/base.js';

// ---------------------------------------------------------------------------
// TC-ANALYZE-008, TC-ANALYZE-011: LLM Base Provider Tests
// ---------------------------------------------------------------------------

// Concrete implementation for testing the abstract class
class TestLLMProvider extends BaseLLMProvider {
  readonly name = 'test';
  private handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse>;

  constructor(handler: (messages: LLMMessage[], options?: LLMOptions) => Promise<LLMResponse>) {
    super();
    this.handler = handler;
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    return this.handler(messages, options);
  }
}

describe('BaseLLMProvider.parseJsonResponse()', () => {
  const provider = new TestLLMProvider(async () => ({ content: '{}' }));

  it('parses raw JSON string', () => {
    const result = provider.parseJsonResponse<{ name: string }>(
      '{"name": "John"}'
    );
    expect(result).toEqual({ name: 'John' });
  });

  it('extracts JSON from markdown code block', () => {
    const result = provider.parseJsonResponse<{ skills: string[] }>(
      '```json\n{"skills": ["react", "nodejs"]}\n```'
    );
    expect(result).toEqual({ skills: ['react', 'nodejs'] });
  });

  it('extracts JSON from code block without language tag', () => {
    const result = provider.parseJsonResponse<{ count: number }>(
      '```\n{"count": 42}\n```'
    );
    expect(result).toEqual({ count: 42 });
  });

  it('throws on unparseable content', () => {
    expect(() => {
      provider.parseJsonResponse('This is not JSON at all');
    }).toThrow('Failed to parse LLM response as JSON');
  });

  it('throws on malformed JSON', () => {
    expect(() => {
      provider.parseJsonResponse('{invalid json}');
    }).toThrow('Failed to parse LLM response as JSON');
  });

  it('parses nested objects', () => {
    const input = JSON.stringify({
      fullName: 'Jane Doe',
      primarySkills: ['react'],
      education: [{ degree: 'BS', institution: 'MIT' }],
    });
    const result = provider.parseJsonResponse<Record<string, unknown>>(input);
    expect(result.fullName).toBe('Jane Doe');
    expect((result.education as Array<Record<string, string>>)[0].degree).toBe('BS');
  });
});

describe('BaseLLMProvider.completeWithRetry()', () => {
  // TC-ANALYZE-011
  it('returns on first successful attempt', async () => {
    const handler = vi.fn().mockResolvedValue({ content: '{"ok": true}' });
    const provider = new TestLLMProvider(handler);

    const result = await provider.completeWithRetry(
      [{ role: 'user', content: 'test' }],
      undefined,
      3
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('{"ok": true}');
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ content: '{"ok": true}' });

    const provider = new TestLLMProvider(handler);

    const result = await provider.completeWithRetry(
      [{ role: 'user', content: 'test' }],
      undefined,
      3
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('{"ok": true}');
  });

  it('throws after exhausting all retries', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Persistent failure'));
    const provider = new TestLLMProvider(handler);

    await expect(
      provider.completeWithRetry(
        [{ role: 'user', content: 'test' }],
        undefined,
        2
      )
    ).rejects.toThrow('Persistent failure');

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('passes messages and options through to complete()', async () => {
    const handler = vi.fn().mockResolvedValue({ content: '{}' });
    const provider = new TestLLMProvider(handler);

    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a parser' },
      { role: 'user', content: 'Parse this' },
    ];
    const options: LLMOptions = { temperature: 0, maxTokens: 1024 };

    await provider.completeWithRetry(messages, options);

    expect(handler).toHaveBeenCalledWith(messages, options);
  });

  it('defaults to 3 retries', { timeout: 30000 }, async () => {
    const handler = vi.fn().mockRejectedValue(new Error('fail'));
    const provider = new TestLLMProvider(handler);

    await expect(
      provider.completeWithRetry([{ role: 'user', content: 'test' }])
    ).rejects.toThrow();

    expect(handler).toHaveBeenCalledTimes(3);
  });
});
