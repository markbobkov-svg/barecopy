# Barecopy — пакет запуска (режим «выложил и ушёл»)

URL: https://barecopy.com · Контакт: support@barecopy.com · Бренд безличный.

Порядок: сначала каталоги (шаг 1) — трафик 24/7 без тебя. Потом добавь
SEO-страницу в Search Console (шаг 2). Reddit (шаг 3) — по желанию, точечно.
Show HN и Product Hunt держим в резерве: они требуют живого присутствия в
комментариях 2-3 часа, а ты выбрал асинхронный режим — не жги их вслепую.

Правило площадок: почти все каталоги и сабреддиты **банят чистую саморекламу**.
Поэтому тексты ниже описывают продукт по делу, без превосходных степеней и без
«revolutionary». Один заход — один листинг, не спамь одинаковым текстом веером.

═══════════════════════════════════════════════════════════════════
ШАГ 1 — КАТАЛОГИ
═══════════════════════════════════════════════════════════════════

Куда подавать — проверено, с реальными требованиями площадок:

1) SaaSHub — https://www.saashub.com/submit — НАЧНИ С НЕГО, сегодня.
   Бесплатно, модерация, обычно живёт через 1-3 дня.
   ⚠ Обязательно укажи конкурентов в форме (iLovePDF, Smallpdf, ExifTool,
   MetaWipe) — заявки без перечисленных конкурентов уезжают в конец очереди.
   Верификация продукта поднимает приоритет — сделай, если предложат.
   Бонус: после листинга в management-странице SaaSHub открывается их
   бесплатный список ~108 каталогов с пошаговыми инструкциями и трекингом
   поданного — это твой конвейер каталогов на «выложил и ушёл».

2) AlternativeTo — https://alternativeto.net — аккаунт заведи СЕГОДНЯ,
   подача через неделю.
   ⚠ Новый аккаунт должен прожить 7 дней, прежде чем ему разрешат добавить
   приложение (антиспам-политика). Поэтому: сегодня регистрация (2 мин),
   через неделю — иконка профиля → «Suggest new application» → поля
   Platforms (Online/Web), License (Freemium), Descriptions, Tags → Submit.
   Они стали строже к одобрению: описание должно быть нейтральным, без
   рекламных превосходных степеней (тексты ниже уже такие). Профиль не
   использовать для рекламы — банят.

3) Остальные каталоги — бери из списка SaaSHub (п.1) после его листинга,
   по убыванию Domain Strength. Не подавай один и тот же текст веером в
   один день — по 2-3 каталога за заход.

N/A: opensourcealternative.to — только для open-source, Barecopy не подходит.

--- Название ---
Barecopy

--- Одна строка (tagline, ≤60 симв.) ---
Remove hidden metadata from files — 100% in your browser

--- Короткое описание (≈50 слов) ---
Barecopy shows the hidden metadata inside your documents and photos — author
name, company, edit history, GPS location — and removes it. Everything runs in
your browser, so the file is never uploaded. Supports Word, Excel, PowerPoint,
PDF, JPG, PNG and WebP.

--- Длинное описание (≈120 слов) ---
Documents and photos carry more than their contents. A Word file stores the
author, the company, how long it was edited and a preview of the first page; a
photo can carry the GPS coordinates of where it was taken. Barecopy shows you
exactly what a file reveals, then hands back a clean copy with the identifying
fields removed.

The point of difference is where the work happens: entirely inside your browser.
The file is never sent to a server — you can disconnect from the internet after
the page loads and it still works, which matters when the document is sensitive
enough that you wanted the metadata gone in the first place.

Free for everyday use. A Pro tier adds whole-folder batch cleaning and a
verification report listing what was removed from each file. Supports DOCX,
XLSX, PPTX, PDF, JPG, PNG and WebP.

--- Категории/теги ---
privacy, metadata, security, pdf-tools, document-tools, exif, gdpr, browser-tool

--- Контакт ---
support@barecopy.com

═══════════════════════════════════════════════════════════════════
ШАГ 2 — SEO (одноразово, работает месяцами)
═══════════════════════════════════════════════════════════════════

1. Google Search Console (search.google.com/search-console):
   - Add property → barecopy.com → подтверди владение (проще всего DNS-записью
     у регистратора, или файлом-верификатором — Vercel отдаст статику).
   - Sitemaps → добавь `sitemap.xml`.
   - URL Inspection → вставь barecopy.com и /remove-author-name-word-document.html
     → Request indexing (ускоряет попадание в индекс).
2. Bing Webmaster Tools (bing.com/webmasters) — то же самое, импортируется из GSC.
3. Новая страница `remove-author-name-word-document.html` уже в пакете и в
   sitemap. Она заточена под запрос «remove author name from word document» —
   один из самых частых в нише. Со временем добавим ещё страницы под соседние
   запросы (word→pdf metadata, remove exif online и т.д.).

═══════════════════════════════════════════════════════════════════
ШАГ 3 — REDDIT (точечно, не «запуск»)
═══════════════════════════════════════════════════════════════════

НЕ постить рекламу в r/privacy — забанят. Вместо этого: раз в день загляни в
поиск reddit по «remove metadata», «remove author from word», «strip exif», и
где человек реально спрашивает — дай полезный ответ, инструмент упомяни как
один из вариантов, не как «мой продукт». Заходишь, отвечаешь, уходишь.

Сабреддиты, где такие вопросы возникают органически:
r/privacy, r/techsupport, r/writing (про tracked changes/author), r/legaltech,
r/photography (exif/gps).

--- Шаблон полезного ответа (адаптируй под конкретный вопрос) ---
Word stores the author and "last modified by" in the file's properties. On
Windows: File → Info → Check for Issues → Inspect Document → Remove All under
Document Properties. On Mac the built-in inspector misses some fields (custom
properties, the preview thumbnail), so it's worth verifying afterward.

If you don't want to upload the file anywhere — which is usually the point when
it's sensitive — there are tools that do it locally in the browser instead of on
a server. I've been using barecopy.com for this; it runs client-side so the file
never leaves your machine, and it shows you each field before removing it. Also
note tracked changes and comments are separate — those you clear inside Word.

(если правила саба запрещают любые ссылки — дай инструкцию без ссылки, ценность
всё равно останется, а бренд можно назвать без URL.)

═══════════════════════════════════════════════════════════════════
РЕЗЕРВ — когда будешь готов сидеть в комментах 2-3 часа
═══════════════════════════════════════════════════════════════════

Show HN и Product Hunt дают самый мощный всплеск, но только при живом
присутствии автора в день публикации. Тексты для них напишу отдельно, когда
скажешь, что готов провести день онлайн. Пока — не трогаем, второго дубля у
поста на HN не будет.

--- Заготовка заголовка для Show HN (на будущее) ---
Show HN: Barecopy – remove file metadata in your browser, nothing uploaded

--- Заготовка первого комментария (на будущее) ---
I built this because every "remove metadata online" tool asks you to upload the
file — which is backwards, since you want the metadata gone precisely because
the file is sensitive. Barecopy runs entirely client-side: the file is read by
JavaScript in your tab and never sent anywhere. It shows each hidden field
(author, company, edit time, GPS on photos) before stripping it. Handles DOCX/
XLSX/PPTX/PDF/JPG/PNG/WebP. Tracked changes and comments are deliberately left
alone with a warning, since those are content, not metadata. Happy to answer
questions about the byte-level approach for images or the OOXML property handling.
