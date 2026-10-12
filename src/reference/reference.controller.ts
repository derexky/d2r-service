import { Controller, Get, Param, Query } from '@nestjs/common';
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

  @Get('mercenaries')
  findMercenaries() {
    return this.referenceService.findMercenaries();
  }

  @Get('breakpoints')
  findBreakpoints(@Query('type') type?: string) {
    return this.referenceService.findBreakpoints({ type });
  }

  @Get('experience-ratios')
  findExperienceRatios() {
    return this.referenceService.findExperienceRatios();
  }

  @Get('monster-levels')
  findMonsterLevels() {
    return this.referenceService.findMonsterLevels();
  }

  @Get('monsters')
  findMonsters(
    @Query()
    query: {
      search?: string;
      family?: string;
      kind?: string;
      act?: string;
    },
  ) {
    return this.referenceService.findMonsters(query);
  }

  // key 含冒號（monster:xxx / super:xxx），呼叫端需 encodeURIComponent
  @Get('monsters/:key')
  findMonster(@Param('key') key: string) {
    return this.referenceService.findMonster(key);
  }
}
