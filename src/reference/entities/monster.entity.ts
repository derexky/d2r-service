import { Column, Entity, PrimaryColumn } from 'typeorm';

type Resistances = Record<
  'physical' | 'magic' | 'fire' | 'lightning' | 'cold' | 'poison',
  number
>;

@Entity('monsters')
export class Monster {
  // monster:<id> 或 super:<名稱>
  @PrimaryColumn()
  key!: string;

  @Column()
  monster_id!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column({ nullable: true })
  family!: string;

  @Column({ nullable: true })
  family_zh!: string;

  // monster／superunique
  @Column({ nullable: true })
  kind!: string;

  @Column('simple-json', { nullable: true })
  acts!: number[];

  @Column('simple-json', { nullable: true })
  flags!: string[];

  // [普通, 惡夢, 地獄] 怪物等級
  @Column('simple-json', { nullable: true })
  levels!: number[];

  // 依 [普通, 惡夢, 地獄] 排列
  @Column('simple-json', { nullable: true })
  resistances!: Resistances[];

  @Column({ default: false })
  herald_eligible!: boolean;

  @Column({ default: false })
  terror_eligible!: boolean;

  @Column({ nullable: true })
  image_path!: string;
}
