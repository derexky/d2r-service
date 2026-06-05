import { Injectable } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';

@Injectable()
export class OcrService {
  private readonly client = new ImageAnnotatorClient();

  async detectText(imageBuffer: Buffer): Promise<string> {
    const [result] = await this.client.documentTextDetection({
      image: { content: imageBuffer.toString('base64') },
    });
    return result.fullTextAnnotation?.text?.trim() ?? '';
  }
}
