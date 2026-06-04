import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseItem } from '../../base-items/entities/base-item.entity';
import { ItemStat } from './item-stat.entity';

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
  image_path!: string;

  @Column({ nullable: true })
  base_type_zh!: string;

  @Column({ nullable: true })
  base_type_en!: string;

  @Column({ nullable: true })
  level_req!: number;

  @Column('text', { nullable: true })
  stats!: string;

  @Column('text', { nullable: true })
  stats_v2!: string;

  @Column({ nullable: true })
  baseItemId!: number;

  @ManyToOne(() => BaseItem, { nullable: true })
  @JoinColumn({ name: 'baseItemId' })
  baseItem!: BaseItem;

  @OneToMany(() => ItemStat, (stat: ItemStat) => stat.item)
  stat_list!: ItemStat[];
}
