import { Inbox, KeyRound, Mail, Settings, ShieldCheck } from 'lucide-react';

export type PageId = 'inbox' | 'accounts' | 'totp' | 'settings';

interface SidebarProps {
  page: PageId;
  onChange: (page: PageId) => void;
  accountCount: number;
  codeCount: number;
  version: string;
}

const items = [
  { id: 'inbox' as const, label: '验证码收件箱', icon: Inbox },
  { id: 'accounts' as const, label: '邮箱账户', icon: Mail },
  { id: 'totp' as const, label: '2FA 动态码', icon: KeyRound },
  { id: 'settings' as const, label: '安全与设置', icon: Settings },
];

export function Sidebar({ page, onChange, accountCount, codeCount, version }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Mail size={22} /><span /></div>
        <div>
          <strong>CodeHarbor</strong>
          <small>验证码港</small>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="主导航">
        {items.map((item) => {
          const Icon = item.icon;
          const count = item.id === 'accounts' ? accountCount : item.id === 'totp' ? codeCount : undefined;
          return (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              type="button"
              onClick={() => onChange(item.id)}
              aria-label={item.label}
              title={item.label}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
              {count !== undefined && <em>{count}</em>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="local-badge">
          <ShieldCheck size={17} />
          <div><strong>本地加密</strong><span>凭据不上传</span></div>
        </div>
        <small>Version {version}</small>
      </div>
    </aside>
  );
}
