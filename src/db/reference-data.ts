import { PLAN } from '../constants/domain';
import { DICT_CATEGORIES, DICT_SYMBOLS, DICT_THEMES } from '../features/dictionary/dictionary.data';
import type { InterpreterSampleRow } from '../features/interpreters/interpreters.schema';
import { foldString } from '../utils/turkishSearch';
import { DEFAULT_SEED_MODEL_NAME, DEFAULT_SEED_OPENROUTER_MODEL_ID } from './seed.policy';

/**
 * Single source of truth for **reference data** (default model, interpreters +
 * enrichment, dream dictionary). Consumed by both the local seed (`seed.ts`) and
 * the migration SQL generator (`scripts/generate-reference-migration.ts`), so
 * the data that ships to prod via migration and the data seeded locally never
 * drift. Content changes → regenerate a new data migration.
 */

export const DEFAULT_MODEL_ID = '10000000-0000-4000-8000-000000000001';

export const REFERENCE_MODEL = {
  id: DEFAULT_MODEL_ID,
  name: DEFAULT_SEED_MODEL_NAME,
  openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
  requiredPlan: PLAN.FREE,
  contextLength: 8000,
  pricePrompt: '0',
  priceCompletion: '0',
} as const;

export type ReferenceInterpreter = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
  rating: string;
  reviews: number;
  styles: string[];
  story: string;
  samples: InterpreterSampleRow[];
};

export const REFERENCE_INTERPRETERS: ReferenceInterpreter[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Psikolog Selin',
    description: 'Modern psikoloji perspektifiyle sakin ve analitik rüya yorumu yapar.',
    systemPrompt: 'Sen modern psikoloji perspektifiyle rüya yorumlayan sakin ve analitik bir uzmansın.',
    imageUrl: null,
    isPremium: false,
    sortOrder: 10,
    rating: '4.7',
    reviews: 980,
    styles: ['Gerçekçi', 'Analitik', 'Sakin'],
    story:
      'Klinik psikolog Selin, rüyaları bilinçaltının nazik mektupları olarak görür. Yorumlarında kehanetten çok, rüyanın sana ne hissettirdiğine ve uyanık hayatınla kurduğu bağlara odaklanır.',
    samples: [
      { ctx: 'Sınava geç kalmak', quote: 'Sınava yetişememek çoğu zaman gerçek bir korkudan değil, kendine koyduğun yüksek beklentilerden beslenir. Bu rüya biraz nefes almaya ihtiyacın olduğunu fısıldıyor olabilir.' },
      { ctx: 'Eski bir ev', quote: 'Eski ev, geçmişinle ve köklerinle kurduğun bağı temsil edebilir. Son zamanlarda geçmişe dair düşündüğün bir şey var mı?' },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Dervis Ali',
    description: 'Sembollere ve kadim anlatılara odaklanan mistik bir yorum sunar.',
    systemPrompt: 'Sen sembollere ve kadim anlatılara odaklanan mistik bir rüya yorumcususun.',
    imageUrl: null,
    isPremium: false,
    sortOrder: 20,
    rating: '4.8',
    reviews: 1240,
    styles: ['Geleneksel', 'Sıcak', 'Manevi'],
    story:
      'Anadolu’nun farklı şehirlerinde kırk yıl boyunca rüya tabiri geleneğini dinleyerek büyüdü. Derviş Ali için her rüya, sabırla dinlenmesi gereken bir misafirdir; sembolleri eski tabirnamelerle karşılaştırır, asla acele etmez.',
    samples: [
      { ctx: 'Denizde yürümek', quote: 'Deniz üzerinde yürümek, çoğu tabirde sıkıntıların üzerinden hayırla geçeceğine işaret eder. Gönlün ferah olsun.' },
      { ctx: 'Beyaz güvercin', quote: 'Beyaz güvercin müjdedir evladım; yakında gönlünü serinletecek bir haber kapını çalabilir.' },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    name: 'Astrolog Mira',
    description: 'Gezegenler, döngüler ve sezgisel semboller üzerinden yorum yapar.',
    systemPrompt: 'Sen astrolojik semboller ve sezgisel döngüler üzerinden rüya yorumlayan bir uzmansın.',
    imageUrl: null,
    isPremium: true,
    sortOrder: 30,
    rating: '4.6',
    reviews: 760,
    styles: ['Mistik', 'Detaycı', 'Astrolojik'],
    story:
      'Astrolog Mira, rüyaları gökyüzünün o anki hâliyle birlikte okur. Her tabirde burcunu, gezegenlerin konumunu ve döngülerini hesaba katar; sembolleri yıldız haritanın bir parçası gibi yorumlar.',
    samples: [
      { ctx: 'Dolunay', quote: 'Rüyanda dolunay görmen, bir döngünün tamamlandığına işaret. Önümüzdeki haftalarda uzun süredir beklediğin bir kapı aralanabilir.' },
      { ctx: 'Yüksek bir dağ', quote: 'Dağ, hedeflerinin yüceliğini gösterir. Satürn’ün konumu, sabırla çıkılan yolun seni zirveye taşıyacağını söylüyor.' },
    ],
  },
];

export type DictionaryReferenceRow = {
  type: 'category' | 'symbol' | 'theme';
  slug: string;
  icon: string;
  cat: string | null;
  sortOrder: number;
  nameTr: string;
  taglineTr: string | null;
  briefTr: string | null;
  kwTr: string | null;
  spiritualTr: string | null;
  psychTr: string | null;
  intuitiveTr: string | null;
  related: string[] | null;
  searchTr: string;
};

function slugify(input: string): string {
  return foldString(input).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Builds dictionary rows for seed + migration. `searchTr` is auto-computed as
 * the Turkish-folded haystack `fold(name + kw + brief/tagline)` — this is what
 * the DB search matches against (SQL LIKE can't fold Turkish). When you add a
 * new symbol/theme, put its searchable words in `kw` so they land in `searchTr`.
 */
export function buildDictionaryRows(): DictionaryReferenceRow[] {
  const categories: DictionaryReferenceRow[] = DICT_CATEGORIES.map((category, index) => ({
    type: 'category',
    slug: category.id,
    icon: category.icon,
    cat: null,
    sortOrder: index,
    nameTr: category.label,
    taglineTr: null,
    briefTr: null,
    kwTr: null,
    spiritualTr: null,
    psychTr: null,
    intuitiveTr: null,
    related: null,
    searchTr: foldString(category.label),
  }));

  const symbols: DictionaryReferenceRow[] = DICT_SYMBOLS.map((symbol, index) => ({
    type: 'symbol',
    slug: slugify(symbol.name),
    icon: symbol.icon,
    cat: symbol.cat,
    sortOrder: index,
    nameTr: symbol.name,
    taglineTr: null,
    briefTr: symbol.brief,
    kwTr: symbol.kw,
    spiritualTr: symbol.spiritual,
    psychTr: symbol.psych,
    intuitiveTr: symbol.intuitive,
    related: [...symbol.related],
    searchTr: foldString(`${symbol.name} ${symbol.kw} ${symbol.brief}`),
  }));

  const themes: DictionaryReferenceRow[] = DICT_THEMES.map((theme, index) => ({
    type: 'theme',
    slug: slugify(theme.name),
    icon: theme.icon,
    cat: null,
    sortOrder: index,
    nameTr: theme.name,
    taglineTr: theme.tagline,
    briefTr: theme.brief,
    kwTr: null,
    spiritualTr: theme.spiritual,
    psychTr: theme.psych,
    intuitiveTr: theme.intuitive,
    related: [...theme.related],
    searchTr: foldString(`${theme.name} ${theme.tagline} ${theme.brief}`),
  }));

  return [...categories, ...symbols, ...themes];
}
