import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IasBreakpoint } from './entities/ias-breakpoint.entity';

interface Breakpoint {
  ias_required: string;
  frames: string;
}

@Injectable()
export class IasService {
  constructor(
    @InjectRepository(IasBreakpoint)
    private readonly repo: Repository<IasBreakpoint>,
  ) {}

  // 取得完整斷點表
  async getTable(merc_type: string, weapon_type?: string) {
    const where: Partial<IasBreakpoint> = { merc_type };
    if (weapon_type) where.weapon_type = weapon_type;
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  // 列出某傭兵的所有武器類型
  async getWeaponTypes(merc_type: string) {
    const rows = await this.repo.find({ where: { merc_type }, select: { weapon_type: true } });
    return [...new Set(rows.map((r) => r.weapon_type))];
  }

  // 計算給定 IAS 值對應的攻速
  async calculate(merc_type: string, weapon_type: string, ias: number) {
    const row = await this.repo.findOne({ where: { merc_type, weapon_type } });
    if (!row) return null;

    const breakpoints: Breakpoint[] = JSON.parse(row.breakpoints);

    let current: Breakpoint | null = null;
    let next: Breakpoint | null = null;

    for (let i = 0; i < breakpoints.length; i++) {
      const required = this.parseIasValue(breakpoints[i].ias_required);
      if (ias >= required) {
        current = breakpoints[i];
        next = breakpoints[i + 1] ?? null;
      } else {
        break;
      }
    }

    if (!current) current = breakpoints[0];

    return {
      frames: current.frames,
      ias_required: current.ias_required,
      next_breakpoint: next
        ? { ias_required: next.ias_required, frames: next.frames }
        : null,
    };
  }

  private parseIasValue(val: string): number {
    if (val.toLowerCase().endsWith('up')) return parseInt(val) || 999;
    return parseInt(val) || 0;
  }
}
