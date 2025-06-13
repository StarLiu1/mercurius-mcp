// scripts/test-regex-extraction.js
// Test script to verify regex-based ValueSet OID extraction

import { extractValueSetIdentifiersFromCQL, validateExtractedOids } from '../src/mcp/tools/parseNlToCql/extractors.js';

// Test cases with valueset declaration pattern only
const testCases = [
  {
    name: "Single valueset declaration with single quotes",
    cql: `valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'`,
    expected: ["2.16.840.1.113883.3.464.1003.103.12.1001"]
  },
  {
    name: "Multiple valueset declarations",
    cql: `
      valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "Hypertension": 'urn:oid:2.16.840.1.113883.3.464.1003.104.12.1011'
      valueset "Medications": 'urn:oid:2.16.840.1.113883.3.464.1003.196.12.1001'
    `,
    expected: [
      "2.16.840.1.113883.3.464.1003.103.12.1001",
      "2.16.840.1.113883.3.464.1003.104.12.1011", 
      "2.16.840.1.113883.3.464.1003.196.12.1001"
    ]
  },
  {
    name: "valueset with double quotes (should NOT match)",
    cql: `valueset "Diabetes": "urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001"`,
    expected: [] // Should not match - requires single quotes
  },
  {
    name: "No valueset declarations",
    cql: `define "AgeInYears": AgeInYears()
          define "Female": Patient.gender = 'female'
          define "Test": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001"]`,
    expected: [] // Should not match non-valueset references
  },
  {
    name: "Mixed with non-valueset references (should ignore non-valueset)",
    cql: `
      valueset "WithSingleQuotes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "WithDoubleQuotes": "urn:oid:2.16.840.1.113883.3.464.1003.104.12.1002"
      define "InDefine": [Condition: "urn:oid:2.16.840.1.113883.3.464.1003.105.12.1003"]
    `,
    expected: ["2.16.840.1.113883.3.464.1003.103.12.1001"] // Only the single-quoted valueset
  },
  {
    name: "valueset with non-VSAC OID",
    cql: `valueset "CustomOID": 'urn:oid:1.2.3.4.5.6'`,
    expected: ["1.2.3.4.5.6"]
  },
  {
    name: "valueset with shorter OID format",
    cql: `valueset "ShortOID": 'urn:oid:1.2.3'`,
    expected: ["1.2.3"]
  },
  {
    name: "Real-world CQL with valueset declarations",
    cql: `
      library DiabetesScreening version '1.0.0'
      
      using FHIR version '4.0.1'
      
      include FHIRHelpers version '4.0.1' called FHIRHelpers
      
      valueset "Diabetes": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "HbA1c Laboratory Test": 'urn:oid:2.16.840.1.113883.3.464.1003.198.12.1013'
      valueset "Office Visit": 'urn:oid:2.16.840.1.113883.3.464.1003.101.12.1001'
      
      parameter "Measurement Period" Interval<DateTime>
      
      context Patient
      
      define "Initial Population":
        AgeInYearsAt(start of "Measurement Period") >= 18
        
      define "Diabetes Diagnosis":
        [Condition: "Diabetes"] C
          where C.clinicalStatus in { 'active', 'recurrence', 'relapse' }
            and Interval[C.onset, C.abatement] overlaps "Measurement Period"
    `,
    expected: [
      "2.16.840.1.113883.3.464.1003.103.12.1001",
      "2.16.840.1.113883.3.464.1003.198.12.1013",
      "2.16.840.1.113883.3.464.1003.101.12.1001"
    ]
  },
  {
    name: "Invalid OID format in valueset",
    cql: `
      valueset "Invalid": 'urn:oid:invalid.format'
      valueset "Valid": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "NoOid": 'some-other-reference'
    `,
    expected: ["2.16.840.1.113883.3.464.1003.103.12.1001"] // Only valid OID format
  },
  {
    name: "Duplicate valueset declarations",
    cql: `
      valueset "Test1": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "Test2": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
      valueset "Test3": 'urn:oid:2.16.840.1.113883.3.464.1003.104.12.1002'
    `,
    expected: [
      "2.16.840.1.113883.3.464.1003.103.12.1001",
      "2.16.840.1.113883.3.464.1003.104.12.1002"
    ] // Should deduplicate
  }
];

async function runTests() {
  console.log("🧪 Testing valueset declaration regex-based ValueSet OID extraction\n");
  console.log("📋 Pattern used: (valueset\\s\".+\":\\s')(urn:oid:)((\\d+\\.)*\\d+)(')");
  console.log("🎯 Extracts group 3: the OID part\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.name}`);
    
    try {
      const extracted = await extractValueSetIdentifiersFromCQL(testCase.cql);
      const validation = validateExtractedOids(extracted);
      
      // Sort arrays for comparison
      const extractedSorted = extracted.sort();
      const expectedSorted = testCase.expected.sort();
      
      // Check if arrays are equal
      const arraysEqual = extractedSorted.length === expectedSorted.length &&
        extractedSorted.every((val, index) => val === expectedSorted[index]);
      
      if (arraysEqual) {
        console.log(`  ✅ PASSED`);
        console.log(`  📊 Extracted: ${extracted.length} OIDs`);
        if (validation.warnings.length > 0) {
          console.log(`  ⚠️  Warnings: ${validation.warnings.length}`);
        }
        passed++;
      } else {
        console.log(`  ❌ FAILED`);
        console.log(`  📊 Expected: [${expectedSorted.join(', ')}]`);
        console.log(`  📊 Got:      [${extractedSorted.join(', ')}]`);
        failed++;
      }
      
      // Show validation details for failed cases
      if (!arraysEqual && validation.invalid.length > 0) {
        console.log(`  🔍 Invalid OIDs found: [${validation.invalid.join(', ')}]`);
      }
      
    } catch (error) {
      console.log(`  💥 ERROR: ${error.message}`);
      failed++;
    }
    
    console.log(''); // Empty line between tests
  }
  
  // Summary
  console.log("📈 Test Summary:");
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log("\n🎉 All tests passed! Regex extraction is working correctly.");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please review the regex patterns.`);
  }
  
  return { passed, failed };
}

// Performance test
async function performanceTest() {
  console.log("\n⚡ Performance Test: valueset declaration regex extraction");
  
  const largeCql = `
    library LargeExample version '1.0.0'
    
    valueset "VS1": 'urn:oid:2.16.840.1.113883.3.464.1003.103.12.1001'
    valueset "VS2": 'urn:oid:2.16.840.1.113883.3.464.1003.104.12.1002'
    valueset "VS3": 'urn:oid:2.16.840.1.113883.3.464.1003.105.12.1003'
    valueset "VS4": 'urn:oid:2.16.840.1.113883.3.464.1003.106.12.1004'
    valueset "VS5": 'urn:oid:2.16.840.1.113883.3.464.1003.107.12.1005'
    
    valueset "VS6": 'urn:oid:2.16.840.1.113883.3.464.1003.108.12.1006'
    valueset "VS7": 'urn:oid:2.16.840.1.113883.3.464.1003.109.12.1007'
    valueset "VS8": 'urn:oid:2.16.840.1.113883.3.464.1003.110.12.1008'
    valueset "VS9": 'urn:oid:2.16.840.1.113883.3.464.1003.111.12.1009'
    valueset "VS10": 'urn:oid:2.16.840.1.113883.3.464.1003.112.12.1010'
  `.repeat(10); // Repeat to make it larger
  
  const iterations = 100;
  
  console.log(`  📏 CQL size: ${largeCql.length} characters`);
  console.log(`  🔄 Iterations: ${iterations}`);
  
  // Time regex extraction
  const startTime = Date.now();
  for (let i = 0; i < iterations; i++) {
    await extractValueSetIdentifiersFromCQL(largeCql);
  }
  const endTime = Date.now();
  
  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;
  
  console.log(`  ⏱️  Total time: ${totalTime}ms`);
  console.log(`  📊 Average per extraction: ${avgTime.toFixed(2)}ms`);
  console.log(`  🚀 Estimated speedup vs LLM: ~100-1000x faster`);
}

// Main execution
async function main() {
  const results = await runTests();
  await performanceTest();
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runTests, performanceTest };