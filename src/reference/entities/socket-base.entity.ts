import { Column, Entity, PrimaryColumn } from 'typeorm';

// max_sockets_1/2/3 = 物品等級 1–25 / 26–40 / 41+ 時的打孔上限
@Entity('socket_bases')
export class SocketBase {
  @PrimaryColumn()
  code!: string;

  @Column()
  name_zh!: string;

  @Column({ nullable: true })
  name_en!: string;

  @Column({ nullable: true })
  type!: string;

  @Column({ nullable: true })
  qlvl!: number;

  @Column({ nullable: true })
  max_sockets_1!: number;

  @Column({ nullable: true })
  max_sockets_2!: number;

  @Column({ nullable: true })
  max_sockets_3!: number;

  @Column({ nullable: true })
  image_path!: string;
}
