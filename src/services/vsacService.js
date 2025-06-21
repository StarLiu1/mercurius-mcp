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
   * @returns {Promise<Object>} Value set object with metadata and concepts
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
   * Parse the Purpose field to extract clinical metadata
   * @param {string} purposeText - The Purpose field from VSAC
   * @returns {Object} Parsed metadata
   */
  parsePurposeField(purposeText) {
    if (!purposeText) {
      return {
        clinicalFocus: null,
        dataElementScope: null,
        inclusionCriteria: null,
        exclusionCriteria: null
      };
    }

    const metadata = {
      clinicalFocus: null,
      dataElementScope: null,
      inclusionCriteria: null,
      exclusionCriteria: null
    };

    try {
      // Use regex to extract each component
      const clinicalFocusMatch = purposeText.match(/\(Clinical Focus:\s*([^)]+)\)/i);
      const dataElementScopeMatch = purposeText.match(/\(Data Element Scope:\s*([^)]+)\)/i);
      const inclusionCriteriaMatch = purposeText.match(/\(Inclusion Criteria:\s*([^)]+)\)/i);
      const exclusionCriteriaMatch = purposeText.match(/\(Exclusion Criteria:\s*([^)]+)\)/i);

      if (clinicalFocusMatch) {
        metadata.clinicalFocus = clinicalFocusMatch[1].trim();
      }

      if (dataElementScopeMatch) {
        metadata.dataElementScope = dataElementScopeMatch[1].trim();
      }

      if (inclusionCriteriaMatch) {
        metadata.inclusionCriteria = inclusionCriteriaMatch[1].trim();
      }

      if (exclusionCriteriaMatch) {
        metadata.exclusionCriteria = exclusionCriteriaMatch[1].trim();
      }

      console.error('Parsed purpose metadata:', metadata);
      
    } catch (error) {
      console.error('Error parsing purpose field:', error);
    }

    return metadata;
  }

  /**
   * Parse VSAC XML response into structured data with metadata
   * @param {string} responseXml - XML response from VSAC
   * @returns {Object} Object with metadata and concepts
   */
  parseVsacResponse(responseXml) {
    try {
      console.error('Parsing VSAC XML response...');
      console.error('Response length:', responseXml.length);
      
      const parsed = this.parser.parse(responseXml);
      console.error('Parsed XML structure keys:', Object.keys(parsed));
      
      const result = {
        metadata: {
          id: null,
          displayName: null,
          version: null,
          source: null,
          type: null,
          binding: null,
          status: null,
          revisionDate: null,
          clinicalFocus: null,
          dataElementScope: null,
          inclusionCriteria: null,
          exclusionCriteria: null
        },
        concepts: []
      };

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

      if (valueSets.length === 0) {
        return {
          ...result,
          concepts: [{
            code: 'NO_VALUESET',
            codeSystem: 'N/A',
            codeSystemName: 'VSAC',
            displayName: 'No ValueSet found in response'
          }]
        };
      }

      // Process the first (primary) value set
      const valueSet = valueSets[0];
      console.error('Processing ValueSet with keys:', Object.keys(valueSet));
      
      // Extract metadata from value set attributes and elements
      result.metadata.id = valueSet['@_ID'];
      result.metadata.displayName = valueSet['@_displayName'];
      result.metadata.version = valueSet['@_version'];
      
      // Extract other metadata elements
      if (valueSet['ns0:Source']) {
        result.metadata.source = valueSet['ns0:Source'];
      } else if (valueSet.Source) {
        result.metadata.source = valueSet.Source;
      }
      
      if (valueSet['ns0:Type']) {
        result.metadata.type = valueSet['ns0:Type'];
      } else if (valueSet.Type) {
        result.metadata.type = valueSet.Type;
      }
      
      if (valueSet['ns0:Binding']) {
        result.metadata.binding = valueSet['ns0:Binding'];
      } else if (valueSet.Binding) {
        result.metadata.binding = valueSet.Binding;
      }
      
      if (valueSet['ns0:Status']) {
        result.metadata.status = valueSet['ns0:Status'];
      } else if (valueSet.Status) {
        result.metadata.status = valueSet.Status;
      }
      
      if (valueSet['ns0:RevisionDate']) {
        result.metadata.revisionDate = valueSet['ns0:RevisionDate'];
      } else if (valueSet.RevisionDate) {
        result.metadata.revisionDate = valueSet.RevisionDate;
      }

      // Parse the Purpose field for clinical metadata
      let purposeText = null;
      if (valueSet['ns0:Purpose']) {
        purposeText = valueSet['ns0:Purpose'];
      } else if (valueSet.Purpose) {
        purposeText = valueSet.Purpose;
      }
      
      if (purposeText) {
        const purposeMetadata = this.parsePurposeField(purposeText);
        result.metadata.clinicalFocus = purposeMetadata.clinicalFocus;
        result.metadata.dataElementScope = purposeMetadata.dataElementScope;
        result.metadata.inclusionCriteria = purposeMetadata.inclusionCriteria;
        result.metadata.exclusionCriteria = purposeMetadata.exclusionCriteria;
      }
      
      // Handle concept list
      let conceptList = null;
      
      if (valueSet['ns0:ConceptList']) {
        conceptList = valueSet['ns0:ConceptList'];
      } else if (valueSet.ConceptList) {
        conceptList = valueSet.ConceptList;
      }
      
      if (!conceptList) {
        console.error('No concept list found in ValueSet');
        result.concepts.push({
          code: 'EMPTY_VALUESET',
          codeSystem: 'N/A',
          codeSystemName: 'VSAC',
          displayName: 'ValueSet exists but contains no concepts (may be retired)'
        });
        return result;
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
        const codeSystemVersion = concept['@_codeSystemVersion'];
        const displayName = concept['@_displayName'];
        
        if (code && codeSystem && codeSystemName && displayName) {
          result.concepts.push({
            code: code,
            codeSystem: codeSystem,
            codeSystemName: codeSystemName,
            codeSystemVersion: codeSystemVersion || null,
            displayName: displayName
          });
        } else {
          console.error('Incomplete concept data:', concept);
        }
      }

      console.error(`Successfully parsed ${result.concepts.length} concepts from VSAC response`);
      console.error('Metadata extracted:', result.metadata);
      
      return result;
      
    } catch (error) {
      console.error('Error parsing VSAC XML response:', error);
      console.error('Raw XML that failed to parse:', responseXml.substring(0, 1000));
      
      // Return a diagnostic entry instead of empty result
      return {
        metadata: {
          id: null,
          displayName: 'Parse Error',
          version: null,
          source: null,
          type: null,
          binding: null,
          status: 'ERROR',
          revisionDate: null,
          clinicalFocus: null,
          dataElementScope: null,
          inclusionCriteria: null,
          exclusionCriteria: null
        },
        concepts: [{
          code: 'PARSE_ERROR',
          codeSystem: 'N/A',
          codeSystemName: 'VSAC_PARSER',
          displayName: `XML parsing failed: ${error.message}`
        }]
      };
    }
  }

  /**
   * Get multiple value sets efficiently
   * @param {Array<string>} valueSetIds - Array of value set OIDs
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object>} Object mapping OID to value set objects
   */
  async retrieveMultipleValueSets(valueSetIds, username, password) {
    const results = {};
    
    // Process in parallel but with reasonable concurrency
    const concurrency = 3;
    for (let i = 0; i < valueSetIds.length; i += concurrency) {
      const batch = valueSetIds.slice(i, i + concurrency);
      
      const promises = batch.map(async (oid) => {
        try {
          const valueSetData = await this.retrieveValueSet(oid, null, username, password);
          return { oid, valueSetData };
        } catch (error) {
          console.error(`Failed to retrieve value set ${oid}:`, error.message);
          return { 
            oid, 
            valueSetData: {
              metadata: {
                id: oid,
                displayName: 'Error',
                status: 'ERROR'
              },
              concepts: [],
              error: error.message
            }
          };
        }
      });
      
      const batchResults = await Promise.all(promises);
      for (const result of batchResults) {
        results[result.oid] = result.valueSetData;
      }
    }
    
    return results;
  }

  /**
   * Get only concepts from a value set (backwards compatibility)
   * @param {string} valueSetIdentifier 
   * @param {string} version 
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Array>} Array of concept objects
   */
  async getValueSetConcepts(valueSetIdentifier, version = null, username, password) {
    const valueSetData = await this.retrieveValueSet(valueSetIdentifier, version, username, password);
    return valueSetData.concepts;
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