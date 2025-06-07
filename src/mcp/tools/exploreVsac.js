// src/mcp/tools/exploreVsac.js
import { z } from "zod";
import axios from "axios";

export function exploreVsacTool(server) {
  
  // Tool to search for ValueSets by name or partial OID
  server.tool(
    "search-vsac-valuesets",
    {
      searchTerm: z.string(),
      username: z.string(),
      password: z.string(),
      maxResults: z.number().optional().default(10)
    },
    async ({ searchTerm, username, password, maxResults }) => {
      try {
        console.error(`Searching VSAC for: ${searchTerm}`);
        
        // Clean credentials
        const cleanUsername = username.trim();
        const cleanPassword = password.trim();
        const credentials = `${cleanUsername}:${cleanPassword}`;
        const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
        
        // Use VSAC search endpoint
        const searchUrl = 'https://vsac.nlm.nih.gov/vsac/svs/RetrieveMultipleValueSets';
        
        // Try different search strategies
        const searchResults = [];
        
        // Strategy 1: Try as exact OID
        if (searchTerm.match(/^\d+\.\d+\.\d+/)) {
          console.error(`Trying exact OID search: ${searchTerm}`);
          try {
            const response = await axios.get(searchUrl, {
              headers: {
                'Authorization': `Basic ${encoded}`,
                'Accept': 'application/xml'
              },
              params: { id: searchTerm },
              timeout: 15000,
              validateStatus: (status) => status < 500
            });
            
            if (response.status === 200) {
              searchResults.push({
                method: 'exact_oid',
                oid: searchTerm,
                status: 'found',
                responseLength: response.data.length
              });
            } else {
              searchResults.push({
                method: 'exact_oid',
                oid: searchTerm,
                status: 'not_found',
                httpStatus: response.status
              });
            }
          } catch (error) {
            searchResults.push({
              method: 'exact_oid',
              oid: searchTerm,
              status: 'error',
              error: error.message
            });
          }
        }
        
        // Strategy 2: Try without version parameter
        if (searchTerm.match(/^\d+\.\d+\.\d+/)) {
          console.error(`Trying OID without version: ${searchTerm}`);
          try {
            const response = await axios.get(searchUrl, {
              headers: {
                'Authorization': `Basic ${encoded}`,
                'Accept': 'application/xml'
              },
              params: { 
                id: searchTerm,
                // Don't specify version - let VSAC return latest
              },
              timeout: 15000,
              validateStatus: (status) => status < 500
            });
            
            searchResults.push({
              method: 'oid_no_version',
              oid: searchTerm,
              status: response.status === 200 ? 'found' : 'not_found',
              httpStatus: response.status,
              responseLength: response.data?.length
            });
          } catch (error) {
            searchResults.push({
              method: 'oid_no_version',
              oid: searchTerm,
              status: 'error',
              error: error.message
            });
          }
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              searchTerm,
              searchResults,
              recommendations: generateSearchRecommendations(searchTerm, searchResults),
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              searchTerm,
              status: "search_failed"
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  
  // Tool to get ValueSet metadata and versions
  server.tool(
    "get-vsac-metadata",
    {
      valueSetId: z.string(),
      username: z.string(),
      password: z.string()
    },
    async ({ valueSetId, username, password }) => {
      try {
        console.error(`Getting metadata for ValueSet: ${valueSetId}`);
        
        const cleanUsername = username.trim();
        const cleanPassword = password.trim();
        const credentials = `${cleanUsername}:${cleanPassword}`;
        const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
        
        // Try multiple VSAC endpoints to get metadata
        const results = {};
        
        // Try the main retrieve endpoint with different parameters
        const baseUrl = 'https://vsac.nlm.nih.gov/vsac/svs/RetrieveMultipleValueSets';
        
        const testCases = [
          { name: 'no_version', params: { id: valueSetId } },
          { name: 'latest_version', params: { id: valueSetId, version: 'latest' } },
          { name: 'no_params_specified', params: { id: valueSetId, includeInactive: 'true' } }
        ];
        
        for (const testCase of testCases) {
          try {
            console.error(`Testing ${testCase.name} for ${valueSetId}`);
            
            const response = await axios.get(baseUrl, {
              headers: {
                'Authorization': `Basic ${encoded}`,
                'Accept': 'application/xml'
              },
              params: testCase.params,
              timeout: 15000,
              validateStatus: (status) => status < 500
            });
            
            results[testCase.name] = {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              responseLength: response.data?.length || 0,
              responsePreview: response.data?.substring(0, 500) || 'No data'
            };
            
            // If we got a successful response, try to parse it
            if (response.status === 200 && response.data) {
              try {
                const conceptCount = (response.data.match(/<Concept/g) || []).length;
                results[testCase.name].conceptCount = conceptCount;
                results[testCase.name].hasContent = conceptCount > 0;
              } catch (parseError) {
                results[testCase.name].parseError = parseError.message;
              }
            }
            
          } catch (error) {
            results[testCase.name] = {
              error: error.message,
              status: error.response?.status || 'network_error'
            };
          }
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              valueSetId,
              metadataResults: results,
              summary: generateMetadataSummary(results),
              recommendations: generateMetadataRecommendations(valueSetId, results),
              timestamp: new Date().toISOString()
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
              status: "metadata_failed"
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  
  // Tool to validate if a ValueSet OID format is correct
  server.tool(
    "validate-vsac-oid",
    {
      oid: z.string()
    },
    async ({ oid }) => {
      const validation = validateValueSetOid(oid);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            oid,
            validation,
            recommendations: validation.isValid ? 
              ["OID format is valid", "Try fetching without version parameter", "Check if ValueSet exists in VSAC web interface"] :
              validation.issues
          }, null, 2)
        }]
      };
    }
  );
}

function generateSearchRecommendations(searchTerm, results) {
  const recommendations = [];
  
  if (results.length === 0) {
    recommendations.push("No search strategies could be attempted");
    return recommendations;
  }
  
  const foundResults = results.filter(r => r.status === 'found');
  const notFoundResults = results.filter(r => r.status === 'not_found');
  const errorResults = results.filter(r => r.status === 'error');
  
  if (foundResults.length > 0) {
    recommendations.push("✅ ValueSet was found with some search methods");
    recommendations.push("Use the successful method for fetching");
  } else if (notFoundResults.length > 0) {
    recommendations.push("❌ ValueSet not found with any method");
    recommendations.push("Verify the OID exists in VSAC web interface");
    recommendations.push("Check if ValueSet has been retired or moved");
  }
  
  if (errorResults.length > 0) {
    recommendations.push("⚠️ Some search methods failed with errors");
    recommendations.push("Check authentication and network connectivity");
  }
  
  return recommendations;
}

function generateMetadataSummary(results) {
  const summary = {
    totalTests: Object.keys(results).length,
    successfulTests: 0,
    failedTests: 0,
    foundContent: false
  };
  
  for (const [testName, result] of Object.entries(results)) {
    if (result.status === 200) {
      summary.successfulTests++;
      if (result.hasContent) {
        summary.foundContent = true;
      }
    } else {
      summary.failedTests++;
    }
  }
  
  return summary;
}

function generateMetadataRecommendations(valueSetId, results) {
  const recommendations = [];
  
  // Check if any test succeeded
  const successfulTests = Object.entries(results).filter(([name, result]) => result.status === 200);
  
  if (successfulTests.length === 0) {
    recommendations.push("❌ ValueSet not accessible with any method");
    recommendations.push("Verify the OID exists: " + valueSetId);
    recommendations.push("Check VSAC web interface manually");
    recommendations.push("Confirm your account has access to this ValueSet");
  } else {
    const testsWithContent = successfulTests.filter(([name, result]) => result.hasContent);
    
    if (testsWithContent.length > 0) {
      recommendations.push("✅ ValueSet found and contains concepts");
      recommendations.push(`Use method: ${testsWithContent[0][0]}`);
    } else {
      recommendations.push("⚠️ ValueSet found but appears empty");
      recommendations.push("ValueSet may be retired or have no active concepts");
    }
  }
  
  return recommendations;
}

function validateValueSetOid(oid) {
  const validation = {
    isValid: true,
    issues: [],
    format: null,
    suggestions: []
  };
  
  // Check basic OID format
  const oidPattern = /^(\d+\.)*\d+$/;
  if (!oidPattern.test(oid)) {
    validation.isValid = false;
    validation.issues.push("Invalid OID format - should contain only numbers and dots");
    return validation;
  }
  
  // Check if it looks like a VSAC OID
  if (oid.startsWith('2.16.840.1.113883.')) {
    validation.format = 'standard_vsac';
    validation.suggestions.push("Standard VSAC OID format");
  } else {
    validation.format = 'custom_oid';
    validation.suggestions.push("Non-standard OID - verify it exists in VSAC");
  }
  
  // Check length (very short or very long OIDs might be invalid)
  if (oid.length < 10) {
    validation.issues.push("OID seems too short");
  } else if (oid.length > 100) {
    validation.issues.push("OID seems too long");
  }
  
  return validation;
}