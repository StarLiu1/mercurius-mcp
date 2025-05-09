# MCP Translation Engine Roadmap

## Project Overview
Build a translation engine that converts natural language queries into OMOP-compatible SQL queries through a standardized MCP interface.

## Core Architecture Components

### 1. MCP Interface Layer
- Define standardized tool interfaces for each pipeline stage
- Implement MCP server with modular tool handling
- Create resource management for connections and caches
- Design error handling and validation schemas

### 2. Pipeline Components

#### Natural Language to CQL Parser
- Parse natural language medical queries
- Extract value set references
- Output structured CQL

#### VSAC Integration Service
- Connect to VSAC terminology services
- Fetch value sets by ID/version
- Cache frequently used value sets

#### OMOP Concept Mapper
- Map VSAC codes to OMOP concept IDs
- Handle multiple source vocabularies
- Validate mappings against OMOP CDM

#### SQL Generator
- Convert CQL + OMOP mappings to SQL
- Target OMOP CDM table structure
- Optimize query performance

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Set up basic MCP server structure
- Implement simple CQL parsing tool
- Create test framework
- Define tool schemas and interfaces

### Phase 2: Core Tools (Weeks 3-6)
- Build VSAC client with authentication
- Implement OMOP mapping service
- Create SQL generation module
- Add basic error handling

### Phase 3: Integration (Weeks 7-8)
- Connect all components via MCP
- Implement pipeline orchestration
- Add caching layer
- Create logging and monitoring

### Phase 4: Optimization (Weeks 9-10)
- Performance tuning
- Advanced error handling
- Resource management
- Comprehensive testing

### Phase 5: Production Ready (Weeks 11-12)
- Documentation
- Deployment scripts
- Monitoring dashboards
- User interface (if needed)

## Key MCP Tool Definitions

```typescript
const tools = {
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
      version: "string" // Optional
    }
  },
  
  "map-to-omop": {
    description: "Map VSAC codes to OMOP concepts",
    inputSchema: {
      sourceCode: "string",
      sourceSystem: "string",
      targetDomain: "string" // Optional
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
```

## Success Metrics
- Query accuracy: >95% correct OMOP concept mappings
- Performance: <2 seconds for typical queries
- Reliability: 99.9% uptime
- Maintainability: Modular components with clear interfaces

## Dependencies
- MCP SDK/Framework
- VSAC API access
- OMOP CDM database
- CQL parsing library
- Testing frameworks