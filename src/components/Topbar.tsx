import { LockKeyhole, Search } from 'lucide-react';
import type { PageId } from './Sidebar';

const TITLES: Record<PageId, { eyebrow: string; title: string }> = {
  inbox: { eyebrow: 'UNIFIED INBOX', title: '验证码收件箱' },
  accounts: { eyebrow: 'MAIL ACCOUNTS', title: '邮箱账户' },
  totp: { eyebrow: 'AUTHENTICATOR', title: '2FA 动态码' },
  settings: { eyebrow: 'PREFERENCES', title: '安全与设置' },
};

export function Topbar({ page, search, onSearch }: { page: PageId; search: string; onSearch: (value: string) => void }) {
  const current = TITLES[page];
  return (
    <header className="topbar">
      <div>
        <span className="eyebrow">{current.eyebrow}</span>
        <h1>{current.title}</h1>
      </div>
      <div className="topbar-actions">
        {(page === 'inbox' || page === 'accounts' || page === 'totp') && (
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索…" />
          </label>
        )}
        <div className="encrypted-pill"><LockKeyhole size={15} /> 本机加密</div>
      </div>
    </header>
  );
}
