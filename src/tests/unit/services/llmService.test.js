const LLMService = require('../../../src/services/llmService');
const config = require('../../../src/config');

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');

describe('LLMService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates OpenAI completion when provider is openai', async () => {
    config.llm.provider = 'openai';
    const mockResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };
    
    // Mock OpenAI client
    const OpenAI = require('openai');
    OpenAI.mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue(mockResponse)
        }
      }
    }));
    
    const service = new LLMService();
    const result = await service.createCompletion([
      { role: 'user', content: 'Test message' }
    ]);
    
    expect(result.content).toBe('Test response');
    expect(result.provider).toBe('openai');
  });

  test('creates Anthropic completion when provider is anthropic', async () => {
    config.llm.provider = 'anthropic';
    const mockResponse = {
      content: [{ text: 'Test response' }],
      usage: { input_tokens: 10, output_tokens: 20 }
    };
    
    // Mock Anthropic client
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue(mockResponse)
      }
    }));
    
    const service = new LLMService();
    const result = await service.createCompletion([
      { role: 'user', content: 'Test message' }
    ]);
    
    expect(result.content).toBe('Test response');
    expect(result.provider).toBe('anthropic');
  });
});