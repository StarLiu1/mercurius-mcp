import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import config from '../config/index.js';

class LLMService {
  constructor() {
    this.provider = config.llm.provider;
    
    if (this.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: config.llm.openai.apiKey
      });
    } else if (this.provider === 'azure-openai') {
      this.client = new OpenAI({
        apiKey: config.llm.azure?.apiKey,
        baseURL: config.llm.azure?.endpoint,
        defaultQuery: { 'api-version': config.llm.azure?.apiVersion || '2024-02-15-preview' },
        defaultHeaders: {
          'api-key': config.llm.azure?.apiKey,
        }
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
    if (this.provider === 'openai' || this.provider === 'azure-openai') {
      return this.createOpenAICompletion(messages, options);
    } else if (this.provider === 'anthropic') {
      return this.createAnthropicCompletion(messages, options);
    }
  }

  async createOpenAICompletion(messages, options) {
    try {
      const model = options.model || 
        (this.provider === 'azure-openai' ? config.llm.azure.model : config.llm.openai.model);
      
      const response = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        ...options
      });
      
      return {
        content: response.choices[0].message.content.trim(),
        usage: response.usage,
        provider: this.provider
      };
    } catch (error) {
      console.error(`${this.provider} API error:`, error);
      throw new Error(`${this.provider} API error: ${error.message}`);
    }
  }

  async createAnthropicCompletion(messages, options) {
    try {
      const systemMessage = messages.find(msg => msg.role === 'system');
      const userMessages = messages.filter(msg => msg.role !== 'system');
      
      const response = await this.client.messages.create({
        model: options.model || config.llm.anthropic.model,
        max_tokens: options.maxTokens || 4096,
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

export default new LLMService();