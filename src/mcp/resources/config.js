import config from "../../config/index.js";

export function configResource(server) {
  server.resource(
    "config",
    "config://current",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          llmProvider: config.llm.provider,
          version: "1.0.0",
          capabilities: ["nl-to-cql", "vsac-integration", "omop-mapping", "sql-generation"]
        })
      }]
    })
  );
}