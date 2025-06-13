import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseNlToCqlTool } from "./tools/parseNlToCql.js";
// import { processCqlQueryTool } from "./tools/processCqlQuery.js";
import { fetchVsacTool } from "./tools/fetchVsac.js";
// import { debugVsacTool } from "./tools/debugVsac.js";
// import { exploreVsacTool } from "./tools/exploreVsac.js";
import { mapToOmopTool } from "./tools/mapToOmop.js";
import { generateSqlTool } from "./tools/generateSql.js";

import { configResource } from "./resources/config.js";
import { schemaResource } from "./resources/schema.js";

export function createOMOPServer() {
  const server = new McpServer({
    name: "OMOP-NLP-Translator",
    version: "1.0.0"
  });

  // Register tools
  parseNlToCqlTool(server);
  // processCqlQueryTool(server);
  fetchVsacTool(server);
  // debugVsacTool(server);      // Authentication debugging
  // exploreVsacTool(server);    // ValueSet exploration and search
  mapToOmopTool(server);
  generateSqlTool(server);

  // Register resources
  configResource(server);
  schemaResource(server);

  return server;
}