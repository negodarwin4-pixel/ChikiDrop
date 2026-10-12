const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '1502811510');
const WEBAPP_URL = (process.env.WEBAPP_URL || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 10000);

if (!BOT_TOKEN || BOT_TOKEN === 'PASTE_NEW_BOT_TOKEN_HERE') {
  console.error('Missing BOT_TOKEN environment variable. Add it in Render Environment.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
const storePath = path.join(dataDir, 'store.json');
fs.mkdirSync(dataDir, { recursive: true });
let store = { users: {}, history: {} };
try {
  if (fs.existsSync(storePath)) store = { ...store, ...JSON.parse(fs.readFileSync(storePath, 'utf8')) };
} catch (e) {
  console.error('Could not read data/store.json:', e.message);
}
function saveStore() {
  const tmp = storePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, storePath);
}
function getUser(id, info = {}) {
  const key = String(id);
  if (!store.users[key]) store.users[key] = { id: key, tickets: 0, cards: [], firstName: '', username: '' };
  if (info.first_name) store.users[key].firstName = info.first_name;
  if (info.username) store.users[key].username = info.username;
  return store.users[key];
}

const CARD_COST = 1;
const RANKS = [
  { rank: 'F', weight: 50, chance: '50%', color: '#9696a3', label: 'Обычная' },
  { rank: 'E', weight: 25, chance: '25%', color: '#5dc8f5', label: 'Необычная' },
  { rank: 'D', weight: 15, chance: '15%', color: '#62d99a', label: 'Редкая' },
  { rank: 'C', weight: 7, chance: '7%', color: '#b88aff', label: 'Эпическая' },
  { rank: 'B', weight: 2.5, chance: '2.5%', color: '#ffc35c', label: 'Легендарная' },
  { rank: 'A', weight: 0.5, chance: '0.5%', color: '#ff394f', label: 'Мифическая' }
];
function drawCard() {
  let roll = Math.random() * RANKS.reduce((s, r) => s + r.weight, 0);
  for (const r of RANKS) { roll -= r.weight; if (roll < 0) return { ...r, id: crypto.randomUUID(), obtainedAt: new Date().toISOString() }; }
  return { ...RANKS[0], id: crypto.randomUUID(), obtainedAt: new Date().toISOString() };
}
function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`);
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try {
    const user = JSON.parse(params.get('user') || '{}');
    return user.id ? user : null;
  } catch { return null; }
}
function auth(req, res, next) {
  const user = verifyInitData(req.get('x-telegram-init-data') || req.body?.initData);
  if (!user) return res.status(401).json({ error: 'Открой ChikiDrop через Telegram-бота.' });
  req.tgUser = user;
  next();
}

app.get('/api/config', (_req, res) => res.json({ name: 'ChikiDrop', cost: CARD_COST, ranks: RANKS.map(({rank,weight,chance,color,label}) => ({rank,weight,chance,color,label})) }));
app.get('/api/me', auth, (req, res) => {
  const u = getUser(req.tgUser.id, req.tgUser);
  saveStore();
  res.json({ user: { id: u.id, firstName: u.firstName, username: u.username }, tickets: u.tickets, cards: u.cards });
});
app.post('/api/open', auth, (req, res) => {
  const u = getUser(req.tgUser.id, req.tgUser);
  if (u.tickets < CARD_COST) return res.status(400).json({ error: `Нужно ${CARD_COST} билетов для открытия карточки.` });
  u.tickets -= CARD_COST;
  const card = drawCard();
  u.cards.unshift(card);
  if (u.cards.length > 500) u.cards.length = 500;
  saveStore();
  res.json({ tickets: u.tickets, card, cards: u.cards });
});
app.get('/health', (_req, res) => res.json({ ok: true, app: 'ChikiDrop' }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.on('polling_error', e => console.error('Telegram polling error:', e.message));
bot.onText(/^\/start(?:\s+.*)?$/, async msg => {
  const u = getUser(msg.from.id, msg.from);
  saveStore();
  const opts = WEBAPP_URL ? { reply_markup: { inline_keyboard: [[{ text: '🃏 Открыть ChikiDrop', web_app: { url: WEBAPP_URL } }]] } } : {};
  bot.sendMessage(msg.chat.id,
    `✨ Добро пожаловать в ChikiDrop, ${msg.from.first_name || 'игрок'}!\n\n🎟 Баланс: ${u.tickets} билетов\n🃏 Открытие карточки: ${CARD_COST} билетов\n\nКоманды: /balance, /play, /help`, opts);
});
bot.onText(/^\/balance$/, msg => {
  const u = getUser(msg.from.id, msg.from); saveStore();
  bot.sendMessage(msg.chat.id, `🎟 Твой баланс: ${u.tickets} билетов`);
});
bot.onText(/^\/play$/, msg => {
  const u = getUser(msg.from.id, msg.from);
  if (u.tickets < CARD_COST) return bot.sendMessage(msg.chat.id, `Не хватает билетов. Нужно ${CARD_COST}. Попроси администратора начислить билеты.`);
  u.tickets -= CARD_COST;
  const card = drawCard(); u.cards.unshift(card); saveStore();
  bot.sendMessage(msg.chat.id, `🃏 Ты получил карточку ранга ${card.rank} — ${card.label}!\n🎟 Осталось билетов: ${u.tickets}`);
});
bot.onText(/^\/help$/, msg => bot.sendMessage(msg.chat.id, 'ChikiDrop — коллекционные карточки за виртуальные билеты.\n/start — открыть меню\n/balance — баланс\n/play — получить случайную карточку\n/addtickets ID КОЛИЧЕСТВО — команда администратора.'));
bot.onText(/^\/addtickets(?:@\w+)?\s+(\d+)\s+(\d+)$/, msg => {
  if (String(msg.from.id) !== ADMIN_ID) return bot.sendMessage(msg.chat.id, '⛔ Нет доступа.');
  const target = String(msg.match[1]), amount = Number(msg.match[2]);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return bot.sendMessage(msg.chat.id, 'Укажи количество от 1 до 1000000.');
  const u = getUser(target); u.tickets += amount; saveStore();
  bot.sendMessage(msg.chat.id, `✅ Начислено ${amount} билетов пользователю ${target}. Баланс: ${u.tickets}.`);
  bot.sendMessage(target, `🎟 Администратор начислил тебе ${amount} билетов. Баланс: ${u.tickets}.`).catch(() => {});
});
app.listen(PORT, '0.0.0.0', () => console.log(`ChikiDrop web app listening on :${PORT}`));
console.log('ChikiDrop Telegram bot polling enabled');
