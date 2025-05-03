const express = require('express');
const bodyParser = require('body-parser'); // Don't forget to install this
const config = require('../config');
const toolRoutes = require('./routes/tools.routes');

const app = express();
app.use(bodyParser.json()); // Add this line

// Add the tools routes
app.use('/tools', toolRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    provider: config.llm.provider,
    endpoint: config.llm.azureOpenai.endpoint
  });
});

// Test Azure OpenAI endpoint
app.get('/test-azure', async (req, res) => {
  try {
    const llmService = require('../services/llmService');
    const result = await llmService.createCompletion([
      { role: 'user', content: 'Say hello!' }
    ]);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
  console.log(`Using LLM provider: ${config.llm.provider}`);
  if (config.llm.provider === 'azure-openai') {
    console.log(`Azure endpoint: ${config.llm.azureOpenai.endpoint}`);
  }
});