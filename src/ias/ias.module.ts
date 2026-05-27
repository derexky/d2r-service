import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IasBreakpoint } from './entities/ias-breakpoint.entity';
import { IasService } from './ias.service';
import { IasController } from './ias.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IasBreakpoint])],
  providers: [IasService],
  controllers: [IasController],
})
export class IasModule {}
