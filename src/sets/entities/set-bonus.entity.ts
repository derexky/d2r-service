import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ItemSet } from './set.entity';

@Entity('set_bonuses')
export class SetBonus {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ItemSet, (s) => s.bonuses, { onDelete: 'CASCADE' })
  set!: ItemSet;

  @Column()
  pieces_required!: string;

  @Column('text')
  effects!: string;
}
