import { z } from "zod";
import llmService from '../../services/llmService.js';

export function processCqlQueryTool(server) {
  server.tool(
    "process-cql-query",
    { 
      cqlQuery: z.string(),
      vsacUsername: z.string().optional(),
      vsacPassword: z.string().optional()
    },
    async ({ cqlQuery, vsacUsername, vsacPassword }) => {
      try {
        // Use stderr for debug logs to avoid corrupting MCP stdout
        console.error("Starting full CQL processing pipeline...");
        
        // Step 1: Extract ValueSet OIDs from the input CQL
        const oidList = await extractValueSetIdentifiersFromCQL(cqlQuery);
        console.error("Extracted ValueSet OIDs:", oidList);
        
        if (oidList.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                step: "No ValueSets found",
                message: "No ValueSet OIDs found in CQL query. This may be a simple query without value sets.",
                cqlQuery,
                finalSql: "-- No VSAC mapping needed for this query"
              })
            }]
          };
        }
        
        // Step 2-5: Process each OID through the pipeline
        const omopConceptMapping = {};
        
        for (const oid of oidList) {
          console.error(`Processing ValueSet OID: ${oid}`);
          
          // Step 2: Query VSAC to obtain structured concept data
          const vsacData = await queryVsacStructured(oid, vsacUsername, vsacPassword);
          console.error(`VSAC data for ${oid}:`, vsacData.length, "concepts");
          
          if (vsacData.length === 0) {
            console.error(`No VSAC data found for OID: ${oid}`);
            continue;
          }
          
          // Step 3: Map VSAC codeSystemNames to OMOP vocabulary IDs
          const allCodeSystems = [...new Set(vsacData.map(entry => entry.codeSystemName))];
          const dynamicMapping = await dynamicMapVsacToOmop(allCodeSystems);
          console.error(`Dynamic mapping for ${oid}:`, dynamicMapping);
          
          // Step 4: Query OMOP CONCEPT table for matches
          const matchedData = await checkVsacConceptsInOmop(vsacData, dynamicMapping);
          omopConceptMapping[oid] = matchedData;
          console.error(`OMOP mapping for ${oid}:`, matchedData);
        }
        
        // Step 5: Summarize the mapping
        const summarizedMapping = await summarizeOmopMapping(omopConceptMapping);
        console.error("Summarized mapping:", summarizedMapping);
        
        // Step 6: Translate CQL to SQL
        const finalSqlQuery = await translateCqlToSql(cqlQuery, summarizedMapping);
        console.error("Generated SQL:", finalSqlQuery);
        
        // Step 7: Troubleshoot (simplified version)
        const troubleshootingReport = await troubleshootSqlQuery(finalSqlQuery, summarizedMapping);
        
        // Step 8: Return the SQL query with metadata
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              pipeline: {
                extractedOids: oidList,
                vsacDataSummary: Object.keys(omopConceptMapping).map(oid => ({
                  oid,
                  conceptCount: omopConceptMapping[oid]?.matchedConcepts?.length || 0
                })),
                omopMapping: summarizedMapping,
                troubleshooting: troubleshootingReport
              },
              finalSql: finalSqlQuery
            }, null, 2)
          }]
        };
        
      } catch (error) {
        console.error("Pipeline error:", error);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              step: "Pipeline execution failed"
            })
          }],
          isError: true
        };
      }
    }
  );
}

// Helper functions (using stderr for debug logs)

async function extractValueSetIdentifiersFromCQL(cqlQuery) {
  const messages = [
    { 
      role: "system", 
      content: `Extract all ValueSet OID identifiers from the CQL query. 
      Look for patterns like "valueset 'OID'" or similar ValueSet references.
      Return a JSON array of OID strings. Example: ["2.16.840.1.113883.3.464.1003.101.12.1061"]
      If no ValueSets found, return empty array [].`
    },
    { role: "user", content: `CQL Query:\n${cqlQuery}` }
  ];
  
  const response = await llmService.createCompletion(messages);
  
  try {
    const oids = JSON.parse(response.content);
    return Array.isArray(oids) ? oids : [];
  } catch (e) {
    console.error("Error parsing OID extraction:", e);
    return [];
  }
}

async function queryVsacStructured(valueSetIdentifier, username = "", password = "") {
  // TODO: Implement actual VSAC API call
  // For now, return mock data
  console.error(`Mock VSAC query for: ${valueSetIdentifier}`);
  return [
    {
      code: "I10",
      codeSystem: "2.16.840.1.113883.6.90",
      codeSystemName: "ICD10CM",
      displayName: "Essential hypertension"
    }
  ];
}

async function dynamicMapVsacToOmop(codeSystems) {
  const systemPrompt = `You are an expert in clinical terminologies and the OMOP Common Data Model.
  Given the following list of VSAC codeSystemNames and the list of available vocabularies (with vocabulary_id and vocabulary_name) from OMOP, 
  determine the most appropriate OMOP vocabulary_id for each VSAC codeSystemName. 

  Common mappings:
  - "ICD10CM" -> "ICD10CM"
  - "SNOMEDCT" -> "SNOMED"
  - "CPT" -> "CPT4"
  - "LOINC" -> "LOINC"
  - "RxNorm" -> "RxNorm"
  
  Return a JSON object mapping VSAC names to OMOP vocabulary_ids.`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `VSAC codeSystemNames: ${JSON.stringify(codeSystems)}` }
  ];
  
  const response = await llmService.createCompletion(messages);
  
  try {
    return JSON.parse(response.content);
  } catch (e) {
    console.error("Error parsing dynamic mapping:", e);
    return {};
  }
}

async function checkVsacConceptsInOmop(vsacData, dynamicMapping) {
  // TODO: Implement actual OMOP database query
  // For now, return mock matched data
  return {
    matchedConcepts: vsacData.map(concept => ({
      sourceCode: concept.code,
      sourceSystem: concept.codeSystemName,
      omopConceptId: Math.floor(Math.random() * 1000000), // Mock concept ID
      conceptName: concept.displayName,
      domainId: "Condition",
      vocabularyId: dynamicMapping[concept.codeSystemName] || "Unknown"
    })),
    totalSourceConcepts: vsacData.length,
    matchedCount: vsacData.length
  };
}

async function summarizeOmopMapping(omopConceptMapping) {
  const allMappings = Object.values(omopConceptMapping).flatMap(mapping => 
    mapping.matchedConcepts || []
  );
  
  return {
    totalValueSets: Object.keys(omopConceptMapping).length,
    totalMappedConcepts: allMappings.length,
    conceptIdList: allMappings.map(m => m.omopConceptId),
    domainBreakdown: allMappings.reduce((acc, concept) => {
      acc[concept.domainId] = (acc[concept.domainId] || 0) + 1;
      return acc;
    }, {}),
    vocabularyBreakdown: allMappings.reduce((acc, concept) => {
      acc[concept.vocabularyId] = (acc[concept.vocabularyId] || 0) + 1;
      return acc;
    }, {})
  };
}

async function translateCqlToSql(cqlQuery, summarizedMapping) {
  const systemPrompt = `You are an expert in translating CQL (Clinical Quality Language) to OMOP CDM SQL queries.
  
  Use the provided OMOP concept mappings to generate a PostgreSQL-compatible SQL query.
  
  Key OMOP CDM tables:
  - person (demographics)
  - condition_occurrence (diagnoses)
  - drug_exposure (medications)
  - procedure_occurrence (procedures)
  - observation (lab results, vital signs)
  - visit_occurrence (encounters)
  
  Use the concept IDs from the mapping for WHERE clauses.
  Always include proper JOINs and use standard OMOP patterns.`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { 
      role: "user", 
      content: `CQL Query:\n${cqlQuery}\n\nOMOP Mapping:\n${JSON.stringify(summarizedMapping, null, 2)}` 
    }
  ];
  
  const response = await llmService.createCompletion(messages);
  return response.content;
}

async function troubleshootSqlQuery(sqlQuery, mapping) {
  // Simplified troubleshooting - just basic validation
  const issues = [];
  
  if (sqlQuery.includes('--') || sqlQuery.toLowerCase().includes('not implemented')) {
    issues.push("SQL generation appears incomplete");
  }
  
  if (!sqlQuery.toLowerCase().includes('from')) {
    issues.push("No FROM clause detected");
  }
  
  return {
    issues,
    recommendations: issues.length > 0 ? 
      ["Review CQL structure", "Check concept mappings", "Verify OMOP schema"] : 
      ["SQL appears well-formed"]
  };
}