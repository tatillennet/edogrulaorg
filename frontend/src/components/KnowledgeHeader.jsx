import { useEffect, useState } from "react";
import axios from "axios";

export default function KnowledgeHeader({ query = "Sapanca", http }) {
  const [data, setData] = useState(null);
  const api = http || axios;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/geo/knowledge`, { params: { q: query } });
        if (alive) setData(data);
      } catch {}
    })();
    return () => { alive = false; };
  }, [query]);

  if (!data) return null;

  const { title, subtitle, summary, wiki_url, gmap_url, weather } = data;
  const now = weather?.current_weather;

  return (
    <section className="kb mx-auto mb-6 rounded-2xl border border-gray-200 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
          {summary && <p className="mt-2 text-gray-700 leading-relaxed">{summary}</p>}
          <div className="mt-3 flex gap-4 text-sm">
            {wiki_url && (
              <a className="text-blue-600 hover:underline" href={wiki_url} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            )}
            {gmap_url && (
              <a className="text-blue-600 hover:underline" href={gmap_url} target="_blank" rel="noreferrer">
                Haritada gör
              </a>
            )}
          </div>
        </div>

        {now && (
          <div className="shrink-0 rounded-xl border border-gray-200 px-4 py-3 text-center">
            <div className="text-xs text-gray-500">Şu an hava</div>
            <div className="text-3xl font-semibold">{Math.round(now.temperature)}°</div>
            <div className="text-xs text-gray-500">rüzgâr {Math.round(now.windspeed)} km/s</div>
          </div>
        )}
      </div>
    </section>
  );
}
