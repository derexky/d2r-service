import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(process.cwd(), 'd2r.sqlite'),
      entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
      synchronize: true,
    }),
  ],
})
export class DatabaseModule {}
