import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('runewords')
export class Runeword {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column()
  slot!: string;

  @Column()
  socket_count!: number;

  @Column('text')
  runes!: string;

  @Column({ nullable: true })
  version!: string;

  @Column('text')
  effects!: string;
}
