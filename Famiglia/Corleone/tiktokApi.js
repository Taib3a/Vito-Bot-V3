import axios from "axios";

const API_URL = "https://www.tikwm.com/api/";
const TIMEOUT_MS = 45_000;
const ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchTikTok(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const { data } = await axios.get(API_URL, {
        params: { url },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.tikwm.com/",
          Origin: "https://www.tikwm.com",
        },
        timeout: TIMEOUT_MS,
      });

      if (data?.code === 0 && data?.data?.play) {
        const d = data.data;
        return {
          videoUrl: d.play,
          title: d.title,
          authorNick: d.author?.nickname || "غير معروف",
          likes: d.digg_count,
          shares: d.share_count,
          downloads: d.download_count,
          comments: d.comment_count,
        };
      }

      lastError = new Error(data?.msg || "لا توجد بيانات فيديو");
      break;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(1500 * attempt);
    }
  }

  throw new Error(`خطأ واجهة tikwm: ${lastError?.message || "فشل الاتصال"}`);
}
