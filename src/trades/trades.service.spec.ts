import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TradesService } from './trades.service';
import { Trade } from './entities/trade.entity';

let mockRepo: { find: jest.Mock; save: jest.Mock; create: jest.Mock };

describe('TradesService', () => {
  let service: TradesService;

  beforeEach(async () => {
    mockRepo = { find: jest.fn(), save: jest.fn(), create: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        TradesService,
        { provide: getRepositoryToken(Trade), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<TradesService>(TradesService);
  });

  it('findAll passes category filter', async () => {
    mockRepo.find.mockResolvedValue([]);
    await service.findAll({ category: 'rings' });
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { category: 'rings' },
      order: { created_at: 'DESC' },
    });
  });

  it('findAll with no category omits where filter', async () => {
    mockRepo.find.mockResolvedValue([]);
    await service.findAll({});
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {},
      order: { created_at: 'DESC' },
    });
  });

  it('create saves and returns new trade', async () => {
    const body = {
      item_name: 'SOJ',
      item_stats_raw: '+1 all skills',
      price: '3 Ber',
      contact: 'abc#1234',
      category: 'rings',
    };
    mockRepo.create.mockReturnValue(body);
    mockRepo.save.mockResolvedValue({ id: 1, ...body });
    const result = await service.create(body);
    expect(result).toMatchObject({ id: 1, item_name: 'SOJ', price: '3 Ber' });
    expect(mockRepo.create).toHaveBeenCalledWith(body);
    expect(mockRepo.save).toHaveBeenCalledWith(body);
  });
});
