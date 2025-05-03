const express = require('express');
const router = express.Router();
const { parseNlToCql } = require('../../tools/parseNlToCql');
const { validateRequest } = require('../middleware/validator');
const { toolDefinitions } = require('../../config/toolDefinitions');

// Get available tools
router.get('/', (req, res) => {
  res.json(toolDefinitions);
});

// Parse NL to CQL endpoint
router.post('/parse-nl-to-cql', validateRequest('parse-nl-to-cql'), async (req, res, next) => {
  try {
    const { query } = req.body;
    const result = await parseNlToCql(query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;