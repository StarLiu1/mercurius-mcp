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
    // Get or generate session ID
    let sessionId = req.headers['mcp-session-id'];
    const isNewSession = !sessionId;
    
    if (isNewSession) {
      sessionId = randomUUID();
      console.log(`Creating new session: ${sessionId}`);
    }
    
    // Create transport and server if they don't exist
    if (!transports[sessionId]) {
      console.log(`Creating transport and server for session: ${sessionId}`);
      
      // Create new server instance for this session
      const server = createOMOPServer();
      
      // Create transport with proper configuration
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (id) => {
          console.log(`Transport session initialized: ${id}`);
        }
      });
      
      // Clean up on close
      transport.onclose = () => {
        delete transports[sessionId];
        delete servers[sessionId];
        console.log(`Session closed: ${sessionId}`);
      };
      
      // Connect server to transport BEFORE handling any requests
      await server.connect(transport);
      console.log(`Server connected to transport for session: ${sessionId}`);
      
      transports[sessionId] = transport;
      servers[sessionId] = server;
    }
    
    // Get the transport
    const transport = transports[sessionId];
    
    // For new sessions, add session ID to response headers
    if (isNewSession) {
      res.setHeader('Mcp-Session-Id', sessionId);
    }
    
    // Let the transport handle ALL requests, including initialization
    console.log(`Handling ${req.body?.method || 'unknown'} request for session: ${sessionId}`);
    await transport.handleRequest(req, res, req.body);
    
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: error.message
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
    service: 'OMOP MCP Server (Fixed)',
    transport: 'http',
    activeSessions: Object.keys(transports).length,
    version: '1.0.1'
  });
});

// Debug endpoint to list active sessions
app.get('/debug/sessions', (req, res) => {
  res.json({
    activeSessions: Object.keys(transports),
    count: Object.keys(transports).length
  });
});

const PORT = config.server.port || 3000;
app.listen(PORT, () => {
  console.log(`OMOP MCP Server (Fixed) listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Debug sessions: http://localhost:${PORT}/debug/sessions`);
  console.log('Fixed version with proper StreamableHTTPServerTransport initialization');
});