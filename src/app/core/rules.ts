/**
 * Rules of play, kept as plain text so the admin can edit them in a text box:
 * a line starting with "#" is a title, "1." starts a numbered rule and "-" a sub-point.
 * Any other line is a paragraph of the rule above it.
 */

/** Shown until the admin saves the league's own rules. */
export const DEFAULT_RULES = `# Pravila lige – Jupiters Shade
1. Liga traje 8 kola
2. Igra se layout posljednjeg turnira Icarus Fall, na Udisc platformi je to teren „Jupiters Shade“. Igra se 16 staza. Staza 9 i 10 se ne igraju već se upisuju ko par!!!!
3. Za ukupan rezultat odnosno konačni poredak u obzir će se uzimati samo 5 najboljih rezultata od 8 kola.(dakle tri kola možete bez problema propustiti bez prevelikog utjecaja na ukupan rezultat)
4. Jedno kolo traje jedan tjedan. Iznimno je prvo kolo koje će trajati zaključno s 11.10.
5. Igrači igraju u vremenu kad im odgovara. Moraju imati svjedoka (također sudionik lige) i najaviti igranje kola u Whats App grupi lige da bi se rezultat priznao. Dakle, igra se u grupi od minimalno dva igrača.
Iznimno će biti posljednje kolo kada ćemo pokušati utvrditi fiksni termin za odigravanje (ponajviše zbog proglašenja pobjednika i dodjele simboličnih nagrada).
6. U tekućem tjednu rezultat svakog kola može se pokušati popraviti jednom. Popravnu rundu treba najaviti na isti način kao i prvu, uz ime i broj kola (npr. „Hrvoje Horvat – 1. kolo”). Primjerice, ako 1. kolo odigraš 05.10., do 11.10. možeš odigrati još jednu rundu za popravak rezultata. Tada će se za bodovanje upisati drugi rezultat, bez obzira bio bolji, isti ili lošiji od prvog. Vaš je rizik da li ćete probati popraviti ili ne.
7. Jedno kolo možeš odigrati unaprijed, uz prethodnu najavu. Dok traje 1. kolo, možeš najaviti i odigrati 2. kolo nakon što:
- odigraš prvu i popravnu rundu 1. kola; ili
- odigraš prvu rundu 1. kola i odlučiš da rezultat nećeš popravljati.
U oba slučaja unaprijed odigrana runda upisuje se kao rezultat 2. kola, te i dalje imate pravo na popravni 2. kola.
8. Rezultate možete upisivati kako hoćete: Preporuča se Udisc, ali može i DGmetrix, notes na mobitelu ili klasični papir i olovka. No svakako je potrebno nakon odigrane runde u Whats app grupu poslati screenshot scorecarda ili sliku ako upisujete na papir. Iznimno će biti posljednje kolo kada će se pripremiti DGmetrix za sve igrače.
9. Ne dodjeljuju se bodovi po kolu. Rezultati svih kola se zbrajaju kako bi se dobio poredak.
10. Formirat će se dvije lige, muška i ženska. Ovisno o broju igrača koji će u ligi sudjelovati, moguće su podjele na prvu, drugu i treću ligu za naredni ciklus te utvrđivanje simboličnih kotizacija za nagradni fond. Sudjelovanje u ligi je besplatno dok se ne utvrdi prvi poredak (na kraju lige).
11. Tiebrakeri: Ako dva ili više igrača imaju jednak ukupni rezultat, prednost ima igrač s boljim pojedinačnim rezultatom u jednom kolu. Ako je i on jednak, uspoređuje se sljedeći najbolji rezultat, i tako redom. Primjerice, ako dva igrača nakon svojih 8 najboljih kola imaju ukupno −20, a najbolji pojedinačni rezultat igrača A je −6, a igrača B −5, igrač A bit će bolje plasiran.
U slučaju da se i tada ne može utvrdti pobjednik, izjednačeni igrači igraju sudden death nakon održanog 8. kola počevši od staze 1 sve dok se ne dobije pobjednik.
12. U slučaju iznimno lošeg vremena kroz čitav tjedan, voditelj lige može kolo produljiti i na sljedeći tjedan
13. Voditelj lige je: Aki Vucković`;

export type RulesPart = { kind: 'text'; text: string } | { kind: 'list'; items: string[] };

export type RulesBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'rule'; number: number; parts: RulesPart[] }
  | RulesPart;

const HEADING = /^#+\s*(.*)$/;
const NUMBERED = /^(\d{1,3})[.)](?:\s+(.*))?$/;
// "o" + tab is how Word's sub-bullets arrive when pasted; a plain "o " is the Croatian word.
const BULLET = /^(?:[-•*]\s+|o\t\s*)(.*)$/;

export function parseRules(text: string): RulesBlock[] {
  const blocks: RulesBlock[] = [];
  let rule: { kind: 'rule'; number: number; parts: RulesPart[] } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let match = HEADING.exec(line);
    if (match) {
      rule = null;
      if (match[1]) blocks.push({ kind: 'heading', text: match[1] });
      continue;
    }
    match = NUMBERED.exec(line);
    if (match) {
      rule = { kind: 'rule', number: Number(match[1]), parts: [] };
      if (match[2]) rule.parts.push({ kind: 'text', text: match[2] });
      blocks.push(rule);
      continue;
    }

    // Everything else belongs to the rule above it, or stands on its own before the first rule.
    const parts: RulesBlock[] = rule ? rule.parts : blocks;
    match = BULLET.exec(line);
    if (match) {
      const last = parts.at(-1);
      if (last?.kind === 'list') last.items.push(match[1]);
      else parts.push({ kind: 'list', items: [match[1]] });
    } else {
      parts.push({ kind: 'text', text: line });
    }
  }
  return blocks;
}
