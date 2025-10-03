# OMOP-NLP-MCP with VSAC Integration

## Overview

This MCP (Model Context Protocol) server translates natural language medical queries into OMOP-compatible SQL queries through a standardized pipeline that includes:

1. **CQL Parsing** - Extracts Clinical Quality Language value sets
2. **VSAC Integration** - Fetch value sets from the Value Set Authority Center
3. **OMOP Concept Mapping** - Map clinical terminology to OMOP concept IDs
4. **SQL Generation** - Generate optimized OMOP CDM queries

**The Python Version is most up to date: https://github.com/StarLiu1/mercurius-mcp-py**

## VSAC Integration

### What is VSAC?

The Value Set Authority Center (VSAC) is a centralized repository of value sets used in clinical quality measurement and reporting. Value sets contain collections of medical codes (ICD-10, SNOMED, CPT, etc.) that define specific clinical concepts.

### Prerequisites

1. **VSAC Account**: You need a UMLS account to access VSAC
   - Register at: https://uts.nlm.nih.gov/uts/signup-login
   - Request VSAC access through your UMLS profile

2. **Environment Variables**: Add your VSAC credentials to `.env`:
   ```bash
   VSAC_USERNAME=your_umls_username
   VSAC_PASSWORD=your_umls_password
   ```

### Available VSAC Tools

#### 1. `fetch-vsac`
Retrieve a single value set from VSAC.

**Parameters:**
- `valueSetId` (string): The OID of the value set
- `version` (optional string): Specific version (defaults to latest)
- `username` (optional string): VSAC username
- `password` (optional string): VSAC password

**Example:**
```json
{
  "valueSetId": "2.16.840.1.113883.3.464.1003.104.12.1011",
  "version": "latest",
  "username": "your_username",
  "password": "your_password"
}
```

#### 2. `fetch-multiple-vsac`
Efficiently retrieve multiple value sets in batch.

**Parameters:**
- `valueSetIds` (array): Array of value set OIDs
- `username` (string): VSAC username
- `password` (string): VSAC password

#### 3. `process-cql-query`
Full pipeline: Extract ValueSets from CQL → Fetch from VSAC → Map to OMOP → Generate SQL

**Parameters:**
- `cqlQuery` (string): The CQL query to process
- `vsacUsername` (string): VSAC username
- `vsacPassword` (string): VSAC password

### VSAC Response Format

The VSAC service returns structured concept data:

```json
{
  "valueSetId": "2.16.840.1.113883.3.464.1003.104.12.1011",
  "conceptCount": 45,
  "concepts": [
    {
      "code": "I10",
      "codeSystem": "2.16.840.1.113883.6.90",
      "codeSystemName": "ICD10CM",
      "displayName": "Essential hypertension",
      "valueSetOid": "2.16.840.1.113883.3.464.1003.104.12.1011",
      "valueSetName": "Essential Hypertension"
    }
  ],
  "codeSystemsFound": ["ICD10CM", "SNOMEDCT_US"],
  "status": "success"
}
```

### Error Handling

Common VSAC errors and solutions:

1. **Authentication Failed**
   - Verify UMLS credentials
   - Ensure VSAC access is enabled in your UMLS profile

2. **Value Set Not Found**
   - Check the OID format (should be like `2.16.840.1.113883.x.x.x`)
   - Verify the value set exists in VSAC

3. **Rate Limiting**
   - The service includes automatic retry logic
   - Batch requests are throttled to respect VSAC limits

### Testing VSAC Integration

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Run VSAC test:**
   ```bash
   npm run test:vsac
   ```

### Performance and Caching

- **Caching**: Retrieved value sets are cached in memory to improve performance
- **Batch Processing**: Multiple value sets are fetched with controlled concurrency
- **Timeout Handling**: Requests timeout after 30 seconds with appropriate error messages

### Common Value Set OIDs for Testing

| Condition | OID | Description |
|-----------|-----|-------------|
| Essential Hypertension | `2.16.840.1.113883.3.464.1003.104.12.1011` | Common hypertension codes |
| Diabetes | `2.16.840.1.113883.3.464.1003.103.12.1001` | Diabetes mellitus codes |
| Acute MI | `2.16.840.1.113883.3.464.1003.104.12.1001` | Acute myocardial infarction |

### Integration with OMOP Pipeline

1. **CQL Analysis**: Extract ValueSet OIDs from CQL queries
2. **VSAC Retrieval**: Fetch complete concept lists for each OID
3. **Vocabulary Mapping**: Map VSAC code systems to OMOP vocabularies
4. **Concept Lookup**: Find matching OMOP concept IDs
5. **SQL Generation**: Create OMOP CDM queries with proper concept filters

### Next Steps

1. **Database Integration**: Connect to actual OMOP CDM database for concept lookup
2. **Advanced Mapping**: Implement fuzzy matching for unmapped concepts
3. **Performance Optimization**: Add Redis caching for production use
4. **Monitoring**: Add detailed logging and metrics for VSAC operations

## Full Pipeline Example

```bash
# 1. Start the MCP server
npm run start:stdio

# 2. In MCP Inspector, use process-cql-query tool:
{
  "cqlQuery": "define \"Hypertensive Patients\": [Condition: \"Essential Hypertension\"] C where C.clinicalStatus = 'active'",
  "vsacUsername": "your_username",
  "vsacPassword": "your_password"
}

# 3. The pipeline will:
#    - Extract ValueSet OID from CQL
#    - Fetch concepts from VSAC
#    - Map to OMOP concept IDs
#    - Generate final SQL query
```

This integration provides a complete bridge between clinical quality language and OMOP analytical queries, enabling sophisticated medical research workflows through natural language interfaces.
