import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('affixes')
export class Affix {
  @PrimaryColumn()
  id!: string;

  @Column()
  kind!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column({ nullable: true })
  level!: number;

  @Column({ nullable: true })
  required_level!: number;

  @Column({ nullable: true })
  affix_group!: number;

  @Column({ default: false })
  rare!: boolean;

  @Column('simple-json', { nullable: true })
  types!: string[];

  @Column('simple-json', { nullable: true })
  excluded_types!: string[];

  @Column('simple-json', { nullable: true })
  mods!: { code: string; text: string; variable: boolean }[];
}
