INSERT INTO "ai_models" ("id", "name", "openrouter_model_id", "required_plan", "is_active", "context_length", "price_prompt", "price_completion")
VALUES ('10000000-0000-4000-8000-000000000001', 'OpenRouter baidu/cobuddy:free', 'baidu/cobuddy:free', 'FREE', true, 8000, '0', '0')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "interpreters" ("id", "name", "description", "system_prompt", "image_url", "is_premium", "model_id", "is_active", "sort_order", "rating", "reviews", "styles", "story", "samples")
VALUES ('20000000-0000-4000-8000-000000000001', 'Psikolog Selin', 'Modern psikoloji perspektifiyle sakin ve analitik rüya yorumu yapar.', 'Sen modern psikoloji perspektifiyle rüya yorumlayan sakin ve analitik bir uzmansın.', NULL, false, '10000000-0000-4000-8000-000000000001', true, 10, '4.7', 980, ARRAY['Gerçekçi', 'Analitik', 'Sakin']::text[], 'Klinik psikolog Selin, rüyaları bilinçaltının nazik mektupları olarak görür. Yorumlarında kehanetten çok, rüyanın sana ne hissettirdiğine ve uyanık hayatınla kurduğu bağlara odaklanır.', '[{"ctx":"Sınava geç kalmak","quote":"Sınava yetişememek çoğu zaman gerçek bir korkudan değil, kendine koyduğun yüksek beklentilerden beslenir. Bu rüya biraz nefes almaya ihtiyacın olduğunu fısıldıyor olabilir."},{"ctx":"Eski bir ev","quote":"Eski ev, geçmişinle ve köklerinle kurduğun bağı temsil edebilir. Son zamanlarda geçmişe dair düşündüğün bir şey var mı?"}]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "interpreters" ("id", "name", "description", "system_prompt", "image_url", "is_premium", "model_id", "is_active", "sort_order", "rating", "reviews", "styles", "story", "samples")
VALUES ('20000000-0000-4000-8000-000000000002', 'Dervis Ali', 'Sembollere ve kadim anlatılara odaklanan mistik bir yorum sunar.', 'Sen sembollere ve kadim anlatılara odaklanan mistik bir rüya yorumcususun.', NULL, false, '10000000-0000-4000-8000-000000000001', true, 20, '4.8', 1240, ARRAY['Geleneksel', 'Sıcak', 'Manevi']::text[], 'Anadolu’nun farklı şehirlerinde kırk yıl boyunca rüya tabiri geleneğini dinleyerek büyüdü. Derviş Ali için her rüya, sabırla dinlenmesi gereken bir misafirdir; sembolleri eski tabirnamelerle karşılaştırır, asla acele etmez.', '[{"ctx":"Denizde yürümek","quote":"Deniz üzerinde yürümek, çoğu tabirde sıkıntıların üzerinden hayırla geçeceğine işaret eder. Gönlün ferah olsun."},{"ctx":"Beyaz güvercin","quote":"Beyaz güvercin müjdedir evladım; yakında gönlünü serinletecek bir haber kapını çalabilir."}]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "interpreters" ("id", "name", "description", "system_prompt", "image_url", "is_premium", "model_id", "is_active", "sort_order", "rating", "reviews", "styles", "story", "samples")
VALUES ('20000000-0000-4000-8000-000000000003', 'Astrolog Mira', 'Gezegenler, döngüler ve sezgisel semboller üzerinden yorum yapar.', 'Sen astrolojik semboller ve sezgisel döngüler üzerinden rüya yorumlayan bir uzmansın.', NULL, true, '10000000-0000-4000-8000-000000000001', true, 30, '4.6', 760, ARRAY['Mistik', 'Detaycı', 'Astrolojik']::text[], 'Astrolog Mira, rüyaları gökyüzünün o anki hâliyle birlikte okur. Her tabirde burcunu, gezegenlerin konumunu ve döngülerini hesaba katar; sembolleri yıldız haritanın bir parçası gibi yorumlar.', '[{"ctx":"Dolunay","quote":"Rüyanda dolunay görmen, bir döngünün tamamlandığına işaret. Önümüzdeki haftalarda uzun süredir beklediğin bir kapı aralanabilir."},{"ctx":"Yüksek bir dağ","quote":"Dağ, hedeflerinin yüceliğini gösterir. Satürn’ün konumu, sabırla çıkılan yolun seni zirveye taşıyacağını söylüyor."}]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'su', 'waves', NULL, 0, 'Su', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'su')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'hayvan', 'bird', NULL, 1, 'Hayvanlar', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'hayvanlar')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'insan', 'user-circle', NULL, 2, 'İnsanlar', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'insanlar')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'yer', 'house', NULL, 3, 'Yerler', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'yerler')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'gok', 'moon-stars', NULL, 4, 'Gök & Doğa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gok & doga')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('category', 'esya', 'key', NULL, 5, 'Eşyalar', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'esyalar')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'deniz', 'waves', 'su', 0, 'Deniz', NULL, 'Bilinçaltı, duygular ve önündeki sonsuz olasılıklar.', 'deniz su okyanus dalga sahil kıyı', 'Sakin deniz gönül huzuruna, dalgalı deniz aşılacak sıkıntılara işaret eder; çoğu tabirde hayırla yorumlanır.', 'Denizin hâli o dönemdeki duygusal dünyanı yansıtır. Durgun su dinginliğe, çalkantılı su bastırılmış duygulara işaret edebilir.', 'Engin bir deniz, önünde açılan geniş bir yolculuğun habercisidir canım; korkma, akışına bırak.', ARRAY['Yağmur', 'Balık', 'Köprü']::text[], 'deniz deniz su okyanus dalga sahil kiyi bilincalti, duygular ve onundeki sonsuz olasiliklar.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'yagmur', 'drop', 'su', 1, 'Yağmur', NULL, 'Arınma, bereket ve duyguların boşalması.', 'yağmur su damla yağış rahmet', 'Yağmur çoğu tabirde rahmet ve berekettir; üzerine yağması sıkıntıların temizlenip rızkın artmasına işaret eder.', 'Yağmur, biriken duyguların nihayet dışa vurması olabilir. Ardından gelen ferahlık, içsel bir rahatlama ihtiyacını gösterir.', 'Gökten inen her damla bir yükü alıp götürür; bu rüya yakında hafifleyeceğini fısıldıyor.', ARRAY['Deniz', 'Güneş', 'Ağaç']::text[], 'yagmur yagmur su damla yagis rahmet arinma, bereket ve duygularin bosalmasi.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'kuyu', 'drop', 'su', 2, 'Kuyu', NULL, 'Saklı duygular, bilinçaltının derinliği ve bir sır.', 'kuyu su derin sır', 'Suyu bol kuyu bereket ve uzun ömre; kuru kuyu ise dikkat istenen bir döneme işaret eder.', 'Kuyu, içinde sakladığın derin duyguları temsil edebilir. Aşağı bakmak, kendinle yüzleşme cesaretini gösterir.', 'Her kuyunun dibinde bir cevap bekler; aradığın şey sandığından daha yakın.', ARRAY['Deniz', 'Anahtar', 'Ev']::text[], 'kuyu kuyu su derin sir sakli duygular, bilincaltinin derinligi ve bir sir.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'yilan', 'snake', 'hayvan', 3, 'Yılan', NULL, 'Dönüşüm, gizli güç ya da temkinli olunması gereken biri.', 'yılan hayvan sürüngen', 'Yılan birçok tabirde gizli bir endişeye ya da mala işaret eder; onu alt etmek zafer ve berekettir.', 'Yılan, korktuğun ama yüzleşmen gereken bir konuyu simgeleyebilir. Deri değiştirmesi gibi, bir dönüşümün eşiğinde olabilirsin.', 'Yılan bilgeliğin de sembolüdür; içindeki sezgiye güvenmen gerektiğini hatırlatır.', ARRAY['Deniz', 'Yabancı', 'Ağaç']::text[], 'yilan yilan hayvan surungen donusum, gizli guc ya da temkinli olunmasi gereken biri.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'kus', 'bird', 'hayvan', 4, 'Kuş', NULL, 'Özgürlük, müjde ve yükselen umutlar.', 'kuş hayvan kanat güvercin uçmak', 'Uçan kuş çoğu tabirde müjde ve hayırlı haberdir; beyaz kuş huzur ve berekettir.', 'Kuş, ulaşmak istediğin özgürlüğü ya da yükselme arzunu temsil edebilir.', 'Kanat çırpan her kuş, gönlündeki bir dileğin göğe yükselişidir.', ARRAY['Ay', 'Yıldız', 'Ağaç']::text[], 'kus kus hayvan kanat guvercin ucmak ozgurluk, mujde ve yukselen umutlar.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'balik', 'fish', 'hayvan', 5, 'Balık', NULL, 'Rızık, bolluk ve beklenmedik kısmet.', 'balık hayvan su rızık', 'Balık tutmak çoğu tabirde rızık ve helal kazançtır; taze balık hayırlı bir habere işaret eder.', 'Suyun derinliğindeki balık, henüz fark etmediğin içsel kaynaklarını simgeleyebilir.', 'Pul pul parıldayan balık, yakında eline geçecek bir bereketin habercisidir.', ARRAY['Deniz', 'Kuyu', 'Para']::text[], 'balik balik hayvan su rizik rizik, bolluk ve beklenmedik kismet.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'bebek', 'baby', 'insan', 6, 'Bebek', NULL, 'Yeni başlangıçlar, masumiyet ve umut.', 'bebek çocuk insan doğum', 'Bebek çoğu tabirde hayır, bereket ve yeni bir kapının açılışıdır.', 'Bebek, hayatında filizlenen yeni bir fikri, projeyi ya da yönü temsil edebilir.', 'Kucağındaki bebek, henüz çok taze ama büyümeyi bekleyen bir umuttur.', ARRAY['Ev', 'Ağaç', 'Deniz']::text[], 'bebek bebek cocuk insan dogum yeni baslangiclar, masumiyet ve umut.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'sevgili', 'heart', 'insan', 7, 'Sevgili', NULL, 'Sevgi ihtiyacı, bağ ve kalbindeki özlem.', 'sevgili aşk insan kalp eş', 'Sevdiğini görmek özlem ve muhabbete; ayrılık ise kavuşmaya yorulabilir.', 'Rüyadaki sevgili, gerçek bir kişiden çok, ihtiyaç duyduğun sevgi ve yakınlığı temsil edebilir.', 'Kalbin kime akıyorsa, bu rüya orada eksik kalan bir şeyi fısıldıyor.', ARRAY['Yabancı', 'Yüzük', 'Bebek']::text[], 'sevgili sevgili ask insan kalp es sevgi ihtiyaci, bag ve kalbindeki ozlem.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'yabanci', 'user-circle', 'insan', 8, 'Yabancı', NULL, 'Kendinin tanımadığın bir yönü ya da gelen değişim.', 'yabancı insan tanımadık kişi', 'Tanımadığın kişi çoğu zaman hayatına girecek yeni bir haberin ya da kısmetin habercisidir.', 'Rüyadaki yabancı genellikle kişiliğinin henüz keşfetmediğin bir parçasını temsil eder.', 'Her yabancı yüz, sana kendinden bir şey gösterir; ona dikkatle bak.', ARRAY['Sevgili', 'Kapı', 'Yılan']::text[], 'yabanci yabanci insan tanimadik kisi kendinin tanimadigin bir yonu ya da gelen degisim.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'ev', 'house', 'yer', 9, 'Ev', NULL, 'Güven, aile ve kişinin iç dünyası.', 'ev yer oda yuva', 'Ev güven ve berekettir; geniş ev rızkın bolluğuna, eski ev köklere işaret eder.', 'Ev çoğu zaman senin benliğini temsil eder; odalar, kişiliğinin farklı yönleridir.', 'Hangi evdeysen, o an gönlünün ait olmak istediği yeri gösterir.', ARRAY['Kapı', 'Kuyu', 'Bebek']::text[], 'ev ev yer oda yuva guven, aile ve kisinin ic dunyasi.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'kopru', 'bridge', 'yer', 10, 'Köprü', NULL, 'Geçiş, karar ve iki dönem arasındaki an.', 'köprü yer geçiş', 'Köprüden geçmek çoğu tabirde bir sıkıntıyı hayırla aşmaya işaret eder.', 'Köprü, bir aşamadan diğerine geçişi simgeler; ortada durmak kararsızlığı gösterebilir.', 'Her köprü iki kıyıyı birleştirir; sen şu an hangi kıyıya yürüdüğünü biliyorsun.', ARRAY['Deniz', 'Kapı', 'Yabancı']::text[], 'kopru kopru yer gecis gecis, karar ve iki donem arasindaki an.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'kapi', 'door', 'yer', 11, 'Kapı', NULL, 'Fırsat, yeni bir aşama ya da bir seçim.', 'kapı yer eşik geçit fırsat', 'Açık kapı hayırlı fırsatlara, kapalı kapı sabredilecek bir döneme işaret eder.', 'Kapı, önündeki bir seçimi ya da girmeye çekindiğin yeni bir alanı temsil edebilir.', 'Bir kapı kapanırken bir başkası aralanır; gözünü açık bir kapıdan ayırma.', ARRAY['Ev', 'Anahtar', 'Yabancı']::text[], 'kapi kapi yer esik gecit firsat firsat, yeni bir asama ya da bir secim.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'ay', 'moon', 'gok', 12, 'Ay', NULL, 'Sezgi, döngüler ve içsel değişim.', 'ay gökyüzü dolunay hilal gece', 'Dolunay bereket ve tamamlanmaya; hilal yeni bir başlangıca işaret eder.', 'Ay, duygularının ve sezgilerinin gece tarafını temsil eder; döngülerine kulak vermeni ister.', 'Ay her gece şeklini değiştirir ama hep oradadır; sen de değişirken kendine sadık kal.', ARRAY['Kuş', 'Güneş', 'Ağaç']::text[], 'ay ay gokyuzu dolunay hilal gece sezgi, donguler ve icsel degisim.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'gunes', 'sun', 'gok', 13, 'Güneş', NULL, 'Aydınlanma, güç ve yeni bir gün.', 'güneş gökyüzü gün ışık aydınlık', 'Doğan güneş çoğu tabirde güç, devlet ve hayırlı bir başlangıçtır.', 'Güneş, içindeki canlılığı ve netleşen bir farkındalığı simgeler.', 'Üzerine doğan güneş, karanlıkta kalmış bir konunun aydınlanacağını müjdeler.', ARRAY['Ay', 'Ateş', 'Yağmur']::text[], 'gunes gunes gokyuzu gun isik aydinlik aydinlanma, guc ve yeni bir gun.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'ates', 'fire', 'gok', 14, 'Ateş', NULL, 'Tutku, arınma ya da içteki öfke.', 'ateş yangın alev tutku', 'Aydınlatan, zararsız ateş hayır ve berekettir; yakıcı ateş dikkat istenen bir hâle işaret eder.', 'Ateş, içindeki güçlü duyguları —tutkuyu ya da öfkeyi— temsil eder; onu yönetmeyi öğrenmek ister.', 'Her ateş hem ısıtır hem yakar; bu rüya enerjini nereye yönelttiğini soruyor.', ARRAY['Güneş', 'Deniz', 'Ev']::text[], 'ates ates yangin alev tutku tutku, arinma ya da icteki ofke.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'agac', 'tree', 'gok', 15, 'Ağaç', NULL, 'Büyüme, kökler ve hayatın döngüsü.', 'ağaç doğa orman dal kök meyve', 'Meyveli ağaç bereket ve uzun ömre; yeşil ağaç sağlık ve hayra işaret eder.', 'Ağaç, kişisel gelişimini ve ailenle bağını temsil eder; kökleri geçmişin, dalları geleceğindir.', 'Sen de bir ağaç gibisin; sabırla kök saldıkça meyven kendiliğinden gelir.', ARRAY['Ev', 'Yağmur', 'Bebek']::text[], 'agac agac doga orman dal kok meyve buyume, kokler ve hayatin dongusu.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'dis', 'tooth', 'insan', 16, 'Diş', NULL, 'Değişim korkusu, kayıp ya da yenilenme.', 'diş düşmek kayıp ağız dökülmek', 'Diş düşmesi tabirlerde çoğu zaman bir haberle; sağlam diş ise güçlü bağlarla ilişkilendirilir.', 'Diş dökülmesi sık görülen bir rüyadır ve genellikle kontrol kaybı ya da bir değişim kaygısıyla bağlantılıdır.', 'Eski bir diş düşer ki yenisi gelsin; bu rüya bir sonun, yeni bir başlangıç olduğunu söyler.', ARRAY['Yabancı', 'Ev', 'Kapı']::text[], 'dis dis dusmek kayip agiz dokulmek degisim korkusu, kayip ya da yenilenme.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'anahtar', 'key', 'esya', 17, 'Anahtar', NULL, 'Çözüm, fırsat ve açılacak bir kapı.', 'anahtar eşya kilit çözüm', 'Anahtar bulmak hayırlı bir çözüme ve açılacak rızık kapısına işaret eder.', 'Anahtar, bir sorunun çözümüne sahip olduğunu ya da yeni bir alana erişebileceğini simgeler.', 'Elindeki anahtar boşuna değil; bir kapı tam da senin onu açmanı bekliyor.', ARRAY['Kapı', 'Ev', 'Kuyu']::text[], 'anahtar anahtar esya kilit cozum cozum, firsat ve acilacak bir kapi.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'yuzuk', 'ring', 'esya', 18, 'Yüzük', NULL, 'Bağlılık, söz ve süregelen bir bağ.', 'yüzük eşya nişan evlilik söz', 'Yüzük takmak çoğu tabirde nişan, evlilik ya da güçlü bir ahde işaret eder.', 'Yüzük, bir söze ya da ilişkiye duyduğun bağlılığı; bazen kendine verdiğin bir kararı temsil eder.', 'Bir halka gibi yüzük; başı ve sonu olmayan bir bağı, süregelen bir sevgiyi anlatır.', ARRAY['Sevgili', 'Para', 'Bebek']::text[], 'yuzuk yuzuk esya nisan evlilik soz baglilik, soz ve suregelen bir bag.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('symbol', 'para', 'coins', 'esya', 19, 'Para', NULL, 'Değer, emek ve bereket beklentisi.', 'para eşya altın bereket zenginlik', 'Para bulmak çoğu tabirde rızka ve berekete; vermek ise gönül ferahlığına yorulur.', 'Para, maddi kaygıdan çok, kendine ve emeğine biçtiğin değeri yansıtabilir.', 'Avucundaki para bir karşılığın habercisi; emeğin yakında değer bulacak.', ARRAY['Balık', 'Yüzük', 'Ev']::text[], 'para para esya altin bereket zenginlik deger, emek ve bereket beklentisi.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'kabuslar', 'warning', NULL, 0, 'Kabuslar', 'Korku veren rüyalar ne anlatır?', 'Korku veren rüyalar genelde bir uyarı değil, bir mesajdır.', NULL, 'Eski tabirde kötü rüyalar çoğu zaman geçici sıkıntılara işaret eder ve anlatılınca hayra döner; bu yüzden “hayırdır inşallah” denir.', 'Kabuslar genellikle gündüz bastırılan stres, kaygı ya da çözülmemiş bir gerilimin gece dışa vurmasıdır.', 'Karanlık bir rüya bile sana bir şey öğretmek ister; korkunun altında çoğu zaman bir ihtiyaç saklıdır.', ARRAY['Yılan', 'Düşmek', 'Kovalanmak']::text[], 'kabuslar korku veren ruyalar ne anlatir? korku veren ruyalar genelde bir uyari degil, bir mesajdir.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'kayip-dis', 'tooth', NULL, 1, 'Kayıp diş', 'En sık görülen rüyalardan.', 'Diş dökülmesi; değişim, kayıp ve yenilenme.', NULL, 'Diş düşmesi tabirde çoğu zaman bir haberle ilişkilendirilir; sağlam dişler ise güçlü aile bağlarını gösterir.', 'Diş kaybı rüyaları çok yaygındır ve genellikle bir kontrol kaygısı ya da yaşanan bir değişimle bağlantılıdır.', 'Bir diş düşer ki yenisi gelsin; bu rüya bir şeyin sonunun yeni bir başlangıç olduğunu fısıldar.', ARRAY['Diş', 'Yabancı', 'Kabuslar']::text[], 'kayip dis en sik gorulen ruyalardan. dis dokulmesi; degisim, kayip ve yenilenme.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'ucmak', 'bird', NULL, 2, 'Uçmak', 'Özgürlük mü, kaçış mı?', 'Yerden yükselmek; özgürlük ve üstesinden gelme hissi.', NULL, 'Uçmak çoğu tabirde mertebenin yükselmesine, bir işte muvaffak olmaya işaret eder.', 'Uçmak, bir baskıdan kurtulma ya da hayatına yukarıdan, geniş bir perspektifle bakma arzusunu yansıtabilir.', 'Kanatların olmadan uçuyorsan bile, bu rüya sana “yapabilirsin” diyor.', ARRAY['Kuş', 'Ay', 'Düşmek']::text[], 'ucmak ozgurluk mu, kacis mi? yerden yukselmek; ozgurluk ve ustesinden gelme hissi.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'dusmek', 'mountain', NULL, 3, 'Düşmek', 'Kontrol ve güven duygusu.', 'Düşme hissi; kontrol ve güven sorusu.', NULL, 'Yüksekten düşmek tabirde çoğu zaman bir hevesin değişmesine işaret eder, dikkatli olmayı öğütler.', 'Düşme rüyaları, bir şeyi kontrol edemediğin ya da bir desteğe ihtiyaç duyduğun dönemlerde sık görülür.', 'Düşerken uyanmak, aslında tutunduğun şeyi gözden geçirme vaktinin geldiğini söyler.', ARRAY['Kabuslar', 'Köprü', 'Deniz']::text[], 'dusmek kontrol ve guven duygusu. dusme hissi; kontrol ve guven sorusu.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'kovalanmak', 'path', NULL, 4, 'Kovalanmak', 'Neyden kaçıyorsun?', 'Bir şeyden kaçmak; yüzleşilmeyi bekleyen bir mesele.', NULL, 'Kovalanmak tabirde üzerine gelen bir sıkıntıya işaret edebilir; dönüp yüzleşmek çoğu zaman onu hayra çevirir.', 'Seni kovalayan şey çoğu zaman dışarıdan biri değil, ertelediğin bir duygu ya da sorumluluktur.', 'Bir gün dönüp baktığında, peşindeki şeyin aslında seninle konuşmak istediğini göreceksin.', ARRAY['Kabuslar', 'Yabancı', 'Köprü']::text[], 'kovalanmak neyden kaciyorsun? bir seyden kacmak; yuzlesilmeyi bekleyen bir mesele.')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")
VALUES ('theme', 'sinav', 'book-open-text', NULL, 5, 'Sınav', 'Kaygı ve beklentiler.', 'Sınava girmek ya da geç kalmak; kaygı ve beklenti.', NULL, 'İmtihan görmek tabirde bir denenme dönemine; başarmak ise hayırla çıkışa işaret eder.', 'Sınav rüyaları genellikle kendine koyduğun yüksek beklentilerden ve değerlendirilme kaygısından beslenir.', 'Bu rüya bir uyarı değil; sadece biraz nefes almaya ihtiyacın olduğunu hatırlatıyor.', ARRAY['Yabancı', 'Ev', 'Düşmek']::text[], 'sinav kaygi ve beklentiler. sinava girmek ya da gec kalmak; kaygi ve beklenti.')
ON CONFLICT ("slug") DO NOTHING;
