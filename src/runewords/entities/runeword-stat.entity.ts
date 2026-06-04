import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Runeword } from './runeword.entity';
import { StatDef } from '../../items/entities/stat-def.entity';
import { Skill } from '../../skills/entities/skill.entity';

@Entity('runeword_stats')
export class RunewordStat {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Runeword, (rw: Runeword) => rw.stat_list, { onDelete: 'CASCADE' })
  @Index()
  runeword!: Runeword;

  @ManyToOne(() => StatDef, { eager: true })
  @Index()
  stat_def!: StatDef;

  @Column()
  sort_order!: number;

  @Column('float', { nullable: true })
  value_min!: number;

  @Column('float', { nullable: true })
  value_max!: number;

  @Column({ default: false })
  is_variable!: boolean;

  @Column({ nullable: true })
  color!: string;

  @ManyToOne(() => Skill, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'skill_id' })
  skill!: Skill | null;

  @Column({ type: 'varchar', nullable: true })
  proc_trigger!: string | null;

  @Column({ type: 'int', nullable: true })
  proc_chance!: number | null;

  @Column({ type: 'int', nullable: true })
  proc_level_min!: number | null;

  @Column({ type: 'int', nullable: true })
  proc_level_max!: number | null;
}
