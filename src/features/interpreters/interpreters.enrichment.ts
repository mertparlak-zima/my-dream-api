/**
 * Server-side interpreter enrichment (#41) — rating, reviews, styles, story and
 * sample interpretations for the Keşfet interpreter directory/detail. This moves
 * the app's dummy persona content (`my-dream-app/src/data/personas.ts`) to the
 * backend; the app now fetches it from `/interpreters`.
 *
 * Keyed by the stable seeded interpreter ids (see `db/seed.ts`). Unknown ids
 * (e.g. test fixtures) get neutral defaults. Sourced from static config for now;
 * an admin/DB-backed editor can replace this map later without changing the API
 * contract.
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #41.
 */

export type InterpreterSample = {
  /** Short dream context, e.g. "Denizde yürümek". */
  ctx: string;
  /** The interpreter's sample line for that context. */
  quote: string;
};

export type InterpreterEnrichment = {
  rating: number | null;
  reviews: number;
  styles: string[];
  story: string | null;
  samples: InterpreterSample[];
};

const DEFAULT_ENRICHMENT: InterpreterEnrichment = {
  rating: null,
  reviews: 0,
  styles: [],
  story: null,
  samples: [],
};

const ENRICHMENT: Record<string, InterpreterEnrichment> = {
  // Psikolog Selin
  '20000000-0000-4000-8000-000000000001': {
    rating: 4.7,
    reviews: 980,
    styles: ['Gerçekçi', 'Analitik', 'Sakin'],
    story:
      'Klinik psikolog Selin, rüyaları bilinçaltının nazik mektupları olarak görür. Yorumlarında kehanetten çok, rüyanın sana ne hissettirdiğine ve uyanık hayatınla kurduğu bağlara odaklanır.',
    samples: [
      {
        ctx: 'Sınava geç kalmak',
        quote:
          'Sınava yetişememek çoğu zaman gerçek bir korkudan değil, kendine koyduğun yüksek beklentilerden beslenir. Bu rüya biraz nefes almaya ihtiyacın olduğunu fısıldıyor olabilir.',
      },
      {
        ctx: 'Eski bir ev',
        quote:
          'Eski ev, geçmişinle ve köklerinle kurduğun bağı temsil edebilir. Son zamanlarda geçmişe dair düşündüğün bir şey var mı?',
      },
    ],
  },
  // Dervis Ali
  '20000000-0000-4000-8000-000000000002': {
    rating: 4.8,
    reviews: 1240,
    styles: ['Geleneksel', 'Sıcak', 'Manevi'],
    story:
      'Anadolu’nun farklı şehirlerinde kırk yıl boyunca rüya tabiri geleneğini dinleyerek büyüdü. Derviş Ali için her rüya, sabırla dinlenmesi gereken bir misafirdir; sembolleri eski tabirnamelerle karşılaştırır, asla acele etmez.',
    samples: [
      {
        ctx: 'Denizde yürümek',
        quote:
          'Deniz üzerinde yürümek, çoğu tabirde sıkıntıların üzerinden hayırla geçeceğine işaret eder. Gönlün ferah olsun.',
      },
      {
        ctx: 'Beyaz güvercin',
        quote:
          'Beyaz güvercin müjdedir evladım; yakında gönlünü serinletecek bir haber kapını çalabilir.',
      },
    ],
  },
  // Astrolog Mira
  '20000000-0000-4000-8000-000000000003': {
    rating: 4.6,
    reviews: 760,
    styles: ['Mistik', 'Detaycı', 'Astrolojik'],
    story:
      'Astrolog Mira, rüyaları gökyüzünün o anki hâliyle birlikte okur. Her tabirde burcunu, gezegenlerin konumunu ve döngülerini hesaba katar; sembolleri yıldız haritanın bir parçası gibi yorumlar.',
    samples: [
      {
        ctx: 'Dolunay',
        quote:
          'Rüyanda dolunay görmen, bir döngünün tamamlandığına işaret. Önümüzdeki haftalarda uzun süredir beklediğin bir kapı aralanabilir.',
      },
      {
        ctx: 'Yüksek bir dağ',
        quote:
          'Dağ, hedeflerinin yüceliğini gösterir. Satürn’ün konumu, sabırla çıkılan yolun seni zirveye taşıyacağını söylüyor.',
      },
    ],
  },
};

/** Enrichment for an interpreter id, or neutral defaults when none exists. */
export function getInterpreterEnrichment(id: string): InterpreterEnrichment {
  return ENRICHMENT[id] ?? DEFAULT_ENRICHMENT;
}
