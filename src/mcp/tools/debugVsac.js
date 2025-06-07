// src/mcp/tools/debugVsac.js
import { z } from "zod";
import axios from "axios";

export function debugVsacTool(server) {
  server.tool(
    "debug-vsac-auth",
    {
      username: z.string(),
      password: z.string()
    },
    async ({ username, password }) => {
      try {
        // Clean credentials
        const cleanUsername = username.trim();
        const cleanPassword = password.trim();
        
        console.error(`Debug: Testing VSAC auth for user: ${cleanUsername}`);
        console.error(`Debug: Password length: ${cleanPassword.length}`);
        
        // Create credentials and test encoding
        const credentials = `${cleanUsername}:${cleanPassword}`;
        const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
        
        console.error(`Debug: Credentials string length: ${credentials.length}`);
        console.error(`Debug: Base64 encoded length: ${encoded.length}`);
        console.error(`Debug: First 20 chars of encoded: ${encoded.substring(0, 20)}...`);
        
        // Test with a simple VSAC endpoint first
        const testUrl = 'https://vsac.nlm.nih.gov/vsac/svs/RetrieveMultipleValueSets';
        const authHeader = `Basic ${encoded}`;
        
        const debugInfo = {
          username: cleanUsername,
          passwordLength: cleanPassword.length,
          credentialsLength: credentials.length,
          encodedLength: encoded.length,
          authHeaderLength: authHeader.length,
          testUrl: testUrl
        };
        
        console.error('Debug info:', debugInfo);
        
        // Make test request with minimal parameters
        try {
          const response = await axios.get(testUrl, {
            headers: {
              'Authorization': authHeader,
              'Accept': 'application/xml',
              'User-Agent': 'OMOP-MCP/1.0'
            },
            params: {
              // Use a known good test value set OID
              id: '2.16.840.1.113883.3.464.1003.104.12.1011'
            },
            timeout: 15000,
            validateStatus: function (status) {
              // Accept any status for debugging purposes
              return status < 500;
            }
          });
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                debugInfo: debugInfo,
                responsePreview: response.data ? response.data.substring(0, 500) : 'No response data'
              }, null, 2)
            }]
          };
          
        } catch (requestError) {
          const errorDetails = {
            success: false,
            error: requestError.message,
            status: requestError.response?.status,
            statusText: requestError.response?.statusText,
            responseHeaders: requestError.response?.headers,
            debugInfo: debugInfo
          };
          
          if (requestError.response?.data) {
            errorDetails.responseData = requestError.response.data.substring(0, 1000);
          }
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(errorDetails, null, 2)
            }],
            isError: requestError.response?.status === 401
          };
        }
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              type: 'unexpected_error'
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  
  // Tool to inspect raw VSAC XML responses
  server.tool(
    "inspect-vsac-xml",
    {
      valueSetId: z.string(),
      username: z.string(),
      password: z.string()
    },
    async ({ valueSetId, username, password }) => {
      try {
        console.error(`Inspecting raw XML for ValueSet: ${valueSetId}`);
        
        const cleanUsername = username.trim();
        const cleanPassword = password.trim();
        const credentials = `${cleanUsername}:${cleanPassword}`;
        const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
        
        const response = await axios.get('https://vsac.nlm.nih.gov/vsac/svs/RetrieveMultipleValueSets', {
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Accept': 'application/xml'
          },
          params: { id: valueSetId },
          timeout: 15000
        });
        
        const rawXml = response.data;
        
        // Try to parse it to see the structure
        let parseAttempt = null;
        try {
          const { XMLParser } = await import('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          parseAttempt = parser.parse(rawXml);
        } catch (parseError) {
          parseAttempt = { parseError: parseError.message };
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              valueSetId,
              status: "success",
              rawXmlLength: rawXml.length,
              rawXmlPreview: rawXml.substring(0, 1000),
              fullRawXml: rawXml, // Include full XML for debugging
              parsedStructure: parseAttempt,
              httpStatus: response.status,
              contentType: response.headers['content-type']
            }, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              valueSetId,
              status: "failed"
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}