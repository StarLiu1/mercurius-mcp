// src/mcp/tools/fetchVsac.js
import { z } from "zod";
import vsacService from "../../services/vsacService.js";

export function fetchVsacTool(server) {
  server.tool(
    "fetch-vsac",
    { 
      valueSetId: z.string(),
      version: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional()
    },
    async ({ valueSetId, version, username, password }) => {
      try {
        // Check for required credentials
        if (!username || !password) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "VSAC username and password are required",
                valueSetId,
                status: "authentication_required"
              })
            }],
            isError: true
          };
        }

        console.error(`Fetching VSAC value set: ${valueSetId}`);
        
        const concepts = await vsacService.retrieveValueSet(
          valueSetId, 
          version, 
          username, 
          password
        );
        
        const result = {
          valueSetId,
          version: version || "Latest",
          conceptCount: concepts.length,
          concepts: concepts,
          codeSystemsFound: [...new Set(concepts.map(c => c.codeSystemName))],
          status: "success",
          retrievedAt: new Date().toISOString()
        };
        
        console.error(`Successfully retrieved ${concepts.length} concepts for ${valueSetId}`);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
        
      } catch (error) {
        console.error(`VSAC fetch error for ${valueSetId}:`, error.message);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              valueSetId,
              version: version || "Latest",
              status: "failed",
              timestamp: new Date().toISOString()
            })
          }],
          isError: true
        };
      }
    }
  );

  // Additional tool for batch fetching multiple value sets
  server.tool(
    "fetch-multiple-vsac",
    {
      valueSetIds: z.array(z.string()),
      username: z.string(),
      password: z.string()
    },
    async ({ valueSetIds, username, password }) => {
      try {
        console.error(`Batch fetching ${valueSetIds.length} VSAC value sets`);
        
        const results = await vsacService.retrieveMultipleValueSets(
          valueSetIds,
          username,
          password
        );
        
        const summary = {
          totalRequested: valueSetIds.length,
          successfulRetrievals: Object.keys(results).filter(oid => results[oid].length > 0).length,
          totalConcepts: Object.values(results).flat().length,
          results: results,
          retrievedAt: new Date().toISOString()
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(summary, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              valueSetIds,
              status: "batch_failed"
            })
          }],
          isError: true
        };
      }
    }
  );

  // Tool to check VSAC cache status
  server.tool(
    "vsac-cache-status",
    {},
    async () => {
      const stats = vsacService.getCacheStats();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cacheSize: stats.size,
            cachedValueSets: stats.keys,
            status: "cache_info"
          }, null, 2)
        }]
      };
    }
  );
}