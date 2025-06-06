import config from "../../config/index.js";

export async function startServer() {
  const transport = process.env.MCP_TRANSPORT || config.mcp?.transport || 'stdio';
  
  switch (transport) {
    case 'stdio':
      console.error("Starting MCP server with stdio transport...");
      await import('./stdio.js');
      break;
      
    case 'http':
      console.error("Starting MCP server with HTTP transport...");
      await import('./http.js');
      break;
      
    default:
      console.error(`Unknown transport: ${transport}. Using stdio.`);
      await import('./stdio.js');
  }
}

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}