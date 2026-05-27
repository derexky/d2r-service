import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ias_breakpoints')
export class IasBreakpoint {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  merc_type!: string;

  @Column()
  weapon_type!: string;

  @Column({ nullable: true })
  base_speed!: number;

  @Column('text')
  breakpoints!: string;
}
