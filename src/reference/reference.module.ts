import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affix } from './entities/affix.entity';
import { Rune } from './entities/rune.entity';
import { SocketBase } from './entities/socket-base.entity';
import { Mercenary } from './entities/mercenary.entity';
import { ReferenceService } from './reference.service';
import { ReferenceController } from './reference.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Affix, Rune, SocketBase, Mercenary])],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
