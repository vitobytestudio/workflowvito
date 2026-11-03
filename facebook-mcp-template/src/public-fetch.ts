/**
 * جلب منشورات فيسبوك العامة - قراءة فقط بدون لمس
 * للصفحات العامة فقط (Public Pages) - لا يحتاج Business ولا توكن
 */
export async function fetchPublicPage(page: string) {
  const clean = page.replace(/https?:\/\/(www\.)?facebook\.com\//, "").replace(/\/$/, "").trim().split("/")[0].split("?")[0];
  if (!clean) throw new Error("اسم الصفحة فارغ");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
  };
  
  // نحاول جلب معلومات الصفحة العامة
  try {
    const url = `https://www.facebook.com/${encodeURIComponent(clean)}/`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`فيسبوك رد ${res.status} - الصفحة قد تكون خاصة`);
    const html = await res.text();
    
    // استخراج معلومات أساسية من HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const postsMatch = html.match(/"post_id":"(\d+)"/g);
    
    return {
      mode: "public_readonly",
      page: clean,
      page_url: url,
      title: titleMatch ? titleMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
      posts_found: postsMatch ? postsMatch.length : 0,
      _note: "معلومات عامة فقط - قراءة بدون تسجيل دخول، بدون لمس",
      _warning: "فيسبوك يحجب بعض الصفحات للحماية - إذا فشل، جرب صفحة عامة مشهورة (مثال: facebook)",
    };
  } catch (e: any) {
    throw new Error(`لم أستطع جلب صفحة @${clean}: ${e.message}`);
  }
}

export async function fetchPublicPosts(page: string, limit: number = 5) {
  const info = await fetchPublicPage(page);
  return {
    ...info,
    posts: `للجلب الكامل للمنشورات مع النصوص والصور، نحتاج Graph API مع App Token (قراءة فقط). الوضع الحالي يجلب العنوان والوصف والعدد بدون توكن.`,
    how_to_get_full_posts: "أنشئ App في developers.facebook.com وستحصل على Page Access Token (قراءة فقط) - بدون صلاحية نشر",
    limit,
  };
}
