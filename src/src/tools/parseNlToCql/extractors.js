const llmService = require('../../services/llmService');

async function extractValueSetIdentifiersFromCQL(cqlQuery) {
  try {
    const messages = [
      { 
        role: "system", 
        content: "Extract all ValueSet OID identifiers from the CQL query and return them as a JSON array of strings. Only return the JSON array, no other text."
      },
      { role: "user", content: `CQL Query:\n${cqlQuery}\n` }
    ];
    
    const response = await llmService.createCompletion(messages);
    
    try {
      const oids = JSON.parse(response.content);
      return Array.isArray(oids) ? oids : [];
    } catch (e) {
      console.error("Error parsing OID extraction:", e);
      return [];
    }
  } catch (error) {
    console.error("Error calling LLM API:", error);
    return [];
  }
}

module.exports = {
  extractValueSetIdentifiersFromCQL
};