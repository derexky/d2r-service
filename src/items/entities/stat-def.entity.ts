import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ItemStat } from './item-stat.entity';

@Entity('stat_defs')
@Unique(['label_zh', 'value_type'])
export class StatDef {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  abbrev!: string;

  @Column()
  label_zh!: string;

  @Column({ nullable: true })
  label_en!: string;

  @Column()
  value_type!: string;

  // canonical game property key, shared with affixes.mods[].stat (scripts/d2props.py)
  @Column({ nullable: true })
  code!: string;

  @OneToMany(() => ItemStat, (stat: ItemStat) => stat.stat_def)
  item_stats!: ItemStat[];
}
