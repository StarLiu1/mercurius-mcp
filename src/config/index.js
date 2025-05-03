require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'openai', // 'openai' or 'anthropic'
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo'
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229'
    }
  }
};