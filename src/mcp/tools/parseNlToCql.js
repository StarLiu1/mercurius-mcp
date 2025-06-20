// src/mcp/tools/parseNlToCql.js
import { z } from "zod";
import { parseToCql } from "./parseNlToCql/parser.js";
import { extractValueSetIdentifiersFromCQL, validateExtractedOids } from "./parseNlToCql/extractors.js";

export function parseNlToCqlTool(server) {
  server.tool(
    "parse-nl-to-cql",
    { query: z.string() },
    async ({ query }) => {
      try {
        console.error("Converting natural language to CQL...");
        const cql = await parseToCql(query);
        
        console.error("Extracting ValueSet OIDs using valueset declaration pattern...");
        const valueSetReferences = await extractValueSetIdentifiersFromCQL(cql);
        
        // Validate extracted OIDs
        const validation = validateExtractedOids(valueSetReferences);
        
        const result = {
          cql,
          valueSetReferences,
          extractionMethod: "valueset_declaration_regex",
          validation: {
            validOids: validation.valid,
            invalidOids: validation.invalid,
            warnings: validation.warnings,
            totalFound: valueSetReferences.length,
            validCount: validation.valid.length
          }
        };
        
        // Log validation results
        if (validation.invalid.length > 0) {
          console.error("Invalid OIDs found:", validation.invalid);
        }
        if (validation.warnings.length > 0) {
          console.error("OID warnings:", validation.warnings);
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              query: query
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );

  // Enhanced tool for testing regex extraction on any CQL
  server.tool(
    "valueset-regex-extraction",
    { 
      cqlQuery: z.string(),
      showDetails: z.boolean().optional().default(false),
      includeInput: z.boolean().optional().default(false) // New parameter to control input echoing
    },
    async ({ cqlQuery, showDetails, includeInput }) => {
      try {
        console.error("Testing regex extraction patterns...");
        
        const extractionResult = await extractValueSetIdentifiersFromCQL(cqlQuery);
        const extractedOids = extractionResult.oids;
        const valuesets = extractionResult.valuesets;
        
        const validOids = validateExtractedOids(extractedOids);
        const invalidOids = extractedOids.filter(oid => !validOids.includes(oid));
        
        const result = {
          ...(includeInput && { input: cqlQuery }),

          extractedValueSets: valuesets, // JSON array with name/oid pairs
          validOids: validOids,
          invalidOids: invalidOids,
          summary: {
            totalFound: extractedOids.length,
            validOids: validOids.length,
            invalidOids: invalidOids.length
          },
          // Copy-pastable arrays
          copyPastableArrays: {
            extractedOids: JSON.stringify(extractedOids),
            validOids: JSON.stringify(validOids),
            invalidOids: JSON.stringify(invalidOids)
          }
        };
        
        // If detailed output requested, show regex test results for valueset pattern only
        if (showDetails) {
          result.detailedRegexTests = {};
          
          // Test valueset declaration pattern with updated regex
          const valuesetPattern = /(valueset\s")(.+)(":\s')(urn:oid:)((\d+\.)*\d+)(')/gi;
          const valuesetMatches = [];
          let match;
          while ((match = valuesetPattern.exec(cqlQuery)) !== null) {
            valuesetMatches.push({
              fullMatch: match[0],
              group1: match[1], // valueset "
              group2: match[2], // name
              group3: match[3], // ": '
              group4: match[4], // urn:oid:
              group5: match[5], // OID (what we extract)
              group6: match[6], // '
              index: match.index,
              extractedName: match[2],
              extractedOid: match[5]
            });
          }
          result.detailedRegexTests.valuesetPattern = {
            pattern: "(valueset\\s\")(.+)(\":\\s')(urn:oid:)((\\d+\\.)*\\d+)(')",
            description: "Matches valueset declarations and extracts both name (group 2) and OID (group 5)",
            matches: valuesetMatches
          };
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              cqlQuery: cqlQuery
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  // Quick extraction tool - minimal output, no input echo
  server.tool(
    "extract-valuesets",
    { 
      cqlQuery: z.string()
    },
    async ({ cqlQuery }) => {
      try {
        const extractionResult = await extractValueSetIdentifiersFromCQL(cqlQuery);
        const extractedOids = extractionResult.oids;
        const valuesets = extractionResult.valuesets;
        
        // Minimal, clean output
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              valuesets: valuesets,
              oids: extractedOids,
              count: extractedOids.length
            }, null, 2)
          }]
        };
        
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
  // // Tool to demonstrate different CQL patterns that should be recognized
  // server.tool(
  //   "demo-cql-patterns",
  //   {},
  //   async () => {
  //     const demoPatterns = {
  //       description: "Examples of CQL patterns that will be matched by urn:oid regex only",
  //       regexPattern: {
  //         pattern: "urn:oid:(\\d*\\.\\d+(?:\\.\\d+)*)",
  //         description: "Matches urn:oid:X.X.X format and extracts the OID part after urn:oid:"
  //       },
  //       examples: [
  //         {
  //           name: "urn:oid in condition reference",
  //           cql: `define "Diabetes": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001"]`,
  //           expectedOids: ["2.16.840.1.113883.3.464.1003.103.12.1001"],
  //           willMatch: true
  //         },
  //         {
  //           name: "urn:oid with single quotes",
  //           cql: `define "Test": [Observation: 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1013']`,
  //           expectedOids: ["2.16.840.1.113883.3.464.1003.198.12.1013"],
  //           willMatch: true
  //         },
  //         {
  //           name: "Multiple urn:oid references",
  //           cql: `define "Cond1": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001"]
  //                 define "Cond2": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.104.12.1002"]`,
  //           expectedOids: [
  //             "2.16.840.1.113883.3.464.1003.103.12.1001",
  //             "2.16.840.1.113883.3.464.1003.104.12.1002"
  //           ],
  //           willMatch: true
  //         },
  //         {
  //           name: "Direct OID without urn:oid prefix",
  //           cql: `valueset "Diabetes": "2.16.840.1.113883.3.464.1003.103.12.1001"`,
  //           expectedOids: [],
  //           willMatch: false,
  //           note: "Will NOT match - no urn:oid: prefix"
  //         },
  //         {
  //           name: "ValueSet declaration with urn:oid",
  //           cql: `valueset "Diabetes": "urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001"`,
  //           expectedOids: ["2.16.840.1.113883.3.464.1003.103.12.1001"],
  //           willMatch: true
  //         },
  //         {
  //           name: "Mixed formats (only urn:oid will match)",
  //           cql: `valueset "Direct": "2.16.840.1.113883.3.464.1003.103.12.1001"
  //                 define "WithUrn": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.104.12.1002"]`,
  //           expectedOids: ["2.16.840.1.113883.3.464.1003.104.12.1002"],
  //           willMatch: true,
  //           note: "Only the urn:oid reference will be extracted"
  //         }
  //       ]
  //     };

  //     return {
  //       content: [{
  //         type: "text",
  //         text: JSON.stringify(demoPatterns, null, 2)
  //       }]
  //     };
  //   }
  // );
}