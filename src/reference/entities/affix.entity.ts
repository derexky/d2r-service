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

  // game property codes (properties.txt); min/max are raw game values, see `stats` for display text
  @Column('simple-json', { nullable: true })
  mods!: { code: string; param: number | string; min: number; max: number }[];

  // itemtypes.txt codes the affix spawns on (`types` holds the d2r.world category gids)
  @Column('simple-json', { nullable: true })
  item_types!: string[];

  @Column({ nullable: true })
  class_specific!: string;

  @Column('simple-json', { nullable: true })
  stats!: string[];
}
