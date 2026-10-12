import { Column, Entity, PrimaryColumn } from 'typeorm';

// 高等級經驗值衰減：實得經驗 = 原始經驗 × ratio / 1024
@Entity('experience_ratios')
export class ExperienceRatio {
  @PrimaryColumn()
  level!: number;

  @Column()
  ratio!: number;
}
