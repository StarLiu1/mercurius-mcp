// src/mcp/tools/processCqlQuery.js
import { z } from "zod";
import llmService from '../../services/llmService.js';
import vsacService from '../../services/vsacService.js';

export function processCqlQueryTool(server) {
  server.tool(
    "process-cql-query",
    { 
      cqlQuery: z.string(),
      vsacUsername: z.string(),
      vsacPassword: z.string()
    },
    async ({ cqlQuery, vsacUsername, vsacPassword }) => {
      try {
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
                finalSql: await generateBasicSql(cqlQuery)
              }, null, 2)
            }]
          };
        }
        
        // Step 2: Fetch all ValueSets from VSAC efficiently
        console.error(`Fetching ${oidList.length} ValueSets from VSAC...`);
        const vsacResults = await vsacService.retrieveMultipleValueSets(
          oidList, 
          vsacUsername, 
          vsacPassword
        );
        
        // Step 3: Process VSAC data and map to OMOP
        const omopConceptMapping = {};
        
        for (const [oid, vsacConcepts] of Object.entries(vsacResults)) {
          console.error(`Processing ${vsacConcepts.length} concepts for ValueSet: ${oid}`);
          
          if (vsacConcepts.length === 0) {
            console.error(`No VSAC data found for OID: ${oid}`);
            omopConceptMapping[oid] = { matchedConcepts: [], error: "No concepts found" };
            continue;
          }
          
          // Map VSAC code systems to OMOP vocabularies
          const codeSystemsInValueSet = [...new Set(vsacConcepts.map(c => c.codeSystemName))];
          const vocabularyMapping = await mapVsacToOmopVocabularies(codeSystemsInValueSet);
          
          // Simulate OMOP concept lookup (replace with real DB query in production)
          const matchedConcepts = await mockOmopConceptLookup(vsacConcepts, vocabularyMapping);
          omopConceptMapping[oid] = {
            matchedConcepts,
            totalSourceConcepts: vsacConcepts.length,
            matchedCount: matchedConcepts.length,
            vocabularyMapping
          };
        }
        
        // Step 4: Summarize mappings for SQL generation
        const summarizedMapping = await summarizeOmopMapping(omopConceptMapping);
        console.error("Summarized mapping:", summarizedMapping);
        
        // Step 5: Generate SQL query
        const finalSqlQuery = await translateCqlToSql(cqlQuery, summarizedMapping);
        console.error("Generated SQL query");
        
        // Step 6: Create troubleshooting report
        const troubleshootingReport = await troubleshootSqlQuery(finalSqlQuery, summarizedMapping);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              pipeline: {
                extractedOids: oidList,
                vsacResults: Object.keys(vsacResults).map(oid => ({
                  oid,
                  conceptCount: vsacResults[oid]?.length || 0,
                  codeSystemsFound: [...new Set((vsacResults[oid] || []).map(c => c.codeSystemName))]
                })),
                omopMapping: summarizedMapping,
                troubleshooting: troubleshootingReport
              },
              finalSql: finalSqlQuery,
              metadata: {
                totalValueSets: oidList.length,
                totalConceptsFromVsac: Object.values(vsacResults).flat().length,
                totalMappedToOmop: summarizedMapping.totalMappedConcepts,
                processingTime: new Date().toISOString()
              }
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
              step: "Pipeline execution failed",
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}

// Helper functions

async function extractValueSetIdentifiersFromCQL(cqlQuery) {
  const messages = [
    { 
      role: "system", 
      content: `Extract all ValueSet OID identifiers from the CQL query. 
      Look for patterns like:
      - valueset "OID": "2.16.840.1.113883.3.464.1003.101.12.1061"
      - "ValueSet Name": '2.16.840.1.113883.3.464.1003.101.12.1061'
      - Any other ValueSet reference patterns
      
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
    // Fallback: try to extract OIDs with regex
    const oidRegex = /2\.16\.840\.1\.113883\.\d+(?:\.\d+)*/g;
    const matches = cqlQuery.match(oidRegex) || [];
    return [...new Set(matches)]; // Remove duplicates
  }
}

async function mapVsacToOmopVocabularies(codeSystemNames) {
  const systemPrompt = `You are an expert in clinical terminologies and the OMOP Common Data Model.
  Map the following VSAC codeSystemNames to OMOP vocabulary_id values.

  Common mappings:
  - "ICD10CM" -> "ICD10CM"
  - "SNOMEDCT_US" -> "SNOMED"
  - "SNOMEDCT" -> "SNOMED"
  - "CPT" -> "CPT4"
  - "HCPCS" -> "HCPCS"
  - "LOINC" -> "LOINC"
  - "RxNorm" -> "RxNorm"
  - "ICD9CM" -> "ICD9CM"
  - "NDC" -> "NDC"
  
  Return a JSON object mapping VSAC codeSystemName to OMOP vocabulary_id.
  If no mapping exists, use the original name.`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `VSAC codeSystemNames: ${JSON.stringify(codeSystemNames)}` }
  ];
  
  const response = await llmService.createCompletion(messages);
  
  try {
    return JSON.parse(response.content);
  } catch (e) {
    console.error("Error parsing vocabulary mapping:", e);
    // Fallback: create basic mapping
    const fallbackMapping = {};
    for (const system of codeSystemNames) {
      fallbackMapping[system] = system;
    }
    return fallbackMapping;
  }
}

async function mockOmopConceptLookup(vsacConcepts, vocabularyMapping) {
  // TODO: Replace with actual OMOP database query
  // This simulates looking up concepts in the OMOP concept table
  
  const mockDomains = ['Condition', 'Drug', 'Procedure', 'Observation', 'Measurement'];
  
  return vsacConcepts.map(concept => ({
    sourceCode: concept.code,
    sourceCodeSystem: concept.codeSystemName,
    sourceDisplayName: concept.displayName,
    omopConceptId: Math.floor(Math.random() * 1000000) + 1000000, // Mock concept ID
    conceptName: concept.displayName,
    domainId: mockDomains[Math.floor(Math.random() * mockDomains.length)],
    vocabularyId: vocabularyMapping[concept.codeSystemName] || concept.codeSystemName,
    conceptClassId: 'Clinical Finding',
    standardConcept: 'S',
    validStartDate: '2000-01-01',
    validEndDate: '2099-12-31'
  }));
}

async function summarizeOmopMapping(omopConceptMapping) {
  const allMappings = Object.values(omopConceptMapping).flatMap(mapping => 
    mapping.matchedConcepts || []
  );
  
  const conceptIdList = allMappings.map(m => m.omopConceptId);
  
  return {
    totalValueSets: Object.keys(omopConceptMapping).length,
    totalMappedConcepts: allMappings.length,
    conceptIdList: conceptIdList,
    conceptIdString: conceptIdList.join(','),
    domainBreakdown: allMappings.reduce((acc, concept) => {
      acc[concept.domainId] = (acc[concept.domainId] || 0) + 1;
      return acc;
    }, {}),
    vocabularyBreakdown: allMappings.reduce((acc, concept) => {
      acc[concept.vocabularyId] = (acc[concept.vocabularyId] || 0) + 1;
      return acc;
    }, {}),
    valueSetDetails: Object.keys(omopConceptMapping).map(oid => ({
      oid,
      conceptCount: omopConceptMapping[oid].matchedConcepts?.length || 0,
      sourceConcepts: omopConceptMapping[oid].totalSourceConcepts || 0
    }))
  };
}

async function translateCqlToSql(cqlQuery, summarizedMapping) {
  const systemPrompt = `You are an expert in translating CQL (Clinical Quality Language) to OMOP CDM SQL queries.
  
  Generate a PostgreSQL-compatible SQL query using the provided OMOP concept mappings.
  
  Key OMOP CDM tables and their purposes:
  - person: Demographics (person_id, gender_concept_id, year_of_birth, race_concept_id, ethnicity_concept_id)
  - condition_occurrence: Diagnoses (condition_concept_id, person_id, condition_start_date, visit_occurrence_id)
  - drug_exposure: Medications (drug_concept_id, person_id, drug_exposure_start_date, visit_occurrence_id)
  - procedure_occurrence: Procedures (procedure_concept_id, person_id, procedure_date, visit_occurrence_id)
  - observation: Lab results, vital signs (observation_concept_id, person_id, observation_date, value_as_number)
  - visit_occurrence: Encounters (visit_concept_id, person_id, visit_start_date, visit_end_date)
  
  Use the concept IDs provided in the mapping for WHERE clauses with IN operators.
  Always include proper JOINs to person table.
  Return only the SQL query, no explanations.`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { 
      role: "user", 
      content: `CQL Query:\n${cqlQuery}\n\nOMOP Concept Mapping:\n${JSON.stringify(summarizedMapping, null, 2)}` 
    }
  ];
  
  const response = await llmService.createCompletion(messages);
  return response.content.trim();
}

async function generateBasicSql(cqlQuery) {
  // For queries without ValueSets, generate basic SQL
  const systemPrompt = `Convert this CQL query to basic OMOP CDM SQL. 
  Focus on demographic filters, date ranges, and simple conditions.
  Return only the SQL query.`;
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: cqlQuery }
  ];
  
  const response = await llmService.createCompletion(messages);
  return response.content.trim();
}

async function troubleshootSqlQuery(sqlQuery, mapping) {
  const issues = [];
  const recommendations = [];
  
  // Basic SQL validation
  if (!sqlQuery || sqlQuery.includes('--') || sqlQuery.toLowerCase().includes('not implemented')) {
    issues.push("SQL generation appears incomplete");
    recommendations.push("Review CQL structure and ensure proper concept mappings");
  }
  
  if (!sqlQuery.toLowerCase().includes('from')) {
    issues.push("No FROM clause detected in generated SQL");
    recommendations.push("Check if CQL query structure is valid");
  }
  
  if (mapping.totalMappedConcepts === 0) {
    issues.push("No OMOP concepts found for any ValueSets");
    recommendations.push("Verify ValueSet OIDs are correct and VSAC credentials are valid");
  }
  
  if (sqlQuery.toLowerCase().includes('concept_id') && !mapping.conceptIdList.length) {
    issues.push("SQL references concept_id but no concepts were mapped");
    recommendations.push("Check OMOP vocabulary loading and concept mapping logic");
  }
  
  return {
    issues,
    recommendations: recommendations.length > 0 ? recommendations : ["SQL appears well-formed"],
    mappingStats: {
      totalConcepts: mapping.totalMappedConcepts,
      totalValueSets: mapping.totalValueSets,
      hasConceptIds: mapping.conceptIdList.length > 0
    }
  };
}