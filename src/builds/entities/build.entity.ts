import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('builds')
export class Build {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  class!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  test_info!: string;

  @Column('text', { nullable: true })
  stats!: string;

  @Column('text', { nullable: true })
  skills!: string;

  @Column('text', { nullable: true })
  gear!: string;

  @Column({ nullable: true })
  video_url!: string;

  @Column({ nullable: true })
  save_url!: string;

  @Column({ nullable: true })
  rating!: number;

  @Column({ nullable: true })
  guide_url!: string;

  @Column('text', { nullable: true })
  description!: string;

  // null = 原有資料；'build-journal' = 由 fetch-build-journal 匯入
  @Column({ nullable: true })
  source!: string;
}
