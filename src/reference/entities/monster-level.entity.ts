import { Column, Entity, PrimaryColumn } from 'typeorm';

type LevelStats = {
  hp: number;
  defense: number;
  attackRating: number;
  damage: number;
  experience: number;
};

// 各怪物等級在三種難度下的基礎數值（monstats 百分比的基準值）
@Entity('monster_levels')
export class MonsterLevel {
  @PrimaryColumn()
  level!: number;

  @Column('simple-json', { nullable: true })
  normal!: LevelStats;

  @Column('simple-json', { nullable: true })
  nightmare!: LevelStats;

  @Column('simple-json', { nullable: true })
  hell!: LevelStats;
}
