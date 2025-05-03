const logger = require('../utils/logger');

class UsageTracker {
  constructor() {
    this.usage = {
      openai: { requests: 0, tokens: 0 },
      anthropic: { requests: 0, tokens: 0 }
    };
  }

  trackUsage(provider, tokens) {
    this.usage[provider].requests++;
    this.usage[provider].tokens += tokens;
    
    logger.info(`LLM Usage - Provider: ${provider}, Tokens: ${tokens}`);
  }

  getUsageStats() {
    return this.usage;
  }
}

module.exports = new UsageTracker();