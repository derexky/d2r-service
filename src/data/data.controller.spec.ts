import { ocrTerms } from './data.controller';

describe('ocrTerms', () => {
  it('splits text into unique, sorted CJK runs of two or more characters', () => {
    expect(
      ocrTerms([
        '+3 所有技能',
        null,
        '增加 20% 攻擊速度',
        '所有技能',
        '火 抗性',
      ]),
    ).toEqual(['增加', '所有技能', '抗性', '攻擊速度'].sort());
  });
});
