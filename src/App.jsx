import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, Cell, Legend, Customized,
} from 'recharts';
import { calculateScore, formatPrice, formatMileage } from './utils/scoreCalculator';
import { calcAnnualMileage, formatAnnual } from './utils/usage';
import { getSegment, getDefaultThresholds } from './utils/segmentation';
import { linearRegression } from './utils/trendLine';
import { thinSeries } from './utils/thinPoints.js';
import {
  applyBaseFilters,
  applySegmentFilters,
  computeBodyTypes,
  computePriceByBrand,
  computeScatterData,
  computeScatterSeries,
  computeLowUsage,
  computeYearVsPrice,
  computeTopModels,
  getBestDeals,
  computeAvgMileage,
} from './utils/filterPipeline';
import SegmentFilter from './components/SegmentFilter';
import PriceHistoryChart from './components/PriceHistoryChart';
import SourceComparison from './components/SourceComparison.jsx';

const COLORS = ['#48b803', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B'];

const SOURCE_LABELS = { 'major-expert': 'major-expert.ru', rolf: 'rolf.ru' };

function TrendLines({ scatterSeries, hiddenBrands, xAxisMap, yAxisMap }) {
  const xScale = xAxisMap && Object.values(xAxisMap)[0]?.scale
  const yScale = yAxisMap && Object.values(yAxisMap)[0]?.scale
  if (!xScale || !yScale) return null

  return (
    <g>
      {scatterSeries.map(s => {
        if (hiddenBrands.has(s.brand) || s.data.length < 2) return null
        const points = s.data.map(p => ({ x: p.mileage, y: p.price }))
        const { slope, intercept } = linearRegression(points)
        const xMin = Math.min(...s.data.map(p => p.mileage))
        const xMax = Math.max(...s.data.map(p => p.mileage))
        const y1 = slope * xMin + intercept
        const y2 = slope * xMax + intercept
        return (
          <line
            key={`trend-${s.brand}`}
            x1={xScale(xMin)}
            y1={yScale(y1)}
            x2={xScale(xMax)}
            y2={yScale(y2)}
            stroke={s.fill}
            strokeWidth={2}
            strokeDasharray="5 5"
            opacity={0.7}
          />
        )
      })}
    </g>
  )
}

function listingUrlFromCarUrl(carUrl) {
  if (!carUrl) return null;
  return carUrl.replace(/\/[^/]+\/$/, '/');
}

function DealCard({ car }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = car.image && !imgFailed;

  return (
    <div className={`deal-card ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
      <div className="deal-score">
        <span className={`score-badge ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
          {car.score > 0 ? '+' : ''}{car.score}
        </span>
        <span className="score-label">{car.scoreLabel}</span>
      </div>
      <div className="deal-image-wrapper">
        {showImage ? (
          <img
            src={car.image}
            alt={`${car.brand} ${car.model}`}
            className="deal-image"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="deal-image-placeholder">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#bbb" strokeWidth="1.5" aria-hidden="true">
              <path d="M5 17h14M5 17l2-5h10l2 5M7 12V7a1 1 0 011-1h8a1 1 0 011 1v5" />
              <circle cx="7.5" cy="14.5" r="1.5" />
              <circle cx="16.5" cy="14.5" r="1.5" />
            </svg>
            <span>{car.brand} {car.model}</span>
          </div>
        )}
      </div>
      <div className="deal-info">
        <h3>{car.brand} {car.model}</h3>
        <p>{car.year} год • {formatMileage(car.mileage)}</p>
        <p>{car.engineVolume} {car.fuelType} / {car.horsepower} л.с.</p>
        <p className="deal-price">{formatPrice(car.price)}</p>
        {car.avgPrice && <p className="deal-avg">Средняя: {formatPrice(car.avgPrice)}</p>}
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть на сайте →
        </a>
      )}
    </div>
  );
}

function UsageCard({ car }) {
  return (
    <div className="deal-card usage-card">
      <div className="deal-info">
        <span className="annual-badge">{formatAnnual(car.annual)}</span>
        <h3>{car.brand} {car.model}</h3>
        <p>{car.year} год • всего {formatMileage(car.mileage)}</p>
        <p>{car.engineVolume} {car.fuelType} / {car.horsepower} л.с.</p>
        <p className="deal-price">{formatPrice(car.price)}</p>
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть на сайте →
        </a>
      )}
    </div>
  );
}

function App() {
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('all');
  const [yearTo, setYearTo] = useState('all');
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [bodyTypeFilter, setBodyTypeFilter] = useState('all');
  const [maxAnnual, setMaxAnnual] = useState(10000);
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [thresholds, setThresholds] = useState(getDefaultThresholds());
  const [historyData, setHistoryData] = useState(new Map());
  const [historyDates, setHistoryDates] = useState([]);
  const [rawCars, setRawCars] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [metaSources, setMetaSources] = useState([]);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Ответ с кодом 4xx/5xx тоже успешно парсится как JSON, поэтому res.ok
    // проверяем отдельно: иначе тело {error:'...'} уедет в rawCars вместо массива.
    async function readJson(res, label) {
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      return res.json();
    }

    async function loadData() {
      try {
        const [offersRes, historyRes, metaRes] = await Promise.all([
          fetch('/api/offers'),
          fetch('/api/history' + (sourceFilter !== 'all' ? `?source=${encodeURIComponent(sourceFilter)}` : '')),
          fetch('/api/meta'),
        ]);
        const nextOffers = await readJson(offersRes, '/api/offers');
        const history = await readJson(historyRes, '/api/history');
        const meta = await readJson(metaRes, '/api/meta');
        if (!Array.isArray(nextOffers)) throw new Error('/api/offers вернул не массив');
        if (cancelled) return;

        setApiError(null);
        setRawCars(nextOffers);
        setMetaSources(meta?.sources || []);

        const dates = history?.dates || [];
        const byDate = history?.byDate || {};
        const data = new Map(dates.map(d => [d, byDate[d] || []]));
        setHistoryDates(dates);
        setHistoryData(data);
      } catch (e) {
        if (cancelled) return;
        console.warn('API недоступен:', e);
        setApiError(e.message || String(e));
        setRawCars([]);
        setMetaSources([]);
        setHistoryDates([]);
        setHistoryData(new Map());
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [sourceFilter]);

  const cars = useMemo(() => calculateScore(rawCars || []), [rawCars]);

  const brands = useMemo(() => {
    const b = [...new Set(cars.map(c => c.brand))].sort();
    return b;
  }, [cars]);

  const years = useMemo(() => {
    const y = [...new Set(cars.map(c => c.year).filter(Boolean))].sort((a, b) => b - a);
    return y;
  }, [cars]);

  const baseFiltered = useMemo(() => applyBaseFilters(cars, {
    source: sourceFilter,
    brand: brandFilter,
    yearFrom,
    yearTo,
    showDealsOnly,
  }), [cars, sourceFilter, brandFilter, yearFrom, yearTo, showDealsOnly]);

  const segmentedCars = useMemo(() => applySegmentFilters(baseFiltered, {
    segment: selectedSegment,
    thresholds,
    bodyType: bodyTypeFilter,
  }), [baseFiltered, selectedSegment, thresholds, bodyTypeFilter]);

  const bodyTypes = useMemo(() => computeBodyTypes(baseFiltered), [baseFiltered]);

  useEffect(() => {
    if (bodyTypeFilter !== 'all' && !bodyTypes.includes(bodyTypeFilter)) {
      setBodyTypeFilter('all');
    }
  }, [bodyTypes, bodyTypeFilter]);

  useEffect(() => {
    if (sourceFilter !== 'all' && !metaSources.includes(sourceFilter)) {
      setSourceFilter('all');
    }
  }, [metaSources, sourceFilter]);

  const priceByBrand = useMemo(() => computePriceByBrand(segmentedCars), [segmentedCars]);

  const scatterData = useMemo(() => computeScatterData(segmentedCars), [segmentedCars]);

  const scatterSeries = useMemo(() => computeScatterSeries(scatterData, COLORS), [scatterData]);

  const scatterSeriesLimited = useMemo(() => thinSeries(scatterSeries, 2000), [scatterSeries]);

  const toggleBrand = (entry) => {
    setHiddenBrands(prev => {
      const next = new Set(prev);
      if (next.has(entry.value)) next.delete(entry.value);
      else next.add(entry.value);
      return next;
    });
  };

  const lowUsageAll = useMemo(() => {
    return segmentedCars
      .map(c => ({ ...c, annual: calcAnnualMileage(c) }))
      .filter(c => c.annual !== null);
  }, [segmentedCars]);

  const lowUsageCars = useMemo(() => computeLowUsage(segmentedCars, maxAnnual), [segmentedCars, maxAnnual]);

  const yearVsPrice = useMemo(() => computeYearVsPrice(segmentedCars), [segmentedCars]);

  const topModels = useMemo(() => computeTopModels(segmentedCars), [segmentedCars]);

  const bestDeals = useMemo(() => getBestDeals(segmentedCars), [segmentedCars]);

  const avgMileage = useMemo(() => computeAvgMileage(segmentedCars), [segmentedCars]);

  const brandColors = useMemo(() => {
    const map = {};
    brands.forEach((b, i) => { map[b] = COLORS[i % COLORS.length]; });
    return map;
  }, [brands]);

  return (
    <div className="app">
      <header className="header">
        <h1>Major Expert Auto Analytics</h1>
        <p className="subtitle">
          {rawCars === null ? 'Загрузка данных…' : `${segmentedCars.length} объявлений`}
        </p>
      </header>

      {apiError && (
        <p className="api-error" role="alert">
          Не удалось загрузить данные с сервера ({apiError}). Показан пустой дашборд — обновите страницу позже.
        </p>
      )}

      <div className="filters">
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="Источник">
          <option value="all">Все источники</option>
          {metaSources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
        </select>

        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
          <option value="all">Все марки</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={yearFrom} onChange={e => setYearFrom(e.target.value)}>
          <option value="all">Год от</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={yearTo} onChange={e => setYearTo(e.target.value)}>
          <option value="all">Год до</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <SegmentFilter
          selectedSegment={selectedSegment}
          onSegmentChange={setSelectedSegment}
          economyMax={thresholds.economyMax}
          luxuryMin={thresholds.luxuryMin}
          onThresholdsChange={setThresholds}
          bodyType={bodyTypeFilter}
          onBodyTypeChange={setBodyTypeFilter}
          bodyTypes={bodyTypes}
        />

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDealsOnly}
            onChange={e => setShowDealsOnly(e.target.checked)}
          />
          Только выгодные предложения
        </label>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{segmentedCars.length}</div>
          <div className="stat-label">Объявлений</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {segmentedCars.length > 0 ? formatPrice(Math.round(segmentedCars.reduce((a, c) => a + c.price, 0) / segmentedCars.length)) : '—'}
          </div>
          <div className="stat-label">Средняя цена</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {avgMileage != null ? avgMileage.toLocaleString('ru-RU') + ' км' : '—'}
          </div>
          <div className="stat-label">Средний пробег</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{segmentedCars.filter(c => c.score > 10).length}</div>
          <div className="stat-label">Выгодных сделок</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card full-width">
          <h2>Средняя цена по маркам (Топ-10)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={priceByBrand}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="brand" angle={-35} textAnchor="end" height={80} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatPrice(v)} />
              <Bar dataKey="avgPrice">
                {priceByBrand.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Пробег vs Цена</h2>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mileage" name="Пробег" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} type="number" />
              <YAxis
                dataKey="price"
                name="Цена"
                scale="log"
                domain={['auto', 'auto']}
                tickFormatter={v => `${(v / 1000000).toFixed(1)}M`}
                type="number"
              />
              <Tooltip
                formatter={(value, name) => name === 'Цена' ? formatPrice(value) : formatMileage(value)}
                labelFormatter={(_, payload) => {
                  const p = payload[0]?.payload;
                  if (!p) return '';
                  return p.annual ? `${p.name} • ${formatAnnual(p.annual)}` : p.name;
                }}
              />
              <Legend onClick={toggleBrand} />
              <Customized
                component={<TrendLines scatterSeries={scatterSeriesLimited} hiddenBrands={hiddenBrands} />}
              />
              {scatterSeriesLimited.map(s => (
                <Scatter
                  key={s.brand}
                  name={s.brand}
                  data={s.data}
                  fill={s.fill}
                  hide={hiddenBrands.has(s.brand)}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="chart-hint">Нажмите на марку в легенде, чтобы скрыть/показать её точки</p>
        </div>

        <div className="chart-card">
          <h2>Год выпуска vs Средняя цена</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={yearVsPrice}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatPrice(v)} />
              <Line type="monotone" dataKey="avgPrice" stroke="#2196F3" strokeWidth={2} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h2>Топ-10 популярных моделей</h2>
          <div className="tiles-grid">
            {topModels.map((m, i) => {
              const Tag = m.listingUrl ? 'a' : 'div';
              const linkProps = m.listingUrl
                ? { href: m.listingUrl, target: '_blank', rel: 'noopener noreferrer' }
                : {};
              return (
                <Tag key={m.name} className="tile-card" {...linkProps}>
                  <div className="tile-accent">
                    <div
                      className="tile-accent-fill"
                      style={{ width: `${(m.count / topModels[0].count) * 100}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <div className="tile-content">
                    <div className="tile-name">{m.name}</div>
                    <div className="tile-count">{m.count} объяв.</div>
                    <div className="tile-price">{formatPrice(m.avgPrice)}</div>
                  </div>
                </Tag>
              );
            })}
          </div>
        </div>
      </div>

      <div className="deals-section">
        <PriceHistoryChart
          historyDates={historyDates}
          historyData={historyData}
          selectedSegment={selectedSegment}
          thresholds={thresholds}
          selectedBrand="all"
        />
      </div>

      <div className="deals-section">
        <div className="section-header">
          <h2>
            Малоездные авто
            <span className="count-badge">{lowUsageAll.filter(c => c.annual <= maxAnnual).length}</span>
          </h2>
          <label className="slider-label">
            Пробег в год до <strong>{formatAnnual(maxAnnual)}</strong>
            <input
              type="range"
              min="5000"
              max="20000"
              step="500"
              value={maxAnnual}
              onChange={e => setMaxAnnual(Number(e.target.value))}
            />
          </label>
        </div>
        {lowUsageCars.length === 0 ? (
          <p className="empty-note">Нет авто с таким годовым пробегом — увеличьте порог</p>
        ) : (
          <div className="deals-grid">
            {lowUsageCars.map(car => (
              <UsageCard key={car.id} car={car} />
            ))}
          </div>
        )}
      </div>

      <div className="deals-section">
        <h2>Лучшие предложения (Score выгодности)</h2>
        <div className="deals-grid">
          {bestDeals.map(car => (
            <DealCard key={car.id} car={car} />
          ))}
        </div>
      </div>

      <SourceComparison cars={segmentedCars} sources={metaSources} />
    </div>
  );
}

export default App;
