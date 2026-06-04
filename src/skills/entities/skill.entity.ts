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
}
