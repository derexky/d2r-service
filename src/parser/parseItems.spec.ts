import { normalizeLabel } from './parseItems';

describe('normalizeLabel', () => {
  it('strips class restrictions from ordinary skill labels', () => {
    expect(normalizeLabel('火焰風暴 (限德魯依)')).toBe('火焰風暴');
  });

  it('keeps the restriction on attribute names that collide with paladin auras', () => {
    // "+2 精力 (限聖騎士)" is the Vigor aura skill, "+15 精力" is the Energy attribute
    expect(normalizeLabel('精力 (限聖騎士)')).toBe('精力（限聖騎士）');
    expect(normalizeLabel('力量 (限聖騎士)')).toBe('力量（限聖騎士）');
    expect(normalizeLabel('精力')).toBe('精力');
  });
});
