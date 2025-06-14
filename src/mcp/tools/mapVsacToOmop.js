// src/mcp/tools/mapVsacToOmop.js

/**
 * RBB 6/14/2025 - Switched concept_relationship to concept_relationship_new
 * Make sure to switch back to concept_relationship on release
 */
import { z } from "zod";
import { extractValueSetIdentifiersFromCQL, validateExtractedOids } from "./parseNlToCql/extractors.js";
import vsacService from "../../services/vsacService.js";

/**
 * Complete VSAC to OMOP mapping pipeline tool
 * Extracts ValueSets from CQL, fetches concepts from VSAC, and maps to OMOP
 */
export function mapVsacToOmopTool(server) {
  server.tool(
    "map-vsac-to-omop",
    {
      cqlQuery: z.string(),
      vsacUsername: z.string(),
      vsacPassword: z.string(),
      // Database connection parameters
      databaseUser: z.string().default("dbadmin"),
      databaseEndpoint: z.string().default("52.167.131.85"),
      databaseName: z.string().default("tufts"),
      databasePassword: z.string(),
      omopDatabaseSchema: z.string().optional().default("cdm"),
      // Mapping options
      includeVerbatim: z.boolean().optional().default(true),
      includeStandard: z.boolean().optional().default(true),
      includeMapped: z.boolean().optional().default(true),
      // Target OMOP fact tables
      targetFactTables: z.array(z.enum([
        "visit_occurrence", 
        "condition_occurrence", 
        "procedure_occurrence", 
        "measurement", 
        "drug_exposure"
      ])).optional().default([
        "condition_occurrence", 
        "procedure_occurrence", 
        "measurement", 
        "drug_exposure"
      ])
    },
    async ({ 
      cqlQuery, 
      vsacUsername, 
      vsacPassword, 
      databaseUser,
      databaseEndpoint,
      databaseName,
      databasePassword,
      omopDatabaseSchema, 
      includeVerbatim, 
      includeStandard, 
      includeMapped,
      targetFactTables
    }) => {
      try {
        console.error("Starting VSAC to OMOP mapping pipeline with real database...");
        
        // Step 1: Extract ValueSet OIDs from CQL
        console.error("Step 1: Extracting ValueSet OIDs from CQL...");
        const extractionResult = await extractValueSetIdentifiersFromCQL(cqlQuery);
        const extractedOids = extractionResult.oids;
        const valuesets = extractionResult.valuesets;
        
        if (extractedOids.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "No ValueSet OIDs found in CQL query",
                cqlQuery,
                extractedOids: [],
                valuesets: []
              }, null, 2)
            }]
          };
        }
        
        console.error(`Found ${extractedOids.length} unique ValueSet OIDs`);
        
        // Step 2: Fetch concepts from VSAC for all ValueSets
        console.error("Step 2: Fetching concepts from VSAC...");
        const vsacResults = await vsacService.retrieveMultipleValueSets(
          extractedOids,
          vsacUsername,
          vsacPassword
        );
        
        // Step 3: Prepare concept data for OMOP mapping
        console.error("Step 3: Preparing concept data for OMOP mapping...");
        const conceptsForMapping = [];
        const valueSetSummary = {};
        
        for (const [oid, concepts] of Object.entries(vsacResults)) {
          if (!concepts || concepts.length === 0) {
            console.error(`No concepts found for ValueSet: ${oid}`);
            valueSetSummary[oid] = {
              conceptCount: 0,
              codeSystemsFound: [],
              status: 'empty'
            };
            continue;
          }
          
          // Find the ValueSet name from our extraction results
          const valuesetInfo = valuesets.find(vs => vs.oid === oid);
          const valuesetName = valuesetInfo ? valuesetInfo.name : `Unknown_${oid}`;
          
          const codeSystemsFound = [...new Set(concepts.map(c => c.codeSystemName))];
          valueSetSummary[oid] = {
            name: valuesetName,
            conceptCount: concepts.length,
            codeSystemsFound: codeSystemsFound,
            status: 'success'
          };
          
          // Prepare concepts for OMOP mapping
          for (const concept of concepts) {
            conceptsForMapping.push({
              concept_set_id: oid,
              concept_set_name: valuesetName,
              concept_code: concept.code,
              vocabulary_id: mapVsacToOmopVocabulary(concept.codeSystemName),
              original_vocabulary: concept.codeSystemName,
              display_name: concept.displayName,
              code_system: concept.codeSystem
            });
          }
        }
        
        console.error(`Prepared ${conceptsForMapping.length} concepts for OMOP mapping`);
        
        // Step 4: Map to OMOP concepts using real database
        console.error("Step 4: Mapping to OMOP concepts using Tufts database...");
        const dbConfig = {
          user: databaseUser,
          host: databaseEndpoint,
          database: databaseName,
          password: databasePassword,
          port: 5432, // PostgreSQL default port
          ssl: false
        };
        
        const omopMappingResults = await mapConceptsToOmopDatabase(
          conceptsForMapping,
          omopDatabaseSchema,
          dbConfig,
          { includeVerbatim, includeStandard, includeMapped },
          targetFactTables
        );
        
        // Step 5: Generate summary and statistics
        const summary = generateMappingSummary(
          extractedOids,
          valuesets,
          valueSetSummary,
          conceptsForMapping,
          omopMappingResults
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              summary,
              pipeline: {
                step1_extraction: {
                  extractedOids,
                  valuesets,
                  totalValueSets: extractedOids.length
                },
                step2_vsac_fetch: {
                  valueSetSummary,
                  totalConceptsFromVsac: conceptsForMapping.length
                },
                step3_omop_mapping: omopMappingResults,
                step4_final_concept_sets: {
                  verbatim: omopMappingResults.verbatim || [],
                  standard: omopMappingResults.standard || [],
                  mapped: omopMappingResults.mapped || []
                }
              },
              database: {
                endpoint: databaseEndpoint,
                database: databaseName,
                user: databaseUser,
                schema: omopDatabaseSchema,
                targetFactTables: targetFactTables
              },
              metadata: {
                processingTime: new Date().toISOString(),
                totalValueSets: extractedOids.length,
                totalVsacConcepts: conceptsForMapping.length,
                totalOmopMappings: {
                  verbatim: omopMappingResults.verbatim?.length || 0,
                  standard: omopMappingResults.standard?.length || 0,
                  mapped: omopMappingResults.mapped?.length || 0
                }
              }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        console.error("VSAC to OMOP mapping error:", error);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              step: "Pipeline execution failed",
              database: {
                endpoint: databaseEndpoint,
                database: databaseName,
                user: databaseUser
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  
  // Diagnostic tool to test each step individually
  server.tool(
    "debug-vsac-omop-pipeline",
    {
      step: z.enum(["extract", "fetch", "map", "all"]),
      cqlQuery: z.string(),
      vsacUsername: z.string().optional(),
      vsacPassword: z.string().optional(),
      testOids: z.array(z.string()).optional(),
      // Database parameters for map step
      databaseUser: z.string().optional().default("dbadmin"),
      databaseEndpoint: z.string().optional().default("52.167.131.85"),
      databaseName: z.string().optional().default("tufts"),
      databasePassword: z.string().optional(),
      omopDatabaseSchema: z.string().optional().default("cdm")
    },
    async ({ step, cqlQuery, vsacUsername, vsacPassword, testOids, databaseUser, databaseEndpoint, databaseName, databasePassword, omopDatabaseSchema }) => {
      try {
        const results = {};
        
        if (step === "extract" || step === "all") {
          console.error("Testing extraction step...");
          const extractionResult = await extractValueSetIdentifiersFromCQL(cqlQuery);
          results.extraction = {
            extractedOids: extractionResult.oids,
            valuesets: extractionResult.valuesets,
            validation: validateExtractedOids(extractionResult.oids),
            arrayAsStr: JSON.stringify(extractionResult.oids),
          };
        }
        
        if ((step === "fetch" || step === "all")) {
          console.error("Testing VSAC fetch step...");
          const oidsToTest = testOids || results.extraction?.extractedOids || [];
          
          if (oidsToTest.length === 0) {
            results.vsacFetch = {
              error: "No ValueSet OIDs available for testing",
              suggestion: "Run extraction step first or provide testOids parameter"
            };
          } else if (!vsacUsername || !vsacPassword) {
            results.vsacFetch = {
              error: "VSAC credentials required for fetch step",
              suggestion: "Provide vsacUsername and vsacPassword parameters",
              oidsReadyForFetch: oidsToTest
            };
          } else {
            console.error(`Fetching concept sets for ${oidsToTest.length} ValueSet OIDs...`);
            
            // Use the same logic as fetch-multiple-vsac tool
            const vsacResults = await vsacService.retrieveMultipleValueSets(
              oidsToTest,
              vsacUsername,
              vsacPassword
            );
            
            // Calculate detailed statistics like fetch-multiple-vsac does
            const totalConceptsRetrieved = Object.values(vsacResults).reduce((sum, concepts) => sum + concepts.length, 0);
            const successfulRetrievals = Object.keys(vsacResults).filter(oid => vsacResults[oid].length > 0).length;
            
            results.vsacFetch = {
              totalRequested: oidsToTest.length,
              successfulRetrievals: successfulRetrievals,
              totalConceptsRetrieved: totalConceptsRetrieved,
              results: vsacResults,
              detailedSummary: Object.entries(vsacResults).map(([oid, concepts]) => {
                const codeSystemsFound = [...new Set(concepts.map(c => c.codeSystemName))];
                return {
                  oid,
                  conceptCount: concepts.length,
                  codeSystemsFound: codeSystemsFound,
                  status: concepts.length > 0 ? 'success' : 'empty',
                  sampleConcepts: concepts.slice(0, 3).map(c => ({
                    code: c.code,
                    displayName: c.displayName,
                    codeSystemName: c.codeSystemName
                  }))
                };
              }),
              retrievedAt: new Date().toISOString()
            };
            
            console.error(`VSAC fetch completed: ${successfulRetrievals}/${oidsToTest.length} ValueSets, ${totalConceptsRetrieved} total concepts`);
          }
        }
        
        if (step === "map" || step === "all") {
          console.error("Testing OMOP mapping step...");
          
          // Use real concept data from VSAC fetch if available, otherwise create mock data
          let conceptsToMap = [];
          
          if (results.vsacFetch && results.vsacFetch.results) {
            // Convert VSAC results to concept mapping format
            console.error("Using real VSAC concept data for mapping test...");
            
            for (const [oid, vsacConcepts] of Object.entries(results.vsacFetch.results)) {
              // Find the ValueSet name from extraction results
              const valuesetInfo = results.extraction?.valuesets?.find(vs => vs.oid === oid);
              const valuesetName = valuesetInfo ? valuesetInfo.name : `ValueSet_${oid}`;
              
              for (const concept of vsacConcepts) {
                conceptsToMap.push({
                  concept_set_id: oid,
                  concept_set_name: valuesetName,
                  concept_code: concept.code,
                  vocabulary_id: mapVsacToOmopVocabulary(concept.codeSystemName),
                  original_vocabulary: concept.codeSystemName,
                  display_name: concept.displayName,
                  code_system: concept.codeSystem
                });
              }
            }
            
            console.error(`Prepared ${conceptsToMap.length} real VSAC concepts for OMOP mapping`);
          } else {
            // Create mock concept data for testing
            console.error("Using mock concept data for mapping test...");
            conceptsToMap = [
              {
                concept_set_id: "2.16.840.1.113883.3.464.1003.103.12.1001",
                concept_set_name: "Diabetes",
                concept_code: "E11.9",
                vocabulary_id: "ICD10CM",
                original_vocabulary: "ICD10CM",
                display_name: "Type 2 diabetes mellitus without complications"
              },
              {
                concept_set_id: "2.16.840.1.113883.3.464.1003.103.12.1001",
                concept_set_name: "Diabetes",
                concept_code: "250.00",
                vocabulary_id: "ICD9CM",
                original_vocabulary: "ICD9CM",
                display_name: "Diabetes mellitus without mention of complication"
              }
            ];
          }
          
          // Check if database connection parameters are provided
          if (!databasePassword) {
            results.omopMapping = {
              error: "Database password required for real OMOP mapping",
              suggestion: "Provide databasePassword parameter for Tufts database connection",
              inputConcepts: conceptsToMap.length,
              database: {
                user: databaseUser,
                endpoint: databaseEndpoint,
                database: databaseName,
                schema: omopDatabaseSchema
              },
              mockMappingWouldProcess: conceptsToMap.length + " concepts"
            };
          } else {
            // Execute the actual OMOP mapping logic with real database
            try {
              const dbConfig = {
                user: databaseUser,
                host: databaseEndpoint,
                database: databaseName,
                password: databasePassword,
                port: 5432,
                ssl: false
              };
              
              const omopResults = await mapConceptsToOmopDatabase(
                conceptsToMap, 
                omopDatabaseSchema,
                dbConfig,
                {
                  includeVerbatim: true,
                  includeStandard: true,
                  includeMapped: true
                },
                ["condition_occurrence", "procedure_occurrence", "measurement", "drug_exposure"]
              );
              
              results.omopMapping = {
                inputConcepts: conceptsToMap.length,
                mappingResults: omopResults,
                conceptsByValueSet: omopResults.conceptsByValueSet,
                mappingSummary: omopResults.mappingSummary,
                sqlQueries: omopResults.sql_queries,
                database: {
                  connected: true,
                  user: databaseUser,
                  endpoint: databaseEndpoint,
                  database: databaseName,
                  schema: omopDatabaseSchema
                }
              };
              
              console.error(`OMOP mapping test completed: ${omopResults.mappingSummary.totalMappings} total mappings found`);
            } catch (dbError) {
              results.omopMapping = {
                error: `Database connection failed: ${dbError.message}`,
                inputConcepts: conceptsToMap.length,
                database: {
                  user: databaseUser,
                  endpoint: databaseEndpoint,
                  database: databaseName,
                  schema: omopDatabaseSchema,
                  connectionAttempted: true
                },
                suggestion: "Check database credentials and network connectivity"
              };
            }
          }
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              step,
              results,
              status: "debug_complete",
              database: {
                endpoint: databaseEndpoint,
                database: databaseName,
                user: databaseUser,
                schema: omopDatabaseSchema
              }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              step,
              error: error.message,
              status: "debug_failed"
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}

/**
 * Map VSAC code system names to OMOP vocabulary_id values
 * @param {string} vsacCodeSystemName - Code system name from VSAC
 * @returns {string} OMOP vocabulary_id
 */
function mapVsacToOmopVocabulary(vsacCodeSystemName) {
  const mappings = {
    'ICD10CM': 'ICD10CM',
    'ICD-10-CM': 'ICD10CM',
    'SNOMEDCT_US': 'SNOMED',
    'SNOMEDCT': 'SNOMED',
    'SNOMED CT US Edition': 'SNOMED',
    'CPT': 'CPT4',
    'HCPCS': 'HCPCS',
    'LOINC': 'LOINC',
    'RxNorm': 'RxNorm',
    'ICD9CM': 'ICD9CM',
    'ICD-9-CM': 'ICD9CM',
    'NDC': 'NDC',
    'RXNORM': 'RxNorm'
  };
  
  return mappings[vsacCodeSystemName] || vsacCodeSystemName;
}

/**
 * Map concepts to OMOP using actual Tufts database queries
 * Replicates the R script's resolve_concept_sets function with real database
 * @param {Array} concepts - Array of concept objects from VSAC
 * @param {string} cdmDatabaseSchema - OMOP CDM schema name
 * @param {Object} dbConfig - Database connection configuration
 * @param {Object} options - Mapping options
 * @param {Array} targetFactTables - OMOP fact tables to consider for domain mapping
 * @returns {Promise<Object>} Mapping results with actual OMOP concept_ids
 */
async function mapConceptsToOmopDatabase(concepts, cdmDatabaseSchema, dbConfig, options, targetFactTables) {
  console.error(`Mapping ${concepts.length} concepts to OMOP using Tufts database...`);
  console.error(`Database: ${dbConfig.host}/${dbConfig.database}, Schema: ${cdmDatabaseSchema}`);
  console.error(`Target fact tables: ${targetFactTables.join(', ')}`);
  
  // Import pg dynamically
  const { Pool } = await import('pg');
  
  // Enhanced database configuration
  const poolConfig = {
    user: dbConfig.user,
    host: dbConfig.host,
    database: dbConfig.database,
    password: dbConfig.password,
    port: dbConfig.port || 5432,
    ssl: dbConfig.ssl || false,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 1, // Limit to 1 connection for debugging
  };
  
  console.error("Database config:", {
    user: poolConfig.user,
    host: poolConfig.host,
    database: poolConfig.database,
    port: poolConfig.port,
    ssl: poolConfig.ssl,
    schema: cdmDatabaseSchema
  });
  
  const pool = new Pool(poolConfig);
  let client;
  
  try {
    console.error("Attempting to connect to database...");
    client = await pool.connect();
    console.error("Successfully connected to Tufts database");
    
    // Test the connection with a simple query
    console.error("Testing database connection...");
    const testResult = await client.query('SELECT version()');
    console.error(`Database version: ${testResult.rows[0].version.substring(0, 50)}...`);
    
    // Test access to the OMOP schema - handle both 'dbo' and 'cdm' schemas
    console.error(`Testing access to schema '${cdmDatabaseSchema}'...`);
    const schemaTestQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_name IN ('concept', 'concept_relationship_new')
      ORDER BY table_name
    `;
    
    const schemaTestResult = await client.query(schemaTestQuery, [cdmDatabaseSchema]);
    console.error(`Found OMOP tables in schema '${cdmDatabaseSchema}':`, schemaTestResult.rows.map(r => r.table_name));
    
    if (schemaTestResult.rows.length === 0) {
      // Try alternative schema names
      console.error("No tables found in specified schema, trying alternative schemas...");
      const altSchemas = ['dbo', 'cdm', 'public', 'omop'];
      let foundSchema = null;
      
      for (const altSchema of altSchemas) {
        if (altSchema === cdmDatabaseSchema) continue; // Already tried
        try {
          const altResult = await client.query(schemaTestQuery, [altSchema]);
          if (altResult.rows.length > 0) {
            foundSchema = altSchema;
            console.error(`Found OMOP tables in alternative schema '${altSchema}':`, altResult.rows.map(r => r.table_name));
            break;
          }
        } catch (err) {
          console.error(`Schema '${altSchema}' not accessible:`, err.message);
        }
      }
      
      if (!foundSchema) {
        throw new Error(`No OMOP tables found in schema '${cdmDatabaseSchema}' or alternative schemas. Available schemas may need to be checked.`);
      } else {
        // Update schema to the found one
        cdmDatabaseSchema = foundSchema;
        console.error(`Using schema: ${cdmDatabaseSchema}`);
      }
    }
    
    // Step 1: Create temporary table with simplified approach
    const tempTableName = `temp_concepts_${Date.now()}`;
    console.error(`Creating temporary table: ${tempTableName}`);
    
    await client.query(`
      CREATE TEMPORARY TABLE ${tempTableName} (
        concept_set_id varchar(255),
        concept_set_name varchar(255),
        concept_code varchar(50),
        vocabulary_id varchar(50),
        original_vocabulary varchar(50),
        display_name text
      )
    `);
    
    console.error(`Temporary table created, inserting ${concepts.length} concepts...`);
    
    // Insert concepts one by one with better error handling
    let insertedCount = 0;
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];
      try {
        await client.query(`
          INSERT INTO ${tempTableName} 
          (concept_set_id, concept_set_name, concept_code, vocabulary_id, original_vocabulary, display_name) 
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          concept.concept_set_id || '',
          concept.concept_set_name || '',
          concept.concept_code || '',
          concept.vocabulary_id || '',
          concept.original_vocabulary || '',
          concept.display_name || ''
        ]);
        insertedCount++;
        
        if (i === 0) {
          console.error(`First concept inserted successfully: ${concept.concept_code}`);
        }
        
      } catch (insertError) {
        console.error(`Failed to insert concept ${i + 1} (${concept.concept_code}):`, insertError.message);
        console.error(`Concept data:`, {
          concept_set_id: concept.concept_set_id,
          concept_code: concept.concept_code,
          vocabulary_id: concept.vocabulary_id
        });
        // Continue with other concepts
      }
    }
    
    console.error(`Successfully inserted ${insertedCount}/${concepts.length} concepts into temporary table`);
    
    // Verify the insertion
    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tempTableName}`);
    console.error(`Verification: ${countResult.rows[0].count} rows in temporary table`);
    
    if (parseInt(countResult.rows[0].count) === 0) {
      throw new Error("No concepts were successfully inserted into temporary table");
    }
    
    const results = {
      tempConceptListSize: concepts.length,
      insertedConceptCount: insertedCount,
      conceptsByValueSet: groupConceptsByValueSet(concepts),
      databaseInfo: {
        version: testResult.rows[0].version.substring(0, 100),
        schema: cdmDatabaseSchema,
        tempTableName: tempTableName,
        conceptsInserted: insertedCount
      }
    };
    
    // Step 3: Execute actual database queries for all mapping types
    if (options.includeVerbatim) {
      console.error("Executing verbatim matching query...");
      try {
        results.verbatim = await executeVerbatimQueryReal(client, tempTableName, cdmDatabaseSchema);
      } catch (verbatimError) {
        console.error("Verbatim query failed:", verbatimError.message);
        results.verbatimError = verbatimError.message;
        results.verbatim = [];
      }
    } else {
      results.verbatim = [];
    }
    
    if (options.includeStandard) {
      console.error("Executing standard concept query...");
      try {
        results.standard = await executeStandardQueryReal(client, tempTableName, cdmDatabaseSchema);
      } catch (standardError) {
        console.error("Standard query failed:", standardError.message);
        results.standardError = standardError.message;
        results.standard = [];
      }
    } else {
      results.standard = [];
    }
    
    if (options.includeMapped) {
      console.error("Executing mapped concept query...");
      try {
        results.mapped = await executeMappedQueryReal(client, tempTableName, cdmDatabaseSchema);
      } catch (mappedError) {
        console.error("Mapped query failed:", mappedError.message);
        results.mappedError = mappedError.message;
        results.mapped = [];
      }
    } else {
      results.mapped = [];
    }
    
    // Generate comprehensive summary based on actual results
    results.mappingSummary = generateOmopMappingSummary(results, concepts);
    
    // Generate the actual SQL queries used
    results.sql_queries = {
      verbatim: generateVerbatimSQL(cdmDatabaseSchema, tempTableName),
      standard: generateStandardSQL(cdmDatabaseSchema, tempTableName),
      mapped: generateMappedSQL(cdmDatabaseSchema, tempTableName)
    };
    
    // Clean up temporary table
    try {
      await client.query(`DROP TABLE IF EXISTS ${tempTableName}`);
      console.error(`Cleaned up temporary table: ${tempTableName}`);
    } catch (cleanupError) {
      console.error("Error cleaning up temporary table:", cleanupError.message);
    }
    
    console.error(`OMOP mapping completed: ${results.mappingSummary.totalMappings} total mappings found`);
    
    return results;
    
  } catch (error) {
    console.error("Error in OMOP database mapping:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      stack: error.stack?.substring(0, 500)
    });
    throw new Error(`OMOP database mapping failed: ${error.message}`);
  } finally {
    if (client) {
      client.release();
      console.error("Database client released");
    }
    try {
      await pool.end();
      console.error("Database pool closed");
    } catch (poolError) {
      console.error("Error closing pool:", poolError.message);
    }
  }
}


/**
 * Create temporary table and insert concept data (like R script's dbWriteTable)
 * @param {Object} client - Database client
 * @param {string} tempTableName - Temporary table name
 * @param {Array} concepts - Concepts to insert
 */
async function createTempConceptTable(client, tempTableName, concepts) {
  console.error(`Creating temporary table: ${tempTableName}`);
  
  // Create temporary table structure
  await client.query(`
    CREATE TEMPORARY TABLE ${tempTableName} (
      concept_set_id text,
      concept_set_name text,
      concept_code text,
      vocabulary_id text,
      original_vocabulary text,
      display_name text
    )
  `);
  
  // Insert concept data in batches
  const batchSize = 1000;
  for (let i = 0; i < concepts.length; i += batchSize) {
    const batch = concepts.slice(i, i + batchSize);
    const values = batch.map((_, index) => {
      const offset = index * 6;
      return `(${offset + 1}, ${offset + 2}, ${offset + 3}, ${offset + 4}, ${offset + 5}, ${offset + 6})`;
    }).join(', ');
    
    const params = batch.flatMap(concept => [
      concept.concept_set_id,
      concept.concept_set_name,
      concept.concept_code,
      concept.vocabulary_id,
      concept.original_vocabulary,
      concept.display_name || ''
    ]);
    
    const insertQuery = `
      INSERT INTO ${tempTableName} 
      (concept_set_id, concept_set_name, concept_code, vocabulary_id, original_vocabulary, display_name) 
      VALUES ${values}
    `;
    
    await client.query(insertQuery, params);
  }
  
  console.error(`Inserted ${concepts.length} concepts into temporary table`);
}

/**
 * Map concepts to OMOP fact tables for domain identification
 * @param {Object} client - Database client
 * @param {string} tempTableName - Temporary table name
 * @param {string} cdmSchema - OMOP CDM schema
 * @param {Array} factTables - Target fact tables
 */
async function mapConceptsToFactTables(client, tempTableName, cdmSchema, factTables) {
  const factTableMapping = {
    "visit_occurrence": "visit_concept_id",
    "condition_occurrence": "condition_concept_id", 
    "procedure_occurrence": "procedure_concept_id",
    "measurement": "measurement_concept_id",
    "drug_exposure": "drug_concept_id"
  };
  
  try {
    // Simple query to get domain information for each concept
    const domainQuery = `
      SELECT DISTINCT t.concept_set_id, c.domain_id, c.concept_class_id, COUNT(*) as concept_count
      FROM ${cdmSchema}.concept c
      INNER JOIN ${tempTableName} t
      ON c.concept_code = t.concept_code AND c.vocabulary_id = t.vocabulary_id
      WHERE c.domain_id IS NOT NULL
      GROUP BY t.concept_set_id, c.domain_id, c.concept_class_id
      ORDER BY t.concept_set_id, concept_count DESC
    `;
    
    console.error("Executing domain mapping query...");
    const domainResult = await client.query(domainQuery);
    console.error(`Domain mapping query returned ${domainResult.rows.length} results`);
    
    const domainMapping = {};
    for (const row of domainResult.rows) {
      if (!domainMapping[row.concept_set_id]) {
        domainMapping[row.concept_set_id] = {};
      }
      if (!domainMapping[row.concept_set_id][row.domain_id]) {
        domainMapping[row.concept_set_id][row.domain_id] = 0;
      }
      domainMapping[row.concept_set_id][row.domain_id] += parseInt(row.concept_count);
    }
    
    return {
      availableFactTables: factTableMapping,
      targetFactTables: factTables,
      domainDistribution: domainMapping,
      totalDomainMappings: domainResult.rows.length
    };
    
  } catch (error) {
    console.error("Error in domain mapping:", error.message);
    // Return basic structure if domain mapping fails
    return {
      availableFactTables: factTableMapping,
      targetFactTables: factTables,
      domainDistribution: {},
      error: `Domain mapping failed: ${error.message}`
    };
  }
}

/**
 * Execute verbatim matching query (exact concept_code and vocabulary_id)
 * @param {Object} client - Database client
 * @param {string} tempTableName - Temporary table name
 * @param {string} cdmSchema - OMOP CDM schema
 */
async function executeVerbatimQueryReal(client, tempTableName, cdmSchema) {
  const verbatimQuery = `
    SELECT t.concept_set_id, c.concept_id, c.concept_code, c.vocabulary_id, 
           c.domain_id, c.concept_class_id, c.concept_name,
           t.concept_set_name, t.original_vocabulary
    FROM ${cdmSchema}.concept c 
    INNER JOIN ${tempTableName} t
    ON c.concept_code = t.concept_code
    AND c.vocabulary_id = t.vocabulary_id
    ORDER BY t.concept_set_id, c.concept_id
  `;
  
  const result = await client.query(verbatimQuery);
  console.error(`Verbatim query returned ${result.rows.length} matches`);
  
  return result.rows.map(row => ({
    concept_set_id: row.concept_set_id,
    concept_set_name: row.concept_set_name,
    concept_id: parseInt(row.concept_id),
    concept_code: row.concept_code,
    vocabulary_id: row.vocabulary_id,
    domain_id: row.domain_id,
    concept_class_id: row.concept_class_id,
    concept_name: row.concept_name,
    source_vocabulary: row.original_vocabulary,
    mapping_type: 'verbatim'
  }));
}

/**
 * Execute standard concept matching query (standard_concept = 'S')
 * @param {Object} client - Database client
 * @param {string} tempTableName - Temporary table name
 * @param {string} cdmSchema - OMOP CDM schema
 */
async function executeStandardQueryReal(client, tempTableName, cdmSchema) {
  const standardQuery = `
    SELECT t.concept_set_id, c.concept_id, c.concept_code, c.vocabulary_id,
           c.domain_id, c.concept_class_id, c.concept_name, c.standard_concept,
           t.concept_set_name, t.original_vocabulary
    FROM ${cdmSchema}.concept c 
    INNER JOIN ${tempTableName} t
    ON c.concept_code = t.concept_code
    AND c.vocabulary_id = t.vocabulary_id
    AND c.standard_concept = 'S'
    ORDER BY t.concept_set_id, c.concept_id
  `;
  
  const result = await client.query(standardQuery);
  console.error(`Standard query returned ${result.rows.length} matches`);
  
  return result.rows.map(row => ({
    concept_set_id: row.concept_set_id,
    concept_set_name: row.concept_set_name,
    concept_id: parseInt(row.concept_id),
    concept_code: row.concept_code,
    vocabulary_id: row.vocabulary_id,
    domain_id: row.domain_id,
    concept_class_id: row.concept_class_id,
    concept_name: row.concept_name,
    standard_concept: row.standard_concept,
    source_vocabulary: row.original_vocabulary,
    mapping_type: 'standard'
  }));
}

/**
 * Execute mapped concept query (via 'Maps to' relationships)
 * @param {Object} client - Database client
 * @param {string} tempTableName - Temporary table name  
 * @param {string} cdmSchema - OMOP CDM schema
 */
async function executeMappedQueryReal(client, tempTableName, cdmSchema) {
  const mappedQuery = `
    SELECT t.concept_set_id, cr.concept_id_2 AS concept_id, c.concept_code, c.vocabulary_id,
           c.concept_id as source_concept_id, cr.relationship_id,
           target_c.concept_name, target_c.domain_id, target_c.concept_class_id, target_c.standard_concept,
           t.concept_set_name, t.original_vocabulary
    FROM ${cdmSchema}.concept c 
    INNER JOIN ${tempTableName} t
    ON c.concept_code = t.concept_code
    AND c.vocabulary_id = t.vocabulary_id
    INNER JOIN ${cdmSchema}.concept_relationship_new cr
    ON c.concept_id = cr.concept_id_1
    AND cr.relationship_id = 'Maps to'
    INNER JOIN ${cdmSchema}.concept target_c
    ON cr.concept_id_2 = target_c.concept_id
    ORDER BY t.concept_set_id, cr.concept_id_2
  `;
  
  const result = await client.query(mappedQuery);
  console.error(`Mapped query returned ${result.rows.length} matches`);
  
  return result.rows.map(row => ({
    concept_set_id: row.concept_set_id,
    concept_set_name: row.concept_set_name,
    concept_id: parseInt(row.concept_id),
    source_concept_id: parseInt(row.source_concept_id),
    concept_code: row.concept_code,
    vocabulary_id: row.vocabulary_id,
    domain_id: row.domain_id,
    concept_class_id: row.concept_class_id,
    concept_name: row.concept_name,
    standard_concept: row.standard_concept,
    relationship_id: row.relationship_id,
    source_vocabulary: row.original_vocabulary,
    mapping_type: 'mapped'
  }));
}

/**
 * Group concepts by ValueSet ID for easier processing
 * @param {Array} concepts 
 * @returns {Object}
 */
function groupConceptsByValueSet(concepts) {
  return concepts.reduce((acc, concept) => {
    if (!acc[concept.concept_set_id]) {
      acc[concept.concept_set_id] = [];
    }
    acc[concept.concept_set_id].push(concept);
    return acc;
  }, {});
}

/**
 * Execute verbatim matching query (exact concept_code and vocabulary_id)
 * Replicates: SELECT t.concept_set_id, c.concept_id FROM concept c INNER JOIN temp_list t...
 * @param {Array} tempConceptList 
 * @param {string} cdmDatabaseSchema 
 * @returns {Promise<Array>}
 */
async function executeVerbatimQuery(tempConceptList, cdmDatabaseSchema) {
  // TODO: Replace with actual database connection
  // For now, simulate the query execution with realistic results
  
  console.error("Simulating verbatim matching query against OMOP concept table...");
  
  // Simulate SQL execution: 
  // SELECT t.concept_set_id, c.concept_id AS concept_id
  // FROM cdm.concept c 
  // INNER JOIN #temp_hee_concept_list t
  // ON c.concept_code = t.concept_code AND c.vocabulary_id = t.vocabulary_id
  
  const verbatimMatches = [];
  
  for (const concept of tempConceptList) {
    // Simulate database lookup - in production, this would be a real SQL query
    const mockConceptId = await simulateConceptLookup(concept.concept_code, concept.vocabulary_id, 'verbatim');
    
    if (mockConceptId) {
      verbatimMatches.push({
        concept_set_id: concept.concept_set_id,
        concept_id: mockConceptId,
        concept_code: concept.concept_code,
        vocabulary_id: concept.vocabulary_id,
        source_concept_code: concept.concept_code,
        source_vocabulary: concept.original_vocabulary,
        mapping_type: 'verbatim'
      });
    }
  }
  
  console.error(`Found ${verbatimMatches.length} verbatim matches`);
  return verbatimMatches;
}

/**
 * Execute standard concept query (standard_concept = 'S')
 * Replicates: SELECT t.concept_set_id, c.concept_id FROM concept c INNER JOIN temp_list t... AND c.standard_concept = 'S'
 * @param {Array} tempConceptList 
 * @param {string} cdmDatabaseSchema 
 * @returns {Promise<Array>}
 */
async function executeStandardQuery(tempConceptList, cdmDatabaseSchema) {
  console.error("Simulating standard concept query against OMOP concept table...");
  
  // Simulate SQL execution:
  // SELECT t.concept_set_id, c.concept_id AS concept_id
  // FROM cdm.concept c 
  // INNER JOIN #temp_hee_concept_list t
  // ON c.concept_code = t.concept_code AND c.vocabulary_id = t.vocabulary_id
  // AND c.standard_concept = 'S'
  
  const standardMatches = [];
  
  for (const concept of tempConceptList) {
    // Simulate database lookup for standard concepts only
    const mockConceptId = await simulateConceptLookup(concept.concept_code, concept.vocabulary_id, 'standard');
    
    if (mockConceptId) {
      standardMatches.push({
        concept_set_id: concept.concept_set_id,
        concept_id: mockConceptId,
        concept_code: concept.concept_code,
        vocabulary_id: concept.vocabulary_id,
        source_concept_code: concept.concept_code,
        source_vocabulary: concept.original_vocabulary,
        standard_concept: 'S',
        mapping_type: 'standard'
      });
    }
  }
  
  console.error(`Found ${standardMatches.length} standard concept matches`);
  return standardMatches;
}

/**
 * Execute mapped concept query (via 'Maps to' relationships)
 * Replicates: SELECT concept_set_id, concept_id_2 FROM concept c INNER JOIN temp_list t... INNER JOIN concept_relationship cr...
 * @param {Array} tempConceptList 
 * @param {string} cdmDatabaseSchema 
 * @returns {Promise<Array>}
 */
async function executeMappedQuery(tempConceptList, cdmDatabaseSchema) {
  console.error("Simulating mapped concept query against OMOP concept and concept_relationship tables...");
  
  // Simulate SQL execution:
  // SELECT concept_set_id, concept_id_2 AS concept_id
  // FROM cdm.concept c 
  // INNER JOIN #temp_hee_concept_list t
  // ON c.concept_code = t.concept_code AND c.vocabulary_id = t.vocabulary_id
  // INNER JOIN cdm.concept_relationship cr
  // ON c.concept_id = cr.concept_id_1 AND cr.relationship_id = 'Maps to'
  
  const mappedMatches = [];
  
  for (const concept of tempConceptList) {
    // Simulate database lookup with relationship mapping
    const sourceConceptId = await simulateConceptLookup(concept.concept_code, concept.vocabulary_id, 'verbatim');
    
    if (sourceConceptId) {
      // Simulate looking up 'Maps to' relationships
      const mappedConceptIds = await simulateMapsToLookup(sourceConceptId);
      
      for (const mappedConceptId of mappedConceptIds) {
        mappedMatches.push({
          concept_set_id: concept.concept_set_id,
          concept_id: mappedConceptId,
          source_concept_id: sourceConceptId,
          concept_code: concept.concept_code,
          vocabulary_id: concept.vocabulary_id,
          source_concept_code: concept.concept_code,
          source_vocabulary: concept.original_vocabulary,
          relationship_id: 'Maps to',
          mapping_type: 'mapped'
        });
      }
    }
  }
  
  console.error(`Found ${mappedMatches.length} mapped concept matches`);
  return mappedMatches;
}

/**
 * Simulate concept lookup in OMOP concept table
 * In production, this would be a real SQL query
 * @param {string} conceptCode 
 * @param {string} vocabularyId 
 * @param {string} queryType 
 * @returns {Promise<number|null>}
 */
async function simulateConceptLookup(conceptCode, vocabularyId, queryType) {
  // Generate realistic OMOP concept IDs based on code and vocabulary
  const hash = generateConceptHash(conceptCode, vocabularyId);
  
  // Simulate different success rates for different query types
  const successRates = {
    verbatim: 0.85,  // 85% of concepts have verbatim matches
    standard: 0.65,  // 65% have standard concept matches
    mapped: 0.90     // 90% have some mapping
  };
  
  if (Math.random() < successRates[queryType]) {
    return hash;
  }
  
  return null;
}

/**
 * Simulate looking up 'Maps to' relationships
 * @param {number} sourceConceptId 
 * @returns {Promise<number[]>}
 */
async function simulateMapsToLookup(sourceConceptId) {
  // Most concepts map to 1 target, some map to multiple
  const mappingCount = Math.random() < 0.8 ? 1 : Math.floor(Math.random() * 3) + 1;
  const mappedIds = [];
  
  for (let i = 0; i < mappingCount; i++) {
    // Generate target concept ID (usually higher ID for standard concepts)
    mappedIds.push(sourceConceptId + 1000000 + i);
  }
  
  return mappedIds;
}

/**
 * Generate consistent concept hash for simulation
 * @param {string} conceptCode 
 * @param {string} vocabularyId 
 * @returns {number}
 */
function generateConceptHash(conceptCode, vocabularyId) {
  let hash = 0;
  const combined = `${conceptCode}_${vocabularyId}`;
  
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Ensure positive and in realistic OMOP concept ID range (1M-50M)
  return Math.abs(hash % 49000000) + 1000000;
}

/**
 * Generate mapping summary statistics
 * @param {Object} results 
 * @param {Array} tempConceptList 
 * @returns {Object}
 */
function generateOmopMappingSummary(results, tempConceptList) {
  const totalSourceConcepts = tempConceptList.length;
  const verbatimCount = results.verbatim?.length || 0;
  const standardCount = results.standard?.length || 0;
  const mappedCount = results.mapped?.length || 0;
  
  // Calculate unique concept_ids across all mapping types
  const allConceptIds = new Set();
  [results.verbatim || [], results.standard || [], results.mapped || []].forEach(mappings => {
    mappings.forEach(mapping => allConceptIds.add(mapping.concept_id));
  });
  
  // Group mappings by ValueSet
  const mappingsByValueSet = {};
  [results.verbatim || [], results.standard || [], results.mapped || []].forEach(mappings => {
    mappings.forEach(mapping => {
      if (!mappingsByValueSet[mapping.concept_set_id]) {
        mappingsByValueSet[mapping.concept_set_id] = {
          verbatim: 0,
          standard: 0,
          mapped: 0,
          uniqueConceptIds: new Set()
        };
      }
      mappingsByValueSet[mapping.concept_set_id][mapping.mapping_type]++;
      mappingsByValueSet[mapping.concept_set_id].uniqueConceptIds.add(mapping.concept_id);
    });
  });
  
  // Convert Sets to arrays for JSON serialization
  Object.keys(mappingsByValueSet).forEach(valueSetId => {
    mappingsByValueSet[valueSetId].uniqueConceptIds = Array.from(mappingsByValueSet[valueSetId].uniqueConceptIds);
  });
  
  return {
    totalSourceConcepts,
    totalMappings: verbatimCount + standardCount + mappedCount,
    uniqueTargetConcepts: allConceptIds.size,
    mappingCounts: {
      verbatim: verbatimCount,
      standard: standardCount,
      mapped: mappedCount
    },
    mappingPercentages: {
      verbatim: totalSourceConcepts > 0 ? ((verbatimCount / totalSourceConcepts) * 100).toFixed(1) : '0.0',
      standard: totalSourceConcepts > 0 ? ((standardCount / totalSourceConcepts) * 100).toFixed(1) : '0.0',
      mapped: totalSourceConcepts > 0 ? ((mappedCount / totalSourceConcepts) * 100).toFixed(1) : '0.0'
    },
    mappingsByValueSet: Object.entries(mappingsByValueSet).map(([valueSetId, stats]) => ({
      concept_set_id: valueSetId,
      verbatim_mappings: stats.verbatim,
      standard_mappings: stats.standard,
      mapped_mappings: stats.mapped,
      unique_concept_ids: stats.uniqueConceptIds,
      total_mappings: stats.verbatim + stats.standard + stats.mapped
    }))
  };
}

/**
 * Generate mock OMOP concept ID
 * @param {string} conceptCode 
 * @returns {number}
 */
function mockOmopConceptId(conceptCode) {
  // Generate a consistent mock concept_id based on concept_code
  let hash = 0;
  for (let i = 0; i < conceptCode.length; i++) {
    const char = conceptCode.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) + 1000000; // Ensure positive and in OMOP range
}

/**
 * Generate SQL for verbatim concept matching (with real table name)
 * @param {string} cdmDatabaseSchema 
 * @param {string} tempTableName
 * @returns {string}
 */
function generateVerbatimSQL(cdmDatabaseSchema, tempTableName = "#temp_hee_concept_list") {
    return `
  SELECT t.concept_set_id, c.concept_id AS concept_id, c.concept_code, c.vocabulary_id,
         c.domain_id, c.concept_class_id, c.concept_name
  FROM ${cdmDatabaseSchema}.concept c 
  INNER JOIN ${tempTableName} t
  ON c.concept_code = t.concept_code
  AND c.vocabulary_id = t.vocabulary_id
  ORDER BY t.concept_set_id, c.concept_id`;
  }
  
  /**
   * Generate SQL for standard concept matching (with real table name)
   * @param {string} cdmDatabaseSchema 
   * @param {string} tempTableName
   * @returns {string}
   */
  function generateStandardSQL(cdmDatabaseSchema, tempTableName = "#temp_hee_concept_list") {
    return `
  SELECT t.concept_set_id, c.concept_id AS concept_id, c.concept_code, c.vocabulary_id,
         c.domain_id, c.concept_class_id, c.concept_name, c.standard_concept
  FROM ${cdmDatabaseSchema}.concept c 
  INNER JOIN ${tempTableName} t
  ON c.concept_code = t.concept_code
  AND c.vocabulary_id = t.vocabulary_id
  AND c.standard_concept = 'S'
  ORDER BY t.concept_set_id, c.concept_id`;
  }
  
  /**
   * Generate SQL for mapped concept matching (with real table name)
   * @param {string} cdmDatabaseSchema 
   * @param {string} tempTableName
   * @returns {string}
   */
  function generateMappedSQL(cdmDatabaseSchema, tempTableName = "#temp_hee_concept_list") {
    return `
  SELECT t.concept_set_id, cr.concept_id_2 AS concept_id, c.concept_code, c.vocabulary_id,
         c.concept_id as source_concept_id, cr.relationship_id,
         target_c.concept_name, target_c.domain_id, target_c.concept_class_id, target_c.standard_concept
  FROM ${cdmDatabaseSchema}.concept c 
  INNER JOIN ${tempTableName} t
  ON c.concept_code = t.concept_code
  AND c.vocabulary_id = t.vocabulary_id
  INNER JOIN ${cdmDatabaseSchema}.concept_relationship_new cr
  ON c.concept_id = cr.concept_id_1
  AND cr.relationship_id = 'Maps to'
  INNER JOIN ${cdmDatabaseSchema}.concept target_c
  ON cr.concept_id_2 = target_c.concept_id
  ORDER BY t.concept_set_id, cr.concept_id_2`;
  }
  
/**
 * Generate comprehensive mapping summary
 * @param {Array} extractedOids 
 * @param {Array} valuesets 
 * @param {Object} valueSetSummary 
 * @param {Array} conceptsForMapping 
 * @param {Object} omopMappingResults 
 * @returns {Object}
 */
function generateMappingSummary(extractedOids, valuesets, valueSetSummary, conceptsForMapping, omopMappingResults) {
  const summary = {
    pipeline_success: true,
    total_valuesets_extracted: extractedOids.length,
    total_concepts_from_vsac: conceptsForMapping.length,
    total_omop_mappings: {
      verbatim: omopMappingResults.verbatim?.length || 0,
      standard: omopMappingResults.standard?.length || 0,
      mapped: omopMappingResults.mapped?.length || 0
    },
    valueset_breakdown: Object.entries(valueSetSummary).map(([oid, info]) => ({
      oid,
      name: info.name,
      concept_count: info.conceptCount,
      code_systems: info.codeSystemsFound,
      status: info.status
    })),
    vocabulary_distribution: {},
    mapping_coverage: {}
  };
  
  // Calculate vocabulary distribution
  const vocabCounts = conceptsForMapping.reduce((acc, concept) => {
    acc[concept.vocabulary_id] = (acc[concept.vocabulary_id] || 0) + 1;
    return acc;
  }, {});
  summary.vocabulary_distribution = vocabCounts;
  
  // Calculate mapping coverage
  const totalConcepts = conceptsForMapping.length;
  summary.mapping_coverage = {
    verbatim_percentage: totalConcepts > 0 ? ((omopMappingResults.verbatim?.length || 0) / totalConcepts * 100).toFixed(1) : 0,
    standard_percentage: totalConcepts > 0 ? ((omopMappingResults.standard?.length || 0) / totalConcepts * 100).toFixed(1) : 0,
    mapped_percentage: totalConcepts > 0 ? ((omopMappingResults.mapped?.length || 0) / totalConcepts * 100).toFixed(1) : 0
  };
  
  return summary;
}