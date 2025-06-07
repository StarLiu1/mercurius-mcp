# cql-fhir-omop-mcp
 
# MCP Translation Engine Roadmap

## Project Overview
Build a translation engine that converts natural language queries into OMOP-compatible SQL queries through a standardized MCP interface.

## Basic workflow

1. Extract ValueSet OIDs from the input CQL.
2. For each OID, query VSAC to obtain structured concept data.
3. Use an agent to dynamically map VSAC codeSystemNames to OMOP vocabulary IDs.
4. Query the OMOP CONCEPT table (limiting to standard concepts) for matches and retrieve record counts.
5. Summarize the mapping.
6. Translate the original CQL query into a final SQL query using the summarized mapping and full OMOP schema.
7. Initiate a group chat session to segment and troubleshoot the final SQL query, displaying the full conversation.