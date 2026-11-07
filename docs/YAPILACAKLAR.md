# EvoRacer AI Lab yapılacaklar listesi

6 Kasım 2026 itibarıyla yayımlanmış sürüm `v1.1.0`. `main` üzerindeki `dd65b40` CI'dan geçti. Fizik v2 `main` üzerinde (`ef6b5be`) ve [CI'dan geçti](https://github.com/EfeErim/evo-racer-ai-lab/actions/runs/42359132144). ZIP imzasız ve yayımlanmamış. Çalışma doğrudan `main` üzerinde ilerliyor. [Proje durumu](../PROJECT_STATE.md) · [Fizik v2 kanıtı](verification/physics-v2.md) · [GitHub CI](https://github.com/EfeErim/evo-racer-ai-lab/actions/runs/42052993584)

## 1. P0 · Fizik v2 kayıt uyumluluğu

Kayıt hatası giderildi. Fixed GA ve NEAT v2 sonuçları kaydediliyor, yeniden açılıyor ve dışa aktarılıyor. [Sonuç üretimi](../python/src/evo_racer/observer.py) · [Kayıt doğrulaması](../python/src/evo_racer/run_library.py)

- [x] Yeni v2 sonuçlarını kaydet, yeniden aç ve dışa aktar. Tamamlanmış v1 kayıtlarının okuma, tekrar oynatma ve dışa aktarma yollarını koru.
- [x] Yarım v1 koşuları için devam politikasını belirle. Karar: v1 fizik altında devam desteklenmiyor. Kayıt korunuyor, neden satırda açıklanıyor, Resume gösterilmiyor ve Welcome'dan yeni koşu öneriliyor.
- [x] Önceki koşuları karşılaştırırken pist kimliği, bütçe ve fizik sürümü eşleşmesini zorunlu kıl. Devam ve karşılaştırma kararları Python'da.
- [x] Fixed GA ve NEAT için bitir → yeniden başlat → aç → dışa aktar akışını doğrula. v1 tamamlanmış kayıt, v1 yarım kayıt, v2 devam ve sürümler arası karşılaştırma örnekleri kapsandı.

## 2. P1 · Frenin yarışa katkısı

Referans sürücüde fren bazı koşullarda işe yarıyor. Evrilen şampiyonlarda fren çoğunlukla sabit bir hız sınırlayıcı: tur bitiren 55 şampiyonun 36'sı frensiz bitiremiyor, ama 54'ü fren ortalamasında sabit tutulunca da bitiriyor. Sert fren oranının medyanı `%0`. [Bulgular](verification/physics-v2.md#do-evolved-champions-actually-brake) · [Fizik kodu](../python/src/evo_racer/simulation.py) · [F1TENTH benchmark çalışması](https://arxiv.org/abs/2402.18558)

- [x] Aynı pist, araç ve başlangıç koşulunda eski ve yeni sürüklenmeyi, viraj sınırı açık ve kapalı olacak şekilde karşılaştır. Deney ayarlarını ve sonuçlarını kaydet.
- [x] Aynı referans sürücüyü fren açık ve kapalı çalıştır. Pist başına tur tamamlama, çarpışma, ilerleme, viraj giriş hızı ve bitirenlerde tur süresini raporla.
- [x] Chicane Challenge'da referans sürücüyü önce yeterli süreyle çalıştır. Ardından 30 saniyelik sınırla aynı koşulu tekrarla ve sonuçları ayrı göster.
- [x] Fizik v2 adayını bu kanıtla değerlendir. Sabit zaman adımı, seed tekrarlanabilirliği ve bölüm boyunca değişmeyen araç ve ağ parametrelerini doğrula.
- [x] Sabit frenin nedenini incele. Aynı direksiyonla değişken fren, varsayılan araçta turu 1,1–4,4 s kısaltıyor, ama fitness'ta bir saniye yalnızca 10 puan; tur bitirmek 1000–1300 puan. Sabit hız dört pistin üçünde 30 s içinde bitiriyor; Chicane'de bitirmiyor (33,1 s). [Analiz](verification/physics-v2.md#why-a-constant-brake-is-enough)
- [ ] Viraj öncesi frenleme hedef mi, karar ver. Hedefse seçenekler: fitness'ta tur süresinin ağırlığını artırmak, daha kısa süre sınırı ya da daha zor pistler. Her biri fixture'ları değiştirir ve yeni seed ile pistlerle ölçülmeli.

## 3. P1 · Regresyon ve öğrenme benchmark'ı

Fizik v2 held-out matrisinde evrim, aynı aday sayısına sahip seçilimsiz kontrolü 84/96 çiftte geçti. Tur bitiren şampiyon sayısı Fixed GA'da 23/48, NEAT'te 32/48. Her hücrede üç seed var, belirsizlik geniş. [Held-out sonuçları](verification/physics-v2.md#held-out-matrix) · [Öğrenme benchmark'ı](verification/learning-benchmark.md)

- [x] Fizik v1'in 30 vakasını tarihsel karşılaştırma olarak koru. v2 için öğrenme sonuçlarını ve deterministik regresyon fixture'larını ayrı kaydet. Fizik sürümü, seed, pist, bütçe ve ham sonuçları birlikte sakla.
- [x] Ayar seçiminde kullanılmamış seed'leri ve üretilmiş pistleri önceden ayır. Quick check ve daha uzun bir bütçede Fixed GA, NEAT ve aynı sayıda aday değerlendiren seçilimsiz kontrolü eşleştir. Gerçek simülasyon adımı sayısını da raporla.
- [x] Pist ve bütçe bazında tamamlama oranı, çarpışma ve süre dolumu, eşleştirilmiş fitness farkı ve belirsizlik aralıklarını raporla. Tur süresini tamamlanan turlar için ayrı göster.
- [x] Araç genleri sabitken ek bir deney yap ve sürücü evriminin katkısını ölç. Sonuçları `docs/algorithm-comparison.md` ve öğrenme kanıtıyla eşleştir. Sonuç: araç evriminin net bir faydası görülmedi (28/48 ve 27/48 tur). [NEAT bileşen deneyleri](https://www.cs.utexas.edu/~ai-lab/pub-view.php?PubID=114) · [Belirsizlik raporlama](https://arxiv.org/abs/2108.13264) · [self-driving-f1 benchmark örneği](https://github.com/cangokmen/self-driving-f1)

## 4. P1 · Yayın adayı ve kullanıcı doğrulaması

- [x] Son kaynak üzerinde `npm run test:phase10` ve `npm run test:learning` çalıştır. Kaynak, Chromium, paket ve benchmark sonuçlarını ZIP SHA-256 ile birlikte kaydet. Kod `ef6b5be` ile commit edildi.
- [ ] Temiz Windows x64 ortamında Wi-Fi ve Ethernet kapalıyken paketli EXE ile Review → Start → Training → Results → yeniden açma akışını tamamla. Yalnızca loopback bağlantısı kullanıldığını ve kurulu Python ya da Node.js gerekmeksizin çalıştığını kaydet. Akış bu makinede denendi; temiz ortam hâlâ yok.
- [ ] %200 yakınlaştırma, klavye ve ekran okuyucuyla ana görevleri dene. Start, durdurma ve kayıt kontrollerinin erişilebilir kalmasını, durum mesajlarının duyurulmasını doğrula. [Arayüz test kanıtı](verification/ui-redesign.md) · [W3C metin ölçekleme ölçütü](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [ ] İlk kez kullanan kişilerle önerilen deneyi başlatma, üretilmiş pisti seçme ve Results'ta tur, fitness ve Pure Pursuit sonucunu açıklama görevlerini gözlemle. Yanlış yorumları ve tamamlanamayan görevleri kaydet. Şu an katılımcı yok.
- [x] Doğrulama kanıtını `PROJECT_STATE.md` dosyasına işle. Push, etiketleme, imzalama ve yayımı ayrı yetkilendirme adımları olarak ele al.
- [ ] Commit sonrası doğrulama kanıtını v1.1.1 sürüm notuna işle.
