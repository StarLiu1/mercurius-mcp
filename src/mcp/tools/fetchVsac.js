// src/mcp/tools/fetchVsac.js
import { z } from "zod";
import vsacService from "../../services/vsacService.js";

export function fetchVsacTool(server) {
  // server.tool(
  //   "fetch-vsac",
  //   { 
  //     valueSetId: z.string(),
  //     version: z.string().optional(),
  //     username: z.string().optional(),
  //     password: z.string().optional()
  //   },
  //   async ({ valueSetId, version, username, password }) => {
  //     try {
  //       // Check for required credentials
  //       if (!username || !password) {
  //         return {
  //           content: [{
  //             type: "text",
  //             text: JSON.stringify({
  //               error: "VSAC username and password are required",
  //               valueSetId,
  //               status: "authentication_required",
  //               guidance: [
  //                 "Provide your UMLS username and password",
  //                 "Ensure your UMLS account has VSAC access enabled",
  //                 "Test credentials using the debug-vsac-auth tool first"
  //               ]
  //             }, null, 2)
  //           }],
  //           isError: true
  //         };
  //       }

  //       console.error(`Fetching VSAC value set: ${valueSetId}`);
        
  //       const concepts = await vsacService.retrieveValueSet(
  //         valueSetId, 
  //         version, 
  //         username, 
  //         password
  //       );
        
  //       const result = {
  //         valueSetId,
  //         version: version || "latest",
  //         conceptCount: concepts.length,
  //         concepts: concepts,
  //         codeSystemsFound: [...new Set(concepts.map(c => c.codeSystemName))],
  //         status: "success",
  //         retrievedAt: new Date().toISOString()
  //       };
        
  //       console.error(`Successfully retrieved ${concepts.length} concepts for ${valueSetId}`);
        
  //       return {
  //         content: [{
  //           type: "text",
  //           text: JSON.stringify(result, null, 2)
  //         }]
  //       };
        
  //     } catch (error) {
  //       console.error(`VSAC fetch error for ${valueSetId}:`, error.message);
        
  //       const errorResponse = {
  //         error: error.message,
  //         valueSetId,
  //         version: version || "latest",
  //         status: "failed",
  //         timestamp: new Date().toISOString()
  //       };
        
  //       // Add specific guidance for common errors
  //       if (error.message.includes('401') || error.message.includes('authentication')) {
  //         errorResponse.guidance = [
  //           "Authentication failed - check your UMLS credentials",
  //           "Verify credentials using: debug-vsac-auth tool",
  //           "Ensure VSAC access is enabled in your UMLS profile",
  //           "Check for extra whitespace in username/password"
  //         ];
  //       }
        
  //       return {
  //         content: [{
  //           type: "text",
  //           text: JSON.stringify(errorResponse, null, 2)
  //         }],
  //         isError: true
  //       };
  //     }
  //   }
  // );

  // Additional tool for batch fetching multiple value sets
  server.tool(
    "fetch-multiple-vsac",
    {
      valueSetIds: z.array(z.string()),
      username: z.string().optional().default(process.env.VSAC_USERNAME || ''),
      password: z.string().optional().default(process.env.VSAC_PASSWORD || '')
    },
    async ({ valueSetIds, username, password }) => {
      try {
        // Validate credentials
        if (!username || !password) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "VSAC credentials are required",
                message: "Set VSAC_USERNAME and VSAC_PASSWORD environment variables, or pass them as parameters",
                environmentVariables: {
                  VSAC_USERNAME: process.env.VSAC_USERNAME ? "SET" : "NOT SET",
                  VSAC_PASSWORD: process.env.VSAC_PASSWORD ? "SET" : "NOT SET"
                },
                valueSetIds
              }, null, 2)
            }],
            isError: true
          };
        }

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
          credentialsUsed: {
            username: username,
            fromEnvironment: {
              username: username === process.env.VSAC_USERNAME,
              password: password === process.env.VSAC_PASSWORD
            }
          },
          retrievedAt: new Date().toISOString()
        };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(summary, null, 2)
          }]
        };
        
      } catch (error) {
        const errorResponse = {
          error: error.message,
          valueSetIds,
          status: "batch_failed",
          credentialsChecked: {
            username: username ? "PROVIDED" : "MISSING",
            password: password ? "PROVIDED" : "MISSING"
          },
          timestamp: new Date().toISOString()
        };
        
        if (error.message.includes('401') || error.message.includes('authentication')) {
          errorResponse.guidance = [
            "Authentication failed during batch operation",
            "Verify VSAC_USERNAME and VSAC_PASSWORD environment variables",
            "Test credentials using debug-vsac-auth tool",
            "Check UMLS account status and VSAC access"
          ];
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(errorResponse, null, 2)
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
            environmentVariables: {
              VSAC_USERNAME: process.env.VSAC_USERNAME ? "SET" : "NOT SET",
              VSAC_PASSWORD: process.env.VSAC_PASSWORD ? "SET" : "NOT SET"
            },
            status: "cache_info"
          }, null, 2)
        }]
      };
    }
  );
}