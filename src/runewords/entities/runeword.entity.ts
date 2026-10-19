import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RunewordStat } from './runeword-stat.entity';

@Entity('runewords')
export class Runeword {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column()
  slot!: string;

  @Column()
  socket_count!: number;

  @Column('text')
  runes!: string;

  @Column('text', { nullable: true })
  effects!: string;

  @Column('text', { nullable: true })
  stat_labels!: string;

  // itemtypes.txt codes it can be made in, e.g. ["swor"]; a base fits when its item_types share one
  @Column('simple-json', { nullable: true })
  item_types!: string[];

  @Column({ name: 'is_only_ladder', default: false })
  isOnlyLadder!: boolean;

  @OneToMany(() => RunewordStat, (stat: RunewordStat) => stat.runeword)
  stat_list!: RunewordStat[];
}
