const { validateInput } = require('../../utils/schemaValidator');
const { toolDefinitions } = require('../../config/toolDefinitions');

function validateRequest(toolName) {
  return (req, res, next) => {
    const tool = toolDefinitions[toolName];
    if (!tool) {
      return res.status(404).json({ error: "Tool not found" });
    }
    
    const errors = validateInput(tool.inputSchema, req.body);
    if (errors) {
      return res.status(400).json({ errors });
    }
    
    next();
  };
}

module.exports = { validateRequest };