import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('crafted_items')
export class CraftedItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  category!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  base_type!: string;

  @Column('text')
  ingredients!: string;

  @Column('text')
  fixed_effects!: string;
}
