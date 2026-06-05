import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async detect(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const text = await this.ocrService.detectText(file.buffer);
    return { text };
  }
}
