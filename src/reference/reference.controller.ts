import { Controller, Get, Query } from '@nestjs/common';
import { ReferenceService } from './reference.service';

@Controller()
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('affixes')
  findAffixes(
    @Query() query: { kind?: string; type?: string; search?: string },
  ) {
    return this.referenceService.findAffixes(query);
  }

  @Get('runes')
  findRunes() {
    return this.referenceService.findRunes();
  }

  @Get('socket-bases')
  findSocketBases(@Query() query: { type?: string; search?: string }) {
    return this.referenceService.findSocketBases(query);
  }

  @Get('mercenaries')
  findMercenaries() {
    return this.referenceService.findMercenaries();
  }
}
