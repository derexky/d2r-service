import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('base_items')
export class BaseItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  item_id!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column()
  gid!: string;

  @Column()
  category!: string;

  @Column()
  grade!: string;

  @Column({ nullable: true })
  qlvl!: number;

  @Column({ nullable: true })
  max_sockets!: number;

  @Column({ nullable: true })
  image_path!: string;

  @Column('text', { nullable: true })
  attrs!: string;
}
