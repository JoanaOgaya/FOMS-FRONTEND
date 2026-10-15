import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  Info, 
  AlertTriangle, 
  CheckCircle2, 
  LogOut,
  User,
  ChevronRight,
  Sparkles,
  MoreVertical,
  Calendar,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, getModuleForPath, moduleLabel } from '../utils/roleAccess';
import { getInitials } from '../utils/format';
import './GlobalHeader.css';
import { Button } from './Buttons';

import { useNotifications, type NotificationItem } from '../hooks/useNotifications';

export interface GlobalHeaderProps {}

const GlobalHeader: React.FC<GlobalHeaderProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAllAsRead, toggleReadStatus, clearAll } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = useMemo(() => {
    const datePart = currentTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timePart = currentTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return `${datePart} • ${timePart}`;
  }, [currentTime]);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Auto-close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter notifications
  const roleRelevantNotifications = notifications;


  // Apply read/unread tabs
  const filtered = useMemo(() => {
    let result = roleRelevantNotifications;
    
    // Read/Unread tab filter
    if (filter === 'unread') {
      result = result.filter(n => !n.read);
    }
    
    return result;
  }, [roleRelevantNotifications, filter]);

  // Priority severity sorting: unread critical alerts first
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aCriticalUnread = a.type === 'alert' && !a.read ? 1 : 0;
      const bCriticalUnread = b.type === 'alert' && !b.read ? 1 : 0;
      return bCriticalUnread - aCriticalUnread; // sorts unread criticals first
    });
  }, [filtered]);

  const handleToggleRead = (n: NotificationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!n.read) {
      toggleReadStatus(n.id);
    }
    if (n.link) {
      navigate(n.link);
      setShowNotifications(false);
    }
  };

  // Group sorted notifications into Today vs Earlier
  const todayNotifications = useMemo(() => sortedFiltered.filter(n => n.isToday), [sortedFiltered]);
  const earlierNotifications = useMemo(() => sortedFiltered.filter(n => !n.isToday), [sortedFiltered]);

  // Derive the title from the active route via the role-access config
  const currentTitle = useMemo(() => {
    const m = getModuleForPath(location.pathname);
    return m ? moduleLabel(m, user?.role) : '';
  }, [location.pathname, user?.role]);

  // Derive profile display info from the user record
  const profileName = user?.fullName ?? '';
  const profileRole = user ? ROLE_LABELS[user.role] : '';
  const profileInitials = getInitials(profileName);

  const isChildRoute = 
    location.pathname.split('/').filter(Boolean).length > 1 || 
    location.search.length > 0;

  const handleBack = () => {
    // If there is an active search/query param on current route, clear it first
    if (location.search) {
      navigate(location.pathname, { replace: true });
      return;
    }

    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length > 1) {
      // Navigate to parent route (e.g. /receipts/CA-001 -> /receipts)
      const parentPath = '/' + segments.slice(0, -1).join('/');
      navigate(parentPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="site-header" style={{ position: 'sticky' }}>
      <nav className="nav-bar">
        {/* Left Side: Page Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {isChildRoute && (
            <button
              onClick={handleBack}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid #E2E8F0',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#334155',
                transition: 'all 200ms',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#1E3A8A';
                e.currentTarget.style.color = '#1E3A8A';
                e.currentTarget.style.background = '#EFF6FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.color = '#334155';
                e.currentTarget.style.background = '#fff';
              }}
              aria-label="Go back"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 className="header-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {currentTitle}
            </h1>
          </div>
        </div>
        
        {/* Right Side: Interactive Controls */}
        <div className="header-controls">
          {/* Date and Time Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '9999px',
            color: '#334155',
            fontSize: '0.85rem',
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}>
            <Clock size={15} style={{ color: '#0D9488' }} strokeWidth={2.5} />
            <span>{formattedDateTime}</span>
          </div>

          {/* Notification Button & Dropdown */}
          <div className="header-notification-container" ref={notificationRef}>
            <button 
              className={`header-icon-btn ${bellAnimating ? 'bell-pulse' : ''}`}
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              aria-label="Notifications"
              aria-expanded={showNotifications}
            >
              <Bell size={20} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="notification-badge-count">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            
            {showNotifications && (
              <div 
                className="notification-dropdown"
                role="region"
                aria-live="polite"
                aria-label="Notification center"
                style={{ zIndex: 999999 }}
              >
                {/* Header */}
                <div className="notification-dropdown-header">
                  <div className="notification-dropdown-title-group">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                      <span className="notification-unread-pill">{unreadCount} new</span>
                    )}
                  </div>
                  <button className="notification-mark-all-btn" onClick={markAllAsRead}>
                    <CheckCheck size={14} /> Mark all as read
                  </button>
                </div>
                
                {/* Filter tab bar */}
                <div className="notification-filter-bar">
                  <span 
                    onClick={() => setFilter('all')} 
                    className={`notification-filter-tab ${filter === 'all' ? 'active' : ''}`}
                  >
                    All
                  </span>
                  <span 
                    onClick={() => setFilter('unread')} 
                    className={`notification-filter-tab ${filter === 'unread' ? 'active' : ''}`}
                  >
                    Unread ({unreadCount})
                  </span>
                </div>

 
                {/* Notification Items List */}
                <div className="notification-dropdown-list">
                  {sortedFiltered.length === 0 ? (
                    <div className="notification-dropdown-empty">
                      <div className="empty-bell-icon">
                        <Bell size={32} />
                      </div>
                      <p className="empty-title">You're all caught up!</p>
                      <p className="empty-subtitle">No new alerts for this category.</p>
                    </div>
                  ) : (
                    <>
                      {/* TODAY SECTION */}
                      {todayNotifications.length > 0 && (
                        <div className="notification-group-section">
                          <div className="notification-group-title">Today</div>
                          {todayNotifications.map((n) => {
                            const isCritical = n.type === 'alert';
                            return (
                              <div 
                                key={n.id} 
                                className={`notification-dropdown-item ${!n.read ? 'unread' : ''} ${isCritical ? 'critical' : ''}`}
                                onClick={(e) => handleToggleRead(n, e)}
                                style={{ cursor: n.link ? 'pointer' : 'default' }}
                              >
                                <div className="notification-dropdown-item-content">
                                  <div className={`notification-dropdown-icon-container ${n.type}`}>
                                    {n.type === 'alert' && <AlertTriangle size={14} />}
                                    {n.type === 'success' && <CheckCircle2 size={14} />}
                                    {n.type === 'info' && <Info size={14} />}
                                  </div>
                                  <div className="notification-dropdown-text-container">
                                    <div className="notification-dropdown-item-header">
                                      <span className="notification-dropdown-item-title">{n.title}</span>
                                      <span className="notification-status-indicator-dot" />
                                    </div>
                                    <p className="notification-dropdown-item-desc">{n.description}</p>
                                    
                                    {/* Inline action support for critical items */}
                                    {n.actionLabel && (
                                      <div style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                                        <button 
                                          className="notification-action-btn"
                                          onClick={() => alert(`Redirecting to: ${n.actionLabel}`)}
                                        >
                                          {n.actionLabel} →
                                        </button>
                                      </div>
                                    )}

                                    <span className="notification-dropdown-item-time">{n.timestamp}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
 
                      {/* EARLIER SECTION */}
                      {earlierNotifications.length > 0 && (
                        <div className="notification-group-section">
                          <div className="notification-group-title">Earlier</div>
                          {earlierNotifications.map((n) => {
                            const isCritical = n.type === 'alert';
                            return (
                              <div 
                                key={n.id} 
                                className={`notification-dropdown-item ${!n.read ? 'unread' : ''} ${isCritical ? 'critical' : ''}`}
                                onClick={(e) => handleToggleRead(n, e)}
                                style={{ cursor: n.link ? 'pointer' : 'default' }}
                              >
                                <div className="notification-dropdown-item-content">
                                  <div className={`notification-dropdown-icon-container ${n.type}`}>
                                    {n.type === 'alert' && <AlertTriangle size={14} />}
                                    {n.type === 'success' && <CheckCircle2 size={14} />}
                                    {n.type === 'info' && <Info size={14} />}
                                  </div>
                                  <div className="notification-dropdown-text-container">
                                    <div className="notification-dropdown-item-header">
                                      <span className="notification-dropdown-item-title">{n.title}</span>
                                      <span className="notification-status-indicator-dot" />
                                    </div>
                                    <p className="notification-dropdown-item-desc">{n.description}</p>

                                    {/* Inline action support for critical items */}
                                    {n.actionLabel && (
                                      <div style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                                        <button 
                                          className="notification-action-btn"
                                          onClick={() => alert(`Redirecting to: ${n.actionLabel}`)}
                                        >
                                          {n.actionLabel} →
                                        </button>
                                      </div>
                                    )}

                                    <span className="notification-dropdown-item-time">{n.timestamp}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
 
                {/* Footer Link */}
                <div className="notification-dropdown-footer">
                  <button className="view-all-notifications-btn" onClick={() => {
                    navigate('/notifications');
                    setShowNotifications(false);
                  }}>
                    <span>View all notifications</span>
                    <ChevronRight size={14} />
                  </button>
                  {/* Destructive Clear All icon is now linked to confirmation workflow */}
                  <button 
                    className="clear-all-notifications-btn" 
                    onClick={() => setShowClearConfirm(true)} 
                    title="Clear all notifications"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
 
          {/* Profile Avatar & Dropdown */}
          <div className="header-profile-container" ref={profileRef}>
            <button 
              className="header-avatar-btn" 
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              aria-label="User Profile Dropdown"
              aria-expanded={showProfileMenu}
            >
              <div className="avatar-circle-wrapper">
                <div className="avatar-circle">
                  {profileInitials}
                </div>
              </div>
            </button>
            
            {showProfileMenu && (
              <div className="profile-dropdown">
                <div className="profile-dropdown-user-info">
                  <div className="profile-dropdown-avatar-wrapper">
                    <div className="profile-dropdown-avatar">
                      {profileInitials}
                    </div>
                  </div>
                  <div className="profile-dropdown-meta">
                    <span className="profile-dropdown-name">{profileName}</span>
                    <span className="profile-dropdown-role">{profileRole}</span>
                  </div>
                </div>
 
                <div className="profile-dropdown-divider" />
                
                {/* Options List */}
                <div className="profile-dropdown-options">
                  <button 
                    className="profile-dropdown-option"
                    onClick={() => {
                      navigate('/profile');
                      setShowProfileMenu(false);
                    }}
                  >
                    <User size={15} strokeWidth={2} className="option-icon" />
                    <span>My Profile</span>
                  </button>
                </div>
 
                <div className="profile-dropdown-divider" />
                
                {/* Logout Option */}
                <div className="profile-dropdown-logout-section">
                  <button 
                    className="profile-dropdown-option logout-option"
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                  >
                    <LogOut size={15} strokeWidth={2} className="option-icon" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Structured Confirmation Dialog for Clear All Actions */}
      {showClearConfirm && (
        <div className="header-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="header-confirm-card" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <div className="header-confirm-icon-box">
              <Trash2 size={24} />
            </div>
            <h2 className="header-confirm-title">Clear all notifications?</h2>
            <p className="header-confirm-desc">
              This will permanently delete all notifications for your current role. This action is irreversible.
            </p>
            <div className="header-confirm-actions">
              <Button 
                title="Cancel" 
                variant="secondary" 
                onClick={() => setShowClearConfirm(false)} 
              />
              <Button 
                title="Clear Notifications" 
                variant="danger" 
                onClick={() => {
                  clearAll();
                  setShowClearConfirm(false);
                }} 
              />
            </div>
          </div>
        </div>
      )}

    </header>
  );
};
 
export default GlobalHeader;
