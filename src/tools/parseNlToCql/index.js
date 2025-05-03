const { parseToCql } = require('./parser');
const { extractValueSetIdentifiersFromCQL } = require('./extractors');

async function parseNlToCql(query) {
  try {
    const cql = await parseToCql(query);
    const valueSetReferences = await extractValueSetIdentifiersFromCQL(cql);
    
    return {
      cql,
      valueSetReferences
    };
  } catch (error) {
    console.error("Error in parseNlToCql:", error);
    throw error;
  }
}

module.exports = { parseNlToCql };