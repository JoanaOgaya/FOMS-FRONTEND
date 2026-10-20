import React, { useState, useRef, useEffect } from 'react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange?: (date: string) => void;
  isInvalid?: boolean;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({ 
  value, 
  onChange, 
  isInvalid, 
  disabled,
  minDate,
  maxDate,
  placeholder
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (day: number) => {
    if (disabled || !onChange) return;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    // adjust for local timezone to get correct YYYY-MM-DD string
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    onChange(localDate.toISOString().split('T')[0]);
    setIsOpen(false);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const formatMonthYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const formatInput = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  const selectedDateObj = value ? new Date(value) : null;

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <i 
          className="ti ti-calendar" 
          style={{ 
            position: 'absolute', 
            left: 14, 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: '#14B8A6',
            fontSize: '1.1rem',
            pointerEvents: 'none'
          }} 
        />
        <input 
          type="text"
          readOnly
          value={formatInput(value)}
          placeholder={placeholder || "Select date..."}
          style={{ 
            width: '100%', 
            padding: '11px 14px 11px 42px', 
            borderRadius: 8, 
            border: `1px solid ${isOpen ? '#14B8A6' : (isInvalid ? '#EF4444' : '#E2E8F0')}`, 
            background: disabled ? '#F1F5F9' : '#fff', 
            fontSize: '0.9rem', 
            boxSizing: 'border-box',
            outline: isOpen ? '1px solid #14B8A6' : 'none',
            color: disabled ? '#94A3B8' : (value ? '#0F172A' : '#94A3B8'),
            cursor: disabled ? 'not-allowed' : 'pointer'
          }} 
        />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 8,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          border: '1px solid #E2E8F0',
          padding: 20,
          zIndex: 50,
          width: 320,
          boxSizing: 'border-box'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ti ti-chevron-left" style={{ color: '#475569' }} />
            </button>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={viewDate.getMonth()}
                onChange={(e) => {
                  const newMonth = parseInt(e.target.value, 10);
                  setViewDate(new Date(viewDate.getFullYear(), newMonth, 1));
                }}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  padding: '4px 6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  background: '#fff',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={(e) => {
                  const newYear = parseInt(e.target.value, 10);
                  setViewDate(new Date(newYear, viewDate.getMonth(), 1));
                }}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  padding: '4px 6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  background: '#fff',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {Array.from({ length: 10 }, (_, i) => 2015 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ti ti-chevron-right" style={{ color: '#475569' }} />
            </button>
          </div>

          {/* Weekdays */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 12, textAlign: 'center' }}>
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
              <span key={day} style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>{day}</span>
            ))}
          </div>

          {/* Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = selectedDateObj && 
                               selectedDateObj.getDate() === day && 
                               selectedDateObj.getMonth() === viewDate.getMonth() && 
                               selectedDateObj.getFullYear() === viewDate.getFullYear();
              
              // Calculate YYYY-MM-DD for this day
              const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
              const offset = d.getTimezoneOffset() * 60000;
              const localDate = new Date(d.getTime() - offset);
              const dateStr = localDate.toISOString().split('T')[0];

              const isDisabled = (minDate && dateStr < minDate) || (maxDate && dateStr > maxDate);
              
              return (
                <button
                  key={day}
                  disabled={!!isDisabled}
                  onClick={() => handleSelect(day)}
                  style={{
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: isSelected ? '2px solid #14B8A6' : '2px solid transparent',
                    background: 'transparent',
                    fontSize: '0.85rem',
                    fontWeight: isSelected ? 700 : 500,
                    color: isDisabled ? '#CBD5E1' : (isSelected ? '#0F172A' : '#475569'),
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.1s'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !isDisabled) e.currentTarget.style.background = '#F1F5F9';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected && !isDisabled) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
