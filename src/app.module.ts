import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { SyncModule } from './sync/sync.module';
import { OcrModule } from './ocr/ocr.module';
import { ItemsModule } from './items/items.module';
import { SetsModule } from './sets/sets.module';
import { RunewordsModule } from './runewords/runewords.module';
import { BuildsModule } from './builds/builds.module';
import { IasModule } from './ias/ias.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { BaseItemsModule } from './base-items/base-items.module';
import { SkillsModule } from './skills/skills.module';
import { TradesModule } from './trades/trades.module';

@Module({
  imports: [
    DatabaseModule,
    ItemsModule,
    SetsModule,
    RunewordsModule,
    BuildsModule,
    IasModule,
    AnnouncementsModule,
    BaseItemsModule,
    SkillsModule,
    TradesModule,
    SyncModule,
    OcrModule,
  ],
})
export class AppModule {}
