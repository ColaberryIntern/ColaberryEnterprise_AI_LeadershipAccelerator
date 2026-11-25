import fs from 'fs';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import { mintKitToken, verifyDeckToken, verifyKitToken } from '../../services/classKit/kitToken';
import { deckTokenOrFullAdmin, kitTokenOrAdmin } from '../kitTokenGuards';

/** Staff access gaps (2026-11-25): mentors keep the class controls; only the deck or a full admin opens the offer. */
const app = express();
app.post('/s/:id/control', kitTokenOrAdmin, (_q, r) => { r.json({ ok: true }); });
app.post('/s/:id/flash', deckTokenOrFullAdmin, (_q, r) => { r.json({ ok: true }); });
const login = (claims: Record<string, unknown>) => `Bearer ${jwt.sign({ sub: 'u', email: 'u@example.com', role: 'admin', ...claims }, env.jwtSecret)}`;
const asStaff = (url: string, claims: Record<string, unknown>) => request(app).post(url).set('Authorization', login(claims)).then((r) => r.status);
const withToken = (url: string, t: string) => request(app).post(`${url}?t=${encodeURIComponent(t)}`).then((r) => r.status);

it.each(['mentor', 'support', 'marketing', 'curriculum', 'community_organizer'])('%s keeps the class controls but cannot open the offer', async (mgmt_role) => {
  expect(await asStaff('/s/1/control', { mgmt_role })).toBe(200);
  expect(await asStaff('/s/1/flash', { mgmt_role })).toBe(403);
});
it.each([[{}], [{ role: 'super_admin' }], [{ mgmt_role: 'owner' }], [{ mgmt_role: 'admin' }]])('a full administrator %j can open the offer', async (claims) => {
  expect(await asStaff('/s/1/flash', claims)).toBe(200);
});
it('the deck token opens the offer for its own session only', async () => {
  expect(await withToken('/s/1/flash', mintKitToken('1'))).toBe(200);
  expect(await withToken('/s/2/flash', mintKitToken('1'))).toBe(401);
});
it('the presenter page token runs the class but cannot open the offer', async () => {
  const t = mintKitToken('1', 'notes');
  expect([verifyKitToken(t, '1'), verifyDeckToken(t, '1')]).toEqual([true, false]);
  expect(await withToken('/s/1/control', t)).toBe(200);
  expect(await withToken('/s/1/flash', t)).toBe(401);
});
it('a token from before scopes cannot open the offer; expired and forged tokens open nothing', async () => {
  expect(await withToken('/s/1/flash', jwt.sign({ typ: 'kit', sid: '1' }, env.jwtSecret))).toBe(401);
  expect(await withToken('/s/1/control', jwt.sign({ typ: 'kit', sid: '1', scope: 'deck' }, env.jwtSecret, { expiresIn: -1 }))).toBe(401);
  expect(await withToken('/s/1/flash', 'forged')).toBe(401);
  expect((await request(app).post('/s/1/flash')).status).toBe(401);
});
const src = (p: string) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
it('the real offer route and the real presenter page use them', () => {
  expect(src('routes/participantRoutes.ts')).toContain("flash-discount', deckTokenOrFullAdmin,");
  const kit = src('services/sessionKitDocService.ts');
  for (const fn of ['renderPresenterPage', 'getPresenterLink']) {
    expect(kit.slice(kit.indexOf(`export async function ${fn}`)).match(/mintKitToken\([^)]*\)/)?.[0]).toBe("mintKitToken(sessionId, 'notes')");
  }
});
