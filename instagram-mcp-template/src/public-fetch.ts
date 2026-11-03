/**
 * جلب معلومات إنستغرام العمومية بدون توكن - للمعلومات غير الحساسة فقط
 * يستخدم Fetch للمحتوى العام (public) - لا يحتاج Business ولا تسجيل دخول
 */
export async function fetchPublicProfile(username: string) {
  const clean = username.replace("@", "").trim();
  if (!clean) throw new Error("اسم المستخدم فارغ");

  // نحاول عبر Instagram public JSON endpoint (قد يتغير، نتعامل مع الأخطاء)
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "X-IG-App-ID": "936619743392459", // Instagram web app id (public)
  };

  try {
    // الطريقة 1: web_profile_info
    const url1 = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`;
    const r1 = await fetch(url1, { headers });
    if (r1.ok) {
      const j: any = await r1.json();
      const u = j?.data?.user;
      if (u) {
        return {
          mode: "public_live",
          source: "instagram_web",
          username: u.username,
          full_name: u.full_name,
          biography: u.biography,
          followers: u.edge_followed_by?.count ?? u.follower_count,
          following: u.edge_follow?.count,
          is_private: u.is_private,
          is_business: u.is_professional_account,
          category: u.category_name,
          profile_pic: u.profile_pic_url_hd || u.profile_pic_url,
          posts_count: u.edge_owner_to_timeline_media?.count,
          external_url: u.external_url,
          _note: "معلومات عامة فقط - بدون تسجيل دخول",
        };
      }
    }
  } catch {}

  // fallback: نحاول HTML scrape بسيط
  try {
    const url2 = `https://www.instagram.com/${encodeURIComponent(clean)}/`;
    const r2 = await fetch(url2, { headers: { "User-Agent": headers["User-Agent"] } });
    if (r2.ok) {
      const html = await r2.text();
      const match = html.match(/"username":"([^"]+)".*?"full_name":"([^"]*)"/s);
      if (match) {
        return {
          mode: "public_fallback",
          username: match[1],
          full_name: match[2],
          _note: "جلب مبسط من الصفحة العامة - المعلومات محدودة",
          profile_url: url2,
        };
      }
    }
  } catch {}

  throw new Error(`لم أستطع جلب @${clean} - الحساب خاص أو الاسم خطأ أو إنستغرام حجب الطلب. جرب حساب عام.`);
}

export async function fetchPublicHashtagCount(hashtag: string) {
  const tag = hashtag.replace("#", "").trim();
  return {
    hashtag: tag,
    search_url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
    note: "عد المنشورات يحتاج توكن، لكن الرابط العام يعرض المنشورات مباشرة",
  };
}
