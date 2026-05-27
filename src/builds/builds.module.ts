import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Build } from './entities/build.entity';
import { BuildsService } from './builds.service';
import { BuildsController } from './builds.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Build])],
  providers: [BuildsService],
  controllers: [BuildsController],
})
export class BuildsModule {}
