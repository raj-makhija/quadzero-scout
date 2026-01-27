import 'dotenv/config';
import { getLLMProvider } from '../src/lib/llm/index.js';

async function main() {
  console.log('Testing LLM Integration (minimal - 1 request only)...\n');

  const provider = getLLMProvider();
  console.log(`Using provider: ${provider.name}`);
  console.log('---\n');

  try {
    // Simple test - just ask for a JSON response
    const response = await provider.complete([
      { role: 'system', content: 'Respond only with valid JSON.' },
      { role: 'user', content: 'Return: {"status": "ok", "provider": "gemini"}' },
    ], { maxTokens: 100, temperature: 0 });

    console.log('Response:', response.content);
    console.log('Usage:', response.usage);
    console.log('\nLLM integration test PASSED!');
  } catch (error) {
    console.error('LLM integration test FAILED:', error);
    process.exit(1);
  }
}

main();
