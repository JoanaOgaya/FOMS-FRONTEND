/**
 * Sidebar — renders only the modules the current role may open (utils/roleAccess),
 * and the user card from the user record.
 */
import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS, getNavGroups, moduleLabel } from "../utils/roleAccess";
import { getInitials } from "../utils/format";

const COLLAPSE_KEY = "sidebar-collapsed";

export interface SidebarProps {
  logoUrl?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ logoUrl = "/logo.png" }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navGroups = getNavGroups(user?.role);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "true");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, String(!prev));
      return !prev;
    });
  };

  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setIsProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const menuButton: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, textAlign: 'left' };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-logo">
        <div className="logo-img-wrapper">
          <img src={logoUrl} alt="Logo" className="sidebar-logo-img" />
        </div>
        <button className="sb-toggle-btn" onClick={toggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <i className={collapsed ? "ti ti-chevron-right" : "ti ti-chevron-left"} />
        </button>
      </div>

      {!collapsed && user && (
        <div style={{ padding: '0 24px', marginBottom: '24px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '8px 12px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            {ROLE_LABELS[user.role]}
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <React.Fragment key={group.label}>
            <span className="nav-module-label">{group.label}</span>
            {group.items.map((item) => (
              <div key={item.key} className="nav-item-container">
                <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <span className="nav-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <i className={item.icon} style={{ fontSize: "18px" }} />
                  </span>
                  <span className="nav-label">
                    {moduleLabel(item, user?.role)}
                  </span>
                </NavLink>
              </div>
            ))}
          </React.Fragment>
        ))}
      </nav>

      {user && (
        <div className="sidebar-footer" ref={profileMenuRef} style={{ position: 'relative' }}>
          {isProfileMenuOpen && !collapsed && (
            <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '16px', right: '16px', background: '#fff', borderRadius: '12px', padding: '16px 0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', zIndex: 100 }}>
              <div style={{ padding: '0 16px 12px 16px', borderBottom: '1px solid #E2E8F0', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, color: '#1B254B', fontSize: '14px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.fullName}</div>
                <div style={{ color: '#64748B', fontSize: '12px' }}>{ROLE_LABELS[user.role]}</div>
              </div>
              <button style={{ ...menuButton, color: '#1B254B' }} onClick={() => { navigate('/profile'); setIsProfileMenuOpen(false); }}>
                <i className="ti ti-user" style={{ fontSize: '18px', color: '#64748B' }} /> My Profile
              </button>
              <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />
              <button style={{ ...menuButton, color: '#EF4444' }} onClick={() => { logout(); setIsProfileMenuOpen(false); }}>
                <i className="ti ti-logout" style={{ fontSize: '18px' }} /> Log Out
              </button>
            </div>
          )}

          <div className="profile-card" onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
              <div className="profile-av">{getInitials(user.fullName)}</div>
              {!collapsed && (
                <div className="profile-info" style={{ overflow: 'hidden' }}>
                  <span className="profile-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.fullName}</span>
                  <span className="profile-role" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ROLE_LABELS[user.role]}</span>
                </div>
              )}
            </div>
            {!collapsed && <i className="ti ti-selector" style={{ color: '#94A3B8', fontSize: '16px', flexShrink: 0 }} />}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
