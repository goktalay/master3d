# Master 3D — teknik föy

Dünyadaki yaygın 3B yazılımların dosyalarını tek pencerede açan, inceleyen, **parçalarına ayıran (patlatma)** ve başka 3B
biçimlere **dışa aktaran** masaüstü görüntüleyici. CAD (STEP, IGES, BREP, Rhino, IFC), animasyon ve oyun (glTF, FBX, OBJ,
COLLADA, USDZ, 3DS, Blender, DirectX), 3B baskı (STL, 3MF, AMF, G-code) ve bilim / tarama (PLY, PCD, XYZ, VTK, PDB) dosyaları
ek program kurmadan açılır. Mastertool ailesinin **Araçlar** grubundandır.

- Tanıtım: https://mastertool.download/araclar/master-3d
- İndirme: Hesabım (mastertool.download) ve Master Tool
- Uygulama kodu: `m3` · Kaynak: github.com/goktalay/master3d

## Gereksinimler

| | |
| --- | --- |
| İşletim sistemi | Windows 10 / 11 (64 bit) |
| Ekran kartı | WebGL 2 destekleyen herhangi bir ekran kartı (tümleşik grafik yeterli) |
| Yönetici izni | Gerekmez (kurulumda "yalnız bu kullanıcı" seçeneği; sağ tık kaydı kullanıcı kapsamında) |
| Hesap | Mastertool hesabı (ücretsiz); tek girişle ailenin diğer uygulamaları da açılır |
| Ağ | Gerekmez; internet yalnız hesap, ayar senkronu ve güncelleme denetimi için |
| Disk | ~150 MB |

Kurulum: `Master-3D-Setup-<sürüm>.exe` → `Program Files\Mastertool\Master 3D` (Başlat menüsü: **Master Tool › Master 3D**).
Taşınabilir sürüm: `Master-3D-Portable-<sürüm>.exe` (kurulum gerektirmez).

## Teknoloji

- **Electron 33** (Chromium + Node.js). Pencereler yalıtılmış ve **sandbox**'lı (`contextIsolation`, `nodeIntegration: false`,
  `sandbox: true`); dosya sistemine erişim yalnız ana süreçte.
- **three.js r186** (WebGL 2): görüntüleme, okuyucular ve yazıcıların çoğu. Fiziksel tabanlı malzemeler, ortam ışığı (PMREM),
  yumuşak gölge, nötr ton eşleme.
- **WebAssembly motorları** (her iş ayrı bir çalışan iş parçacığında; arayüz donmaz, iş bitince bellek geri verilir):
  - **OpenCascade** (occt-import-js) — STEP, IGES, BREP; montaj ağacı, gövde ve yüz renkleri, ayarlanabilir üçgenleme kalitesi;
  - **Open Asset Import Library** (assimpjs) — Blender, DirectX, DXF, OFF, MilkShape, B3D, AC3D, ASE, COB, NFF, OpenGEX,
    Quick3D, SMD, XGL ve FBX / COLLADA / 3DS / LWO için yedek okuyucu;
  - **web-ifc** — IFC (BIM): yapı elemanları, renkler, mekânsal yapı (Proje › Arsa › Bina › Kat);
  - **rhino3dm** — Rhino 3DM; **Draco**, **Basis Universal (KTX2)** ve **meshoptimizer** sıkıştırılmış glTF için.
- Paketleme **esbuild** (pencere kodu tek ES modülü) ve **electron-builder** NSIS (kurulum + portable).
- **8 dil**: Türkçe, English, Français, Deutsch, Español, العربية (sağdan sola), 中文, Русский. Tema: Gece / Gündüz / Sistem.

## Açılan biçimler

Her biçim gerçek örnek dosyalarla doğrulanmıştır (bkz. [format-verification.md](format-verification.md)): three.js, assimp ve
occt-import-js projelerinin test modelleri ile üretilen örnekler arayüzün kendi açma akışıyla açılır.

| Öbek | Biçimler | Okuyucu |
| --- | --- | --- |
| Genel ve animasyon | glTF / GLB (Draco, KTX2, meshopt), FBX (ikili ve ASCII), OBJ + MTL, COLLADA (DAE), USD / USDA / USDC / USDZ, 3DS, Blender (2.4–2.7x), DirectX X | three.js, assimp |
| CAD, mühendislik, BIM | STEP (AP203 / AP214 / AP242), IGES, BREP, Rhino 3DM, IFC, DXF (3B yüzeyler) | OpenCascade, rhino3dm, web-ifc, assimp |
| 3B baskı | STL (ikili / ASCII, renkli), 3MF, AMF, G-code, OFF | three.js, assimp |
| Nokta bulutu ve bilim | PLY (ağ ve nokta), PCD, XYZ, VTK / VTP, PDB (molekül) | three.js |
| Oyun ve diğer | VRML 2.0, X3D, LightWave LWO, MagicaVoxel VOX, KMZ, MD2, MD5, MilkShape MS3D, B3D, AC3D, ASE, COB, NFF, OpenGEX, Quick3D, SMD, XGL / ZGL, BVH (iskelet + hareket) | three.js, assimp |
| Arşiv | ZIP (içindeki model + dokular; ör. glTF + .bin + resimler) | — |

- **Yan dosyalar**: dokular, `.mtl` ve `.bin` dosyaları modelin yanından (ve bir alt klasörden) okunur. Bulunamayan yan dosya
  denetçide uyarı olarak listelenir; model yine açılır.
- **Birim ve eksen**: STEP / IGES / BREP milimetre, glTF / USD / IFC / VRML / X3D metre, FBX santimetre, 3B baskı biçimleri mm
  sayılır; birim taşımayan biçimlerde (OBJ, PLY, OFF…) denetçiden seçilir. STEP, STL, 3MF, 3DM, DXF, G-code Z yukarı; diğerleri Y
  yukarı açılır ve tek tıkla değiştirilir.
- **Büyük dosyalar**: okuma ilerleme çubuklu; CAD / BIM / assimp dönüşümü iş parçacığında, iptal edilebilir. Kenar çizgileri
  2,5 milyon üçgene, gölge 4 milyon üçgene kadar çizilir (üstünde kendiliğinden kapanır).

## Görüntüleme

- Gezinme: sol tuş döndür, sağ tuş / Shift+sol kaydır, tekerlek imlecin olduğu yere yakınlaştır; çift tıklama parçaya odaklar.
  Hazır görünümler (Ön, Arka, Sol, Sağ, Üst, Alt, İzometrik; 1–7), sığdır (F), perspektif / ortografik kamera.
- Görünüm kipleri (W): gölgeli, gölgeli + kenarlar (25°'den keskin kenarlar), tel kafes, X-ışını, normaller (yüz yönü).
- Işık: Stüdyo (ortam + anahtar ışık + gölge), Yumuşak, Kamera ışığı. Arka plan: degrade, tema rengi, koyu, açık, saydam.
- Zemin ızgarası (modelin boyutuna göre adım), eksenler, sınır kutusu ve G × Y × D ölçüleri (B), köşe normalleri.
- **Ölçüm** (M): modelde iki nokta → uzaklık, model ya da seçilen birimde.
- **Kesit**: X / Y / Z düzlemi, kaydırıcıyla konum, ters çevirme.
- **Parça ağacı**: dosyadaki hiyerarşi (STEP montajı, glTF düğümleri, IFC katları); arama, göster / gizle, yalnız bunu göster (I),
  diğerlerini soluklaştır, gizle (H), tümünü göster (Alt+H). Seçili parçanın üçgen / köşe sayısı, boyutu, yüzey alanı,
  **hacmi** (kapalı gövdelerde), B-rep yüz sayısı, IFC türü ve GUID'i, malzemeleri.
- **Animasyon**: glTF, FBX, COLLADA, MD2, BVH klipleri; oynat / duraklat, klip seçimi, zaman çubuğu (Boşluk).
- **Ekran görüntüsü** (P): 2× çözünürlükte PNG, panoya kopyalama, saydam arka plan; ölçü etiketleri görüntüye dahil.

## Patlatma

- Kaydırıcıyla %0–100, **Oynat** ile canlandırma (E). Kipler: **Ortadan** (parçalar modelin ortasından dışarı, oransal),
  **X / Y / Z** (eksen boyunca; iç içe parçalar boyutlarına göre sıralanır), **Montaj** (her alt montaj kendi ortasından,
  derinlik arttıkça daha az — montaj yapısı görünür kalır).
- **Parça düzeyi**: tüm gövdeler ya da ağacın 1., 2.… düzeyi (ör. yalnız alt montajları ayır). glTF'in çok malzemeli ağları tek
  parça sayılır.
- **Parçalara ayır**: montaj bilgisi olmayan dosyalarda (STL, OBJ, PLY…) tek ağdaki birbirine dokunmayan gövdeler ayrı parçalar
  olur. Köşeler konuma göre kaynaştırılır, üçgenler birleşim-bul (union-find) ile öbeklenir; iş parçacığında çalışır.
- Patlatılmış konum dışa aktarmaya taşınabilir (Dışa aktar › Patlatılmış konumla).

## Dışa aktarma

Kapsam: **tüm model**, **seçili parçalar** (modeldeki yerleriyle) ya da **görünenler**; istenirse **her parça ayrı dosya**
(seçilen klasöre, parça adlarıyla). Her biçim uygulamada yazılıp yine uygulamada açılarak doğrulanır (bkz.
[export-verification.md](export-verification.md)) ve bağımsız okuyucularla (three.js, assimp, OpenCascade) test edilir.

| Biçim | İçerik | Birim / eksen |
| --- | --- | --- |
| GLB, glTF (gömülü) | Hiyerarşi, PBR malzeme, dokular, animasyon | m, Y yukarı |
| FBX 7.4 ikili | Hiyerarşi, ağlar, normaller, UV, çoklu malzeme (Phong) | Y yukarı, UnitScaleFactor |
| OBJ + MTL | Adlı parçalar (o), malzemeler, renk dokuları (PNG) | olduğu gibi |
| COLLADA 1.4.1 | Hiyerarşi, ağlar, Phong malzemeler | kaynak birim ve eksen `<asset>`'te |
| USDZ | Hiyerarşi, malzemeler, dokular (Apple AR Quick Look) | m, Y yukarı |
| STEP AP214 | Her parça ayrı ürün (montaj), adlar ve renkler; kapalı ağ FACETED_BREP, açık ağ yüzey modeli; düzlemsel yüz birleştirme (aşağıda) | mm, Z yukarı |
| STL ikili / ASCII | Üçgenler (dünya koordinatlarında) | olduğu gibi |
| 3MF | Her parça ayrı nesne, renkler, kaynaştırılmış köşeler | mm, Z yukarı |
| PLY ikili / ASCII | Ağ ve nokta bulutu, köşe renkleri | olduğu gibi |
| VRML 2.0, X3D | Hiyerarşi, malzemeler | m, Y yukarı |
| OFF | Köşe / yüz listesi | olduğu gibi |

"Birim ve ekseni hedef biçime dönüştür" açıkken kaynak birim ve eksen, hedef biçimin sözleşmesine çevrilir (ör. mm / Z yukarı
STEP → m / Y yukarı GLB). Renkler sRGB yazılır (glTF hariç; glTF doğrusal).

### STEP: düzlemsel yüz birleştirme

Ayarlar › Dışa aktarma › STEP (CAD) çevirici ve Dışa aktar penceresi (STEP seçiliyken): **Düzlemsel yüzleri birleştir**, %0–100
(varsayılan %20). Aynı düzlemdeki komşu üçgenler tek çokgen yüz olur (FACE_SURFACE + PLANE; dış sınır FACE_OUTER_BOUND, delikler
FACE_BOUND) — SolidWorks gibi programlarda düz yüzey üçgen üçgen görünmez. `src/core/export/planar.mjs`:

- Bölge büyütme: büyük üçgenler önce tohum; komşu üçgen, tohumun normaline açı toleransı ve düzlemine uzaklık toleransı içindeyse
  katılır. Yüzde → tolerans karesel: açı 0,5°–20°, uzaklık parça köşegeninin %0,01–%0,5'i (%20'de 1,3° ve %0,03). %0 = kapalı
  (her üçgen ayrı yüz, 1.0.0 davranışı).
- Sınırlar yarım kenarlarla çıkarılır; doğrusal ara köşeler Douglas-Peucker ile atılır. İki yüzün ortak kenar zinciri köşe
  kimliklerine göre tek kanonik yönde sadeleştirilir, böylece iki tarafta aynı köşeler kalır (model su geçirmez kalır; testte
  denetlenir). Köşeler yerinden oynatılmaz; düzlem, köşelerin en büyük sapmasını yarıya indiren konuma yerleştirilir.
- Ölçüm (Meshmixer STL, 32.328 üçgen, 153 mm): %5 → 23.720 yüz, %20 → 20.018, %50 → 11.932, %100 → 4.123; köşelerin düzlemden
  en büyük sapması %20'de 0,02 mm, %50'de 0,12 mm. OpenCascade hepsini okur, yüzey alanı farkı %20'de %0,01'in altında.
  Eğri yüzeyler (koni, silindir, organik) düzleme indirgenemez; yüksek yüzdede şeritlere bölünür.

## Gezgin entegrasyonu

Ayarlar › Genel › "Sağ tık menüsüne Master 3D ile aç ekle" (varsayılan açık): desteklenen 59 uzantıda
`HKCU\Software\Classes\SystemFileAssociations\.<uzantı>\shell\MastertoolMaster3D` ve "Birlikte aç" listesi
(`HKCU\Software\Classes\Applications\Master 3D.exe`). Kayıt tek bir `reg import` ile yazılır (UTF-16 .reg; Türkçe, Arapça,
Çince etiketler bozulmaz). **Varsayılan uygulama değiştirilmez.** Etiket uygulamanın dilinde; dil değişince güncellenir.
Kaldırıcı bu anahtarları siler. Açık bir Master 3D varken yeni dosya aynı pencerede açılır (tek örnek). Pencereye sürükle-bırak
ve son açılanlar (12 dosya, yalnız bu bilgisayarda) desteklenir.

## Ayarlar

**Genel** (dil, tema, Gezgin sağ tık menüsü, güncelleme denetimi), **Hesap** (senkron, Hesabım, çıkış), **Görüntüleyici**
(ölçü birimi, yukarı eksen, CAD üçgenleme kalitesi düşük / orta / yüksek, kamera, arka plan, ışık, yakınlaştırma yönü, sayaçlar),
**Biçimler** (açılan ve dışa aktarılan biçimler, okuyucuları, bilinen sınırlar), **Hakkında** (sürüm, güncelleme, tanıtım sayfası,
açık kaynak lisansları). Sağ üstte Mastertool düğmesi.

## Mastertool hesabı, ortak oturum ve senkron

- Uygulama hesapsız çalışmaz; başka bir Mastertool uygulamasında giriş yapılmışsa ortak oturumla şifresiz açılır
  (Windows Kimlik Bilgisi Yöneticisi `Mastertool` / `sso`, `%APPDATA%\Mastertool\sso-state.json`). Birinde çıkış yapınca hepsinden çıkılır.
- Hesap uçları `/api/m3/*`. Yalnız **ayarlar** (tema, dil, görüntüleyici ve dışa aktarma tercihleri) uçtan uca şifreli senkronlanır:
  PBKDF2 → HKDF `m3d-enc-v1` → AES-256-GCM; sunucu içeriği okuyamaz.
- Sürüm denetimi `GET /api/m3/releases/latest`; yeni sürüm bildirimi, indirme Hesabım / Master Tool'dan.

## Gizlilik ve güvenlik

- **3B dosyalar, dokular, dosya adları ve son açılanlar listesi hiçbir yere gönderilmez.** Okuma, dönüştürme ve dışa aktarma
  tamamen bu bilgisayarda yapılır.
- Pencereler yalnız uygulamanın kendi `m3://` adresinden yüklenir. Kullanıcı dosyaları `m3://file/<jeton>/` altında, yalnız açılan
  dosyanın klasöründen okunur: `..`, mutlak yol, sürücü harfi ve klasör dışına giden sembolik bağ reddedilir.
- İçerik güvenlik politikası: pencerede ağ adresi yok, `eval` yok (yalnız WebAssembly derlemesi); WebAssembly iş parçacıklarında DOM
  ve ağ yok (embind'in ürettiği işlevler için `unsafe-eval` yalnız bu yalıtılmış iş parçacıklarında).
- Kaydedilen dosya adları süzülür (yol ayıracı, sürücü, `..` kabul edilmez); ek dosyalar yalnız ana dosyanın klasörüne yazılır.

## Yerel veri

`%APPDATA%\Master 3D\store.json`: ayarlar, son açılanlar (yol, ad, boyut, tarih), pencere boyutu, sağ tık kaydının son durumu ve
senkron meta verisi. `account.json`: cihaz kimliği, e-posta; "Beni hatırla" açıksa DPAPI ile şifreli oturum.

## Sürüm yayını

`v*` etiketi → GitHub Actions (windows-latest): `npm ci` → `npm test` → `npm run build` → electron-builder → GitHub Release →
mastertool.download'a parçalı yükleme (`scripts/upload-master3d.sh`, ≤ 90 MB parçalar; anahtar depo secret'ı `MASTER_RELEASE_KEY`).
Daha önce yayınlanmış bir sürümü yeniden yüklemek için Actions › "mastertool.download'a yükle".

## Testler

`npm test` (Node, 54 test): hesap ve ortak oturum, i18n eşliği (8 dil, yer tutucular), protokol yol güvenliği, komut satırı ve sağ
tık kaydı, biçim kaydı, çekirdek (OpenCascade ve assimp hatları, VTK / X3D / VRML, ZIP seçimi, patlatma, bağlantısız parça bulma,
alan / hacim, IFC ağacı), 15 dışa aktarma biçiminin bağımsız okuyucularla gidiş-dönüşü ve ana süreç (sahte Electron).
`npm run verify-formats` ve `npm run verify-export` gerçek örnek dosyalarla tarayıcıda (Chromium, WebGL) arayüz akışını sınar;
`npm run e2e -- <model…>` paketli uygulamayı gerçek Electron ana süreciyle çalıştırır (sahte hesap sunucusu, giriş, `--open`,
m3:// protokolü, WebAssembly iş parçacıkları ve içerik güvenlik politikası).

## Bilinen sınırlar

- **Kapalı (lisanslı) biçimler doğrudan okunamaz**: 3ds Max (.max), Maya (.ma / .mb), SolidWorks (.sldprt / .sldasm),
  CATIA (.CATPart), Inventor (.ipt / .iam), Creo / NX (.prt), SketchUp (.skp), Cinema 4D (.c4d). Bu biçimlerin açık belirtimi
  yoktur; programların kendisinden STEP, FBX, glTF ya da OBJ olarak kaydedilir, Master 3D bunları açar.
- **Blender**: 2.4–2.7x dosyaları kısmen (ağlar, hiyerarşi, malzeme renkleri). Blender 2.8 ve sonrası `.blend` dosyaları
  okunamaz; sürüm algılanır ve "glTF / FBX olarak dışa aktarın" uyarısı gösterilir.
- **STEP dışa aktarma** üçgen yüzeylidir (faceted B-rep): CAD programlarında açılır, ölçülür ve montajda kullanılır; düz
  yüzeyler birleştirilir (yukarıda) ama silindir, NURBS yüzey ve unsur geçmişi gibi parametrik bilgi üçgen ağdan geri üretilemez. Çok büyük modellerde (300.000 üçgen
  üstü) dosya büyük olur.
- **FBX dışa aktarma**: iskelet, animasyon ve dokular bu sürümde yazılmaz (hiyerarşi, ağlar, normaller, UV, malzeme renkleri
  yazılır). Animasyonu korumak için GLB kullanın.
- **USD**: katman birleştirme (sublayer, variant, payload) ve animasyon kısmidir; tek dosyalı USDA / USDC / USDZ açılır.
- **DXF**: yalnız 3B yüzeyler (3DFACE, çokgen ağ); 2B çizim nesneleri (çizgi, yazı, ölçü) gösterilmez.
- **X3D**: Inline (dış dosya), betikler, algılayıcı ve yorumlayıcılar (etkileşim / animasyon) atlanır.
- Windows 11'de klasik sağ tık kaydı "Daha fazla seçenek göster" altında görünür; yeni kısa menü imzalı bir uygulama paketi
  (MSIX) gerektirir.
