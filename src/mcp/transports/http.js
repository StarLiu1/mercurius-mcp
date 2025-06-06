import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOMOPServer } from "../server.js";
import config from "../../config/index.js";

const app = express();
app.use(express.json());

// Store transports by session ID for stateful sessions
const transports = {};
const servers = {};

// Handle MCP requests
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] || randomUUID();
    
    if (!transports[sessionId]) {
      // Create new server instance for this session
      const server = createOMOPServer();
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (id) => {
          console.log(`Session initialized: ${id}`);
        }
      });
      
      // Clean up on close
      transport.onclose = () => {
        delete transports[sessionId];
        delete servers[sessionId];
        console.log(`Session closed: ${sessionId}`);
      };
      
      // Connect server to transport
      await server.connect(transport);
      
      transports[sessionId] = transport;
      servers[sessionId] = server;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res, req.body);
    
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: req.body?.id || null,
      });
    }
  }
});

// Handle SSE for server-to-client notifications
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

// Handle session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId && transports[sessionId]) {
    const transport = transports[sessionId];
    transport.close();
    res.status(200).send('Session terminated');
  } else {
    res.status(400).send('Invalid or missing session ID');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'OMOP MCP Server',
    transport: 'http',
    activeSessions: Object.keys(transports).length
  });
});

const PORT = config.server.port || 3000;
app.listen(PORT, () => {
  console.log(`OMOP MCP Server (HTTP) listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

export default app;