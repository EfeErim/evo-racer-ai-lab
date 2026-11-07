# EvoRacer AI Lab yol haritası

7 Kasım 2026 itibarıyla. Yayımlanmış sürüm `v1.1.0`. `main` fizik v2'yi içeriyor ve [CI'dan geçti](https://github.com/EfeErim/evo-racer-ai-lab/actions/runs/42359132144). Çalışma doğrudan `main` üzerinde ilerliyor. [Proje durumu](../PROJECT_STATE.md) · [Fizik v2 kanıtı](verification/physics-v2.md)

## Neredeyiz

Ürün özellik olarak tamam. [Faz gate'lerindeki](../.agents/skills/build-evo-racer/references/phase-gates.md) M0–M11 teslimatlarının hepsi var: üç preset, editör, üretici, fizik, Fixed GA, NEAT, izleme, sonuçlar, kayıt, Windows paketi ve yayın süreci. Otomatik testler, determinizm fixture'ları ve paket kabul testi her değişiklikte geçiyor.

Eksik olan özellik değil, **kanıt ve kalite**:

| Alan                         | Durum                                                                                                                                                                           | Neden önemli                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Öğrenme kalitesi             | Sağlandı. Her presette önerilen plan iki algoritmada da en az 2/3 tur bitiriyor ve kontrolü geçiyor; Chicane yalnızca Thorough ile. Fren hâlâ çoğunlukla sabit hız sınırlayıcı. | Kullanıcı her pist için çalışan bir plan seçebiliyor. |
| Önerilen ayarların doğruluğu | Sağlandı. Üç plan açıklaması 54 eşli koşuluk ölçüme dayanıyor.                                                                                                                  | Ekrandaki vaat kanıta dayanıyor.                      |
| Temiz Windows, ağ kapalı     | Hiç yapılmadı. M9 ve M10 gate'lerinin şartı.                                                                                                                                    | "Tamamen çevrimdışı" iddiasının tek eksik kanıtı.     |
| Erişilebilirlik              | Otomatik tarama, %200 yakınlaştırma, ekran okuyucu yok.                                                                                                                         | WCAG 2.2 ölçütleri doğrulanmadı.                      |
| Kullanılabilirlik            | Gerçek kullanıcı testi yok.                                                                                                                                                     | "Kolay anlaşılır" iddiası kanıtsız.                   |
| Yayın                        | v1.1.1 ve fizik v2 yayımlanmadı; sürüm hâlâ `1.1.1`.                                                                                                                            | Kullanıcılar eski `v1.1.0` paketini indiriyor.        |

**Kabaca:** mühendislik %90, kanıtlanmış ürün %80. Öğrenme ve öneriler kanıta bağlandı (1. ve 2. adım). Sırada bu sürümün erişilebilirlik, çevrimdışı ve kullanıcı doğrulaması, ardından yayın var.

## Başarı tanımı (v1.2.0)

Proje, aşağıdakilerin hepsi kaydedilmiş kanıtla sağlandığında başarılıdır:

1. **Öğreniyor:** Her preset, kendisi için önerilen eğitim planıyla, önceden ayrılmış seed'lerde Fixed GA ve NEAT'in her birinde 3 koşudan en az 2'sinde tur bitiriyor ve aynı aday sayısındaki seçilimsiz kontrolü geçiyor.
2. **Söylediğini yapıyor:** Her eğitim planı açıklaması ve README iddiası kayıtlı bir ölçüme dayanıyor.
3. **Gerçekten çevrimdışı:** Paket, ağı kapalı temiz bir Windows'ta Review → Start → Training → Results → kapat → aç → Results akışını tamamlıyor.
4. **Erişilebilir:** Her ekranda axe taramasında ciddi veya kritik ihlal yok, akış klavyeyle ve %200 metin ölçeğinde tamamlanıyor.
5. **Anlaşılır:** 5 ilk kullanıcının en az 4'ü üç ana görevi yardımsız tamamlıyor.
6. **Yayımlandı:** `v1.2.0` M11 gate'inden geçerek GitHub Release olarak yayımlandı.

## Sıralı plan

Her adımın bir çıkış ölçütü var. Ölçüt sağlanmadan sonraki adıma geçilmez. 🧑 işareti senin yapman gereken adımları gösterir.

### 1. Fren ve fitness kararı · devam ediyor

[Önceden kaydedilmiş deney](verification/lap-weight-plan.md) tur süresi ağırlığını `W = 300, 1500, 3000` ile yeni seed ve pistlerde karşılaştırıyor.

- [x] Aşama 1 sonucunu plandaki üç ölçütle değerlendir. Sonuç: ağırlığın hiçbir etkisi olmadı. 24 vakanın 24'ünde üç ağırlık da aynı şampiyonu üretti, çünkü seçilim sıralamaya bakıyor ve bitirenleri her ağırlıkta zaten tur süresine göre sıralıyor. [Sonuç](verification/lap-weight-plan.md#result-2026-11-07)
- [x] Karar: `W = 300` kalıyor, aşama 2 çalıştırılmadı, uygulama kodu değişmedi.
- [x] Önceki "fitness tur süresine az ödüyor" açıklaması düzeltildi. Değişken fren her turda 4,4 saniyeye kadar kazandırıyor, ama evrim bu bütçelerde onu bulamıyor.

**Çıkış:** Sağlandı. v1.2.0 için fren davranışı daha fazla zorlanmıyor. Değişken frenin bulunması 2. adımdaki daha uzun bütçelerde ölçülecek; bulunmazsa bu bir arama sınırı olarak dürüstçe raporlanacak.

### 2. Önerilen ayarları kanıta bağla · tamamlandı

[Togelius ve Lucas](https://arxiv.org/abs/cs/0611006) ile [Cardamone ve diğerleri](https://re.public.polimi.it/handle/11311/565272), pist zorluğunun ve değerlendirme süresinin evrilen sürücüyü belirlediğini gösteriyor. Ölçümler de aynı yönde: Chicane'de en iyi sabit hız 33,1 s sürüyor, yani 30 s sınırı bu pisti yapısal olarak zorlaştırıyor.

- [x] [Önceden yazılı planla](verification/training-plan-plan.md) 54 eşli koşu ölçüldü: 3 plan × 3 preset × 2 algoritma × 3 yeni seed. [Sonuç](verification/training-plan-plan.md#result-2026-11-07)
- [x] Chicane'i yalnızca Thorough çözüyor (60 s denemeler, NEAT 3/3, Fixed GA 2/3). Bu yüzden deneme süresi değişmedi; arayüz Chicane için Thorough'u açıkça söylüyor.
- [x] Fixed GA'nın Quick check'te zayıf olduğu doğrulandı (Technical Circuit'te 1/3). Quick check zaten NEAT ile geliyor; hiçbir planın algoritması değişmedi, B aşaması gerekmedi.
- [x] Üç planın açıklaması ölçüme göre yeniden yazıldı. Balanced'daki yanlış "daha uzun deneme" ifadesi kaldırıldı.
- [x] Daha uzun bütçeler değişken freni bulmadı: 17 Thorough bitiricisinin yalnızca 1'i sabit ortalama frenle bitiremiyor. Bu bir arama sınırı olarak kayıtlı.

**Çıkış:** Sağlandı. Başarı tanımının 1. maddesi, her preset için şu önerilen planla iki algoritmada da en az 2/3 tur ve kontrol üstünlüğüyle sağlanıyor: Easy Oval için Quick check, Technical Circuit için Balanced, Chicane Challenge için Thorough. 2. madde plan açıklamaları için sağlandı. README iddiaları 6. adımda yayın öncesi yeniden kontrol edilecek.

### 3. Erişilebilirliği otomatik ve elle doğrula

[Playwright'ın kendi belgesi](https://playwright.dev/docs/accessibility-testing) `@axe-core/playwright` ile taramayı öneriyor ve otomatik testlerin sorunların yalnızca bir kısmını bulduğunu açıkça söylüyor. Bu yüzden elle kontrol de gerekiyor.

- [ ] Geliştirme bağımlılığı olarak `@axe-core/playwright` ekle; Welcome, Track, Settings, Review, Training ve Results'ı `wcag2a`, `wcag2aa`, `wcag22aa` etiketleriyle tara. Pakete girmez, çevrimdışı ürünü etkilemez.
- [ ] Önerilen akışı yalnızca klavyeyle ve 320 CSS px genişlikte (%400'e denk yeniden akış) uçtan uca test et; yatay kaydırma olmamalı.
- [ ] Bulunan ciddi ve kritik ihlalleri düzelt.
- [ ] 🧑 NVDA ile 15 dakikalık kontrol listesini tamamla: Start, durum mesajları, Results tablosu okunuyor mu. Listeyi ben hazırlarım.

**Çıkış:** Başarı tanımının 4. maddesi.

### 4. Temiz Windows'ta çevrimdışı kabul

Bu makine Windows 11 Pro ve donanım sanallaştırması açık, yani temiz Windows için ayrı bir bilgisayar gerekmiyor. [Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file) her açılışta sıfır bir Windows başlatıyor ve `<Networking>Disable</Networking>` ile ağı tamamen kapatıyor.

- [ ] 🧑 Yönetici PowerShell'de bir kez çalıştır ve bilgisayarı yeniden başlat: `Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM`
- [ ] `release\EvoRacer` klasörünü salt okunur bağlayan, ağı kapalı bir `.wsb` dosyası ve kabul betiği ekle.
- [ ] Sandbox içinde Review → Start → Training → Results → kapat → aç → Results akışını tamamla; Python ve Node.js olmadığını, yalnızca loopback dinlendiğini kaydet.

**Çıkış:** Başarı tanımının 3. maddesi; M9 ve M10 gate'lerindeki temiz makine şartı kapanır.

### 5. İlk kullanıcı testi

[Nielsen'in önerisi](https://webarchive.library.unt.edu/web/20121006195132/http://www.useit.com/alertbox/20000319.html) tek büyük test yerine 5'er kişilik kısa turlar yapıp aralarda sorunları düzeltmek. Bu sayı sorun bulmak içindir, istatistiksel kanıt için değil.

- [ ] Moderatör yönergesi, görev kartları ve kayıt formunu hazırla. Görevler: önerilen deneyi başlat; üretilmiş bir pist seç ve onunla eğit; Results'ta turu, fitness'ı ve Pure Pursuit karşılaştırmasını açıkla.
- [ ] 🧑 Uygulamayı daha önce görmemiş 5 kişiyle oturum yap. Her biri 20–30 dakika sürer; tarif etmeden izle ve formu doldur.
- [ ] Bulguları P0–P3 olarak sınıflandır, P0 ve P1'leri düzelt. Gerekirse düzeltilmiş sürümle 3 kişilik ikinci tur yap.

**Çıkış:** Başarı tanımının 5. maddesi.

### 6. v1.2.0 yayını

Fizik ve fitness davranışı değiştiği için sürüm `1.2.0` olmalı. `1.1.1` yalnızca bir paket düzeltmesiydi.

- [ ] Sürümü `1.2.0` yap; sürüm notunu ve README indirme metnini kanıta göre güncelle.
- [ ] `npm run test:phase10`, `npm run test:learning` ve Sandbox kabulünü yayın commit'inde yeniden çalıştır.
- [ ] 🧑 Etiket ve GitHub Release için açık onay ver; ardından `npm run test:phase11` ile indirilen dosyanın SHA-256'sını doğrula.
- [ ] README'deki demo görselini gerçek bir Results ekran görüntüsü veya kısa bir eğitim klibiyle değiştir.

**Çıkış:** Başarı tanımının 6. maddesi; proje tamamlanmış sayılır.

## v1.2.0 sonrası, isteğe bağlı

Bunlar başarı tanımının parçası değil. Ancak yukarıdakiler bittikten sonra, projeyi bir adım öteye taşımak için:

- **Pistler arası genelleme:** Şu an her koşu değerlendirildiği pistte eğitiliyor. [Togelius ve Lucas](https://web-archive.southampton.ac.uk/cogprints.org/5219/index.html), birden çok pistte eğitimin genel sürücüler, tek pistte eğitimin uzman sürücüler ürettiğini gösteriyor. "Görülmemiş pistte dene" modu güçlü bir portföy iddiası olur.
- **Çeşitlilik görünümü:** [MAP-Elites](https://arxiv.org/abs/1504.04909), farklı sürüş tarzlarının (örneğin hızlı ve riskli ya da yavaş ve güvenli) en iyilerini bir harita olarak gösterir. Öğretici bir izleme ekranı olabilir.
- **Tohum sayısı:** [Henderson ve diğerleri](https://arxiv.org/abs/1709.06560) az seed'le yapılan karşılaştırmaların yanıltabileceğini gösteriyor. Algoritma sıralaması iddia edilecekse seed sayısı [güç analiziyle](https://arxiv.org/abs/1806.08295) seçilmeli.

## Benzer projelerden alınacak dersler

- [Keiwan'ın Evolution'ı](https://github.com/keiwando/evolution) aynı ürün türünde, ve en başarılı örnek o: kullanıcı tasarlıyor, yapay zekâ öğreniyor, kullanıcı izliyor. Kısa ilk sonuç döngüsü ve tek tuşla başlama, EvoRacer'ın önerilen akışıyla örtüşüyor. Fark burada: EvoRacer'ın her preseti makul bir sürede görünür bir başarı göstermeli. 2. adım bunun için.
- [Samuel Arzt'ın Applying_EANNs'i](https://srclog.com/Applying_EANNs) en iyi aracın ağ çıktılarını canlı gösteriyor. EvoRacer'da direksiyon, gaz ve fren telemetrisi zaten var; frenin sabit mi değişken mi kullanıldığını göstermek, 1. adımın bulgusunu kullanıcıya da anlatır.
- [TensorFlow Playground](https://arxiv.org/abs/1708.03788), kod yazmadan doğrudan oynayarak sezgi kazandırmayı ön plana koyuyor. EvoRacer'ın "ayar → izle → karşılaştır" döngüsü bu yaklaşıma uygun; kullanıcı testi bunun gerçekten işe yarayıp yaramadığını ölçecek.
- [Unity ML-Agents karting çalışmaları](https://ejournal.unida.gontor.ac.id/index.php/FIJ/article/view/5487) pekiştirmeli öğrenme kullanıyor ve GPU ile uzun eğitim gerektiriyor. EvoRacer'ın çevrimdışı, deterministik ve dakikalar içinde sonuç veren yaklaşımı bilinçli bir fark; README'de bu fark açıkça anlatılmalı.

## Tamamlananlar

- Fizik v2 kayıt uyumluluğu: v2 kayıt, yeniden açma ve dışa aktarma; v1 kayıtları okunur ve dışa aktarılabilir; yarım kalan v1 koşuları gerekçesiyle korunur; karşılaştırma aynı fizik sürümünü şart koşar.
- Fren deneyleri: referans sürücüyle faktöriyel deney, held-out şampiyonlarında fren ablasyonu, sabit frenin nedenini ölçen fren değeri analizi.
- 96 koşuluk önceden kaydedilmiş held-out matris; araç genleri sabitken ek deney.
- Fizik v1 benchmark ve fixture'larının tarihsel kayıt olarak korunması; v2 fixture'ları.
- Bu makinede `test:phase10`, `test:learning`, paketli EXE akışı ve CI.
