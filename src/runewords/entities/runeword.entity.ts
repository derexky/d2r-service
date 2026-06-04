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

  @Column({ nullable: true })
  version!: string;

  @Column('text', { nullable: true })
  effects!: string;

  @Column('text', { nullable: true })
  stat_labels!: string;

  @OneToMany(() => RunewordStat, (stat: RunewordStat) => stat.runeword)
  stat_list!: RunewordStat[];
}
