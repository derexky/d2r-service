import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name_en!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_zh_old!: string;

  @Column()
  class!: string;

  @Column()
  skill_tree!: string;

  @Column({ type: 'varchar', nullable: true })
  skill_type!: string | null;

  @Column({ type: 'int', nullable: true })
  req_level!: number | null;

  @Column({ type: 'varchar', nullable: true })
  kind!: string | null;

  @Column('simple-json', { nullable: true })
  damage!: string[] | null;

  @Column({ type: 'int', nullable: true })
  weapon_percent!: number | null;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  // 數值公式、效果判定、投射物等完整資料；體積大，只在查單一技能時載入
  @Column('simple-json', { nullable: true, select: false })
  detail!: Record<string, unknown> | null;
}
