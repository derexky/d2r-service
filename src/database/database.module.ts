import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { existsSync, copyFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { DbSyncInterceptor, DbSyncService, gcsObject } from './db-sync.service';

// 沒設 DB_GCS_URI 時用的本機檔案
function getDbPath(): string {
  if (process.env.FUNCTION_NAME || process.env.K_SERVICE) {
    const tmp = '/tmp/d2r.sqlite';
    if (!existsSync(tmp)) {
      copyFileSync(join(process.cwd(), 'd2r.sqlite'), tmp);
    }
    return tmp;
  }
  // myhost 的 admin 把 DB 放在持久化 volume，不用映像檔裡那份
  return process.env.DB_PATH ?? join(process.cwd(), 'd2r.sqlite');
}

@Global()
@Module({
  providers: [
    {
      provide: DbSyncService,
      useFactory: () =>
        new DbSyncService(
          process.env.DB_GCS_URI ? gcsObject(process.env.DB_GCS_URI) : null,
          process.env.DB_GCS_WRITE === 'true',
        ),
    },
    { provide: APP_INTERCEPTOR, useClass: DbSyncInterceptor },
  ],
  exports: [DbSyncService],
})
class DbSyncModule {}

@Module({
  imports: [
    DbSyncModule,
    TypeOrmModule.forRootAsync({
      inject: [DbSyncService],
      useFactory: async (sync: DbSyncService) => ({
        type: 'better-sqlite3',
        database: await sync.init(getDbPath),
        entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {
  constructor(sync: DbSyncService, dataSource: DataSource) {
    sync.attach(dataSource);
  }
}
