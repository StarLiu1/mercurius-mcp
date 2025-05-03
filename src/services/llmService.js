const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

class LLMService {
  constructor() {
    this.provider = config.llm.provider;
    
    if (this.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: config.llm.openai.apiKey
      });
    } else if (this.provider === 'anthropic') {
      this.client = new Anthropic({
        apiKey: config.llm.anthropic.apiKey
      });
    } else {
      throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  async createCompletion(messages, options = {}) {
    if (this.provider === 'openai') {
      return this.createOpenAICompletion(messages, options);
    } else if (this.provider === 'anthropic') {
      return this.createAnthropicCompletion(messages, options);
    }
  }

  async createOpenAICompletion(messages, options) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || config.llm.openai.model,
        messages: messages,
        // temperature: options.temperature || 0.7,
        ...options
      });
      
      return {
        content: response.choices[0].message.content.trim(),
        usage: response.usage,
        provider: 'openai'
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async createAnthropicCompletion(messages, options) {
    try {
      // Convert OpenAI message format to Claude format
      const systemMessage = messages.find(msg => msg.role === 'system');
      const userMessages = messages.filter(msg => msg.role !== 'system');
      
      const response = await this.client.messages.create({
        model: options.model || config.llm.anthropic.model,
        max_completion_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
        system: systemMessage ? systemMessage.content : undefined,
        messages: userMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        ...options
      });
      
      return {
        content: response.content[0].text.trim(),
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        },
        provider: 'anthropic'
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

module.exports = new LLMService();