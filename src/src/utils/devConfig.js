// Development utility to switch providers
function switchProvider(provider) {
    if (['openai', 'anthropic'].includes(provider)) {
      process.env.LLM_PROVIDER = provider;
      console.log(`Switched to ${provider}`);
      return provider;
    } else {
      throw new Error('Invalid provider. Use "openai" or "anthropic"');
    }
  }
  
  // Example usage in development
  if (process.env.NODE_ENV === 'development') {
    // You can call this function from a REPL or debug console
    global.switchProvider = switchProvider;
  }
  
  module.exports = { switchProvider };