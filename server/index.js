import path from 'node:path';
import fs from 'node:fs';
import { createApp } from './app.js';
import { createPool, getOffers, getHistory, getMeta } from '../data/db.js';

const PORT = Number(process.env.PORT || 3001);
const dsn = process.env.DATABASE_URL;
const distDir = path.join(process.cwd(), 'dist');
const staticDir = fs.existsSync(distDir) ? distDir : undefined;

if (dsn) {
  const pool = createPool(dsn);
  const db = {
    getOffers: filters => getOffers(pool, filters),
    getHistory: ({ source, days }) => getHistory(pool, { source, days }),
    getMeta: () => getMeta(pool),
  };
  const app = createApp(db, { staticDir });
  app.listen(PORT, () => {
    console.log(`Auto-analytics API (PostgreSQL) on http://127.0.0.1:${PORT}`);
  });
} else {
  // Fallback: read from data/cars.json written by scraper
  const carsPath = path.join(process.cwd(), 'data', 'cars.json');
  const historyDir = path.join(process.cwd(), 'data', 'history');

  function loadOffers() {
    if (!fs.existsSync(carsPath)) return [];
    try { return JSON.parse(fs.readFileSync(carsPath, 'utf8')); }
    catch { return []; }
  }

  function loadHistory() {
    if (!fs.existsSync(historyDir)) return { dates: [], byDate: {} };
    const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json')).sort();
    const dates = [];
    const byDate = {};
    for (const f of files) {
      const date = f.replace('.json', '');
      try {
        const cars = JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf8'));
        dates.push(date);
        byDate[date] = cars;
      } catch { /* skip corrupt */ }
    }
    return { dates, byDate };
  }

  const db = {
    getOffers(filters = {}) {
      let result = loadOffers();
      if (filters.source) result = result.filter(c => c.source === filters.source);
      if (filters.brand) result = result.filter(c => c.brand === filters.brand);
      if (filters.yearFrom) result = result.filter(c => c.year >= Number(filters.yearFrom));
      if (filters.yearTo) result = result.filter(c => c.year <= Number(filters.yearTo));
      if (filters.limit) result = result.slice(0, Number(filters.limit));
      return result;
    },
    getHistory({ source, days = 90 }) {
      // Файловый формат должен совпадать с PG: flat rows {date, brand, model, price}
      const hist = loadHistory();
      const rows = [];
      const cutoff = Math.max(0, hist.dates.length - days);
      for (let i = cutoff; i < hist.dates.length; i++) {
        const d = hist.dates[i];
        const cars = hist.byDate[d] || [];
        const filtered = source ? cars.filter(c => c.source === source) : cars;
        filtered.forEach(c => {
          rows.push({ date: d, brand: c.brand, model: c.model, price: c.price });
        });
      }
      return rows;
    },
    getMeta() {
      const cars = loadOffers();
      const sources = [...new Set(cars.map(c => c.source).filter(Boolean))].sort();
      const brands = [...new Set(cars.map(c => c.brand))].sort();
      const years = [...new Set(cars.map(c => c.year).filter(Boolean))].sort((a, b) => b - a);
      return { sources, brands, years };
    },
  };

  const app = createApp(db, { staticDir });
  app.listen(PORT, () => {
    console.log(`Auto-analytics API (file fallback — ${loadOffers().length} cars) on http://127.0.0.1:${PORT}`);
  });
}
