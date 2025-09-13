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
const sessionStates = {}; // Track initialization state

// Handle standard JSON-RPC initialization
async function handleInitialize(sessionId, request) {
  console.log(`Handling initialize for session ${sessionId}`);
  
  // Create response based on MCP protocol
  const response = {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listSupported: true,
          runSupported: true
        },
        prompts: {
          listSupported: true
        }
      },
      serverInfo: {
        name: "OMOP MCP Server",
        version: "1.0.0"
      }
    }
  };
  
  // Mark session as initialized
  sessionStates[sessionId] = { initialized: true };
  
  return response;
}

// Handle MCP requests with standard JSON-RPC support
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] || randomUUID();
    
    // Handle standard JSON-RPC initialize method
    if (req.body?.method === 'initialize') {
      const response = await handleInitialize(sessionId, req.body);
      return res.json(response);
    }
    
    // Handle initialized notification
    if (req.body?.method === 'notifications/initialized') {
      console.log(`Session ${sessionId} confirmed initialization`);
      sessionStates[sessionId] = { ...sessionStates[sessionId], confirmed: true };
      return res.status(204).send(); // No content for notifications
    }
    
    // For other methods, check if session is initialized
    if (!sessionStates[sessionId]?.initialized && req.body?.method !== 'initialize') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Server not initialized. Send initialize request first.',
        },
        id: req.body?.id || null,
      });
    }
    
    // Create transport and server after initialization is confirmed
    if (!transports[sessionId] && sessionStates[sessionId]?.confirmed) {
      console.log(`Creating transport for confirmed session ${sessionId}`);
      const server = createOMOPServer();
      
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
        delete sessionStates[sessionId];
        console.log(`Session closed: ${sessionId}`);
      };
      
      // Connect server to transport
      await server.connect(transport);
      
      transports[sessionId] = transport;
      servers[sessionId] = server;
      console.log(`Transport ready for session ${sessionId}`);
    }
    
    // Handle tool calls and other methods through transport
    if (transports[sessionId]) {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
    } else if (req.body?.method === 'tools/list') {
      // Handle tools/list without transport (just return available tools)
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        result: {
          tools: [
            { name: 'vsac_valueset_search', description: 'Search VSAC for valuesets' },
            { name: 'vsac_valueset_get', description: 'Get a specific valueset from VSAC' },
            { name: 'omop_concept_search', description: 'Search OMOP concepts' },
            { name: 'omop_concept_map', description: 'Map concepts to OMOP' }
          ]
        }
      });
    } else if (req.body?.method?.startsWith('tools/')) {
      // For actual tool calls, we need the transport
      // Return a more helpful error
      res.status(503).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Tool calls require transport initialization. This is a known issue being fixed.',
        },
        id: req.body?.id || null,
      });
    } else {
      // Handle other JSON-RPC methods that don't need transport
      res.status(501).json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not implemented',
        },
        id: req.body?.id || null,
      });
    }
    
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
    delete sessionStates[sessionId];
    res.status(200).send('Session terminated');
  } else {
    res.status(400).send('Invalid or missing session ID');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'OMOP MCP Server (Enhanced)',
    transport: 'http',
    activeSessions: Object.keys(transports).length,
    initializedSessions: Object.keys(sessionStates).length
  });
});

const PORT = config.server.port || 3000;
app.listen(PORT, () => {
  console.log(`OMOP MCP Server (Enhanced) listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log('Enhanced with standard JSON-RPC initialization support');
});

export default app;