// src/mcp/tools/parseNlToCql/extractors.js

/**
 * Extract ValueSet OID identifiers from CQL query using valueset declaration pattern
 * Pattern: (valueset\s")(.+)(":\s')(urn:oid:)((\d+\.)*\d+)(')
 * Extracts group 5: the OID part and group 2: the name
 * @param {string} cqlQuery - The CQL query string
 * @returns {Promise<Object>} Object with oids array and valuesets array with name/oid pairs
 */
export async function extractValueSetIdentifiersFromCQL(cqlQuery) {
  try {
    console.error("Extracting ValueSet OIDs using valueset declaration pattern...");
    
    // Input validation
    if (!cqlQuery || typeof cqlQuery !== 'string') {
      console.error("Invalid CQL query input:", typeof cqlQuery);
      return { oids: [], valuesets: [] };
    }
    
    const oids = new Set(); // Use Set to avoid duplicates
    const valuesets = []; // Array to store name/oid pairs
    
    // Updated Pattern: (valueset\s")(.+)(":\s')(urn:oid:)((\d+\.)*\d+)(')
    // Group 1: valueset "
    // Group 2: name (what we want to extract)
    // Group 3: ": '
    // Group 4: urn:oid:
    // Group 5: the OID we want to extract
    // Group 6: closing quote
    const valuesetPattern = /(valueset\s")(.+)(":\s')(urn:oid:)((\d+\.)*\d+)(')/gi;
    let match;
    
    while ((match = valuesetPattern.exec(cqlQuery)) !== null) {
      const name = match[2]; // Extract group 2 - the name
      const oid = match[5]; // Extract group 5 - the OID part
      
      if (oid && typeof oid === 'string' && name && typeof name === 'string') {
        oids.add(oid);
        valuesets.push({
          name: name.trim(),
          oid: oid.trim()
        });
        console.error(`Found valueset declaration: "${name}" -> ${oid}`);
      }
    }
    
    // Convert Set to Array and log results
    const oidArray = Array.from(oids);
    console.error(`Total unique OIDs extracted: ${oidArray.length}`);
    console.error(`Total valuesets with names: ${valuesets.length}`);
    console.error(`OIDs found: ${JSON.stringify(oidArray)}`);
    
    // Return both arrays
    return {
      oids: Array.isArray(oidArray) ? oidArray : [],
      valuesets: Array.isArray(valuesets) ? valuesets : []
    };
    
  } catch (error) {
    console.error("Error extracting ValueSet OIDs:", error);
    return { oids: [], valuesets: [] };
  }
}

/**
 * Validate that extracted OIDs follow proper format
 * @param {string[]} oids - Array of OID strings
 * @returns {string[]} Array of valid OIDs
 */
export function validateExtractedOids(oids) {
  // Handle undefined, null, or non-array inputs
  if (!oids || !Array.isArray(oids)) {
    console.error("validateExtractedOids: Invalid input, expected array but got:", typeof oids);
    return [];
  }
  
  const validOidPattern = /^\d+(?:\.\d+)+$/;
  
  return oids.filter(oid => {
    // Ensure each oid is a string before testing
    if (typeof oid !== 'string') {
      console.error("validateExtractedOids: Non-string OID found:", oid);
      return false;
    }
    return validOidPattern.test(oid);
  });
}

/**
 * Extract and validate ValueSet OIDs with detailed reporting
 * @param {string} cqlQuery - The CQL query string
 * @returns {Promise<Object>} Extraction results with validation
 */
export async function extractAndValidateValueSets(cqlQuery) {
  // Add safety check for cqlQuery
  if (!cqlQuery || typeof cqlQuery !== 'string') {
    console.error("extractAndValidateValueSets: Invalid CQL query input:", typeof cqlQuery);
    return {
      totalFound: 0,
      validOids: [],
      invalidOids: [],
      allExtracted: [],
      valuesets: [],
      hasValueSets: false,
      validCount: 0,
      invalidCount: 0
    };
  }
  
  const extractionResult = await extractValueSetIdentifiersFromCQL(cqlQuery);
  const extractedOids = extractionResult.oids;
  const valuesets = extractionResult.valuesets;
  
  const validOids = validateExtractedOids(extractedOids);
  const invalidOids = extractedOids.filter(oid => !validOids.includes(oid));
  
  return {
    totalFound: extractedOids.length,
    validOids: validOids,
    invalidOids: invalidOids,
    allExtracted: extractedOids,
    valuesets: valuesets,
    hasValueSets: extractedOids.length > 0,
    validCount: validOids.length,
    invalidCount: invalidOids.length
  };
}

/**
 * Test function to demonstrate regex pattern on sample CQL
 * @param {string} sampleCql - Sample CQL for testing
 * @returns {Object} Test results
 */
export function testOidExtraction(sampleCql) {
  console.error("Testing OID extraction on sample CQL...");
  console.error("Sample CQL:", sampleCql);
  
  const results = {
    input: sampleCql,
    patternUsed: "(valueset\\s\".+\":\\s')(urn:oid:)((\\d+\\.)*\\d+)(')",
    patternDescription: "Matches valueset declarations with single quotes and extracts group 3 (OID)",
    matches: []
  };
  
  // Test the valueset declaration pattern
  const valuesetPattern = /(valueset\s".+":\s')(urn:oid:)((\d+\.)*\d+)(')/gi;
  let match;
  while ((match = valuesetPattern.exec(sampleCql)) !== null) {
    results.matches.push({
      fullMatch: match[0],
      group1: match[1], // valueset "name": '
      group2: match[2], // urn:oid:
      group3: match[3], // OID (what we extract)
      group4: match[4], // '
      index: match.index,
      extractedOid: match[3]
    });
  }
  
  return results;
}