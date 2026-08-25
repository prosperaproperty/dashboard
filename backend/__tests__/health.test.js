const request = require('supertest');
const app = require('../server');

describe('Health', () => {
  it('GET / returns health info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Property Dashboard API ✓');
    expect(res.body).toHaveProperty('status', 'running');
  });
});
