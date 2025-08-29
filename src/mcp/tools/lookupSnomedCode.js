import { z } from "zod";
import axios from "axios";
import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";

dotenv.config();

// SNOMED CT API configuration
const SNOMED_BROWSER_BASE = "http://browser.ihtsdotools.org/api/snomed";
const SNOMED_EDITION = "en-edition"; // US Edition

// Database configuration for OMOP mapping (PostgreSQL)
const dbConfig = {
  host: process.env.DATABASE_HOST || "52.167.131.85",
  port: process.env.DATABASE_PORT || 5432,
  user: process.env.DATABASE_USER || "dbadmin",
  password: process.env.DATABASE_PASSWORD || "hopkinsx93ewD",
  database: process.env.DATABASE_NAME || "tufts",
  connectionTimeoutMillis: 20000  // 20 seconds
};

// Create a connection pool
const pool = new Pool(dbConfig);

/**
 * Look up a SNOMED code and retrieve its details from SNOMED API
 */
async function fetchSnomedDetails(code) {
  try {
    // Try SNOMED Browser API
    const response = await axios.get(
      `${SNOMED_BROWSER_BASE}/${SNOMED_EDITION}/v1/concepts/${code}`,
      {
        headers: {
          Accept: "application/json"
        },
        timeout: 10000
      }
    );

    if (response.data) {
      return {
        code: code,
        system: "SNOMED",
        display: response.data.fsn?.term || response.data.pt?.term || code,
        conceptId: response.data.conceptId,
        active: response.data.active,
        source: "SNOMED Browser API"
      };
    }
  } catch (error) {
    console.log(`SNOMED Browser API lookup failed for ${code}: ${error.message}`);
    
    // Try alternative endpoint
    try {
      const altResponse = await axios.get(
        `${SNOMED_BROWSER_BASE}/browser/descriptions`,
        {
          params: {
            term: code,
            limit: 1,
            searchMode: "exactMatch"
          },
          headers: {
            Accept: "application/json"
          },
          timeout: 10000
        }
      );

      if (altResponse.data && altResponse.data.items && altResponse.data.items.length > 0) {
        const item = altResponse.data.items[0];
        return {
          code: code,
          system: "SNOMED",
          display: item.term || code,
          conceptId: item.concept?.conceptId || code,
          source: "SNOMED Browser Search"
        };
      }
    } catch (altError) {
      console.log(`Alternative SNOMED lookup also failed for ${code}`);
    }
  }

  // If API fails, return basic info
  return {
    code: code,
    system: "SNOMED",
    display: code,
    source: "default"
  };
}

/**
 * Map SNOMED code to OMOP concept IDs
 */
async function mapSnomedToOmop(code) {
  let client;
  try {
    client = await pool.connect();
    
    // Query to find OMOP mapping for SNOMED code
    const query = `
      SELECT 
        c2.concept_id,
        c2.concept_name,
        c2.domain_id,
        c2.vocabulary_id,
        c2.concept_class_id,
        cr.relationship_id
      FROM dbo.concept c1
      JOIN dbo.concept_relationship cr ON c1.concept_id = cr.concept_id_1
      JOIN dbo.concept c2 ON cr.concept_id_2 = c2.concept_id
      WHERE c1.vocabulary_id = 'SNOMED'
        AND c1.concept_code = ?
        AND cr.relationship_id = 'Maps to'
        AND c2.standard_concept = 'S'
        AND cr.invalid_reason IS NULL
    `;
    
    const result = await client.query(query, [code]);
    const rows = result.rows;
    
    if (rows.length > 0) {
      return {
        mapped: true,
        conceptIds: rows.map(r => r.concept_id),
        concepts: rows.map(r => ({
          id: r.concept_id,
          name: r.concept_name,
          domain: r.domain_id,
          vocabulary: r.vocabulary_id,
          conceptClass: r.concept_class_id
        }))
      };
    }
    
    // Try to find the source concept even if no standard mapping exists
    const sourceQuery = `
      SELECT 
        concept_id,
        concept_name,
        domain_id,
        standard_concept,
        concept_class_id
      FROM dbo.concept
      WHERE vocabulary_id = 'SNOMED'
        AND concept_code = $1
    `;
    
    const sourceResult = await client.query(sourceQuery, [code]);
    const sourceRows = sourceResult.rows;
    
    if (sourceRows.length > 0) {
      const sourceConcept = sourceRows[0];
      
      // If it's already a standard concept, use it directly
      if (sourceConcept.standard_concept === 'S') {
        return {
          mapped: true,
          conceptIds: [sourceConcept.concept_id],
          concepts: [{
            id: sourceConcept.concept_id,
            name: sourceConcept.concept_name,
            domain: sourceConcept.domain_id,
            vocabulary: 'SNOMED',
            conceptClass: sourceConcept.concept_class_id
          }],
          message: "SNOMED code is already a standard concept"
        };
      }
      
      // Try to find any mapping (not just "Maps to")
      const anyMappingQuery = `
        SELECT 
          c2.concept_id,
          c2.concept_name,
          c2.domain_id,
          c2.standard_concept,
          cr.relationship_id
        FROM dbo.concept_relationship cr
        JOIN dbo.concept c2 ON cr.concept_id_2 = c2.concept_id
        WHERE cr.concept_id_1 = $1
          AND c2.standard_concept = 'S'
          AND cr.invalid_reason IS NULL
        ORDER BY 
          CASE cr.relationship_id 
            WHEN 'Maps to' THEN 1
            WHEN 'Concept replaced by' THEN 2
            ELSE 3
          END
        LIMIT 1
      `;
      
      const mappingResult = await client.query(anyMappingQuery, [sourceConcept.concept_id]);
      const mappingRows = mappingResult.rows;
      
      if (mappingRows.length > 0) {
        return {
          mapped: true,
          conceptIds: [mappingRows[0].concept_id],
          concepts: [{
            id: mappingRows[0].concept_id,
            name: mappingRows[0].concept_name,
            domain: mappingRows[0].domain_id,
            vocabulary: 'SNOMED',
            relationship: mappingRows[0].relationship_id
          }],
          message: `Mapped via ${mappingRows[0].relationship_id} relationship`
        };
      }
      
      return {
        mapped: false,
        sourceConceptId: sourceConcept.concept_id,
        sourceConcept: {
          id: sourceConcept.concept_id,
          name: sourceConcept.concept_name,
          domain: sourceConcept.domain_id,
          isStandard: false
        },
        message: "SNOMED code found in OMOP but no standard mapping available"
      };
    }
    
    return {
      mapped: false,
      message: `SNOMED code ${code} not found in OMOP vocabulary`
    };
    
  } catch (error) {
    console.error("Database error mapping SNOMED to OMOP:", error);
    return {
      mapped: false,
      error: error.message
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Determine the appropriate OMOP domain and table for a SNOMED concept
 */
function determineOmopTable(domain) {
  const domainTableMap = {
    'Condition': 'condition_occurrence',
    'Procedure': 'procedure_occurrence',
    'Measurement': 'measurement',
    'Observation': 'observation',
    'Drug': 'drug_exposure',
    'Device': 'device_exposure',
    'Visit': 'visit_occurrence'
  };
  
  return domainTableMap[domain] || 'observation';
}

/**
 * MCP tool for looking up SNOMED codes and mapping to OMOP
 */
export function lookupSnomedCodeTool(server) {
  server.tool(
    "lookupSnomedCode",
    {
      code: z.string().describe("SNOMED CT code (e.g., '428371000124100' for hospice discharge)"),
      display: z.string().optional().describe("Optional display name for the code")
    },
    async ({ code, display }) => {
      console.log(`Looking up SNOMED code: ${code}`);
      
      // Fetch SNOMED details
      const snomedDetails = await fetchSnomedDetails(code);
      
      // Use provided display name if available
      if (display) {
        snomedDetails.display = display;
      }
      
      // Map to OMOP concepts
      const omopMapping = await mapSnomedToOmop(code);
      
      // Construct response
      const response = {
        snomed: snomedDetails,
        omop: omopMapping,
        placeholder: `{{DirectCode:SNOMEDCT:${code}:${snomedDetails.display}}}`,
        success: omopMapping.mapped
      };
      
      // Add suggested SQL if mapping successful
      if (omopMapping.mapped && omopMapping.conceptIds.length > 0) {
        const domain = omopMapping.concepts[0]?.domain;
        const table = determineOmopTable(domain);
        const conceptColumn = `${table.replace('_occurrence', '')}_concept_id`;
        
        response.sql = {
          conceptIds: omopMapping.conceptIds,
          table: table,
          column: conceptColumn,
          sqlSnippet: omopMapping.conceptIds.length === 1
            ? `${conceptColumn} = ${omopMapping.conceptIds[0]}`
            : `${conceptColumn} IN (${omopMapping.conceptIds.join(", ")})`
        };
      }
      
      console.log(`SNOMED lookup result:`, JSON.stringify(response, null, 2));
      
      // Return in MCP format
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  );
}