import axios from 'axios';
describe('GET /api/health', () => {
  it('reports the backend process as healthy', async () => {
    const res = await axios.get(`/api/health`);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ health: true });
  });
});
