#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');

program
  .name('omop-translator')
  .description('CLI tool for OMOP NLP Translator configuration')
  .version('0.1.0');

program
  .command('set-provider <provider>')
  .description('Set the LLM provider (openai or anthropic)')
  .action((provider) => {
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add LLM_PROVIDER
    if (envContent.includes('LLM_PROVIDER=')) {
      envContent = envContent.replace(/LLM_PROVIDER=.*/, `LLM_PROVIDER=${provider}`);
    } else {
      envContent += `\nLLM_PROVIDER=${provider}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(`LLM provider set to: ${provider}`);
  });

program
  .command('get-provider')
  .description('Get current LLM provider')
  .action(() => {
    require('dotenv').config();
    console.log(`Current LLM provider: ${process.env.LLM_PROVIDER || 'openai (default)'}`);
  });

program.parse();