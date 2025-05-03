const express = require('express');
const router = express.Router();
const config = require('../../config');
const llmService = require('../../services/llmService');

// Get current LLM configuration
router.get('/llm-provider', (req, res) => {
  res.json({
    currentProvider: config.llm.provider,
    availableProviders: ['openai', 'anthropic']
  });
});

// Switch LLM provider dynamically
router.post('/llm-provider', (req, res) => {
  const { provider } = req.body;
  
  if (['openai', 'anthropic'].includes(provider)) {
    // Update configuration
    config.llm.provider = provider;
    process.env.LLM_PROVIDER = provider;
    
    // Note: In production, you might want to reinitialize the LLM service
    // This is a simple implementation that updates the config
    
    res.json({ 
      message: `Switched to ${provider}`,
      currentProvider: provider
    });
  } else {
    res.status(400).json({ 
      error: 'Invalid provider',
      validProviders: ['openai', 'anthropic']
    });
  }
});

// Get usage statistics
router.get('/usage-stats', (req, res) => {
  // If you implemented the usage tracker
  const usageTracker = require('../../middleware/usageTracker');
  res.json(usageTracker.getUsageStats());
});

module.exports = router;