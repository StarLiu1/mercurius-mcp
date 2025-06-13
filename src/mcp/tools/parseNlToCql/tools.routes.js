const express = require('express');
const router = express.Router();
const { extractValueSetIdentifiersFromCQL } = require('../../../tools/parseNlToCql/extractors');

// Test endpoint for value set extraction
router.post('/valueset-regex-extraction', async (req, res) => {
  try {
    const { cql } = req.body;
    
    if (!cql) {
      return res.status(400).json({ error: "CQL query is required" });
    }
    
    const valueSetOIDs = await extractValueSetIdentifiersFromCQL(cql);
    
    res.json({
      cql: cql,
      valueSetOIDs: valueSetOIDs,
      count: valueSetOIDs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Full parse endpoint (NL to CQL with extraction)
router.post('/parse-nl-to-cql', async (req, res) => {
  try {
    const { query } = req.body;
    const llmService = require('../../services/llmService');
    
    // Step 1: Convert NL to CQL
    const messages = [
      { 
        role: "system", 
        content: "Convert the natural language medical query to a valid CQL (Clinical Quality Language) query. Include value set references with OIDs when appropriate."
      },
      { role: "user", content: query }
    ];
    
    const cqlResponse = await llmService.createCompletion(messages);
    const cqlQuery = cqlResponse.content;
    
    // Step 2: Extract value set OIDs
    const valueSetOIDs = await extractValueSetIdentifiersFromCQL(cqlQuery);
    
    res.json({
      cql: cqlQuery,
      valueSetReferences: valueSetOIDs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;