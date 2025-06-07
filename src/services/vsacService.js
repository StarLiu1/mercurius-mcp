// src/services/vsacService.js
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { handleVsacError, getVsacErrorGuidance } from '../utils/vsacErrorHandler.js';

class VSACService {
  constructor() {
    this.baseUrl = 'https://vsac.nlm.nih.gov/vsac/svs/';
    this.cache = new Map(); // In-memory cache for value sets
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
  }

  /**
   * Retrieve value set from VSAC with caching
   * @param {string} valueSetIdentifier - OID or name of the value set
   * @param {string} version - Optional version (defaults to latest)
   * @param {string} username - VSAC username
   * @param {string} password - VSAC password
   * @returns {Promise<Array>} Array of concept objects
   */
  async retrieveValueSet(valueSetIdentifier, version = null, username, password) {
    const cacheKey = `${valueSetIdentifier}_${version || 'latest'}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.error(`Cache hit for value set: ${valueSetIdentifier}`);
      return this.cache.get(cacheKey);
    }

    console.error(`Fetching value set from VSAC: ${valueSetIdentifier}`);
    
    try {
      const endpoint = this.baseUrl + 'RetrieveMultipleValueSets';
      const basicAuth = this.createBasicAuth(username, password);
      
      const params = { id: valueSetIdentifier };
      if (version) {
        params.version = version;
      }

      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': basicAuth,
          'Accept': 'application/xml'
        },
        params: params,
        timeout: 30000 // 30 second timeout
      });

      console.error(`VSAC response status: ${response.status}`);
      const parsedData = this.parseVsacResponse(response.data);
      
      // Cache the result
      this.cache.set(cacheKey, parsedData);
      
      return parsedData;
      
    } catch (error) {
      console.error(`Error querying VSAC for ValueSet ${valueSetIdentifier}:`, error.message);
      
      // Use the error handler for better error messages
      try {
        handleVsacError(error, valueSetIdentifier);
      } catch (vsacError) {
        // Add helpful guidance to the error
        const guidance = getVsacErrorGuidance(vsacError);
        vsacError.guidance = guidance;
        throw vsacError;
      }
    }
  }

  /**
   * Create basic authentication header
   * @param {string} username 
   * @param {string} password 
   * @returns {string} Basic auth header value
   */
  createBasicAuth(username, password) {
    if (!username || !password) {
      throw new Error('VSAC username and password are required');
    }
    
    // Clean the credentials to remove any whitespace/newlines
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    
    const credentials = `${cleanUsername}:${cleanPassword}`;
    const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
    
    console.error(`Creating Basic Auth for user: ${cleanUsername}`);
    console.error(`Encoded credentials length: ${encoded.length}`);
    
    return `Basic ${encoded}`;
  }

  /**
   * Parse VSAC XML response into structured concept data
   * @param {string} responseXml - XML response from VSAC
   * @returns {Array} Array of concept objects
   */
  parseVsacResponse(responseXml) {
    try {
      console.error('Parsing VSAC XML response...');
      console.error('Response length:', responseXml.length);
      
      const parsed = this.parser.parse(responseXml);
      console.error('Parsed XML structure keys:', Object.keys(parsed));
      
      const concepts = [];

      // Handle the actual VSAC XML structure
      let valueSets = [];
      
      if (parsed?.['ns0:RetrieveMultipleValueSetsResponse']) {
        const response = parsed['ns0:RetrieveMultipleValueSetsResponse'];
        console.error('Found ns0:RetrieveMultipleValueSetsResponse');
        
        if (response['ns0:DescribedValueSet']) {
          valueSets = Array.isArray(response['ns0:DescribedValueSet']) 
            ? response['ns0:DescribedValueSet'] 
            : [response['ns0:DescribedValueSet']];
        }
      } else if (parsed?.RetrieveMultipleValueSetsResponse) {
        const response = parsed.RetrieveMultipleValueSetsResponse;
        console.error('Found RetrieveMultipleValueSetsResponse');
        
        if (response.DescribedValueSet) {
          valueSets = Array.isArray(response.DescribedValueSet) 
            ? response.DescribedValueSet 
            : [response.DescribedValueSet];
        } else if (response.ValueSet) {
          valueSets = Array.isArray(response.ValueSet) ? response.ValueSet : [response.ValueSet];
        }
      }
      
      console.error(`Found ${valueSets.length} value sets in response`);

      for (const valueSet of valueSets) {
        console.error('Processing ValueSet with keys:', Object.keys(valueSet));
        
        // Handle different concept list structures
        let conceptList = null;
        
        if (valueSet['ns0:ConceptList']) {
          conceptList = valueSet['ns0:ConceptList'];
        } else if (valueSet.ConceptList) {
          conceptList = valueSet.ConceptList;
        }
        
        if (!conceptList) {
          console.error('No concept list found in ValueSet');
          // Return diagnostic info for empty ValueSets
          concepts.push({
            code: 'EMPTY_VALUESET',
            codeSystem: 'N/A',
            codeSystemName: 'VSAC',
            displayName: 'ValueSet exists but contains no concepts (may be retired)'
          });
          continue;
        }

        // Extract concepts from the concept list
        let vsaConcepts = [];
        
        if (conceptList['ns0:Concept']) {
          vsaConcepts = Array.isArray(conceptList['ns0:Concept']) 
            ? conceptList['ns0:Concept'] 
            : [conceptList['ns0:Concept']];
        } else if (conceptList.Concept) {
          vsaConcepts = Array.isArray(conceptList.Concept) 
            ? conceptList.Concept 
            : [conceptList.Concept];
        }
        
        console.error(`Found ${vsaConcepts.length} concepts in ConceptList`);

        for (const concept of vsaConcepts) {
          // Handle the VSAC XML attribute structure
          const code = concept['@_code'];
          const codeSystem = concept['@_codeSystem'];
          const codeSystemName = concept['@_codeSystemName'];
          const displayName = concept['@_displayName'];
          
          if (code && codeSystem && codeSystemName && displayName) {
            concepts.push({
              code: code,
              codeSystem: codeSystem,
              codeSystemName: codeSystemName,
              displayName: displayName
            });
          } else {
            console.error('Incomplete concept data:', concept);
          }
        }
      }

      console.error(`Successfully parsed ${concepts.length} concepts from VSAC response`);
      return concepts;
      
    } catch (error) {
      console.error('Error parsing VSAC XML response:', error);
      console.error('Raw XML that failed to parse:', responseXml.substring(0, 1000));
      
      // Return a diagnostic entry instead of empty array
      return [{
        code: 'PARSE_ERROR',
        codeSystem: 'N/A',
        codeSystemName: 'VSAC_PARSER',
        displayName: `XML parsing failed: ${error.message}`
      }];
    }
  }

  /**
   * Get multiple value sets efficiently
   * @param {Array<string>} valueSetIds - Array of value set OIDs
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object>} Object mapping OID to concept arrays
   */
  async retrieveMultipleValueSets(valueSetIds, username, password) {
    const results = {};
    
    // Process in parallel but with reasonable concurrency
    const concurrency = 3;
    for (let i = 0; i < valueSetIds.length; i += concurrency) {
      const batch = valueSetIds.slice(i, i + concurrency);
      
      const promises = batch.map(async (oid) => {
        try {
          const concepts = await this.retrieveValueSet(oid, null, username, password);
          return { oid, concepts };
        } catch (error) {
          console.error(`Failed to retrieve value set ${oid}:`, error.message);
          return { oid, concepts: [], error: error.message };
        }
      });
      
      const batchResults = await Promise.all(promises);
      for (const result of batchResults) {
        results[result.oid] = result.concepts;
      }
    }
    
    return results;
  }

  /**
   * Clear cache (useful for testing or memory management)
   */
  clearCache() {
    this.cache.clear();
    console.error('VSAC cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export default new VSACService();