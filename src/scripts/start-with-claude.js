// Set Claude as the provider and start the server
process.env.LLM_PROVIDER = 'anthropic';
require('../src/server');