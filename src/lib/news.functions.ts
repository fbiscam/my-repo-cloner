import { createServerFn } from "@tanstack/react-start";

export type NewsEvent = {
  title: string;
  country: string;
  date: string; // ISO
  impact: "High" | "Medium" | "Low";
  forecast?: string;
  previous?: string;
  minutesUntil: number;
};

type FFEvent = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
};

// Forex Factory weekly calendar — free, no key
const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

export const getGoldNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewsEvent[]> => {
    try {
      const res = await fetch(FF_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return [];
      const raw = (await res.json()) as FFEvent[];
      const now = Date.now();
      const horizon = now + 1000 * 60 * 60 * 36; // next 36h
      return raw
        .filter(
          (e) =>
            (e.country === "USD" || e.country === "XAU") &&
            /High|Medium/i.test(e.impact),
        )
        .map((e) => {
          const t = new Date(e.date).getTime();
          return {
            title: e.title,
            country: e.country,
            date: e.date,
            impact: (e.impact as NewsEvent["impact"]) || "Medium",
            forecast: e.forecast,
            previous: e.previous,
            minutesUntil: Math.round((t - now) / 60000),
          };
        })
        .filter((e) => {
          const t = new Date(e.date).getTime();
          return t >= now - 1000 * 60 * 30 && t <= horizon;
        })
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))
        .slice(0, 8);
    } catch {
      return [];
    }
  },
);
