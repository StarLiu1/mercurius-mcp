class LLMError extends Error {
    constructor(message, provider, originalError) {
      super(message);
      this.name = 'LLMError';
      this.provider = provider;
      this.originalError = originalError;
    }
  }
  
  class OpenAIError extends LLMError {
    constructor(message, originalError) {
      super(message, 'openai', originalError);
      this.name = 'OpenAIError';
    }
  }
  
  class AnthropicError extends LLMError {
    constructor(message, originalError) {
      super(message, 'anthropic', originalError);
      this.name = 'AnthropicError';
    }
  }
  
  module.exports = {
    LLMError,
    OpenAIError,
    AnthropicError
  };