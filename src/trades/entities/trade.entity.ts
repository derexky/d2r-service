import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  item_name!: string;

  @Column('text', { nullable: true })
  item_stats_raw!: string | null;

  @Column()
  price!: string;

  @Column()
  contact!: string;

  @Column({ nullable: true })
  category!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
