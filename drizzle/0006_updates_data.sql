INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")
VALUES ('u1-muneccim-zuhre', 'new_interpreter', true, '2026-05-28T00:00:00.000Z', 'Müneccim Zühre artık aramızda', 'Rüyanı burcun ve gök hareketleriyle yorumlayan yeni astrolojik yorumcumuzla tanış.', 'Müneccim Zühre tanıtım görseli', ARRAY['Uzun zamandır beklenen astrolojik yorumcumuz Müneccim Zühre, artık Keşfet sekmesinde seni bekliyor.', 'Rüyalarını yalnızca sembollerle değil; burcun, gezegenlerin konumu ve içinde bulunduğun döngülerle birlikte ele alıyor. Pro üyeler hemen bir rüya yorumlatabilir.']::text[])
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")
VALUES ('u2-sesli-anlatim', 'new_feature', true, '2026-05-14T00:00:00.000Z', 'Rüyanı sesinle anlat', 'Artık rüyanı yazmak yerine sesinle anlatabilirsin; uygulama senin için metne çevirir.', 'Sesli anlatma ekranı', ARRAY['Sabahın erken saatinde yazmak zor olabiliyor. Yeni sesli anlatım özelliğiyle mikrofona dokun, rüyanı anlat; gerisini bize bırak.', 'Konuşmanı otomatik olarak metne çeviriyor, dilersen göndermeden önce düzenleyebiliyorsun.']::text[])
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")
VALUES ('u3-gunluk-arama', 'improvement', false, '2026-05-02T00:00:00.000Z', 'Günlükte arama ve filtreleme', 'Geçmiş rüyalarını sembole, yorumcuya veya tarihe göre saniyeler içinde bul.', 'Günlük arama görseli', ARRAY['Rüya günlüğün büyüdükçe aradığını bulmak zorlaşıyordu. Artık günlüğün en üstündeki arama çubuğuyla rüyalarını başlığa, sembole ve yorumcuya göre süzebilirsin.']::text[])
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")
VALUES ('u4-gunun-sembolu', 'improvement', false, '2026-04-20T00:00:00.000Z', 'Günün sembolü yenilendi', 'Her gün karşına çıkan sembol kartı artık daha zengin açıklamalar içeriyor.', 'Günün sembolü kartı', ARRAY['Keşfet sekmesindeki “Günün sembolü” kartını yeniledik. Artık her sembolün kısa hikayesini, kültürel anlamını ve sık görülen yorumlarını bir arada bulabilirsin.']::text[])
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")
VALUES ('u5-yazi-boyutu', 'new_feature', false, '2026-04-05T00:00:00.000Z', 'Yazı boyutu ayarı', 'Rüya yorumlarını daha rahat okuman için yazı boyutunu profilinden ayarla.', 'Yazı boyutu ekranı', ARRAY['Profil sayfasına yazı boyutu ayarı ekledik. Küçükten çok büyüğe dört seçenekten dilediğini seçerek tüm uygulamadaki yazıları gözüne en uygun boyuta getirebilirsin.']::text[])
ON CONFLICT ("slug") DO NOTHING;
