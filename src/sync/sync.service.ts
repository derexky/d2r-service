import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { BaseItem } from '../base-items/entities/base-item.entity';
import { TradeItemsService } from '../trades/trade-items.service';

@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(BaseItem)
    private readonly baseItemRepo: Repository<BaseItem>,
    private readonly tradeItems: TradeItemsService,
  ) {}

  async onApplicationBootstrap() {
    const outDir =
      process.env.FE_PUBLIC_DATA_DIR ??
      path.resolve(process.cwd(), '../d2r-fe/public/data');

    try {
      fs.mkdirSync(outDir, { recursive: true });

      const [tradeItems, baseItems] = await Promise.all([
        this.tradeItems.all(),
        this.baseItemRepo.find({ select: { name_zh: true } }),
      ]);

      // served as a static file so the trade pages never call the API for it
      fs.writeFileSync(
        path.join(outDir, 'trade-items.json'),
        JSON.stringify(tradeItems),
      );
      fs.writeFileSync(
        path.join(outDir, 'base-item-names.json'),
        JSON.stringify(baseItems.map((i) => i.name_zh).filter(Boolean)),
      );

      this.logger.log(`Synced item names → ${outDir}`);
    } catch (err: unknown) {
      this.logger.warn(`Failed to sync item names: ${(err as Error).message}`);
    }
  }
}
