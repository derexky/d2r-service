import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ItemsModule } from './items/items.module';
import { SetsModule } from './sets/sets.module';
import { RunewordsModule } from './runewords/runewords.module';
import { BuildsModule } from './builds/builds.module';
import { IasModule } from './ias/ias.module';
import { AnnouncementsModule } from './announcements/announcements.module';

@Module({
  imports: [
    DatabaseModule,
    ItemsModule,
    SetsModule,
    RunewordsModule,
    BuildsModule,
    IasModule,
    AnnouncementsModule,
  ],
})
export class AppModule {}
