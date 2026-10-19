import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TradesController } from './trades.controller';
import { getUid } from '../auth/firebase-auth';

jest.mock('../auth/firebase-auth', () => ({ getUid: jest.fn() }));

const uidMock = getUid as jest.Mock;
const req = {} as Request;
const body = {
  item_name: 'SOJ',
  item_stats_raw: null,
  price: '3 Ber',
  contact: 'a#1',
  category: 'rings',
};

describe('TradesController', () => {
  let service: { findAll: jest.Mock; create: jest.Mock; remove: jest.Mock };
  let tradeItems: { all: jest.Mock; find: jest.Mock };
  let controller: TradesController;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      remove: jest.fn().mockResolvedValue({ id: 1 }),
    };
    tradeItems = { all: jest.fn().mockResolvedValue([]), find: jest.fn() };
    controller = new TradesController(service, tradeItems as never);
  });

  it('lists trades for signed-out users with a null uid', async () => {
    uidMock.mockResolvedValue(null);
    await controller.findAll(req, 'rings');
    expect(service.findAll).toHaveBeenCalledWith(
      { category: 'rings', item_ref: undefined },
      null,
    );
  });

  it('rejects create without sign-in', async () => {
    uidMock.mockResolvedValue(null);
    await expect(controller.create(req, body)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates with the signed-in uid', async () => {
    uidMock.mockResolvedValue('u1');
    await controller.create(req, body);
    expect(service.create).toHaveBeenCalledWith(body, 'u1');
  });

  it('rejects an unknown item_ref', async () => {
    uidMock.mockResolvedValue('u1');
    tradeItems.find.mockResolvedValue(undefined);
    await expect(
      controller.create(req, { ...body, item_ref: 'item:999' }),
    ).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('accepts a known item_ref', async () => {
    uidMock.mockResolvedValue('u1');
    tradeItems.find.mockResolvedValue({ ref: 'item:1' });
    await controller.create(req, { ...body, item_ref: 'item:1' });
    expect(service.create).toHaveBeenCalled();
  });

  it('serves the item list', async () => {
    tradeItems.all.mockResolvedValue([{ ref: 'misc:pk1' }]);
    expect(await controller.items()).toEqual({ data: [{ ref: 'misc:pk1' }] });
  });

  it('rejects delete without sign-in', async () => {
    uidMock.mockResolvedValue(null);
    await expect(controller.remove(req, 1)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('deletes with the signed-in uid', async () => {
    uidMock.mockResolvedValue('u1');
    await controller.remove(req, 7);
    expect(service.remove).toHaveBeenCalledWith(7, 'u1');
  });
});
