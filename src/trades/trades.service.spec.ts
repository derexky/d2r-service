import { HttpException } from '@nestjs/common';
import { TradesService } from './trades.service';

const row = (id: number, owner_uid: string | null) => ({
  id,
  item_name: 'SOJ',
  item_stats_raw: null,
  price: '3 Ber',
  contact: 'a#1',
  category: 'rings',
  created_at: '2026-10-19 00:00:00',
  owner_uid,
});

describe('TradesService', () => {
  const service = new TradesService();
  let fetchMock: jest.SpyInstance;

  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const call = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit];

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('findAll passes category filter to traderie', async () => {
    reply(200, []);
    await service.findAll({ category: 'rings' }, null);
    expect(call()[0]).toMatch(/\/api\/trades\?category=rings$/);
  });

  it('findAll hides contact and owner from signed-out users', async () => {
    reply(200, [row(1, 'u1')]);
    const [t] = await service.findAll({}, null);
    expect(t).not.toHaveProperty('contact');
    expect(t).not.toHaveProperty('owner_uid');
    expect(t).toMatchObject({ id: 1, mine: false });
  });

  it('findAll shows contact to signed-in users and marks their own trades', async () => {
    reply(200, [row(1, 'u1'), row(2, 'u2')]);
    const [a, b] = await service.findAll({}, 'u1');
    expect(a).toMatchObject({ contact: 'a#1', mine: true });
    expect(b).toMatchObject({ contact: 'a#1', mine: false });
    expect(a).not.toHaveProperty('owner_uid');
  });

  it('create sends the token uid as owner, ignoring one in the body', async () => {
    reply(201, row(1, 'u1'));
    const result = await service.create(
      {
        item_name: 'SOJ',
        item_stats_raw: null,
        price: '3 Ber',
        contact: 'a#1',
        category: 'rings',
        owner_uid: 'someone-else',
      } as never,
      'u1',
    );
    expect(JSON.parse(call()[1].body as string)).toMatchObject({
      owner_uid: 'u1',
    });
    expect(call()[1].method).toBe('POST');
    expect(result).toMatchObject({ id: 1, mine: true });
    expect(result).not.toHaveProperty('owner_uid');
  });

  it('remove sends id and owner to traderie', async () => {
    reply(200, { id: 5 });
    await service.remove(5, 'u1');
    expect(call()[0]).toMatch(/\/api\/trades\/5\?owner_uid=u1$/);
    expect(call()[1].method).toBe('DELETE');
  });

  it('passes traderie errors through with status', async () => {
    reply(404, { message: 'trade 5 not found' });
    await expect(service.remove(5, 'u1')).rejects.toThrow(HttpException);
  });
});
