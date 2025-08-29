import { z } from "zod";
import axios from "axios";
import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";

dotenv.config();

// LOINC API configuration
const LOINC_FHIR_BASE = "https://fhir.loinc.org";
const NIH_LOINC_BASE = "https://clinicaltables.nlm.nih.gov/api/loinc_items/v3";

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
 * Look up a LOINC code and retrieve its details from LOINC API
 */
async function fetchLoincDetails(code) {
  try {
    // Try LOINC FHIR server first
    const auth = Buffer.from(
      `${process.env.LOINC_USERNAME}:${process.env.LOINC_PASSWORD}`
    ).toString("base64");

    const response = await axios.get(
      `${LOINC_FHIR_BASE}/CodeSystem/$lookup`,
      {
        params: {
          system: "http://loinc.org",
          code: code
        },
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.parameter) {
      const display = response.data.parameter.find(
        p => p.name === "display"
      )?.valueString;
      
      return {
        code: code,
        system: "LOINC",
        display: display || code,
        source: "LOINC FHIR"
      };
    }
  } catch (error) {
    console.log(`LOINC FHIR lookup failed for ${code}, trying NIH fallback`);
    
    // Try NIH Clinical Table Search as fallback
    try {
      const nihResponse = await axios.get(
        `${NIH_LOINC_BASE}/search`,
        {
          params: {
            terms: code,
            df: "LOINC_NUM"
          },
          timeout: 10000
        }
      );

      if (nihResponse.data && nihResponse.data[3] && nihResponse.data[3].length > 0) {
        const result = nihResponse.data[3][0];
        return {
          code: code,
          system: "LOINC",
          display: result[1] || code, // Display name is typically in position 1
          source: "NIH Clinical Tables"
        };
      }
    } catch (nihError) {
      console.log(`NIH lookup also failed for ${code}`);
    }
  }

  // If both fail, return basic info
  return {
    code: code,
    system: "LOINC",
    display: code,
    source: "default"
  };
}

/**
 * Map LOINC code to OMOP concept IDs
 */
async function mapLoincToOmop(code) {
  let client;
  try {
    client = await pool.connect();
    
    // Query to find OMOP mapping for LOINC code
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
      WHERE c1.vocabulary_id = 'LOINC'
        AND c1.concept_code = $1
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
        standard_concept
      FROM dbo.concept
      WHERE vocabulary_id = 'LOINC'
        AND concept_code = $1
    `;
    
    const sourceResult = await client.query(sourceQuery, [code]);
    const sourceRows = sourceResult.rows;
    
    if (sourceRows.length > 0) {
      // Check if the source concept is already a standard concept
      if (sourceRows[0].standard_concept === 'S') {
        return {
          mapped: true,
          conceptIds: [sourceRows[0].concept_id],
          concepts: [{
            id: sourceRows[0].concept_id,
            name: sourceRows[0].concept_name,
            domain: sourceRows[0].domain_id,
            vocabulary: 'LOINC',
            conceptClass: 'LOINC Code'
          }],
          message: "LOINC code is already a standard OMOP concept"
        };
      }
      
      return {
        mapped: false,
        sourceConceptId: sourceRows[0].concept_id,
        sourceConcept: {
          id: sourceRows[0].concept_id,
          name: sourceRows[0].concept_name,
          domain: sourceRows[0].domain_id,
          isStandard: false
        },
        message: "LOINC code found in OMOP but is not a standard concept"
      };
    }
    
    return {
      mapped: false,
      message: `LOINC code ${code} not found in OMOP vocabulary`
    };
    
  } catch (error) {
    console.error("Database error mapping LOINC to OMOP:", error);
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
 * MCP tool for looking up LOINC codes and mapping to OMOP
 */
export function lookupLoincCodeTool(server) {
  server.tool(
    "lookupLoincCode",
    {
      code: z.string().describe("LOINC code (e.g., '8462-4' for diastolic blood pressure)"),
      display: z.string().optional().describe("Optional display name for the code")
    },
    async ({ code, display }) => {
      console.log(`Looking up LOINC code: ${code}`);
      
      // Fetch LOINC details
      const loincDetails = await fetchLoincDetails(code);
      
      // Use provided display name if available
      if (display) {
        loincDetails.display = display;
      }
      
      // Map to OMOP concepts
      const omopMapping = await mapLoincToOmop(code);
      
      // Construct response
      const response = {
        loinc: loincDetails,
        omop: omopMapping,
        placeholder: `{{DirectCode:LOINC:${code}:${loincDetails.display}}}`,
        success: omopMapping.mapped
      };
      
      // Add suggested SQL if mapping successful
      if (omopMapping.mapped && omopMapping.conceptIds.length > 0) {
        response.sql = {
          conceptIds: omopMapping.conceptIds,
          sqlSnippet: omopMapping.conceptIds.length === 1
            ? `measurement_concept_id = ${omopMapping.conceptIds[0]}`
            : `measurement_concept_id IN (${omopMapping.conceptIds.join(", ")})`
        };
      }
      
      console.log(`LOINC lookup result:`, JSON.stringify(response, null, 2));
      
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