import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Item } from '../items/entities/item.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';

@Injectable()
export class SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(BaseItem) private readonly baseItemRepo: Repository<BaseItem>,
  ) {}

  async onApplicationBootstrap() {
    const outDir =
      process.env.FE_PUBLIC_DATA_DIR ?? path.resolve(process.cwd(), '../d2r-fe/public/data');

    try {
      fs.mkdirSync(outDir, { recursive: true });

      const [items, baseItems] = await Promise.all([
        this.itemRepo.find({ select: { name_zh: true } }),
        this.baseItemRepo.find({ select: { name_zh: true } }),
      ]);

      fs.writeFileSync(
        path.join(outDir, 'item-names.json'),
        JSON.stringify(items.map((i) => i.name_zh).filter(Boolean)),
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
