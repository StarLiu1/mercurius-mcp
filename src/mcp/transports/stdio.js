#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOMOPServer } from "../server.js";

async function main() {
  try {
    // Use stderr for all debug messages to avoid corrupting stdout
    console.error("OMOP MCP Server starting via stdio...");
    
    const server = createOMOPServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    
    console.error("OMOP MCP Server connected via stdio");
  } catch (error) {
    console.error("Failed to start OMOP MCP Server:", error);
    process.exit(1);
  }
}

main();