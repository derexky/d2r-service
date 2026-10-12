import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('mercenaries')
export class Mercenary {
  @PrimaryColumn()
  key!: string;

  @Column()
  label!: string;

  @Column({ nullable: true })
  act!: number;

  @Column({ nullable: true })
  min_level!: number;

  @Column({ nullable: true })
  equipment!: string;

  @Column('simple-json', { nullable: true })
  skills!: string[];

  // 各等級門檻的素質與每級成長，例：{ Level, HP, "HP/Lvl", Defense, ... }
  @Column('simple-json', { nullable: true })
  points!: Record<string, number>[];
}
