import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  date!: string;

  @Column('text')
  content!: string;
}
