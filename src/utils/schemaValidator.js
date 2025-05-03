function validateInput(schema, input) {
    const errors = [];
    
    for (const [key, type] of Object.entries(schema)) {
      // Check if required field is missing
      if (!type.includes('?') && (input[key] === undefined || input[key] === null)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }
      
      // Skip validation for optional fields if not provided
      if (type.includes('?') && (input[key] === undefined || input[key] === null)) {
        continue;
      }
      
      // Validate type
      const baseType = type.replace('?', '');
      
      if (baseType === 'string' && typeof input[key] !== 'string') {
        errors.push(`Field ${key} must be a string`);
      } else if (baseType === 'string[]' && (!Array.isArray(input[key]) || !input[key].every(item => typeof item === 'string'))) {
        errors.push(`Field ${key} must be an array of strings`);
      } else if (baseType === 'object' && (typeof input[key] !== 'object' || Array.isArray(input[key]))) {
        errors.push(`Field ${key} must be an object`);
      }
    }
    
    return errors.length > 0 ? errors : null;
  }
  
  module.exports = { validateInput };