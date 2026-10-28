import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Sale, HistoryDay, CustomerOwingGroup } from './types';
import {
  loadSales,
  loadHistory,
  persistSales,
  persistHistory,
  todayKey,
  formatNaira,
  formatTime,
  formatDate,
} from './utils/storage';
import { SaleModal } from './components/SaleModal';
import { HistoryModal } from './components/HistoryModal';

export const App: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>(loadSales);
  const [history, setHistory] = useState<HistoryDay[]>(loadHistory);
  const [activeTab, setActiveTab] = useState<'sales' | 'owing'>('sales');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Modals state
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [saleModalType, setSaleModalType] = useState<'cash' | 'debt'>('cash');
  const [saleModalFromVoice, setSaleModalFromVoice] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Audio playback state
  const [playingSaleId, setPlayingSaleId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  };

  // Online / offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Today's sales
  const todaySales = useMemo(() => {
    const currentToday = todayKey();
    return sales
      .filter((sale) => sale.dateKey === currentToday && !sale.archived)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales]);

  // Owing sales
  const owingSales = useMemo(() => {
    return sales.filter((sale) => sale.type === 'debt' && !sale.paid);
  }, [sales]);

  // Calculations
  const todayTotal = useMemo(() => {
    return todaySales.reduce((total, sale) => total + Number(sale.amount), 0);
  }, [todaySales]);

  const cashTotal = useMemo(() => {
    return todaySales
      .filter((sale) => sale.type === 'cash')
      .reduce((total, sale) => total + Number(sale.amount), 0);
  }, [todaySales]);

  const debtTotal = useMemo(() => {
    return todaySales
      .filter((sale) => sale.type === 'debt')
      .reduce((total, sale) => total + Number(sale.amount), 0);
  }, [todaySales]);

  // Grouped owing
  const owingGroups = useMemo<CustomerOwingGroup[]>(() => {
    const groups = new Map<string, { name: string; sales: Sale[] }>();
    owingSales.forEach((sale) => {
      const name = sale.customer || 'Unknown customer';
      const key = name.trim().toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { name, sales: [] });
      }
      groups.get(key)!.sales.push(sale);
    });

    return Array.from(groups.values())
      .map((g) => ({
        name: g.name,
        sales: g.sales.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        total: g.sales.reduce((sum, s) => sum + Number(s.amount), 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [owingSales]);

  // Handlers
  const handleOpenSaleModal = (type: 'cash' | 'debt', fromVoice = false) => {
    setSaleModalType(type);
    setSaleModalFromVoice(fromVoice);
    setIsSaleModalOpen(true);
  };

  const handleSaveSale = (newSale: Sale) => {
    const nextSales = [...sales, newSale];
    const { sales: savedSales, toast } = persistSales(nextSales);
    setSales(savedSales);
    if (toast) {
      showToast(toast);
    } else {
      showToast('Saved! Sale added.');
    }
  };

  const handleMarkAllPaid = (groupSales: Sale[]) => {
    if (!window.confirm('Mark this customer’s debts as paid?')) return;
    const paidIds = new Set(groupSales.map((s) => s.id));
    const nextSales = sales.map((sale) =>
      paidIds.has(sale.id) ? { ...sale, paid: true } : sale
    );
    const { sales: savedSales } = persistSales(nextSales);
    setSales(savedSales);
    showToast('Marked as paid.');
  };

  const handleCloseShop = () => {
    if (!todaySales.length) {
      showToast('There are no sales to clear today.');
      return;
    }
    if (
      !window.confirm(
        'Close shop and save today’s list to History? Unpaid debts will stay in Owing Me.'
      )
    ) {
      return;
    }

    const now = new Date();
    const newHistoryItem: HistoryDay = {
      date: now.toLocaleDateString('en-NG'),
      time: now.toLocaleTimeString(),
      total: todayTotal,
      sales: todaySales.map((sale) => ({ ...sale })),
    };

    const nextHistory = [...history, newHistoryItem];
    persistHistory(nextHistory);
    setHistory(nextHistory);

    const today = todayKey();
    const nextSales = sales.map((sale) =>
      sale.dateKey === today ? { ...sale, archived: true } : sale
    );
    const { sales: savedSales } = persistSales(nextSales);
    setSales(savedSales);

    showToast('Saved to History. Today is clear; unpaid debts are safe.');
  };

  // Audio Playback
  const handlePlayVoice = (sale: Sale) => {
    if (!sale.voiceDataUrl) return;

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    if (playingSaleId === sale.id) {
      setPlayingSaleId(null);
      return;
    }

    const audio = new Audio(sale.voiceDataUrl);
    currentAudioRef.current = audio;
    setPlayingSaleId(sale.id);

    audio.onended = () => {
      setPlayingSaleId(null);
      currentAudioRef.current = null;
    };

    audio.onerror = () => {
      setPlayingSaleId(null);
      currentAudioRef.current = null;
      showToast('This recording is no longer available.');
    };

    audio.play().catch(() => {
      setPlayingSaleId(null);
      currentAudioRef.current = null;
      showToast('Tap again to play the recording.');
    });
  };

  return (
    <main className="app-shell">
      {/* Top Bar */}
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-label="Market Keeper MK logo">
            <svg viewBox="0 0 32 32" role="img" aria-hidden="true">
              <circle cx="16" cy="16" r="16" fill="#0F2D2A" />
              <path
                d="M7 23V9l5 7 5-7v14M17 9v14m0-7 8-7m-8 7 8 7"
                fill="none"
                stroke="#fff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.15"
              />
            </svg>
          </div>
          <div>
            <h1>Market Keeper</h1>
          </div>
        </div>

        <div id="networkStatus" className="offline-badge" aria-live="polite">
          <span
            className="status-dot"
            style={{
              background: isOnline ? '#16A34A' : '#D4A017',
              boxShadow: isOnline
                ? '0 0 0 4px rgba(22, 163, 74, .13)'
                : '0 0 0 4px rgba(212, 160, 23, .16)',
            }}
          ></span>
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </header>

      {/* Day Card */}
      <section className="day-card" aria-labelledby="todayTotalLabel">
        <div>
          <p id="todayTotalLabel" className="eyebrow">
            TODAY'S TAKE
          </p>
          <p id="todayTotal" className="day-total">
            {formatNaira(todayTotal)}
          </p>
          <p id="todayDate" className="date-line">
            {formatDate()}
          </p>
        </div>
        <div className="day-card-note">
          <span className="note-line"></span>
          Every sale
          <br />
          stays on this phone.
        </div>
      </section>

      {/* Quick Actions */}
      <section className="quick-actions" aria-label="Add a sale">
        <button
          id="cashSaleButton"
          className="action-button cash-button"
          type="button"
          onClick={() => handleOpenSaleModal('cash')}
        >
          <span className="action-icon">+</span>
          <span className="action-text">CASH SALE</span>
          <span className="action-subtext">Paid now</span>
        </button>
        <button
          id="debtSaleButton"
          className="action-button debt-button"
          type="button"
          onClick={() => handleOpenSaleModal('debt')}
        >
          <span className="action-icon">+</span>
          <span className="action-text">DEBT SALE</span>
          <span className="action-subtext">Collect later</span>
        </button>
      </section>

      {/* Ledger Section */}
      <section className="ledger-section" aria-label="Ledger">
        <nav className="tab-bar" aria-label="Ledger views">
          <button
            id="salesTab"
            className={`tab-button ${activeTab === 'sales' ? 'is-active' : ''}`}
            type="button"
            aria-selected={activeTab === 'sales'}
            onClick={() => setActiveTab('sales')}
          >
            <span>Today's Sales</span>
            <span id="salesCount" className="tab-count">
              {todaySales.length}
            </span>
          </button>
          <button
            id="owingTab"
            className={`tab-button ${activeTab === 'owing' ? 'is-active' : ''}`}
            type="button"
            aria-selected={activeTab === 'owing'}
            onClick={() => setActiveTab('owing')}
          >
            <span>Owing Me</span>
            <span id="owingCount" className="tab-count">
              {owingSales.length}
            </span>
          </button>
        </nav>

        <div id="ledgerContent" className="ledger-content">
          {activeTab === 'sales' ? (
            todaySales.length === 0 ? (
              <div className="empty-state">
                <div className="empty-mark" aria-hidden="true">
                  ₦
                </div>
                <div>
                  <h3>No sales yet today</h3>
                  <p>Tap Cash Sale, Debt Sale, or speak a sale to start your day.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="sale-list">
                  {todaySales.map((sale) => (
                    <article
                      key={sale.id}
                      className={`sale-card ${sale.type === 'debt' ? 'is-debt' : 'is-cash'}`}
                    >
                      <span className="sale-marker" aria-hidden="true"></span>
                      <div className="sale-copy">
                        <div className="sale-topline">
                          <span className="sale-item">{sale.item}</span>
                          <span className="sale-time">{formatTime(sale.createdAt)}</span>
                        </div>
                        <div className="sale-meta">
                          <span className="sale-tag">
                            {sale.type === 'debt'
                              ? `Owes ${sale.customer || 'Customer'}`
                              : 'Paid now'}
                          </span>
                          {sale.voiceDataUrl && (
                            <button
                              className={`play-button ${
                                playingSaleId === sale.id ? 'is-playing' : ''
                              }`}
                              type="button"
                              aria-label="Play original voice recording"
                              onClick={() => handlePlayVoice(sale)}
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </div>
                      <strong className="sale-amount">{formatNaira(sale.amount)}</strong>
                    </article>
                  ))}
                </div>

                <div className="list-footer">
                  <div className="stat-box">
                    <span className="stat-label">Total cash sales</span>
                    <strong className="stat-value">{formatNaira(cashTotal)}</strong>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Total debt sales</span>
                    <strong className="stat-value">{formatNaira(debtTotal)}</strong>
                  </div>
                </div>
              </>
            )
          ) : owingSales.length === 0 ? (
            <div className="empty-state">
              <div className="empty-mark" aria-hidden="true">
                ₦
              </div>
              <div>
                <h3>Nobody owing today</h3>
                <p>Unpaid debt sales will gather here by customer.</p>
              </div>
            </div>
          ) : (
            <div className="owing-list">
              {owingGroups.map((group) => (
                <article key={group.name} className="customer-card">
                  <div className="customer-header">
                    <div>
                      <h3 className="customer-name">{group.name}</h3>
                      <p className="customer-summary">
                        {group.sales.length} {group.sales.length === 1 ? 'item' : 'items'} owing
                      </p>
                    </div>
                    <strong className="customer-total">{formatNaira(group.total)}</strong>
                  </div>

                  <div className="owed-items">
                    {group.sales.map((sale) => (
                      <div key={sale.id} className="owed-item">
                        <span>
                          {sale.item} <small>· {formatTime(sale.createdAt)}</small>
                        </span>
                        <div className="owed-item-actions">
                          <strong>{formatNaira(sale.amount)}</strong>
                          {sale.voiceDataUrl && (
                            <button
                              className={`play-button ${
                                playingSaleId === sale.id ? 'is-playing' : ''
                              }`}
                              type="button"
                              aria-label="Play original voice recording"
                              onClick={() => handlePlayVoice(sale)}
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="mark-paid-button"
                    type="button"
                    onClick={() => handleMarkAllPaid(group.sales)}
                  >
                    Mark all paid
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom Actions */}
      <footer className="bottom-actions">
        <button
          id="micButton"
          className="voice-button"
          type="button"
          onClick={() => handleOpenSaleModal('cash', true)}
        >
          <span className="mic-icon" aria-hidden="true">
            <span></span>
          </span>
          <span>
            <strong>Speak a sale</strong>
            <small>Tap and say what sold</small>
          </span>
        </button>

        <div className="close-day-stack">
          <button
            id="closeDayButton"
            className="close-day-button"
            type="button"
            onClick={handleCloseShop}
          >
            Close Shop — Clear Today
          </button>
          <button
            id="historyButton"
            className="history-link"
            type="button"
            onClick={() => setIsHistoryOpen(true)}
          >
            See History ({history.length} {history.length === 1 ? 'day' : 'days'})
          </button>
        </div>
      </footer>

      {/* Toast Notification */}
      {toastMessage && (
        <div id="toast" className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      {/* Sale Modal */}
      <SaleModal
        isOpen={isSaleModalOpen}
        initialType={saleModalType}
        fromVoice={saleModalFromVoice}
        onClose={() => setIsSaleModalOpen(false)}
        onSave={handleSaveSale}
        onShowToast={showToast}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        history={history}
        onClose={() => setIsHistoryOpen(false)}
      />
    </main>
  );
};

export default App;
