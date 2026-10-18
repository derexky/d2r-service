import { BuildsService } from './builds.service';

describe('BuildsService.findAll', () => {
  it('puts builds with content first and flags empty ones', async () => {
    // repo 已依 rating DESC 排好；service 只負責把沒內容的往後推
    const rows = [
      { id: 1, name: 'empty5', rating: 5 },
      { id: 2, name: 'full4', rating: 4, gear: '[]' },
      { id: 3, name: 'oldFull', rating: null, stats: '{}' },
    ];
    const service = new BuildsService({ find: async () => rows } as any);
    const out = await service.findAll({});
    expect(out.map((b) => b.name)).toEqual(['full4', 'oldFull', 'empty5']);
    expect(out.map((b) => b.has_detail)).toEqual([true, true, false]);
    expect(out[0]).not.toHaveProperty('gear');
  });
});
