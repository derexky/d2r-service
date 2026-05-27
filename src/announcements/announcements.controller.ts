import { Controller, Get } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  async findAll() {
    const data = await this.service.findAll();
    return { data, total: data.length };
  }
}
