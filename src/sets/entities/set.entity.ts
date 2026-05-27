import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { SetMember } from './set-member.entity';
import { SetBonus } from './set-bonus.entity';

@Entity('item_sets')
export class ItemSet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column({ nullable: true })
  tier!: string;

  @OneToMany(() => SetMember, (m) => m.set, { cascade: true })
  members!: SetMember[];

  @OneToMany(() => SetBonus, (b) => b.set, { cascade: true })
  bonuses!: SetBonus[];
}
