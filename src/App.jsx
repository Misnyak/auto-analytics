import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, Cell,
} from 'recharts';
import { calculateScore, formatPrice, formatMileage, getCarClass, mergeWithRolfSource } from './utils/scoreCalculator';
import { getSupplierConfig } from './utils/brandAssets.jsx';
import CarCard from './components/CarCard';
import FilterBar from './components/FilterBar';
import rawData from '../data/cars.sample.json';

const COLORS = ['#1E293B', '#334155', '#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2'];

function App() {
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('all');
  const [yearTo, setYearTo] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [priceRange, setPriceRange] = useState(null);
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');

  const allCars = useMemo(() => mergeWithRolfSource(rawData), []);

  const brands = useMemo(() => {
    return [...new Set(allCars.map(c => c.brand))].sort();
  }, [allCars]);

  const carClasses = useMemo(() => {
    const classes = new Set();
    allCars.forEach(c => classes.add(getCarClass(c)));
    return [...classes].sort();
  }, [allCars]);

  const maxPrice = useMemo(() => {
    return Math.ceil(Math.max(...allCars.map(c => c.price)) / 100000) * 100000;
  }, [allCars]);

  const filtered = useMemo(() => {
    let result = allCars;
    if (brandFilter !== 'all') result = result.filter(c => c.brand === brandFilter);
    if (yearFrom !== 'all') result = result.filter(c => c.year >= parseInt(yearFrom));
    if (yearTo !== 'all') result = result.filter(c => c.year <= parseInt(yearTo));
    if (classFilter !== 'all') result = result.filter(c => getCarClass(c) === classFilter);
    if (priceRange) result = result.filter(c => c.price <= priceRange);
    if (sourceFilter !== 'all') result = result.filter(c => c.source === sourceFilter);
    if (showDealsOnly) result = result.filter(c => c.score > 10);
    return result;
  }, [allCars, brandFilter, yearFrom, yearTo, classFilter, priceRange, sourceFilter, showDealsOnly]);

  const priceByBrand = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      if (!map[c.brand]) map[c.brand] = { brand: c.brand, prices: [], count: 0 };
      map[c.brand].prices.push(c.price);
      map[c.brand].count++;
    });
    return Object.values(map)
      .map(d => ({
        brand: d.brand,
        avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
        count: d.count,
      }))
      .sort((a, b) => b.avgPrice - a.avgPrice)
      .slice(0, 8);
  }, [filtered]);

  const mileageVsPrice = useMemo(() => {
    return filtered
      .filter(c => c.mileage && c.mileage > 100 && c.mileage < 500000)
      .slice(0, 80)
      .map(c => ({
        mileage: c.mileage,
        price: c.price,
        name: `${c.brand} ${c.model}`,
        brand: c.brand,
      }));
  }, [filtered]);

  const yearVsPrice = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      if (!c.year) return;
      if (!map[c.year]) map[c.year] = { year: c.year, prices: [] };
      map[c.year].prices.push(c.price);
    });
    return Object.values(map)
      .map(d => ({
        year: d.year,
        avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
        count: d.prices.length,
      }))
      .sort((a, b) => a.year - b.year);
  }, [filtered]);

  const sourceStats = useMemo(() => {
    const stats = { major: { count: 0, avgPrice: 0 }, rolf: { count: 0, avgPrice: 0 } };
    filtered.forEach(c => {
      stats[c.source].count++;
      stats[c.source].avgPrice += c.price;
    });
    ['major', 'rolf'].forEach(s => {
      if (stats[s].count > 0) {
        stats[s].avgPrice = Math.round(stats[s].avgPrice / stats[s].count);
      }
    });
    return stats;
  }, [filtered]);

  const comparisonPairs = useMemo(() => {
    const majorCars = filtered.filter(c => c.source === 'major');
    const rolfCars = filtered.filter(c => c.source === 'rolf');

    const pairs = [];
    const matchedModels = new Set();

    majorCars.forEach(majorCar => {
      const modelKey = `${majorCar.brand}-${majorCar.model}`;
      const match = rolfCars.find(r =>
        r.brand === majorCar.brand && r.model === majorCar.model && !matchedModels.has(`${r.id}`)
      );
      if (match) {
        pairs.push({ majorCar, rolfCar: match });
        matchedModels.add(`${match.id}`);
      }
    });

    return pairs.slice(0, 6);
  }, [filtered]);

  const bestDeals = useMemo(() => {
    return [...filtered].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [filtered]);

  const classDistribution = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      const cls = getCarClass(c);
      map[cls] = (map[cls] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="12" width="28" height="10" rx="4" fill="currentColor" opacity="0.2"/>
                <path d="M6 18 L8 12 L24 12 L26 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <circle cx="10" cy="22" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="22" cy="22" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div>
              <h1>Auto Analytics</h1>
              <p className="header-subtitle">Сравнение предложений Major Auto и Рольф</p>
            </div>
          </div>
          <div className="header-stats">
            <div className="header-stat">
              <span className="stat-number">{filtered.length}</span>
              <span className="stat-unit">авто</span>
            </div>
            <div className="header-divider" />
            <div className="header-stat">
              <span className="stat-number">2</span>
              <span className="stat-unit">источника</span>
            </div>
          </div>
        </div>
      </header>

      <FilterBar
        brandFilter={brandFilter}
        setBrandFilter={setBrandFilter}
        brands={brands}
        yearFrom={yearFrom}
        setYearFrom={setYearFrom}
        yearTo={yearTo}
        setYearTo={setYearTo}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        carClasses={carClasses}
        priceRange={priceRange}
        setPriceRange={setPriceRange}
        maxPrice={maxPrice}
        showDealsOnly={showDealsOnly}
        setShowDealsOnly={setShowDealsOnly}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        filteredCount={filtered.length}
        totalCount={allCars.length}
      />

      <div className="source-compare">
        {['major', 'rolf'].map(source => {
          const cfg = getSupplierConfig(source);
          const stat = sourceStats[source];
          return (
            <div key={source} className="source-card" style={{ borderLeftColor: cfg.borderColor }}>
              <div className="source-name" style={{ color: cfg.textColor }}>{cfg.name}</div>
              <div className="source-count">{stat.count} объявлений</div>
              {stat.avgPrice > 0 && (
                <div className="source-price">Средняя: {formatPrice(stat.avgPrice)}</div>
              )}
            </div>
          );
        })}
      </div>

      {comparisonPairs.length > 0 && (
        <section className="comparison-section">
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2"/>
              <path d="M12 3v18M2 12h20"/>
            </svg>
            Сравнение по моделям
          </h2>
          <div className="comparison-grid">
            {comparisonPairs.map((pair, i) => (
              <CarCard key={i} carA={pair.majorCar} carB={pair.rolfCar} />
            ))}
          </div>
        </section>
      )}

      <div className="charts-grid">
        <div className="chart-card">
          <h2 className="chart-title">Средняя цена по маркам</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={priceByBrand}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="brand" angle={-35} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={v => formatPrice(v)}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="avgPrice" radius={[4, 4, 0, 0]}>
                {priceByBrand.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Пробег vs Цена</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mileage" name="Пробег" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <YAxis dataKey="price" name="Цена" tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => name === 'Цена' ? formatPrice(value) : formatMileage(value)}
                labelFormatter={(_, payload) => payload[0]?.payload?.name || ''}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Scatter data={mileageVsPrice} fill="#1E293B" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Динамика цен по годам</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={yearVsPrice}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => formatPrice(v)} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Line type="monotone" dataKey="avgPrice" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 4, fill: '#DC2626' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Распределение по классам</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={classDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 13 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {classDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="deals-section">
        <h2 className="section-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          Лучшие предложения
        </h2>
        <div className="deals-list">
          {bestDeals.map(car => {
            const supplier = getSupplierConfig(car.source);
            return (
              <div key={car.id} className={`deal-card ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
                <div className="deal-supplier-badge" style={{
                  backgroundColor: supplier.bgColor,
                  color: supplier.textColor,
                }}>
                  {supplier.name}
                </div>
                <div className="deal-content">
                  <div className="deal-image-wrap">
                    {car.image ? (
                      <img src={car.image} alt="" className="deal-image" loading="lazy" />
                    ) : (
                      <div className="deal-image-placeholder">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="4" y="14" width="40" height="16" rx="4" stroke="#94A3B8" strokeWidth="2" fill="none"/>
                          <circle cx="14" cy="32" r="5" stroke="#94A3B8" strokeWidth="2" fill="none"/>
                          <circle cx="34" cy="32" r="5" stroke="#94A3B8" strokeWidth="2" fill="none"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="deal-info">
                    <h3>{car.brand} {car.model}</h3>
                    <p className="deal-meta">
                      {car.year} • {formatMileage(car.mileage)} • {getCarClass(car)}
                    </p>
                    <p className="deal-specs">
                      {car.horsepower ? `${car.horsepower} л.с.` : ''}
                      {car.engineVolume ? ` • ${car.engineVolume}L` : ''}
                      {car.driveType ? ` • ${car.driveType}` : ''}
                    </p>
                    <div className="deal-price-row">
                      <span className="deal-price">{formatPrice(car.price)}</span>
                      {car.avgPrice && (
                        <span className="deal-avg">Рынок: {formatPrice(car.avgPrice)}</span>
                      )}
                    </div>
                  </div>
                  <div className="deal-score-col">
                    {car.score > 0 && (
                      <div className={`deal-score-badge ${car.score > 20 ? 'great' : 'good'}`}>
                        +{car.score}
                      </div>
                    )}
                  </div>
                </div>
                {car.url && (
                  <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
                    Смотреть →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="footer">
        <p>Auto Analytics • Данные собраны с major-expert.ru и rolф.ru</p>
      </footer>
    </div>
  );
}

export default App;
