import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('runes')
export class Rune {
  @PrimaryColumn()
  number!: number;

  @Column()
  code!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column({ nullable: true })
  level!: number;

  @Column({ nullable: true })
  image_path!: string;
}
