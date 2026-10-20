import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, History, ChevronsUpDown, User, Settings, LogOut, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useClientContext } from '../context/ClientContext';

const SIDEBAR_WIDTH = '240px';
const SIDEBAR_COLLAPSED_WIDTH = '68px';

export const Sidebar: React.FC = () => {
  const { user, logout } = useClientContext();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('speedpay-sidebar-collapsed') === 'true';
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('speedpay-sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'My Invoices', path: '/invoices', icon: <FileText size={20} /> },
    { name: 'Payment History', path: '/history', icon: <History size={20} /> },
  ];

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <>
      {/* Push main content over */}
      <div style={{ width: sidebarWidth, flexShrink: 0, transition: 'width 0.25s ease' }} />

      <div style={{
        width: sidebarWidth,
        background: '#0B1437',
        color: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        fontFamily: '"Inter", sans-serif',
        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        zIndex: 20,
      }}>
        {/* Logo + Toggle */}
        <div style={{ padding: '14px 16px', minHeight: '62px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {!collapsed && (
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
              <img src="/logo.png" alt="Speedex" style={{ maxHeight: '38px', maxWidth: '160px', objectFit: 'contain' }} />
            </h1>
          )}
          {collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}>
              <img src="/logo.png" alt="Speedex" style={{ maxHeight: '28px', maxWidth: '36px', objectFit: 'contain' }} />
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggleCollapse}
              title="Collapse sidebar"
              style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94A3B8', flexShrink: 0 }}
            >
              <ChevronsLeft size={16} />
            </button>
          )}
          {collapsed && (
            <button
              onClick={toggleCollapse}
              title="Expand sidebar"
              style={{ position: 'absolute', right: '-12px', top: '20px', background: '#0B1437', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94A3B8', zIndex: 21 }}
            >
              <ChevronsRight size={14} />
            </button>
          )}
        </div>

        {/* Nav label */}
        {!collapsed && (
          <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '16px 16px 6px', margin: 0 }}>
            SPEEDPAY
          </div>
        )}
        {collapsed && <div style={{ height: '12px' }} />}

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 8px', flex: 1, overflowY: 'auto' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.name : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : '10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: '9px 12px',
                borderRadius: '8px',
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)',
                background: isActive ? 'rgba(0, 169, 157, 0.12)' : 'transparent',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s',
                borderLeft: isActive ? '3px solid #00A99D' : '3px solid transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              })}
            >
              {item.icon}
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Profile footer */}
        <div ref={profileMenuRef} style={{ position: 'relative', padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {isProfileMenuOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: '8px', right: '8px',
              background: '#fff', borderRadius: '12px', padding: '16px 0',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              zIndex: 100, color: '#0F172A'
            }}>
              <div style={{ padding: '0 16px 12px 16px', borderBottom: '1px solid #E2E8F0', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, color: '#1B254B', fontSize: '14px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <div style={{ color: '#64748B', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.companyName}</div>
              </div>
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1B254B', fontSize: '14px', fontWeight: 600, textAlign: 'left' }} onClick={() => setIsProfileMenuOpen(false)}>
                <User size={18} color="#64748B" /> My Profile
              </button>
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1B254B', fontSize: '14px', fontWeight: 600, textAlign: 'left' }}>
                <Settings size={18} color="#64748B" /> System Settings
              </button>
              <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '14px', fontWeight: 600, textAlign: 'left' }} onClick={() => { logout(); setIsProfileMenuOpen(false); navigate('/login'); }}>
                <LogOut size={18} /> Log Out
              </button>
            </div>
          )}

          <div onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', padding: '9px 10px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : '10px', overflow: 'hidden' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #00A99D, #1B254B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', color: '#fff', flexShrink: 0, border: '1.5px solid rgba(255, 255, 255, 0.1)', fontFamily: '"Montserrat", sans-serif' }}>
                {user?.avatarInitials}
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.35)' }}>{user?.companyName}</span>
                </div>
              )}
            </div>
            {!collapsed && <ChevronsUpDown size={14} color="#94A3B8" />}
          </div>
        </div>
      </div>
    </>
  );
};
