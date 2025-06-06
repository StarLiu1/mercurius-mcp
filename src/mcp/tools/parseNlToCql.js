import { z } from "zod";
import { parseToCql } from "./parseNlToCql/parser.js";
import { extractValueSetIdentifiersFromCQL } from "./parseNlToCql/extractors.js";

export function parseNlToCqlTool(server) {
  server.tool(
    "parse-nl-to-cql",
    { query: z.string() },
    async ({ query }) => {
      try {
        const cql = await parseToCql(query);
        const valueSetReferences = await extractValueSetIdentifiersFromCQL(cql);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              cql,
              valueSetReferences
            })
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
}