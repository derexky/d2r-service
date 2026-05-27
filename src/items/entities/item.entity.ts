import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column()
  category!: string;

  @Column()
  tier!: string;

  @Column({ nullable: true })
  class_restrict!: string;

  @Column({ nullable: true })
  image_path!: string;

  @Column({ nullable: true })
  base_type_zh!: string;

  @Column({ nullable: true })
  base_type_en!: string;

  @Column({ nullable: true })
  level_req!: number;

  @Column('text', { nullable: true })
  stats!: string;
}
