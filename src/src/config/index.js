require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'openai',
    azureOpenai: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      apiVersion: process.env.OPENAI_API_VERSION || '2024-12-01-preview'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4'
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229'
    }
  }
};