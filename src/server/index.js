const express = require('express');
const bodyParser = require('body-parser');
const toolRoutes = require('./routes/tools.routes');
const configRoutes = require('./routes/config.routes');  // Add this
const healthRoutes = require('./routes/health.routes');
const errorHandler = require('./middleware/errorHandler');
const config = require('../config');

const app = express();

app.use(bodyParser.json());

// Routes
app.use('/tools', toolRoutes);
app.use('/config', configRoutes);  // Add this
app.use('/health', healthRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`MCP server running on port ${PORT}`);
  console.log(`Using LLM provider: ${config.llm.provider}`);
});

module.exports = app;