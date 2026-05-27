import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { existsSync, copyFileSync } from 'fs';

function getDbPath(): string {
  if (process.env.FUNCTION_NAME || process.env.K_SERVICE) {
    const tmp = '/tmp/d2r.sqlite';
    if (!existsSync(tmp)) {
      copyFileSync(join(process.cwd(), 'd2r.sqlite'), tmp);
    }
    return tmp;
  }
  return join(process.cwd(), 'd2r.sqlite');
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: getDbPath(),
      entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
      synchronize: false,
    }),
  ],
})
export class DatabaseModule {}
