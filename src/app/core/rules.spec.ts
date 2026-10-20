import { DEFAULT_RULES, parseRules } from './rules';

describe('parseRules', () => {
  it('reads a title, numbered rules, sub-points and follow-up paragraphs', () => {
    const text = [
      '# Pravila lige',
      'Uvod.',
      '1. Prvo pravilo',
      '',
      '2. Drugo pravilo:',
      '- prva podtočka',
      '- druga podtočka',
      'Nastavak drugog pravila.',
    ].join('\n');

    expect(parseRules(text)).toEqual([
      { kind: 'heading', text: 'Pravila lige' },
      { kind: 'text', text: 'Uvod.' },
      { kind: 'rule', number: 1, parts: [{ kind: 'text', text: 'Prvo pravilo' }] },
      {
        kind: 'rule',
        number: 2,
        parts: [
          { kind: 'text', text: 'Drugo pravilo:' },
          { kind: 'list', items: ['prva podtočka', 'druga podtočka'] },
          { kind: 'text', text: 'Nastavak drugog pravila.' },
        ],
      },
    ]);
  });

  it('understands text pasted from Word: tabs after numbers and "o" bullets', () => {
    const text = '7.\tJedno kolo unaprijed:\r\no\todigraš prvu rundu; ili\r\no tome odlučuje voditelj.';
    expect(parseRules(text)).toEqual([
      {
        kind: 'rule',
        number: 7,
        parts: [
          { kind: 'text', text: 'Jedno kolo unaprijed:' },
          { kind: 'list', items: ['odigraš prvu rundu; ili'] },
          { kind: 'text', text: 'o tome odlučuje voditelj.' },
        ],
      },
    ]);
  });

  it('does not take a date in the middle of a sentence for a new rule', () => {
    const blocks = parseRules('6. Ako 1. kolo odigraš 05.10., do 11.10. možeš popraviti.');
    expect(blocks).toHaveLength(1);
  });

  it('has 13 rules by default', () => {
    const rules = parseRules(DEFAULT_RULES).filter((b) => b.kind === 'rule');
    expect(rules.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});
