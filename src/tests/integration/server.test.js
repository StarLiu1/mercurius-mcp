const request = require('supertest');
const app = require('../../src/server');

describe('MCP Server', () => {
  test('GET /tools returns tool definitions', async () => {
    const response = await request(app)
      .get('/tools')
      .expect(200);
    
    expect(response.body).toHaveProperty('parse-nl-to-cql');
    expect(response.body).toHaveProperty('fetch-vsac');
    expect(response.body).toHaveProperty('map-to-omop');
    expect(response.body).toHaveProperty('generate-sql');
  });
  
  test('POST /tools/parse-nl-to-cql with valid input', async () => {
    const response = await request(app)
      .post('/tools/parse-nl-to-cql')
      .send({ query: "Find patients with diabetes" })
      .expect(200);
    
    expect(response.body).toHaveProperty('cql');
    expect(response.body).toHaveProperty('valueSetReferences');
  });
  
  test('POST /tools/parse-nl-to-cql with invalid input returns 400', async () => {
    const response = await request(app)
      .post('/tools/parse-nl-to-cql')
      .send({ incorrectField: "test" })
      .expect(400);
    
    expect(response.body).toHaveProperty('errors');
  });
});