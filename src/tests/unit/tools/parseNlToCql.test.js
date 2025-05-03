const { parseNlToCql } = require('../../../src/tools/parseNlToCql');

jest.mock('../../../src/services/openaiService', () => ({
  openaiClient: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }
}));

describe('Parse Natural Language to CQL Tool', () => {
  test('Successfully converts natural language to CQL', async () => {
    // Mock OpenAI response
    const mockResponse = {
      choices: [{
        message: {
          content: 'library TestCQL\nusing FHIR version \'4.0.1\'\ncontext Patient'
        }
      }]
    };
    
    require('../../../src/services/openaiService').openaiClient.chat.completions.create.mockResolvedValue(mockResponse);
    
    const result = await parseNlToCql("Find patients with type 2 diabetes");
    
    expect(result).toHaveProperty('cql');
    expect(result).toHaveProperty('valueSetReferences');
    expect(Array.isArray(result.valueSetReferences)).toBe(true);
  });
});