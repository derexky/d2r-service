import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ItemSet } from './set.entity';

@Entity('set_members')
export class SetMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ItemSet, (s) => s.members, { onDelete: 'CASCADE' })
  set!: ItemSet;

  @Column()
  item_name_zh!: string;

  @Column({ nullable: true })
  item_name_en!: string;

  @Column({ nullable: true })
  slot!: string;

  @Column('text', { nullable: true })
  stats!: string;
}
