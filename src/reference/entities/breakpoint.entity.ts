import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('breakpoints')
export class Breakpoint {
  // `${type}:${key}`，例：fcr:sorceress
  @PrimaryColumn()
  id!: string;

  // fcr（快速施法）／fbr（快速格擋）／fhr（快速打擊恢復）
  @Column()
  type!: string;

  @Column()
  key!: string;

  @Column()
  label!: string;

  @Column('text', { nullable: true })
  note!: string;

  // [所需數值, 動畫幀數][]
  @Column('simple-json')
  pairs!: [number, number][];
}
