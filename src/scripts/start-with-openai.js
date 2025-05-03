// Set OpenAI as the provider and start the server
process.env.LLM_PROVIDER = 'openai';
require('../src/server');