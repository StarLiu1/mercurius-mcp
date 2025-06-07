// scripts/test-vsac.js
import vsacService from '../src/services/vsacService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testVsacIntegration() {
  console.log('🧪 Testing VSAC Integration...\n');

  // Check environment variables
  const username = process.env.VSAC_USERNAME;
  const password = process.env.VSAC_PASSWORD;

  if (!username || !password) {
    console.error('❌ Error: VSAC_USERNAME and VSAC_PASSWORD environment variables are required');
    console.error('Add them to your .env file:');
    console.error('VSAC_USERNAME=your_username');
    console.error('VSAC_PASSWORD=your_password');
    process.exit(1);
  }

  // Test cases - common VSAC value sets
  const testValueSets = [
    {
      name: 'Essential Hypertension',
      oid: '2.16.840.1.113883.3.464.1003.104.12.1011',
      description: 'Common hypertension value set'
    },
    {
      name: 'Diabetes',
      oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
      description: 'Diabetes mellitus value set'
    }
  ];

  for (const testCase of testValueSets) {
    console.log(`📋 Testing: ${testCase.name} (${testCase.oid})`);
    console.log(`   Description: ${testCase.description}`);

    try {
      const startTime = Date.now();
      const concepts = await vsacService.retrieveValueSet(
        testCase.oid,
        null, // latest version
        username,
        password
      );
      const endTime = Date.now();

      console.log(`✅ Success! Retrieved ${concepts.length} concepts in ${endTime - startTime}ms`);

      if (concepts.length > 0) {
        const sample = concepts[0];
        console.log(`   Sample concept:`, {
          code: sample.code,
          codeSystem: sample.codeSystemName,
          displayName: sample.displayName
        });

        const codeSystemsFound = [...new Set(concepts.map(c => c.codeSystemName))];
        console.log(`   Code systems found: ${codeSystemsFound.join(', ')}`);
      } else {
        console.log(`   ⚠️  Warning: No concepts found for this value set`);
      }

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }

    console.log(''); // Empty line for readability
  }

  // Test cache functionality
  console.log('🗄️  Testing cache functionality...');
  const cacheStats = vsacService.getCacheStats();
  console.log(`   Cache size: ${cacheStats.size} value sets`);
  console.log(`   Cached OIDs: ${cacheStats.keys.join(', ') || 'None'}`);

  // Test batch retrieval
  console.log('📦 Testing batch retrieval...');
  const batchOids = testValueSets.map(t => t.oid);
  
  try {
    const startTime = Date.now();
    const batchResults = await vsacService.retrieveMultipleValueSets(
      batchOids,
      username,
      password
    );
    const endTime = Date.now();

    console.log(`✅ Batch retrieval completed in ${endTime - startTime}ms`);
    
    for (const [oid, concepts] of Object.entries(batchResults)) {
      console.log(`   ${oid}: ${concepts.length} concepts`);
    }

  } catch (error) {
    console.log(`❌ Batch retrieval error: ${error.message}`);
  }

  console.log('\n🎉 VSAC integration test completed!');
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testVsacIntegration().catch(console.error);
}