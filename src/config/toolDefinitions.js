const toolDefinitions = {
    "parse-nl-to-cql": {
      description: "Convert natural language query to CQL",
      inputSchema: {
        query: "string"
      },
      outputSchema: {
        cql: "string",
        valueSetReferences: "string[]"
      }
    },
    
    "fetch-vsac": {
      description: "Retrieve value sets from VSAC",
      inputSchema: {
        valueSetId: "string",
        version: "string?"
      }
    },
    
    "map-to-omop": {
      description: "Map VSAC codes to OMOP concepts",
      inputSchema: {
        sourceCode: "string",
        sourceSystem: "string",
        targetDomain: "string?"
      }
    },
    
    "generate-sql": {
      description: "Generate OMOP CDM SQL from CQL",
      inputSchema: {
        cql: "string",
        conceptMappings: "object"
      }
    }
  };
  
  module.exports = { toolDefinitions };