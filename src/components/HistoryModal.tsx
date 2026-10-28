import React, { useState } from 'react';
import { HistoryDay } from '../types';
import { formatNaira, formatTime } from '../utils/storage';

interface HistoryModalProps {
  isOpen: boolean;
  history: HistoryDay[];
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  history,
  onClose,
}) => {
  const [openIndices, setOpenIndices] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const toggleDay = (index: number) => {
    setOpenIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Display reversed (newest first)
  const reversedHistory = [...history].map((day, originalIndex) => ({
    day,
    originalIndex,
  })).reverse();

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="modal-sheet history-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historyTitle"
      >
        <div className="sheet-handle" aria-hidden="true"></div>
        <div className="modal-header">
          <div>
            <p className="eyebrow">PAST DAYS</p>
            <h2 id="historyTitle">Sales history</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close sales history"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="history-content">
          {reversedHistory.length === 0 ? (
            <div className="empty-state">
              <div className="empty-mark" aria-hidden="true">
                ₦
              </div>
              <div>
                <h3>No history yet</h3>
                <p>Close shop at the end of a selling day and its total will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="history-list">
              {reversedHistory.map(({ day, originalIndex }) => {
                const isOpenCard = !!openIndices[originalIndex];
                return (
                  <article
                    key={originalIndex}
                    className={`history-card ${isOpenCard ? 'is-open' : ''}`}
                  >
                    <button
                      className="history-summary"
                      type="button"
                      aria-expanded={isOpenCard}
                      onClick={() => toggleDay(originalIndex)}
                    >
                      <span>
                        <strong>{day.date}</strong>
                        <small>Closed at {day.time}</small>
                      </span>
                      <b>{formatNaira(day.total)}</b>
                      <span className="history-chevron" aria-hidden="true">
                        ⌄
                      </span>
                    </button>

                    {isOpenCard && (
                      <div className="history-sales">
                        {day.sales.length === 0 ? (
                          <p className="history-empty">No sales recorded.</p>
                        ) : (
                          day.sales.map((sale, saleIdx) => (
                            <div key={sale.id || saleIdx} className="history-sale-row">
                              <div>
                                <strong>{sale.item}</strong>
                                <small>
                                  {sale.type === 'debt'
                                    ? `Owes ${sale.customer || 'Unknown'}`
                                    : 'Cash sale'}{' '}
                                  · {sale.createdAt ? formatTime(sale.createdAt) : day.time}
                                </small>
                              </div>
                              <b>{formatNaira(sale.amount)}</b>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
