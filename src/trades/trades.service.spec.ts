import { HttpException } from '@nestjs/common';
import { TradesService } from './trades.service';

describe('TradesService', () => {
  const service = new TradesService();
  let fetchMock: jest.SpyInstance;

  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('findAll passes category filter to traderie', async () => {
    reply(200, []);
    await service.findAll({ category: 'rings' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(
      /\/api\/trades\?category=rings$/,
    );
  });

  it('findAll with no category omits the query', async () => {
    reply(200, []);
    await service.findAll({});
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/api\/trades$/);
  });

  it('create posts the trade and returns traderie row', async () => {
    const body = {
      item_name: 'SOJ',
      item_stats_raw: '+1 all skills',
      price: '3 Ber',
      contact: 'abc#1234',
      category: 'rings',
    };
    reply(201, { id: 1, ...body });
    const result = await service.create(body);
    expect(result).toMatchObject({ id: 1, item_name: 'SOJ' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('passes traderie errors through with status', async () => {
    reply(400, { message: 'item_name, price, and contact are required' });
    await expect(service.findAll({})).rejects.toThrow(HttpException);
  });
});
