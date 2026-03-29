/**
 * Font Awesome icon picker - searchable grid of icons for user selection.
 */
import { useState, useMemo } from 'react';
import FA_ICONS from '../assets/fa-icons.json';

// Curated list of common Font Awesome icons suitable for subscriptions/services
const ICON_LIST = [
  // Media & Entertainment
  { class: 'fab fa-spotify', label: 'Spotify' },
  { class: 'fab fa-apple', label: 'Apple' },
  { class: 'fab fa-google', label: 'Google' },
  { class: 'fab fa-amazon', label: 'Amazon' },
  { class: 'fab fa-netflix', label: 'Netflix' },  
  { class: 'fab fa-youtube', label: 'YouTube' },
  { class: 'fab fa-twitch', label: 'Twitch' },
  { class: 'fab fa-steam', label: 'Steam' },
  { class: 'fab fa-playstation', label: 'PlayStation' },
  { class: 'fab fa-xbox', label: 'Xbox' },
  { class: 'fab fa-discord', label: 'Discord' },
  { class: 'fas fa-music', label: '音乐' },
  { class: 'fas fa-film', label: '影视' },
  { class: 'fas fa-tv', label: '电视' },
  { class: 'fas fa-podcast', label: '播客' },
  { class: 'fas fa-gamepad', label: '游戏' },
  { class: 'fas fa-headphones', label: '耳机' },

  // Social & Communication
  { class: 'fab fa-telegram', label: 'Telegram' },
  { class: 'fab fa-whatsapp', label: 'WhatsApp' },
  { class: 'fab fa-slack', label: 'Slack' },
  { class: 'fab fa-microsoft', label: 'Microsoft' },
  { class: 'fab fa-facebook', label: 'Facebook' },
  { class: 'fab fa-twitter', label: 'Twitter' },
  { class: 'fab fa-instagram', label: 'Instagram' },
  { class: 'fab fa-tiktok', label: 'TikTok' },
  { class: 'fab fa-linkedin', label: 'LinkedIn' },
  { class: 'fab fa-reddit', label: 'Reddit' },
  { class: 'fas fa-comments', label: '聊天' },
  { class: 'fas fa-envelope', label: '邮件' },
  { class: 'fas fa-phone', label: '电话' },
  { class: 'fas fa-video', label: '视频' },

  // Development & Tech
  { class: 'fab fa-github', label: 'GitHub' },
  { class: 'fab fa-gitlab', label: 'GitLab' },
  { class: 'fab fa-bitbucket', label: 'Bitbucket' },
  { class: 'fab fa-docker', label: 'Docker' },
  { class: 'fab fa-aws', label: 'AWS' },
  { class: 'fab fa-digital-ocean', label: 'DigitalOcean' },
  { class: 'fab fa-cloudflare', label: 'Cloudflare' },
  { class: 'fas fa-code', label: '代码' },
  { class: 'fas fa-terminal', label: '终端' },
  { class: 'fas fa-server', label: '服务器' },
  { class: 'fas fa-database', label: '数据库' },
  { class: 'fas fa-robot', label: 'AI/机器人' },

  // Cloud & Storage
  { class: 'fab fa-dropbox', label: 'Dropbox' },
  { class: 'fab fa-google-drive', label: 'Google Drive' },
  { class: 'fas fa-cloud', label: '云服务' },
  { class: 'fas fa-hdd', label: '存储' },
  { class: 'fas fa-download', label: '下载' },
  { class: 'fas fa-upload', label: '上传' },

  // Finance & Business
  { class: 'fab fa-cc-visa', label: 'Visa' },
  { class: 'fab fa-cc-mastercard', label: 'Mastercard' },
  { class: 'fab fa-paypal', label: 'PayPal' },
  { class: 'fab fa-stripe', label: 'Stripe' },
  { class: 'fas fa-credit-card', label: '信用卡' },
  { class: 'fas fa-wallet', label: '钱包' },
  { class: 'fas fa-chart-line', label: '图表' },
  { class: 'fas fa-briefcase', label: '办公' },
  { class: 'fas fa-building', label: '企业' },
  { class: 'fas fa-receipt', label: '账单' },

  // Education & Productivity
  { class: 'fas fa-graduation-cap', label: '教育' },
  { class: 'fas fa-book', label: '书籍' },
  { class: 'fas fa-newspaper', label: '新闻' },
  { class: 'fas fa-pen', label: '写作' },
  { class: 'fas fa-palette', label: '设计' },
  { class: 'fas fa-paint-brush', label: '画笔' },
  { class: 'fas fa-camera', label: '摄影' },
  { class: 'fas fa-image', label: '图片' },
  { class: 'fas fa-file-alt', label: '文档' },
  { class: 'fas fa-tasks', label: '任务' },
  { class: 'fas fa-calendar-alt', label: '日历' },
  { class: 'fas fa-clipboard', label: '剪贴板' },

  // Health & Lifestyle
  { class: 'fas fa-heartbeat', label: '健康' },
  { class: 'fas fa-dumbbell', label: '健身' },
  { class: 'fas fa-running', label: '运动' },
  { class: 'fas fa-utensils', label: '餐饮' },
  { class: 'fas fa-home', label: '家居' },
  { class: 'fas fa-car', label: '汽车' },
  { class: 'fas fa-bicycle', label: '自行车' },
  { class: 'fas fa-plane', label: '旅行' },
  { class: 'fas fa-map-marker-alt', label: '地图' },

  // Security & Privacy
  { class: 'fas fa-shield-alt', label: '安全' },
  { class: 'fas fa-lock', label: '锁定' },
  { class: 'fas fa-key', label: '密钥' },
  { class: 'fas fa-user-shield', label: '隐私' },
  { class: 'fas fa-fingerprint', label: '指纹' },
  { class: 'fab fa-expeditedssl', label: 'VPN/SSL' },

  // General & Misc
  { class: 'fas fa-globe', label: '网站' },
  { class: 'fas fa-link', label: '链接' },
  { class: 'fas fa-wifi', label: 'WiFi' },
  { class: 'fas fa-mobile-alt', label: '手机' },
  { class: 'fas fa-laptop', label: '电脑' },
  { class: 'fas fa-desktop', label: '桌面' },
  { class: 'fas fa-plug', label: '插件' },
  { class: 'fas fa-cog', label: '设置' },
  { class: 'fas fa-tools', label: '工具' },
  { class: 'fas fa-box', label: '包裹' },
  { class: 'fas fa-cube', label: '默认' },
  { class: 'fas fa-star', label: '收藏' },
  { class: 'fas fa-bell', label: '通知' },
  { class: 'fas fa-bolt', label: '闪电' },
  { class: 'fas fa-fire', label: '热门' },
  { class: 'fas fa-gem', label: '高级' },
  { class: 'fas fa-crown', label: '会员' },
  { class: 'fas fa-gift', label: '礼物' },
  { class: 'fas fa-magic', label: '魔法' },
  { class: 'fas fa-infinity', label: '无限' },
];

const ALL_ICONS = [
  ...ICON_LIST,
  ...FA_ICONS.filter(i => !ICON_LIST.some(cur => cur.class === i.c))
    .map(i => ({ class: i.c, label: i.l, s: i.s }))
];

export default function IconPicker({ value, onChange, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = ALL_ICONS;
    if (search) {
      const q = search.toLowerCase();
      result = ALL_ICONS.filter(
        (icon) => 
          icon.label.toLowerCase().includes(q) || 
          icon.class.toLowerCase().includes(q) ||
          (icon.s && icon.s.toLowerCase().includes(q))
      );
    }
    // Limit to exactly 100 icons globally to maintain buttery smooth modal render times
    return result.slice(0, 100);
  }, [search]);

  return (
    <div className="icon-picker-overlay" onClick={onClose}>
      <div className="icon-picker" onClick={(e) => e.stopPropagation()}>
        <div className="icon-picker-header">
          <h3>选择图标</h3>
          <button className="icon-picker-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <input
          type="text"
          className="form-control"
          placeholder="🔍 搜索图标..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="icon-picker-grid">
          {filtered.map((icon) => (
            <div
              key={icon.class}
              className={`icon-picker-item ${value === icon.class ? 'selected' : ''}`}
              onClick={() => { onChange(icon.class); onClose(); }}
              title={icon.label}
            >
              <i className={icon.class}></i>
              <span>{icon.label}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
              未找到匹配图标
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
