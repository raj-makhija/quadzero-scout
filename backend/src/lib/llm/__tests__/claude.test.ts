import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK so we can assert on the outbound request shape and
// control the response (including cache token counts) without a real API call.
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      beta = {
        promptCaching: {
          messages: {
            create: createMock,
          },
        },
      };
    },
  };
});

import { ClaudeProvider } from '../claude.js';

function mockResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text: 'hello' }],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      ...overrides,
    },
  };
}

describe('ClaudeProvider prompt caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue(mockResponse());
  });

  it('attaches cache_control to the system block when a system message is present', async () => {
    const provider = new ClaudeProvider();
    await provider.complete([
      { role: 'system', content: 'You are a resume parser.' },
      { role: 'user', content: 'parse this' },
    ]);

    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(Array.isArray(arg.system)).toBe(true);
    expect(arg.system).toHaveLength(1);
    expect(arg.system[0]).toEqual({
      type: 'text',
      text: 'You are a resume parser.',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('passes a plain string with no cache_control when no system message is present', async () => {
    const provider = new ClaudeProvider();
    await provider.complete([{ role: 'user', content: 'hi' }]);

    const arg = createMock.mock.calls[0][0];
    expect(arg.system).toBe('');
    expect(JSON.stringify(arg)).not.toContain('cache_control');
  });

  it('does not apply cache_control when the system message is an empty string', async () => {
    const provider = new ClaudeProvider();
    await provider.complete([
      { role: 'system', content: '' },
      { role: 'user', content: 'hi' },
    ]);

    const arg = createMock.mock.calls[0][0];
    expect(arg.system).toBe('');
    expect(JSON.stringify(arg)).not.toContain('cache_control');
  });

  it('surfaces cache token counts on the returned LLMResponse (warm cache hit)', async () => {
    createMock.mockResolvedValue(
      mockResponse({ cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 })
    );
    const provider = new ClaudeProvider();
    const res = await provider.complete([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);

    expect(res.usage?.cacheReadInputTokens).toBe(1500);
    expect(res.usage?.cacheCreationInputTokens).toBe(0);
  });

  it('reports cache creation tokens on a cold cache write', async () => {
    createMock.mockResolvedValue(
      mockResponse({ cache_read_input_tokens: 0, cache_creation_input_tokens: 2000 })
    );
    const provider = new ClaudeProvider();
    const res = await provider.complete([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);

    expect(res.usage?.cacheCreationInputTokens).toBe(2000);
    expect(res.usage?.cacheReadInputTokens).toBe(0);
  });

  it('defaults cache counts to zero without throwing when the response returns null', async () => {
    createMock.mockResolvedValue(
      mockResponse({ cache_read_input_tokens: null, cache_creation_input_tokens: null })
    );
    const provider = new ClaudeProvider();
    const res = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(res.usage?.cacheReadInputTokens).toBe(0);
    expect(res.usage?.cacheCreationInputTokens).toBe(0);
  });

  it('still populates standard input/output token usage', async () => {
    const provider = new ClaudeProvider();
    const res = await provider.complete([{ role: 'user', content: 'hi' }]);

    expect(res.content).toBe('hello');
    expect(res.usage?.inputTokens).toBe(100);
    expect(res.usage?.outputTokens).toBe(20);
  });
});
