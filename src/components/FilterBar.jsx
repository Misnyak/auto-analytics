import React from 'react';

export default function FilterBar({
  brandFilter,
  setBrandFilter,
  brands,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  classFilter,
  setClassFilter,
  carClasses,
  priceRange,
  setPriceRange,
  maxPrice,
  showDealsOnly,
  setShowDealsOnly,
  sourceFilter,
  setSourceFilter,
  filteredCount,
  totalCount,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-inner">
        <div className="filter-bar-header">
          <h2 className="filter-bar-title">Фильтры</h2>
          <span className="filter-bar-count">{filteredCount} из {totalCount}</span>
        </div>

        <div className="filter-bar-controls">
          <div className="filter-group">
            <label className="filter-label">Марка</label>
            <select
              className="filter-select"
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="all">Все марки</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Класс</label>
            <select
              className="filter-select"
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
            >
              <option value="all">Все классы</option>
              {carClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Год от</label>
            <select
              className="filter-select"
              value={yearFrom}
              onChange={e => setYearFrom(e.target.value)}
            >
              <option value="all">Любой</option>
              {[...new Set(Array.from({ length: 2026 - 2014 + 1 }, (_, i) => 2014 + i))].reverse().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Год до</label>
            <select
              className="filter-select"
              value={yearTo}
              onChange={e => setYearTo(e.target.value)}
            >
              <option value="all">Любой</option>
              {[...new Set(Array.from({ length: 2026 - 2014 + 1 }, (_, i) => 2014 + i))].reverse().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">
              Цена до: {priceRange ? `${(priceRange / 1000000).toFixed(1)}M ₽` : 'Любая'}
            </label>
            <input
              type="range"
              className="filter-range"
              min={0}
              max={maxPrice}
              step={100000}
              value={priceRange || maxPrice}
              onChange={e => setPriceRange(e.target.value === maxPrice ? null : parseInt(e.target.value))}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Источник</label>
            <select
              className="filter-select"
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
            >
              <option value="all">Все</option>
              <option value="major">Major Auto</option>
              <option value="rolf">Рольф</option>
            </select>
          </div>

          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showDealsOnly}
              onChange={e => setShowDealsOnly(e.target.checked)}
            />
            <span className="checkbox-custom" />
            <span>Только выгодные</span>
          </label>
        </div>
      </div>
    </div>
  );
}
