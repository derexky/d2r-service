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

  @Column({ nullable: true })
  class_restrict!: string;

  // 物品等級 1–25 / 26–40 / 41+ 時的打孔上限
  @Column({ nullable: true })
  max_sockets_1!: number;

  @Column({ nullable: true })
  max_sockets_2!: number;

  @Column({ nullable: true })
  max_sockets_3!: number;

  // itemtypes.txt code + ancestors, e.g. ["helm", "armo"]; matched against affixes.item_types
  @Column('simple-json', { nullable: true })
  item_types!: string[];
}
