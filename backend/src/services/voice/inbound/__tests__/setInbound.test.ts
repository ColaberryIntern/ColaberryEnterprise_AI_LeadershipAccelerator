import { runSetInbound } from '../../../../scripts/voice/setInbound';

const deps = (n: number) => { const update = jest.fn().mockResolvedValue(n); return { update, get: async () => ({ update }) }; };

it('turns inbound on for one reference with safe defaults', async () => {
  const d = deps(1);
  expect((await runSetInbound(['--ref', 'test-line', '--on'], d.get)).code).toBe(0);
  expect(d.update).toHaveBeenCalledWith('test-line', { enabled: true, engine: 'conversation_relay', hours: 'always', fallback: 'message' });
});

it('dry run and bad input write nothing; an unknown reference is refused', async () => {
  const d = deps(0);
  expect((await runSetInbound(['--ref', 'test-line', '--off', '--dry'], d.get)).code).toBe(0);
  for (const argv of [[], ['--ref', 'test-line'], ['--ref', 'test-line', '--on', '--off'], ['--ref', '+15555550100', '--on'], ['--ref', 'test-line', '--on', '--hours', 'never']]) expect((await runSetInbound(argv, d.get)).code).toBe(2);
  expect(d.update).not.toHaveBeenCalled();
  expect((await runSetInbound(['--ref', 'nope', '--on'], d.get)).code).toBe(2);
});
