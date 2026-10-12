import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityMetadata } from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';

export type ColumnKind = 'number' | 'boolean' | 'text' | 'string';

export function columnKind(c: ColumnMetadata): ColumnKind {
  const t = (
    typeof c.type === 'function' ? c.type.name : String(c.type)
  ).toLowerCase();
  if (/int|float|double|number|decimal|real/.test(t)) return 'number';
  if (/bool/.test(t)) return 'boolean';
  if (/text|json/.test(t)) return 'text';
  return 'string';
}

// 只保留 entity 定義過的欄位；better-sqlite3 不能綁 boolean／物件，需轉成 0/1 與 JSON 字串
export function toRow(meta: EntityMetadata, body: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of meta.columns) {
    const k = c.databaseName;
    if (c.isGenerated || !(k in body)) continue;
    const v = body[k];
    if (typeof v === 'boolean') row[k] = v ? 1 : 0;
    else if (v !== null && typeof v === 'object') row[k] = JSON.stringify(v);
    else row[k] = v;
  }
  if (!Object.keys(row).length)
    throw new BadRequestException('沒有可寫入的欄位');
  return row;
}

const q = (name: string) => `"${name}"`;

export interface ListQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  sort?: string;
  order?: string;
  [filter: string]: string | undefined;
}

@Injectable()
export class AdminService {
  constructor(private readonly ds: DataSource) {}

  tables() {
    return this.ds.entityMetadatas
      .map((m) => ({
        table: m.tableName,
        primary: m.primaryColumns[0]?.databaseName,
        columns: m.columns.map((c) => ({
          name: c.databaseName,
          kind: columnKind(c),
          nullable: c.isNullable,
          generated: !!c.isGenerated,
        })),
      }))
      .sort((a, b) => a.table.localeCompare(b.table));
  }

  private meta(table: string) {
    const m = this.ds.entityMetadatas.find((x) => x.tableName === table);
    if (!m) throw new NotFoundException(`未知的資料表：${table}`);
    return { m, pk: m.primaryColumns[0].databaseName };
  }

  async list(table: string, query: ListQuery) {
    const { m, pk } = this.meta(table);
    const {
      page = '1',
      pageSize = '20',
      search,
      sort,
      order,
      ...filters
    } = query;
    const cols = new Set(m.columns.map((c) => c.databaseName));
    const qb = this.ds.createQueryBuilder().from(m.tableName, 't');

    Object.entries(filters).forEach(([k, v], i) => {
      if (cols.has(k) && v !== undefined)
        qb.andWhere(`t.${q(k)} = :f${i}`, { [`f${i}`]: v });
    });
    if (search) {
      const textCols = m.columns.filter((c) =>
        ['string', 'text'].includes(columnKind(c)),
      );
      qb.andWhere(
        new Brackets((w) => {
          for (const c of textCols)
            w.orWhere(`t.${q(c.databaseName)} LIKE :search`);
        }),
      ).setParameter('search', `%${search}%`);
    }

    const size = Math.min(Math.max(+pageSize || 20, 1), 500);
    const { n } = (await qb
      .clone()
      .select('COUNT(*)', 'n')
      .getRawOne<{ n: number }>()) ?? { n: 0 };
    const data = await qb
      .select('*')
      .orderBy(
        `t.${q(sort && cols.has(sort) ? sort : pk)}`,
        order === 'desc' ? 'DESC' : 'ASC',
      )
      .limit(size)
      .offset((Math.max(+page || 1, 1) - 1) * size)
      .getRawMany();
    return { data, total: Number(n) };
  }

  async get(table: string, id: string) {
    const { m, pk } = this.meta(table);
    const [row] = await this.run(
      `SELECT * FROM ${q(m.tableName)} WHERE ${q(pk)} = ?`,
      [id],
    );
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(table: string, body: Record<string, unknown>) {
    const { m } = this.meta(table);
    const row = toRow(m, body);
    const keys = Object.keys(row);
    const [created] = await this.run(
      `INSERT INTO ${q(m.tableName)} (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) RETURNING *`,
      Object.values(row),
    );
    return created;
  }

  async update(table: string, id: string, body: Record<string, unknown>) {
    const { m, pk } = this.meta(table);
    const row = toRow(m, body);
    const sets = Object.keys(row)
      .map((k) => `${q(k)} = ?`)
      .join(', ');
    const [updated] = await this.run(
      `UPDATE ${q(m.tableName)} SET ${sets} WHERE ${q(pk)} = ? RETURNING *`,
      [...Object.values(row), id],
    );
    if (!updated) throw new NotFoundException();
    return updated;
  }

  async remove(table: string, id: string) {
    const { m, pk } = this.meta(table);
    const [deleted] = await this.run(
      `DELETE FROM ${q(m.tableName)} WHERE ${q(pk)} = ? RETURNING *`,
      [id],
    );
    if (!deleted) throw new NotFoundException();
    return deleted;
  }

  // SQLite 約束錯誤（NOT NULL、FK、UNIQUE）回 400 而非 500
  private async run(
    sql: string,
    params: unknown[],
  ): Promise<Record<string, unknown>[]> {
    try {
      return await this.ds.query(sql, params);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
