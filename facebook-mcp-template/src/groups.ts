/**
 * جلب منشورات المجموعات العامة - الأكثر نشاطا
 * للصفحات العامة / المجموعات العامة فقط - قراءة بدون لمس
 */
export async function fetchPublicGroup(groupIdOrSlug: string) {
  const clean = groupIdOrSlug.replace(/https?:\/\/(www\.)?facebook\.com\/groups\//, "").split("/")[0].trim();
  if (!clean) throw new Error("معرف المجموعة فارغ");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
  };
  const url = `https://www.facebook.com/groups/${encodeURIComponent(clean)}/`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`فيسبوك رد ${res.status} - المجموعة خاصة أو محمية`);
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    const postsCount = (html.match(/"post_id":"/g) || []).length;
    // محاولة استخراج آخر منشورات ظاهرة
    const postTexts = [...html.matchAll(/"message":\s*\{"text":"([^"]{10,200})"/g)].slice(0, 3).map(m => m[1].slice(0, 120));
    return {
      mode: "public_group_readonly",
      group: clean,
      group_url: url,
      title: titleMatch ? titleMatch[1].trim() : null,
      posts_detected: postsCount,
      sample_texts: postTexts.length ? postTexts : ["المنشورات تظهر بعد التحميل الكامل - في الإنتاج نجلبها عبر Graph API"],
      _note: "المجموعات العامة فقط بدون تسجيل - المجموعات الخاصة تحتاج موافقة الأدمن",
      _active: true,
    };
  } catch (e: any) {
    throw new Error(`لم أستطع جلب مجموعة ${clean}: ${e.message}`);
  }
}
