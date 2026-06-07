/**
 * Dream dictionary content (#42): categories, symbols and themes, each read
 * through three lenses (spiritual / psych / intuitive). Moved from the app's
 * dummy dataset (`my-dream-app/src/data/dream-dictionary.ts`) to the backend.
 *
 * Content only: `icon` and `cat` are semantic strings; display colors stay
 * app-side presentation. Static config for now (no DB); a DB/admin-editable
 * source can replace this without changing the API contract.
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #42.
 */

export type DictCategoryId = 'su' | 'hayvan' | 'insan' | 'yer' | 'gok' | 'esya';

export type DictCategory = {
  id: DictCategoryId;
  label: string;
  icon: string;
};

export type DreamLenses = {
  spiritual: string;
  psych: string;
  intuitive: string;
};

export type DreamSymbol = DreamLenses & {
  name: string;
  icon: string;
  cat: DictCategoryId;
  kw: string;
  brief: string;
  related: string[];
};

export type DreamTheme = DreamLenses & {
  name: string;
  icon: string;
  tagline: string;
  brief: string;
  related: string[];
};

export const DICT_CATEGORIES: DictCategory[] = [
  { id: 'su', label: 'Su', icon: 'waves' },
  { id: 'hayvan', label: 'Hayvanlar', icon: 'bird' },
  { id: 'insan', label: 'İnsanlar', icon: 'user-circle' },
  { id: 'yer', label: 'Yerler', icon: 'house' },
  { id: 'gok', label: 'Gök & Doğa', icon: 'moon-stars' },
  { id: 'esya', label: 'Eşyalar', icon: 'key' },
];

export const DICT_SYMBOLS: DreamSymbol[] = [
  {
    name: 'Deniz', icon: 'waves', cat: 'su', kw: 'deniz su okyanus dalga sahil kıyı',
    brief: 'Bilinçaltı, duygular ve önündeki sonsuz olasılıklar.',
    spiritual: 'Sakin deniz gönül huzuruna, dalgalı deniz aşılacak sıkıntılara işaret eder; çoğu tabirde hayırla yorumlanır.',
    psych: 'Denizin hâli o dönemdeki duygusal dünyanı yansıtır. Durgun su dinginliğe, çalkantılı su bastırılmış duygulara işaret edebilir.',
    intuitive: 'Engin bir deniz, önünde açılan geniş bir yolculuğun habercisidir canım; korkma, akışına bırak.',
    related: ['Yağmur', 'Balık', 'Köprü'],
  },
  {
    name: 'Yağmur', icon: 'drop', cat: 'su', kw: 'yağmur su damla yağış rahmet',
    brief: 'Arınma, bereket ve duyguların boşalması.',
    spiritual: 'Yağmur çoğu tabirde rahmet ve berekettir; üzerine yağması sıkıntıların temizlenip rızkın artmasına işaret eder.',
    psych: 'Yağmur, biriken duyguların nihayet dışa vurması olabilir. Ardından gelen ferahlık, içsel bir rahatlama ihtiyacını gösterir.',
    intuitive: 'Gökten inen her damla bir yükü alıp götürür; bu rüya yakında hafifleyeceğini fısıldıyor.',
    related: ['Deniz', 'Güneş', 'Ağaç'],
  },
  {
    name: 'Kuyu', icon: 'drop', cat: 'su', kw: 'kuyu su derin sır',
    brief: 'Saklı duygular, bilinçaltının derinliği ve bir sır.',
    spiritual: 'Suyu bol kuyu bereket ve uzun ömre; kuru kuyu ise dikkat istenen bir döneme işaret eder.',
    psych: 'Kuyu, içinde sakladığın derin duyguları temsil edebilir. Aşağı bakmak, kendinle yüzleşme cesaretini gösterir.',
    intuitive: 'Her kuyunun dibinde bir cevap bekler; aradığın şey sandığından daha yakın.',
    related: ['Deniz', 'Anahtar', 'Ev'],
  },
  {
    name: 'Yılan', icon: 'snake', cat: 'hayvan', kw: 'yılan hayvan sürüngen',
    brief: 'Dönüşüm, gizli güç ya da temkinli olunması gereken biri.',
    spiritual: 'Yılan birçok tabirde gizli bir endişeye ya da mala işaret eder; onu alt etmek zafer ve berekettir.',
    psych: 'Yılan, korktuğun ama yüzleşmen gereken bir konuyu simgeleyebilir. Deri değiştirmesi gibi, bir dönüşümün eşiğinde olabilirsin.',
    intuitive: 'Yılan bilgeliğin de sembolüdür; içindeki sezgiye güvenmen gerektiğini hatırlatır.',
    related: ['Deniz', 'Yabancı', 'Ağaç'],
  },
  {
    name: 'Kuş', icon: 'bird', cat: 'hayvan', kw: 'kuş hayvan kanat güvercin uçmak',
    brief: 'Özgürlük, müjde ve yükselen umutlar.',
    spiritual: 'Uçan kuş çoğu tabirde müjde ve hayırlı haberdir; beyaz kuş huzur ve berekettir.',
    psych: 'Kuş, ulaşmak istediğin özgürlüğü ya da yükselme arzunu temsil edebilir.',
    intuitive: 'Kanat çırpan her kuş, gönlündeki bir dileğin göğe yükselişidir.',
    related: ['Ay', 'Yıldız', 'Ağaç'],
  },
  {
    name: 'Balık', icon: 'fish', cat: 'hayvan', kw: 'balık hayvan su rızık',
    brief: 'Rızık, bolluk ve beklenmedik kısmet.',
    spiritual: 'Balık tutmak çoğu tabirde rızık ve helal kazançtır; taze balık hayırlı bir habere işaret eder.',
    psych: 'Suyun derinliğindeki balık, henüz fark etmediğin içsel kaynaklarını simgeleyebilir.',
    intuitive: 'Pul pul parıldayan balık, yakında eline geçecek bir bereketin habercisidir.',
    related: ['Deniz', 'Kuyu', 'Para'],
  },
  {
    name: 'Bebek', icon: 'baby', cat: 'insan', kw: 'bebek çocuk insan doğum',
    brief: 'Yeni başlangıçlar, masumiyet ve umut.',
    spiritual: 'Bebek çoğu tabirde hayır, bereket ve yeni bir kapının açılışıdır.',
    psych: 'Bebek, hayatında filizlenen yeni bir fikri, projeyi ya da yönü temsil edebilir.',
    intuitive: 'Kucağındaki bebek, henüz çok taze ama büyümeyi bekleyen bir umuttur.',
    related: ['Ev', 'Ağaç', 'Deniz'],
  },
  {
    name: 'Sevgili', icon: 'heart', cat: 'insan', kw: 'sevgili aşk insan kalp eş',
    brief: 'Sevgi ihtiyacı, bağ ve kalbindeki özlem.',
    spiritual: 'Sevdiğini görmek özlem ve muhabbete; ayrılık ise kavuşmaya yorulabilir.',
    psych: 'Rüyadaki sevgili, gerçek bir kişiden çok, ihtiyaç duyduğun sevgi ve yakınlığı temsil edebilir.',
    intuitive: 'Kalbin kime akıyorsa, bu rüya orada eksik kalan bir şeyi fısıldıyor.',
    related: ['Yabancı', 'Yüzük', 'Bebek'],
  },
  {
    name: 'Yabancı', icon: 'user-circle', cat: 'insan', kw: 'yabancı insan tanımadık kişi',
    brief: 'Kendinin tanımadığın bir yönü ya da gelen değişim.',
    spiritual: 'Tanımadığın kişi çoğu zaman hayatına girecek yeni bir haberin ya da kısmetin habercisidir.',
    psych: 'Rüyadaki yabancı genellikle kişiliğinin henüz keşfetmediğin bir parçasını temsil eder.',
    intuitive: 'Her yabancı yüz, sana kendinden bir şey gösterir; ona dikkatle bak.',
    related: ['Sevgili', 'Kapı', 'Yılan'],
  },
  {
    name: 'Ev', icon: 'house', cat: 'yer', kw: 'ev yer oda yuva',
    brief: 'Güven, aile ve kişinin iç dünyası.',
    spiritual: 'Ev güven ve berekettir; geniş ev rızkın bolluğuna, eski ev köklere işaret eder.',
    psych: 'Ev çoğu zaman senin benliğini temsil eder; odalar, kişiliğinin farklı yönleridir.',
    intuitive: 'Hangi evdeysen, o an gönlünün ait olmak istediği yeri gösterir.',
    related: ['Kapı', 'Kuyu', 'Bebek'],
  },
  {
    name: 'Köprü', icon: 'bridge', cat: 'yer', kw: 'köprü yer geçiş',
    brief: 'Geçiş, karar ve iki dönem arasındaki an.',
    spiritual: 'Köprüden geçmek çoğu tabirde bir sıkıntıyı hayırla aşmaya işaret eder.',
    psych: 'Köprü, bir aşamadan diğerine geçişi simgeler; ortada durmak kararsızlığı gösterebilir.',
    intuitive: 'Her köprü iki kıyıyı birleştirir; sen şu an hangi kıyıya yürüdüğünü biliyorsun.',
    related: ['Deniz', 'Kapı', 'Yabancı'],
  },
  {
    name: 'Kapı', icon: 'door', cat: 'yer', kw: 'kapı yer eşik geçit fırsat',
    brief: 'Fırsat, yeni bir aşama ya da bir seçim.',
    spiritual: 'Açık kapı hayırlı fırsatlara, kapalı kapı sabredilecek bir döneme işaret eder.',
    psych: 'Kapı, önündeki bir seçimi ya da girmeye çekindiğin yeni bir alanı temsil edebilir.',
    intuitive: 'Bir kapı kapanırken bir başkası aralanır; gözünü açık bir kapıdan ayırma.',
    related: ['Ev', 'Anahtar', 'Yabancı'],
  },
  {
    name: 'Ay', icon: 'moon', cat: 'gok', kw: 'ay gökyüzü dolunay hilal gece',
    brief: 'Sezgi, döngüler ve içsel değişim.',
    spiritual: 'Dolunay bereket ve tamamlanmaya; hilal yeni bir başlangıca işaret eder.',
    psych: 'Ay, duygularının ve sezgilerinin gece tarafını temsil eder; döngülerine kulak vermeni ister.',
    intuitive: 'Ay her gece şeklini değiştirir ama hep oradadır; sen de değişirken kendine sadık kal.',
    related: ['Kuş', 'Güneş', 'Ağaç'],
  },
  {
    name: 'Güneş', icon: 'sun', cat: 'gok', kw: 'güneş gökyüzü gün ışık aydınlık',
    brief: 'Aydınlanma, güç ve yeni bir gün.',
    spiritual: 'Doğan güneş çoğu tabirde güç, devlet ve hayırlı bir başlangıçtır.',
    psych: 'Güneş, içindeki canlılığı ve netleşen bir farkındalığı simgeler.',
    intuitive: 'Üzerine doğan güneş, karanlıkta kalmış bir konunun aydınlanacağını müjdeler.',
    related: ['Ay', 'Ateş', 'Yağmur'],
  },
  {
    name: 'Ateş', icon: 'fire', cat: 'gok', kw: 'ateş yangın alev tutku',
    brief: 'Tutku, arınma ya da içteki öfke.',
    spiritual: 'Aydınlatan, zararsız ateş hayır ve berekettir; yakıcı ateş dikkat istenen bir hâle işaret eder.',
    psych: 'Ateş, içindeki güçlü duyguları —tutkuyu ya da öfkeyi— temsil eder; onu yönetmeyi öğrenmek ister.',
    intuitive: 'Her ateş hem ısıtır hem yakar; bu rüya enerjini nereye yönelttiğini soruyor.',
    related: ['Güneş', 'Deniz', 'Ev'],
  },
  {
    name: 'Ağaç', icon: 'tree', cat: 'gok', kw: 'ağaç doğa orman dal kök meyve',
    brief: 'Büyüme, kökler ve hayatın döngüsü.',
    spiritual: 'Meyveli ağaç bereket ve uzun ömre; yeşil ağaç sağlık ve hayra işaret eder.',
    psych: 'Ağaç, kişisel gelişimini ve ailenle bağını temsil eder; kökleri geçmişin, dalları geleceğindir.',
    intuitive: 'Sen de bir ağaç gibisin; sabırla kök saldıkça meyven kendiliğinden gelir.',
    related: ['Ev', 'Yağmur', 'Bebek'],
  },
  {
    name: 'Diş', icon: 'tooth', cat: 'insan', kw: 'diş düşmek kayıp ağız dökülmek',
    brief: 'Değişim korkusu, kayıp ya da yenilenme.',
    spiritual: 'Diş düşmesi tabirlerde çoğu zaman bir haberle; sağlam diş ise güçlü bağlarla ilişkilendirilir.',
    psych: 'Diş dökülmesi sık görülen bir rüyadır ve genellikle kontrol kaybı ya da bir değişim kaygısıyla bağlantılıdır.',
    intuitive: 'Eski bir diş düşer ki yenisi gelsin; bu rüya bir sonun, yeni bir başlangıç olduğunu söyler.',
    related: ['Yabancı', 'Ev', 'Kapı'],
  },
  {
    name: 'Anahtar', icon: 'key', cat: 'esya', kw: 'anahtar eşya kilit çözüm',
    brief: 'Çözüm, fırsat ve açılacak bir kapı.',
    spiritual: 'Anahtar bulmak hayırlı bir çözüme ve açılacak rızık kapısına işaret eder.',
    psych: 'Anahtar, bir sorunun çözümüne sahip olduğunu ya da yeni bir alana erişebileceğini simgeler.',
    intuitive: 'Elindeki anahtar boşuna değil; bir kapı tam da senin onu açmanı bekliyor.',
    related: ['Kapı', 'Ev', 'Kuyu'],
  },
  {
    name: 'Yüzük', icon: 'ring', cat: 'esya', kw: 'yüzük eşya nişan evlilik söz',
    brief: 'Bağlılık, söz ve süregelen bir bağ.',
    spiritual: 'Yüzük takmak çoğu tabirde nişan, evlilik ya da güçlü bir ahde işaret eder.',
    psych: 'Yüzük, bir söze ya da ilişkiye duyduğun bağlılığı; bazen kendine verdiğin bir kararı temsil eder.',
    intuitive: 'Bir halka gibi yüzük; başı ve sonu olmayan bir bağı, süregelen bir sevgiyi anlatır.',
    related: ['Sevgili', 'Para', 'Bebek'],
  },
  {
    name: 'Para', icon: 'coins', cat: 'esya', kw: 'para eşya altın bereket zenginlik',
    brief: 'Değer, emek ve bereket beklentisi.',
    spiritual: 'Para bulmak çoğu tabirde rızka ve berekete; vermek ise gönül ferahlığına yorulur.',
    psych: 'Para, maddi kaygıdan çok, kendine ve emeğine biçtiğin değeri yansıtabilir.',
    intuitive: 'Avucundaki para bir karşılığın habercisi; emeğin yakında değer bulacak.',
    related: ['Balık', 'Yüzük', 'Ev'],
  },
];

export const DICT_THEMES: DreamTheme[] = [
  {
    name: 'Kabuslar', icon: 'warning', tagline: 'Korku veren rüyalar ne anlatır?',
    brief: 'Korku veren rüyalar genelde bir uyarı değil, bir mesajdır.',
    spiritual: 'Eski tabirde kötü rüyalar çoğu zaman geçici sıkıntılara işaret eder ve anlatılınca hayra döner; bu yüzden “hayırdır inşallah” denir.',
    psych: 'Kabuslar genellikle gündüz bastırılan stres, kaygı ya da çözülmemiş bir gerilimin gece dışa vurmasıdır.',
    intuitive: 'Karanlık bir rüya bile sana bir şey öğretmek ister; korkunun altında çoğu zaman bir ihtiyaç saklıdır.',
    related: ['Yılan', 'Düşmek', 'Kovalanmak'],
  },
  {
    name: 'Kayıp diş', icon: 'tooth', tagline: 'En sık görülen rüyalardan.',
    brief: 'Diş dökülmesi; değişim, kayıp ve yenilenme.',
    spiritual: 'Diş düşmesi tabirde çoğu zaman bir haberle ilişkilendirilir; sağlam dişler ise güçlü aile bağlarını gösterir.',
    psych: 'Diş kaybı rüyaları çok yaygındır ve genellikle bir kontrol kaygısı ya da yaşanan bir değişimle bağlantılıdır.',
    intuitive: 'Bir diş düşer ki yenisi gelsin; bu rüya bir şeyin sonunun yeni bir başlangıç olduğunu fısıldar.',
    related: ['Diş', 'Yabancı', 'Kabuslar'],
  },
  {
    name: 'Uçmak', icon: 'bird', tagline: 'Özgürlük mü, kaçış mı?',
    brief: 'Yerden yükselmek; özgürlük ve üstesinden gelme hissi.',
    spiritual: 'Uçmak çoğu tabirde mertebenin yükselmesine, bir işte muvaffak olmaya işaret eder.',
    psych: 'Uçmak, bir baskıdan kurtulma ya da hayatına yukarıdan, geniş bir perspektifle bakma arzusunu yansıtabilir.',
    intuitive: 'Kanatların olmadan uçuyorsan bile, bu rüya sana “yapabilirsin” diyor.',
    related: ['Kuş', 'Ay', 'Düşmek'],
  },
  {
    name: 'Düşmek', icon: 'mountain', tagline: 'Kontrol ve güven duygusu.',
    brief: 'Düşme hissi; kontrol ve güven sorusu.',
    spiritual: 'Yüksekten düşmek tabirde çoğu zaman bir hevesin değişmesine işaret eder, dikkatli olmayı öğütler.',
    psych: 'Düşme rüyaları, bir şeyi kontrol edemediğin ya da bir desteğe ihtiyaç duyduğun dönemlerde sık görülür.',
    intuitive: 'Düşerken uyanmak, aslında tutunduğun şeyi gözden geçirme vaktinin geldiğini söyler.',
    related: ['Kabuslar', 'Köprü', 'Deniz'],
  },
  {
    name: 'Kovalanmak', icon: 'path', tagline: 'Neyden kaçıyorsun?',
    brief: 'Bir şeyden kaçmak; yüzleşilmeyi bekleyen bir mesele.',
    spiritual: 'Kovalanmak tabirde üzerine gelen bir sıkıntıya işaret edebilir; dönüp yüzleşmek çoğu zaman onu hayra çevirir.',
    psych: 'Seni kovalayan şey çoğu zaman dışarıdan biri değil, ertelediğin bir duygu ya da sorumluluktur.',
    intuitive: 'Bir gün dönüp baktığında, peşindeki şeyin aslında seninle konuşmak istediğini göreceksin.',
    related: ['Kabuslar', 'Yabancı', 'Köprü'],
  },
  {
    name: 'Sınav', icon: 'book-open-text', tagline: 'Kaygı ve beklentiler.',
    brief: 'Sınava girmek ya da geç kalmak; kaygı ve beklenti.',
    spiritual: 'İmtihan görmek tabirde bir denenme dönemine; başarmak ise hayırla çıkışa işaret eder.',
    psych: 'Sınav rüyaları genellikle kendine koyduğun yüksek beklentilerden ve değerlendirilme kaygısından beslenir.',
    intuitive: 'Bu rüya bir uyarı değil; sadece biraz nefes almaya ihtiyacın olduğunu hatırlatıyor.',
    related: ['Yabancı', 'Ev', 'Düşmek'],
  },
];
